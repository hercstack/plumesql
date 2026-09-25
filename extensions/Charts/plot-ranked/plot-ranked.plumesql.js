// @ts-check
// @description The top N categories by a folded value, as labelled horizontal bars (Observable Plot, CDN)
// @color cyan
import { P, palettes, loadRows, colIndex, fmtNum, fmtTick, inkOf, paperOf, baseStyle, note } from '$ext/plot-core/plot-core.plumesql.js'

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Ranked',
      inputs: [
        { key: 'category', kind: 'column', label: 'Category (one bar each)' },
        { key: 'value', kind: 'column', label: 'Value', types: ['numeric'], default: '', description: 'Numeric column folded into each cell; without one, a count of rows' },
        { key: 'agg', kind: 'choice', label: 'Per category', options: ['sum', 'mean', 'max', 'min', 'count'], default: 'sum', description: 'How the values of one category combine' },
        { key: 'n', kind: 'number', label: 'Top N', default: '25', description: 'How many categories are kept after ordering' },
        { key: 'order', kind: 'choice', label: 'Order', options: ['largest first', 'smallest first'], default: 'largest first' },
        { key: 'palette', kind: 'choice', label: 'Palette', options: ['Vivid', 'Cool', 'Warm', 'Mono'], default: 'Vivid' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '1000000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const ci = colIndex(cols, inputs.category), vi = colIndex(cols, inputs.value)
        if (ci < 0) { note(root, 'Pick a Category column (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 1000000))
        const dark = ctx.theme !== 'light'
        const agg = vi < 0 ? 'count' : (inputs.agg || 'sum')
        const folded = new Map()
        for (const r of rows) {
          const v = vi < 0 ? 1 : Number(r[vi])
          if (!Number.isFinite(v)) continue
          const c = String(r[ci] == null ? '' : r[ci])
          let b = folded.get(c)
          if (!b) { b = { c, n: 0, sum: 0, min: Infinity, max: -Infinity }; folded.set(c, b) }
          b.n++; b.sum += v; if (v < b.min) b.min = v; if (v > b.max) b.max = v
        }
        const bars = []
        for (const b of folded.values()) bars.push({ c: b.c, v: agg === 'count' ? b.n : agg === 'sum' ? b.sum : agg === 'mean' ? b.sum / b.n : agg === 'max' ? b.max : b.min })
        if (!bars.length) { note(root, 'Nothing to rank.'); return }
        const asc = inputs.order === 'smallest first'
        bars.sort((a, b) => (asc ? a.v - b.v : b.v - a.v))
        const shown = bars.slice(0, Math.max(1, Number(inputs.n) || 25))
        const palette = palettes[inputs.palette] || palettes.Vivid
        const W = root.clientWidth || 640, H = root.clientHeight || 360
        const labelW = Math.min(240, 20 + 7 * shown.reduce((m, b) => Math.max(m, b.c.length), 0))
        const valueW = 16 + 7 * shown.reduce((m, b) => Math.max(m, fmtNum(b.v).length), 0)
        const fig = P.plot({
          width: W, height: Math.max(H - (inputs.title ? 34 : 0), 40 + shown.length * 22), marginLeft: labelW, marginRight: valueW, marginTop: 14, marginBottom: 34,
          title: inputs.title || undefined,
          style: baseStyle(dark),
          x: { grid: true, tickFormat: fmtTick, label: agg === 'count' ? 'rows' : agg + ' of ' + cols[vi].name },
          y: { label: null, domain: shown.map((b) => b.c) },
          marks: [
            P.barX(shown, { x: 'v', y: 'c', fill: palette[0], rx: 2, tip: true }),
            P.text(shown, { x: 'v', y: 'c', text: (d) => fmtNum(d.v), textAnchor: 'start', dx: 6, fill: inkOf(dark), stroke: paperOf(dark), strokeWidth: 3, paintOrder: 'stroke', fontSize: 11 }),
            P.ruleX([0], { stroke: inkOf(dark), strokeOpacity: 0.5 })
          ]
        })
        root.innerHTML = ''
        root.style.overflow = 'auto'
        root.append(fig)
      }
    }
  ]
}
