// @ts-check
// @description One number on a dial, with an optional target and green, amber and red bands (ECharts, CDN)
// @color cyan
import { loadRows, topOf, colIndex, num, fold, round } from '$ext/stats-core/stats-core.plumesql.js'

/** @type {any} */
let chart = null
let csv = ''
const fmtNum = (/** @type {number} */ n) => { const a = Math.abs(n); const t = (/** @type {number} */ x) => String(Number(x.toFixed(2))); return a >= 1e9 ? t(n / 1e9) + 'G' : a >= 1e6 ? t(n / 1e6) + 'M' : a >= 1e5 ? t(n / 1e3) + 'k' : String(Number(n.toPrecision(6))) }
const note = (/** @type {HTMLElement} */ root, /** @type {string} */ msg) => { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif"></div>'; /** @type {HTMLElement} */ (root.firstChild).textContent = msg }
const numOr = (/** @type {unknown} */ s) => (s == null || String(s).trim() === '' ? null : num(String(s).trim()))

// The first 1, 2, 2.5 or 5 times a power of ten at or above the span, so the
// dial ends on a number a person would pick.
export const niceMax = (/** @type {number} */ min, /** @type {number} */ top) => {
  const span = top - min
  if (!(span > 0)) return min + 1
  const p = Math.pow(10, Math.floor(Math.log10(span)))
  const m = span / p
  const step = [1, 2, 2.5, 5, 10].find((s) => s >= m - 1e-9) || 10
  return min + step * p
}

// One number from a column: the first or last row's value, or a fold.
export const pick = (/** @type {(number|null)[]} */ values, /** @type {string} */ agg) => {
  const xs = values.filter((v) => v != null)
  if (!xs.length) return null
  if (agg === 'first') return xs[0]
  if (agg === 'last') return xs[xs.length - 1]
  return /** @type {number|null} */ (fold(agg, xs))
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Gauge',
      scripts: ['https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'],
      inputs: [
        { key: 'value', kind: 'column', label: 'Value', types: ['numeric'] },
        { key: 'agg', kind: 'choice', label: 'Which number', options: ['last', 'first', 'sum', 'mean', 'min', 'max'], default: 'last', description: 'The last or first row\'s value, or a fold over every row' },
        { key: 'min', kind: 'number', label: 'Dial start', default: '0' },
        { key: 'max', kind: 'number', label: 'Dial end', default: '', description: 'Blank picks a round number above the value' },
        { key: 'target', kind: 'number', label: 'Target', default: '', description: 'A marker on the dial; blank for none' },
        { key: 'thresholds', kind: 'text', label: 'Band limits', default: '', description: 'One or two values splitting the dial into coloured bands, like 60,85; blank for a plain dial' },
        { key: 'good', kind: 'choice', label: 'Good is', options: ['high', 'low'], default: 'high', description: 'Which end of the dial is green' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
      ],
      actions: [{ label: 'Copy data', run: (ctx) => ctx.copy(csv) }],
      render: async (root, data, ctx) => {
        const echarts = /** @type {any} */ (window).echarts
        if (!echarts) { note(root, 'ECharts did not load. Allow the CDN host in the Log.'); return }
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const vi = colIndex(cols, inputs.value)
        if (vi < 0) { note(root, 'Pick the value column (the sliders button in the header).'); return }
        const agg = inputs.agg || 'last'
        // first and last need only the rows at hand; a fold reads them all.
        const rows = agg === 'first' ? (data.rows || []) : await loadRows(data, ctx, topOf(inputs))
        const value = pick(rows.map((r) => num(r[vi])), agg)
        if (value == null) { note(root, 'The column has no numeric value to show.'); return }
        const min = numOr(inputs.min) ?? 0
        const target = numOr(inputs.target)
        let max = numOr(inputs.max)
        if (max == null || max <= min) max = niceMax(min, Math.max(value, target ?? value, min + 1e-9))
        const limits = String(inputs.thresholds || '').split(',').map(numOr).filter((x) => x != null && x > min && x < /** @type {number} */ (max)).map(Number).sort((a, b) => a - b).slice(0, 2)
        csv = 'column,' + agg + ',min,max,target\n"' + cols[vi].name.replace(/"/g, '""') + '",' + value + ',' + min + ',' + max + ',' + (target ?? '')

        const dark = ctx.theme !== 'light'
        const pal = ctx.palette && ctx.palette.id !== 'dark' && ctx.palette.id !== 'light' ? ctx.palette : null // a theme extension's colours; Dark and Light keep the look below
        const fg = pal ? pal.text : dark ? '#c8d3f5' : '#3a3f4b', mut = pal ? pal.muted : dark ? '#8a92a6' : '#6b7280'
        const track = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', accent = pal ? pal.accent : dark ? '#7aa2f7' : '#5a8bf0'
        const green = pal ? pal.green : dark ? '#9ece6a' : '#2e9e5b', amber = pal ? pal.amber : dark ? '#e0af68' : '#c98a1a', red = pal ? pal.red : dark ? '#f7768e' : '#d9485f'
        const span = /** @type {number} */ (max) - min
        const frac = (/** @type {number} */ x) => Math.max(0, Math.min(1, (x - min) / span))
        const bandColours = limits.length === 2 ? [green, amber, red] : [green, red]
        if (inputs.good !== 'low') bandColours.reverse()
        const arc = limits.length ? [...limits.map((l, i) => [frac(l), bandColours[i]]), [1, bandColours[limits.length]]] : [[1, track]]
        const inBand = limits.length ? bandColours[limits.filter((l) => value >= l).length] : accent

        if (chart) { chart.dispose(); chart = null }
        root.innerHTML = ''
        const el = document.createElement('div')
        el.style.cssText = 'width:100%;height:100%'
        root.appendChild(el)
        chart = echarts.init(el, null, { renderer: 'canvas' })
        const dial = { type: 'gauge', min, max, startAngle: 215, endAngle: -35, radius: '82%', center: ['50%', inputs.title ? '60%' : '56%'] }
        const series = [{
          ...dial, name: cols[vi].name,
          progress: { show: !limits.length, width: 18, itemStyle: { color: accent } },
          axisLine: { lineStyle: { width: 18, color: arc } },
          axisTick: { distance: -26, length: 5, lineStyle: { color: mut, width: 1 } },
          splitLine: { distance: -30, length: 10, lineStyle: { color: mut, width: 1.5 } },
          axisLabel: { distance: 8, color: mut, fontSize: 11, formatter: (/** @type {number} */ v) => fmtNum(v) },
          pointer: { show: limits.length > 0, length: '62%', width: 5, itemStyle: { color: fg } },
          anchor: { show: limits.length > 0, size: 12, itemStyle: { color: fg } },
          title: { show: true, offsetCenter: [0, '72%'], color: mut, fontSize: 12 },
          detail: { valueAnimation: true, offsetCenter: [0, '38%'], fontSize: 40, fontWeight: 600, color: inBand, formatter: () => fmtNum(value) },
          data: [{ value: round(value, 6), name: agg + ' of ' + cols[vi].name }]
        }]
        if (target != null) {
          // A second dial with nothing but a short needle at the arc: the target mark.
          series.push(/** @type {any} */ ({
            ...dial, name: 'target', silent: true,
            axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, progress: { show: false }, anchor: { show: false },
            pointer: { show: true, icon: 'rect', length: '16%', width: 4, offsetCenter: [0, '-84%'], itemStyle: { color: fg } },
            title: { show: true, offsetCenter: [0, '86%'], color: mut, fontSize: 11 },
            detail: { show: false },
            data: [{ value: target, name: 'target ' + fmtNum(target) }]
          }))
        }
        chart.setOption({
          backgroundColor: 'transparent',
          title: inputs.title ? { text: inputs.title, left: 12, top: 8, textStyle: { color: fg, fontSize: 13, fontWeight: 600 } } : undefined,
          series
        })
      }
    }
  ]
}
