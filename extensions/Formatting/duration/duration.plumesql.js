// @ts-check
// @description A numeric column named *_ms / *_time / duration / elapsed / latency reads as 1.2 s, 4m 12s, 2h 05m
// @color green
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { name: /(_ms|_time|duration|elapsed|latency)$/i, type: /^(smallint|integer|bigint|numeric|decimal|real|double)/ },
    fn: (value) => {
      const ms = Number(value)
      if (value == null || !Number.isFinite(ms)) return value
      const abs = Math.abs(ms), sign = ms < 0 ? '-' : ''
      const pad = (n) => String(n).padStart(2, '0')
      let text
      if (abs < 1000) text = abs.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' ms'
      else if (abs < 60000) text = (abs / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' s'
      else if (abs < 3600000) text = Math.floor(abs / 60000) + 'm ' + pad(Math.round((abs % 60000) / 1000)) + 's'
      else if (abs < 86400000) text = Math.floor(abs / 3600000) + 'h ' + pad(Math.round((abs % 3600000) / 60000)) + 'm'
      else text = Math.floor(abs / 86400000) + 'd ' + Math.round((abs % 86400000) / 3600000) + 'h'
      return { value: sign + text, align: 'right', title: String(value) + ' ms' }
    }
  }
]
