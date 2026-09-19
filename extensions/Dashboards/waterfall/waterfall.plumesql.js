// @ts-check
// @description Steps up and down from a start to a running total, each category a floating bar (ECharts, CDN)
// @color cyan
import { loadRows, topOf, colIndex, num, round } from '$ext/stats-core/stats-core.plumesql.js'

/** @type {any} */
let chart = null
let csv = ''
const MAX_BARS = 500
const fmtTick = (/** @type {unknown} */ v) => { const n = Number(v); if (!Number.isFinite(n)) return ''; const a = Math.abs(n); const t = (/** @type {number} */ x) => String(Number(x.toFixed(1))); return a >= 1e9 ? t(n / 1e9) + 'G' : a >= 1e6 ? t(n / 1e6) + 'M' : a >= 1e3 ? t(n / 1e3) + 'k' : String(Number(n.toPrecision(4))) }
const signed = (/** @type {number} */ n) => (n > 0 ? '+' : '') + fmtTick(n)
const note = (/** @type {HTMLElement} */ root, /** @type {string} */ msg) => { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif"></div>'; /** @type {HTMLElement} */ (root.firstChild).textContent = msg }

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Waterfall',
      scripts: ['https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'],
      inputs: [
        { key: 'category', kind: 'column', label: 'Category (one bar per row)' },
        { key: 'value', kind: 'column', label: 'Step', types: ['numeric'], description: 'The change each row makes to the running total, up or down' },
        { key: 'total', kind: 'choice', label: 'Total bar', options: ['yes', 'no'], default: 'yes', description: 'A last bar from zero to where the steps end' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
      ],
      actions: [{ label: 'Copy data', run: (ctx) => ctx.copy(csv) }],
      render: async (root, data, ctx) => {
        const echarts = /** @type {any} */ (window).echarts
        if (!echarts) { note(root, 'ECharts did not load. Allow the CDN host in the Log.'); return }
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const ci = colIndex(cols, inputs.category), vi = colIndex(cols, inputs.value)
        if (ci < 0 || vi < 0) { note(root, 'Pick the category and step columns (the sliders button in the header).'); return }
        const all = await loadRows(data, ctx, topOf(inputs))
        const rows = all.slice(0, MAX_BARS)
        if (all.length > MAX_BARS) ctx.log('Waterfall: ' + (all.length - MAX_BARS) + ' rows after the first ' + MAX_BARS + ' left out; fold them in SQL to show them.')
        const dark = ctx.theme !== 'light'
        const pal = ctx.palette && ctx.palette.id !== 'dark' && ctx.palette.id !== 'light' ? ctx.palette : null // a theme extension's colours; Dark and Light keep the look below
        const fg = pal ? pal.text : dark ? '#c8d3f5' : '#3a3f4b', mut = pal ? pal.muted : dark ? '#8a92a6' : '#6b7280', line = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
        const pane = pal ? pal.background : dark ? '#1f2030' : '#f4f5f8', accent = pal ? pal.accent : dark ? '#7aa2f7' : '#5a8bf0'
        const up = pal ? pal.green : dark ? '#9ece6a' : '#2e9e5b', down = pal ? pal.red : dark ? '#f7768e' : '#d9485f'

        /** @type {string[]} */ const names = []
        /** @type {number[]} */ const steps = []
        /** @type {number[]} */ const ends = []
        /** @type {boolean[]} */ const isTotal = []
        let running = 0, skipped = 0
        for (const r of rows) {
          const v = num(r[vi])
          if (v == null) { skipped++; continue }
          names.push(String(r[ci] == null ? 'NULL' : r[ci])); steps.push(v); running += v; ends.push(running); isTotal.push(false)
        }
        if (skipped) ctx.log('Waterfall: ' + skipped + ' rows without a numeric step left out.')
        if (inputs.total !== 'no' && names.length) { names.push('Total'); steps.push(running); ends.push(running); isTotal.push(true) }

        // The invisible base lifts each bar to where the previous one ended.
        // A bar that crosses zero is split into its part above and below, so
        // the stack (positives and negatives kept apart) still draws it whole.
        const base = [], pos = [], neg = []
        for (let i = 0; i < names.length; i++) {
          const start = isTotal[i] ? 0 : ends[i] - steps[i], end = ends[i]
          const lo = Math.min(start, end), hi = Math.max(start, end)
          const colour = isTotal[i] ? accent : steps[i] >= 0 ? up : down
          const b = lo >= 0 ? lo : hi <= 0 ? hi : 0
          const p = lo >= 0 ? hi - lo : hi <= 0 ? 0 : hi
          const n = lo >= 0 ? 0 : hi <= 0 ? lo - hi : lo
          const text = isTotal[i] ? fmtTick(end) : signed(steps[i])
          const rising = isTotal[i] ? end >= 0 : steps[i] >= 0
          const onPos = p !== 0 && (rising || n === 0)
          const label = { show: true, position: rising ? 'top' : 'bottom', color: fg, fontSize: 11, formatter: text }
          base.push(round(b, 6))
          pos.push({ value: round(p, 6), itemStyle: { color: colour }, label: onPos ? label : { show: false } })
          neg.push({ value: round(n, 6), itemStyle: { color: colour }, label: onPos ? { show: false } : label })
        }
        csv = 'category,step,running_total\n' + names.map((n, i) => '"' + n.replace(/"/g, '""') + '",' + (isTotal[i] ? '' : steps[i]) + ',' + ends[i]).join('\n')

        if (chart) { chart.dispose(); chart = null }
        root.innerHTML = ''
        const el = document.createElement('div')
        el.style.cssText = 'width:100%;height:100%'
        root.appendChild(el)
        chart = echarts.init(el, null, { renderer: 'canvas' })
        const title = inputs.title ? { text: inputs.title, left: 12, top: 8, textStyle: { color: fg, fontSize: 13, fontWeight: 600 } } : undefined
        const bar = { type: 'bar', stack: 'wf', barMaxWidth: 48, emphasis: { disabled: true } }
        chart.setOption({
          backgroundColor: 'transparent', title,
          tooltip: {
            backgroundColor: pane, borderColor: line, textStyle: { color: fg, fontSize: 11 }, trigger: 'axis', axisPointer: { type: 'shadow' },
            formatter: (/** @type {any} */ ps) => {
              const i = Array.isArray(ps) && ps.length ? ps[0].dataIndex : -1
              if (i < 0) return ''
              return names[i] + '<br>' + (isTotal[i] ? 'Total: ' + fmtTick(ends[i]) : 'Step: ' + signed(steps[i]) + '<br>Running total: ' + fmtTick(ends[i]))
            }
          },
          grid: { left: 62, right: 24, top: inputs.title ? 56 : 30, bottom: 60 },
          xAxis: { type: 'category', data: names, axisLine: { lineStyle: { color: line } }, axisLabel: { color: mut, rotate: names.length > 12 ? 40 : 0, hideOverlap: true }, axisTick: { show: false } },
          yAxis: { type: 'value', name: cols[vi].name, nameTextStyle: { color: mut, align: 'left' }, axisLabel: { color: mut, formatter: fmtTick }, splitLine: { lineStyle: { color: line } } },
          dataZoom: names.length > 40 ? [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 8, borderColor: line, textStyle: { color: mut } }] : undefined,
          series: [
            { ...bar, name: 'base', data: base, itemStyle: { color: 'transparent', borderColor: 'transparent' }, tooltip: { show: false }, silent: true },
            { ...bar, name: 'up', data: pos },
            { ...bar, name: 'down', data: neg }
          ]
        })
      }
    }
  ]
}
