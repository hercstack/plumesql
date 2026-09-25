// @ts-check
// @description A computed column that accumulates a numeric column down the rows
// @color green
/** @type {PlumeSQLExtension} */
export default [
  {
    add: 'running total',
    fn: (value, row, prevRow, ctx) => (Number(ctx.prev) || 0) + (Number(row.amount) || 0)
  }
]
