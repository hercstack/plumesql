// @ts-check
// @description A json or jsonb column's keys as columns right beside it in the result grid (hand written)
// @color orange
// A value as the server sent it: the text of a json column, or a value
// already parsed. Text that does not parse stays text.
const parse = (/** @type {unknown} */ v) => {
  if (typeof v !== 'string') return v
  try { return JSON.parse(v) } catch { return v }
}

const isObject = (/** @type {unknown} */ v) => v != null && typeof v === 'object' && !Array.isArray(v)

// A JSON null is not a missing key: the grid shows a missing key as its
// NULL and a JSON null as the word null, dimmed, so a filter can tell them.
const JSON_NULL = { value: 'null', style: 'opacity:.55;font-style:italic', title: 'JSON null' }

const cell = (/** @type {unknown} */ v) => {
  if (v === undefined) return null
  if (v === null) return JSON_NULL
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}

// The keys of the objects among the values, in the order they are first
// seen: what a spread answers for one json column.
const keysOf = (/** @type {unknown[]} */ values) => {
  /** @type {string[]} */
  const keys = []
  const seen = new Set()
  for (const v of values) {
    const o = parse(v)
    if (!isObject(o)) continue
    for (const k of Object.keys(/** @type {object} */ (o))) if (!seen.has(k)) { seen.add(k); keys.push(k) }
  }
  return keys
}

/** @type {PlumeSQLExtension} */
export default {
  // Every json or jsonb column of a result the extension is attached to
  // gets its keys as columns right after it, read from the first 500 rows.
  // JSON to rows is the table of its own, with a path and arrays as rows.
  rules: [
    {
      match: { type: /^jsonb?$/i },
      add: '{col}.{key}',
      spread: (values) => keysOf(values),
      fn: (value, row, prevRow, ctx) => {
        const o = parse(value)
        if (!isObject(o)) return null
        const v = /** @type {Record<string, unknown>} */ (o)[String(ctx.key)]
        const c = cell(v)
        return typeof v === 'number' ? { value: v, align: 'right' } : c
      }
    }
  ]
}
