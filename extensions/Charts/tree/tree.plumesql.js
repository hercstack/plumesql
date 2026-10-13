// @ts-check
// @description A hierarchy as a tree: rows with an id and a parent, drawn left to right, as an org chart or radial; click to fold (ECharts)
// @color cyan
import { echartsOf, themeOf, mount, note, NO_ECHARTS, titleOf, tooltipOf, fmtNum, csvOf, esc } from '$ext/echarts-core/echarts-core.plumesql.js'
import { loadRows, topOf, colIndex, num } from '$ext/stats-core/stats-core.plumesql.js'

const MAX_NODES = 20000
/** @type {any} */
let chart = null
let csv = ''

/** @typedef {{ name: string, id: string, label: string, value: number, children: TreeNode[], collapsed?: boolean, symbolSize?: number, size?: number, kids?: number, all?: number }} TreeNode */

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Tree',
      scripts: ['https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'],
      inputs: [
        { key: 'id', kind: 'column', label: 'Id', description: 'What a row is called by its children (a key)' },
        { key: 'link', kind: 'column', label: 'Parent', description: 'The id of the row above it; empty for a root' },
        { key: 'label', kind: 'column', label: 'Label', default: '', description: 'What a node is called; none shows the id' },
        { key: 'size', kind: 'column', label: 'Size by', types: ['numeric'], default: '', description: 'A number a node grows with; none keeps every node the same' },
        { key: 'layout', kind: 'choice', label: 'Layout', options: ['left to right', 'top down', 'radial'], default: 'left to right', description: 'left to right reads like a file tree; top down like an org chart; radial puts the root in the middle' },
        { key: 'depth', kind: 'number', label: 'Open levels', default: '3', description: 'How many levels show unfolded at first; a click folds or unfolds a node' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '20000', description: 'How many rows the view reads from the result, from the first one' }
      ],
      actions: [
        { label: 'Copy data', run: (ctx) => ctx.copy(csv) }
      ],
      render: async (root, data, ctx) => {
        if (!echartsOf()) { note(root, NO_ECHARTS); return }
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const ii = colIndex(cols, inputs.id), pi = colIndex(cols, inputs.link), li = colIndex(cols, inputs.label), zi = colIndex(cols, inputs.size)
        if (ii < 0 || pi < 0) { note(root, 'Pick the Id and Parent columns (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, Math.min(MAX_NODES, topOf({ top: inputs.top || 20000 })))

        /** @type {Map<string, TreeNode>} */
        const byId = new Map()
        /** @type {Map<string, string>} */
        const parentOf = new Map()
        for (const r of rows) {
          if (r[ii] == null) continue
          const id = String(r[ii])
          if (byId.has(id)) continue
          const label = li >= 0 && r[li] != null ? String(r[li]) : id
          const v = zi >= 0 ? num(r[zi]) : null
          byId.set(id, { name: id, id, label, value: v ?? NaN, children: [] })
          if (r[pi] != null && String(r[pi]) !== '' && String(r[pi]) !== id) parentOf.set(id, String(r[pi]))
        }
        if (!byId.size) { note(root, 'No row has an id.'); return }
        // A parent the result does not hold, or a loop, makes its child a root.
        /** @type {TreeNode[]} */
        const roots = []
        let orphans = 0, loops = 0
        for (const n of byId.values()) {
          const p = parentOf.get(n.id)
          let up = p, guard = 0, loop = false
          while (up && guard++ <= byId.size) { if (up === n.id) { loop = true; break } up = parentOf.get(up) }
          const parent = p ? byId.get(p) : undefined
          if (parent && !loop) parent.children.push(n)
          else { roots.push(n); if (p && !parent) orphans++; if (loop) loops++ }
        }
        if (orphans) ctx.log(`Tree: ${orphans} rows name a parent that is not among the rows read; they stand as roots.`)
        if (loops) ctx.log(`Tree: ${loops} rows sit in a loop of parents; they stand as roots.`)

        // Sizes and counts, bottom up; a node with children shows how many it
        // holds in all, and folds below the open levels.
        let hi = 0
        for (const n of byId.values()) if (Number.isFinite(n.value) && n.value > hi) hi = n.value
        const open = Math.max(1, Number(inputs.depth) || 3)
        const walk = (/** @type {TreeNode} */ n, /** @type {number} */ d) => {
          let all = 0
          for (const c of n.children) all += 1 + walk(c, d + 1)
          n.kids = n.children.length
          n.all = all
          n.collapsed = d >= open && n.children.length > 0
          n.symbolSize = zi >= 0 && hi > 0 ? 6 + Math.sqrt(Math.max(0, n.value || 0) / hi) * 24 : 8
          return all
        }
        for (const r of roots) walk(r, 1)
        const top = roots.length === 1 ? roots[0] : { name: '\u0000all', id: '', label: roots.length + ' roots', value: NaN, children: roots, kids: roots.length, all: byId.size, symbolSize: 10 }
        if (roots.length > 1) walk(top, 0)

        csv = csvOf(['id', 'parent', 'label', 'depth'], (() => {
          /** @type {unknown[][]} */
          const out = []
          const emit = (/** @type {TreeNode} */ n, /** @type {string} */ parent, /** @type {number} */ d) => { out.push([n.id, parent, n.label, d]); for (const c of n.children) emit(c, n.id, d + 1) }
          for (const r of roots) emit(r, '', 0)
          return out
        })())

        const th = themeOf(ctx)
        const layout = inputs.layout || 'left to right'
        const radial = layout === 'radial', down = layout === 'top down'
        const nodeColor = (/** @type {TreeNode} */ n) => (n.children.length ? th.accent : th.colors[2 % th.colors.length])
        /** @returns {any} */
        const decorate = (/** @type {TreeNode} */ n) => ({ ...n, itemStyle: { color: nodeColor(n), borderColor: n.collapsed ? th.fg : nodeColor(n), borderWidth: n.collapsed ? 2 : 1 }, children: n.children.map(decorate) })
        chart = mount(root, chart)
        chart.setOption({
          backgroundColor: 'transparent',
          title: titleOf(th, inputs.title),
          tooltip: tooltipOf(th, {
            formatter: (/** @type {any} */ p) => {
              const d = p.data
              return '<b>' + esc(d.label) + '</b>' + (d.id && d.label !== d.id ? ' <span style="opacity:.6">' + esc(d.id) + '</span>' : '') +
                (zi >= 0 && Number.isFinite(d.value) ? '<br>' + esc(cols[zi].name) + ': ' + fmtNum(d.value) : '') +
                (d.kids ? '<br>' + d.kids + ' below, ' + d.all + ' in all' + (d.collapsed ? ' (click to open)' : '') : '')
            }
          }),
          series: [{
            type: 'tree',
            data: [decorate(/** @type {TreeNode} */ (top))],
            layout: radial ? 'radial' : 'orthogonal',
            orient: down ? 'TB' : 'LR',
            // Room for the leaves' names: beside them left to right, under them
            // (turned when there are many) top down.
            top: inputs.title ? 48 : 24, bottom: down ? (byId.size > 40 ? 110 : 40) : 24, left: radial ? 24 : down ? 24 : 90, right: radial ? 24 : down ? 24 : 160,
            roam: true,
            expandAndCollapse: true,
            initialTreeDepth: -1,
            animationDurationUpdate: 450,
            symbol: 'circle',
            lineStyle: { color: th.line, width: 1.2, curveness: 0.5 },
            label: {
              color: th.fg, fontSize: 11, textBorderColor: th.bg, textBorderWidth: 2,
              position: radial ? undefined : down ? 'top' : 'left', verticalAlign: 'middle', align: down ? 'center' : 'right',
              rotate: down ? 0 : undefined,
              formatter: (/** @type {any} */ p) => p.data.label + (p.data.collapsed && p.data.all ? '  +' + p.data.all : '')
            },
            leaves: { label: { position: radial ? undefined : down ? 'bottom' : 'right', align: down ? 'center' : 'left', rotate: down && byId.size > 40 ? -60 : 0 } },
            emphasis: { focus: 'descendant' }
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
