// @ts-check
// @description A numeric column named *_ms / *_time / duration / elapsed / latency reads as 1.2 s, 4m 12s, 2h 05m, and an interval column the same way, whatever IntervalStyle the server writes it in
// @color green

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')

// Milliseconds as a person reads a span: 250 ms, 1.2 s, 4m 12s, 2h 05m, 3d 4h.
const human = (/** @type {number} */ ms) => {
  const abs = Math.abs(ms), sign = ms < 0 ? '-' : ''
  let text
  if (abs < 1000) text = abs.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' ms'
  else if (abs < 60000) text = (abs / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' s'
  else if (abs < 3600000) text = Math.floor(abs / 60000) + 'm ' + pad(Math.round((abs % 60000) / 1000)) + 's'
  else if (abs < 86400000) text = Math.floor(abs / 3600000) + 'h ' + pad(Math.round((abs % 3600000) / 60000)) + 'm'
  else text = Math.floor(abs / 86400000) + 'd ' + Math.round((abs % 86400000) / 3600000) + 'h'
  return sign + text
}

// An interval as the server wrote it, in its IntervalStyle (the session's,
// read through ctx.settings from PlumeSQL 0.29.0; postgres, the default,
// without it), to its months, days and milliseconds, which PostgreSQL keeps
// apart (a month is no fixed number of days). Null when it does not read.
//   postgres          1 year 2 mons 3 days 04:05:06.5   -1 days -04:05:06
//   postgres_verbose  @ 1 year 2 mons 3 days 4 hours 5 mins 6.5 secs ago
//   sql_standard      1-2 3 4:05:06.5                    -1 -4:05:06
//   iso_8601          P1Y2M3DT4H5M6.5S
/** @returns {{ months: number, days: number, ms: number } | null} */
const parseInterval = (/** @type {string} */ s, /** @type {string} */ style) => {
  const t = s.trim()
  let months = 0, days = 0, ms = 0
  const time = (/** @type {string} */ sign, /** @type {string} */ h, /** @type {string} */ m, /** @type {string} */ sec) => (sign === '-' ? -1 : 1) * ((Number(h) * 60 + Number(m)) * 60000 + Number(sec || 0) * 1000)
  if (/^-?P/.test(t)) {
    const m = /^P(?:(-?\d+)Y)?(?:(-?\d+)M)?(?:(-?\d+)W)?(?:(-?\d+)D)?(?:T(?:(-?\d+)H)?(?:(-?\d+)M)?(?:(-?[\d.]+)S)?)?$/.exec(t)
    if (!m || t === 'P' || t === 'PT') return null
    months = Number(m[1] || 0) * 12 + Number(m[2] || 0)
    days = Number(m[3] || 0) * 7 + Number(m[4] || 0)
    ms = (Number(m[5] || 0) * 3600 + Number(m[6] || 0) * 60 + Number(m[7] || 0)) * 1000
    return { months, days, ms }
  }
  if (t.startsWith('@')) {
    const ago = /\bago$/.test(t)
    const UNIT = { year: [12, 0, 0], mon: [1, 0, 0], day: [0, 1, 0], hour: [0, 0, 3600000], min: [0, 0, 60000], sec: [0, 0, 1000] }
    let any = false
    for (const m of t.matchAll(/(-?[\d.]+)\s+(year|mon|day|hour|min|sec)s?\b/g)) {
      const [mo, d, k] = UNIT[/** @type {keyof typeof UNIT} */ (m[2])]
      months += Number(m[1]) * mo; days += Number(m[1]) * d; ms += Number(m[1]) * k
      any = true
    }
    if (!any && !/^@\s*0$/.test(t)) return null
    return ago ? { months: -months, days: -days, ms: -ms } : { months, days, ms }
  }
  if (style.toLowerCase() === 'sql_standard') {
    // [years-months] [days] [h:mm:ss], each part signed on its own.
    const m = /^(?:([+-]?)(\d+)-(\d+))?\s*(?:([+-]?\d+)(?=\s|$))?\s*(?:([+-]?)(\d+):(\d{2}):(\d{2}(?:\.\d+)?))?$/.exec(t)
    if (!m || t === '') return null
    if (m[2] !== undefined) months = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 12 + Number(m[3]))
    if (m[4] !== undefined) days = Number(m[4])
    if (m[6] !== undefined) ms = time(m[5], m[6], m[7], m[8])
    return { months, days, ms }
  }
  // postgres: number-unit pairs, then the time.
  let rest = t
  for (const m of t.matchAll(/(-?\d+)\s+(year|mon|day)s?\b/g)) {
    if (m[2] === 'year') months += Number(m[1]) * 12
    else if (m[2] === 'mon') months += Number(m[1])
    else days += Number(m[1])
    rest = rest.replace(m[0], '')
  }
  rest = rest.trim()
  if (rest) {
    const m = /^([+-]?)(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(rest)
    if (!m) return null
    ms = time(m[1], m[2], m[3], m[4])
  }
  return { months, days, ms }
}

// An interval's own reading: a span of time alone reads like the numbers do;
// with months or days, the two largest parts (1y 2mo, 3d 4h).
const intervalText = (/** @type {{ months: number, days: number, ms: number }} */ p) => {
  if (!p.months && !p.days) return human(p.ms)
  const parts = [
    [Math.trunc(p.months / 12), 'y'], [p.months % 12, 'mo'], [p.days, 'd'],
    [Math.trunc(p.ms / 3600000), 'h'], [Math.trunc((p.ms % 3600000) / 60000), 'm']
  ].filter(([n]) => n !== 0)
  return parts.slice(0, 2).map(([n, u]) => n + String(u)).join(' ') || '0'
}

/** @type {PlumeSQLExtension} */
export default [
  {
    match: { name: /(_ms|_time|duration|elapsed|latency)$/i, type: /^(smallint|integer|bigint|numeric|decimal|real|double)/ },
    fn: (value) => {
      const ms = Number(value)
      if (value == null || !Number.isFinite(ms)) return value
      return { value: human(ms), align: 'right', title: String(value) + ' ms' }
    }
  },
  {
    // An interval, in whichever IntervalStyle the session writes it.
    match: { type: /^interval/ },
    fn: (value, row, prevRow, ctx) => {
      if (value == null || value === '') return value
      const style = (typeof ctx.settings === 'function' ? ctx.settings(['IntervalStyle']).IntervalStyle?.value : undefined) ?? 'postgres'
      const p = parseInterval(String(value), style)
      if (!p) return value
      return { value: intervalText(p), align: 'right', title: String(value) }
    }
  }
]
