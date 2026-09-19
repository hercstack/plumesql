// @ts-check
// @description Adds a column with the moving average of a numeric column over a window of rows, trailing or centered
// @color blue
import { loadRows, topOf, colIndex, num, round, ask } from '$ext/stats-core/stats-core.plumesql.js'

// The grid lists 100,000 rows at most.
const CAP = 100000

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Moving average',
      inputs: [
        { key: 'column', kind: 'column', label: 'Column', types: ['numeric'], description: 'Numeric column to average' },
        { key: 'window', kind: 'number', label: 'Window', default: '7', description: 'How many rows each average covers' },
        { key: 'kind', kind: 'choice', label: 'Kind', options: ['trailing', 'centered'], default: 'trailing', description: 'trailing: this row and the ones before it; centered: rows on both sides' },
        { key: 'min', kind: 'number', label: 'Min periods', default: '1', description: 'How many values a window needs before it shows an average' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const ci = colIndex(cols, inputs.column)
        if (ci < 0) return ask('Pick the Column (the sliders button in the header)')
        const w = Math.max(1, Math.floor(Number(inputs.window) || 7))
        const min = Math.max(1, Math.min(w, Math.floor(Number(inputs.min) || 1)))
        const all = await loadRows(data, ctx, topOf(inputs))
        if (all.length > CAP) ctx.log((all.length - CAP).toLocaleString() + ' rows beyond the first ' + CAP.toLocaleString() + ' were left out; filter in SQL to choose which.')
        const rows = all.slice(0, CAP)
        const n = rows.length
        // Prefix sums of the values and of how many there are, so every
        // window costs the same whatever its width; a NULL counts for nothing.
        const sums = new Float64Array(n + 1), counts = new Int32Array(n + 1)
        for (let i = 0; i < n; i++) {
          const v = num(rows[i][ci])
          sums[i + 1] = sums[i] + (v ?? 0)
          counts[i + 1] = counts[i] + (v == null ? 0 : 1)
        }
        // Centered: an even window leans one row back, as pandas does.
        const back = inputs.kind === 'centered' ? Math.floor(w / 2) : w - 1
        const out = rows.map((r, i) => {
          const lo = Math.max(0, i - back), hi = Math.min(n - 1, i - back + w - 1)
          const c = counts[hi + 1] - counts[lo]
          const avg = c >= min ? round((sums[hi + 1] - sums[lo]) / c, 2) : null
          return [...r.slice(0, ci + 1), avg, ...r.slice(ci + 1)]
        })
        const columns = cols.map((c) => ({ name: c.name, type: c.type }))
        columns.splice(ci + 1, 0, { name: cols[ci].name + ' avg ' + w, type: 'numeric' })
        return { columns, rows: out }
      }
    }
  ]
}
