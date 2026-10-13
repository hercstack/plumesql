// @ts-check
// @description Many columns side by side, every row a line across them, coloured by a number or a category; drag an axis to filter (ECharts)
// @color cyan
import { echartsOf, themeOf, mount, note, NO_ECHARTS, titleOf, tooltipOf, legendOf, fmtNum, csvOf, esc } from '$ext/echarts-core/echarts-core.plumesql.js'
import { loadRows, topOf, colIndex, colIndexes, num, keyOf, isNumericCol } from '$ext/stats-core/stats-core.plumesql.js'

const MAX_CATS = 10
/** @type {any} */
let chart = null
let csv = ''

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Parallel',
      scripts: ['https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'],
      inputs: [
        { key: 'series', kind: 'multi-column', label: 'Axes', description: 'The columns side by side, in order: numbers get a scale, text gets its values in order' },
        { key: 'color', kind: 'column', label: 'Colour by', default: '', description: 'A number (along the ramp below) or a category (a colour each, toggled from the legend); none draws every line alike' },
        { key: 'ramp', kind: 'choice', label: 'Colour ramp', options: ['ramp', 'alarm'], default: 'ramp', description: 'For a number: ramp runs blue, amber, red from low to high; alarm runs green, amber, red' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '5000', description: 'How many rows the view reads from the result, from the first one; past a few thousand the lines become a haze' }
      ],
      actions: [{ label: 'Copy data', run: (ctx) => ctx.copy(csv) }],
      render: async (root, data, ctx) => {
        if (!echartsOf()) { note(root, NO_ECHARTS); return }
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const axes = colIndexes(cols, inputs.series)
        const ci = colIndex(cols, inputs.color)
        if (axes.length < 2) { note(root, 'Pick two or more columns for the axes (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, topOf({ top: inputs.top || 5000 }))
        const numeric = axes.map((i) => isNumericCol(cols[i]))
        // A text axis lists its values in the order they first come.
        const cats = axes.map((i, a) => {
          if (numeric[a]) return null
          const seen = new Set()
          for (const r of rows) { seen.add(keyOf(r[i])); if (seen.size > 60) break }
          return [...seen]
        })
        const th = themeOf(ctx)
        const colorNumeric = ci >= 0 && isNumericCol(cols[ci])
        let lo = Infinity, hi = -Infinity
        if (colorNumeric) for (const r of rows) { const v = num(r[ci]); if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v } }
        /** @type {Map<string, number>} */
        const freq = new Map()
        if (ci >= 0 && !colorNumeric) for (const r of rows) { const k = keyOf(r[ci]); freq.set(k, (freq.get(k) || 0) + 1) }
        const groups = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CATS).map(([k]) => k)
        const lineOf = (/** @type {unknown[]} */ r) => [...axes.map((i, a) => (numeric[a] ? num(r[i]) : keyOf(r[i]))), ci >= 0 ? (colorNumeric ? num(r[ci]) : keyOf(r[ci])) : null]
        const lines = rows.map(lineOf)
        // Each number axis spans every row, whichever series draws it: left
        // to ECharts, an axis took its range from the first series alone and
        // the others' lines ran off the chart.
        const extents = axes.map((_, a) => {
          if (!numeric[a]) return null
          let lo = Infinity, hi = -Infinity
          for (const l of lines) { const v = /** @type {number | null} */ (l[a]); if (v != null && Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v } }
          return Number.isFinite(lo) ? [lo, hi === lo ? lo + 1 : hi] : null
        })
        csv = csvOf([...axes.map((i) => cols[i].name), ...(ci >= 0 ? [cols[ci].name] : [])], lines.map((l) => (ci >= 0 ? l : l.slice(0, -1))))
        const opacity = Math.max(0.06, Math.min(0.6, 30 / Math.sqrt(Math.max(1, rows.length))))
        const stops = inputs.ramp === 'alarm' ? th.alarm : th.ramp
        const series = ci >= 0 && !colorNumeric
          ? [...groups.map((g, k) => ({ name: g, color: th.colors[k % th.colors.length], data: lines.filter((l) => l[axes.length] === g) })),
             ...(freq.size > MAX_CATS ? [{ name: 'other', color: th.muted, data: lines.filter((l) => !groups.includes(String(l[axes.length]))) }] : [])]
          : [{ name: ci >= 0 ? cols[ci].name : 'rows', color: th.accent, data: lines }]

        chart = mount(root, chart)
        chart.setOption({
          backgroundColor: 'transparent',
          title: titleOf(th, inputs.title),
          legend: ci >= 0 && !colorNumeric ? legendOf(th, { top: inputs.title ? 34 : 8, left: 16, right: 16 }) : undefined,
          tooltip: tooltipOf(th, {
            trigger: 'item',
            formatter: (/** @type {any} */ p) => axes.map((i, a) => esc(cols[i].name) + ': ' + (numeric[a] ? fmtNum(p.value[a]) : esc(p.value[a]))).join('<br>') +
              (ci >= 0 ? '<br>' + esc(cols[ci].name) + ': ' + (colorNumeric ? fmtNum(p.value[axes.length]) : esc(p.value[axes.length])) : '')
          }),
          visualMap: colorNumeric && Number.isFinite(lo) ? {
            type: 'continuous', dimension: axes.length, min: lo, max: hi === lo ? lo + 1 : hi, inRange: { color: stops }, calculable: true,
            orient: 'horizontal', right: 16, top: inputs.title ? 30 : 4, itemHeight: 90, itemWidth: 10,
            text: [fmtNum(hi), cols[ci].name + '  ' + fmtNum(lo)], textStyle: { color: th.fg, fontSize: 11 }
          } : undefined,
          parallel: {
            left: 60, right: 80, top: (inputs.title ? 34 : 8) + 48, bottom: 30,
            parallelAxisDefault: {
              nameLocation: 'end', nameGap: 14, nameTextStyle: { color: th.fg, fontSize: 11 },
              axisLine: { lineStyle: { color: th.line } }, axisTick: { lineStyle: { color: th.line } },
              axisLabel: { color: th.muted, fontSize: 10, formatter: (/** @type {unknown} */ v) => (typeof v === 'number' ? fmtNum(v) : String(v)) },
              areaSelectStyle: { width: 16, borderColor: th.accent, color: th.accent, opacity: 0.2 }
            }
          },
          parallelAxis: axes.map((i, a) => ({ dim: a, name: cols[i].name, type: numeric[a] ? 'value' : 'category', data: cats[a] || undefined, min: extents[a] ? extents[a][0] : undefined, max: extents[a] ? extents[a][1] : undefined })),
          series: series.map((s) => ({
            name: s.name, type: 'parallel', smooth: false, progressive: 800,
            lineStyle: { width: 1, opacity, color: colorNumeric ? undefined : s.color },
            inactiveOpacity: 0.02, activeOpacity: 1,
            emphasis: { lineStyle: { width: 2, opacity: 1 } },
            data: s.data
          }))
        })
      },
      resize: (root, size) => {
        if (!chart) throw new Error('no chart to resize')
        chart.resize(size)
      }
    }
  ]
}
