// @ts-check
// @description Counts a numeric column in evenly wide bins, with percentages, a running share and a bar per bin, in the grid
// @color violet
import { loadRows, topOf, colIndex, ask, num, round, keyOf, binEdges, binOf, edgeText, tint } from '$ext/stats-core/stats-core.plumesql.js'

const MAX_GROUPS = 12
const OWN = new Set(['bin', 'from', 'to', 'count', 'percent', 'cumulative %', 'bar'])

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Histogram',
      inputs: [
        { key: 'column', kind: 'column', label: 'Column', types: ['numeric'], description: 'The numeric column counted into bins' },
        { key: 'bins', kind: 'number', label: 'Bins', default: '', description: 'How many bins, roughly (the width is rounded to read well); blank picks a count from the number of values' },
        { key: 'width', kind: 'number', label: 'Bin width', default: '', description: 'An exact bin width; when set it wins over Bins' },
        { key: 'group', kind: 'column', label: 'Split by', default: '', description: 'Column whose values each get a count column of their own (the 12 most common); blank for one count' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const vi = colIndex(cols, inputs.column), gi = colIndex(cols, inputs.group)
        if (vi < 0) return ask('Pick the Column to count (the sliders button in the header)')
        const rows = await loadRows(data, ctx, topOf(inputs))
        /** @type {number[]} */
        const xs = []
        /** @type {string[]} */
        const gs = []
        let skipped = 0
        for (const r of rows) {
          const x = num(r[vi])
          if (x == null) { skipped++; continue }
          xs.push(x)
          if (gi >= 0) gs.push(keyOf(r[gi]))
        }
        if (!xs.length) return ask('No numbers in ' + cols[vi].name + ' to count')
        const edges = binEdges(xs, num(inputs.bins), num(inputs.width))
        let hi = -Infinity
        for (const x of xs) if (x > hi) hi = x
        // binEdges stops at 1000 bins; a width that small would pile the rest into the last bin.
        if (edges[edges.length - 1] <= hi) return ask('The bin width is too small for the range (over 1000 bins); widen it')
        const nb = edges.length - 1
        // The most common group values get columns; the rest share one, so every value is still counted.
        /** @type {string[]} */
        let keys = []
        if (gi >= 0) {
          /** @type {Map<string, number>} */
          const freq = new Map()
          for (const g of gs) freq.set(g, (freq.get(g) || 0) + 1)
          keys = Array.from(freq.keys()).sort((a, b) => /** @type {number} */ (freq.get(b)) - /** @type {number} */ (freq.get(a)))
          if (keys.length > MAX_GROUPS) {
            ctx.log((keys.length - MAX_GROUPS).toLocaleString() + ' less common values of ' + cols[gi].name + ' are counted together under "other".')
            keys = keys.slice(0, MAX_GROUPS).concat(['other'])
          }
        }
        const slot = new Map(keys.map((k, i) => [k, i]))
        const counts = new Array(nb).fill(0)
        const split = keys.map(() => new Array(nb).fill(0))
        for (let i = 0; i < xs.length; i++) {
          const b = binOf(edges, xs[i])
          counts[b]++
          if (gi >= 0) { const s = slot.get(gs[i]); split[s == null ? keys.length - 1 : s][b]++ }
        }
        const n = xs.length
        let peak = 0
        for (const c of counts) if (c > peak) peak = c
        let running = 0
        /** @type {unknown[][]} */
        const out = []
        for (let b = 0; b < nb; b++) {
          running += counts[b]
          const pct = round((counts[b] / n) * 100, 2)
          out.push([
            edgeText(edges[b]) + ' to ' + edgeText(edges[b + 1]),
            Number(edgeText(edges[b])), Number(edgeText(edges[b + 1])),
            ...split.map((s) => s[b]),
            counts[b], pct, round((running / n) * 100, 2),
            // The bar's value is text, so a chart after a pipe does not take it for a series.
            { value: pct + '%', html: '<div style="height:10px;border-radius:2px;width:' + round((counts[b] / (peak || 1)) * 100, 1) + '%;background:' + tint('accent', 70) + '"></div>' }
          ])
        }
        out.push(['Total', null, null, ...split.map((s) => s.reduce((a, c) => a + c, 0)), n, 100, null, ''])
        if (skipped) ctx.log(skipped.toLocaleString() + ' rows had no number in ' + cols[vi].name + ' and were not counted.')
        const columns = [
          { name: 'bin', type: 'text' }, { name: 'from', type: 'numeric' }, { name: 'to', type: 'numeric' },
          // A group value named like one of the fixed columns would make two columns of one name.
          ...keys.map((k) => ({ name: OWN.has(k) ? k + ' (' + cols[gi].name + ')' : k, type: 'numeric' })),
          { name: 'count', type: 'numeric' }, { name: 'percent', type: 'numeric' }, { name: 'cumulative %', type: 'numeric' }, { name: 'bar', type: 'text' }
        ]
        return { columns, rows: out, frozenRows: { bottom: [out.length - 1] }, frozenColumns: { start: ['bin'] } }
      }
    }
  ]
}
