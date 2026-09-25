// @ts-check
// @description Adds a leading computed column that numbers the rows
// @color green
/** @type {PlumeSQLExtension} */
export default [
  {
    add: '#',
    at: 'start',
    fn: (value, row, prevRow, ctx) => ctx.i + 1
  }
]
