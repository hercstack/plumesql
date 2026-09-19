// @ts-check
// @description Adds the change of a numeric column against the previous or the first row, as a difference, a percent or both
// @color blue
import { loadRows, topOf, colIndex, num, round, keyOf, ask } from '$ext/stats-core/stats-core.plumesql.js'

// The grid lists 100,000 rows at most.
const CAP = 100000

// A signed change, green up and red down; zero and NULL stay plain.
const signed = (/** @type {number|null} */ d, /** @type {string} */ unit) => {
  if (d == null || d === 0) return d
  const up = d > 0
  return { value: d, html: (up ? '▲ ' : '▼ ') + Math.abs(d) + unit, class: up ? 'fmt-ok' : 'fmt-bad', align: /** @type {'right'} */ ('right') }
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Change',
      inputs: [
        { key: 'column', kind: 'column', label: 'Column', types: ['numeric'], description: 'Numeric column whose change is shown' },
        { key: 'vs', kind: 'choice', label: 'Compared with', options: ['previous row', 'first row'], default: 'previous row', description: 'previous row: the row just above (in the same group); first row: the first value of the result or of the group' },
        { key: 'show', kind: 'choice', label: 'Show', options: ['both', 'difference', 'percent'], default: 'both', description: 'The difference, the change in percent, or both columns' },
        { key: 'group', kind: 'column', label: 'Group', default: '', description: 'Column whose values split the rows into groups, each compared within itself' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const ci = colIndex(cols, inputs.column), gi = colIndex(cols, inputs.group)
        if (ci < 0) return ask('Pick the Column (the sliders button in the header)')
        const all = await loadRows(data, ctx, topOf(inputs))
        if (all.length > CAP) ctx.log((all.length - CAP).toLocaleString() + ' rows beyond the first ' + CAP.toLocaleString() + ' were left out; filter in SQL to choose which.')
        const rows = all.slice(0, CAP)
        const first = inputs.vs === 'first row'
        const show = inputs.show || 'both'
        const diff = show !== 'percent', pct = show !== 'difference'
        // Per group: the value of the row before (NULL included, like LAG),
        // or the group's first non-NULL value.
        /** @type {Map<string, number|null>} */
        const base = new Map()
        const out = rows.map((r) => {
          const v = num(r[ci])
          const k = gi >= 0 ? keyOf(r[gi]) : ''
          if (first && base.get(k) == null && v != null) base.set(k, v)
          const b = base.get(k) ?? null
          if (!first) base.set(k, v)
          const d = v != null && b != null ? v - b : null
          const p = d != null && b !== 0 ? (d / Math.abs(/** @type {number} */ (b))) * 100 : null
          const added = []
          if (diff) added.push(signed(round(d, 4), ''))
          if (pct) added.push(signed(round(p), ' %'))
          return [...r.slice(0, ci + 1), ...added, ...r.slice(ci + 1)]
        })
        const columns = cols.map((c) => ({ name: c.name, type: c.type }))
        const name = cols[ci].name
        columns.splice(ci + 1, 0, ...[...(diff ? [{ name: name + ' Δ', type: 'numeric' }] : []), ...(pct ? [{ name: name + ' Δ %', type: 'numeric' }] : [])])
        return { columns, rows: out }
      }
    }
  ]
}
