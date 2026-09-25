// @ts-check
// @description A line chart built for speed: a million points in milliseconds, drag to zoom, a live legend (μPlot, CDN)
// @color cyan
/** @type {any} */
let plot = null
const palettes = {
  Vivid: ['#7aa2f7', '#f7768e', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#ff9e64', '#41a6b5'],
  Cool: ['#4c9be8', '#5ec8c8', '#6ee7b7', '#818cf8', '#38bdf8', '#2dd4bf', '#60a5fa', '#34d399'],
  Warm: ['#f97316', '#ef4444', '#f59e0b', '#e11d48', '#fb7185', '#f472b6', '#facc15', '#fb923c'],
  Mono: ['#7aa2f7', '#5b82d9', '#3f63bb', '#8fb3ff', '#274b9d', '#a9c4ff', '#1a3a80', '#c4d6ff']
}
const fmtTick = (v) => { const n = Number(v); if (!Number.isFinite(n)) return ''; const a = Math.abs(n); const t = (x) => String(Number(x.toFixed(1))); return a >= 1e9 ? t(n / 1e9) + 'G' : a >= 1e6 ? t(n / 1e6) + 'M' : a >= 1e3 ? t(n / 1e3) + 'k' : String(Number(n.toPrecision(4))) }
const fmtNum = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })
const CSS = '.uplot,.uplot *,.uplot *::before,.uplot *::after{box-sizing:border-box}.uplot{font-family:system-ui,sans-serif;line-height:1.5;width:min-content}.u-title{text-align:left;font-size:13px;font-weight:600;padding:6px 0 0 8px}.u-wrap{position:relative;user-select:none}.u-over,.u-under{position:absolute}.u-under{overflow:hidden}.uplot canvas{display:block;position:relative;width:100%;height:100%}.u-axis{position:absolute}.u-legend{font-size:11px;margin:auto;text-align:center}.u-inline{display:block}.u-inline *{display:inline-block}.u-inline tr{margin-right:14px}.u-legend th{font-weight:600}.u-legend th>*{vertical-align:middle;display:inline-block}.u-legend .u-marker{width:1em;height:1em;margin-right:4px;background-clip:padding-box!important}.u-inline.u-live th::after{content:":";vertical-align:middle}.u-inline:not(.u-live) .u-value{display:none}.u-series>*{padding:3px}.u-series th{cursor:pointer}.u-legend .u-off>*{opacity:.3}.u-select{background:rgba(122,162,247,.16);position:absolute;pointer-events:none}.u-cursor-x,.u-cursor-y{position:absolute;left:0;top:0;pointer-events:none;will-change:transform;z-index:100}.u-hz .u-cursor-x,.u-vt .u-cursor-y{height:100%;border-right:1px dashed #8a92a6}.u-hz .u-cursor-y,.u-vt .u-cursor-x{width:100%;border-bottom:1px dashed #8a92a6}.u-cursor-pt{position:absolute;top:0;left:0;border-radius:50%;border:0 solid;pointer-events:none;will-change:transform;z-index:100;background-clip:padding-box!important}.u-axis.u-off,.u-select.u-off,.u-cursor-x.u-off,.u-cursor-y.u-off,.u-cursor-pt.u-off{display:none}'

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'μPlot',
      scripts: ['https://cdn.jsdelivr.net/npm/uplot@1/dist/uPlot.iife.min.js'],
      inputs: [
        { key: 'x', kind: 'column', label: 'X (a timestamp, a number, or the row order)', description: 'Horizontal axis: a timestamp draws a time axis, a number a numeric one, anything else categories' },
        { key: 'series', kind: 'multi-column', label: 'Series (Y)', types: ['numeric'], description: 'One series per column; edit the comma list to add or remove one' },
        { key: 'palette', kind: 'choice', label: 'Palette', options: ['Vivid', 'Cool', 'Warm', 'Mono'], default: 'Vivid' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '1000000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      render: async (root, data, ctx) => {
        const uPlot = /** @type {any} */ (window).uPlot
        if (!uPlot) { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif">μPlot did not load. Allow the CDN host in the Log.</div>'; return }
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const idxs = (inputs.series || '').split(',').map((s) => s.trim()).filter(Boolean).map((n) => cols.findIndex((c) => c.name === n)).filter((i) => i >= 0)
        if (idxs.length === 0) { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif">Pick one or more Y columns (the sliders button in the header).</div>'; return }
        const xi = cols.findIndex((c) => c.name === inputs.x)
        const top = Math.max(1, Number(inputs.top) || 1000000)
        let rows = data.rows || []
        if (top > rows.length && typeof ctx.rows === 'function') {
          try {
            const out = rows.slice()
            while (out.length < top) { const page = await ctx.rows(out.length, Math.min(200000, top - out.length)); if (!page || page.length === 0) break; for (const r of page) out.push(r) }
            rows = out
          } catch (e) { ctx.log('ctx.rows: ' + e) }
        }
        rows = rows.slice(0, top)
        const dark = ctx.theme !== 'light'
        const fg = dark ? '#c8d3f5' : '#3a3f4b', mut = dark ? '#8a92a6' : '#6b7280', line = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
        const palette = palettes[inputs.palette] || palettes.Vivid
        const names = idxs.map((vi) => cols[vi].name)
        const temporal = xi >= 0 && /timestamp|date/i.test(cols[xi].type)
        const time = (v) => { const d = new Date(String(v).replace(' ', 'T').replace(/(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)([+-]\d{2})$/, '$1$2:00')); return isNaN(d.getTime()) ? null : d.getTime() / 1000 }
        const xOf = (r, i) => { if (xi < 0) return i; const v = temporal ? time(r[xi]) : Number(r[xi]); return v == null || !Number.isFinite(v) ? null : v }
        const order = []
        const xr = new Float64Array(rows.length)
        rows.forEach((r, i) => { const x = xOf(r, i); if (x != null) { order.push(i); xr[i] = x } })
        let sorted = true
        for (let k = 1; k < order.length; k++) if (xr[order[k]] < xr[order[k - 1]]) { sorted = false; break }
        if (!sorted) order.sort((a, b) => xr[a] - xr[b])
        const xs = order.map((i) => xr[i])
        const ys = idxs.map((vi) => order.map((i) => { const y = Number(rows[i][vi]); return Number.isFinite(y) ? y : null }))
        if (!xs.length) { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif">No values to plot.</div>'; return }
        const W = root.clientWidth || 640, H = root.clientHeight || 360
        root.innerHTML = ''
        const style = document.createElement('style')
        style.textContent = CSS + '.uplot{color:' + fg + '}.u-legend{color:' + fg + '}'
        root.appendChild(style)
        const el = document.createElement('div')
        root.appendChild(el)
        const axis = { stroke: mut, grid: { stroke: line, width: 1 }, ticks: { stroke: line, width: 1 }, font: '11px system-ui, sans-serif' }
        const opts = {
          title: inputs.title || undefined,
          width: W, height: Math.max(120, H - 34 - (inputs.title ? 30 : 0)),
          scales: { x: { time: temporal } },
          axes: [
            Object.assign({}, axis, temporal ? {} : { values: (u, vals) => vals.map(fmtTick) }),
            Object.assign({}, axis, { size: 58, values: (u, vals) => vals.map(fmtTick) })
          ],
          series: [{ label: xi >= 0 ? cols[xi].name : 'row' }].concat(names.map((nm, s) => ({ label: nm, stroke: palette[s % palette.length], width: 1.5, points: { show: false }, value: (u, v) => (v == null ? '' : fmtNum(v)) }))),
          cursor: { drag: { x: true, y: false }, points: { size: 7 } },
          legend: { live: true }
        }
        if (plot) { plot.destroy(); plot = null }
        plot = new uPlot(opts, [xs].concat(ys), el)
      }
    }
  ]
}
