// @ts-check
// @description Every date and timestamp column reads in the format you pick: ISO, European, US, long, short, weekday, month and year, and more
// @color green
// The server's text as a Date: a DATE column as the local calendar day
// (never through Date.parse, which would read it as UTC midnight and
// slide it a day in the western zones), a naive timestamp as local time,
// a timestamptz in its own zone.
const parse = (value) => {
  const s = String(value)
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
  const d = new Date(s.replace(' ', 'T').replace(/(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)([+-]\d{2})$/, '$1$2:00'))
  return isNaN(d.getTime()) ? null : d
}
const isDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value))
const p2 = (n) => String(n).padStart(2, '0')

// Each format as the day alone and as the day with its time: a DATE column
// reads the first, a timestamp the second.
/** @type {Record<string, (d: Date, day: boolean) => string>} */
const FORMATS = {
  'ISO, 2026-09-23 11:15:03': (d, day) => {
    const s = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
    return day ? s : `${s} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
  },
  'European, 23.09.2026 11:15': (d, day) => {
    const s = `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`
    return day ? s : `${s} ${p2(d.getHours())}:${p2(d.getMinutes())}`
  },
  'US, 9/23/2026, 11:15 AM': (d, day) => intl('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }, day).format(d),
  'Long, September 23, 2026': (d, day) => intl('en', { month: 'long', day: 'numeric', year: 'numeric' }, day).format(d),
  'Short, Sep 23, 2026': (d, day) => intl('en', { month: 'short', day: 'numeric', year: 'numeric' }, day).format(d),
  'Weekday, Wednesday, September 23, 2026': (d, day) => intl('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }, day).format(d),
  'Month and year, Sep 2026': (d) => new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric' }).format(d),
  'Date only, 2026-09-23': (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`,
  'Time only, 11:15:03': (d, day) => (day ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`),
  'Your locale': (d, day) => intl(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' }, day).format(d)
}
/** @param {string | undefined} locale @param {Intl.DateTimeFormatOptions} date @param {boolean} day */
const intl = (locale, date, day) => new Intl.DateTimeFormat(locale, day ? date : { ...date, hour: 'numeric', minute: '2-digit' })
const DEFAULT = 'ISO, 2026-09-23 11:15:03'

/** @type {PlumeSQLExtension} */
export default {
  inputs: [
    { key: 'format', kind: 'choice', label: 'Format', options: Object.keys(FORMATS), default: DEFAULT, description: 'How every date and timestamp column reads; the server value stays on hover' }
  ],
  rules: [
    {
      match: { type: /^(timestamp|date)/ },
      fn: (value, row, prevRow, ctx) => {
        if (value == null) return value
        const d = parse(value)
        if (!d) return value
        const format = FORMATS[ctx.inputs.format] ?? FORMATS[DEFAULT]
        return { value: format(d, isDay(value)), title: String(value) }
      }
    }
  ]
}
