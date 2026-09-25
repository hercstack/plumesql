// @ts-check
// @description Series stacked as flowing bands over x, bucket-averaged for a LOT of rows (Observable Plot, CDN)
// @color cyan
import { P, palettes, loadRows, colIndex, seriesIdxs, xKind, xValue, sortByX, bucketMean, baseStyle, note } from '$ext/plot-core/plot-core.plumesql.js'

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Streamgraph',
      inputs: [
        { key: 'x', kind: 'column', label: 'X (a column, or the row order)', description: 'Horizontal axis: a timestamp draws a time axis, a number a numeric one, anything else categories' },
        { key: 'series', kind: 'multi-column', label: 'Series (Y)', types: ['numeric'], description: 'One series per column; edit the comma list to add or remove one' },
        { key: 'palette', kind: 'choice', label: 'Palette', options: ['Vivid', 'Cool', 'Warm', 'Mono'], default: 'Vivid' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '500000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const idxs = seriesIdxs(cols, inputs.series)
        if (idxs.length === 0) { note(root, 'Pick one or more Y columns (the sliders button in the header).'); return }
        const xi = colIndex(cols, inputs.x)
        const kind = xKind(xi < 0 ? null : cols[xi])
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 500000))
        const dark = ctx.theme !== 'light'
        const W = root.clientWidth || 640
        const stack = []
        rows.forEach((r, i) => { const x = xValue(kind, r, i, xi); if (x == null) return; const o = { x }; idxs.forEach((vi) => { const y = Number(r[vi]); o[cols[vi].name] = Number.isFinite(y) ? y : 0 }); stack.push(o) })
        const ordered = kind === 'ordinal' ? stack : sortByX(stack)
        let slim = ordered
        if (kind !== 'ordinal' && ordered.length > W * 2) {
          slim = ordered.slice(0, 0)
          const n = ordered.length, buckets = W * 2, size = n / buckets
          for (let b = 0; b < buckets; b++) {
            const s = Math.floor(b * size), e = Math.min(n, Math.floor((b + 1) * size))
            if (s >= e) continue
            const o = { x: ordered[s].x }
            for (const vi of idxs) { const k = cols[vi].name; let sum = 0; for (let i = s; i < e; i++) sum += ordered[i][k]; o[k] = sum / (e - s) }
            slim.push(o)
          }
        }
        const long = []
        for (const o of slim) for (const vi of idxs) long.push({ x: o.x, s: cols[vi].name, y: o[cols[vi].name] })
        if (!long.length) { note(root, 'No numeric values to plot.'); return }
        const palette = palettes[inputs.palette] || palettes.Vivid
        const names = idxs.map((vi) => cols[vi].name)
        const chart = P.plot({
          width: W, height: Math.max(120, (root.clientHeight || 360) - (names.length > 1 ? 30 : 0) - (inputs.title ? 34 : 0)),
          marginLeft: 56, marginBottom: 40,
          title: inputs.title || undefined,
          color: { domain: names, range: names.map((s, i) => palette[i % palette.length]), legend: names.length > 1 }, style: baseStyle(dark),
          x: { grid: true, label: xi >= 0 ? cols[xi].name : 'row' }, y: { grid: true, label: null },
          marks: [P.areaY(long, { x: 'x', y: 'y', fill: 's', z: 's', offset: 'wiggle', curve: 'basis', tip: true })]
        })
        root.innerHTML = ''
        root.append(chart)
      }
    },
  ]
}
