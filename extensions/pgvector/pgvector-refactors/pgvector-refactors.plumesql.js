// @ts-check
// @description pgvector in the editor's lightbulb: the nearest neighbour query, in the three distances pgvector indexes

// This extension REFACTORS (docs: GRIDJSSPEC, Refactors): on a SELECT over a
// table with a vector column, the editor's lightbulb (Ctrl+. or Cmd+.) offers
// the nearest neighbour query everybody writes by hand, an ORDER BY the
// distance to a $query vector and a LIMIT. It reads only what the editor
// hands it (the statement and its tables' columns from PlumeSQL's
// dictionary), so nothing is asked of the server. Reading vector VALUES in
// a result is the pgvector extension's.

// The three distances pgvector orders by, each with the operator its
// indexes serve.
const DISTANCES = [
  { op: '<->', name: 'L2 distance' },
  { op: '<=>', name: 'cosine distance' },
  { op: '<#>', name: 'inner product' }
]

/**
 * Order by nearest: an ORDER BY the distance to a $query vector and a
 * LIMIT, appended to a SELECT that has neither. One offer per vector
 * column and distance; the $query parameter is asked when the query runs.
 * @param {RefactorStatement} statement
 * @returns {RefactorOffer[]}
 */
function orderByNearest(statement) {
  if (statement.keyword !== 'select') return []
  const body = statement.text.replace(/[\s;]+$/, '')
  if (/\border\s+by\b|\blimit\b|\bfetch\s+first\b/i.test(body)) return []
  const qualify = statement.tables.length > 1
  /** @type {RefactorOffer[]} */
  const offers = []
  for (const t of statement.tables) {
    for (const c of t.columns) {
      const kind = /(?:^|\.)(vector|halfvec|sparsevec)\b/i.exec(c.type)?.[1]?.toLowerCase()
      if (!kind) continue
      const col = (qualify ? (t.alias ?? t.name) + '.' : '') + quoted(c.name)
      for (const d of DISTANCES) {
        offers.push({
          title: `Order by nearest ${c.name} to $query (${d.name}, ${d.op})`,
          edits: [{ from: body.length, to: body.length, text: `\norder by ${col} ${d.op} $query::${kind}\nlimit 10` }]
        })
      }
    }
  }
  return offers
}

/**
 * A name as SQL needs it: bare when it is a plain lower case word.
 * @param {string} name
 */
function quoted(name) {
  return /^[a-z_][a-z0-9_$]*$/.test(name) ? name : '"' + name.replace(/"/g, '""') + '"'
}

/** @type {PlumeSQLExtension} */
export default {
  refactors: [{ id: 'order-by-nearest', refactor: orderByNearest }]
}
