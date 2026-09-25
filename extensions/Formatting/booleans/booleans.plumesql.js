// @ts-check
// @description Every boolean column reads a green Yes or a red No
// @color green
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { type: 'boolean' },
    fn: (value) => {
      const yes = value === 't' || value === true || value === 'true'
      return { value: yes ? 'Yes' : 'No', class: yes ? 'fmt-ok' : 'fmt-bad' }
    }
  }
]
