// @ts-check
// @description A timestamp column named *_at reads as relative time, exact value on hover
// @color green
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { name: /_at$/, type: /^timestamp/ },
    fn: (value) => {
      if (value == null) return value
      const d = new Date(String(value).replace(' ', 'T').replace(/(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)([+-]\d{2})$/, '$1$2:00'))
      if (isNaN(d.getTime())) return value
      const diff = (d.getTime() - Date.now()) / 1000
      const abs = Math.abs(diff)
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
      /** @type {[Intl.RelativeTimeFormatUnit, number][]} */
      const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]]
      for (const [u, s] of units) if (abs >= s) return { value: rtf.format(Math.round(diff / s), u), title: String(value) }
      return { value: rtf.format(Math.round(diff), 'second'), title: String(value) }
    }
  }
]
