// @ts-check
// @description A json or jsonb column as a table of its own: a column per key, a path to follow, an array opened into a row per element (hand written)
// @color orange
const MAX_KEYS = 100

// A value as the server sent it: the text of a json column, or a value
// already parsed. Text that does not parse stays text.
const parse = (/** @type {unknown} */ v) => {
  if (typeof v !== 'string') return v
  try { return JSON.parse(v) } catch { return v }
}

// Follows a dot path (address, meta.tags) into a value; a step that is not
// an object leaves nothing there.
const at = (/** @type {unknown} */ v, /** @type {string[]} */ steps) => {
  let cur = v
  for (const s of steps) {
    if (cur == null || typeof cur !== 'object' || Array.isArray(cur)) return undefined
    cur = /** @type {Record<string, unknown>} */ (cur)[s]
  }
  return cur
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

/** @type {PlumeSQLExtension} */
export default {
  // The table lands in PlumeSQL's own grid: copy, filter, sort, column
  // menus and save work on it as on any result. JSON to columns is the
  // quick look, the keys beside the column in the result itself.
  views: [
    {
      tab: 'JSON rows',
      when: (columns) => columns.some((c) => /^jsonb?$/i.test(String(c.type))),
      inputs: [
        { key: 'column', kind: 'column', label: 'JSON column', types: ['json'], description: 'The json or jsonb column whose keys become columns' },
        { key: 'path', kind: 'text', label: 'Path', default: '', description: 'A dot path to spread instead of the top level, like address or meta.tags; blank spreads the top level' },
        { key: 'keep', kind: 'choice', label: 'Other columns', options: ['keep', 'drop'], default: 'keep', description: 'keep shows the result\'s other columns before the spread keys; drop shows the keys alone' },
        { key: 'explode', kind: 'choice', label: 'Arrays', options: ['one row per element', 'as text'], default: 'one row per element', description: 'An array at the path gives a row per element, or stays one cell of JSON text' }
      ],
      // The table lands in PlumeSQL's own grid: its copy, filter, sort,
      // column menus and export work on the spread keys as on any result.
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const ji = cols.findIndex((c) => c.name === inputs.column)
        if (ji < 0) return { columns: [{ name: 'Pick the JSON column (the sliders button in the header)', type: 'text' }], rows: [] }
        // The whole result, page by page past the window the view was given.
        let rows = data.rows || []
        const total = typeof ctx.rowCount === 'number' ? ctx.rowCount : rows.length
        if (total > rows.length && typeof ctx.rows === 'function') {
          try {
            const out = rows.slice()
            while (out.length < total) { const page = await ctx.rows(out.length, Math.min(200000, total - out.length)); if (!page || page.length === 0) break; for (const r of page) out.push(r) }
            rows = out
          } catch (e) { ctx.log('ctx.rows: ' + e) }
        }
        const steps = String(inputs.path || '').split('.').map((s) => s.trim()).filter(Boolean)
        const explode = inputs.explode !== 'as text'
        const keep = inputs.keep !== 'drop'

        // Pass 1: the records, one per row or per array element, each with
        // the result row it came from.
        /** @type {{ row: unknown[], rec: unknown }[]} */
        const recs = []
        for (const r of rows) {
          const v = steps.length ? at(parse(r[ji]), steps) : parse(r[ji])
          if (Array.isArray(v) && explode) {
            if (v.length === 0) recs.push({ row: r, rec: undefined })
            for (const el of v) recs.push({ row: r, rec: el })
          } else recs.push({ row: r, rec: v })
        }

        // The keys in the order they are first seen; a record that is not
        // an object (a number, a string, an array kept as text) is one
        // `value` column.
        /** @type {string[]} */
        const keys = []
        const seen = new Set()
        let scalar = false
        let dropped = 0
        for (const { rec } of recs) {
          if (isObject(rec)) {
            for (const k of Object.keys(/** @type {object} */ (rec))) {
              if (seen.has(k)) continue
              if (keys.length >= MAX_KEYS) { dropped++; continue }
              seen.add(k)
              keys.push(k)
            }
          } else if (rec !== undefined && rec !== null) scalar = true
        }
        if (dropped) ctx.log('JSON to rows: keys after the first ' + MAX_KEYS + ' were left out.')

        // A key's type for the grid's alignment: numeric when every value
        // it holds is a number, boolean when every one is a boolean.
        const typeOf = (/** @type {string} */ k) => {
          let num = 0, bool = 0, other = 0
          for (const { rec } of recs) {
            if (!isObject(rec)) continue
            const v = /** @type {Record<string, unknown>} */ (rec)[k]
            if (v == null) continue
            if (typeof v === 'number') num++
            else if (typeof v === 'boolean') bool++
            else other++
          }
          return other ? 'text' : num && !bool ? 'numeric' : bool && !num ? 'boolean' : 'text'
        }

        const keptIdx = keep ? cols.map((_, i) => i).filter((i) => i !== ji) : []
        const taken = new Set(keptIdx.map((i) => cols[i].name))
        // A key named like a kept column reads as key (2), so both show.
        const label = (/** @type {string} */ k) => { let n = k, i = 2; while (taken.has(n)) n = k + ' (' + i++ + ')'; taken.add(n); return n }
        const columns = [
          ...keptIdx.map((i) => ({ name: cols[i].name, type: cols[i].type })),
          ...keys.map((k) => ({ name: label(k), type: typeOf(k) })),
          ...(scalar ? [{ name: label('value'), type: 'text' }] : [])
        ]
        const out = recs.map(({ row, rec }) => {
          const obj = isObject(rec) ? /** @type {Record<string, unknown>} */ (rec) : null
          return [
            ...keptIdx.map((i) => row[i]),
            ...keys.map((k) => (obj ? cell(obj[k]) : null)),
            ...(scalar ? [obj ? null : cell(rec)] : [])
          ]
        })
        if (!keys.length && !scalar) return { columns: [{ name: 'No JSON object at ' + (steps.length ? steps.join('.') : 'the top level') + ' in the rows read', type: 'text' }], rows: [] }
        return { columns, rows: out, ...(keep && keptIdx.length ? { frozenColumns: { start: [cols[keptIdx[0]].name] } } : {}) }
      }
    }
  ]
}
