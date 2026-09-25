// @ts-check
// @description Every number column shows an up / down arrow and colour vs the row above
// @color cyan
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { type: /^(smallint|integer|bigint|numeric|real|double)/ },
    fn: (value, row, prevRow, ctx) => {
      const n = Number(value)
      if (!Number.isFinite(n) || !prevRow) return value
      const prev = Number(prevRow[ctx.column.name])
      if (!Number.isFinite(prev) || prev === n) return { value, align: 'right' }
      const up = n > prev
      return { value: value + '  ' + (up ? '\u25b2' : '\u25bc'), class: up ? 'fmt-ok' : 'fmt-bad', align: 'right' }
    }
  }
]
