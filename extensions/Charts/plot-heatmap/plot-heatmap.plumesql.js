// @ts-check
// @description A grid of two categories coloured by a folded value (Observable Plot, CDN)
// @color cyan
import { P, loadRows, colIndex, fmtTick, fmtNum, inkOf, paperOf, baseStyle, note } from '$ext/plot-core/plot-core.plumesql.js'

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Heatmap',
      inputs: [
        { key: 'x', kind: 'column', label: 'X (columns of the grid)' },
        { key: 'y', kind: 'column', label: 'Y (rows of the grid)' },
        { key: 'value', kind: 'column', label: 'Value', types: ['numeric'], default: '', description: 'Numeric column folded into each cell; without one, a count of rows' },
        { key: 'agg', kind: 'choice', label: 'Per cell', options: ['mean', 'sum', 'max', 'min', 'count'], default: 'mean', description: 'How the values of one cell combine' },
        { key: 'scheme', kind: 'choice', label: 'Colours', options: ['ylgnbu', 'blues', 'greens', 'oranges', 'turbo', 'viridis', 'rdylbu'], default: 'ylgnbu' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '1000000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const xi = colIndex(cols, inputs.x), yi = colIndex(cols, inputs.y), vi = colIndex(cols, inputs.value)
        if (xi < 0 || yi < 0) { note(root, 'Pick the X and Y columns of the grid (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 1000000))
        const dark = ctx.theme !== 'light'
        const agg = vi < 0 ? 'count' : (inputs.agg || 'mean')
        const xs = [], ys = [], xseen = new Set(), yseen = new Set()
        const grid = new Map()
        for (const r of rows) {
          const v = vi < 0 ? 1 : Number(r[vi])
          if (!Number.isFinite(v)) continue
          const x = String(r[xi] == null ? '' : r[xi]), y = String(r[yi] == null ? '' : r[yi])
          if (!xseen.has(x)) { if (xseen.size >= 200) continue; xseen.add(x); xs.push(x) }
          if (!yseen.has(y)) { if (yseen.size >= 200) continue; yseen.add(y); ys.push(y) }
          const key = x + '\u0000' + y
          let b = grid.get(key)
          if (!b) { b = { x, y, n: 0, sum: 0, min: Infinity, max: -Infinity }; grid.set(key, b) }
          b.n++; b.sum += v; if (v < b.min) b.min = v; if (v > b.max) b.max = v
        }
        const cells = []
        for (const b of grid.values()) cells.push({ x: b.x, y: b.y, v: agg === 'count' ? b.n : agg === 'sum' ? b.sum : agg === 'mean' ? b.sum / b.n : agg === 'max' ? b.max : b.min })
        if (!cells.length) { note(root, 'Nothing to fold into the grid.'); return }
        const W = root.clientWidth || 640, H = root.clientHeight || 360
        const labelW = Math.min(200, 20 + 7 * ys.reduce((m, y) => Math.max(m, y.length), 0))
        const marks = [P.cell(cells, { x: 'x', y: 'y', fill: 'v', inset: 0.5, rx: 2, tip: true, title: (d) => d.x + ' / ' + d.y + ': ' + fmtNum(d.v) })]
        const cellW = (W - labelW - 20) / xs.length, cellH = (H - 90) / ys.length
        if (cellW >= 36 && cellH >= 14) marks.push(P.text(cells, { x: 'x', y: 'y', text: (d) => fmtTick(d.v), fill: inkOf(dark), stroke: paperOf(dark), strokeWidth: 2.5, paintOrder: 'stroke', fontSize: 10 }))
        const fig = P.plot({
          width: W, height: Math.max(120, H - 30 - (inputs.title ? 34 : 0)),
          marginLeft: labelW, marginBottom: xs.length > 14 ? 64 : 40,
          title: inputs.title || undefined,
          style: baseStyle(dark),
          color: { scheme: inputs.scheme || 'ylgnbu', legend: true, label: agg === 'count' ? 'rows' : agg + ' of ' + cols[vi].name },
          x: { domain: xs, label: cols[xi].name, tickRotate: xs.length > 14 ? -35 : 0 },
          y: { domain: ys, label: cols[yi].name },
          marks
        })
        root.innerHTML = ''
        root.append(fig)
      }
    },
  ]
}
