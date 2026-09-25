// @ts-check
// @description Many series in compact folded bands, one row each, for a LOT of rows (Observable Plot, CDN)
// @color cyan
import { P, ramps, loadRows, colIndex, seriesIdxs, xKind, xValue, fmtX, sortByX, thin, extent, fmtNum, fmtTick, inkOf, paperOf, baseStyle, note } from '$ext/plot-core/plot-core.plumesql.js'

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Horizon',
      inputs: [
        { key: 'x', kind: 'column', label: 'X (a column, or the row order)', description: 'Horizontal axis: a timestamp draws a time axis, a number a numeric one, anything else categories' },
        { key: 'series', kind: 'multi-column', label: 'Series (one row each)', types: ['numeric'], description: 'One horizon row per column; edit the comma list to add or remove one' },
        { key: 'bands', kind: 'number', label: 'Bands', default: '3', description: 'How many colour bands the values are folded into, 1 to 5' },
        { key: 'scheme', kind: 'choice', label: 'Colours', options: ['blues', 'greens', 'oranges', 'purples', 'reds'], default: 'blues' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '1000000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const idxs = seriesIdxs(cols, inputs.series)
        if (idxs.length === 0) { note(root, 'Pick one or more series columns (the sliders button in the header).'); return }
        const xi = colIndex(cols, inputs.x)
        const kind = xKind(xi < 0 ? null : cols[xi])
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 1000000))
        const dark = ctx.theme !== 'light'
        const W = root.clientWidth || 640, H = root.clientHeight || 360
        const names = idxs.map((vi) => cols[vi].name)
        const long = []
        idxs.forEach((vi, k) => {
          const pts = []
          rows.forEach((r, i) => { const x = xValue(kind, r, i, xi); const y = Number(r[vi]); if (x != null && Number.isFinite(y)) pts.push({ x, y, s: names[k] }) })
          for (const p of thin(kind === 'ordinal' ? pts : sortByX(pts), W * 2, 'y')) long.push(p)
        })
        if (!long.length) { note(root, 'No numeric values to plot.'); return }
        const bands = Math.max(1, Math.min(5, Number(inputs.bands) || 3))
        const ramp = ramps[inputs.scheme] || ramps.blues
        const [, ymax] = extent(long, 'y')
        const step = Number((Math.max(ymax, 1e-9) / bands).toPrecision(2))
        const rowH = Math.max(28, Math.min(72, Math.floor((H - 40) / names.length)))
        const labelW = Math.min(200, 20 + 7 * names.reduce((m, n) => Math.max(m, n.length), 0))
        const marks = []
        for (let b = 0; b < bands; b++) {
          marks.push(P.areaY(long, { x: 'x', y1: 0, y2: (d) => d.y - b * step, fy: 's', fill: ramp[Math.min(ramp.length - 1, b + (ramp.length - bands))], clip: true }))
        }
        marks.push(P.ruleX(long, P.pointerX({ x: 'x', stroke: inkOf(dark), strokeOpacity: 0.5 })))
        marks.push(P.text(long, P.pointerX({ x: 'x', fy: 's', frameAnchor: 'top-right', dx: -4, dy: 3, text: (d) => fmtNum(d.y), fill: inkOf(dark), stroke: paperOf(dark), strokeWidth: 3, paintOrder: 'stroke', fontWeight: 700, fontSize: 11 })))
        marks.push(P.text(long, P.pointerX({ x: 'x', frameAnchor: 'top', dy: -12, text: (d) => fmtX(kind)(d.x), fill: inkOf(dark), stroke: paperOf(dark), strokeWidth: 3, paintOrder: 'stroke', fontWeight: 700, fontSize: 11 })))
        const fig = P.plot({
          width: W, height: 30 + names.length * rowH, marginLeft: labelW, marginRight: 12, marginTop: 20, marginBottom: 24,
          style: baseStyle(dark),
          x: { grid: true, label: null, tickFormat: kind === 'numeric' ? fmtTick : undefined },
          y: { domain: [0, step], axis: null },
          fy: { label: null, domain: names, padding: 0.12 },
          marks
        })
        root.innerHTML = ''
        root.style.overflow = 'auto'
        root.append(fig)
      }
    },
  ]
}
