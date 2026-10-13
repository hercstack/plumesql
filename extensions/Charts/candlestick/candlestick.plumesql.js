// @ts-check
// @description Open, high, low and close as candles over time, with moving averages and volume bars; zoom with the slider (ECharts)
// @color cyan
import { echartsOf, themeOf, mount, note, NO_ECHARTS, titleOf, tooltipOf, axisOf, legendOf, sliderOf, fmtNum, csvOf, esc } from '$ext/echarts-core/echarts-core.plumesql.js'
import { loadRows, topOf, colIndex, num, parseTime } from '$ext/stats-core/stats-core.plumesql.js'

/** @type {any} */
let chart = null
let csv = ''
const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
const dayText = (/** @type {number} */ t, /** @type {boolean} */ withTime) => { const d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + (withTime ? ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) : '') }

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Candlestick',
      scripts: ['https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'],
      inputs: [
        { key: 'x', kind: 'column', label: 'Time', description: 'The period a candle is: a date, a timestamp, or any label in order' },
        { key: 'open', kind: 'column', label: 'Open', types: ['numeric'] },
        { key: 'high', kind: 'column', label: 'High', types: ['numeric'] },
        { key: 'low', kind: 'column', label: 'Low', types: ['numeric'] },
        { key: 'close', kind: 'column', label: 'Close', types: ['numeric'] },
        { key: 'volume', kind: 'column', label: 'Volume', types: ['numeric'], default: '', description: 'Bars under the candles, coloured like the candle of their period; none leaves the room to the price' },
        { key: 'averages', kind: 'text', label: 'Moving averages', default: '5, 20', description: 'Periods of the moving averages of the close, as a comma list; blank for none' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '100000', description: 'How many rows the view reads from the result, from the first one' }
      ],
      actions: [{ label: 'Copy data', run: (ctx) => ctx.copy(csv) }],
      render: async (root, data, ctx) => {
        if (!echartsOf()) { note(root, NO_ECHARTS); return }
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const xi = colIndex(cols, inputs.x), oi = colIndex(cols, inputs.open), hi = colIndex(cols, inputs.high), lo = colIndex(cols, inputs.low), ci = colIndex(cols, inputs.close), vi = colIndex(cols, inputs.volume)
        if (xi < 0 || oi < 0 || hi < 0 || lo < 0 || ci < 0) { note(root, 'Pick the Time, Open, High, Low and Close columns (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, topOf({ top: inputs.top || 100000 }))
        const temporal = /date|timestamp/i.test(cols[xi].type || '')

        // Candles in time order; a row missing any of the four prices is
        // left out rather than drawn as a zero.
        /** @type {{ t: number | null, label: string, o: number, h: number, l: number, c: number, v: number | null }[]} */
        const candles = []
        let bad = 0
        for (const r of rows) {
          const o = num(r[oi]), h = num(r[hi]), l = num(r[lo]), c = num(r[ci])
          if (o == null || h == null || l == null || c == null) { bad++; continue }
          const t = temporal ? parseTime(r[xi]) : null
          candles.push({ t, label: r[xi] == null ? '' : String(r[xi]), o, h, l, c, v: vi >= 0 ? num(r[vi]) : null })
        }
        if (bad) ctx.log(`Candlestick: ${bad} rows missing a price left out.`)
        if (!candles.length) { note(root, 'No row has all four prices.'); return }
        if (temporal) candles.sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
        const withTime = temporal && candles.some((k) => k.t != null && k.t % 86400000 !== 0)
        const labels = candles.map((k) => (temporal && k.t != null ? dayText(k.t, withTime) : k.label))
        const periods = String(inputs.averages ?? '5, 20').split(',').map((s) => Math.round(Number(s.trim()))).filter((n) => n > 1 && n < candles.length)
        const ma = (/** @type {number} */ n) => candles.map((_, i) => {
          if (i < n - 1) return '-'
          let s = 0
          for (let j = i - n + 1; j <= i; j++) s += candles[j].c
          return Number((s / n).toPrecision(8))
        })
        csv = csvOf([cols[xi].name, 'open', 'high', 'low', 'close', ...(vi >= 0 ? ['volume'] : [])], candles.map((k, i) => [labels[i], k.o, k.h, k.l, k.c, ...(vi >= 0 ? [k.v] : [])]))

        const th = themeOf(ctx)
        const vol = vi >= 0
        const top = (inputs.title ? 34 : 8) + 28
        const start = Math.max(0, 100 - Math.min(100, (120 / candles.length) * 100))
        chart = mount(root, chart)
        chart.setOption({
          backgroundColor: 'transparent',
          animation: candles.length < 2000,
          title: titleOf(th, inputs.title),
          legend: legendOf(th, { top: inputs.title ? 34 : 8, left: 64, data: ['price', ...periods.map((p) => 'MA ' + p)] }),
          color: [th.accent, ...th.colors.slice(3)],
          tooltip: tooltipOf(th, {
            trigger: 'axis', axisPointer: { type: 'cross', lineStyle: { color: th.muted }, crossStyle: { color: th.muted }, label: { backgroundColor: th.pane, color: th.fg } },
            formatter: (/** @type {any[]} */ ps) => {
              const i = ps[0].dataIndex, k = candles[i]
              const ch = k.c - k.o
              return '<b>' + esc(labels[i]) + '</b><br>open ' + fmtNum(k.o) + '<br>high ' + fmtNum(k.h) + '<br>low ' + fmtNum(k.l) + '<br>close ' + fmtNum(k.c) +
                ' <span style="color:' + (ch >= 0 ? th.up : th.down) + '">' + (ch >= 0 ? '+' : '') + fmtNum(ch) + ' (' + ((ch / k.o) * 100).toFixed(2) + '%)</span>' +
                (vol && k.v != null ? '<br>volume ' + fmtNum(k.v) : '') +
                ps.filter((p) => p.seriesName.startsWith('MA ') && p.value !== '-').map((p) => '<br>' + esc(p.seriesName) + ' ' + fmtNum(p.value)).join('')
            }
          }),
          axisPointer: { link: [{ xAxisIndex: 'all' }] },
          grid: vol ? [{ left: 64, right: 24, top, height: '58%' }, { left: 64, right: 24, top: '76%', bottom: 44 }] : [{ left: 64, right: 24, top, bottom: 44 }],
          xAxis: [
            axisOf(th, { type: 'category', data: labels, boundaryGap: true, axisLine: { onZero: false, lineStyle: { color: th.line } }, splitLine: { show: false }, axisLabel: { show: !vol, color: th.muted, fontSize: 11 } }),
            ...(vol ? [axisOf(th, { type: 'category', gridIndex: 1, data: labels, boundaryGap: true, axisLabel: { color: th.muted, fontSize: 11 }, splitLine: { show: false } })] : [])
          ],
          yAxis: [
            axisOf(th, { scale: true, axisLabel: { color: th.muted, fontSize: 11, formatter: fmtNum } }),
            ...(vol ? [axisOf(th, { scale: true, gridIndex: 1, splitNumber: 2, axisLabel: { color: th.muted, fontSize: 10, formatter: fmtNum } })] : [])
          ],
          dataZoom: [
            { type: 'inside', xAxisIndex: vol ? [0, 1] : [0], start, end: 100 },
            sliderOf(th, { xAxisIndex: vol ? [0, 1] : [0], start, end: 100 })
          ],
          series: [
            {
              name: 'price', type: 'candlestick',
              data: candles.map((k) => [k.o, k.c, k.l, k.h]),
              itemStyle: { color: th.up, color0: th.down, borderColor: th.up, borderColor0: th.down }
            },
            ...periods.map((p) => ({ name: 'MA ' + p, type: 'line', data: ma(p), smooth: true, showSymbol: false, lineStyle: { width: 1.2, opacity: 0.85 } })),
            ...(vol ? [{
              name: 'volume', type: 'bar', xAxisIndex: 1, yAxisIndex: 1,
              data: candles.map((k) => ({ value: k.v, itemStyle: { color: k.c >= k.o ? th.up : th.down, opacity: 0.6 } }))
            }] : [])
          ]
        })
      },
      resize: (root, size) => {
        if (!chart) throw new Error('no chart to resize')
        chart.resize(size)
      }
    }
  ]
}
