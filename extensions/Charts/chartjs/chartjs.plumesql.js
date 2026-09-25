// @ts-check
// @description Bar / line / pie / doughnut / radar with Chart.js, pulled from a CDN
// @color cyan
import Chart from 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/auto/+esm'

/** @type {InstanceType<typeof Chart> | null} */
let chart = null
let csv = ''
const palettes = {
  Vivid: ['#7aa2f7', '#f7768e', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#ff9e64', '#41a6b5'],
  Cool: ['#4c9be8', '#5ec8c8', '#6ee7b7', '#818cf8', '#38bdf8', '#2dd4bf', '#60a5fa', '#34d399'],
  Warm: ['#f97316', '#ef4444', '#f59e0b', '#e11d48', '#fb7185', '#f472b6', '#facc15', '#fb923c'],
  Mono: ['#7aa2f7', '#5b82d9', '#3f63bb', '#8fb3ff', '#274b9d', '#a9c4ff', '#1a3a80', '#c4d6ff']
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Chart',
      inputs: [
        { key: 'kind', kind: 'choice', label: 'Chart type', options: ['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea'], default: 'bar' },
        { key: 'category', kind: 'column', label: 'Category (X / label)', description: 'Labels along the axis, one per row' },
        { key: 'series', kind: 'multi-column', label: 'Series (Y)', types: ['numeric'], description: 'One series per column; edit the comma list to add or remove one' },
        { key: 'palette', kind: 'choice', label: 'Palette', options: ['Vivid', 'Cool', 'Warm', 'Mono'], default: 'Vivid' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '60', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      actions: [{ label: 'Copy data', run: (ctx) => ctx.copy(csv) }],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const idxs = (inputs.series || '').split(',').map((s) => s.trim()).filter(Boolean).map((n) => cols.findIndex((c) => c.name === n)).filter((i) => i >= 0)
        if (idxs.length === 0) { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif">Pick one or more Y columns (the sliders button in the header).</div>'; return }
        const ci = cols.findIndex((c) => c.name === inputs.category)
        const kind = inputs.kind || 'bar'
        const palette = palettes[inputs.palette] || palettes.Vivid
        const top = Math.max(1, Number(inputs.top) || 60)
        let rows = data.rows || []
        if (top > rows.length && typeof ctx.rows === 'function') { try { rows = await ctx.rows(0, top) } catch (e) { ctx.log('ctx.rows: ' + e) } }
        rows = rows.slice(0, top)
        const labels = rows.map((r, i) => (ci >= 0 ? String(r[ci] == null ? '' : r[ci]) : String(i + 1)))
        csv = 'label,' + idxs.map((vi) => cols[vi].name).join(',') + '\n' + rows.map((r, i) => labels[i] + ',' + idxs.map((vi) => Number(r[vi])).join(',')).join('\n')
        const slice = kind === 'pie' || kind === 'doughnut' || kind === 'polarArea'
        let datasets
        if (slice) {
          const vi = idxs[0]
          datasets = [{ label: cols[vi].name, data: rows.map((r) => Number(r[vi])), backgroundColor: labels.map((l, i) => palette[i % palette.length]) }]
        } else {
          datasets = idxs.map((vi, s) => ({ label: cols[vi].name, data: rows.map((r) => Number(r[vi])), backgroundColor: palette[s % palette.length], borderColor: palette[s % palette.length], borderWidth: 1.5 }))
        }
        const dark = ctx.theme !== 'light'
        Chart.defaults.color = dark ? '#c8d3f5' : '#3a3f4b'
        Chart.defaults.borderColor = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
        if (chart) { chart.destroy(); chart = null }
        root.innerHTML = ''
        const canvas = document.createElement('canvas')
        canvas.width = root.clientWidth || 640
        canvas.height = root.clientHeight || 360
        root.appendChild(canvas)
        const title = inputs.title ? { display: true, text: inputs.title, color: dark ? '#c8d3f5' : '#3a3f4b', font: { size: 14 } } : { display: false }
        const config = { type: kind, data: { labels, datasets }, options: { responsive: false, animation: false, layout: { padding: 12 }, plugins: { legend: { display: slice || idxs.length > 1 }, title } } }
        chart = new Chart(canvas, /** @type {any} */ (config))
      }
    }
  ]
}
