// @ts-check
// @description Adds a Total row under the result, and optional subtotal rows after each group of a column, like a spreadsheet's Subtotal
// @color teal
import { loadRows, topOf, colIndex, colIndexes, isNumericCol, num, round, keyOf, median, ask } from '$ext/stats-core/stats-core.plumesql.js'

// The grid lists 100,000 rows at most, the subtotal rows included.
const CAP = 100000

// COUNT counts numbers, as a spreadsheet's does; every other fold reads the
// numbers alone too.
const aggregate = (/** @type {string} */ agg, /** @type {number[]} */ xs) => {
  if (agg === 'count') return xs.length
  if (!xs.length) return null
  switch (agg) {
    case 'mean': { let s = 0; for (const x of xs) s += x; return s / xs.length }
    case 'min': { let m = Infinity; for (const x of xs) if (x < m) m = x; return m }
    case 'max': { let m = -Infinity; for (const x of xs) if (x > m) m = x; return m }
    case 'median': return median(xs)
    default: { let s = 0; for (const x of xs) s += x; return s }
  }
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Totals',
      inputs: [
        { key: 'columns', kind: 'multi-column', label: 'Columns', types: ['numeric'], default: '', description: 'Numeric columns to total; blank totals every numeric column' },
        { key: 'agg', kind: 'choice', label: 'Fold', options: ['sum', 'mean', 'min', 'max', 'count', 'median'], default: 'sum', description: 'How the values of a total combine' },
        { key: 'by', kind: 'column', label: 'Subtotal by', default: '', description: 'Column whose values group the rows, with a subtotal row after each group' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const picked = colIndexes(cols, inputs.columns)
        const aggCols = picked.length ? picked : cols.map((c, i) => (isNumericCol(c) ? i : -1)).filter((i) => i >= 0)
        if (!aggCols.length) return ask('Pick the Columns to total (the sliders button in the header)')
        const bi = colIndex(cols, inputs.by)
        const agg = inputs.agg || 'sum'
        const rows = await loadRows(data, ctx, topOf(inputs))
        const aggSet = new Set(aggCols)
        // The label goes in the first column not totalled, a text one when
        // there is one, so it reads where a person would look for it.
        const free = cols.map((c, i) => i).filter((i) => !aggSet.has(i))
        const li = free.find((i) => !isNumericCol(cols[i])) ?? free[0] ?? -1
        const strong = (/** @type {unknown} */ v) => ({ value: v, class: 'fmt-strong' })
        const totalRow = (/** @type {unknown[][]} */ group, /** @type {string} */ label) => cols.map((c, i) => {
          if (aggSet.has(i)) {
            const xs = []
            for (const r of group) { const n = num(r[i]); if (n != null) xs.push(n) }
            return strong(round(aggregate(agg, xs), 4))
          }
          return i === li ? strong(label) : null
        })
        /** @type {unknown[][]} */
        let body
        if (bi >= 0) {
          // Stable: groups in the order their first row appears, rows kept in
          // their order within each.
          /** @type {Map<string, unknown[][]>} */
          const groups = new Map()
          for (const r of rows) {
            const k = keyOf(r[bi])
            const g = groups.get(k)
            if (g) g.push(r); else groups.set(k, [r])
          }
          body = []
          for (const [k, g] of groups) {
            for (const r of g) body.push(r)
            body.push(totalRow(g, k + ' subtotal'))
          }
        } else body = rows.slice()
        if (body.length > CAP) {
          ctx.log((body.length - CAP).toLocaleString() + ' rows beyond the first ' + CAP.toLocaleString() + ' were counted in the totals but not listed.')
          body = body.slice(0, CAP)
        }
        body.push(totalRow(rows, 'Total'))
        return { columns: cols.map((c) => ({ name: c.name, type: c.type })), rows: body, frozenRows: { bottom: [body.length - 1] } }
      }
    }
  ]
}
