// @ts-check
// @description The distribution of a value per group, as overlapping ridges (Observable Plot, CDN)
// @color cyan
import { P, palettes, loadRows, colIndex, baseStyle, note } from '$ext/plot-core/plot-core.plumesql.js'

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Ridgeline',
      inputs: [
        { key: 'value', kind: 'column', label: 'Value', types: ['numeric'] },
        { key: 'group', kind: 'column', label: 'Group (one ridge each)' },
        { key: 'scale', kind: 'choice', label: 'Height', options: ['per group', 'shared'], default: 'per group', description: 'per group scales each ridge to its own peak; shared uses one scale for all' },
        { key: 'bins', kind: 'number', label: 'Bins', default: '40', description: 'Histogram bins per ridge' },
        { key: 'palette', kind: 'choice', label: 'Palette', options: ['Vivid', 'Cool', 'Warm', 'Mono'], default: 'Cool' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '1000000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const vi = colIndex(cols, inputs.value), gi = colIndex(cols, inputs.group)
        if (vi < 0 || gi < 0) { note(root, 'Pick a numeric Value and a Group column (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 1000000))
        const dark = ctx.theme !== 'light'
        const pts = []
        const seen = new Map()
        for (const r of rows) {
          const v = Number(r[vi])
          if (!Number.isFinite(v)) continue
          const g = String(r[gi] == null ? '' : r[gi])
          if (!seen.has(g)) { if (seen.size >= 120) continue; seen.set(g, 0) }
          seen.set(g, seen.get(g) + 1)
          pts.push({ v, g })
        }
        if (!pts.length) { note(root, 'No numeric values to draw.'); return }
        const groups = Array.from(seen.keys())
        const W = root.clientWidth || 640
        const rowH = 22
        const bins = Math.max(5, Number(inputs.bins) || 40)
        const palette = palettes[inputs.palette] || palettes.Cool
        const y = inputs.scale === 'shared' ? 'count' : 'proportion-facet'
        const labelW = Math.min(180, 20 + 7 * groups.reduce((m, g) => Math.max(m, g.length), 0))
        const fig = P.plot({
          width: W, height: 48 + groups.length * rowH, marginLeft: labelW, marginBottom: 30, marginTop: 24,
          title: inputs.title || undefined,
          style: baseStyle(dark),
          x: { grid: true, label: cols[vi].name },
          y: { axis: null, range: [2.5 * rowH - 2, -2] },
          fy: { label: null, domain: groups },
          color: { domain: groups, range: groups.map((g, i) => palette[i % palette.length]) },
          marks: [
            P.areaY(pts, P.binX({ y }, { x: 'v', fy: 'g', fill: 'g', fillOpacity: 0.55, curve: 'basis', thresholds: bins })),
            P.lineY(pts, P.binX({ y }, { x: 'v', fy: 'g', stroke: 'g', strokeWidth: 1, curve: 'basis', thresholds: bins }))
          ]
        })
        root.innerHTML = ''
        root.style.overflow = 'auto'
        root.append(fig)
      }
    },
  ]
}
