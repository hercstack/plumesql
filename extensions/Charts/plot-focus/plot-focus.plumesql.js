// @ts-check
// @description Brush a window on the overview and the detail below zooms to it, with a hover read-out on both (Observable Plot, CDN)
// @color cyan
import { P, palettes, loadRows, colIndex, seriesIdxs, xKind, xValue, fmtX, sortByX, lowerBound, upperBound, thin, extent, anchorZero, leftMargin, fmtTick, inkOf, accentOf, baseStyle, pointerMarks, edgeBadges, note } from '$ext/plot-core/plot-core.plumesql.js'

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Focus',
      inputs: [
        { key: 'x', kind: 'column', label: 'X (a number, a timestamp, or the row order)' },
        { key: 'series', kind: 'multi-column', label: 'Series (Y)', types: ['numeric'], description: 'One series per column; edit the comma list to add or remove one' },
        { key: 'palette', kind: 'choice', label: 'Palette', options: ['Vivid', 'Cool', 'Warm', 'Mono'], default: 'Vivid' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '1000000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const idxs = seriesIdxs(cols, inputs.series)
        if (idxs.length === 0) { note(root, 'Pick one or more Y columns (the sliders button in the header).'); return }
        const xi = colIndex(cols, inputs.x)
        let kind = xKind(xi < 0 ? null : cols[xi])
        if (kind === 'ordinal') kind = 'index'
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 1000000))
        const dark = ctx.theme !== 'light'
        const ink = inkOf(dark), accent = accentOf(dark)
        const names = idxs.map((vi) => cols[vi].name)
        const palette = palettes[inputs.palette] || palettes.Vivid
        const colorOf = (s) => palette[Math.max(0, names.indexOf(s)) % palette.length]
        const fx = fmtX(kind)
        const fromN = kind === 'temporal' ? (n) => new Date(n) : (n) => n
        const bySeries = new Map()
        idxs.forEach((vi, k) => {
          const pts = []
          rows.forEach((r, i) => { const x = xValue(kind, r, i, xi); const y = Number(r[vi]); if (x != null && Number.isFinite(y)) pts.push({ x, y, s: names[k] }) })
          bySeries.set(names[k], sortByX(pts))
        })
        let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, total = 0
        for (const pts of bySeries.values()) {
          if (!pts.length) continue
          xmin = Math.min(xmin, +pts[0].x); xmax = Math.max(xmax, +pts[pts.length - 1].x); total += pts.length
          const [lo, hi] = extent(pts, 'y'); ymin = Math.min(ymin, lo); ymax = Math.max(ymax, hi)
        }
        if (!total) { note(root, 'No numeric values to plot.'); return }
        if (xmax <= xmin) xmax = xmin + 1
        const W = root.clientWidth || 640, H = root.clientHeight || 360
        const legend = names.length > 1
        const masterH = Math.max(80, Math.round(H * 0.32))
        const gap = 6
        const detailH = Math.max(120, H - masterH - gap - (legend ? 30 : 0) - (inputs.title ? 34 : 0))
        const mL = leftMargin(ymin, ymax), mR = 64
        root.innerHTML = ''
        root.style.cssText = 'display:flex;flex-direction:column;overflow:hidden'
        const masterWrap = document.createElement('div'); masterWrap.style.cssText = 'position:relative;flex:0 0 auto;height:' + masterH + 'px'
        const detailWrap = document.createElement('div'); detailWrap.style.cssText = 'position:relative;flex:1 1 auto;min-height:0;margin-top:' + gap + 'px'
        root.append(masterWrap, detailWrap)
        const overview = []
        for (const pts of bySeries.values()) for (const p of thin(pts, W * 2, 'y')) overview.push(p)
        const master = P.plot({
          width: W, height: masterH, marginLeft: mL, marginRight: mR, marginTop: 8, marginBottom: 20,
          color: { domain: names, range: names.map(colorOf) }, style: baseStyle(dark),
          x: { domain: [fromN(xmin), fromN(xmax)], tickFormat: kind === 'numeric' ? fmtTick : undefined, label: null },
          y: { axis: null },
          marks: [P.lineY(overview, { x: 'x', y: 'y', stroke: 's', z: 's', strokeWidth: 0.9, strokeOpacity: 0.85 })]
        })
        masterWrap.append(master)
        const sx = master.scale('x')
        const range = [Math.min(sx.range[0], sx.range[1]), Math.max(sx.range[0], sx.range[1])]
        const toPx = (x) => sx.apply(fromN(x))
        const toX = (px) => +sx.invert(px)
        let sel = [xmin, xmin + (xmax - xmin) / 4]
        const lo = () => Math.min(sel[0], sel[1]), hi = () => Math.max(sel[0], sel[1])
        const brush = document.createElement('div')
        brush.style.cssText = 'position:absolute;left:' + range[0] + 'px;width:' + (range[1] - range[0]) + 'px;top:8px;height:' + (masterH - 28) + 'px;cursor:crosshair;touch-action:none'
        const band = document.createElement('div')
        band.style.cssText = 'position:absolute;top:0;bottom:0;box-sizing:border-box;cursor:grab;background:' + (dark ? 'rgba(122,162,247,0.16)' : 'rgba(60,90,200,0.10)') + ';border-left:1px solid ' + accent + ';border-right:1px solid ' + accent
        const handle = (side) => { const h = document.createElement('div'); h.dataset.side = side; h.style.cssText = 'position:absolute;top:0;bottom:0;width:8px;' + side + ':-4px;cursor:col-resize'; return h }
        band.append(handle('left'), handle('right'))
        brush.append(band)
        masterWrap.append(brush)
        const placeBand = () => { const a = toPx(lo()), b = toPx(hi()); band.style.left = (a - range[0]) + 'px'; band.style.width = Math.max(2, b - a) + 'px' }
        const NS = 'http://www.w3.org/2000/svg'
        const lineOn = (svg) => { const l = document.createElementNS(NS, 'line'); l.setAttribute('stroke', ink); l.setAttribute('stroke-opacity', '0.45'); l.setAttribute('stroke-dasharray', '3 3'); l.setAttribute('pointer-events', 'none'); l.style.display = 'none'; svg.append(l); return l }
        const showLine = (l, px, h) => { if (!l) return; if (px == null || !Number.isFinite(px)) { l.style.display = 'none'; return } l.setAttribute('x1', String(px)); l.setAttribute('x2', String(px)); l.setAttribute('y1', '0'); l.setAttribute('y2', String(h)); l.style.display = '' }
        const masterLine = lineOn(master)
        let detailLine = null
        let detail = null
        const drawDetail = () => {
          const a = lo(), b = hi()
          const win = new Map()
          const long = []
          for (const [s, pts] of bySeries) {
            const slice = thin(pts.slice(lowerBound(pts, a), upperBound(pts, b)), W * 4, 'y')
            if (slice.length) win.set(s, slice)
            for (const p of slice) long.push(p)
          }
          const [wlo, whi] = long.length ? extent(long, 'y') : [0, 1]
          const zero = anchorZero(wlo, whi)
          const marks = []
          if (zero) marks.push(P.ruleY([0], { stroke: ink, strokeOpacity: 0.4 }))
          marks.push(P.lineY(long, { x: 'x', y: 'y', stroke: 's', z: 's', strokeWidth: 1.5 }))
          marks.push(...pointerMarks(long, names, dark, fx))
          marks.push(edgeBadges(win, colorOf))
          detail = P.plot({
            width: W, height: detailH, marginLeft: mL, marginRight: mR, marginTop: 24, marginBottom: 30,
            title: inputs.title || undefined,
            color: { domain: names, range: names.map(colorOf), legend }, style: baseStyle(dark),
            x: { grid: true, domain: [fromN(a), fromN(b)], tickFormat: kind === 'numeric' ? fmtTick : undefined, label: xi >= 0 ? cols[xi].name + (kind === 'index' ? ' (row order)' : '') : 'row' },
            y: { grid: true, tickFormat: fmtTick, label: names.length === 1 ? names[0] : null, domain: zero ? [Math.min(0, wlo), Math.max(0, whi)] : undefined, nice: true },
            marks
          })
          detailWrap.replaceChildren(detail)
          const svg = detail.tagName.toLowerCase() === 'svg' ? detail : detail.querySelector('svg')
          if (!svg) return
          detailLine = lineOn(svg)
          const dsx = detail.scale('x')
          svg.addEventListener('pointermove', (e) => { const r = svg.getBoundingClientRect(); showLine(masterLine, toPx(+dsx.invert(e.clientX - r.left)), masterH) })
          svg.addEventListener('pointerleave', () => showLine(masterLine, null, 0))
        }
        let raf = 0
        const schedule = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; placeBand(); drawDetail() }) }
        let dragging = false, mode = '', anchor = 0, grabOff = 0, width0 = 0
        const pxOf = (e) => { const r = masterWrap.getBoundingClientRect(); return Math.max(range[0], Math.min(range[1], e.clientX - r.left)) }
        brush.addEventListener('pointerdown', (e) => {
          const t = /** @type {HTMLElement} */ (e.target)
          const x = toX(pxOf(e))
          dragging = true
          if (t.dataset && t.dataset.side) mode = t.dataset.side
          else if (t === band) { mode = 'move'; grabOff = x - lo(); width0 = hi() - lo() }
          else { mode = 'new'; anchor = x; sel = [x, x] }
          try { brush.setPointerCapture(e.pointerId) } catch (err) {}
          e.preventDefault()
          schedule()
        })
        brush.addEventListener('pointermove', (e) => {
          if (!dragging) return
          const x = Math.max(xmin, Math.min(xmax, toX(pxOf(e))))
          if (mode === 'new') sel = [anchor, x]
          else if (mode === 'left') sel = [x, hi()]
          else if (mode === 'right') sel = [lo(), x]
          else if (mode === 'move') { const a = Math.max(xmin, Math.min(xmax - width0, x - grabOff)); sel = [a, a + width0] }
          schedule()
        })
        const end = () => { if (!dragging) return; dragging = false; if (hi() - lo() < (xmax - xmin) * 0.002) sel = [xmin, xmax]; mode = ''; schedule() }
        brush.addEventListener('pointerup', end)
        brush.addEventListener('pointercancel', end)
        brush.addEventListener('dblclick', () => { sel = [xmin, xmax]; schedule() })
        masterWrap.addEventListener('pointermove', (e) => {
          if (dragging || !detail) return
          const r = masterWrap.getBoundingClientRect(); const px = e.clientX - r.left
          if (px < range[0] || px > range[1]) { showLine(detailLine, null, 0); return }
          const x = toX(px)
          if (x >= lo() && x <= hi()) showLine(detailLine, detail.scale('x').apply(fromN(x)), detailH)
          else showLine(detailLine, null, 0)
        })
        masterWrap.addEventListener('pointerleave', () => showLine(detailLine, null, 0))
        placeBand()
        drawDetail()
      }
    },
  ]
}
