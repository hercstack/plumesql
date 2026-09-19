// @ts-check
// @description Adds a column with each row's share of the total, of its group, or as a running percent, with a small bar
// @color blue
import { loadRows, topOf, colIndex, num, round, keyOf, tint, ask } from '$ext/stats-core/stats-core.plumesql.js'

// The grid lists 100,000 rows at most; a descriptor per row beyond that
// would only cross the sandbox bridge to be dropped.
const CAP = 100000

// A percent with a short bar before it, in the theme's accent.
const bar = (/** @type {number} */ pct) => {
  const width = Math.max(0, Math.min(100, Math.abs(pct)))
  const track = 'display:inline-block;width:44px;height:6px;border-radius:3px;vertical-align:middle;margin-right:6px;background:' + tint('accent', 18)
  const fill = 'display:block;height:100%;border-radius:3px;width:' + width.toFixed(1) + '%;background:' + tint('accent', 85)
  return { value: pct, html: '<span style="' + track + '"><span style="' + fill + '"></span></span>' + pct.toFixed(2) + ' %', align: /** @type {'right'} */ ('right') }
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: '% of total',
      inputs: [
        { key: 'column', kind: 'column', label: 'Column', types: ['numeric'], description: 'Numeric column whose share is shown' },
        { key: 'of', kind: 'choice', label: 'Share of', options: ['total', 'group', 'running'], default: 'total', description: 'total: of the whole column; group: of the row\'s group; running: the running sum as a share of the total' },
        { key: 'group', kind: 'column', label: 'Group', default: '', description: 'Column whose values split the rows into groups; each group adds up to 100' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const ci = colIndex(cols, inputs.column), gi = colIndex(cols, inputs.group)
        if (ci < 0) return ask('Pick the Column (the sliders button in the header)')
        const of = inputs.of || 'total'
        if (of === 'group' && gi < 0) return ask('Pick the Group column, or share of total (the sliders button in the header)')
        const rows = await loadRows(data, ctx, topOf(inputs))
        // With a group, "running" restarts in each group and runs to its own
        // total, the way a spreadsheet's % Running Total In reads per field.
        const byGroup = gi >= 0 && of !== 'total'
        /** @type {Map<string, number>} */
        const totals = new Map()
        for (const r of rows) {
          const n = num(r[ci])
          if (n == null) continue
          const k = byGroup ? keyOf(r[gi]) : ''
          totals.set(k, (totals.get(k) || 0) + n)
        }
        /** @type {Map<string, number>} */
        const running = new Map()
        const out = []
        for (const r of rows.slice(0, CAP)) {
          const n = num(r[ci])
          const k = byGroup ? keyOf(r[gi]) : ''
          const total = totals.get(k) || 0
          let share = null
          if (n != null && total !== 0) {
            if (of === 'running') { const s = (running.get(k) || 0) + n; running.set(k, s); share = (s / total) * 100 } else share = (n / total) * 100
          }
          const cell = share == null ? null : bar(/** @type {number} */ (round(share)))
          out.push([...r.slice(0, ci + 1), cell, ...r.slice(ci + 1)])
        }
        if (rows.length > CAP) ctx.log((rows.length - CAP).toLocaleString() + ' rows beyond the first ' + CAP.toLocaleString() + ' were counted in the totals but not listed.')
        const name = cols[ci].name + (of === 'group' ? ' % of group' : of === 'running' ? ' running %' : ' % of total')
        const columns = cols.map((c) => ({ name: c.name, type: c.type }))
        columns.splice(ci + 1, 0, { name, type: 'numeric' })
        return { columns, rows: out }
      }
    }
  ]
}
