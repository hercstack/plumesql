// @ts-check
// @description Line / area / dot / bar over one or more Y columns, with a hover read-out and value badges (Observable Plot, CDN)
// @color cyan
import { P, palettes, loadRows, colIndex, seriesIdxs, xKind, xValue, fmtX, sortByX, thin, sample, bucketMean, extent, anchorZero, leftMargin, sparse, fmtTick, inkOf, baseStyle, pointerMarks, edgeBadges, areaGradients, note } from '$ext/plot-core/plot-core.plumesql.js'

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Chart',
      inputs: [
        { key: 'mark', kind: 'choice', label: 'Mark', options: ['line', 'area', 'dot', 'bar'], default: 'line' },
        { key: 'x', kind: 'column', label: 'X (a column, or the row order)', description: 'Horizontal axis: a timestamp draws a time axis, a number a numeric one, anything else categories' },
        { key: 'series', kind: 'multi-column', label: 'Series (Y)', types: ['numeric'], description: 'One series per column; edit the comma list to add or remove one' },
        { key: 'facet', kind: 'column', label: 'Facet by', default: '', description: 'Splits the chart into one panel per distinct value' },
        { key: 'curve', kind: 'choice', label: 'Curve', options: ['linear', 'monotone-x', 'step', 'basis'], default: 'linear', description: 'Line shape between points: monotone-x is smooth, step is stairs, basis a spline' },
        { key: 'palette', kind: 'choice', label: 'Palette', options: ['Vivid', 'Cool', 'Warm', 'Mono'], default: 'Vivid' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '500000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const idxs = seriesIdxs(cols, inputs.series)
        if (idxs.length === 0) { note(root, 'Pick one or more Y columns (the sliders button in the header).'); return }
        const xi = colIndex(cols, inputs.x), fi = colIndex(cols, inputs.facet)
        const kind = xKind(xi < 0 ? null : cols[xi])
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 500000))
        const dark = ctx.theme !== 'light'
        const mark = inputs.mark || 'line'
        const W = root.clientWidth || 640, H = root.clientHeight || 360
        const names = idxs.map((vi) => cols[vi].name)
        const palette = palettes[inputs.palette] || palettes.Vivid
        const colorOf = (s) => palette[Math.max(0, names.indexOf(s)) % palette.length]
        const groups = new Map()
        rows.forEach((r, i) => {
          const x = xValue(kind, r, i, xi)
          if (x == null) return
          const f = fi >= 0 ? (r[fi] == null ? '' : String(r[fi])) : ''
          for (const vi of idxs) {
            const y = Number(r[vi])
            if (!Number.isFinite(y)) continue
            const k = cols[vi].name + '\u0000' + f
            let g = groups.get(k)
            if (!g) { g = []; groups.set(k, g) }
            g.push({ x, y, s: cols[vi].name, f })
          }
        })
        const long = []
        const bySeries = new Map()
        for (const g of groups.values()) {
          const pts = kind === 'ordinal' ? g : sortByX(g)
          const slim = mark === 'bar' ? (kind === 'ordinal' ? pts.slice(0, 500) : bucketMean(pts, 400, 'y')) : mark === 'dot' ? sample(pts, 20000) : thin(pts, W * 2, 'y')
          for (const p of slim) long.push(p)
          if (slim.length) bySeries.set(slim[0].s, slim)
        }
        if (!long.length) { note(root, 'No numeric values to plot.'); return }
        const [ymin, ymax] = extent(long, 'y')
        const zero = anchorZero(ymin, ymax)
        const curve = inputs.curve || 'linear'
        const faceted = fi >= 0
        const legend = names.length > 1
        const base = { x: 'x', fy: faceted ? 'f' : undefined }
        const marks = []
        if (zero) marks.push(P.ruleY([0], { stroke: inkOf(dark), strokeOpacity: 0.4 }))
        if (mark === 'line') {
          marks.push(P.lineY(long, Object.assign({}, base, { y: 'y', stroke: 's', z: 's', strokeWidth: 1.5, curve, marker: sparse(long.length / names.length, W) ? 'circle' : undefined })))
        } else if (mark === 'area') {
          marks.push(P.areaY(long, Object.assign({}, base, { y1: () => (zero ? 0 : ymin), y2: 'y', fill: 's', z: 's', curve })))
          marks.push(P.lineY(long, Object.assign({}, base, { y: 'y', stroke: 's', z: 's', strokeWidth: 1.5, curve })))
        } else if (mark === 'dot') {
          marks.push(P.dot(long, Object.assign({}, base, { y: 'y', stroke: 's', fill: 's', fillOpacity: 0.5, r: 2.5 })))
        } else {
          marks.push(P.barY(long, Object.assign({}, base, { y: 'y', fill: 's', tip: true })))
        }
        if (mark !== 'bar') marks.push(...pointerMarks(long, names, dark, fmtX(kind)))
        if ((mark === 'line' || mark === 'area') && !faceted) marks.push(edgeBadges(bySeries, colorOf))
        const xcats = kind === 'ordinal' ? new Set(long.map((d) => d.x)).size : 0
        const fig = P.plot({
          width: W, height: Math.max(120, H - (legend ? 30 : 0) - (inputs.title ? 34 : 0)),
          marginTop: 24, marginBottom: xcats > 14 ? 60 : 36, marginLeft: leftMargin(ymin, ymax), marginRight: mark === 'line' || mark === 'area' ? 64 : 20,
          title: inputs.title || undefined,
          color: { domain: names, range: names.map(colorOf), legend },
          style: baseStyle(dark),
          x: { grid: true, label: xi >= 0 ? cols[xi].name : 'row', tickFormat: kind === 'numeric' ? fmtTick : undefined, tickRotate: xcats > 14 ? -35 : 0 },
          y: { grid: true, tickFormat: fmtTick, label: names.length === 1 ? names[0] : null, domain: zero ? [Math.min(0, ymin), Math.max(0, ymax)] : undefined, nice: true },
          fy: faceted ? { label: null } : undefined,
          marks
        })
        root.innerHTML = ''
        root.append(fig)
        if (mark === 'area') areaGradients(fig)
      }
    },
  ]
}
