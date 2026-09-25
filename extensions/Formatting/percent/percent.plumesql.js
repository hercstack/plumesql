// @ts-check
// @description A numeric column named *_pct / percent / ratio / rate / share reads as a percentage with a small bar
// @color green
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { name: /(pct|percent|percentage|ratio|rate|share)$/i, type: /^(smallint|integer|bigint|numeric|decimal|real|double)/ },
    fn: (value) => {
      const n = Number(value)
      if (value == null || !Number.isFinite(n)) return value
      const pct = Math.abs(n) <= 1 ? n * 100 : n
      const width = Math.max(0, Math.min(100, Math.abs(pct)))
      const text = pct.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' %'
      const bar = '<span style=\"display:inline-block;width:44px;height:6px;border-radius:3px;background:rgba(122,162,247,0.18);vertical-align:middle;margin-right:6px\"><span style=\"display:block;height:100%;width:' + width.toFixed(1) + '%;border-radius:3px;background:#7aa2f7\"></span></span>'
      return { value, html: bar + text, align: 'right', title: String(value) }
    }
  }
]
