// @ts-check
// @description Colour scales, data bars, icon sets and highlights on chosen columns, like a spreadsheet's Conditional Formatting
// @color green
import { loadRows, topOf, colIndexes, isNumericCol, num, keyOf, sorted, quantile, tint, escapeHtml, ask } from '$ext/stats-core/stats-core.plumesql.js'

// The grid lists 100,000 rows at most; the thresholds still read every row.
const CAP = 100000
const RIGHT = /** @type {'right'} */ ('right')
const NUMERIC_STYLES = new Set(['color scale', 'data bars', 'icon set', 'top 10', 'bottom 10', 'above average', 'below average'])

// The two ends of a colour scale, low first, as theme tokens.
const SCHEMES = /** @type {Record<string, [string, string]>} */ ({ 'green-red': ['green', 'red'], 'red-green': ['red', 'green'] })

/**
 * One column's formatter: the cell's original value in, a descriptor or the
 * value itself out.
 * @param {string} style
 * @param {unknown[]} values the column over every row read
 * @param {{scheme: string, n: number, numeric: boolean}} o
 * @returns {(v: unknown) => unknown}
 */
const formatter = (style, values, o) => {
  const align = o.numeric ? RIGHT : undefined
  const mark = (/** @type {unknown} */ v) => ({ value: v, style: 'background:' + tint('amber', 35), class: 'fmt-strong', align })
  if (style === 'duplicates') {
    /** @type {Map<string, number>} */
    const seen = new Map()
    for (const v of values) if (v != null && v !== '') { const k = keyOf(v); seen.set(k, (seen.get(k) || 0) + 1) }
    return (v) => (v != null && v !== '' && (seen.get(keyOf(v)) || 0) > 1 ? mark(v) : v)
  }
  /** @type {number[]} */
  const xs = []
  for (const v of values) { const n = num(v); if (n != null) xs.push(n) }
  if (!xs.length) return (v) => v
  const s = sorted(xs)
  const lo = s[0], hi = s[s.length - 1]
  switch (style) {
    case 'color scale': {
      // Diverging around the middle of the range: the ends carry the colour,
      // the middle stays close to the ground, as a three-colour scale reads.
      const ends = SCHEMES[o.scheme]
      return (v) => {
        const n = num(v)
        if (n == null) return v
        const t = hi === lo ? 0.5 : (n - lo) / (hi - lo)
        const bg = ends ? tint(t < 0.5 ? ends[0] : ends[1], 6 + Math.abs(t - 0.5) * 2 * 54) : tint('accent', 6 + t * 54)
        return { value: v, style: 'background:' + bg, align }
      }
    }
    case 'data bars': {
      const scale = Math.max(Math.abs(lo), Math.abs(hi)) || 1
      return (v) => {
        const n = num(v)
        if (n == null) return v
        const w = (Math.abs(n) / scale) * 100
        const bar = '<span style="position:absolute;left:0;top:2px;bottom:2px;border-radius:2px;width:' + w.toFixed(1) + '%;background:' + tint(n < 0 ? 'red' : 'accent', 45) + '"></span>'
        return { value: v, html: '<span style="position:relative;display:block">' + bar + '<span style="position:relative">' + escapeHtml(v) + '</span></span>', align }
      }
    }
    case 'icon set': {
      const q1 = /** @type {number} */ (quantile(s, 1 / 3)), q2 = /** @type {number} */ (quantile(s, 2 / 3))
      return (v) => {
        const n = num(v)
        if (n == null) return v
        const [icon, cls] = n >= q2 ? ['▲', 'fmt-ok'] : n <= q1 ? ['▼', 'fmt-bad'] : ['●', 'fmt-warn']
        return { value: v, html: icon + ' ' + escapeHtml(v), class: cls, align }
      }
    }
    case 'top 10':
    case 'bottom 10': {
      // Ties at the edge are all in, as a spreadsheet's Top 10 counts them.
      const k = Math.min(Math.max(1, o.n), s.length)
      const top = style === 'top 10'
      const edge = top ? s[s.length - k] : s[k - 1]
      return (v) => { const n = num(v); return n != null && (top ? n >= edge : n <= edge) ? mark(v) : v }
    }
    default: {
      let sum = 0
      for (const x of xs) sum += x
      const m = sum / xs.length
      const above = style === 'above average'
      return (v) => { const n = num(v); return n != null && (above ? n > m : n < m) ? mark(v) : v }
    }
  }
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Conditional format',
      inputs: [
        { key: 'columns', kind: 'multi-column', label: 'Columns', description: 'Columns to format; the numeric styles skip a column that is not numeric' },
        { key: 'style', kind: 'choice', label: 'Style', options: ['color scale', 'data bars', 'icon set', 'top 10', 'bottom 10', 'above average', 'below average', 'duplicates'], default: 'color scale', description: 'The rule that paints the cells' },
        { key: 'scheme', kind: 'choice', label: 'Colours', options: ['red-green', 'green-red', 'accent'], default: 'red-green', description: 'For a colour scale: the low end first, then the high end' },
        { key: 'n', kind: 'number', label: 'N', default: '10', description: 'For top 10 and bottom 10: how many values are highlighted' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const style = inputs.style || 'color scale'
        const picked = colIndexes(cols, inputs.columns)
        const numericOnly = NUMERIC_STYLES.has(style)
        const skipped = numericOnly ? picked.filter((i) => !isNumericCol(cols[i])) : []
        const targets = picked.filter((i) => !skipped.includes(i))
        if (skipped.length) ctx.log(style + ' reads numbers; left alone: ' + skipped.map((i) => cols[i].name).join(', '))
        if (!targets.length) return ask('Pick the Columns to format (the sliders button in the header)')
        const rows = await loadRows(data, ctx, topOf(inputs))
        const n = Math.max(1, Math.floor(Number(inputs.n) || 10))
        const fmts = new Map(targets.map((i) => [i, formatter(style, rows.map((r) => r[i]), { scheme: inputs.scheme || 'red-green', n, numeric: isNumericCol(cols[i]) })]))
        if (rows.length > CAP) ctx.log((rows.length - CAP).toLocaleString() + ' rows beyond the first ' + CAP.toLocaleString() + ' were read for the thresholds but not listed.')
        const out = rows.slice(0, CAP).map((r) => r.map((v, i) => { const f = fmts.get(i); return f ? f(v) : v }))
        return { columns: cols.map((c) => ({ name: c.name, type: c.type })), rows: out }
      }
    }
  ]
}
