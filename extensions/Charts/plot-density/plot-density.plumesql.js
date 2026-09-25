// @ts-check
// @description A hexbin heatmap or density contours for a LOT of points, where a scatter would be a blob (Observable Plot, CDN)
// @color cyan
import { P, loadRows, colIndex, sample, inkOf, baseStyle, note } from '$ext/plot-core/plot-core.plumesql.js'

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Density',
      inputs: [
        { key: 'x', kind: 'column', label: 'X', types: ['numeric'] },
        { key: 'y', kind: 'column', label: 'Y', types: ['numeric'] },
        { key: 'style', kind: 'choice', label: 'Style', options: ['hexbin', 'contours'], default: 'hexbin', description: 'hexbin fills hexagons by count; contours draws density lines' },
        { key: 'bin', kind: 'number', label: 'Hex size (px)', default: '12' },
        { key: 'scheme', kind: 'choice', label: 'Colours', options: ['turbo', 'viridis', 'magma', 'ylgnbu', 'blues', 'oranges'], default: 'turbo' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '1000000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const xi = colIndex(cols, inputs.x), yi = colIndex(cols, inputs.y)
        if (xi < 0 || yi < 0) { note(root, 'Pick a numeric X and Y (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 1000000))
        const dark = ctx.theme !== 'light'
        const pts = []
        for (const r of rows) { const x = Number(r[xi]), y = Number(r[yi]); if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y }) }
        if (!pts.length) { note(root, 'No numeric points to draw.'); return }
        const bin = Math.max(4, Number(inputs.bin) || 12)
        const scheme = inputs.scheme || 'turbo'
        const contours = inputs.style === 'contours'
        const marks = contours
          ? [
              P.dot(sample(pts, 4000), { x: 'x', y: 'y', r: 1.2, fill: inkOf(dark), fillOpacity: 0.25 }),
              P.density(pts, { x: 'x', y: 'y', fill: 'density', fillOpacity: 0.35, stroke: 'density', strokeWidth: 0.8, thresholds: 24 })
            ]
          : [P.dot(pts, P.hexbin({ fill: 'count' }, { x: 'x', y: 'y', binWidth: bin, tip: true }))]
        const chart = P.plot({
          width: root.clientWidth || 640, height: Math.max(120, (root.clientHeight || 360) - 30 - (inputs.title ? 34 : 0)),
          marginLeft: 56, marginBottom: 40,
          title: inputs.title || undefined,
          color: { scheme, legend: true, label: contours ? 'density' : 'count' },
          style: baseStyle(dark),
          x: { grid: true, label: cols[xi].name },
          y: { grid: true, label: cols[yi].name },
          marks
        })
        root.innerHTML = ''
        root.append(chart)
      }
    },
  ]
}
