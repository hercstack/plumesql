// @ts-check
// @description Adds a "name" column joining first_name and last_name, only when both exist
// @color green
/** @type {PlumeSQLExtension} */
export default [
  {
    add: 'name',
    at: { after: { name: 'last_name' } },
    when: (columns) => columns.some((c) => c.name === 'first_name') && columns.some((c) => c.name === 'last_name'),
    fn: (value, row) => `${row.first_name || ''} ${row.last_name || ''}`.trim()
  }
]
