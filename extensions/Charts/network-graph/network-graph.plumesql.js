// @ts-check
// @description Rows as a network: nodes and their links, laid out by force or on a circle, sized by links or a number, coloured by a category (ECharts)
// @color cyan
import { echartsOf, themeOf, mount, note, NO_ECHARTS, titleOf, tooltipOf, legendOf, fmtNum, csvOf, esc } from '$ext/echarts-core/echarts-core.plumesql.js'
import { loadRows, topOf, colIndex, num, keyOf } from '$ext/stats-core/stats-core.plumesql.js'

// Past these the picture is a hairball and the layout takes too long.
const MAX_NODES = 3000, MAX_LINKS = 12000, MAX_CATS = 12
/** @type {any} */
let chart = null
let csv = ''

// The ids a link cell names: one value, or a PostgreSQL array ({1,2,3}) or a
// JSON array ([1,2,3]) of them.
const linkIds = (/** @type {unknown} */ v) => {
  if (v == null || v === '') return []
  if (Array.isArray(v)) return v.filter((x) => x != null).map(String)
  const s = String(v).trim()
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    return s.slice(1, -1).split(',').map((x) => x.trim().replace(/^"(.*)"$/, '$1')).filter((x) => x && x !== 'NULL' && x !== 'null')
  }
  return [s]
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Network',
      scripts: ['https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'],
      inputs: [
        { key: 'source', kind: 'column', label: 'Node', description: 'What a row is (an id, a name): one node per distinct value' },
        { key: 'target', kind: 'column', label: 'Links to', default: '', description: 'The node a row points at (a parent, a foreign key, the other end of an edge), or an array of them; none draws the nodes alone' },
        { key: 'label', kind: 'column', label: 'Label', default: '', description: 'What a node is called; none shows the node value itself' },
        { key: 'group', kind: 'column', label: 'Colour by', default: '', description: 'A category: each of the twelve most frequent values a colour, toggled from the legend' },
        { key: 'size', kind: 'column', label: 'Size by', types: ['numeric'], default: '', description: 'A number a node grows with; none sizes a node by how many links it has' },
        { key: 'layout', kind: 'choice', label: 'Layout', options: ['force', 'circular'], default: 'force', description: 'force: linked nodes pull together and the rest push apart; circular: every node on one ring, the links across it' },
        { key: 'labels', kind: 'choice', label: 'Labels', options: ['largest', 'all', 'none'], default: 'largest', description: 'Which nodes carry their name: the thirty largest, every one, or none (hover still names each)' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '20000', description: 'How many rows the view reads from the result, from the first one' }
      ],
      actions: [{ label: 'Copy data', run: (ctx) => ctx.copy(csv) }],
      render: async (root, data, ctx) => {
        if (!echartsOf()) { note(root, NO_ECHARTS); return }
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const si = colIndex(cols, inputs.source), ti = colIndex(cols, inputs.target), li = colIndex(cols, inputs.label)
        const gi = colIndex(cols, inputs.group), zi = colIndex(cols, inputs.size)
        if (si < 0) { note(root, 'Pick the Node column, and Links to for the links (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, topOf({ top: inputs.top || 20000 }))

        // Nodes: one per distinct value, its label, colour and size from the
        // first row that names it; a value only ever linked to is a node too.
        /** @type {Map<string, { id: string, name: string, group: string, size: number, deg: number }>} */
        const nodes = new Map()
        /** @type {[string, string][]} */
        const links = []
        const seen = new Set()
        let dropped = 0
        const nodeOf = (/** @type {string} */ id) => {
          let n = nodes.get(id)
          if (!n) {
            if (nodes.size >= MAX_NODES) return null
            n = { id, name: id, group: '', size: NaN, deg: 0 }
            nodes.set(id, n)
          }
          return n
        }
        const named = new Set()
        for (const r of rows) {
          if (r[si] == null) continue
          const id = String(r[si])
          const n = nodeOf(id)
          if (!n) { dropped++; continue }
          if (!named.has(id)) {
            named.add(id)
            if (li >= 0 && r[li] != null) n.name = String(r[li])
            if (gi >= 0) n.group = keyOf(r[gi])
            if (zi >= 0) n.size = num(r[zi]) ?? NaN
          }
          if (ti < 0) continue
          for (const t of linkIds(r[ti])) {
            if (t === id) continue
            const m = nodeOf(t)
            if (!m) { dropped++; continue }
            const key = id + '\u0000' + t
            if (seen.has(key)) continue
            seen.add(key)
            if (links.length >= MAX_LINKS) { dropped++; continue }
            links.push([id, t])
            n.deg++
            m.deg++
          }
        }
        if (!nodes.size) { note(root, 'No row has a node value to draw.'); return }
        if (dropped) ctx.log(`Network: past ${MAX_NODES} nodes or ${MAX_LINKS} links the rest were left out (${dropped} left out); narrow the query for a readable picture.`)

        const th = themeOf(ctx)
        // Categories: the most frequent groups, the rest in one.
        /** @type {Map<string, number>} */
        const freq = new Map()
        if (gi >= 0) for (const n of nodes.values()) freq.set(n.group, (freq.get(n.group) || 0) + 1)
        const cats = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CATS).map(([k]) => k)
        const other = freq.size > MAX_CATS
        const catIndex = new Map(cats.map((c, i) => [c, i]))
        const categories = [...cats.map((name) => ({ name })), ...(other ? [{ name: 'other' }] : [])]

        // Size: the number when there is one, else the links; square root, so
        // a hub ten times as linked is about three times as wide.
        const list = [...nodes.values()]
        const metric = (/** @type {typeof list[0]} */ n) => (zi >= 0 ? (Number.isFinite(n.size) && n.size > 0 ? n.size : 0) : n.deg)
        let hi = 0
        for (const n of list) hi = Math.max(hi, metric(n))
        const big = list.length > 600, mid = list.length > 120
        const sizeOf = (/** @type {typeof list[0]} */ n) => (big ? 4 : 7) + (hi > 0 ? Math.sqrt(metric(n) / hi) * (big ? 22 : 34) : 0)
        const labelled = new Set(inputs.labels === 'all' ? list.map((n) => n.id) : inputs.labels === 'none' ? [] : [...list].sort((a, b) => metric(b) - metric(a)).slice(0, 30).map((n) => n.id))

        csv = csvOf(['source', 'target'], links)
        chart = mount(root, chart)
        const sizeName = zi >= 0 ? cols[zi].name : 'links'
        chart.setOption({
          backgroundColor: 'transparent',
          color: th.colors,
          title: titleOf(th, inputs.title),
          legend: categories.length ? legendOf(th, { top: inputs.title ? 34 : 8, left: 12, right: 12 }) : undefined,
          tooltip: tooltipOf(th, {
            formatter: (/** @type {any} */ p) => {
              if (p.dataType === 'edge') return esc(nodes.get(p.data.source)?.name ?? p.data.source) + ' → ' + esc(nodes.get(p.data.target)?.name ?? p.data.target)
              const n = nodes.get(p.data.id)
              if (!n) return ''
              return '<b>' + esc(n.name) + '</b>' + (n.name !== n.id ? ' <span style="opacity:.6">' + esc(n.id) + '</span>' : '') +
                (gi >= 0 ? '<br>' + esc(cols[gi].name) + ': ' + esc(n.group) : '') +
                (zi >= 0 ? '<br>' + esc(sizeName) + ': ' + fmtNum(n.size) : '') + '<br>links: ' + n.deg
            }
          }),
          animationDuration: 600,
          series: [{
            type: 'graph',
            layout: inputs.layout === 'circular' ? 'circular' : 'force',
            circular: { rotateLabel: true },
            // Tighter the more nodes there are, so the settled layout stays in
            // the view rather than spreading past its edges.
            force: { repulsion: big ? 30 : mid ? 45 : 120, edgeLength: big ? [8, 30] : mid ? [14, 40] : [30, 90], gravity: big ? 0.2 : mid ? 0.16 : 0.08, layoutAnimation: list.length <= 1500 },
            zoom: big ? 0.8 : mid ? 0.85 : 1,
            roam: true,
            draggable: list.length <= 1500,
            top: categories.length ? (inputs.title ? 64 : 40) : inputs.title ? 40 : 10, bottom: 10, left: 10, right: 10,
            categories,
            edgeSymbol: ['none', 'arrow'],
            edgeSymbolSize: [0, 5],
            lineStyle: { color: 'source', opacity: links.length > 2000 ? 0.25 : 0.5, width: 1, curveness: inputs.layout === 'circular' ? 0.25 : 0.05 },
            emphasis: { focus: 'adjacency', lineStyle: { width: 2, opacity: 0.9 } },
            label: { color: th.fg, fontSize: 11, position: 'right', textBorderColor: th.bg, textBorderWidth: 2 },
            data: list.map((n) => ({
              id: n.id,
              name: n.id,
              value: metric(n),
              symbolSize: sizeOf(n),
              category: gi >= 0 ? (catIndex.has(n.group) ? catIndex.get(n.group) : cats.length) : undefined,
              itemStyle: gi >= 0 ? undefined : { color: th.accent },
              label: { show: labelled.has(n.id), formatter: n.name }
            })),
            links: links.map(([source, target]) => ({ source, target }))
          }]
        })
      },
      // A settled pane resize refits the chart in one frame.
      resize: (root, size) => {
        if (!chart) throw new Error('no chart to resize')
        chart.resize(size)
      }
    }
  ]
}
