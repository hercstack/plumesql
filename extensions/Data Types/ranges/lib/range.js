// @ts-check
// A range value arrives in the grid as its text: [1,10), (,5],
// ["2024-01-01 10:00:00+00","2024-01-02 00:00:00+00"), empty, and a
// multirange as a brace list of those, {[1,3),[5,7)}. This module reads that
// text WITHOUT any query, with the grammar of PostgreSQL's range_in: an
// optional bound is either missing (unbounded), double quoted ("" and a
// backslash escape a character inside) or bare (a backslash escapes the next
// character). Out come the bounds with their brackets, the width of a
// number range, the length of a date or time range, a small SVG bar placing
// it, and the helpers the Range Timeline view draws with (axis ticks, lane
// packing).

/**
 * A parsed range. `lower` / `upper` are the bound TEXTS as the server
 * printed them (unescaped), null when the side is unbounded; an unbounded
 * side is never inclusive. An empty range has neither.
 * @typedef {{ empty: boolean, lower: string | null, upper: string | null, lowerInc: boolean, upperInc: boolean }} Range
 */

/**
 * The element kind a range type holds, from the column's type name:
 * 'int' (int4range, int8range), 'num' (numrange), 'date' (daterange),
 * 'ts' (tsrange), 'tstz' (tstzrange), and their multiranges alike.
 * @typedef {'int' | 'num' | 'date' | 'ts' | 'tstz'} Kind
 */

/**
 * @param {string} type
 * @returns {{ kind: Kind, multi: boolean } | null}
 */
export function rangeKind(type) {
  const m = /^(?:"?[\w$]+"?\.)?(int4|int8|num|date|tstz|ts)(multi)?range$/i.exec(type.trim())
  if (!m) return null
  const k = m[1].toLowerCase()
  return { kind: /** @type {Kind} */ (k === 'int4' || k === 'int8' ? 'int' : k), multi: !!m[2] }
}

/** @returns {Range} */
const EMPTY = () => ({ empty: true, lower: null, upper: null, lowerInc: false, upperInc: false })

/**
 * Read one range starting at s[i] (whitespace first allowed).
 * @param {string} s
 * @param {number} i
 * @returns {{ range: Range, end: number } | null}
 */
function rangeAt(s, i) {
  while (i < s.length && /\s/.test(s[i])) i++
  if (s.slice(i, i + 5).toLowerCase() === 'empty') return { range: EMPTY(), end: i + 5 }
  const open = s[i]
  if (open !== '[' && open !== '(') return null
  i++
  /** @returns {string | null | undefined} a bound, null when missing, undefined when broken */
  const bound = () => {
    while (i < s.length && /\s/.test(s[i])) i++
    if (s[i] === ',' || s[i] === ')' || s[i] === ']') return null
    let out = ''
    while (i < s.length && s[i] !== ',' && s[i] !== ')' && s[i] !== ']') {
      if (s[i] === '"') {
        i++
        for (;;) {
          if (i >= s.length) return undefined
          if (s[i] === '"') {
            if (s[i + 1] === '"') {
              out += '"'
              i += 2
              continue
            }
            i++
            break
          }
          if (s[i] === '\\') i++
          if (i >= s.length) return undefined
          out += s[i++]
        }
        continue
      }
      if (s[i] === '\\') i++
      if (i >= s.length) return undefined
      out += s[i++]
    }
    return out.trim()
  }
  const lower = bound()
  if (lower === undefined || s[i] !== ',') return null
  i++
  const upper = bound()
  if (upper === undefined) return null
  const close = s[i]
  if (close !== ')' && close !== ']') return null
  i++
  return {
    range: { empty: false, lower, upper, lowerInc: open === '[' && lower !== null, upperInc: close === ']' && upper !== null },
    end: i
  }
}

/**
 * parseRange reads a range's text; null for anything else.
 * @param {string} text
 * @returns {Range | null}
 */
export function parseRange(text) {
  const r = rangeAt(text, 0)
  if (!r || text.slice(r.end).trim() !== '') return null
  return r.range
}

/**
 * parseMultirange reads a multirange's text, {} or {r1,r2,...}; null for
 * anything else.
 * @param {string} text
 * @returns {Range[] | null}
 */
export function parseMultirange(text) {
  const s = text.trim()
  if (s[0] !== '{' || s[s.length - 1] !== '}') return null
  const body = s.slice(1, -1)
  if (body.trim() === '') return []
  /** @type {Range[]} */
  const out = []
  let i = 0
  for (;;) {
    const r = rangeAt(body, i)
    if (!r) return null
    out.push(r.range)
    i = r.end
    while (i < body.length && /\s/.test(body[i])) i++
    if (i >= body.length) return out
    if (body[i] !== ',') return null
    i++
  }
}

// ---- Bound values ----------------------------------------------------------

/**
 * Milliseconds since the epoch of a civil date and time read as UTC (a
 * year below 100 kept as written, unlike Date.UTC).
 * @param {number} y @param {number} mo @param {number} d @param {number} h @param {number} mi @param {number} sec
 */
function utc(y, mo, d, h, mi, sec) {
  const t = new Date(0)
  t.setUTCFullYear(y, mo - 1, d)
  t.setUTCHours(h, mi, 0, 0)
  return t.getTime() + sec * 1000
}

/**
 * A bound as a number on the range's axis: an integer or a numeric for
 * the number kinds, milliseconds for dates and times (a date and a
 * timestamp without time zone as UTC civil time, a timestamptz as the
 * instant its offset says). `infinity` / `-infinity` are ±Infinity; a
 * bound this cannot read (a BC date, a DateStyle other than ISO) is NaN.
 * @param {string} text
 * @param {Kind} kind
 */
export function boundValue(text, kind) {
  const t = text.trim().toLowerCase()
  if (t === 'infinity' || t === '+infinity') return Infinity
  if (t === '-infinity') return -Infinity
  if (kind === 'int' || kind === 'num') return /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(t) ? Number(t) : NaN
  const m = /^(\d{4,})-(\d{2})-(\d{2})(?:[ t](\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?(?:([+-])(\d{2})(?::?(\d{2}))?(?::?(\d{2}))?)?$/.exec(t)
  if (!m) return NaN
  const ms = utc(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0))
  if (kind !== 'tstz' || !m[7]) return ms
  const off = (+m[8] * 3600 + +(m[9] ?? 0) * 60 + +(m[10] ?? 0)) * 1000
  return m[7] === '+' ? ms - off : ms + off
}

// ---- Width and length --------------------------------------------------------

/**
 * @param {number} n
 * @param {string} one
 * @param {string} [many]
 */
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`

/**
 * A time span said in its biggest units, at most three of them:
 * "7 days", "1 day 2 h 30 min", "45 min 10 s", "0.25 s".
 * @param {number} ms
 */
export function formatSpan(ms) {
  if (!Number.isFinite(ms)) return 'infinite'
  const neg = ms < 0 ? '-' : ''
  let rest = Math.abs(ms)
  if (rest < 1000) return `${neg}${Math.round(rest) / 1000} s`
  const day = 86_400_000
  if (rest % day === 0) return neg + plural(rest / day, 'day')
  /** @type {string[]} */
  const parts = []
  for (const [size, name] of /** @type {[number, string][]} */ ([
    [day, 'day'],
    [3_600_000, 'h'],
    [60_000, 'min'],
    [1_000, 's']
  ])) {
    const n = Math.floor(rest / size)
    rest -= n * size
    if (n > 0) parts.push(name === 'day' ? plural(n, 'day') : `${n} ${name}`)
  }
  return neg + parts.slice(0, 3).join(' ')
}

/**
 * The reading of one non-empty range: `count` for an integer range (how many
 * integers it holds, BigInt exact), `width` for a numeric one, `ms` for a
 * date or time one (a date range counts its days, both ends as the
 * brackets say); undefined where a side is unbounded, infinite or not read.
 * @param {Range} r
 * @param {Kind} kind
 * @returns {{ count?: bigint, width?: number, ms?: number, days?: number }}
 */
export function measure(r, kind) {
  if (r.empty || r.lower === null || r.upper === null) return {}
  if (kind === 'int') {
    if (!/^[+-]?\d+$/.test(r.lower) || !/^[+-]?\d+$/.test(r.upper)) return {}
    const n = BigInt(r.upper) - BigInt(r.lower) + (r.upperInc ? 1n : 0n) - (r.lowerInc ? 0n : 1n)
    return { count: n < 0n ? 0n : n }
  }
  const lo = boundValue(r.lower, kind)
  const hi = boundValue(r.upper, kind)
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return {}
  if (kind === 'num') return { width: Number((hi - lo).toPrecision(12)) }
  if (kind === 'date') {
    const days = Math.round((hi - lo) / 86_400_000) + (r.upperInc ? 1 : 0) - (r.lowerInc ? 0 : 1)
    return { days, ms: days * 86_400_000 }
  }
  return { ms: hi - lo }
}

/**
 * A range written back in its brackets with its bounds as given (the
 * server's own spelling, unquoted): "[1,10)", "(,5]", "empty".
 * @param {Range} r
 */
export function rangeText(r) {
  if (r.empty) return 'empty'
  return `${r.lowerInc ? '[' : '('}${r.lower ?? ''},${r.upper ?? ''}${r.upperInc ? ']' : ')'}`
}

/**
 * What one side of a range is, for the facts: "lower 1, inclusive",
 * "no lower bound", "upper infinity".
 * @param {Range} r
 * @param {'lower' | 'upper'} side
 */
function sideFact(r, side) {
  const b = side === 'lower' ? r.lower : r.upper
  if (b === null) return `no ${side} bound`
  const inc = side === 'lower' ? r.lowerInc : r.upperInc
  if (/^[+-]?infinity$/i.test(b)) return `${side} ${b}`
  return `${side} ${b}, ${inc ? 'inclusive' : 'exclusive'}`
}

/**
 * What a measure reads as: "9 integers", "width 2.5", "7 days".
 * @param {ReturnType<typeof measure>} m
 * @param {Kind} kind
 */
function measureText(m, kind) {
  if (m.count !== undefined) return `${m.count.toLocaleString('en-US')} ${m.count === 1n ? 'integer' : 'integers'}`
  if (m.width !== undefined) return `width ${m.width.toLocaleString('en-US', { maximumFractionDigits: 12 })}`
  if (m.days !== undefined) return plural(m.days, 'day')
  if (m.ms !== undefined) return formatSpan(m.ms)
  void kind
  return ''
}

/**
 * Whether a side of a range reaches infinity: unbounded, or a bound that
 * IS infinity (dates, timestamps and numerics have one).
 * @param {Range} r
 * @param {'lower' | 'upper'} side
 */
const endless = (r, side) => {
  const b = side === 'lower' ? r.lower : r.upper
  return b === null || /^[+-]?infinity$/i.test(b)
}

/**
 * The reading of a range: a line and the value tab's facts.
 * @param {Range} r
 * @param {Kind} kind
 * @param {string} type the column's type, the facts' headline
 */
export function describeRange(r, kind, type) {
  if (r.empty) return { line: 'empty', facts: [type, 'empty: holds no value'] }
  const m = measure(r, kind)
  const lo = endless(r, 'lower')
  const hi = endless(r, 'upper')
  const reach = lo && hi ? 'unbounded' : lo ? 'unbounded below' : hi ? 'unbounded above' : ''
  const size = measureText(m, kind)
  const line = [size, reach].filter(Boolean).join(' · ') || rangeText(r)
  const facts = [type, sideFact(r, 'lower'), sideFact(r, 'upper')]
  if (size) facts.push(size)
  if (m.ms !== undefined && m.ms >= 86_400_000 && m.ms % 86_400_000 !== 0) facts.push(`${Number((m.ms / 3_600_000).toFixed(2)).toLocaleString('en-US')} hours`)
  if (m.days !== undefined && m.days >= 14) facts.push(`${Number((m.days / 7).toFixed(1)).toLocaleString('en-US')} weeks`)
  if (reach) facts.push(reach)
  return { line, facts }
}

/**
 * The reading of a multirange: its ranges, their total size, the gaps.
 * @param {Range[]} rs
 * @param {Kind} kind
 * @param {string} type
 */
export function describeMultirange(rs, kind, type) {
  if (rs.length === 0) return { line: 'empty', facts: [type, 'empty: holds no range'] }
  const ms = rs.map((r) => measure(r, kind))
  const endlessAny = rs.some((r) => !r.empty && (endless(r, 'lower') || endless(r, 'upper')))
  /** @type {ReturnType<typeof measure>} */
  const total = {}
  if (!endlessAny) {
    if (kind === 'int' && ms.every((m) => m.count !== undefined)) total.count = ms.reduce((a, m) => a + (m.count ?? 0n), 0n)
    else if (kind === 'num' && ms.every((m) => m.width !== undefined)) total.width = Number(ms.reduce((a, m) => a + (m.width ?? 0), 0).toPrecision(12))
    else if (kind === 'date' && ms.every((m) => m.days !== undefined)) total.days = ms.reduce((a, m) => a + (m.days ?? 0), 0)
    else if (ms.every((m) => m.ms !== undefined)) total.ms = ms.reduce((a, m) => a + (m.ms ?? 0), 0)
  }
  const size = measureText(total, kind)
  const line = [plural(rs.length, 'range'), size ? `${size} in all` : '', endlessAny ? 'unbounded' : ''].filter(Boolean).join(' · ')
  const facts = [type, plural(rs.length, 'range'), ...(rs.length > 1 ? [plural(rs.length - 1, 'gap')] : [])]
  if (size) facts.push(`${size} in all`)
  const shown = rs.slice(0, 6).map(rangeText)
  facts.push(shown.join(' ') + (rs.length > 6 ? ` + ${rs.length - 6} more` : ''))
  return { line, facts }
}

// ---- The bar ---------------------------------------------------------------

/**
 * A segment on the axis: numeric ends (±Infinity reaching the edge), their
 * brackets, and their labels.
 * @typedef {{ lo: number, hi: number, loInc: boolean, hiInc: boolean, loLabel: string, hiLabel: string }} Segment
 */

/**
 * The segments of ranges, for drawing: an empty range has none; a side that
 * does not read as a number (a DateStyle other than ISO) drops the range.
 * @param {Range[]} rs
 * @param {Kind} kind
 * @returns {Segment[] | null} null when a range could not be placed
 */
export function segments(rs, kind) {
  /** @type {Segment[]} */
  const out = []
  for (const r of rs) {
    if (r.empty) continue
    const lo = r.lower === null ? -Infinity : boundValue(r.lower, kind)
    const hi = r.upper === null ? Infinity : boundValue(r.upper, kind)
    if (Number.isNaN(lo) || Number.isNaN(hi)) return null
    out.push({ lo, hi, loInc: r.lowerInc, hiInc: r.upperInc, loLabel: r.lower ?? '−∞', hiLabel: r.upper ?? '∞' })
  }
  return out
}

/**
 * A bound's label shortened to fit under the bar: a timestamp keeps its
 * date when the two ends fall on different days, its time of day when they
 * share one.
 * @param {string} t
 * @param {boolean} sameDay
 */
function shortLabel(t, sameDay) {
  const m = /^(\d{4,}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?/.exec(t)
  if (m) return sameDay ? m[2] : m[1]
  if (/^[+-]?infinity$/i.test(t)) return t.startsWith('-') ? '−∞' : '∞'
  return t.length > 12 ? `${t.slice(0, 11)}…` : t
}

/** @param {string} t */
const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

/**
 * The bar sketch: an axis line, each segment a bar with its brackets as
 * the notation writes them ([ inclusive, ( exclusive), an arrow where a side
 * runs to infinity, the outer bounds written under it, and for a date or
 * time range a dashed "now" line when now falls on the axis.
 * @param {Segment[]} segs
 * @param {number} w
 * @param {number} h
 * @param {{ now?: number }} [o]
 * @returns {string | undefined}
 */
export function rangeSvg(segs, w, h, o = {}) {
  if (segs.length === 0) return undefined
  const finite = segs.flatMap((s) => [s.lo, s.hi]).filter(Number.isFinite)
  let min = finite.length ? Math.min(...finite) : 0
  let max = finite.length ? Math.max(...finite) : 1
  if (min === max) {
    min -= 1
    max += 1
  }
  const pad = 14
  const inner = w - pad * 2
  // Infinite sides get the outer 12% of the axis to run into.
  const anyLo = segs.some((s) => s.lo === -Infinity)
  const anyHi = segs.some((s) => s.hi === Infinity)
  const x0 = pad + (anyLo ? inner * 0.12 : 0)
  const x1 = w - pad - (anyHi ? inner * 0.12 : 0)
  const r = (/** @type {number} */ n) => Math.round(n * 10) / 10
  const X = (/** @type {number} */ v) => (v === -Infinity ? 3 : v === Infinity ? w - 3 : r(x0 + ((v - min) / (max - min)) * (x1 - x0)))
  const barH = 10
  const y = Math.round(Math.min(h / 2 - 6, 26))
  let out = `<line class="axis" x1="3" x2="${w - 3}" y1="${y + barH / 2}" y2="${y + barH / 2}"/>`
  for (const s of segs) {
    const a = X(s.lo)
    const b = X(s.hi)
    out += `<path class="closed" style="fill-opacity:.35" d="M${a} ${y} H${r(Math.max(a + 1, b))} V${y + barH} H${a} Z"/>`
    const t = y - 4
    const u = y + barH + 4
    if (s.lo === -Infinity) out += `<path class="closed" d="M${a} ${y + barH / 2} L${a + 6} ${t} L${a + 6} ${u} Z"/>`
    else out += s.loInc ? `<path stroke-width="2" d="M${r(a + 4)} ${t} L${a} ${t} L${a} ${u} L${r(a + 4)} ${u}"/>` : `<path stroke-width="2" d="M${r(a + 4)} ${t} Q${r(a - 3)} ${y + barH / 2} ${r(a + 4)} ${u}"/>`
    if (s.hi === Infinity) out += `<path class="closed" d="M${b} ${y + barH / 2} L${b - 6} ${t} L${b - 6} ${u} Z"/>`
    else out += s.hiInc ? `<path stroke-width="2" d="M${r(b - 4)} ${t} L${b} ${t} L${b} ${u} L${r(b - 4)} ${u}"/>` : `<path stroke-width="2" d="M${r(b - 4)} ${t} Q${r(b + 3)} ${y + barH / 2} ${r(b - 4)} ${u}"/>`
  }
  if (o.now !== undefined && o.now >= min && o.now <= max && Number.isFinite(o.now)) {
    const nx = X(o.now)
    out += `<line x1="${nx}" x2="${nx}" y1="${y - 8}" y2="${y + barH + 8}" stroke-dasharray="2 2"/>`
    out += `<text x="${nx}" y="${y - 10}" font-size="9" text-anchor="middle">now</text>`
  }
  // The outer bounds under the bar.
  const first = segs.reduce((a, s) => (s.lo < a.lo ? s : a), segs[0])
  const last = segs.reduce((a, s) => (s.hi > a.hi ? s : a), segs[0])
  const sameDay = first.loLabel.slice(0, 10) === last.hiLabel.slice(0, 10)
  const ly = y + barH + 16
  out += `<text x="${r(Math.max(3, X(first.lo)))}" y="${ly}" font-size="10" text-anchor="start">${esc(shortLabel(first.loLabel, sameDay))}</text>`
  out += `<text x="${r(Math.min(w - 3, X(last.hi)))}" y="${ly}" font-size="10" text-anchor="end">${esc(shortLabel(last.hiLabel, sameDay))}</text>`
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${out}</svg>`
}

// ---- The timeline's helpers -------------------------------------------------

/**
 * Axis ticks for [min, max], about `count` of them at round steps: 1, 2 or
 * 5 times a power of ten for numbers, a calendar-ish step for times.
 * @param {number} min
 * @param {number} max
 * @param {number} count
 * @param {boolean} time
 * @param {number} [shift] milliseconds to add to reach the axis's civil
 *   time (a timestamptz axis: the viewer's UTC offset), so day and month
 *   ticks fall on local midnights
 * @returns {{ step: number, ticks: number[] }}
 */
export function niceTicks(min, max, count, time, shift = 0) {
  const span = max - min
  if (!(span > 0) || !Number.isFinite(span)) return { step: 0, ticks: Number.isFinite(min) ? [min] : [] }
  const raw = span / Math.max(1, count)
  let step
  if (time) {
    const S = 1000
    const M = 60 * S
    const H = 60 * M
    const D = 24 * H
    const steps = [S, 5 * S, 15 * S, 30 * S, M, 5 * M, 15 * M, 30 * M, H, 3 * H, 6 * H, 12 * H, D, 2 * D, 7 * D, 14 * D, 30 * D, 91 * D, 182 * D, 365 * D]
    const found = steps.find((s) => s >= raw)
    if (found !== undefined) step = found
    else {
      // Past a year: 1, 2 or 5 times a power of ten years.
      const years = raw / (365 * D)
      const p = Math.pow(10, Math.floor(Math.log10(years)))
      const f = years / p
      step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p * 365 * D
    }
  } else {
    const p = Math.pow(10, Math.floor(Math.log10(raw)))
    const f = raw / p
    step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p
  }
  /** @type {number[]} */
  const ticks = []
  const DAY = 86_400_000
  if (time && step >= 28 * DAY) {
    // Months and years fall on the calendar: the first of a month every 1,
    // 3 or 6 months, the first of January every 1, 2, 5, 10... years.
    // `shift` moves the grid onto the viewer's local midnight (a
    // timestamptz axis reads in local time), 0 for a civil-time axis.
    const d = new Date(min + shift)
    const past = d.getUTCDate() > 1 || d.getUTCHours() > 0 || d.getUTCMinutes() > 0 || d.getUTCSeconds() > 0 || d.getUTCMilliseconds() > 0
    const years = step >= 365 * DAY ? Math.max(1, Math.round(step / (365 * DAY))) : 0
    const months = years ? 12 * years : step >= 182 * DAY ? 6 : step >= 91 * DAY ? 3 : 1
    // Months counted from year 0, so a multi-year step lands on round years.
    let at = d.getUTCFullYear() * 12 + d.getUTCMonth() + (past ? 1 : 0)
    at = Math.ceil(at / months) * months
    for (;; at += months) {
      const t = new Date(0)
      t.setUTCFullYear(Math.floor(at / 12), at % 12, 1)
      const v = t.getTime() - shift
      if (v > max || ticks.length >= 200) break
      if (v >= min) ticks.push(v)
    }
    return { step, ticks }
  }
  const base = time && step >= DAY ? shift : 0
  for (let t = Math.ceil((min + base) / step) * step - base; t <= max + step * 1e-9 && ticks.length < 200; t += step) ticks.push(Number(t.toPrecision(15)))
  return { step, ticks }
}

/**
 * A tick label: a number as it reads, a date as YYYY-MM-DD, a time with
 * its hour and minute (and the date while the step is under a day). A
 * timestamptz reads in the viewer's local time, a date and a timestamp as
 * written.
 * @param {number} v
 * @param {Kind} kind
 * @param {number} step
 */
export function tickLabel(v, kind, step) {
  if (kind === 'int' || kind === 'num') return Math.abs(v) >= 1e15 ? v.toExponential(2) : v.toLocaleString('en-US', { maximumFractionDigits: 6 })
  const d = new Date(v)
  const local = kind === 'tstz'
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0')
  const Y = local ? d.getFullYear() : d.getUTCFullYear()
  const date = `${String(Y).padStart(4, '0')}-${p((local ? d.getMonth() : d.getUTCMonth()) + 1)}-${p(local ? d.getDate() : d.getUTCDate())}`
  if (kind === 'date' || step >= 86_400_000) return date
  const time = `${p(local ? d.getHours() : d.getUTCHours())}:${p(local ? d.getMinutes() : d.getUTCMinutes())}`
  return step < 60_000 ? `${time}:${p(local ? d.getSeconds() : d.getUTCSeconds())}` : `${date} ${time}`
}

/**
 * Pack intervals into lanes, first fit in start order: two that do not
 * overlap may share a lane, as a booking calendar draws them. Answers the
 * lane of each interval (by its input position) and the lane count.
 * @param {{ lo: number, hi: number }[]} spans
 */
export function packLanes(spans) {
  const order = spans.map((_, i) => i).sort((a, b) => spans[a].lo - spans[b].lo || spans[a].hi - spans[b].hi)
  /** @type {number[]} */
  const ends = []
  const lane = new Array(spans.length).fill(0)
  for (const i of order) {
    const s = spans[i]
    let l = ends.findIndex((e) => e <= s.lo)
    if (l < 0) {
      l = ends.length
      ends.push(s.hi)
    } else ends[l] = s.hi
    lane[i] = l
  }
  return { lane, lanes: ends.length }
}
