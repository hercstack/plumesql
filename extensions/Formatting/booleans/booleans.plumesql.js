// @ts-check
// @description Every boolean column reads a green Yes or a red No
// @color green
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { type: 'boolean' },
    fn: (value) => {
      // A NULL is not a No: it stays the grid's own NULL.
      if (value == null) return value
      const yes = value === 't' || value === true || value === 'true'
      return { value: yes ? 'Yes' : 'No', class: yes ? 'fmt-ok' : 'fmt-bad' }
    }
  }
]
