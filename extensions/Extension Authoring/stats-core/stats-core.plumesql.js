// @ts-check
// @description Shared helpers the analysis extensions import: paging, number parsing, folds, quantiles, correlation, bins, time buckets, forecasting (a library, no views of its own)
// @color violet

// ─── Rows ────────────────────────────────────────────────────────────────────
// The initial window is capped (extensions.viewRowCap); the rest comes in
// through ctx.rows in PAGES, so one transfer across the sandbox bridge stays
// small.
export const loadRows = async (/** @type {any} */ data, /** @type {any} */ ctx, top = 1000000) => {
  let rows = data.rows || []
  if (top > rows.length && typeof ctx.rows === 'function') {
    try {
      const out = rows.slice()
      while (out.length < top) {
        const page = await ctx.rows(out.length, Math.min(200000, top - out.length))
        if (!page || page.length === 0) break
        for (const r of page) out.push(r)
      }
      rows = out
    } catch (e) { ctx.log('ctx.rows: ' + e) }
  }
  return rows.slice(0, top)
}
export const topOf = (/** @type {any} */ inputs) => Math.max(1, Number(inputs && inputs.top) || 1000000)
export const colIndex = (/** @type {any[]} */ cols, /** @type {string} */ name) => (name ? cols.findIndex((c) => c.name === name) : -1)
// A comma list of column names to indices, the unknown ones dropped.
export const colIndexes = (/** @type {any[]} */ cols, /** @type {string} */ csv) =>
  String(csv || '').split(',').map((s) => s.trim()).filter(Boolean).map((n) => colIndex(cols, n)).filter((i) => i >= 0)
export const NUMERIC = /^(smallint|integer|bigint|numeric|decimal|real|double|float|int|money|serial)/i
export const TEMPORAL = /^(date|timestamp)/i
export const isNumericCol = (/** @type {any} */ c) => NUMERIC.test(String(c && c.type))
// A table the view hands the grid when it cannot answer yet: one column
// whose header says what to do.
export const ask = (/** @type {string} */ msg) => ({ columns: [{ name: msg, type: 'text' }], rows: [] })

// ─── Values ──────────────────────────────────────────────────────────────────
// Cells arrive as server text (or numbers after a pipeline stage): a number,
// or null for NULL, an empty string or anything that does not read as one.
export const num = (/** @type {unknown} */ v) => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}
// Plain numbers, a few decimals at most: the grid aligns them by the column's
// type, and a copy into a spreadsheet parses them whatever the locale.
export const round = (/** @type {number|null|undefined} */ v, digits = 2) => {
  if (v == null || !Number.isFinite(v)) return null
  const k = Math.pow(10, digits)
  return Math.round(v * k) / k
}
export const keyOf = (/** @type {unknown} */ v) => (v == null ? 'NULL' : String(v))

// ─── Folds ───────────────────────────────────────────────────────────────────
export const sum = (/** @type {number[]} */ xs) => { let s = 0; for (const x of xs) s += x; return s }
export const mean = (/** @type {number[]} */ xs) => (xs.length ? sum(xs) / xs.length : null)
// The sample variance (n - 1), what a spreadsheet's VAR.S answers.
export const variance = (/** @type {number[]} */ xs) => {
  if (xs.length < 2) return null
  const m = /** @type {number} */ (mean(xs))
  let s = 0
  for (const x of xs) s += (x - m) * (x - m)
  return s / (xs.length - 1)
}
export const stdev = (/** @type {number[]} */ xs) => { const v = variance(xs); return v == null ? null : Math.sqrt(v) }
export const sorted = (/** @type {number[]} */ xs) => Float64Array.from(xs).sort()
// Linear interpolation between the closest ranks, a spreadsheet's
// PERCENTILE.INC and PostgreSQL's percentile_cont. Takes a SORTED array.
export const quantile = (/** @type {ArrayLike<number>} */ s, /** @type {number} */ q) => {
  if (!s.length) return null
  const at = (s.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at)
  return s[lo] + (s[hi] - s[lo]) * (at - lo)
}
export const median = (/** @type {number[]} */ xs) => quantile(sorted(xs), 0.5)
export const FOLDS = ['count', 'sum', 'mean', 'median', 'min', 'max', 'stdev', 'p90', 'distinct']
// One fold over one group's values. count counts the rows (values may hold
// nulls then); every other fold reads the numbers alone, distinct the keys.
export const fold = (/** @type {string} */ agg, /** @type {unknown[]} */ values) => {
  if (agg === 'count') return values.length
  if (agg === 'distinct') return new Set(values.map(keyOf)).size
  const xs = []
  for (const v of values) { const n = num(v); if (n != null) xs.push(n) }
  if (!xs.length) return null
  switch (agg) {
    case 'sum': return sum(xs)
    case 'mean': return mean(xs)
    case 'median': return median(xs)
    case 'min': return Math.min(...xs.length > 100000 ? [sorted(xs)[0]] : xs)
    case 'max': return Math.max(...xs.length > 100000 ? [sorted(xs)[xs.length - 1]] : xs)
    case 'stdev': return stdev(xs)
    case 'p90': return quantile(sorted(xs), 0.9)
    default: return null
  }
}

// ─── Ranks and correlation ───────────────────────────────────────────────────
// Ranks from 1, ties sharing the mean of their places (Spearman's
// convention, a spreadsheet's RANK.AVG).
export const ranks = (/** @type {number[]} */ xs) => {
  const order = xs.map((x, i) => i).sort((a, b) => xs[a] - xs[b])
  const out = new Array(xs.length)
  for (let i = 0; i < order.length;) {
    let j = i
    while (j + 1 < order.length && xs[order[j + 1]] === xs[order[i]]) j++
    const r = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[order[k]] = r
    i = j + 1
  }
  return out
}
export const pearson = (/** @type {number[]} */ xs, /** @type {number[]} */ ys) => {
  const n = xs.length
  if (n < 3) return null
  const mx = /** @type {number} */ (mean(xs)), my = /** @type {number} */ (mean(ys))
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy)
}
export const spearman = (/** @type {number[]} */ xs, /** @type {number[]} */ ys) => pearson(ranks(xs), ranks(ys))
// y = a + b·x by least squares, with r².
export const linearFit = (/** @type {number[]} */ xs, /** @type {number[]} */ ys) => {
  const n = xs.length
  if (n < 2) return null
  const mx = /** @type {number} */ (mean(xs)), my = /** @type {number} */ (mean(ys))
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy }
  if (sxx === 0) return null
  const b = sxy / sxx, a = my - b * mx
  return { a, b, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) }
}

// ─── Bins ────────────────────────────────────────────────────────────────────
// "Nice" bin edges over [min, max]: a count of bins (Sturges' rule when
// absent) rounded to a width of 1, 2 or 5 times a power of ten, so the
// labels read as a person would write them.
export const niceWidth = (/** @type {number} */ span, /** @type {number} */ count) => {
  const raw = span / Math.max(1, count)
  if (!(raw > 0)) return 1
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const m = raw / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
}
export const binEdges = (/** @type {number[]} */ xs, /** @type {number|null} */ count, /** @type {number|null} */ width) => {
  let lo = Infinity, hi = -Infinity
  for (const x of xs) { if (x < lo) lo = x; if (x > hi) hi = x }
  if (!Number.isFinite(lo)) return []
  const w = width && width > 0 ? width : niceWidth(hi - lo || 1, count || Math.ceil(Math.log2(xs.length) + 1))
  const start = Math.floor(lo / w) * w
  const edges = [start]
  while (edges[edges.length - 1] <= hi && edges.length < 1001) edges.push(start + edges.length * w)
  return edges
}
// The bin a value falls in: [edge i, edge i+1), the last one closed.
export const binOf = (/** @type {number[]} */ edges, /** @type {number} */ x) => {
  let lo = 0, hi = edges.length - 2
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (edges[mid] <= x) lo = mid; else hi = mid - 1 }
  return lo
}
// A bin edge as text, no float noise (0.30000000000000004 reads 0.3).
export const edgeText = (/** @type {number} */ x) => String(Number(x.toPrecision(12)))

// ─── Time ────────────────────────────────────────────────────────────────────
// A date or timestamp the server sent as text to epoch ms, in UTC so a bucket
// never shifts by the viewer's zone: '2026-09-01', '2026-09-01 10:00:00',
// '2026-09-01 10:00:00+02'.
export const parseTime = (/** @type {unknown} */ v) => {
  if (v == null || v === '') return null
  const s = String(v).trim().replace(' ', 'T')
  const zoned = /([+-]\d{2}(:?\d{2})?|Z)$/.test(s) && /T/.test(s)
  const d = new Date(zoned ? s.replace(/([+-]\d{2})$/, '$1:00') : /T/.test(s) ? s + 'Z' : s + 'T00:00:00Z')
  const t = d.getTime()
  return Number.isFinite(t) ? t : null
}
export const UNITS = ['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year']
// The start of the bucket a moment falls in (weeks start on Monday, ISO).
export const truncTime = (/** @type {number} */ t, /** @type {string} */ unit) => {
  const d = new Date(t)
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate()
  switch (unit) {
    case 'minute': return Math.floor(t / 60000) * 60000
    case 'hour': return Math.floor(t / 3600000) * 3600000
    case 'day': return Date.UTC(y, m, day)
    case 'week': { const dow = (d.getUTCDay() + 6) % 7; return Date.UTC(y, m, day - dow) }
    case 'month': return Date.UTC(y, m, 1)
    case 'quarter': return Date.UTC(y, m - (m % 3), 1)
    default: return Date.UTC(y, 0, 1)
  }
}
// The next bucket's start: a month steps by the calendar, not by 30 days.
export const stepTime = (/** @type {number} */ t, /** @type {string} */ unit, n = 1) => {
  const d = new Date(t)
  switch (unit) {
    case 'minute': return t + n * 60000
    case 'hour': return t + n * 3600000
    case 'day': return t + n * 86400000
    case 'week': return t + n * 7 * 86400000
    case 'month': return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)
    case 'quarter': return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3 * n, 1)
    default: return Date.UTC(d.getUTCFullYear() + n, 0, 1)
  }
}
const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
// A bucket as SQL reads it: a date for a day or longer, a timestamp below.
export const timeText = (/** @type {number} */ t, /** @type {string} */ unit) => {
  const d = new Date(t)
  const date = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate())
  return unit === 'minute' || unit === 'hour' ? date + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':00' : date
}
// The unit a regular series steps by, read from its first gaps: what a
// forecast continues when nobody said.
export const guessUnit = (/** @type {number[]} */ ts) => {
  const gaps = []
  for (let i = 1; i < Math.min(ts.length, 50); i++) if (ts[i] > ts[i - 1]) gaps.push(ts[i] - ts[i - 1])
  const g = gaps.length ? /** @type {number} */ (median(gaps)) : 86400000
  const day = 86400000
  return g < 3600000 ? 'minute' : g < day ? 'hour' : g < 7 * day ? 'day' : g < 28 * day ? 'week' : g < 90 * day ? 'month' : g < 365 * day ? 'quarter' : 'year'
}

// ─── Forecasting ─────────────────────────────────────────────────────────────
// Holt's linear trend (double exponential smoothing), with the smoothing
// weights chosen by a grid search on the one-step error. Answers the next
// `h` points and the residual spread the band is drawn from.
export const holt = (/** @type {number[]} */ ys, /** @type {number} */ h) => {
  if (ys.length < 3) return null
  let best = null
  for (let a = 0.1; a <= 0.91; a += 0.1) {
    for (let b = 0.05; b <= 0.51; b += 0.05) {
      let level = ys[0], trend = ys[1] - ys[0], sse = 0
      for (let i = 1; i < ys.length; i++) {
        const f = level + trend
        sse += (ys[i] - f) * (ys[i] - f)
        const prev = level
        level = a * ys[i] + (1 - a) * (level + trend)
        trend = b * (level - prev) + (1 - b) * trend
      }
      if (!best || sse < best.sse) best = { sse, level, trend }
    }
  }
  const b = /** @type {{sse:number,level:number,trend:number}} */ (best)
  const sigma = Math.sqrt(b.sse / Math.max(1, ys.length - 2))
  const out = []
  for (let k = 1; k <= h; k++) out.push(b.level + k * b.trend)
  return { values: out, sigma }
}
// A linear trend continued, with its residual spread.
export const linearForecast = (/** @type {number[]} */ ys, /** @type {number} */ h) => {
  const xs = ys.map((_, i) => i)
  const fit = linearFit(xs, ys)
  if (!fit) return null
  let sse = 0
  for (let i = 0; i < ys.length; i++) { const e = ys[i] - (fit.a + fit.b * i); sse += e * e }
  const sigma = Math.sqrt(sse / Math.max(1, ys.length - 2))
  const out = []
  for (let k = 0; k < h; k++) out.push(fit.a + fit.b * (ys.length + k))
  return { values: out, sigma }
}

// ─── Sampling ────────────────────────────────────────────────────────────────
// A seeded generator (mulberry32): the same seed draws the same rows.
export const random = (/** @type {number} */ seed) => {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── Colour ──────────────────────────────────────────────────────────────────
// A cell painted by the app's own grid reads the theme's tokens, so a colour
// is a mix of a token and transparent: every theme repaints it.
export const tint = (/** @type {string} */ token, /** @type {number} */ pct) =>
  'color-mix(in srgb, var(--' + token + ') ' + Math.round(Math.max(0, Math.min(100, pct))) + '%, transparent)'
export const escapeHtml = (/** @type {unknown} */ s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c)

/** @type {PlumeSQLExtension} */
export default { rules: [], views: [] }
