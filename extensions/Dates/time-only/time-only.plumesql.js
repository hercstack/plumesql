// @ts-check
// @description Every timestamp column shows just the clock, 11:15:03, the date on hover
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
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { type: /^timestamp/ },
    fn: (value) => {
      if (value == null) return value
      const d = parse(value)
      if (!d) return value
      // The clock alone, in the viewer's local time (a timestamptz shifts
      // into it); the whole value, date included, is in the tooltip.
      return { value: `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`, title: String(value) }
    }
  }
]
