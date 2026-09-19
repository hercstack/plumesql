// @ts-check
// @description Every NULL cell reads as a dimmed symbol and an empty string as (empty), in every column
// @color gray
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { name: /.*/ },
    fn: (value) => (value === null ? { value: '\u2205', class: 'fmt-muted', title: 'NULL' } : value === '' ? { value: '(empty)', class: 'fmt-muted', title: 'an empty string' } : value)
  }
]
