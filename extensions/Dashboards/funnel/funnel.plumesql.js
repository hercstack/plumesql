// @ts-check
// @description Stages narrowing from first to last, each with its share of the first and of the previous stage (ECharts, CDN)
// @color cyan
import { loadRows, topOf, colIndex, num, round, keyOf } from '$ext/stats-core/stats-core.plumesql.js'

/** @type {any} */
let chart = null
let csv = ''
const MAX_STAGES = 50
const palettes = ['#7aa2f7', '#7dcfff', '#41a6b5', '#9ece6a', '#e0af68', '#ff9e64', '#f7768e', '#bb9af7']
const fmtNum = (/** @type {number} */ n) => { const a = Math.abs(n); const t = (/** @type {number} */ x) => String(Number(x.toFixed(1))); return a >= 1e9 ? t(n / 1e9) + 'G' : a >= 1e6 ? t(n / 1e6) + 'M' : a >= 1e4 ? t(n / 1e3) + 'k' : String(Number(n.toPrecision(6))) }
// A tiny share keeps two decimals, and one too small for those says so,
// rather than a flat 0% beside a stage that is there.
const pct = (/** @type {number} */ part, /** @type {number} */ whole) => {
  if (!whole) return 'n/a'
  const p = (part / whole) * 100
  return p > 0 && p < 0.01 ? '<0.01%' : String(round(p, p < 1 ? 2 : 1)) + '%'
}
const note = (/** @type {HTMLElement} */ root, /** @type {string} */ msg) => { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif"></div>'; /** @type {HTMLElement} */ (root.firstChild).textContent = msg }

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Funnel',
      scripts: ['https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'],
      inputs: [
        { key: 'stage', kind: 'column', label: 'Stage' },
        { key: 'value', kind: 'column', label: 'Value', types: ['numeric'], default: '', description: 'Numeric column summed per stage; without one, a count of rows per stage' },
        { key: 'sort', kind: 'choice', label: 'Stage order', options: ['as seen', 'descending'], default: 'as seen', description: 'as seen keeps the order the stages first appear in; descending sorts them by value' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
      ],
      actions: [{ label: 'Copy data', run: (ctx) => ctx.copy(csv) }],
      render: async (root, data, ctx) => {
        const echarts = /** @type {any} */ (window).echarts
        if (!echarts) { note(root, 'ECharts did not load. Allow the CDN host in the Log.'); return }
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const si = colIndex(cols, inputs.stage), vi = colIndex(cols, inputs.value)
        if (si < 0) { note(root, 'Pick the stage column (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, topOf(inputs))
        /** @type {Map<string, number>} */
        const byStage = new Map()
        for (const r of rows) {
          const k = keyOf(r[si])
          const v = vi < 0 ? 1 : num(r[vi])
          if (v == null) continue
          byStage.set(k, (byStage.get(k) || 0) + v)
        }
        let stages = [...byStage].map(([name, value]) => ({ name, value }))
        if (inputs.sort === 'descending') stages.sort((a, b) => b.value - a.value)
        if (stages.length > MAX_STAGES) { ctx.log('Funnel: ' + (stages.length - MAX_STAGES) + ' stages after the first ' + MAX_STAGES + ' left out.'); stages = stages.slice(0, MAX_STAGES) }
        if (!stages.length) { note(root, 'No stage has a value to draw.'); return }
        const first = stages[0].value
        const info = stages.map((s, i) => ({ ...s, ofFirst: pct(s.value, first), ofPrev: i ? pct(s.value, stages[i - 1].value) : '' }))
        csv = 'stage,value,pct_of_first,pct_of_previous\n' + info.map((s) => '"' + s.name.replace(/"/g, '""') + '",' + s.value + ',' + s.ofFirst + ',' + s.ofPrev).join('\n')

        const dark = ctx.theme !== 'light'
        const pal = ctx.palette && ctx.palette.id !== 'dark' && ctx.palette.id !== 'light' ? ctx.palette : null // a theme extension's colours; Dark and Light keep the look below
        const fg = pal ? pal.text : dark ? '#c8d3f5' : '#3a3f4b', mut = pal ? pal.muted : dark ? '#8a92a6' : '#6b7280', line = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
        const pane = pal ? pal.background : dark ? '#1f2030' : '#f4f5f8', bg = pal ? pal.surface : dark ? '#1a1b26' : '#ffffff'
        const colours = pal ? [pal.accent, pal.func, pal.type, pal.string, pal.number, pal.keyword, pal.violet, pal.amber] : palettes
        const byName = new Map(info.map((s) => [s.name, s]))
        const label = (/** @type {any} */ p) => {
          const s = byName.get(p.name)
          if (!s) return p.name
          return s.name + '  ' + fmtNum(s.value) + '\n' + s.ofFirst + ' of first' + (s.ofPrev ? ', ' + s.ofPrev + ' of previous' : '')
        }

        if (chart) { chart.dispose(); chart = null }
        root.innerHTML = ''
        const el = document.createElement('div')
        el.style.cssText = 'width:100%;height:100%'
        root.appendChild(el)
        chart = echarts.init(el, null, { renderer: 'canvas' })
        chart.setOption({
          backgroundColor: 'transparent', color: colours,
          title: inputs.title ? { text: inputs.title, left: 12, top: 8, textStyle: { color: fg, fontSize: 13, fontWeight: 600 } } : undefined,
          tooltip: { backgroundColor: pane, borderColor: line, textStyle: { color: fg, fontSize: 11 }, trigger: 'item', formatter: (/** @type {any} */ p) => label(p).replace('\n', '<br>') },
          series: [{
            type: 'funnel', name: vi < 0 ? 'rows' : cols[vi].name,
            left: '6%', right: '34%', top: inputs.title ? 48 : 20, bottom: 20,
            // 'none' keeps the order given: first seen, or already sorted above.
            sort: 'none', minSize: '4%', gap: 2,
            // The widths scale from 0 to 100 unless told the real range.
            min: 0, max: Math.max(...info.map((s) => s.value), 1),
            data: info.map((s) => ({ name: s.name, value: s.value })),
            label: { show: true, position: 'right', color: fg, fontSize: 11, lineHeight: 15, formatter: label },
            labelLine: { lineStyle: { color: mut } },
            itemStyle: { borderColor: bg, borderWidth: 1 },
            emphasis: { label: { fontWeight: 600 } }
          }]
        })
      }
    }
  ]
}
