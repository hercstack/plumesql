// @ts-check
// @description Line / area / bar / scatter / pie with zoom and a range slider, built for a LOT of rows (ECharts, CDN)
// @color cyan
/** @type {any} */
let chart = null
let csv = ''
const palettes = {
  Vivid: ['#7aa2f7', '#f7768e', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#ff9e64', '#41a6b5'],
  Cool: ['#4c9be8', '#5ec8c8', '#6ee7b7', '#818cf8', '#38bdf8', '#2dd4bf', '#60a5fa', '#34d399'],
  Warm: ['#f97316', '#ef4444', '#f59e0b', '#e11d48', '#fb7185', '#f472b6', '#facc15', '#fb923c'],
  Mono: ['#7aa2f7', '#5b82d9', '#3f63bb', '#8fb3ff', '#274b9d', '#a9c4ff', '#1a3a80', '#c4d6ff']
}
const fmtTick = (v) => { const n = Number(v); if (!Number.isFinite(n)) return ''; const a = Math.abs(n); const t = (x) => String(Number(x.toFixed(1))); return a >= 1e9 ? t(n / 1e9) + 'G' : a >= 1e6 ? t(n / 1e6) + 'M' : a >= 1e3 ? t(n / 1e3) + 'k' : String(Number(n.toPrecision(4))) }

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'ECharts',
      scripts: ['https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'],
      inputs: [
        { key: 'kind', kind: 'choice', label: 'Chart', options: ['line', 'area', 'bar', 'scatter', 'pie'], default: 'line' },
        { key: 'x', kind: 'column', label: 'X (a column, or the row order)', description: 'Horizontal axis: a timestamp draws a time axis, a number a numeric one, anything else categories' },
        { key: 'series', kind: 'multi-column', label: 'Series (Y)', types: ['numeric'], description: 'One series per column; edit the comma list to add or remove one' },
        { key: 'palette', kind: 'choice', label: 'Palette', options: ['Vivid', 'Cool', 'Warm', 'Mono'], default: 'Vivid' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '1000000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      actions: [{ label: 'Copy data', run: (ctx) => ctx.copy(csv) }],
      render: async (root, data, ctx) => {
        const echarts = /** @type {any} */ (window).echarts
        if (!echarts) { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif">ECharts did not load. Allow the CDN host in the Log.</div>'; return }
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const idxs = (inputs.series || '').split(',').map((s) => s.trim()).filter(Boolean).map((n) => cols.findIndex((c) => c.name === n)).filter((i) => i >= 0)
        if (idxs.length === 0) { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif">Pick one or more Y columns (the sliders button in the header).</div>'; return }
        const xi = cols.findIndex((c) => c.name === inputs.x)
        const kind = inputs.kind || 'line'
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
        const pane = dark ? '#1f2030' : '#f4f5f8', bg = dark ? '#1a1b26' : '#ffffff', accent = dark ? '#7aa2f7' : '#5a8bf0'
        const palette = palettes[inputs.palette] || palettes.Vivid
        const names = idxs.map((vi) => cols[vi].name)
        const temporal = xi >= 0 && /timestamp|date/i.test(cols[xi].type)
        const numeric = xi >= 0 && /int|numeric|decimal|real|double|float|serial/i.test(cols[xi].type)
        const time = (v) => { const d = new Date(String(v).replace(' ', 'T').replace(/(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)([+-]\d{2})$/, '$1$2:00')); return isNaN(d.getTime()) ? null : d.getTime() }
        const xOf = (r, i) => (xi < 0 ? i : temporal ? time(r[xi]) : numeric ? Number(r[xi]) : String(r[xi] == null ? '' : r[xi]))
        const axisType = temporal ? 'time' : numeric || xi < 0 ? 'value' : 'category'
        const xs = rows.map(xOf)
        csv = (xi >= 0 ? cols[xi].name : 'row') + ',' + names.join(',') + '\n' + rows.map((r, i) => String(xs[i]) + ',' + idxs.map((vi) => Number(r[vi])).join(',')).join('\n')
        if (chart) { chart.dispose(); chart = null }
        root.innerHTML = ''
        const el = document.createElement('div')
        el.style.cssText = 'width:100%;height:100%'
        root.appendChild(el)
        chart = echarts.init(el, null, { renderer: 'canvas' })
        const title = inputs.title ? { text: inputs.title, left: 12, top: 8, textStyle: { color: fg, fontSize: 13, fontWeight: 600 } } : undefined
        const tooltip = { backgroundColor: pane, borderColor: line, textStyle: { color: fg, fontSize: 11 }, trigger: kind === 'scatter' ? 'item' : 'axis', axisPointer: { type: 'cross', lineStyle: { color: mut }, crossStyle: { color: mut }, label: { backgroundColor: pane, color: fg } } }
        let option
        if (kind === 'pie') {
          const vi = idxs[0]
          const slices = rows.slice(0, 40).map((r, i) => ({ name: xi >= 0 ? String(r[xi] == null ? '' : r[xi]) : String(i + 1), value: Number(r[vi]) || 0 }))
          option = { backgroundColor: 'transparent', color: palette, title, tooltip: { backgroundColor: pane, borderColor: line, textStyle: { color: fg, fontSize: 11 }, trigger: 'item' }, legend: { type: 'scroll', bottom: 4, textStyle: { color: mut } }, series: [{ type: 'pie', name: cols[vi].name, radius: ['38%', '68%'], center: ['50%', '48%'], data: slices, label: { color: fg }, itemStyle: { borderColor: bg, borderWidth: 1 } }] }
        } else {
          const series = idxs.map((vi, s) => {
            const pts = []
            for (let i = 0; i < rows.length; i++) { const x = xs[i]; if (x == null) continue; const y = Number(rows[i][vi]); pts.push(axisType === 'category' ? (Number.isFinite(y) ? y : null) : [x, Number.isFinite(y) ? y : null]) }
            const colour = palette[s % palette.length]
            return {
              name: cols[vi].name, type: kind === 'area' ? 'line' : kind, data: pts,
              showSymbol: false, symbolSize: kind === 'scatter' ? 4 : 6,
              sampling: kind === 'line' || kind === 'area' ? 'lttb' : undefined,
              large: kind === 'scatter' || kind === 'bar', largeThreshold: 2000, progressive: 4000, progressiveThreshold: 4000,
              lineStyle: { width: 1.5 }, areaStyle: kind === 'area' ? { opacity: 0.22 } : undefined,
              itemStyle: { color: colour }, emphasis: { focus: 'series' }
            }
          })
          option = {
            backgroundColor: 'transparent', color: palette, title, tooltip,
            legend: names.length > 1 ? { top: inputs.title ? 32 : 6, textStyle: { color: mut } } : undefined,
            grid: { left: 62, right: 24, top: inputs.title ? 66 : names.length > 1 ? 44 : 26, bottom: 78 },
            xAxis: { type: axisType, data: axisType === 'category' ? xs : undefined, name: xi >= 0 ? cols[xi].name : 'row', nameLocation: 'middle', nameGap: 24, nameTextStyle: { color: mut }, axisLine: { lineStyle: { color: line } }, axisLabel: { color: mut, formatter: axisType === 'value' ? fmtTick : undefined }, splitLine: { show: axisType !== 'category', lineStyle: { color: line } } },
            yAxis: { type: 'value', name: names.length === 1 ? names[0] : '', nameTextStyle: { color: mut, align: 'left' }, axisLabel: { color: mut, formatter: fmtTick }, splitLine: { lineStyle: { color: line } }, axisLine: { show: false } },
            dataZoom: [
              { type: 'inside' },
              { type: 'slider', height: 20, bottom: 10, borderColor: line, backgroundColor: 'transparent', fillerColor: dark ? 'rgba(122,162,247,0.18)' : 'rgba(90,139,240,0.15)', handleStyle: { color: accent, borderColor: accent }, moveHandleStyle: { color: accent }, dataBackground: { lineStyle: { color: mut }, areaStyle: { color: line } }, selectedDataBackground: { lineStyle: { color: accent }, areaStyle: { color: accent, opacity: 0.2 } }, textStyle: { color: mut } }
            ],
            animation: rows.length < 5000,
            series
          }
        }
        chart.setOption(option)
      }
    }
  ]
}
