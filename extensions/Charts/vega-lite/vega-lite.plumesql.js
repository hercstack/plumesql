// @ts-check
// @description Bar / line / area / point / tick with Vega-Lite, which groups and aggregates for you
// @color blue
/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Vega',
      scripts: [
        'https://cdn.jsdelivr.net/npm/vega@5/build/vega.min.js',
        'https://cdn.jsdelivr.net/npm/vega-lite@5/build/vega-lite.min.js',
        'https://cdn.jsdelivr.net/npm/vega-embed@6/build/vega-embed.min.js'
      ],
      inputs: [
        { key: 'mark', kind: 'choice', label: 'Mark', options: ['auto', 'bar', 'line', 'area', 'point', 'tick'], default: 'auto', description: 'auto draws bars for a category X, a line over time, points otherwise' },
        { key: 'x', kind: 'column', label: 'X' },
        { key: 'y', kind: 'column', label: 'Y', types: ['numeric'] },
        { key: 'color', kind: 'column', label: 'Colour', default: '', description: 'Column the marks are coloured by' },
        { key: 'agg', kind: 'choice', label: 'Aggregate Y', options: ['auto', 'none', 'sum', 'mean', 'median', 'count', 'min', 'max'], default: 'auto', description: 'How rows sharing an X fold into one Y; auto takes the mean when a category repeats, else none' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '20000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const xi = cols.findIndex((c) => c.name === inputs.x)
        const yi = cols.findIndex((c) => c.name === inputs.y)
        if (xi < 0 || yi < 0) { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif">Pick an X and a Y column (the sliders button in the header).</div>'; return }
        const gi = cols.findIndex((c) => c.name === inputs.color)
        const top = Math.max(1, Number(inputs.top) || 20000)
        let rows = data.rows || []
        if (top > rows.length && typeof ctx.rows === 'function') { try { rows = await ctx.rows(0, top) } catch (e) { ctx.log('ctx.rows: ' + e) } }
        rows = rows.slice(0, top)
        const num = (v) => v != null && v !== '' && Number.isFinite(Number(v))
        const temporal = /timestamp|date/i.test(cols[xi].type)
        const quant = !temporal && rows.length > 0 && rows.every((r) => num(r[xi]))
        const xType = temporal ? 'temporal' : quant ? 'quantitative' : 'nominal'
        const time = (v) => new Date(String(v).replace(' ', 'T').replace(/(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)([+-]\d{2})$/, '$1$2:00'))
        const values = rows.map((r) => { const o = /** @type {any} */ ({ x: temporal ? time(r[xi]) : quant ? Number(r[xi]) : String(r[xi] == null ? '' : r[xi]), y: Number(r[yi]) }); if (gi >= 0) o.color = String(r[gi] == null ? '' : r[gi]); return o })
        const cats = xType === 'nominal' ? new Set(values.map((v) => v.x)).size : 0
        const mark = !inputs.mark || inputs.mark === 'auto' ? (xType === 'nominal' ? 'bar' : xType === 'temporal' ? 'line' : 'point') : inputs.mark
        const agg = !inputs.agg || inputs.agg === 'auto' ? (xType === 'nominal' && cats < values.length ? 'mean' : 'none') : inputs.agg
        const enc = /** @type {any} */ ({ x: { field: 'x', type: xType, title: cols[xi].name, sort: xType === 'nominal' ? null : undefined }, y: { field: 'y', type: 'quantitative', title: cols[yi].name, aggregate: agg !== 'none' ? agg : undefined } })
        if (gi >= 0) enc.color = { field: 'color', type: 'nominal', title: cols[gi].name }
        const dark = ctx.theme !== 'light'
        const fg = dark ? '#c8d3f5' : '#3a3f4b', mut = dark ? '#8a92a6' : '#6b7280', grid = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', bg = dark ? '#1a1b26' : '#ffffff'
        const palette = ['#7aa2f7', '#f7768e', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#ff9e64', '#41a6b5']
        const W = root.clientWidth || 640, H = root.clientHeight || 360
        const spec = {
          title: inputs.title ? { text: inputs.title, anchor: 'start', color: fg, fontSize: 13, fontWeight: 600, offset: 10 } : undefined,
          width: W, height: H, autosize: { type: 'fit', contains: 'padding' }, padding: 16,
          background: bg,
          data: { values },
          mark: { type: mark, tooltip: true, filled: mark === 'point' ? true : undefined, point: mark === 'line' && values.length <= 60 ? true : undefined },
          encoding: enc,
          config: {
            font: 'system-ui, sans-serif',
            axis: { labelColor: mut, titleColor: fg, gridColor: grid, domainColor: grid, tickColor: grid, labelFontSize: 11, titleFontSize: 11, titleFontWeight: 500, titlePadding: 8, labelPadding: 4 },
            axisX: { labelAngle: cats > 12 ? -45 : 0, grid: xType !== 'nominal' },
            legend: { labelColor: fg, titleColor: mut, labelFontSize: 11, titleFontSize: 11 },
            view: { stroke: 'transparent' },
            range: { category: palette },
            mark: { color: palette[0] },
            bar: { cornerRadiusEnd: 2 }, line: { strokeWidth: 1.8 }, area: { opacity: 0.55, line: true }, point: { size: 46, opacity: 0.75 }, tick: { thickness: 2 }
          }
        }
        const ve = /** @type {any} */ (window).vegaEmbed
        if (!ve) { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif">Vega did not load. Allow the CDN host in the Log.</div>'; return }
        root.innerHTML = ''
        try { await ve(root, /** @type {any} */ (spec), { actions: false, renderer: values.length > 3000 ? 'canvas' : 'svg' }) } catch (e) { ctx.log('vega: ' + (e && e.message ? e.message : e)); throw e }
      }
    }
  ]
}
