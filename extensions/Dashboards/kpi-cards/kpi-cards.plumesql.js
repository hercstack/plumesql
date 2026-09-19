// @ts-check
// @description Big-number cards for a dashboard, one per numeric column, with the change against a reference row and a sparkline
// @color cyan
import { loadRows, topOf, colIndexes, isNumericCol, num, fold, round, escapeHtml } from '$ext/stats-core/stats-core.plumesql.js'

let csv = ''
const MAX_CARDS = 8
const SPARK_POINTS = 240

// 1.2k, 3.4M: what fits a card at a glance.
export const compact = (/** @type {number} */ n) => {
  const a = Math.abs(n)
  const t = (/** @type {number} */ x) => String(Number(x.toFixed(1)))
  return a >= 1e12 ? t(n / 1e12) + 'T' : a >= 1e9 ? t(n / 1e9) + 'B' : a >= 1e6 ? t(n / 1e6) + 'M' : a >= 1e3 ? t(n / 1e3) + 'k' : String(Number(n.toPrecision(4)))
}
export const formatValue = (/** @type {number} */ n, /** @type {string} */ format) => {
  switch (format) {
    case 'compact': return compact(n)
    // A fraction reads as a share (0.23 is 23%), anything larger as already a percentage.
    case 'percent': return (Math.abs(n) <= 1 ? n * 100 : n).toLocaleString(undefined, { maximumFractionDigits: 1 }) + '%'
    case 'currency': return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
    default: return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
}

// The card's number from a column, and the value it is compared with.
export const card = (/** @type {(number|null)[]} */ values, /** @type {string} */ agg, /** @type {string} */ compare) => {
  const xs = /** @type {number[]} */ (values.filter((v) => v != null))
  const value = agg === 'count' ? xs.length : !xs.length ? null : agg === 'first' ? xs[0] : agg === 'last' ? xs[xs.length - 1] : /** @type {number|null} */ (fold(agg, xs))
  let ref = null
  if (agg !== 'count' && xs.length > 1) {
    if (compare === 'previous row') ref = agg === 'first' ? xs[1] : xs[xs.length - 2]
    else if (compare === 'first row') ref = agg === 'first' ? null : xs[0]
  }
  const change = value == null || ref == null || ref === 0 ? null : ((value - ref) / Math.abs(ref)) * 100
  return { value, ref, change, series: xs }
}

// Every nth point, the last one always kept, so the line ends where the card's number does.
const sample = (/** @type {number[]} */ xs) => {
  if (xs.length <= SPARK_POINTS) return xs
  const step = xs.length / SPARK_POINTS, out = []
  for (let i = 0; i < SPARK_POINTS - 1; i++) out.push(xs[Math.floor(i * step)])
  out.push(xs[xs.length - 1])
  return out
}
const sparkline = (/** @type {number[]} */ xs, /** @type {string} */ colour) => {
  const pts = sample(xs)
  let lo = Infinity, hi = -Infinity
  for (const x of pts) { if (x < lo) lo = x; if (x > hi) hi = x }
  const span = hi - lo || 1, w = 200, h = 36
  const path = pts.map((x, i) => (i ? 'L' : 'M') + ((i / (pts.length - 1)) * w).toFixed(1) + ' ' + (h - 2 - ((x - lo) / span) * (h - 4)).toFixed(1)).join(' ')
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="width:100%;height:' + h + 'px;display:block;margin-top:10px">' +
    '<path d="' + path + ' L' + w + ' ' + h + ' L0 ' + h + ' Z" fill="' + colour + '" opacity="0.12" stroke="none"/>' +
    '<path d="' + path + '" fill="none" stroke="' + colour + '" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>'
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'KPI cards',
      inputs: [
        { key: 'values', kind: 'multi-column', label: 'Values', types: ['numeric'], description: 'One card per column; blank for every numeric column (up to 8)' },
        { key: 'agg', kind: 'choice', label: 'Card number', options: ['last', 'first', 'sum', 'mean', 'min', 'max', 'count'], default: 'last', description: 'The last or first row\'s value, or a fold over every row' },
        { key: 'compare', kind: 'choice', label: 'Change against', options: ['none', 'previous row', 'first row'], default: 'none', description: 'Shows the change in % from that row\'s value of the same column' },
        { key: 'labels', kind: 'text', label: 'Card titles', default: '', description: 'A comma list replacing the column names, in card order; blank keeps the names' },
        { key: 'format', kind: 'choice', label: 'Number format', options: ['number', 'compact', 'percent', 'currency'], default: 'number' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
      ],
      actions: [{ label: 'Copy data', run: (ctx) => ctx.copy(csv) }],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        let idxs = colIndexes(cols, inputs.values)
        if (!idxs.length) idxs = cols.map((c, i) => (isNumericCol(c) ? i : -1)).filter((i) => i >= 0)
        const dark = ctx.theme !== 'light'
        const pal = ctx.palette && ctx.palette.id !== 'dark' && ctx.palette.id !== 'light' ? ctx.palette : null // a theme extension's colours; Dark and Light keep the look below
        const fg = pal ? pal.text : dark ? '#c8d3f5' : '#3a3f4b', mut = pal ? pal.muted : dark ? '#8a92a6' : '#6b7280'
        const bg = pal ? pal.surface : dark ? '#1a1b26' : '#ffffff', cardBg = pal ? pal.background : dark ? '#1f2030' : '#f4f5f8'
        const border = pal ? pal.border : dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', accent = pal ? pal.accent : dark ? '#7aa2f7' : '#5a8bf0'
        const green = pal ? pal.green : dark ? '#9ece6a' : '#2e9e5b', red = pal ? pal.red : dark ? '#f7768e' : '#d9485f'
        root.style.cssText = 'margin:0;height:100%;overflow:auto;background:' + bg + ';color:' + fg + ';font:13px system-ui,-apple-system,sans-serif'
        if (!idxs.length) { root.innerHTML = '<div style="padding:16px;color:' + mut + '">No numeric column to show. Pick the value columns (the sliders button in the header).</div>'; return }
        if (idxs.length > MAX_CARDS) { ctx.log('KPI cards: ' + (idxs.length - MAX_CARDS) + ' columns after the first ' + MAX_CARDS + ' left out.'); idxs = idxs.slice(0, MAX_CARDS) }
        const agg = inputs.agg || 'last', compare = inputs.compare || 'none', format = inputs.format || 'number'
        const rows = await loadRows(data, ctx, topOf(inputs))
        const titles = String(inputs.labels || '').split(',').map((s) => s.trim())
        const cards = idxs.map((ci, k) => ({ title: titles[k] || cols[ci].name, ...card(rows.map((r) => num(r[ci])), agg, compare) }))
        csv = 'card,' + agg + ',reference,change_pct\n' + cards.map((c) => '"' + c.title.replace(/"/g, '""') + '",' + (c.value ?? '') + ',' + (c.ref ?? '') + ',' + (c.change == null ? '' : round(c.change))).join('\n')

        const caption = agg === 'count' ? 'non-null of ' + rows.length.toLocaleString() + ' rows' : agg + ' of ' + rows.length.toLocaleString() + ' rows'
        let html = inputs.title ? '<div style="padding:14px 16px 0;font-weight:600">' + escapeHtml(inputs.title) + '</div>' : ''
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;padding:14px 16px">'
        for (const c of cards) {
          const shown = c.value == null ? 'n/a' : agg === 'count' ? c.value.toLocaleString() : formatValue(c.value, format)
          let delta = ''
          if (compare !== 'none') {
            if (c.change == null) delta = '<span style="color:' + mut + '">no change to show</span>'
            else {
              const colour = c.change > 0 ? green : c.change < 0 ? red : mut
              const arrow = c.change > 0 ? '▲' : c.change < 0 ? '▼' : '='
              delta = '<span style="color:' + colour + ';font-weight:600">' + arrow + ' ' + Math.abs(round(c.change, 1) || 0) + '%</span> <span style="color:' + mut + '">vs ' + escapeHtml(compare) + ' (' + escapeHtml(formatValue(/** @type {number} */ (c.ref), format)) + ')</span>'
            }
          }
          html += '<div style="background:' + cardBg + ';border:1px solid ' + border + ';border-radius:10px;padding:14px 16px;min-width:0">' +
            '<div style="color:' + mut + ';font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + escapeHtml(c.title) + '">' + escapeHtml(c.title) + '</div>' +
            '<div style="font-size:32px;font-weight:600;line-height:1.2;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums" title="' + escapeHtml(c.value ?? '') + '">' + escapeHtml(shown) + '</div>' +
            '<div style="font-size:12px;margin-top:4px;min-height:16px">' + (delta || '<span style="color:' + mut + '">' + escapeHtml(caption) + '</span>') + '</div>' +
            (c.series.length >= 3 ? sparkline(c.series, accent) : '') +
            '</div>'
        }
        root.innerHTML = html + '</div>'
      }
    }
  ]
}
