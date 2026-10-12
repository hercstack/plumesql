// @ts-check
// @description pgvector in the editor's lightbulb: the nearest neighbour query, in the three distances pgvector indexes

// This extension REFACTORS (docs: GRIDJSSPEC, Refactors): on a SELECT over a
// table with a vector column, the editor's lightbulb (Ctrl+. or Cmd+.) offers
// the nearest neighbour query everybody writes by hand, an ORDER BY the
// distance to a $query vector and a LIMIT. It reads only what the editor
// hands it (the statement and its tables' columns from PlumeSQL's
// dictionary), so nothing is asked of the server. Reading vector VALUES in
// a result is the pgvector extension's.
//
// Once the query has run, it reads the result's first rows too (ctx.result):
// Order by nearest to the first row's embedding writes that row's vector into
// the query, the rows most like it, no $query to fill in.
//
// And a nearest neighbour query over a column no HNSW or IVFFlat index
// serves for its distance reads the whole table: Add an HNSW index writes
// the index that does, with the operator class of the query's own distance
// (the table's indexes come from the dictionary, ctx-free).

// The three distances pgvector orders by, each with the operator its
// indexes serve.
const DISTANCES = [
  { op: '<->', name: 'L2 distance', ops: 'l2' },
  { op: '<=>', name: 'cosine distance', ops: 'cosine' },
  { op: '<#>', name: 'inner product', ops: 'ip' }
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
 * Order by nearest to the first row: once the statement has run, the
 * vector a column holds in its first row becomes the query vector, cosine
 * distance (pgvector's commonest), the row itself first.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function nearestToFirstRow(statement, ctx) {
  const result = ctx.result
  if (statement.keyword !== 'select' || !result || !result.rows.length) return []
  const body = statement.text.replace(/[\s;]+$/, '')
  if (/\border\s+by\b|\blimit\b|\bfetch\s+first\b/i.test(body)) return []
  const qualify = statement.tables.length > 1
  /** @type {RefactorOffer[]} */
  const offers = []
  for (const t of statement.tables) {
    for (const c of t.columns) {
      const kind = /(?:^|\.)(vector|halfvec)\b/i.exec(c.type)?.[1]?.toLowerCase()
      if (!kind) continue
      const i = result.columns.findIndex((x) => x.name === c.name)
      const value = i >= 0 ? result.rows[0][i] : null
      // A value cut short (a long vector past the sample's limit) is not
      // a vector any more: nothing to offer.
      if (!value || !/^\[[^\]]*\]$/.test(value)) continue
      const col = (qualify ? (t.alias ?? t.name) + '.' : '') + quoted(c.name)
      offers.push({
        title: `Order by nearest to the first row's ${c.name}`,
        edits: [{ from: body.length, to: body.length, text: `\norder by ${col} <=> '${value}'::${kind}\nlimit 10` }]
      })
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

/**
 * Add an HNSW index: a SELECT ordered by a vector column's distance
 * (`order by embedding <=> ...`) where no HNSW or IVFFlat index of the
 * table serves that column with that distance's operator class. Quiet
 * when the dictionary does not know the table's indexes.
 * @param {RefactorStatement} statement
 * @returns {RefactorOffer[]}
 */
function hnswIndex(statement) {
  if (statement.keyword !== 'select') return []
  const m = /\border\s+by\s+(?:("[^"]+"|[A-Za-z_][\w$]*)\s*\.\s*)?("[^"]+"|[A-Za-z_][\w$]*)\s*(<->|<=>|<#>)/i.exec(statement.text)
  if (!m) return []
  const unq = (/** @type {string} */ s) => (s.startsWith('"') ? s.slice(1, -1).replace(/""/g, '"') : s.toLowerCase())
  const qual = m[1] ? unq(m[1]) : null
  const col = unq(m[2])
  const owners = statement.tables.filter((t) => (qual ? (t.alias ?? t.name) === qual || t.name === qual : t.columns.some((c) => c.name === col)))
  if (owners.length !== 1) return []
  const t = owners[0]
  const c = t.columns.find((x) => x.name === col)
  const kind = c && /(?:^|\.)(vector|halfvec|sparsevec)\b/i.exec(c.type)?.[1]?.toLowerCase()
  if (!kind || !t.indexes) return []
  const d = DISTANCES.find((x) => x.op === m[3])
  if (!d) return []
  const opclass = `${kind}_${d.ops}_ops`
  const served = t.indexes.some((i) => (i.method === 'hnsw' || i.method === 'ivfflat') && i.keys[0] === col && i.ops[0] === opclass)
  if (served) return []
  return [
    {
      title: `Add an HNSW index on ${col} (${d.ops === 'ip' ? 'inner product' : d.ops === 'l2' ? 'L2' : 'cosine'}) above`,
      edits: [{ from: 0, to: 0, text: `create index on ${t.ref} using hnsw (${quoted(col)} ${opclass});\n` }]
    }
  ]
}

/** @type {PlumeSQLExtension} */
export default {
  refactors: [
    { id: 'order-by-nearest', label: 'Order by nearest', description: 'A vector column ordered by its distance to a vector you give when the query runs.', example: 'order by embedding <=> $query::vector', refactor: orderByNearest },
    { id: 'nearest-to-first-row', label: "Order by nearest to the first row", description: "Once the query has run: the rows most like the first row's vector, by cosine distance.", example: "order by embedding <=> '[0.1, 0.2, ...]'::vector", refactor: nearestToFirstRow },
    { id: 'hnsw-index', label: 'Add an HNSW index', description: "The index a nearest neighbour query's distance needs, when the table has none.", example: 'create index on items using hnsw (embedding vector_cosine_ops);', refactor: hnswIndex }
  ]
}
