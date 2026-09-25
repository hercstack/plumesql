// @ts-check
// @description Quartiles, median and outliers of a value per group (Observable Plot, CDN)
// @color cyan
import { P, palettes, loadRows, colIndex, sample, inkOf, baseStyle, note } from '$ext/plot-core/plot-core.plumesql.js'

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Box plot',
      inputs: [
        { key: 'value', kind: 'column', label: 'Value', types: ['numeric'] },
        { key: 'group', kind: 'column', label: 'Group', default: '', description: 'Column that splits the data into one group per value' },
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
        const groups = []
        const seen = new Set()
        for (const r of rows) {
          const v = Number(r[vi])
          if (!Number.isFinite(v)) continue
          const g = grouped ? String(r[gi] == null ? '' : r[gi]) : cols[vi].name
          if (!seen.has(g)) { if (seen.size >= 200) continue; seen.add(g); groups.push(g) }
          all.push({ v, g })
        }
        if (!all.length) { note(root, 'No numeric values to draw.'); return }
        const pts = sample(all, 100000)
        const palette = palettes[inputs.palette] || palettes.Vivid
        const horizontal = groups.length > 12
        const fill = grouped ? 'g' : palette[0]
        const W = root.clientWidth || 640, H = root.clientHeight || 360
        const labelW = Math.min(200, 20 + 7 * groups.reduce((m, g) => Math.max(m, g.length), 0))
        const chart = P.plot({
          width: W, height: horizontal ? Math.max(H - (inputs.title ? 34 : 0), 30 + groups.length * 22) : Math.max(120, H - (inputs.title ? 34 : 0)),
          marginLeft: horizontal ? labelW : 56, marginBottom: horizontal ? 36 : 44,
          title: inputs.title || undefined,
          color: { domain: groups, range: groups.map((g, i) => palette[i % palette.length]) },
          style: baseStyle(dark),
          x: horizontal ? { grid: true, label: cols[vi].name } : { label: grouped ? cols[gi].name : null, domain: groups, tickRotate: groups.length > 6 ? -30 : 0 },
          y: horizontal ? { label: null, domain: groups } : { grid: true, label: cols[vi].name },
          marks: [horizontal ? P.boxX(pts, { x: 'v', y: 'g', fill, stroke: inkOf(dark), fillOpacity: 0.8 }) : P.boxY(pts, { x: 'g', y: 'v', fill, stroke: inkOf(dark), fillOpacity: 0.8 })]
        })
        root.innerHTML = ''
        root.style.overflow = 'auto'
        root.append(chart)
      }
    },
  ]
}
