// @ts-check
// @description Every number column reads with thousands separators, any type or precision
// @color green
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { type: /^(smallint|integer|bigint|numeric|real|double)/ },
    fn: (value) => {
      const n = Number(value)
      if (!Number.isFinite(n)) return value
      return { value: new Intl.NumberFormat().format(n), align: 'right' }
    }
  }
]
