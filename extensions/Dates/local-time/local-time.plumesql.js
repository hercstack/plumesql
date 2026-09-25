// @ts-check
// @description A timestamptz column reads in the viewer's local time and format, the server value on hover
// @color green
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { type: /^timestamp with time zone/ },
    fn: (value) => {
      if (value == null) return value
      const d = new Date(String(value).replace(' ', 'T').replace(/(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)([+-]\d{2})$/, '$1$2:00'))
      if (isNaN(d.getTime())) return value
      return { value: d.toLocaleString(), title: String(value) }
    }
  }
]
