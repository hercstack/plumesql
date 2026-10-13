// @ts-check
// @description Rings of a hierarchy: each level a ring, each slice as wide as its share of the value; click a slice to zoom into it (ECharts)
// @color cyan
import { echartsOf, themeOf, mount, note, NO_ECHARTS, titleOf, tooltipOf, fmtNum, csvOf, esc } from '$ext/echarts-core/echarts-core.plumesql.js'
import { loadRows, topOf, colIndex, colIndexes, num, keyOf } from '$ext/stats-core/stats-core.plumesql.js'

const MAX_LEAVES = 5000
/** @type {any} */
let chart = null
let csv = ''
/** @typedef {{ name: string, value?: number, children?: SunNode[] }} SunNode */

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Sunburst',
      scripts: ['https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'],
      inputs: [
        { key: 'path', kind: 'multi-column', label: 'Levels (inner first)', description: 'One column per level of the hierarchy, the innermost ring first: region, country, city' },
        { key: 'value', kind: 'column', label: 'Value', types: ['numeric'], default: '', description: 'The number a slice is as wide as, summed over its rows; none counts the rows' },
        { key: 'agg', kind: 'choice', label: 'Fold', options: ['sum', 'count', 'mean'], default: 'sum', description: 'How the rows of one slice combine' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '1000000', description: 'How many rows the view reads from the result, from the first one' }
      ],
      actions: [{ label: 'Copy data', run: (ctx) => ctx.copy(csv) }],
      render: async (root, data, ctx) => {
        if (!echartsOf()) { note(root, NO_ECHARTS); return }
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const levels = colIndexes(cols, inputs.path)
        const vi = colIndex(cols, inputs.value)
        if (!levels.length) { note(root, 'Pick one or more level columns, the innermost first (the sliders button in the header).'); return }
        const agg = vi < 0 ? 'count' : inputs.agg || 'sum'
        const rows = await loadRows(data, ctx, topOf(inputs))

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
        let list = [...leaves.values()].map((l) => ({ path: l.path, value: agg === 'mean' ? l.sum / l.n : agg === 'count' ? l.n : l.sum })).filter((l) => l.value > 0)
        if (list.length < leaves.size) ctx.log(`Sunburst: ${leaves.size - list.length} slices with a zero or negative value left out (a slice cannot be negative).`)
        list.sort((a, b) => b.value - a.value)
        if (list.length > MAX_LEAVES) { ctx.log(`Sunburst: the ${MAX_LEAVES} largest of ${list.length} slices are drawn.`); list = list.slice(0, MAX_LEAVES) }
        if (!list.length) { note(root, 'Nothing with a positive value to draw.'); return }

        /** @type {SunNode[]} */
        const tree = []
        /** @type {Map<string, SunNode>} */
        const inner = new Map()
        for (const l of list) {
          let siblings = tree
          for (let d = 0; d < l.path.length - 1; d++) {
            const k = l.path.slice(0, d + 1).join('\u0000')
            let node = inner.get(k)
            if (!node) { node = { name: l.path[d], children: [] }; inner.set(k, node); siblings.push(node) }
            siblings = /** @type {SunNode[]} */ (node.children)
          }
          siblings.push({ name: l.path[l.path.length - 1], value: l.value })
        }
        csv = csvOf([...levels.map((i) => cols[i].name), vi < 0 ? 'rows' : agg + '_' + cols[vi].name], list.map((l) => [...l.path, l.value]))

        const th = themeOf(ctx)
        const valueName = vi < 0 ? 'rows' : agg + ' of ' + cols[vi].name
        const n = levels.length
        // The rings share the radius out; the centre is a hole the zoomed-in
        // slice's name stands in, and a click there zooms back out.
        const r0 = 12, step = (92 - r0) / n
        chart = mount(root, chart)
        chart.setOption({
          backgroundColor: 'transparent',
          color: th.colors,
          title: titleOf(th, inputs.title),
          tooltip: tooltipOf(th, {
            formatter: (/** @type {any} */ p) => {
              const trail = (p.treePathInfo || []).slice(1).map((/** @type {any} */ t) => esc(t.name)).join(' / ')
              const total = p.treePathInfo && p.treePathInfo[0] ? Number(p.treePathInfo[0].value) : 0
              return trail + '<br>' + esc(valueName) + ': ' + fmtNum(p.value) + (total > 0 ? ' (' + ((Number(p.value) / total) * 100).toFixed(1) + '%)' : '')
            }
          }),
          series: [{
            type: 'sunburst',
            data: tree,
            center: ['50%', inputs.title ? '54%' : '50%'],
            radius: [r0 + '%', '92%'],
            sort: 'desc',
            nodeClick: 'rootToNode',
            emphasis: { focus: 'ancestor' },
            itemStyle: { borderColor: th.bg, borderWidth: 1 },
            label: { color: '#ffffff', fontSize: 10, minAngle: 6, rotate: 'radial', overflow: 'truncate' },
            levels: [{}, ...levels.map((_, d) => ({
              r0: r0 + d * step + '%', r: r0 + (d + 1) * step + '%',
              label: d === n - 1 && n > 1 ? { position: 'outside', color: th.fg, rotate: 'tangential', minAngle: 3, textBorderColor: th.bg, textBorderWidth: 2 } : { minAngle: d === 0 ? 4 : 8 }
            }))]
          }]
        })
      },
      resize: (root, size) => {
        if (!chart) throw new Error('no chart to resize')
        chart.resize(size)
      }
    }
  ]
}
