// @ts-check
// @description A Gantt timeline: every row a bar from its start to its end on a lane, coloured by a category; zoom in time, scroll lanes (ECharts)
// @color cyan
import { echartsOf, themeOf, mount, note, NO_ECHARTS, titleOf, tooltipOf, axisOf, legendOf, sliderOf, csvOf, esc } from '$ext/echarts-core/echarts-core.plumesql.js'
import { loadRows, topOf, colIndex, keyOf, parseTime } from '$ext/stats-core/stats-core.plumesql.js'

const MAX_CATS = 12, LANES_SHOWN = 30
/** @type {any} */
let chart = null
let csv = ''

// A span read short: 45 s, 12 min, 3.5 h, 4 days.
const span = (/** @type {number} */ ms) => {
  const s = ms / 1000
  return s < 90 ? Math.round(s) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : s < 172800 ? (s / 3600).toFixed(1) + ' h' : (s / 86400).toFixed(1) + ' days'
}
const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
// A moment as SQL reads it, in the same clock the server's text was in.
const stamp = (/** @type {number} */ t) => { const d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) }

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Timeline',
      scripts: ['https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'],
      inputs: [
        { key: 'label', kind: 'column', label: 'Lane', description: 'What a bar belongs to (a task, a job, a backend): one lane per distinct value, in the order the rows come' },
        { key: 'start', kind: 'column', label: 'Start', types: ['temporal'], description: 'When a bar begins' },
        { key: 'end', kind: 'column', label: 'End', types: ['temporal'], default: '', description: 'When it ends; a row with no end (still running, or an event) is a mark at its start' },
        { key: 'group', kind: 'column', label: 'Colour by', default: '', description: 'A category: each of the twelve most frequent values a colour, toggled from the legend' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '20000', description: 'How many rows the view reads from the result, from the first one' }
      ],
      actions: [{ label: 'Copy data', run: (ctx) => ctx.copy(csv) }],
      render: async (root, data, ctx) => {
        const echarts = echartsOf()
        if (!echarts) { note(root, NO_ECHARTS); return }
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const li = colIndex(cols, inputs.label), si = colIndex(cols, inputs.start), ei = colIndex(cols, inputs.end), gi = colIndex(cols, inputs.group)
        if (li < 0 || si < 0) { note(root, 'Pick the Lane and Start columns, and End for bars (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, topOf({ top: inputs.top || 20000 }))

        /** @type {string[]} */
        const lanes = []
        /** @type {Map<string, number>} */
        const laneOf = new Map()
        /** @type {Map<string, number>} */
        const freq = new Map()
        /** @type {{ lane: number, s: number, e: number, open: boolean, group: string, row: number }[]} */
        const bars = []
        let bad = 0
        rows.forEach((r, i) => {
          const s = parseTime(r[si])
          if (s == null) { bad++; return }
          const e0 = ei >= 0 ? parseTime(r[ei]) : null
          const k = keyOf(r[li])
          let lane = laneOf.get(k)
          if (lane === undefined) { lane = lanes.length; lanes.push(k); laneOf.set(k, lane) }
          const group = gi >= 0 ? keyOf(r[gi]) : ''
          if (gi >= 0) freq.set(group, (freq.get(group) || 0) + 1)
          bars.push({ lane, s, e: e0 != null && e0 >= s ? e0 : s, open: e0 == null, group, row: i })
        })
        if (bad) ctx.log(`Timeline: ${bad} rows with no readable ${cols[si].name} left out.`)
        if (!bars.length) { note(root, 'No row has a readable start.'); return }
        const cats = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CATS).map(([k]) => k)
        const th = themeOf(ctx)
        const colorOf = (/** @type {string} */ g) => { const c = cats.indexOf(g); return c < 0 ? th.muted : th.colors[c % th.colors.length] }
        csv = csvOf([cols[li].name, cols[si].name, ...(ei >= 0 ? [cols[ei].name] : []), ...(gi >= 0 ? [cols[gi].name] : [])],
          bars.map((b) => [lanes[b.lane], stamp(b.s), ...(ei >= 0 ? [b.open ? '' : stamp(b.e)] : []), ...(gi >= 0 ? [b.group] : [])]))

        // One series per colour, so the legend toggles a category; the bars
        // are drawn by hand (ECharts has no Gantt series), clipped to the plot.
        const seriesOf = (/** @type {string} */ name, /** @type {typeof bars} */ list, /** @type {string} */ color) => ({
          type: 'custom', name, encode: { x: [1, 2], y: 0 }, itemStyle: { color, opacity: 0.9 },
          renderItem: (/** @type {any} */ params, /** @type {any} */ api) => {
            const lane = api.value(0)
            const a = api.coord([api.value(1), lane]), b = api.coord([api.value(2), lane])
            const h = Math.max(4, api.size([0, 1])[1] * 0.62)
            const open = api.value(3) === 1
            const w = Math.max(open ? 3 : 2, b[0] - a[0])
            const rect = echarts.graphic.clipRectByRect({ x: a[0], y: a[1] - h / 2, width: w, height: h }, { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height })
            return rect && { type: 'rect', transition: ['shape'], shape: { ...rect, r: Math.min(3, h / 4) }, style: api.style() }
          },
          data: list.map((b) => ({ value: [b.lane, b.s, b.e, b.open ? 1 : 0, b.row] }))
        })
        const series = gi >= 0
          ? [...cats.map((c) => seriesOf(c, bars.filter((b) => b.group === c), colorOf(c))), ...(freq.size > MAX_CATS ? [seriesOf('other', bars.filter((b) => !cats.includes(b.group)), th.muted)] : [])]
          : [seriesOf(cols[li].name, bars, th.accent)]
        const many = lanes.length > LANES_SHOWN
        const labelW = Math.min(220, 16 + 6.5 * lanes.slice(0, 200).reduce((m, l) => Math.max(m, l.length), 0))
        chart = mount(root, chart)
        chart.setOption({
          backgroundColor: 'transparent',
          useUTC: true,
          title: titleOf(th, inputs.title),
          legend: gi >= 0 ? legendOf(th, { top: inputs.title ? 34 : 8, left: labelW, right: 16 }) : undefined,
          tooltip: tooltipOf(th, {
            formatter: (/** @type {any} */ p) => {
              const [lane, s, e, open] = p.value
              return '<b>' + esc(lanes[lane]) + '</b>' + (gi >= 0 ? ' <span style="opacity:.7">' + esc(p.seriesName) + '</span>' : '') +
                '<br>' + stamp(s) + (open ? (ei >= 0 ? ', no end' : '') : '<br>' + stamp(e) + '<br>' + span(e - s))
            }
          }),
          grid: { left: labelW, right: many ? 40 : 20, top: (inputs.title ? 34 : 8) + (gi >= 0 ? 28 : 6), bottom: 56 },
          xAxis: axisOf(th, { type: 'time', splitLine: { show: true, lineStyle: { color: th.grid } } }),
          yAxis: axisOf(th, { type: 'category', data: lanes, inverse: true, axisLabel: { color: th.muted, fontSize: 11, width: labelW - 14, overflow: 'truncate' }, splitLine: { show: false } }),
          dataZoom: [
            sliderOf(th, { xAxisIndex: 0, filterMode: 'weakFilter' }),
            // With many lanes the wheel scrolls them and a pinch (or Ctrl and the
            // wheel) zooms time; with few, the wheel zooms time.
            { type: 'inside', xAxisIndex: 0, filterMode: 'weakFilter', zoomOnMouseWheel: many ? 'ctrl' : true },
            ...(many ? [sliderOf(th, { yAxisIndex: 0, orient: 'vertical', right: 8, top: 40, bottom: 56, width: 14, height: undefined, startValue: 0, endValue: LANES_SHOWN - 1, zoomLock: true, showDetail: false, filterMode: 'weakFilter' }), { type: 'inside', yAxisIndex: 0, zoomOnMouseWheel: false, moveOnMouseWheel: true, moveOnMouseMove: false, filterMode: 'weakFilter' }] : [])
          ],
          series
        })
      },
      resize: (root, size) => {
        if (!chart) throw new Error('no chart to resize')
        chart.resize(size)
      }
    }
  ]
}
