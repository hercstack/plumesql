// @ts-check
// @description The distribution of a value per group, as overlapping ridges (Observable Plot, CDN)
// @color cyan
import { P, palettes, loadRows, colIndex, baseStyle, note, usePalette } from '$ext/plot-core/plot-core.plumesql.js'

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
      ],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const vi = colIndex(cols, inputs.value), gi = colIndex(cols, inputs.group)
        if (vi < 0 || gi < 0) { note(root, 'Pick a numeric Value and a Group column (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 1000000))
        const dark = usePalette(ctx)
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
        const W = root.clientWidth || 640, H = root.clientHeight || 360
        const bins = Math.max(5, Number(inputs.bins) || 40)
        const palette = palettes[inputs.palette] || palettes.Cool
        const shared = inputs.scale === 'shared'
        // The ridges share the pane's height, the axis included: a few groups
        // get tall rows that read at a glance (and overlap less), many the
        // classic tight stack. A ridge stands on the bottom of its own row and
        // rises into the rows above, so the first one needs room over the plot.
        const avail = H - 64 - (inputs.title ? 34 : 0)
        const overlap = avail / groups.length > 60 ? 1.4 : 2.5
        const rowH = Math.max(22, Math.min(140, Math.floor(avail / (groups.length + overlap - 1))))
        // Each group counted into the same bins over the whole range, then
        // scaled: per group to its own peak (the shapes compare), shared to
        // the tallest of all (the sizes compare too). Empty bins stay as
        // zeros, so a gap between two humps reads as a gap.
        let lo = Infinity, hi = -Infinity
        for (const p of pts) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v }
        const width = (hi - lo) / bins || 1
        /** @type {Map<string, Float64Array>} */
        const counts = new Map(groups.map((g) => [g, new Float64Array(bins)]))
        for (const p of pts) /** @type {Float64Array} */ (counts.get(p.g))[Math.min(bins - 1, Math.floor((p.v - lo) / width))]++
        let top = 0
        for (const c of counts.values()) for (const x of c) if (x > top) top = x
        const ridge = []
        for (const g of groups) {
          const c = /** @type {Float64Array} */ (counts.get(g))
          let peak = 0
          for (const x of c) if (x > peak) peak = x
          const k = shared ? top : peak
          ridge.push({ x: lo, y: 0, g })
          for (let i = 0; i < bins; i++) ridge.push({ x: lo + (i + 0.5) * width, y: k ? c[i] / k : 0, g })
          ridge.push({ x: lo + bins * width, y: 0, g })
        }
        const labelW = Math.min(180, 20 + 7 * groups.reduce((m, g) => Math.max(m, g.length), 0))
        // Plot measures a facet's y range from the plot's top margin, not from
        // the facet's own top: the ridge's baseline is the row's bottom.
        const mt = 24 + (overlap - 1) * rowH
        const fig = P.plot({
          width: W, height: 48 + groups.length * rowH + (overlap - 1) * rowH, marginLeft: labelW, marginBottom: 30, marginTop: mt,
          title: inputs.title || undefined,
          style: baseStyle(dark),
          x: { grid: true, label: cols[vi].name },
          y: { axis: null, domain: [0, 1], range: [mt + rowH - 2, mt + rowH - overlap * rowH] },
          fy: { label: null, domain: groups },
          color: { domain: groups, range: groups.map((g, i) => palette[i % palette.length]) },
          marks: [
            P.areaY(ridge, { x: 'x', y: 'y', fy: 'g', fill: 'g', fillOpacity: 0.55, curve: 'basis' }),
            P.lineY(ridge, { x: 'x', y: 'y', fy: 'g', stroke: 'g', strokeWidth: 1, curve: 'basis' })
          ]
        })
        root.innerHTML = ''
        root.style.overflow = 'auto'
        root.append(fig)
      }
    },
  ]
}
