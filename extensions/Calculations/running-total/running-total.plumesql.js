// @ts-check
// @description A computed column that accumulates a numeric column down the rows
// @color green
/** @type {PlumeSQLExtension} */
export default [
  {
    add: 'running total',
    // Summed in binary floating point, 0.1 + 0.2 reads 0.30000000000000004:
    // the total keeps as many decimals as the values it adds, no more.
    fn: (value, row, prevRow, ctx) => {
      const places = (v) => (String(v ?? '').split('.')[1] || '').length
      const total = (Number(ctx.prev) || 0) + (Number(row.amount) || 0)
      return Number(total.toFixed(Math.min(12, Math.max(places(row.amount), places(ctx.prev)))))
    }
  }
]
