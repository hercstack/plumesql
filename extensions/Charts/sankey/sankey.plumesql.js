// @ts-check
// @description Flows between stages as bands as wide as their value: a from and a to column, or several for a path through stages (ECharts)
// @color cyan
import { echartsOf, themeOf, mount, note, NO_ECHARTS, titleOf, tooltipOf, fmtNum, csvOf, esc } from '$ext/echarts-core/echarts-core.plumesql.js'
import { loadRows, topOf, colIndex, colIndexes, num, keyOf } from '$ext/stats-core/stats-core.plumesql.js'

const MAX_LINKS = 3000
/** @type {any} */
let chart = null
let csv = ''

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Sankey',
      scripts: ['https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'],
      inputs: [
        { key: 'path', kind: 'multi-column', label: 'Stages (from, to, ...)', description: 'Two or more columns in order: each pair of neighbours is a flow, from the first to the next' },
        { key: 'value', kind: 'column', label: 'Value', types: ['numeric'], default: '', description: 'How wide a flow is, summed over its rows; none counts the rows' },
        { key: 'orient', kind: 'choice', label: 'Direction', options: ['left to right', 'top down'], default: 'left to right' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '100000', description: 'How many rows the view reads from the result, from the first one' }
      ],
      actions: [{ label: 'Copy data', run: (ctx) => ctx.copy(csv) }],
      render: async (root, data, ctx) => {
        if (!echartsOf()) { note(root, NO_ECHARTS); return }
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const stages = colIndexes(cols, inputs.path)
        const vi = colIndex(cols, inputs.value)
        if (stages.length < 2) { note(root, 'Pick two or more stage columns, from and to, in order (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, topOf({ top: inputs.top || 100000 }))

        // A node is a value AT ITS STAGE: the same name in two columns is two
        // nodes, so a flow can never loop back (a Sankey has no cycles), and
        // the label shows the name alone.
        const nodeId = (/** @type {number} */ s, /** @type {string} */ v) => s + '\u0001' + v
        /** @type {Map<string, number>} */
        const flows = new Map()
        let skipped = 0
        for (const r of rows) {
          const w = vi < 0 ? 1 : num(r[vi])
          if (w == null || !(w > 0)) { skipped++; continue }
          for (let s = 0; s + 1 < stages.length; s++) {
            const a = r[stages[s]], b = r[stages[s + 1]]
            if (a == null || b == null) continue
            const k = nodeId(s, keyOf(a)) + '\u0000' + nodeId(s + 1, keyOf(b))
            flows.set(k, (flows.get(k) || 0) + w)
          }
        }
        if (skipped && vi >= 0) ctx.log(`Sankey: ${skipped} rows with no positive ${cols[vi].name} left out (a flow cannot be empty or negative).`)
        let links = [...flows.entries()].map(([k, value]) => { const [source, target] = k.split('\u0000'); return { source, target, value } })
        links.sort((a, b) => b.value - a.value)
        if (links.length > MAX_LINKS) { ctx.log(`Sankey: the ${MAX_LINKS} widest of ${links.length} flows are drawn.`); links = links.slice(0, MAX_LINKS) }
        if (!links.length) { note(root, 'No row names both ends of a flow.'); return }
        const names = new Set()
        for (const l of links) { names.add(l.source); names.add(l.target) }
        const label = (/** @type {string} */ id) => id.slice(id.indexOf('\u0001') + 1)
        csv = csvOf(['from_stage', 'from', 'to', 'value'], links.map((l) => [cols[stages[Number(l.source.split('\u0001')[0])]].name, label(l.source), label(l.target), l.value]))

        const th = themeOf(ctx)
        const vertical = inputs.orient === 'top down'
        const valueName = vi < 0 ? 'rows' : cols[vi].name
        chart = mount(root, chart)
        chart.setOption({
          backgroundColor: 'transparent',
          color: th.colors,
          title: titleOf(th, inputs.title),
          tooltip: tooltipOf(th, {
            trigger: 'item',
            formatter: (/** @type {any} */ p) => p.dataType === 'edge'
              ? esc(label(p.data.source)) + ' → ' + esc(label(p.data.target)) + '<br>' + esc(valueName) + ': ' + fmtNum(p.data.value)
              : esc(label(p.name)) + '<br>' + esc(valueName) + ': ' + fmtNum(p.value)
          }),
          series: [{
            type: 'sankey',
            orient: vertical ? 'vertical' : 'horizontal',
            top: inputs.title ? 44 : 16, bottom: 16, left: 16, right: vertical ? 16 : 120,
            nodeGap: names.size > 60 ? 4 : 10,
            nodeWidth: 14,
            draggable: true,
            emphasis: { focus: 'adjacency' },
            lineStyle: { color: 'gradient', opacity: th.dark ? 0.35 : 0.45, curveness: 0.5 },
            label: { color: th.fg, fontSize: 11, formatter: (/** @type {any} */ p) => label(p.name), position: vertical ? 'bottom' : 'right' },
            itemStyle: { borderWidth: 0 },
            data: [...names].map((name) => ({ name })),
            links
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
