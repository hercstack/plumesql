// @ts-check
// @description Every NULL cell reads as a dimmed symbol and an empty string as (empty), in every column
// @color gray
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { name: /.*/ },
    // The lowest priority: a name pattern would otherwise outrank every
    // formatter that picks its columns by type (Date format, Booleans,
    // Numbers), and attaching Nulls beside one of them would undress its
    // columns. Nulls only fills the columns no other formatter wants.
    priority: 0,
    // The marks are the cell's face (html), not its value: a copy of the
    // cell still copies a NULL or an empty string, never the mark.
    fn: (value) => (value === null ? { value: null, html: '∅', class: 'fmt-muted', title: 'NULL' } : value === '' ? { value: '', html: '(empty)', class: 'fmt-muted', title: 'an empty string' } : value)
  }
]
