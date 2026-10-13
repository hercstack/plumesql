// @ts-check
// @description One dodged dot per row, the distribution of a value, a sample of a LOT of rows (Observable Plot, CDN)
// @color cyan
import { P, palettes, loadRows, colIndex, sample, inkOf, baseStyle, note, usePalette } from '$ext/plot-core/plot-core.plumesql.js'

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
      ],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const vi = colIndex(cols, inputs.value), gi = colIndex(cols, inputs.group)
        if (vi < 0) { note(root, 'Pick a numeric Value (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 1000000))
        const dark = usePalette(ctx)
        const grouped = gi >= 0
        const all = []
        for (const r of rows) { const v = Number(r[vi]); if (Number.isFinite(v)) all.push({ v, g: grouped ? String(r[gi] == null ? '' : r[gi]) : '' }) }
        if (!all.length) { note(root, 'No numeric values to draw.'); return }
        const pts = sample(all, Math.max(50, Number(inputs.dots) || 4000))
        const palette = palettes[inputs.palette] || palettes.Vivid
        // Dots small enough that the densest pile fits its row: a few hundred
        // rows of one group at one value would otherwise climb into the next
        // group's row. The densest slice of each group decides.
        const W = root.clientWidth || 640
        const height = Math.max(120, (root.clientHeight || 360) - (grouped ? 30 : 0) - (inputs.title ? 34 : 0))
        const nGroups = grouped ? new Set(pts.map((p) => p.g)).size : 1
        let lo = Infinity, hi = -Infinity
        for (const p of pts) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v }
        const slices = 60, span = hi - lo || 1
        /** @type {Map<string, number>} */
        const pile = new Map()
        let densest = 1
        for (const p of pts) { const k = p.g + '\u0000' + Math.min(slices - 1, Math.floor(((p.v - lo) / span) * slices)); const c = (pile.get(k) || 0) + 1; pile.set(k, c); if (c > densest) densest = c }
        const rowH = (height - 60) / nGroups, sliceW = (W - 76) / slices
        // A dodged pile packs loosely (about half the room is gaps): the 8
        // leaves that slack.
        const r = Math.max(1, Math.min(3, Math.sqrt((rowH * 0.85 * sliceW) / (densest * 8))))
        const dodge = grouped
          ? P.dodgeY('middle', { x: 'v', fy: 'g', fill: 'g', r, tip: true })
          : P.dodgeY('middle', { x: 'v', fill: palette[0], r, tip: true })
        const chart = P.plot({
          width: W, height,
          marginLeft: 56, marginBottom: 40,
          title: inputs.title || undefined,
          color: { range: palette, legend: grouped }, style: baseStyle(dark),
          x: { grid: true, label: cols[vi].name + (pts.length < all.length ? ' (a sample of ' + pts.length.toLocaleString() + ' of ' + all.length.toLocaleString() + ')' : '') },
          fy: { label: null },
          marks: [P.dot(pts, dodge)]
        })
        root.innerHTML = ''
        // The legend sits outside the chart's SVG and takes its text colour
        // from the page, which was black on a dark theme.
        root.style.color = inkOf(dark)
        root.append(chart)
      }
    },
  ]
}
