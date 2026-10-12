// @ts-check
// @description TimescaleDB in the editor's lightbulb: a hypertable's rows counted by the hour or by the day

// Time series read best by the hour or by the day. This extension
// REFACTORS (docs: GRIDJSSPEC, Refactors): on a SELECT over a hypertable,
// the editor's lightbulb (Ctrl+. or Cmd+.) offers the same rows counted per
// time bucket, as a query written ABOVE the one you have, which stays as it
// was:
//
//   select time_bucket('1 hour', ts) as bucket, count(*)
//   from metrics
//   where device = 7
//   group by bucket
//   order by bucket;
//
// It reads only what the editor hands it: the hypertable's time column comes
// from PlumeSQL's dictionary, so nothing is asked of the server.
//
// Once the query has run, it reads the result's first rows too (ctx.result):
// the gap between their timestamps picks a bucket that fits the data, and
// each numeric column is offered averaged per bucket, with its minimum and
// maximum, as a query above.

// The buckets offered, each one offer.
const BUCKETS = ['1 hour', '1 day']

/**
 * The statement's WHERE condition at its own level, without the clauses
 * that follow it, or '' when it has none.
 * @param {string} body the statement without its trailing ';'
 */
function whereOf(body) {
  const m = /\bwhere\b([\s\S]*?)(?=\b(?:group\s+by|order\s+by|limit|offset|fetch|for\s+update|window)\b|$)/i.exec(body)
  return m ? m[1].trim() : ''
}

/**
 * Count by time bucket: a count(*) per bucket of the hypertable's time
 * column, over the statement's own WHERE, written above it.
 * @param {RefactorStatement} statement
 * @returns {RefactorOffer[]}
 */
function countByTimeBucket(statement) {
  if (statement.keyword !== 'select' || statement.tables.length !== 1) return []
  const t = statement.tables[0]
  const time = t.timescale?.timeColumn
  if (!time) return []
  const body = statement.text.replace(/[\s;]+$/, '')
  // A query that already groups is already a summary.
  if (/\bgroup\s+by\b/i.test(body)) return []
  const q = t.alias ? t.alias + '.' : ''
  const col = q + ident(time)
  const where = whereOf(body)
  return BUCKETS.map((b) => {
    const sql =
      `select time_bucket('${b}', ${col}) as bucket, count(*)\n` +
      `from ${t.ref}${t.alias ? ' ' + t.alias : ''}\n` +
      (where ? `where ${where}\n` : '') +
      `group by bucket\norder by bucket;\n`
    return { title: `Count by time bucket, ${b} (a query above)`, edits: [{ from: 0, to: 0, text: sql }] }
  })
}

// The buckets a sampled series can get, smallest first, each with its
// length in seconds.
/** @type {[string, number][]} */
const FITTING = [
  ['1 minute', 60], ['5 minutes', 300], ['15 minutes', 900], ['1 hour', 3600],
  ['6 hours', 21600], ['1 day', 86400], ['1 week', 604800], ['1 month', 2592000]
]

// The result types that average.
const NUMERIC = /^(smallint|integer|bigint|real|double precision|numeric)\b/

/**
 * The bucket that fits a series: about ten rows per bucket at the median
 * gap between the sampled timestamps, or undefined when they do not tell.
 * @param {(string | null)[]} values the time column's sampled text
 */
function fittingBucket(values) {
  const ms = values
    .map((v) => (v ? Date.parse(v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')) : NaN))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b)
  const gaps = []
  for (let i = 1; i < ms.length; i++) if (ms[i] > ms[i - 1]) gaps.push((ms[i] - ms[i - 1]) / 1000)
  if (gaps.length < 2) return undefined
  gaps.sort((a, b) => a - b)
  const want = gaps[Math.floor(gaps.length / 2)] * 10
  return (FITTING.find(([, sec]) => sec >= want) ?? FITTING[FITTING.length - 1])[0]
}

/**
 * Average by a fitting bucket: once the statement has run, each numeric
 * column of the result (ids left out) averaged per a bucket that suits the
 * sampled timestamps, with its minimum and maximum, as a query above.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function averageByTimeBucket(statement, ctx) {
  const result = ctx.result
  if (statement.keyword !== 'select' || statement.tables.length !== 1 || !result) return []
  const t = statement.tables[0]
  const time = t.timescale?.timeColumn
  if (!time) return []
  const body = statement.text.replace(/[\s;]+$/, '')
  if (/\bgroup\s+by\b/i.test(body)) return []
  const ti = result.columns.findIndex((c) => c.name === time)
  if (ti < 0) return []
  const bucket = fittingBucket(result.rows.map((r) => r[ti]))
  if (!bucket) return []
  const q = t.alias ? t.alias + '.' : ''
  const where = whereOf(body)
  // Only the table's own columns: an expression's alias is not one.
  const own = new Set(t.columns.map((c) => c.name))
  return result.columns
    .filter((c) => c.name !== time && own.has(c.name) && NUMERIC.test(c.type) && !/^id$|_id$/i.test(c.name))
    .slice(0, 3)
    .map((c) => {
      const v = q + ident(c.name)
      const sql =
        `select time_bucket('${bucket}', ${q + ident(time)}) as bucket,\n` +
        `       avg(${v}) as ${ident('avg_' + c.name)},\n` +
        `       min(${v}) as ${ident('min_' + c.name)},\n` +
        `       max(${v}) as ${ident('max_' + c.name)}\n` +
        `from ${t.ref}${t.alias ? ' ' + t.alias : ''}\n` +
        (where ? `where ${where}\n` : '') +
        `group by bucket\norder by bucket;\n`
      return { title: `Average ${c.name} per ${bucket} (above)`, edits: [{ from: 0, to: 0, text: sql }] }
    })
}

/**
 * A name as SQL needs it.
 * @param {string} name
 */
function ident(name) {
  return /^[a-z_][a-z0-9_$]*$/.test(name) ? name : '"' + name.replace(/"/g, '""') + '"'
}

/** @type {PlumeSQLExtension} */
export default {
  refactors: [
    { id: 'count-by-time-bucket', label: 'Count by time bucket', description: "A hypertable's rows counted per hour or per day of its time column.", example: "time_bucket('1 hour', time) as bucket, count(*)", refactor: countByTimeBucket },
    { id: 'average-by-time-bucket', label: 'Average per bucket', description: 'Once the query has run: a number column averaged per time bucket, the bucket picked from the data.', example: "time_bucket('6 hours', time) as bucket, avg(temperature)", refactor: averageByTimeBucket }
  ]
}
