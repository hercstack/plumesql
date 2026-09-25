// @ts-check
// @description One coloured cell per day, weeks across and weekdays down, a row per year (Observable Plot, CDN)
// @color cyan
import { P, loadRows, colIndex, parseTime, fmtNum, baseStyle, note } from '$ext/plot-core/plot-core.plumesql.js'

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Calendar',
      inputs: [
        { key: 'date', kind: 'column', label: 'Date', types: ['temporal'] },
        { key: 'value', kind: 'column', label: 'Value', types: ['numeric'], default: '', description: 'Numeric column folded per day; without one, the number of rows per day' },
        { key: 'agg', kind: 'choice', label: 'Per day', options: ['sum', 'mean', 'max', 'min', 'count'], default: 'sum', description: 'How the values of one day combine' },
        { key: 'scheme', kind: 'choice', label: 'Colours', options: ['greens', 'blues', 'oranges', 'purples', 'ylgnbu', 'turbo'], default: 'greens' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '1000000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const di = colIndex(cols, inputs.date), vi = colIndex(cols, inputs.value)
        if (di < 0) { note(root, 'Pick a date or timestamp column (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 1000000))
        const dark = ctx.theme !== 'light'
        const agg = vi < 0 ? 'count' : (inputs.agg || 'sum')
        const days = new Map()
        for (const r of rows) {
          const d = parseTime(r[di])
          if (!d) continue
          const v = vi < 0 ? 1 : Number(r[vi])
          if (!Number.isFinite(v)) continue
          const key = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
          let b = days.get(key)
          if (!b) { b = { n: 0, sum: 0, min: Infinity, max: -Infinity }; days.set(key, b) }
          b.n++; b.sum += v; if (v < b.min) b.min = v; if (v > b.max) b.max = v
        }
        const cells = []
        for (const [key, b] of days) cells.push({ date: new Date(key), v: agg === 'count' ? b.n : agg === 'sum' ? b.sum : agg === 'mean' ? b.sum / b.n : agg === 'max' ? b.max : b.min })
        if (!cells.length) { note(root, 'No dates to draw.'); return }
        const year = (d) => d.getUTCFullYear()
        const week = (d) => { const jan1 = Date.UTC(year(d), 0, 1); return Math.floor(((d.getTime() - jan1) / 86400000 + new Date(jan1).getUTCDay()) / 7) }
        const years = Array.from(new Set(cells.map((c) => year(c.date)))).sort()
        const W = root.clientWidth || 640
        const cell = Math.max(8, Math.min(18, Math.floor((W - 90) / 53)))
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const monthAt = new Map()
        for (let m = 0; m < 12; m++) monthAt.set(week(new Date(Date.UTC(years[0], m, 1))), months[m])
        const weeks = []
        for (let w = 0; w < 54; w++) weeks.push(w)
        const fig = P.plot({
          width: W, height: years.length * (7 * cell + 26) + 44, marginLeft: 44, marginRight: 48, marginTop: 26, marginBottom: 8,
          style: baseStyle(dark),
          x: { domain: weeks, axis: 'top', ticks: Array.from(monthAt.keys()), tickFormat: (w) => monthAt.get(w) || '', label: null, tickSize: 0 },
          y: { domain: [0, 1, 2, 3, 4, 5, 6], tickFormat: (d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d], label: null, tickSize: 0 },
          fy: { label: null, domain: years, tickFormat: (y) => String(y) },
          color: { scheme: inputs.scheme || 'greens', legend: true, label: agg === 'count' ? 'rows per day' : agg + ' of ' + cols[vi].name + ' per day' },
          marks: [P.cell(cells, { x: (d) => week(d.date), y: (d) => d.date.getUTCDay(), fy: (d) => year(d.date), fill: 'v', inset: 1.5, rx: 2, tip: true, title: (d) => d.date.toISOString().slice(0, 10) + ': ' + fmtNum(d.v) })]
        })
        root.innerHTML = ''
        root.style.overflow = 'auto'
        root.append(fig)
      }
    },
  ]
}
