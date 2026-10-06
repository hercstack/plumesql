// @ts-check
// @description PostGIS geometry and geography values read as EWKT with a sketch of the shape, and a whole column sketched in one view
// @color green
import { parseEWKB, parseEWKT, toEWKT, geometrySvg, geometryExtent, drawGeometries } from './lib/wkb.js'

// PostGIS streams a geometry as EWKB hex: exact, and unreadable. This
// extension INSPECTS those values (docs: GRIDJSSPEC, Inspectors): it decodes
// the hex in the sandbox, with no query to the server, and answers every
// surface PlumeSQL draws for an inspected value:
//
//   hover  the grid's hover card: the EWKT and a sketch of the shape
//   peek   the strip above the peeked value (Space): the same, unclipped
//   value  the value tab: facts (kind, SRID, points, bounding box), the
//          sketch, a note, and the EWKT as the editor's face, with a
//          "Decode geometry" toggle back to the hex as stored
//   field  the row editor: a live sketch of the stored hex, or of the EWKT
//          being typed
//
// a VIEW, Geometry Sketch, that draws every geometry of a column together
// (below, "The column sketch"), and a FORMATTER: the grid's cell shows the
// value as EWKT instead of the hex, the column staying geometry (its value,
// its type, every reading above unchanged).
//
// The inspectors match the column's DECLARED type (geometry, geography,
// with or without a typmod or a schema): a text column holding hex is text.

// The host keeps an inspection's markup to this many characters; a sketch
// that would not fit is drawn coarser (it is a thumbnail), and dropped
// rather than cut into broken markup.
const HTML_MAX = 200_000

/** @param {number} n */
const coord = (n) => String(Math.round(n * 1e6) / 1e6)

/**
 * A path redrawn at a tenth of a pixel, with the repeats that rounding
 * makes dropped: a polygon of a hundred thousand vertices becomes the few
 * thousand the thumbnail can show.
 * @param {string} d
 */
function coarsePath(d) {
  /** @type {string[]} */
  const out = []
  let last = ''
  for (const tok of d.split(' ')) {
    if (tok === 'Z') {
      out.push('Z')
      last = ''
      continue
    }
    const head = tok[0] === 'M' || tok[0] === 'L' ? tok[0] : ''
    const [x, y] = tok.slice(head.length).split(',').map(Number)
    const p = `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`
    if (head !== 'M' && p === last) continue
    out.push(head + p)
    last = p
  }
  return out.join(' ')
}

/**
 * The sketch markup: plain SVG with the host's sketch classes (a closed
 * path fills faintly, a circle is a point), which PlumeSQL paints in the
 * theme's colours.
 * @param {import('./lib/wkb.js').Geometry} g
 * @param {number} w
 * @param {number} h
 * @returns {string | undefined}
 */
function geometryHtml(g, w, h) {
  const s = geometrySvg(g, w, h)
  if (!s) return undefined
  /**
   * @param {string[]} paths
   * @param {{ x: number, y: number }[]} dots
   */
  const svg = (paths, dots) =>
    `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    paths.map((d) => `<path d="${d}"${d.includes('Z') ? ' class="closed"' : ''}/>`).join('') +
    dots.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3"/>`).join('') +
    `</svg>`
  const exact = svg(s.paths, s.dots)
  if (exact.length <= HTML_MAX) return exact
  const seen = new Set()
  const dots = s.dots
    .map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }))
    .filter((p) => {
      const k = `${p.x},${p.y}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  const coarse = svg(s.paths.map(coarsePath), dots)
  return coarse.length <= HTML_MAX ? coarse : undefined
}

/**
 * @param {string} value
 * @param {InspectContext} ctx
 */
function inspectGeometry(value, ctx) {
  // A field previews what is typed too: EWKT a user writes, beside the
  // stored EWKB hex.
  const g = parseEWKB(value) ?? (ctx.surface === 'field' ? parseEWKT(value) : null)
  if (!g) return null
  const html = geometryHtml(g, ctx.width, ctx.height)
  if (ctx.surface === 'field') return html ? { html } : null
  const ewkt = toEWKT(g)
  if (ctx.surface === 'hover') return { html, face: { text: ewkt.length > 2048 ? `${ewkt.slice(0, 2048)}…` : ewkt } }
  if (ctx.surface === 'peek') return { html, face: { text: ewkt } }
  const ext = geometryExtent([g])
  const facts = [`${g.kind}${g.hasZ ? ' Z' : ''}${g.hasM ? (g.hasZ ? 'M' : ' M') : ''}`]
  if (g.srid !== undefined) facts.push(`SRID ${g.srid}`)
  if (ext) {
    facts.push(`${ext.points.toLocaleString()} ${ext.points === 1 ? 'point' : 'points'}`)
    if (ext.points > 1) facts.push(`bbox ${coord(ext.minX)} ${coord(ext.minY)} → ${coord(ext.maxX)} ${coord(ext.maxY)}`)
  }
  return {
    html,
    facts,
    note: 'A sketch of the shape, not a map: coordinates are drawn as they are, scaled to fit.',
    face: {
      label: 'EWKT',
      title: 'Show the geometry as EWKT (as ST_AsEWKT prints it); off shows the value as stored',
      text: ewkt
    }
  }
}

// ---- The column sketch ------------------------------------------------------
//
// Every geometry of one column drawn together, on the public view API
// (docs: RESULTVIEWS, "A column menu entry"):
//
//   - `column` puts "Sketch Geometry Column" in the menu of every geometry
//     or geography column while the view applies; choosing it opens this
//     view with inputs.column set to that column;
//   - ctx.rows(offset, limit, { columns }) pages that ONE column of the
//     result, so a wide result ships only the geometries;
//   - every value is decoded here, in the sandbox, with no query to the
//     server, and drawn into one shared bounding box: what "did my spatial
//     query return what I think" looks like. A sketch, not a map:
//     coordinates project straight into the box, with no tiles under it.

// A geometry or geography column, with or without a typmod or a schema
// (format_type says public.geometry when the extension's schema is off the
// search_path).
const GEO_TYPE = /^(?:"?[\w$]+"?\.)?(geometry|geography)\b/i

// The caps that keep a monster result drawable, said honestly in the line
// ("first N of M rows"): the drawing stops at whichever comes first.
const MAX_GEOMS = 20_000
const MAX_POINTS = 300_000
// Rows asked per ctx.rows call (the host pages the server under it).
const PAGE = 2_000

/**
 * @typedef {import('./lib/wkb.js').Geometry} Geometry
 * @typedef {{ geoms: Geometry[], points: number, rows: number, nulls: number, bad: number, capped: boolean, total: number, column: string, type: string, done: boolean }} Read
 */

// The last read, kept on the window (the module is imported afresh per
// render, the iframe document is not), so a resize redraws without paging
// the column again; seq cancels a read a newer render replaced.
/** @type {{ __geoSketch?: { seq: number, read?: Read } }} */
const G = /** @type {any} */ (globalThis)
const state = (G.__geoSketch ??= { seq: 0 })

/**
 * The column to draw: the picked one when it exists, else the first
 * geometry column (a column input with no default fills with the first
 * column of the result, which is rarely the geometry).
 * @param {{ name: string, type: string }[]} columns
 * @param {string | undefined} picked
 */
function pickColumn(columns, picked) {
  const byName = picked ? columns.find((c) => c.name === picked) : undefined
  if (byName && GEO_TYPE.test(byName.type)) return byName
  return columns.find((c) => GEO_TYPE.test(c.type)) ?? byName
}

/** @param {number} n */
const fmt = (n) => n.toLocaleString('en-US')

/**
 * The one line over the drawing: "N geometries (M points) · SRID s ·
 * k NULLs", then what did not decode and the cap, when they apply.
 * @param {Read} r
 */
function lineFor(r) {
  const srid = r.geoms.find((g) => g.srid !== undefined)?.srid
  const parts = [`${fmt(r.geoms.length)} ${r.geoms.length === 1 ? 'geometry' : 'geometries'} (${fmt(r.points)} ${r.points === 1 ? 'point' : 'points'})`]
  if (srid !== undefined) parts.push(`SRID ${srid}`)
  if (r.nulls > 0) parts.push(`${fmt(r.nulls)} ${r.nulls === 1 ? 'NULL' : 'NULLs'}`)
  if (r.bad > 0) parts.push(`${fmt(r.bad)} not geometry`)
  if (r.capped || (r.done && r.rows < r.total)) parts.push(`first ${fmt(r.rows)} of ${fmt(r.total)} rows`)
  else if (!r.done) parts.push(`reading, ${fmt(r.rows)} of ${fmt(r.total)} rows`)
  return parts.join(' · ')
}

/**
 * Lay the pane out once per render: the line on top, the canvas under it.
 * @param {HTMLElement} root
 * @param {RenderContext} ctx
 */
function layout(root, ctx) {
  const p = ctx.palette
  root.replaceChildren()
  root.style.cssText = 'margin:0;height:100vh;display:flex;flex-direction:column;overflow:hidden;font:12px system-ui,sans-serif'
  const line = document.createElement('div')
  line.className = 'geo-line'
  line.style.cssText = `padding:6px 10px;color:${p?.muted ?? '#888'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`
  const box = document.createElement('div')
  box.style.cssText = 'flex:1;min-height:0;position:relative'
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
  const empty = document.createElement('div')
  empty.className = 'geo-empty'
  empty.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:${p?.muted ?? '#888'};font-size:13px`
  box.append(canvas, empty)
  root.append(line, box)
  return { line, canvas, empty }
}

/**
 * Draw what was read into the canvas at its current size, in the theme's
 * accent: strokes and dots solid, polygon fills faint.
 * @param {HTMLCanvasElement} canvas
 * @param {Read} r
 * @param {RenderContext} ctx
 */
function paint(canvas, r, ctx) {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (w === 0 || h === 0) return
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const g = canvas.getContext('2d')
  if (!g) return
  g.scale(dpr, dpr)
  g.clearRect(0, 0, w, h)
  if (r.geoms.length === 0) return
  const accent = ctx.palette?.accent ?? '#4a9eff'
  const fill = /^#[0-9a-f]{6}$/i.test(accent) ? accent + '26' : accent
  drawGeometries(g, r.geoms, w, h, { stroke: accent, fill, dot: accent }, 16)
}

/**
 * The calm face when there is nothing to draw.
 * @param {Read} r
 */
function emptyText(r) {
  if (r.geoms.length > 0 || !r.done) return r.geoms.length === 0 ? 'Reading the column…' : ''
  if (r.rows === 0) return 'The result has no rows to draw.'
  if (r.nulls === r.rows) return 'Every value in the column is NULL.'
  return 'Nothing in the column decodes as a geometry.'
}

/**
 * The grid's cell as EWKT: the whole value, never shortened, since a copy
 * takes the cell as the grid shows it. A value that is not EWKB hex (a
 * geometry sent as text by some driver) shows as it came.
 * @param {unknown} value
 */
function cellAsEWKT(value) {
  if (typeof value !== 'string') return value
  const g = parseEWKB(value)
  return g ? toEWKT(g) : value
}

/** @type {PlumeSQLExtension} */
export default {
  rules: [
    { match: { type: 'geometry' }, fn: cellAsEWKT },
    { match: { type: 'geography' }, fn: cellAsEWKT }
  ],
  inspectors: [
    { match: { type: 'geometry' }, label: 'geometry', inspect: inspectGeometry },
    { match: { type: 'geography' }, label: 'geometry', inspect: inspectGeometry }
  ],
  views: [
    {
      tab: 'Geometry Sketch',
      // Only a result with a geometry or geography column grows the tab.
      when: (columns) => columns.some((c) => /^(?:"?[\w$]+"?\.)?(geometry|geography)\b/i.test(c.type)),
      inputs: [{ key: 'column', kind: 'column', label: 'Geometry column' }],
      // The column comes from the menu entry, or is the result's first
      // geometry column: nothing to ask.
      ask: 'never',
      column: { input: 'column', label: 'Sketch Geometry Column', match: { type: GEO_TYPE } },
      render: async (root, data, ctx) => {
        const seq = ++state.seq
        const col = pickColumn(data.columns, ctx.inputs.column)
        const ui = layout(root, ctx)
        if (!col) {
          state.read = undefined
          ui.line.textContent = ''
          ui.empty.textContent = 'The result has no geometry column to draw.'
          return
        }
        /** @type {Read} */
        const r = { geoms: [], points: 0, rows: 0, nulls: 0, bad: 0, capped: false, total: ctx.rowCount, column: col.name, type: col.type, done: false }
        state.read = r
        const show = () => {
          ui.line.textContent = lineFor(r)
          ui.line.title = `${col.name} (${col.type}): ${lineFor(r)}`
          ui.empty.textContent = emptyText(r)
          paint(ui.canvas, r, ctx)
        }
        show()
        // Page the ONE column: each row arrives as [value].
        for (let at = 0; ; ) {
          const page = await ctx.rows(at, PAGE, { columns: [col.name] })
          if (seq !== state.seq) return // a newer render took over
          if (page.length === 0) break
          for (const row of page) {
            r.rows++
            const v = row[0]
            if (v === null || v === undefined) {
              r.nulls++
              continue
            }
            const g = typeof v === 'string' ? parseEWKB(v) : null
            if (!g) {
              r.bad++
              continue
            }
            r.geoms.push(g)
            r.points += geometryExtent([g])?.points ?? 0
            if (r.geoms.length >= MAX_GEOMS || r.points >= MAX_POINTS) {
              r.capped = true
              break
            }
          }
          if (r.capped || page.length < PAGE) break
          at += page.length
          show()
        }
        r.done = true
        r.total = Math.max(r.total, r.rows)
        show()
      },
      // A new pane size redraws what was read, without paging again.
      resize: (root, _size, ctx) => {
        const r = state.read
        const canvas = root.querySelector('canvas')
        if (!r || !r.done || !canvas) throw new Error('nothing read yet')
        paint(canvas, r, ctx)
      }
    }
  ]
}
