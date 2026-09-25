// @ts-check
// @description Every date and timestamp column reads as its month and year, Sep 2026, the day on hover
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

/** @type {Intl.DateTimeFormatOptions} */
const DATE = { month: 'short', year: 'numeric' }
/** @type {Intl.DateTimeFormatOptions} */
const TIME = {}
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { type: /^(timestamp|date)/ },
    fn: (value) => {
      if (value == null) return value
      const d = parse(value)
      if (!d) return value
      // A DATE column reads as the day alone; a timestamp adds the time.
      const fmt = new Intl.DateTimeFormat('en', isDay(value) ? DATE : { ...DATE, ...TIME })
      return { value: fmt.format(d), title: String(value) }
    }
  }
]
