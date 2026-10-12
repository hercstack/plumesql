// @ts-check
// @description Geometry on a real map: points, lines and polygons over an OpenStreetMap basemap, coloured, sized and raised by columns; tilt it to read heights (MapLibre)
// @color green
import { parseEWKB, parseEWKT } from '$ext/postgis/lib/wkb.js'

// The basemap is the USER's (ctx.mapStyle, the extensions.mapStyle setting:
// OpenFreeMap's Positron unless they chose another), and PlumeSQL fetches its
// files for the view, from a host on their allowed map tile hosts only
// (ctx.fetchMap): the view has no network and names no host of its own.
// The categories a colour column shows by name; the rest share one colour.
const MAX_CATS = 12

/** @type {any} */
let map = null
/** @type {any} */
let fitTo = null
let tilted = false
// The render whose ctx the custom protocol fetches through: one handler for
// the iframe's life, reading the latest.
/** @type {any} */
let fetchCtx = null
let protocolReady = false

const esc = (/** @type {unknown} */ s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c)
const num = (/** @type {unknown} */ v) => (v == null || v === '' ? NaN : Number(v))
const show = (/** @type {unknown} */ v) => (v == null ? 'NULL' : String(v))
const message = (/** @type {HTMLElement} */ root, /** @type {string} */ text) => {
  root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif">' + esc(text) + '</div>'
}
// A state the query can change, said calmly: what the map needs, the change
// to make as a line to copy, and where it is made in one click.
const notice = (/** @type {HTMLElement} */ root, /** @type {any} */ ctx, /** @type {any} */ th, /** @type {{ title: string, body: string, code?: string, hint?: string }} */ n) => {
  const code = n.code
    ? '<div style="display:flex;align-items:center;gap:8px;margin:10px 0">' +
      '<code style="flex:0 1 auto;padding:6px 10px;border:1px solid ' + th.line + ';border-radius:4px;background:' + th.pane + ';color:' + th.fg + ';font:12px ui-monospace,SFMono-Regular,Menlo,monospace;user-select:text;overflow-wrap:anywhere">' + esc(n.code) + '</code>' +
      '<button type="button" data-copy style="flex:none;padding:4px 10px;border:1px solid ' + th.line + ';border-radius:4px;background:transparent;color:' + th.fg + ';font:12px system-ui,sans-serif;cursor:pointer">Copy</button></div>'
    : ''
  root.innerHTML =
    '<div style="padding:16px;max-width:620px;font:13px/1.5 system-ui,sans-serif;color:' + th.muted + '">' +
    '<div style="color:' + th.fg + ';font-weight:600;margin-bottom:4px">' + esc(n.title) + '</div>' +
    '<div>' + esc(n.body) + '</div>' + code +
    (n.hint ? '<div>' + esc(n.hint) + '</div>' : '') + '</div>'
  const btn = root.querySelector('[data-copy]')
  if (btn && n.code) btn.addEventListener('click', () => ctx.copy(n.code))
}
const fmtTick = (/** @type {number} */ n) => {
  if (!Number.isFinite(n)) return ''
  const a = Math.abs(n)
  const t = (/** @type {number} */ x) => String(Number(x.toFixed(1)))
  return a >= 1e9 ? t(n / 1e9) + 'G' : a >= 1e6 ? t(n / 1e6) + 'M' : a >= 1e3 ? t(n / 1e3) + 'k' : String(Number(n.toPrecision(4)))
}

// ─── Theme ───────────────────────────────────────────────────────────────────
// The colours the map's own layers and its panels paint with: the curated set
// under Dark and Light, a theme extension's roles (ctx.palette) under others.
const themeOf = (/** @type {any} */ ctx) => {
  const dark = ctx.theme !== 'light'
  const p = ctx.palette && ctx.palette.id !== 'dark' && ctx.palette.id !== 'light' ? ctx.palette : null
  const series = p
    ? [...new Set(['accent', 'red', 'green', 'amber', 'violet', 'keyword', 'string', 'number', 'type', 'func'].map((k) => p[k]).filter((c) => /^#[0-9a-f]{6}$/i.test(String(c))))]
    : ['#7aa2f7', '#f7768e', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#ff9e64', '#41a6b5', '#c0caf5', '#73daca', '#db4b4b', '#ff007c']
  return {
    dark,
    fg: p ? p.text : dark ? '#c8d3f5' : '#3a3f4b',
    muted: p ? p.muted : dark ? '#8a92a6' : '#6b7280',
    pane: p ? p.background : dark ? '#1f2030' : '#f4f5f8',
    ground: p ? p.surface || p.background : dark ? '#1a1b26' : '#ffffff',
    line: p ? p.border : dark ? '#3b3f52' : '#d4d7de',
    accent: p ? p.accent : dark ? '#7aa2f7' : '#5a8bf0',
    series,
    ramp: p ? [p.accent, p.amber, p.red] : ['#7aa2f7', '#e0af68', '#f7768e']
  }
}
const hexRgb = (/** @type {string} */ hex) => {
  const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rampHex = (/** @type {string[]} */ stops, /** @type {number} */ t) => {
  const u = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(u)), f = u - i
  const a = hexRgb(stops[i]), b = hexRgb(stops[i + 1])
  return '#' + a.map((x, k) => Math.round(x + (b[k] - x) * f).toString(16).padStart(2, '0')).join('')
}

// ─── A dark basemap ──────────────────────────────────────────────────────────
// A light basemap under a dark base turns over: each colour of the style
// keeps its hue, its lightness inverted and its saturation softened, so the
// land goes dark, the water darker and the labels light.
const parseColor = (/** @type {string} */ c) => {
  const s = c.trim().toLowerCase()
  let m = /^#([0-9a-f]{3,8})$/.exec(s)
  if (m) {
    const h = m[1].length <= 4 ? m[1].split('').map((x) => x + x).join('') : m[1]
    const n = parseInt(h.slice(0, 6), 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 }
  }
  m = /^rgba?\(([^)]+)\)$/.exec(s)
  if (m) {
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }
  }
  m = /^hsla?\(([^)]+)\)$/.exec(s)
  if (m) {
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map((x) => parseFloat(x))
    const h = (p[0] % 360) / 360, sat = p[1] / 100, l = p[2] / 100
    const f = (/** @type {number} */ n) => {
      const k = (n + h * 12) % 12
      return l - sat * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    }
    return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a: p[3] ?? 1 }
  }
  return null
}
const turnDark = (/** @type {string} */ c) => {
  const p = parseColor(c)
  if (!p) return c
  const r = p.r / 255, g = p.g / 255, b = p.b / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  const l2 = 0.1 + (1 - l) * 0.78
  return `hsla(${Math.round(h * 360)}, ${Math.round(s * 70)}%, ${Math.round(l2 * 100)}%, ${p.a})`
}
const darkenValue = (/** @type {any} */ v) => (typeof v === 'string' ? turnDark(v) : Array.isArray(v) ? v.map(darkenValue) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, darkenValue(x)])) : v)
const darkStyle = (/** @type {any} */ style) => {
  for (const layer of style.layers || []) {
    for (const part of ['paint']) {
      const props = layer[part]
      if (!props) continue
      for (const k of Object.keys(props)) if (/-color$/.test(k)) props[k] = darkenValue(props[k])
    }
  }
  return style
}

// ─── Geometry ────────────────────────────────────────────────────────────────
// A cell as a geometry: PostGIS's EWKB hex (a geometry or geography column as
// the result holds it), GeoJSON text (ST_AsGeoJSON) or EWKT and WKT text
// (ST_AsEWKT, ST_AsText). Answers GeoJSON and the SRID it came with.
/** @returns {{ geo: any, srid: number | undefined } | null} */
const readGeometry = (/** @type {unknown} */ cell) => {
  if (cell == null) return null
  const t = String(cell).trim()
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t)
      const geo = j.type === 'Feature' ? j.geometry : j
      return geo && geo.type ? { geo, srid: undefined } : null
    } catch {
      return null
    }
  }
  const g = parseEWKB(t) ?? parseEWKT(t)
  return g ? { geo: toGeoJSON(g), srid: g.srid } : null
}
/** @returns {any} */
const toGeoJSON = (/** @type {any} */ g) => {
  const xy = (/** @type {number[]} */ c) => [c[0], c[1]]
  switch (g.kind) {
    case 'Point': return { type: 'Point', coordinates: xy(g.point) }
    case 'LineString': return { type: 'LineString', coordinates: g.points.map(xy) }
    case 'Polygon': return { type: 'Polygon', coordinates: g.rings.map((/** @type {number[][]} */ r) => r.map(xy)) }
    case 'MultiPoint': return { type: 'MultiPoint', coordinates: g.points.map(xy) }
    case 'MultiLineString': return { type: 'MultiLineString', coordinates: g.rings.map((/** @type {number[][]} */ r) => r.map(xy)) }
    case 'MultiPolygon': return { type: 'MultiPolygon', coordinates: g.polygons.map((/** @type {number[][][]} */ p) => p.map((r) => r.map(xy))) }
    default: return { type: 'GeometryCollection', geometries: (g.members || []).map(toGeoJSON) }
  }
}
// Every coordinate of a GeoJSON geometry.
const eachCoord = (/** @type {any} */ geo, /** @type {(c: number[]) => void} */ fn) => {
  if (!geo) return
  if (geo.type === 'GeometryCollection') { for (const m of geo.geometries || []) eachCoord(m, fn); return }
  const walk = (/** @type {any} */ c) => { if (typeof c[0] === 'number') fn(c); else for (const x of c) walk(x) }
  if (geo.coordinates) walk(geo.coordinates)
}
// The kinds of shape a geometry holds, for the layer each goes to.
const shapeOf = (/** @type {any} */ geo) => (/Point/.test(geo.type) ? 'point' : /LineString/.test(geo.type) ? 'line' : /Polygon/.test(geo.type) ? 'polygon' : 'mixed')
// A square around a point, `half` degrees of latitude from its centre, as a
// polygon a column stands on (wider in longitude by the latitude's cosine,
// so it stays square on the map).
const squareAround = (/** @type {number[]} */ c, /** @type {number} */ half) => {
  const dx = half / Math.max(0.15, Math.cos((c[1] * Math.PI) / 180))
  return { type: 'Polygon', coordinates: [[[c[0] - dx, c[1] - half], [c[0] + dx, c[1] - half], [c[0] + dx, c[1] + half], [c[0] - dx, c[1] + half], [c[0] - dx, c[1] - half]]] }
}

// The custom protocol every request of the map goes through: plumesql://
// stands for https://, and the file comes from ctx.fetchMap, never the
// network.
const ensureProtocol = (/** @type {any} */ gl) => {
  if (protocolReady) return
  protocolReady = true
  gl.addProtocol('plumesql', async (/** @type {any} */ params) => {
    const url = 'https://' + String(params.url).slice('plumesql://'.length)
    const buf = await fetchCtx.fetchMap(url)
    if (params.type === 'json') return { data: JSON.parse(new TextDecoder().decode(buf)) }
    if (params.type === 'string') return { data: new TextDecoder().decode(buf) }
    return { data: buf }
  })
}

// MapLibre's own stylesheet, the parts this view uses: the canvas placed in
// its container, and a grab cursor.
const CSS =
  '.maplibregl-map{position:relative;overflow:hidden;width:100%;height:100%;font:12px system-ui,sans-serif}' +
  '.maplibregl-canvas-container,.maplibregl-canvas{position:absolute;left:0;top:0}' +
  '.maplibregl-canvas-container.maplibregl-interactive{cursor:grab}' +
  '.maplibregl-canvas-container.maplibregl-interactive:active{cursor:grabbing}' +
  '.maplibregl-control-container{display:none}'

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Map',
      // MapLibre's right button rotates and tilts, so the app's view menu
      // stays on the header's dots button.
      contextMenu: false,
      scripts: ['https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js'],
      inputs: [
        { key: 'geometry', kind: 'column', label: 'Geometry', description: 'A geometry or geography column in WGS 84 (SRID 4326), or GeoJSON or WKT text' },
        { key: 'color', kind: 'column', label: 'Colour by', default: '', description: 'A number (a ramp) or a category (a colour each); none paints every shape alike' },
        { key: 'height', kind: 'column', label: 'Height', types: ['numeric'], default: '', description: 'A number that raises polygons, and points as columns; tilt the map to read it' },
        { key: 'size', kind: 'column', label: 'Size by', types: ['numeric'], default: '', description: 'A number a point grows with' },
        { key: 'label', kind: 'column', label: 'Label', default: '', description: 'What the tooltip names a shape by' },
        { key: 'basemap', kind: 'choice', label: 'Basemap', options: ['theme', 'original', 'none'], default: 'theme', description: 'The basemap from your Map basemap style setting: theme turns it dark under a dark theme, original keeps its own colours, none draws the rows on a plain background' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '20000', description: 'How many rows the view reads from the result, from the first one' }
      ],
      actions: [
        { label: 'Reset view', run: () => { if (map && fitTo) map.fitBounds(fitTo, { padding: 48, maxZoom: 15, duration: 400, pitch: tilted ? 55 : 0, bearing: 0 }) } },
        { label: 'Tilt', run: () => { if (map) { tilted = !tilted; map.easeTo({ pitch: tilted ? 55 : 0, duration: 500 }) } } }
      ],
      render: async (root, data, ctx) => {
        if (map) { try { map.remove() } catch { /* already gone */ } map = null }
        const gl = /** @type {any} */ (globalThis).maplibregl
        if (!gl) { message(root, 'MapLibre did not load: cdn.jsdelivr.net has to be an allowed remote script host (the Log offers Allow).'); return }
        fetchCtx = ctx
        ensureProtocol(gl)
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const at = (/** @type {unknown} */ name) => cols.findIndex((c) => c.name === name)
        const gi = at(inputs.geometry), ci = at(inputs.color), hi = at(inputs.height), si = at(inputs.size), li = at(inputs.label)
        if (gi < 0) { message(root, 'Pick the Geometry column (the sliders button in the header).'); return }
        let rows = data.rows || []
        const top = Math.max(1, Number(inputs.top) || 20000)
        if (top > rows.length && typeof ctx.rows === 'function') {
          try { rows = rows.concat(await ctx.rows(rows.length, top - rows.length)) } catch (e) { ctx.log('ctx.rows: ' + e) }
        }
        rows = rows.slice(0, top)
        const th = themeOf(ctx)

        // The shapes: each row's geometry as GeoJSON, in WGS 84. Another
        // SRID cannot be placed on the map without a transform the client
        // cannot know; the notice names the one to add to the query.
        /** @type {{ row: number, geo: any }[]} */
        const shapes = []
        /** @type {Map<number, number>} */
        const srids = new Map()
        let unread = 0
        rows.forEach((r, i) => {
          const g = readGeometry(r[gi])
          if (!g) { if (r[gi] != null) unread++; return }
          if (g.srid) srids.set(g.srid, (srids.get(g.srid) || 0) + 1)
          shapes.push({ row: i, geo: g.geo })
        })
        const foreign = [...srids.keys()].filter((s) => s !== 4326)
        if (foreign.length) {
          const col = cols[gi].name
          notice(root, ctx, th, {
            title: 'The map needs longitude and latitude',
            body: `${col} is in SRID ${foreign.join(', ')}; the map places WGS 84 (SRID 4326). Select it transformed:`,
            code: `ST_Transform(${col}, 4326) as ${col}`,
            hint: 'With PostGIS refactors installed, the lightbulb on the statement makes this change in one click (Transform to WGS 84).'
          })
          return
        }
        if (!shapes.length) { message(root, unread ? 'The Geometry column holds nothing that reads as a geometry.' : 'No row has a geometry to place.'); return }
        if (unread) ctx.log(`Map: ${unread} rows left out, their geometry unreadable`)
        let outside = false
        for (const s of shapes) eachCoord(s.geo, (c) => { if (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) outside = true })
        if (outside) {
          const col = cols[gi].name
          notice(root, ctx, th, {
            title: 'The map needs longitude and latitude',
            body: `${col} holds coordinates outside longitude and latitude. Transform them to WGS 84 (SRID 4326) in the query, from the SRID they were made in:`,
            code: `ST_Transform(ST_SetSRID(${col}, <srid>), 4326) as ${col}`
          })
          return
        }

        // The extent the map fits to, and a size for the columns points
        // become when they are raised.
        const ext = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
        for (const s of shapes) eachCoord(s.geo, (c) => {
          if (c[0] < ext.minX) ext.minX = c[0]
          if (c[0] > ext.maxX) ext.maxX = c[0]
          if (c[1] < ext.minY) ext.minY = c[1]
          if (c[1] > ext.maxY) ext.maxY = c[1]
        })
        if (!Number.isFinite(ext.minX)) { message(root, 'No row has a coordinate to place.'); return }
        const spanDeg = Math.max(ext.maxX - ext.minX, ext.maxY - ext.minY, 0.002)
        const spanM = spanDeg * 111320

        // Colour, size and height per row, ready for the layers to read.
        const numeric = ci >= 0 && /int|numeric|decimal|real|double|float|money/i.test(cols[ci].type || '')
        let cLo = Infinity, cHi = -Infinity
        if (numeric) for (const s of shapes) { const v = num(rows[s.row][ci]); if (Number.isFinite(v)) { if (v < cLo) cLo = v; if (v > cHi) cHi = v } }
        /** @type {Map<string, number>} */
        const cats = new Map()
        if (ci >= 0 && !numeric) {
          /** @type {Map<string, number>} */
          const freq = new Map()
          for (const s of shapes) { const k = show(rows[s.row][ci]); freq.set(k, (freq.get(k) || 0) + 1) }
          ;[...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CATS).forEach(([k], i) => cats.set(k, i))
        }
        const colorOf = (/** @type {number} */ row) => {
          if (numeric) { const v = num(rows[row][ci]); return Number.isFinite(v) ? rampHex(th.ramp, (v - cLo) / (cHi - cLo || 1)) : th.muted }
          if (ci >= 0) { const c = cats.get(show(rows[row][ci])); return c === undefined ? th.muted : th.series[c % th.series.length] }
          return th.accent
        }
        let hMax = 0
        if (hi >= 0) for (const s of shapes) { const v = num(rows[s.row][hi]); if (Number.isFinite(v) && v > hMax) hMax = v }
        let sMax = 0
        if (si >= 0) for (const s of shapes) { const v = num(rows[s.row][si]); if (Number.isFinite(v) && v > sMax) sMax = v }
        // The tallest shape stands a quarter of the data's span high.
        const heightOf = (/** @type {number} */ row) => { const v = num(rows[row][hi]); return Number.isFinite(v) && v > 0 && hMax > 0 ? (v / hMax) * spanM * 0.25 : 0 }
        const radiusOf = (/** @type {number} */ row) => { if (si < 0) return 4.5; const v = num(rows[row][si]); return Number.isFinite(v) && v > 0 && sMax > 0 ? 2.5 + 8 * Math.sqrt(v / sMax) : 2.5 }

        /** @type {any[]} */ const polys = []
        /** @type {any[]} */ const lines = []
        /** @type {any[]} */ const points = []
        const half = spanDeg * 0.006
        for (const s of shapes) {
          const props = { row: s.row, color: colorOf(s.row), h: hi >= 0 ? heightOf(s.row) : 0, r: radiusOf(s.row) }
          const feature = (/** @type {any} */ geometry) => ({ type: 'Feature', id: s.row, properties: props, geometry })
          const kind = shapeOf(s.geo)
          if (kind === 'polygon') polys.push(feature(s.geo))
          else if (kind === 'line') lines.push(feature(s.geo))
          else if (kind === 'point') {
            // Raised, a point becomes a column on a small square.
            if (hi >= 0) eachCoord(s.geo, (c) => polys.push(feature(squareAround(c, half))))
            else points.push(feature(s.geo))
          } else for (const g of s.geo.geometries || []) {
            const k = shapeOf(g)
            ;(k === 'polygon' ? polys : k === 'line' ? lines : points).push(feature(g))
          }
        }

        // The basemap: the user's style, fetched through PlumeSQL; on a host
        // not allowed (or no network and no copy) the rows are drawn on a
        // plain background, and the Log has the button that allows it.
        const choice = String(inputs.basemap || 'theme')
        const styleUrl = choice === 'none' ? '' : String(ctx.mapStyle || '')
        /** @type {any} */
        let style = { version: 8, sources: {}, layers: [{ id: 'ground', type: 'background', paint: { 'background-color': th.ground } }] }
        let note = ''
        if (styleUrl) {
          try {
            const buf = await ctx.fetchMap(styleUrl)
            style = JSON.parse(new TextDecoder().decode(buf))
            if (choice === 'theme' && th.dark) darkStyle(style)
          } catch (e) {
            note = 'No basemap: ' + (/** @type {any} */ (e)?.message || 'the style could not be loaded') + '. The Log can allow the host.'
          }
        }

        root.innerHTML = ''
        root.style.position = 'relative'
        root.style.overflow = 'hidden'
        const css = document.createElement('style')
        css.textContent = CSS
        root.appendChild(css)
        const box = document.createElement('div')
        box.style.cssText = 'position:absolute;inset:0'
        root.appendChild(box)
        const panel = (/** @type {string} */ place) => {
          const el = document.createElement('div')
          el.style.cssText = 'position:absolute;' + place + ';font:11px system-ui,sans-serif;color:' + th.fg + ';background:' + th.pane + ';border:1px solid ' + th.line + ';border-radius:5px;padding:5px 8px;z-index:2;pointer-events:none'
          root.appendChild(el)
          return el
        }
        fitTo = [[ext.minX, ext.minY], [ext.maxX, ext.maxY]]
        tilted = hi >= 0
        const m = new gl.Map({
          container: box,
          style,
          attributionControl: false,
          bounds: fitTo,
          fitBoundsOptions: { padding: 48, maxZoom: 15 },
          pitch: tilted ? 55 : 0,
          maxPitch: 75,
          transformRequest: (/** @type {string} */ url) => ({ url: url.startsWith('https://') ? 'plumesql://' + url.slice(8) : url }),
          canvasContextAttributes: { preserveDrawingBuffer: true }
        })
        map = m
        // The first failure is worth a line; a map without a network fails
        // once per tile, and those would bury the Log.
        let failed = false
        m.on('error', (/** @type {any} */ e) => {
          if (failed || !e || !e.error) return
          failed = true
          ctx.log('Map: ' + (e.error.message || e.error))
        })

        const hover = th.dark ? '#ffffff' : '#000000'
        const paintColor = ['case', ['boolean', ['feature-state', 'hover'], false], hover, ['get', 'color']]
        /** @type {string[]} */
        const dataLayers = []
        m.on('load', () => {
          if (polys.length) {
            m.addSource('rows-polygons', { type: 'geojson', data: { type: 'FeatureCollection', features: polys } })
            if (hi >= 0) {
              m.addLayer({ id: 'rows-extrusion', type: 'fill-extrusion', source: 'rows-polygons', paint: { 'fill-extrusion-color': paintColor, 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.88 } })
              dataLayers.push('rows-extrusion')
            } else {
              m.addLayer({ id: 'rows-fill', type: 'fill', source: 'rows-polygons', paint: { 'fill-color': paintColor, 'fill-opacity': 0.5 } })
              m.addLayer({ id: 'rows-outline', type: 'line', source: 'rows-polygons', paint: { 'line-color': ['get', 'color'], 'line-width': 1.2 } })
              dataLayers.push('rows-fill')
            }
          }
          if (lines.length) {
            m.addSource('rows-lines', { type: 'geojson', data: { type: 'FeatureCollection', features: lines } })
            m.addLayer({ id: 'rows-line', type: 'line', source: 'rows-lines', paint: { 'line-color': paintColor, 'line-width': 2.5 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
            dataLayers.push('rows-line')
          }
          if (points.length) {
            m.addSource('rows-points', { type: 'geojson', data: { type: 'FeatureCollection', features: points } })
            m.addLayer({ id: 'rows-point', type: 'circle', source: 'rows-points', paint: { 'circle-color': paintColor, 'circle-radius': ['get', 'r'], 'circle-opacity': 0.9, 'circle-stroke-color': th.ground, 'circle-stroke-width': 1 } })
            dataLayers.push('rows-point')
          }
        })

        // The panels: a legend, what was left out of the basemap, whose
        // data it is (OpenStreetMap's licence asks for it; as text, since a
        // link would navigate the view away).
        if (numeric && Number.isFinite(cLo)) {
          const lg = panel('top:10px;right:12px')
          lg.innerHTML = '<span style="color:' + th.muted + '">' + esc(cols[ci].name) + '</span> ' + esc(fmtTick(cLo)) + ' <span style="display:inline-block;vertical-align:middle;width:70px;height:8px;border-radius:2px;background:linear-gradient(90deg,' + th.ramp.join(',') + ')"></span> ' + esc(fmtTick(cHi))
        } else if (cats.size) {
          const lg = panel('top:10px;right:12px;max-height:calc(100% - 60px);overflow:auto')
          lg.innerHTML = '<div style="color:' + th.muted + ';margin-bottom:3px">' + esc(cols[ci].name) + '</div>' + [...cats.keys()].map((k, i) => '<div style="display:flex;align-items:center;gap:6px;line-height:17px;white-space:nowrap"><span style="width:9px;height:9px;border-radius:50%;background:' + th.series[i % th.series.length] + '"></span>' + esc(k) + '</div>').join('')
        }
        if (note) panel('left:12px;top:10px;max-width:60%').textContent = note
        // The basemap's attribution, read from its sources once they loaded
        // (a style's TileJSON carries it, not the style itself).
        const credit = panel('right:4px;bottom:4px;border:none;padding:1px 5px;display:none;background:' + th.pane + 'cc;color:' + th.muted)
        m.once('idle', () => {
          const text = Object.keys(style.sources || {})
            .map((id) => String(m.getSource(id)?.attribution || style.sources[id].attribution || ''))
            .map((a) => a.replace(/<[^>]*>/g, ' ').replace(/&copy;/g, '©').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim())
            .filter((a, i, all) => a && all.indexOf(a) === i)
            .join(' · ')
          if (!text) return
          credit.textContent = text
          credit.style.display = ''
        })

        // Hover names a shape and its values; a click selects its row.
        const tip = panel('display:none;max-width:420px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')
        /** @type {{ source: string, id: number } | null} */
        let lit = null
        const sourceOf = (/** @type {string} */ layer) => (layer === 'rows-line' ? 'rows-lines' : layer === 'rows-point' ? 'rows-points' : 'rows-polygons')
        const unlight = () => { if (lit) { m.setFeatureState(lit, { hover: false }); lit = null } }
        m.on('mousemove', (/** @type {any} */ e) => {
          const f = dataLayers.length ? m.queryRenderedFeatures(e.point, { layers: dataLayers })[0] : null
          if (!f) { unlight(); tip.style.display = 'none'; m.getCanvas().style.cursor = ''; return }
          const id = { source: sourceOf(f.layer.id), id: f.id }
          if (!lit || lit.id !== id.id || lit.source !== id.source) { unlight(); m.setFeatureState(id, { hover: true }); lit = id }
          m.getCanvas().style.cursor = 'pointer'
          const r = rows[f.properties.row]
          /** @type {[string, string][]} */
          const linesOut = []
          if (li >= 0) linesOut.push([cols[li].name, show(r[li])])
          for (const c of [ci, hi, si]) if (c >= 0 && c !== li && !linesOut.some(([k]) => k === cols[c].name)) linesOut.push([cols[c].name, show(r[c])])
          if (!linesOut.length) linesOut.push(['row', String(f.properties.row + 1)])
          tip.innerHTML = linesOut.map(([k, v]) => '<span style="color:' + th.muted + '">' + esc(k) + '</span> ' + esc(v)).join('<br>')
          tip.style.display = ''
          const w = root.clientWidth, h = root.clientHeight
          tip.style.left = Math.max(0, e.point.x + 14 + tip.offsetWidth > w ? e.point.x - tip.offsetWidth - 10 : e.point.x + 14) + 'px'
          tip.style.top = Math.max(0, Math.min(h - tip.offsetHeight, e.point.y + 12)) + 'px'
        })
        m.getCanvas().addEventListener('mouseleave', () => { unlight(); tip.style.display = 'none' })
        m.on('click', (/** @type {any} */ e) => {
          const f = dataLayers.length ? m.queryRenderedFeatures(e.point, { layers: dataLayers })[0] : null
          if (f && typeof ctx.selectRow === 'function') ctx.selectRow(f.properties.row)
        })
      },
      // A settled pane resize: the map keeps its place and redraws at the size.
      resize: () => {
        if (!map) throw new Error('no map to resize')
        map.resize()
      }
    }
  ]
}
