// @ts-check
// @description Every number column shows an up / down arrow and colour vs the row above
// @color cyan
/** @type {PlumeSQLExtension} */
export default [
  {
    // Scalar numbers only: a numeric[] column is an array (Sparklines' kind).
    match: { type: /^(smallint|integer|bigint|numeric|real|double)[^[]*$/ },
    fn: (value, row, prevRow, ctx) => {
      const n = Number(value)
      if (value == null || value === '' || !Number.isFinite(n)) return value
      // The first row has nothing above it: no arrow, but the same
      // alignment as the rows under it.
      if (!prevRow) return { value, align: 'right' }
      // A NULL above is nothing to compare with (Number(null) would be 0).
      const above = prevRow[ctx.column.name]
      const prev = above == null || above === '' ? NaN : Number(above)
      if (!Number.isFinite(prev) || prev === n) return { value, align: 'right' }
      const up = n > prev
      return { value: value + '  ' + (up ? '\u25b2' : '\u25bc'), class: up ? 'fmt-ok' : 'fmt-bad', align: 'right' }
    }
  }
]
