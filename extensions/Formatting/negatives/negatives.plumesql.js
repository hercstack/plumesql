// @ts-check
// @description Every number column reads right aligned, a negative value in red
// @color red
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { type: /^(smallint|integer|bigint|numeric|decimal|real|double)/ },
    fn: (value) => {
      const n = Number(value)
      if (value == null || !Number.isFinite(n)) return value
      return n < 0 ? { value, class: 'fmt-bad', align: 'right' } : { value, align: 'right' }
    }
  }
]
