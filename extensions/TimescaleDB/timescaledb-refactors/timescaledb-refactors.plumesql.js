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
  const col = q + (/^[a-z_][a-z0-9_$]*$/.test(time) ? time : '"' + time.replace(/"/g, '""') + '"')
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

/** @type {PlumeSQLExtension} */
export default {
  refactors: [{ id: 'count-by-time-bucket', refactor: countByTimeBucket }]
}
