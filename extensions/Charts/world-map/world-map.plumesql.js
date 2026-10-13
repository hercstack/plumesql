// @ts-check
// @description Countries coloured by a value, and points from latitude and longitude, on a world map drawn offline, no PostGIS needed (ECharts)
// @color cyan
import { echartsOf, themeOf, mount, note, NO_ECHARTS, titleOf, tooltipOf, fmtNum, csvOf, esc } from '$ext/echarts-core/echarts-core.plumesql.js'
import { loadRows, topOf, colIndex, num, keyOf, fold } from '$ext/stats-core/stats-core.plumesql.js'
import { topology, countries } from './lib/world.js'

const MAP = 'plumesql-world'
const MAX_POINTS = 50000
/** @type {any} */
let chart = null
let csv = ''

// ─── The shapes ──────────────────────────────────────────────────────────────
// TopoJSON to GeoJSON: every arc is delta encoded on a grid; a ring is its arcs
// end to end (a negative index runs an arc backwards). Antarctica is left out,
// a fifth of the map with no data on it.
/** @type {any} */
let world = null
const decode = () => {
  if (world) return world
  const [sx, sy] = topology.transform.scale, [tx, ty] = topology.transform.translate
  const arcs = topology.arcs.map((/** @type {number[][]} */ arc) => {
    let x = 0, y = 0
    return arc.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty] })
  })
  const arcOf = (/** @type {number} */ i) => (i < 0 ? arcs[~i].slice().reverse() : arcs[i])
  const ring = (/** @type {number[]} */ ids) => {
    /** @type {number[][]} */
    const pts = []
    ids.forEach((i, k) => { const a = arcOf(i); for (let j = k ? 1 : 0; j < a.length; j++) pts.push(a[j]) })
    return pts
  }
  const features = []
  for (const g of topology.objects.countries.geometries) {
    if (g.id === '010') continue
    const polys = g.type === 'Polygon' ? [g.arcs.map(ring)] : g.type === 'MultiPolygon' ? g.arcs.map((/** @type {number[][]} */ p) => p.map(ring)) : null
    if (!polys) continue
    /** @type {number[][][][]} */
    const coordinates = []
    for (const poly of polys) for (const part of cutAtAntimeridian(poly)) coordinates.push(part)
    features.push({ type: 'Feature', properties: { name: String(g.id) }, geometry: { type: 'MultiPolygon', coordinates } })
  }
  world = { type: 'FeatureCollection', features }
  return world
}

// A polygon that crosses the 180th meridian (Russia's far east, Fiji) is in
// the data as one ring whose points jump from +180 to -180, which a flat map
// draws as a stripe across the whole world. Such a ring is made continuous
// (its longitudes run past 180) and cut in two at the meridian, one piece at
// each edge of the map; its holes, never near the meridian, are dropped.
const clipX = (/** @type {number[][]} */ pts, /** @type {number} */ x, /** @type {boolean} */ keepBelow) => {
  /** @type {number[][]} */
  const out = []
  const inside = (/** @type {number[]} */ p) => (keepBelow ? p[0] <= x : p[0] >= x)
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    const ia = inside(a), ib = inside(b)
    if (ia) out.push(a)
    if (ia !== ib && b[0] !== a[0]) { const t = (x - a[0]) / (b[0] - a[0]); out.push([x, a[1] + t * (b[1] - a[1])]) }
  }
  return out
}
const cutAtAntimeridian = (/** @type {number[][][]} */ poly) => {
  const outer = poly[0]
  if (!outer.some((p, i) => i > 0 && Math.abs(p[0] - outer[i - 1][0]) > 180)) return [poly]
  /** @type {number[][]} */
  const flat = []
  let shift = 0
  outer.forEach((p, i) => {
    if (i > 0) { const d = p[0] + shift - flat[i - 1][0]; if (d > 180) shift -= 360; else if (d < -180) shift += 360 }
    flat.push([p[0] + shift, p[1]])
  })
  const east = flat.some((p) => p[0] > 180)
  const a = clipX(flat, east ? 180 : -180, east)
  const b = clipX(flat.map((p) => [p[0] + (east ? -360 : 360), p[1]]), east ? -180 : 180, !east)
  return [a, b].filter((r) => r.length >= 3).map((r) => [r])
}

// ─── Names ───────────────────────────────────────────────────────────────────
// A country is found by any of its names (accents, case, punctuation and a
// leading "the" ignored), its two- or three-letter ISO code, or its ISO number.
const norm = (/** @type {string} */ s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^the /, '')
/** @type {Map<string, string> | null} */
let lookup = null
/** @type {Map<string, string>} */
const display = new Map()
const resolver = () => {
  if (lookup) return lookup
  lookup = new Map()
  for (const [n, a2, a3, names] of countries) {
    const key = n || 'name:' + names[0]
    display.set(key, names[0])
    for (const name of names) if (!lookup.has('n:' + norm(name))) lookup.set('n:' + norm(name), key)
    if (a2) lookup.set('c:' + a2.toLowerCase(), key)
    if (a3) lookup.set('c:' + a3.toLowerCase(), key)
    if (n) lookup.set('#' + Number(n), key)
  }
  return lookup
}
const keyFor = (/** @type {unknown} */ v) => {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  const l = resolver()
  if (/^\d{1,3}$/.test(s)) return l.get('#' + Number(s)) ?? null
  if (/^[A-Za-z]{2,3}$/.test(s)) { const c = l.get('c:' + s.toLowerCase()); if (c) return c }
  return l.get('n:' + norm(s)) ?? null
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'World map',
      scripts: ['https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'],
      inputs: [
        { key: 'region', kind: 'column', label: 'Country', default: '', description: 'A country by its name or its ISO code (HR, HRV or 191): countries take a colour by the value' },
        { key: 'value', kind: 'column', label: 'Value', types: ['numeric'], default: '', description: 'The number a country is coloured by, folded over its rows; none counts the rows' },
        { key: 'agg', kind: 'choice', label: 'Fold', options: ['sum', 'mean', 'count', 'max', 'min', 'median'], default: 'sum', description: 'How the rows of one country combine' },
        { key: 'lat', kind: 'column', label: 'Latitude', types: ['numeric'], default: '', description: 'With Longitude, a point per row at that place' },
        { key: 'lon', kind: 'column', label: 'Longitude', types: ['numeric'], default: '' },
        { key: 'size', kind: 'column', label: 'Point size', types: ['numeric'], default: '', description: 'A number a point grows with; none keeps every point the same' },
        { key: 'label', kind: 'column', label: 'Point label', default: '', description: 'What a point is called, in its tooltip' },
        { key: 'ramp', kind: 'choice', label: 'Colour ramp', options: ['ramp', 'alarm'], default: 'ramp', description: 'ramp runs blue, amber, red from low to high; alarm runs green, amber, red, for a number where high is bad' },
        { key: 'title', kind: 'text', label: 'Title', default: '' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '200000', description: 'How many rows the view reads from the result, from the first one' }
      ],
      actions: [{ label: 'Copy data', run: (ctx) => ctx.copy(csv) }],
      render: async (root, data, ctx) => {
        const echarts = echartsOf()
        if (!echarts) { note(root, NO_ECHARTS); return }
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const ri = colIndex(cols, inputs.region), vi = colIndex(cols, inputs.value), lai = colIndex(cols, inputs.lat), loi = colIndex(cols, inputs.lon)
        const zi = colIndex(cols, inputs.size), li = colIndex(cols, inputs.label)
        const points = lai >= 0 && loi >= 0
        if (ri < 0 && !points) { note(root, 'Pick a Country column, or Latitude and Longitude for points (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, topOf({ top: inputs.top || 200000 }))
        echarts.registerMap(MAP, decode())
        const drawn = new Set(world.features.map((/** @type {any} */ f) => f.properties.name))

        // Countries: the rows of each folded into one value.
        const agg = vi < 0 ? 'count' : inputs.agg || 'sum'
        /** @type {Map<string, unknown[]>} */
        const byKey = new Map()
        /** @type {Map<string, number>} */
        const unknown = new Map(), small = new Map()
        if (ri >= 0) {
          for (const r of rows) {
            if (r[ri] == null) continue
            const key = keyFor(r[ri])
            if (!key) { const k = keyOf(r[ri]); unknown.set(k, (unknown.get(k) || 0) + 1); continue }
            if (!drawn.has(key)) { const k = display.get(key) || key; small.set(k, (small.get(k) || 0) + 1); continue }
            let vs = byKey.get(key)
            if (!vs) { vs = []; byKey.set(key, vs) }
            vs.push(vi < 0 ? 1 : r[vi])
          }
          if (unknown.size) ctx.log(`World map: ${unknown.size} names not recognised as countries (${[...unknown.keys()].slice(0, 8).join(', ')}${unknown.size > 8 ? ', ...' : ''}); an ISO code always works.`)
          if (small.size) ctx.log(`World map: ${small.size} countries too small to draw at this scale (${[...small.keys()].slice(0, 8).join(', ')}${small.size > 8 ? ', ...' : ''}).`)
        }
        const regions = [...byKey.entries()].map(([key, vs]) => ({ name: key, value: agg === 'count' ? vs.length : fold(agg, vs) })).filter((d) => d.value != null && Number.isFinite(Number(d.value)))
        let lo = Infinity, hi = -Infinity
        for (const d of regions) { const v = Number(d.value); if (v < lo) lo = v; if (v > hi) hi = v }

        // Points: one per row with both coordinates in range.
        /** @type {number[][]} */
        const pts = []
        let zHi = 0, off = 0
        if (points) {
          for (let i = 0; i < rows.length && pts.length < MAX_POINTS; i++) {
            const r = rows[i]
            const la = num(r[lai]), lo2 = num(r[loi])
            if (la == null || lo2 == null || Math.abs(la) > 90 || Math.abs(lo2) > 180) { off++; continue }
            const z = zi >= 0 ? num(r[zi]) ?? 0 : 0
            if (z > zHi) zHi = z
            pts.push([lo2, la, z, i])
          }
          if (off) ctx.log(`World map: ${off} rows with no latitude and longitude in range left out.`)
        }
        csv = ri >= 0
          ? csvOf(['country', 'iso_numeric', vi < 0 ? 'rows' : agg + '_' + cols[vi].name], regions.map((d) => [display.get(d.name) || d.name, d.name.startsWith('name:') ? '' : d.name, d.value]))
          : csvOf(['longitude', 'latitude', ...(zi >= 0 ? [cols[zi].name] : [])], pts.map((p) => [p[0], p[1], ...(zi >= 0 ? [p[2]] : [])]))

        const th = themeOf(ctx)
        const land = th.dark ? '#2a2d3d' : '#e3e5ea'
        const stops = inputs.ramp === 'alarm' ? th.alarm : th.ramp
        const valueName = vi < 0 ? 'rows' : agg + ' of ' + cols[vi].name
        const pointSize = (/** @type {number} */ z) => (zi >= 0 && zHi > 0 ? 4 + Math.sqrt(Math.max(0, z) / zHi) * 26 : pts.length > 2000 ? 3 : 6)
        chart = mount(root, chart)
        chart.setOption({
          backgroundColor: 'transparent',
          title: titleOf(th, inputs.title),
          tooltip: tooltipOf(th, {
            trigger: 'item',
            formatter: (/** @type {any} */ p) => {
              if (p.seriesType === 'scatter' || p.seriesType === 'effectScatter') {
                const [x, y, z, i] = p.value
                return (li >= 0 ? '<b>' + esc(keyOf(rows[i][li])) + '</b><br>' : '') + y.toFixed(3) + ', ' + x.toFixed(3) + (zi >= 0 ? '<br>' + esc(cols[zi].name) + ': ' + fmtNum(z) : '')
              }
              const name = display.get(p.name) || p.name.replace(/^name:/, '')
              const v = p.value
              return '<b>' + esc(name) + '</b>' + (ri >= 0 ? '<br>' + esc(valueName) + ': ' + (v == null || Number.isNaN(v) ? 'no rows' : fmtNum(v)) : '')
            }
          }),
          geo: {
            map: MAP, roam: true, scaleLimit: { min: 1, max: 40 },
            top: inputs.title ? 40 : 16, bottom: 16, left: 16, right: 16,
            itemStyle: { areaColor: land, borderColor: th.bg, borderWidth: 0.6 },
            emphasis: { itemStyle: { areaColor: th.dark ? '#3b3f52' : '#cfd3dc' }, label: { show: false } },
            select: { disabled: true },
            tooltip: { show: true }
          },
          visualMap: regions.length && Number.isFinite(lo) ? {
            type: 'continuous', seriesIndex: 0, min: lo, max: hi === lo ? lo + 1 : hi, calculable: true,
            inRange: { color: stops }, left: 16, bottom: 16, itemHeight: 110, itemWidth: 10,
            textStyle: { color: th.fg, fontSize: 11 }, formatter: (/** @type {number} */ v) => fmtNum(v)
          } : undefined,
          series: [
            ...(ri >= 0 ? [{ type: 'map', geoIndex: 0, name: valueName, data: regions }] : []),
            ...(points ? [{
              type: 'scatter', coordinateSystem: 'geo', name: 'points', large: pts.length > 5000,
              data: pts, symbolSize: (/** @type {number[]} */ v) => pointSize(v[2]),
              itemStyle: { color: ri >= 0 ? th.fg : th.accent, opacity: pts.length > 2000 ? 0.6 : 0.85, borderColor: th.bg, borderWidth: pts.length > 2000 ? 0 : 0.8 },
              emphasis: { scale: 1.6 }
            }] : [])
          ]
        })
      },
      resize: (root, size) => {
        if (!chart) throw new Error('no chart to resize')
        chart.resize(size)
      }
    }
  ]
}
