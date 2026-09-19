// @ts-check
// @description Categories as bars from largest to smallest with a cumulative share line and an 80% mark (ECharts, CDN)
// @color cyan
import { loadRows, topOf, colIndex, num, round, keyOf } from '$ext/stats-core/stats-core.plumesql.js'

/** @type {any} */
let chart = null
let csv = ''
const fmtTick = (/** @type {unknown} */ v) => { const n = Number(v); if (!Number.isFinite(n)) return ''; const a = Math.abs(n); const t = (/** @type {number} */ x) => String(Number(x.toFixed(1))); return a >= 1e9 ? t(n / 1e9) + 'G' : a >= 1e6 ? t(n / 1e6) + 'M' : a >= 1e3 ? t(n / 1e3) + 'k' : String(Number(n.toPrecision(4))) }
const note = (/** @type {HTMLElement} */ root, /** @type {string} */ msg) => { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif"></div>'; /** @type {HTMLElement} */ (root.firstChild).textContent = msg }

// Totals per category, largest first, the tail past n folded into Other
// (kept last, whatever its size: it is not a category of its own).
export const paretoOf = (/** @type {Map<string, number>} */ totals, /** @type {number} */ n) => {
  const all = [...totals].map(([name, value]) => ({ name, value })).filter((c) => c.value > 0).sort((a, b) => b.value - a.value)
  const head = all.slice(0, n)
  const rest = all.slice(n)
  if (rest.length) head.push({ name: 'Other (' + rest.length + ')', value: rest.reduce((s, c) => s + c.value, 0) })
  const whole = head.reduce((s, c) => s + c.value, 0)
  let run = 0
  return head.map((c) => { run += c.value; return { ...c, share: whole ? (c.value / whole) * 100 : 0, cumulative: whole ? (run / whole) * 100 : 0 } })
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Pareto',
      scripts: ['https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'],
      inputs: [
        { key: 'category', kind: 'column', label: 'Category' },
        { key: 'value', kind: 'column', label: 'Value', types: ['numeric'], default: '', description: 'Numeric column summed per category; without one, a count of rows' },
        { key: 'n', kind: 'number', label: 'Top categories', default: '30', description: 'How many of the largest categories get a bar of their own; the rest are folded into Other' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
      ],
      actions: [{ label: 'Copy data', run: (ctx) => ctx.copy(csv) }],
      render: async (root, data, ctx) => {
        const echarts = /** @type {any} */ (window).echarts
        if (!echarts) { note(root, 'ECharts did not load. Allow the CDN host in the Log.'); return }
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const ci = colIndex(cols, inputs.category), vi = colIndex(cols, inputs.value)
        if (ci < 0) { note(root, 'Pick the category column (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, topOf(inputs))
        /** @type {Map<string, number>} */
        const totals = new Map()
        for (const r of rows) {
          const v = vi < 0 ? 1 : num(r[vi])
          if (v == null) continue
          const k = keyOf(r[ci])
          totals.set(k, (totals.get(k) || 0) + v)
        }
        const n = Math.max(1, Math.floor(Number(inputs.n) || 30))
        const bars = paretoOf(totals, n)
        const dropped = [...totals.values()].filter((v) => !(v > 0)).length
        if (dropped) ctx.log('Pareto: ' + dropped + ' categories with a zero or negative total left out.')
        if (!bars.length) { note(root, 'No category has a positive total to draw.'); return }
        const valueName = vi < 0 ? 'rows' : cols[vi].name
        csv = 'category,' + valueName + ',share_pct,cumulative_pct\n' + bars.map((b) => '"' + b.name.replace(/"/g, '""') + '",' + b.value + ',' + round(b.share) + ',' + round(b.cumulative)).join('\n')

        const dark = ctx.theme !== 'light'
        const pal = ctx.palette && ctx.palette.id !== 'dark' && ctx.palette.id !== 'light' ? ctx.palette : null // a theme extension's colours; Dark and Light keep the look below
        const fg = pal ? pal.text : dark ? '#c8d3f5' : '#3a3f4b', mut = pal ? pal.muted : dark ? '#8a92a6' : '#6b7280', line = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
        const pane = pal ? pal.background : dark ? '#1f2030' : '#f4f5f8', accent = pal ? pal.accent : dark ? '#7aa2f7' : '#5a8bf0'
        const cumColour = pal ? pal.amber : dark ? '#ff9e64' : '#e07b39', markColour = pal ? pal.red : dark ? '#f7768e' : '#d9485f'

        if (chart) { chart.dispose(); chart = null }
        root.innerHTML = ''
        const el = document.createElement('div')
        el.style.cssText = 'width:100%;height:100%'
        root.appendChild(el)
        chart = echarts.init(el, null, { renderer: 'canvas' })
        chart.setOption({
          backgroundColor: 'transparent',
          title: inputs.title ? { text: inputs.title, left: 12, top: 8, textStyle: { color: fg, fontSize: 13, fontWeight: 600 } } : undefined,
          tooltip: {
            backgroundColor: pane, borderColor: line, textStyle: { color: fg, fontSize: 11 }, trigger: 'axis', axisPointer: { type: 'shadow' },
            formatter: (/** @type {any} */ ps) => {
              const b = bars[Array.isArray(ps) && ps.length ? ps[0].dataIndex : -1]
              return b ? b.name + '<br>' + valueName + ': ' + fmtTick(b.value) + '<br>Share: ' + round(b.share, 1) + '%<br>Cumulative: ' + round(b.cumulative, 1) + '%' : ''
            }
          },
          legend: { top: inputs.title ? 32 : 6, textStyle: { color: mut } },
          grid: { left: 62, right: 56, top: inputs.title ? 66 : 40, bottom: 70 },
          xAxis: { type: 'category', data: bars.map((b) => b.name), axisLine: { lineStyle: { color: line } }, axisTick: { show: false }, axisLabel: { color: mut, rotate: bars.length > 8 ? 40 : 0, hideOverlap: true } },
          yAxis: [
            { type: 'value', name: valueName, nameTextStyle: { color: mut, align: 'left' }, axisLabel: { color: mut, formatter: fmtTick }, splitLine: { lineStyle: { color: line } } },
            { type: 'value', min: 0, max: 100, interval: 20, axisLabel: { color: mut, formatter: '{value}%' }, splitLine: { show: false } }
          ],
          series: [
            { type: 'bar', name: valueName, data: bars.map((b) => b.value), itemStyle: { color: accent }, barMaxWidth: 48 },
            {
              type: 'line', name: 'Cumulative %', yAxisIndex: 1, data: bars.map((b) => round(b.cumulative, 2)), symbolSize: 5,
              itemStyle: { color: cumColour }, lineStyle: { width: 2 },
              markLine: { silent: true, symbol: 'none', lineStyle: { color: markColour, type: 'dashed' }, label: { color: markColour, formatter: '80%', position: 'insideEndTop' }, data: [{ yAxis: 80 }] }
            }
          ]
        })
      }
    }
  ]
}
