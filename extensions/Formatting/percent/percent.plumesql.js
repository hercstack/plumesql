// @ts-check
// @description A numeric column named *_pct / percent / ratio / rate / share reads as a percentage with a small bar
// @color green
// A *_pct, percent or percentage column already holds percent (0.4 is
// 0.4 %, never 40 %); a ratio, rate or share holds a fraction when it is
// within -1 to 1 (0.25 is 25 %).
const ALREADY = /(pct|percent|percentage)$/i
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { name: /(pct|percent|percentage|ratio|rate|share)$/i, type: /^(smallint|integer|bigint|numeric|decimal|real|double)/ },
    fn: (value, row, prevRow, ctx) => {
      const n = Number(value)
      if (value == null || value === '' || !Number.isFinite(n)) return value
      const pct = ALREADY.test(ctx.column.name) || Math.abs(n) > 1 ? n : n * 100
      const width = Math.max(0, Math.min(100, Math.abs(pct)))
      const text = pct.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' %'
      // The number first, the bar after it: a column narrower than both
      // cuts the bar, never the number. Theme colours, so every theme
      // paints it.
      const bar = '<span style="display:inline-block;width:36px;height:6px;border-radius:3px;background:color-mix(in srgb, var(--accent) 20%, transparent);vertical-align:middle;margin-left:6px"><span style="display:block;height:100%;width:' + width.toFixed(1) + '%;border-radius:3px;background:var(--accent)"></span></span>'
      // `value` is what the cell reads for Find and for a double-click fit;
      // copy and export keep the server's own number.
      return { value: text, html: text + bar, align: 'right', title: String(value) }
    }
  }
]
