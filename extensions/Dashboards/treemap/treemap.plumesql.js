// @ts-check
// @description Nested rectangles sized by a value over one or more hierarchy levels, with drill-down and a breadcrumb (ECharts, CDN)
// @color cyan
import { loadRows, topOf, colIndex, colIndexes, num, keyOf } from '$ext/stats-core/stats-core.plumesql.js'

/** @type {any} */
let chart = null
let csv = ''
const MAX_LEAVES = 5000
const palettes = ['#7aa2f7', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#ff9e64', '#f7768e', '#41a6b5']
const fmtNum = (/** @type {number} */ n) => { const a = Math.abs(n); const t = (/** @type {number} */ x) => String(Number(x.toFixed(1))); return a >= 1e9 ? t(n / 1e9) + 'G' : a >= 1e6 ? t(n / 1e6) + 'M' : a >= 1e4 ? t(n / 1e3) + 'k' : String(Number(n.toPrecision(6))) }
const note = (/** @type {HTMLElement} */ root, /** @type {string} */ msg) => { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif"></div>'; /** @type {HTMLElement} */ (root.firstChild).textContent = msg }
const quote = (/** @type {string} */ s) => '"' + s.replace(/"/g, '""') + '"'

/** @typedef {{ name: string, value?: number, children?: Node[] }} Node */

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Treemap',
      scripts: ['https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'],
      inputs: [
        { key: 'path', kind: 'multi-column', label: 'Levels (outer first)', types: ['text'], description: 'One column per hierarchy level, the outermost first: continent, country' },
        { key: 'value', kind: 'column', label: 'Value', types: ['numeric'], default: '', description: 'Numeric column folded into each rectangle; without one, a count of rows' },
        { key: 'agg', kind: 'choice', label: 'Fold', options: ['sum', 'mean', 'count'], default: 'sum', description: 'How the rows of one rectangle combine' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
      ],
      actions: [{ label: 'Copy data', run: (ctx) => ctx.copy(csv) }],
      render: async (root, data, ctx) => {
        const echarts = /** @type {any} */ (window).echarts
        if (!echarts) { note(root, 'ECharts did not load. Allow the CDN host in the Log.'); return }
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const levels = colIndexes(cols, inputs.path)
        const vi = colIndex(cols, inputs.value)
        if (!levels.length) { note(root, 'Pick one or more level columns (the sliders button in the header).'); return }
        const agg = vi < 0 ? 'count' : inputs.agg || 'sum'
        const rows = await loadRows(data, ctx, topOf(inputs))

        // One accumulator per full path; a parent is sized by its children's
        // total whatever the fold, which is what an area can show.
        /** @type {Map<string, { path: string[], sum: number, n: number }>} */
        const leaves = new Map()
        for (const r of rows) {
          const v = agg === 'count' ? 1 : num(r[vi])
          if (v == null) continue
          const path = levels.map((i) => keyOf(r[i]))
          const k = path.join('\u0000')
          const acc = leaves.get(k)
          if (acc) { acc.sum += v; acc.n++ } else leaves.set(k, { path, sum: v, n: 1 })
        }
        let list = [...leaves.values()].map((l) => ({ path: l.path, value: agg === 'mean' ? l.sum / l.n : agg === 'count' ? l.n : l.sum }))
        const drawable = list.filter((l) => l.value > 0)
        if (drawable.length < list.length) ctx.log('Treemap: ' + (list.length - drawable.length) + ' rectangles with a zero or negative value left out (an area cannot be negative).')
        list = drawable.sort((a, b) => b.value - a.value)
        if (list.length > MAX_LEAVES) { ctx.log('Treemap: ' + (list.length - MAX_LEAVES) + ' smallest rectangles after the largest ' + MAX_LEAVES + ' left out.'); list = list.slice(0, MAX_LEAVES) }
        if (!list.length) { note(root, 'Nothing with a positive value to draw.'); return }

        /** @type {Node[]} */
        const tree = []
        /** @type {Map<string, Node>} */
        const inner = new Map()
        for (const l of list) {
          let siblings = tree
          for (let d = 0; d < l.path.length - 1; d++) {
            const k = l.path.slice(0, d + 1).join('\u0000')
            let node = inner.get(k)
            if (!node) { node = { name: l.path[d], children: [] }; inner.set(k, node); siblings.push(node) }
            siblings = /** @type {Node[]} */ (node.children)
          }
          siblings.push({ name: l.path[l.path.length - 1], value: l.value })
        }
        csv = levels.map((i) => quote(cols[i].name)).join(',') + ',' + (vi < 0 ? 'count' : quote(agg + '_' + cols[vi].name)) + '\n' +
          list.map((l) => l.path.map(quote).join(',') + ',' + l.value).join('\n')

        const dark = ctx.theme !== 'light'
        const pal = ctx.palette && ctx.palette.id !== 'dark' && ctx.palette.id !== 'light' ? ctx.palette : null // a theme extension's colours; Dark and Light keep the look below
        const fg = pal ? pal.text : dark ? '#c8d3f5' : '#3a3f4b', mut = pal ? pal.muted : dark ? '#8a92a6' : '#6b7280', line = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
        const pane = pal ? pal.background : dark ? '#1f2030' : '#f4f5f8', bg = pal ? pal.surface : dark ? '#1a1b26' : '#ffffff'
        const colours = pal ? [pal.accent, pal.string, pal.number, pal.keyword, pal.func, pal.type, pal.red, pal.violet] : palettes
        const valueName = vi < 0 ? 'rows' : agg + ' of ' + cols[vi].name
        const levelStyles = levels.map((_, d) => d === levels.length - 1
          ? { itemStyle: { borderColor: bg, borderWidth: 1, gapWidth: 1 } }
          : { itemStyle: { borderColor: bg, borderWidth: d === 0 ? 3 : 2, gapWidth: d === 0 ? 3 : 2 }, upperLabel: { show: true, height: 20, color: fg, fontSize: 11 } })

        if (chart) { chart.dispose(); chart = null }
        root.innerHTML = ''
        const el = document.createElement('div')
        el.style.cssText = 'width:100%;height:100%'
        root.appendChild(el)
        chart = echarts.init(el, null, { renderer: 'canvas' })
        chart.setOption({
          backgroundColor: 'transparent', color: colours,
          title: inputs.title ? { text: inputs.title, left: 12, top: 8, textStyle: { color: fg, fontSize: 13, fontWeight: 600 } } : undefined,
          tooltip: {
            backgroundColor: pane, borderColor: line, textStyle: { color: fg, fontSize: 11 },
            formatter: (/** @type {any} */ p) => {
              const trail = (p.treePathInfo || []).slice(1).map((/** @type {any} */ t) => t.name).join(' / ')
              return trail + '<br>' + valueName + ': ' + fmtNum(Number(p.value) || 0)
            }
          },
          series: [{
            type: 'treemap', name: valueName, data: tree,
            top: inputs.title ? 40 : 10, left: 8, right: 8, bottom: 34,
            roam: false, nodeClick: 'zoomToNode', visibleMin: 64,
            // Deep trees show two levels at a time and drill in on a click, or
            // thousands of leaves would paint as noise.
            leafDepth: levels.length > 2 ? 2 : undefined,
            breadcrumb: { show: true, bottom: 6, height: 20, itemStyle: { color: pane, borderColor: line, textStyle: { color: fg } }, emphasis: { itemStyle: { color: line } } },
            label: { show: true, color: '#fff', fontSize: 11, formatter: (/** @type {any} */ p) => p.name + '\n' + fmtNum(Number(p.value) || 0) },
            upperLabel: { show: false },
            levels: levelStyles
          }]
        })
      }
    }
  ]
}
