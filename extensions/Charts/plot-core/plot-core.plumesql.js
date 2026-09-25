// @ts-check
// @description Shared helpers for the Observable Plot chart extensions: paging, thinning, palettes, axes (a library, no views of its own)
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6/+esm'

// Cast to any: with the CDN types loaded Plot is strictly typed, and a starter
// does not gain from fighting those types over accessor and mark signatures.
export const P = /** @type {any} */ (Plot)

// A few colour palettes (both themes read well); the Palette input picks one.
export const palettes = {
  Vivid: ['#7aa2f7', '#f7768e', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#ff9e64', '#41a6b5'],
  Cool: ['#4c9be8', '#5ec8c8', '#6ee7b7', '#818cf8', '#38bdf8', '#2dd4bf', '#60a5fa', '#34d399'],
  Warm: ['#f97316', '#ef4444', '#f59e0b', '#e11d48', '#fb7185', '#f472b6', '#facc15', '#fb923c'],
  Mono: ['#7aa2f7', '#5b82d9', '#3f63bb', '#8fb3ff', '#274b9d', '#a9c4ff', '#1a3a80', '#c4d6ff']
}
// Sequential ramps, light to dark, for horizon bands.
export const ramps = {
  blues: ['#c6dbef', '#9ecae1', '#6baed6', '#3182bd', '#08519c'],
  greens: ['#c7e9c0', '#a1d99b', '#74c476', '#31a354', '#006d2c'],
  oranges: ['#fdd0a2', '#fdae6b', '#fd8d3c', '#e6550d', '#a63603'],
  purples: ['#dadaeb', '#bcbddc', '#9e9ac8', '#756bb1', '#54278f'],
  reds: ['#fcbba1', '#fc9272', '#fb6a4a', '#de2d26', '#a50f15']
}

// ─── Theme ───────────────────────────────────────────────────────────────────
export const inkOf = (dark) => (dark ? '#c8d3f5' : '#3a3f4b')
export const paperOf = (dark) => (dark ? '#1a1b26' : '#ffffff')
export const mutedOf = (dark) => (dark ? '#8a92a6' : '#6b7280')
export const accentOf = (dark) => (dark ? '#7aa2f7' : '#5a8bf0')
export const baseStyle = (dark) => ({ background: 'transparent', color: inkOf(dark), fontSize: '11px', fontFamily: 'system-ui, sans-serif' })
export const note = (root, msg) => { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif">' + msg + '</div>' }
// Black or white text over a colour, by its luminance.
export const contrast = (hex) => {
  const h = String(hex).replace('#', '')
  if (h.length < 6) return '#000000'
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#000000' : '#ffffff'
}

// ─── Rows ────────────────────────────────────────────────────────────────────
// The initial window is capped (extensions.viewRowCap); pull the rest on demand
// through ctx.rows, in PAGES, up to the result's own stored cap. A page is
// bounded so one transfer across the sandbox bridge stays small.
export const loadRows = async (data, ctx, top) => {
  let rows = data.rows || []
  if (top > rows.length && typeof ctx.rows === 'function') {
    try {
      const PAGE = 200000
      const out = rows.slice()
      while (out.length < top) {
        const page = await ctx.rows(out.length, Math.min(PAGE, top - out.length))
        if (!page || page.length === 0) break
        for (const r of page) out.push(r)
      }
      rows = out
    } catch (e) { ctx.log('ctx.rows: ' + e) }
  }
  return rows.slice(0, top)
}
export const colIndex = (cols, name) => cols.findIndex((c) => c.name === name)
// Resolve a comma-separated column list to indices, dropping the unknown ones.
export const seriesIdxs = (cols, csv) => (csv || '').split(',').map((s) => s.trim()).filter(Boolean).map((n) => colIndex(cols, n)).filter((i) => i >= 0)
// Cell values arrive as STRINGS. A numeric string coerces to a number (so a
// numeric axis scales linearly instead of sorting '1','10','2' as text); a text
// value stays a category.
export const asNum = (v) => { const n = Number(v); return (v != null && v !== '' && Number.isFinite(n)) ? n : v }
export const fmtNum = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })
// Compact axis ticks: 1.2k, 3.5M, and 0.05 stays 0.05.
export const fmtTick = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  const a = Math.abs(n)
  const trim = (x) => String(Number(x.toFixed(1)))
  if (a >= 1e9) return trim(n / 1e9) + 'G'
  if (a >= 1e6) return trim(n / 1e6) + 'M'
  if (a >= 1e3) return trim(n / 1e3) + 'k'
  return String(Number(n.toPrecision(4)))
}
// The smallest and largest of a key over a list, without a spread (a million
// arguments overflow the stack).
export const extent = (arr, key) => { let lo = Infinity, hi = -Infinity; for (const d of arr) { const v = +d[key]; if (v < lo) lo = v; if (v > hi) hi = v } return [lo, hi] }

// ─── The x axis ──────────────────────────────────────────────────────────────
// What a column's values are on an axis: a timestamp / date column is temporal
// (parsed to a Date), a number column numeric, anything else ordinal (a
// category); no column at all means the row order.
export const xKind = (col) => (!col ? 'index' : /timestamp|date/i.test(col.type) ? 'temporal' : /int|numeric|decimal|real|double|float|serial/i.test(col.type) ? 'numeric' : 'ordinal')
// The server's text for a timestamp: a naive one reads as local time, a
// timestamptz keeps its zone (the hours-only offset PostgreSQL prints, +02, is
// padded to +02:00 so Date accepts it).
export const parseTime = (v) => { if (v == null || v === '') return null; const d = new Date(String(v).replace(' ', 'T').replace(/(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)([+-]\d{2})$/, '$1$2:00')); return isNaN(d.getTime()) ? null : d }
// Column xi of row r (or the row order i) as the axis value for its kind; null
// when it does not parse.
export const xValue = (kind, r, i, xi) => {
  if (kind === 'index') return i
  const v = r[xi]
  if (kind === 'temporal') return parseTime(v)
  if (kind === 'numeric') { const n = Number(v); return v == null || v === '' || !Number.isFinite(n) ? null : n }
  return v == null ? '' : String(v)
}
// How the hover read-out prints an x of that kind.
export const fmtX = (kind) => (kind === 'temporal' ? (d) => (d instanceof Date ? d.toLocaleString() : String(d)) : kind === 'ordinal' ? (d) => String(d) : fmtNum)
// Points in x order (the query's order is kept when it already is).
export const sortByX = (pts) => { for (let i = 1; i < pts.length; i++) if (pts[i].x < pts[i - 1].x) return pts.slice().sort((a, b) => (a.x < b.x ? -1 : a.x > b.x ? 1 : 0)); return pts }
// The first index whose x is not below v, and the first whose x is above v, in
// a sorted list: a window is a slice.
export const lowerBound = (pts, v) => { let lo = 0, hi = pts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (+pts[m].x < v) lo = m + 1; else hi = m } return lo }
export const upperBound = (pts, v) => { let lo = 0, hi = pts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (+pts[m].x <= v) lo = m + 1; else hi = m } return lo }

// ─── Thinning: a million points to what the pixels can show ─────────────────
// Thin a long series for a LINE: at most `buckets` runs of consecutive points,
// each kept as its first, lowest, highest and last point, so every peak and
// trough survives while a million points become a few thousand. A line needs no
// more than about two points per pixel of width.
export const thin = (pts, buckets, y) => {
  const n = pts.length
  if (n <= buckets * 4) return pts
  const out = []
  const size = n / buckets
  for (let b = 0; b < buckets; b++) {
    const s = Math.floor(b * size), e = Math.min(n, Math.floor((b + 1) * size))
    if (s >= e) continue
    let lo = s, hi = s
    for (let i = s; i < e; i++) { const v = pts[i][y]; if (v < pts[lo][y]) lo = i; if (v > pts[hi][y]) hi = i }
    let last = -1
    for (const k of [s, Math.min(lo, hi), Math.max(lo, hi), e - 1]) { if (k !== last) out.push(pts[k]); last = k }
  }
  return out
}
// Every k-th point, for a mark that draws one node per point (dots): a sample
// of a huge cloud reads the same and stays responsive.
export const sample = (arr, max) => { if (arr.length <= max) return arr; const step = arr.length / max; const out = []; for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]); return out }
// Consecutive points averaged into `buckets` (for a mark that STACKS: bars and
// streams, where a thinned extreme would misrepresent the total).
export const bucketMean = (pts, buckets, y) => {
  const n = pts.length
  if (n <= buckets) return pts
  const out = []
  const size = n / buckets
  for (let b = 0; b < buckets; b++) {
    const s = Math.floor(b * size), e = Math.min(n, Math.floor((b + 1) * size))
    if (s >= e) continue
    let sum = 0
    for (let i = s; i < e; i++) sum += pts[i][y]
    const p = Object.assign({}, pts[s]); p[y] = sum / (e - s); out.push(p)
  }
  return out
}

// ─── The look ────────────────────────────────────────────────────────────────
// Anchor y at zero only when zero is CLOSE: values that live near it (counts,
// amounts) read against the baseline; values far from it (a voltage at 270, a
// temperature) would waste the height and clip the signal.
export const anchorZero = (lo, hi) => { if (!Number.isFinite(lo) || !Number.isFinite(hi)) return true; if (lo <= 0) return true; return lo <= hi - lo }
// A left margin wide enough for the widest y tick label.
export const leftMargin = (lo, hi) => 16 + 7 * Math.max(fmtTick(lo).length, fmtTick(hi).length, 2)
// Markers on the points only when the width leaves room for them.
export const sparse = (count, width) => count > 0 && width / count >= 12

// The hover read-out on a line chart: a dashed vertical rule, the x under the
// cursor written at the top, and on every series a ring and its value in the
// series colour, all driven by Plot.pointerX so they follow the cursor.
export const pointerMarks = (long, names, dark, fx) => {
  const ink = inkOf(dark), paper = paperOf(dark)
  const marks = [
    P.ruleX(long, P.pointerX({ x: 'x', stroke: ink, strokeOpacity: 0.35, strokeDasharray: '3 3' })),
    P.text(long, P.pointerX({ x: 'x', frameAnchor: 'top', dy: 8, text: (d) => fx(d.x), fontWeight: 700, fontSize: 11, fill: ink, stroke: paper, strokeWidth: 3, paintOrder: 'stroke' }))
  ]
  for (const s of names) {
    const sd = long.filter((d) => d.s === s)
    if (!sd.length) continue
    marks.push(P.dot(sd, P.pointerX({ x: 'x', y: 'y', stroke: 's', fill: paper, strokeWidth: 2, r: 4 })))
    marks.push(P.text(sd, P.pointerX({ x: 'x', y: 'y', text: (d) => fmtNum(d.y), dx: 8, dy: -8, textAnchor: 'start', fill: 's', stroke: paper, strokeWidth: 3, paintOrder: 'stroke', fontWeight: 700, fontSize: 11 })))
  }
  return marks
}

// Start and end value badges: a small filled label in the series colour at the
// first and last point of every series, the two numbers a trend chart is read
// for. A render FUNCTION used as a mark: Plot hands it the scales and the frame.
export const edgeBadges = (bySeries, colorOf) => (index, scales, values, dims) => {
  const NS = 'http://www.w3.org/2000/svg'
  const g = document.createElementNS(NS, 'g')
  g.setAttribute('pointer-events', 'none')
  const fs = 11, padX = 5, h = fs + 4
  const labels = []
  for (const [s, pts] of bySeries) {
    if (!pts.length) continue
    const put = (p, start) => {
      const xp = scales.x(p.x), yp = scales.y(p.y)
      if (!Number.isFinite(xp) || !Number.isFinite(yp)) return
      const text = fmtNum(p.y)
      labels.push({ xp, yp, w: Math.ceil(text.length * fs * 0.58) + 2 * padX, color: colorOf(s), text, start })
    }
    put(pts[0], true)
    if (pts.length > 1) put(pts[pts.length - 1], false)
  }
  // Badges that would overlap on a side stack downward, and stay in the frame.
  for (const side of [true, false]) {
    const group = labels.filter((l) => l.start === side).sort((a, b) => a.yp - b.yp)
    for (let i = 1; i < group.length; i++) { const prev = group[i - 1], cur = group[i]; if (cur.yp - h / 2 < prev.yp + h / 2 + 2) cur.yp = prev.yp + h + 2 }
    const minY = dims.marginTop + h / 2, maxY = dims.height - dims.marginBottom - h / 2
    for (const l of group) l.yp = Math.max(minY, Math.min(maxY, l.yp))
  }
  for (const l of labels) {
    const x = l.start ? l.xp - l.w - 4 : l.xp + 4
    const rect = document.createElementNS(NS, 'rect')
    rect.setAttribute('x', String(x)); rect.setAttribute('y', String(l.yp - h / 2)); rect.setAttribute('width', String(l.w)); rect.setAttribute('height', String(h)); rect.setAttribute('rx', '2'); rect.setAttribute('fill', l.color)
    const text = document.createElementNS(NS, 'text')
    text.setAttribute('x', String(x + l.w / 2)); text.setAttribute('y', String(l.yp)); text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'central')
    text.setAttribute('font-size', String(fs)); text.setAttribute('font-weight', '700'); text.setAttribute('fill', contrast(l.color)); text.textContent = l.text
    g.append(rect, text)
  }
  return g
}

// Fade an area fill from its colour at the top to nothing at the bottom. Plot
// has no gradient fills, so the SVG is post-processed: every filled, unstroked
// path gets a linearGradient in its own colour.
export const areaGradients = (fig) => {
  const svg = fig.tagName && fig.tagName.toLowerCase() === 'svg' ? fig : fig.querySelector('svg')
  if (!svg) return
  const NS = 'http://www.w3.org/2000/svg'
  let defs = svg.querySelector('defs')
  if (!defs) { defs = document.createElementNS(NS, 'defs'); svg.prepend(defs) }
  svg.querySelectorAll('path').forEach((p) => {
    const fill = p.getAttribute('fill'), stroke = p.getAttribute('stroke')
    if (!fill || fill === 'none' || stroke) return
    const id = 'plumesql-area-' + fill.replace(/[^a-z0-9]/gi, '')
    if (!defs.querySelector('#' + id)) {
      const lg = document.createElementNS(NS, 'linearGradient')
      lg.setAttribute('id', id); lg.setAttribute('x1', '0'); lg.setAttribute('y1', '0'); lg.setAttribute('x2', '0'); lg.setAttribute('y2', '1')
      const s1 = document.createElementNS(NS, 'stop'); s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', fill); s1.setAttribute('stop-opacity', '0.45')
      const s2 = document.createElementNS(NS, 'stop'); s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', fill); s2.setAttribute('stop-opacity', '0.02')
      lg.append(s1, s2); defs.append(lg)
    }
    p.setAttribute('fill', 'url(#' + id + ')')
  })
}

// A library: the plot-* extensions import from this module and list it as a dependency; it adds no rule and no view of its own (the app reads the empty lists as exactly that).
export default { rules: [], views: [] }
