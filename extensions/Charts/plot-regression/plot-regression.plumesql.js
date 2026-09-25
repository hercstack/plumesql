// @ts-check
// @description A scatter with a fitted trend line and a confidence band, fitted on every row (Observable Plot, CDN)
// @color cyan
import { P, palettes, loadRows, colIndex, sample, baseStyle, note } from '$ext/plot-core/plot-core.plumesql.js'

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Regression',
      inputs: [
        { key: 'x', kind: 'column', label: 'X', types: ['numeric'] },
        { key: 'y', kind: 'column', label: 'Y', types: ['numeric'] },
        { key: 'color', kind: 'column', label: 'Group (optional)', default: '' },
        { key: 'dots', kind: 'number', label: 'Dots drawn', default: '15000', description: 'A larger result is sampled down to this many dots' },
        { key: 'palette', kind: 'choice', label: 'Palette', options: ['Vivid', 'Cool', 'Warm', 'Mono'], default: 'Vivid' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '1000000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const xi = colIndex(cols, inputs.x), yi = colIndex(cols, inputs.y), ci = colIndex(cols, inputs.color)
        if (xi < 0 || yi < 0) { note(root, 'Pick a numeric X and Y (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 1000000))
        const dark = ctx.theme !== 'light'
        const grouped = ci >= 0
        const pts = []
        for (const r of rows) { const x = Number(r[xi]), y = Number(r[yi]); if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y, c: grouped ? String(r[ci] == null ? '' : r[ci]) : '' }) }
        if (!pts.length) { note(root, 'No numeric points to draw.'); return }
        const dots = sample(pts, Math.max(100, Number(inputs.dots) || 15000))
        const palette = palettes[inputs.palette] || palettes.Vivid
        const chart = P.plot({
          width: root.clientWidth || 640, height: Math.max(120, (root.clientHeight || 360) - (grouped ? 30 : 0) - (inputs.title ? 34 : 0)),
          marginLeft: 56, marginBottom: 40,
          title: inputs.title || undefined,
          color: { range: palette, legend: grouped },
          style: baseStyle(dark),
          x: { grid: true, label: cols[xi].name },
          y: { grid: true, label: cols[yi].name },
          marks: [
            P.dot(dots, { x: 'x', y: 'y', fill: grouped ? 'c' : palette[0], fillOpacity: 0.45, r: 2.5, tip: true }),
            P.linearRegressionY(pts, { x: 'x', y: 'y', stroke: grouped ? 'c' : palette[1], strokeWidth: 2 })
          ]
        })
        root.innerHTML = ''
        root.append(chart)
      }
    },
  ]
}
