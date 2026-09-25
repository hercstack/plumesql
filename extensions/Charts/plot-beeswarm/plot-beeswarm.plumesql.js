// @ts-check
// @description One dodged dot per row, the distribution of a value, a sample of a LOT of rows (Observable Plot, CDN)
// @color cyan
import { P, palettes, loadRows, colIndex, sample, baseStyle, note } from '$ext/plot-core/plot-core.plumesql.js'

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Beeswarm',
      inputs: [
        { key: 'value', kind: 'column', label: 'Value', types: ['numeric'] },
        { key: 'group', kind: 'column', label: 'Group', default: '', description: 'Column that splits the data into one group per value' },
        { key: 'dots', kind: 'number', label: 'Dots drawn', default: '4000', description: 'A larger result is sampled down to this many dots' },
        { key: 'palette', kind: 'choice', label: 'Palette', options: ['Vivid', 'Cool', 'Warm', 'Mono'], default: 'Vivid' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '1000000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const vi = colIndex(cols, inputs.value), gi = colIndex(cols, inputs.group)
        if (vi < 0) { note(root, 'Pick a numeric Value (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 1000000))
        const dark = ctx.theme !== 'light'
        const grouped = gi >= 0
        const all = []
        for (const r of rows) { const v = Number(r[vi]); if (Number.isFinite(v)) all.push({ v, g: grouped ? String(r[gi] == null ? '' : r[gi]) : '' }) }
        if (!all.length) { note(root, 'No numeric values to draw.'); return }
        const pts = sample(all, Math.max(50, Number(inputs.dots) || 4000))
        const palette = palettes[inputs.palette] || palettes.Vivid
        const dodge = grouped
          ? P.dodgeY({ x: 'v', fy: 'g', fill: 'g', r: 3, tip: true })
          : P.dodgeY({ x: 'v', fill: palette[0], r: 3, tip: true })
        const chart = P.plot({
          width: root.clientWidth || 640, height: Math.max(120, (root.clientHeight || 360) - (grouped ? 30 : 0) - (inputs.title ? 34 : 0)),
          marginLeft: 56, marginBottom: 40,
          title: inputs.title || undefined,
          color: { range: palette, legend: grouped }, style: baseStyle(dark),
          x: { grid: true, label: cols[vi].name + (pts.length < all.length ? ' (a sample of ' + pts.length.toLocaleString() + ' of ' + all.length.toLocaleString() + ')' : '') },
          fy: { label: null },
          marks: [P.dot(pts, dodge)]
        })
        root.innerHTML = ''
        root.append(chart)
      }
    },
  ]
}
