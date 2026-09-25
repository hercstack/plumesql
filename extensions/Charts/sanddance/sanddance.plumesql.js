// @ts-check
// @description A configurable 2D / 3D explorer for a LOT of points: scatter, bars, stacks, treemap, density, facets
// @color purple
/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'SandDance',
      // A right drag rotates the 3D view, so no host menu on right-click.
      contextMenu: false,
      scripts: [
        'https://cdn.jsdelivr.net/npm/vega@6/build/vega.min.js',
        'https://cdn.jsdelivr.net/npm/@msrvida/sanddance@4/dist/umd/sanddance.js'
      ],
      inputs: [
        { key: 'chart', kind: 'choice', label: 'Chart', options: ['scatterplot', 'barchart', 'barchartV', 'barchartH', 'density', 'stacks', 'strips', 'grid', 'treemap'], default: 'scatterplot', description: 'barchart picks horizontal or vertical from the data; barchartV and barchartH force one' },
        { key: 'view', kind: 'choice', label: 'View', options: ['3d', '2d'], default: '3d', description: '3d can be rotated with a right drag; 2d is flat' },
        { key: 'x', kind: 'column', label: 'X' },
        { key: 'y', kind: 'column', label: 'Y' },
        { key: 'z', kind: 'column', label: 'Z (height, 3D)', default: '', description: 'Column drawn as height in the 3d view' },
        { key: 'color', kind: 'column', label: 'Colour', default: '', description: 'Column the marks are coloured by' },
        { key: 'size', kind: 'column', label: 'Size', types: ['numeric'], default: '', description: 'Numeric column that scales each mark' },
        { key: 'sort', kind: 'column', label: 'Sort by', default: '', description: 'Column the marks are ordered by' },
        { key: 'facet', kind: 'column', label: 'Facet (small multiples)', default: '', description: 'Splits the chart into a grid of small multiples, one per distinct value' },
        { key: 'scheme', kind: 'choice', label: 'Colours', options: ['category20', 'category10', 'tableau20', 'tableau10', 'dark2', 'paired', 'viridis', 'magma', 'inferno', 'plasma', 'turbo', 'blues', 'greens', 'reds', 'spectral', 'blueorange', 'redblue', 'rainbow'], default: 'category20', description: 'Vega colour scheme: category and tableau sets are categorical, the rest are ramps for numbers' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '20000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      resize: (root, size) => {
        const s = /** @type {any} */ (root).__sanddance
        if (!s || !s.viewer) throw new Error('no SandDance scene to resize')
        const W = Math.max(120, size.width), H = Math.max(80, size.height)
        const cw = Math.max(120, W - s.PANEL)
        s.el.style.width = W + 'px'
        s.el.style.height = H + 'px'
        const pres = s.viewer.presenter
        const core = pres && pres.morphchartsref && pres.morphchartsref.core
        const renderer = core && core._renderer
        if (!renderer || typeof renderer.setSize !== 'function') throw new Error('this SandDance build exposes no resizable renderer')
        const gl = s.el.querySelector('.sanddance-gl')
        if (gl) { gl.style.width = cw + 'px'; gl.style.height = H + 'px' }
        if (core._container && core._container.style) { core._container.style.width = cw + 'px'; core._container.style.height = H + 'px' }
        renderer.setSize(cw, H)
        if (s.viewer.insight && s.viewer.insight.size) s.viewer.insight.size = { width: cw, height: H }
      },
      render: async (root, data, ctx) => {
        const SD = /** @type {any} */ (window).SandDance
        const vega = /** @type {any} */ (window).vega
        if (!SD || !vega) { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif">SandDance did not load. Allow the CDN host in the Log.</div>'; return }
        SD.use(vega)
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const top = Math.max(1, Number(inputs.top) || 20000)
        let rows = data.rows || []
        if (top > rows.length && typeof ctx.rows === 'function') { try { rows = await ctx.rows(0, top) } catch (e) { ctx.log('ctx.rows: ' + e) } }
        rows = rows.slice(0, top)
        const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v))) ? Number(v) : v
        const values = rows.map((r) => { const o = /** @type {any} */ ({}); cols.forEach((c, i) => { o[c.name] = num(r[i]) }); return o })
        const view = inputs.view || '3d'
        const columns = /** @type {any} */ ({})
        const put = (role, key) => { if (inputs[key] && cols.some((c) => c.name === inputs[key])) columns[role] = inputs[key] }
        put('x', 'x'); put('y', 'y'); put('color', 'color'); put('size', 'size'); put('sort', 'sort'); put('facet', 'facet')
        if (view === '3d') put('z', 'z')
        const W = root.clientWidth || 640, H = root.clientHeight || 380
        const dark = ctx.theme !== 'light'
        const fg = dark ? '#c8d3f5' : '#3a3f4b', mut = dark ? '#8a92a6' : '#6b7280'
        const bg = dark ? '#1a1b26' : '#ffffff', pane = dark ? '#1f2030' : '#f4f5f8'
        const line = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)', accent = dark ? '#7aa2f7' : '#5a8bf0'
        const PANEL = 220
        root.innerHTML = ''
        const style = document.createElement('style')
        style.textContent = [
          '.sanddance-root{display:flex;width:100%;height:100%;font:12px system-ui,sans-serif;color:' + fg + ';background:' + bg + '}',
          '.sanddance-gl{flex:1 1 auto;min-width:0;min-height:0}',
          '.sanddance-panel{flex:0 0 ' + PANEL + 'px;box-sizing:border-box;overflow:auto;padding:10px 12px;border-left:1px solid ' + line + ';background:' + pane + ';display:flex;flex-direction:column}',
          '.sanddance-panel>*{flex-shrink:0}',
          '.sanddance-panel h4{margin:10px 0 6px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:' + mut + '}',
          '.sanddance-panel h4:first-child{margin-top:0}',
          '.vega-bindings{display:flex;flex-direction:column;gap:7px}',
          '.vega-bind label{display:flex;flex-wrap:wrap;align-items:center;gap:3px 8px}',
          '.vega-bind-name{flex:1 0 100%;font-size:11px;color:' + mut + '}',
          '.vega-bind label:has(input[type=checkbox]) .vega-bind-name{flex:1 1 auto}',
          '.vega-bind input[type=range]{flex:1 1 60px;min-width:0;margin:0;accent-color:' + accent + '}',
          '.vega-bind input[type=checkbox]{margin:0;accent-color:' + accent + '}',
          '.vega-bind label>span:last-child:not(.vega-bind-name){min-width:2.4em;text-align:right;font-variant-numeric:tabular-nums}',
          '.sanddance-selection{display:flex;flex-wrap:wrap;gap:6px}',
          '.sanddance-panel button{font:inherit;font-size:11px;padding:4px 9px;border:1px solid ' + line + ';border-radius:5px;background:transparent;color:' + fg + ';cursor:pointer}',
          '.sanddance-panel button:hover:not(:disabled){border-color:' + mut + '}',
          '.sanddance-panel button:disabled{opacity:.4;cursor:default}',
          '.sanddance-unitControls{order:1;margin-top:6px}',
          '.sanddance-panel>h4:has(+.sanddance-legend){order:2}',
          '.sanddance-legend{order:2;margin:6px 0}',
          '.sanddance-details{font-size:11px;color:' + mut + '}',
          '.sanddance-hint{font-size:11px;line-height:1.35;color:' + mut + ';margin:0 0 8px;padding-bottom:8px;border-bottom:1px solid ' + line + '}'
        ].join('')
        root.appendChild(style)
        const el = document.createElement('div'); el.style.cssText = 'width:' + W + 'px;height:' + H + 'px;position:relative'; root.appendChild(el)
        const insight = /** @type {any} */ ({ chart: inputs.chart || 'scatterplot', columns, view, scheme: inputs.scheme || 'category20', size: { width: Math.max(120, W - PANEL), height: H } })
        if (columns.facet) insight.facetStyle = 'wrap'
        const keep = /** @type {any} */ (root)
        keep.__sanddance = { el, PANEL }
        const viewer = new SD.Viewer(el, { colors: { backgroundColor: bg, axisLine: mut, axisText: fg, gridLine: line, defaultCube: accent, hoveredCube: dark ? '#f7768e' : '#e06c75', selectedCube: dark ? '#e0af68' : '#d19a30', activeCube: dark ? '#bb9af7' : '#8b5cf6' } })
        keep.__sanddance.viewer = viewer
        try { await viewer.render({ insight }, values) } catch (e) { ctx.log('sanddance: ' + (e && e.message ? e.message : e)); throw e }
        const panel = el.querySelector('.sanddance-panel')
        if (panel) {
          const hint = document.createElement('div')
          hint.className = 'sanddance-hint'
          hint.textContent = view === '3d'
            ? 'Drag to pan, right drag to rotate, wheel to zoom. Click a cube to select it; the view menu is the header\u2019s \u22ef button.'
            : 'Drag to pan, wheel to zoom. Click a mark to select it; the view menu is the header\u2019s \u22ef button.'
          panel.prepend(hint)
        }
      }
    }
  ]
}
