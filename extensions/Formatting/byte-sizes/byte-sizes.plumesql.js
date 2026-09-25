// @ts-check
// @description A numeric column named *size or *bytes reads as KB, MB, GB
// @color green
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { name: /(size|bytes)$/i, type: /^(smallint|integer|bigint|numeric|real|double)/ },
    fn: (value) => {
      let n = Number(value)
      if (!Number.isFinite(n)) return value
      const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
      let u = 0
      while (n >= 1024 && u < units.length - 1) { n /= 1024; u++ }
      const text = (u === 0 ? n : n.toFixed(1)) + ' ' + units[u]
      return { value: text, align: 'right' }
    }
  }
]
