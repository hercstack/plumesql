// @ts-check
// A PostGIS geometry value arrives in the grid as EWKB hex, the wire text of
// the geometry output function: correct, and unreadable. This module reads
// that hex WITHOUT any query (every surface decodes what the cell already
// holds): EWKB's endian byte, the type word with PostGIS's flag bits (SRID,
// Z, M) or ISO WKB's +1000 offsets, and the seven geometry kinds,
// recursively for the multis and the collection. Out come the EWKT text in
// PostGIS's own dialect (what ST_AsEWKT prints, so a copied value
// round-trips) and the coordinates, which the sketch renders as a bare
// shape, no map under it.
//
// No DOM and no network: it runs in the inspector's sandboxed worker, and
// drawGeometries takes whatever 2D context a view hands it.

/**
 * @typedef {'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon' | 'GeometryCollection'} GeometryKind
 */

/**
 * One decoded geometry. Point: `point`; LineString and MultiPoint: `points`;
 * Polygon and MultiLineString: `rings` (rings or lines); MultiPolygon:
 * `polygons`; GeometryCollection: `members`.
 * @typedef {object} Geometry
 * @property {GeometryKind} kind
 * @property {number} [srid]
 * @property {boolean} hasZ
 * @property {boolean} hasM
 * @property {number[]} [point]
 * @property {number[][]} [points]
 * @property {number[][][]} [rings]
 * @property {number[][][][]} [polygons]
 * @property {Geometry[]} [members]
 */

/** @type {Record<number, GeometryKind>} */
const KINDS = {
  1: 'Point',
  2: 'LineString',
  3: 'Polygon',
  4: 'MultiPoint',
  5: 'MultiLineString',
  6: 'MultiPolygon',
  7: 'GeometryCollection'
}

class Reader {
  /** @param {Uint8Array} bytes */
  constructor(bytes) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    this.at = 0
    this.little = true
  }
  get remaining() {
    return this.view.byteLength - this.at
  }
  byte() {
    const v = this.view.getUint8(this.at)
    this.at += 1
    return v
  }
  /** @param {number} b */
  setOrder(b) {
    this.little = b === 1
  }
  u32() {
    const v = this.view.getUint32(this.at, this.little)
    this.at += 4
    return v
  }
  f64() {
    const v = this.view.getFloat64(this.at, this.little)
    this.at += 8
    return v
  }
}

/**
 * parseEWKB reads hex EWKB/WKB; null for anything that is not one, so a
 * caller can probe any value harmlessly.
 * @param {string} hex
 * @returns {Geometry | null}
 */
export function parseEWKB(hex) {
  const s = hex.trim()
  if (s.length < 18 || s.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(s)) return null
  const bytes = new Uint8Array(s.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16)
  try {
    const r = new Reader(bytes)
    const g = readGeometry(r)
    // Trailing garbage means this was not a geometry after all.
    return g && r.remaining === 0 ? g : null
  } catch {
    return null
  }
}

/**
 * @param {Reader} r
 * @returns {Geometry | null}
 */
function readGeometry(r) {
  const order = r.byte()
  if (order !== 0 && order !== 1) return null
  r.setOrder(order)
  let type = r.u32()
  let hasZ = false
  let hasM = false
  /** @type {number | undefined} */
  let srid
  // PostGIS EWKB flags.
  if (type & 0x80000000) {
    hasZ = true
    type &= ~0x80000000
  }
  if (type & 0x40000000) {
    hasM = true
    type &= ~0x40000000
  }
  if (type & 0x20000000) {
    type &= ~0x20000000
    srid = r.u32()
  }
  // ISO WKB offsets (1001 Point Z, 2001 Point M, 3001 Point ZM).
  if (type >= 3000) {
    hasZ = true
    hasM = true
    type -= 3000
  } else if (type >= 2000) {
    hasM = true
    type -= 2000
  } else if (type >= 1000) {
    hasZ = true
    type -= 1000
  }
  const kind = KINDS[type]
  if (!kind) return null
  const dims = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0)
  const coord = () => {
    /** @type {number[]} */
    const c = []
    for (let d = 0; d < dims; d++) c.push(r.f64())
    return c
  }
  const line = () => {
    const n = r.u32()
    /** @type {number[][]} */
    const pts = []
    for (let i = 0; i < n; i++) pts.push(coord())
    return pts
  }
  /** @type {Geometry} */
  const g = { kind, srid, hasZ, hasM }
  switch (kind) {
    case 'Point':
      g.point = coord()
      break
    case 'LineString':
      g.points = line()
      break
    case 'Polygon': {
      const n = r.u32()
      g.rings = []
      for (let i = 0; i < n; i++) g.rings.push(line())
      break
    }
    case 'MultiPoint': {
      const n = r.u32()
      g.points = []
      for (let i = 0; i < n; i++) {
        const m = readGeometry(r)
        if (!m || m.kind !== 'Point' || !m.point) throw new Error('bad multipoint')
        g.points.push(m.point)
      }
      break
    }
    case 'MultiLineString': {
      const n = r.u32()
      g.rings = []
      for (let i = 0; i < n; i++) {
        const m = readGeometry(r)
        if (!m || m.kind !== 'LineString' || !m.points) throw new Error('bad multilinestring')
        g.rings.push(m.points)
      }
      break
    }
    case 'MultiPolygon': {
      const n = r.u32()
      g.polygons = []
      for (let i = 0; i < n; i++) {
        const m = readGeometry(r)
        if (!m || m.kind !== 'Polygon' || !m.rings) throw new Error('bad multipolygon')
        g.polygons.push(m.rings)
      }
      break
    }
    case 'GeometryCollection': {
      const n = r.u32()
      g.members = []
      for (let i = 0; i < n; i++) {
        const m = readGeometry(r)
        if (!m) throw new Error('bad collection')
        g.members.push(m)
      }
      break
    }
  }
  return g
}

// ---- EWKT, PostGIS's own dialect -----------------------------------------

/** @param {number} n */
const num = (n) => (Number.isFinite(n) ? String(n) : 'NaN')
/** @param {number[]} c */
const pt = (c) => c.map(num).join(' ')
/** @param {number[][]} pts */
const ptList = (pts) => pts.map(pt).join(',')
/** @param {number[][][]} rings */
const ringList = (rings) => rings.map((x) => `(${ptList(x)})`).join(',')

/**
 * toEWKT prints what ST_AsEWKT prints: SRID= prefix when one is set, an M
 * suffix for M-without-Z (POINTM), plain names otherwise (a Z or ZM geometry
 * shows in its extra coordinates, not in the name), and MULTIPOINT members
 * bare.
 * @param {Geometry} g
 * @returns {string}
 */
export function toEWKT(g) {
  const name = g.kind.toUpperCase() + (g.hasM && !g.hasZ ? 'M' : '')
  const srid = g.srid !== undefined ? `SRID=${g.srid};` : ''
  // An empty geometry has the EMPTY word, not empty parens (a WKB empty
  // point arrives as NaN coordinates, PostGIS's own encoding).
  const empty =
    (g.point !== undefined && (g.point.length === 0 || g.point.every((n) => Number.isNaN(n)))) ||
    (g.points !== undefined && g.points.length === 0) ||
    (g.rings !== undefined && g.rings.length === 0) ||
    (g.polygons !== undefined && g.polygons.length === 0) ||
    (g.members !== undefined && g.members.length === 0)
  if (empty) return `${srid}${name} EMPTY`
  let body = ''
  switch (g.kind) {
    case 'Point':
      body = `(${pt(g.point ?? [])})`
      break
    case 'LineString':
    case 'MultiPoint':
      body = `(${ptList(g.points ?? g.rings?.[0] ?? [])})`
      break
    case 'Polygon':
    case 'MultiLineString':
      body = `(${ringList(g.rings ?? [])})`
      break
    case 'MultiPolygon':
      body = `(${(g.polygons ?? []).map((p) => `(${ringList(p)})`).join(',')})`
      break
    case 'GeometryCollection':
      body = `(${(g.members ?? []).map((m) => toEWKT({ ...m, srid: undefined })).join(',')})`
      break
  }
  return srid + name + body
}

// ---- EWKT, read back -------------------------------------------------------

/**
 * parseEWKT reads the TEXT spelling: what a user types into an edit field
 * (PostGIS's EWKT with its unlabeled Z and attached M, ISO WKT with spaced
 * Z/M/ZM, MULTIPOINT members bare or parenthesized, EMPTY). Null for
 * anything that is not one, so the row editor can probe every keystroke
 * harmlessly; the preview is advisory and never a gate, the server stays
 * the judge of what a literal means.
 * @param {string} text
 * @returns {Geometry | null}
 */
export function parseEWKT(text) {
  try {
    const p = new TextReader(text)
    /** @type {number | undefined} */
    let srid
    const m = p.take(WKT_SRID)
    if (m) srid = parseInt(m[1], 10)
    const g = readTextGeometry(p)
    if (!g) return null
    p.take(WKT_BLANKS)
    if (!p.done()) return null
    if (srid !== undefined) g.srid = srid
    return normalizeDims(g)
  } catch {
    return null
  }
}

// The reader is pointed at an offset with STICKY patterns, never handed a
// copy of the rest of the text: the row editor probes this on every pause
// in typing, and a pasted polygon of tens of thousands of coordinates would
// pay a slice per token.
class TextReader {
  /** @param {string} s */
  constructor(s) {
    this.s = s
    this.at = 0
  }
  /**
   * @param {RegExp} re
   * @returns {RegExpExecArray | null}
   */
  take(re) {
    re.lastIndex = this.at
    const m = re.exec(this.s)
    if (m) this.at += m[0].length
    return m
  }
  done() {
    return this.at >= this.s.length
  }
}

// The WKT lexemes, all sticky, all here rather than inside the reader's
// loops so each is compiled once.
const WKT_SRID = /\s*srid\s*=\s*(-?\d+)\s*;/iy
const WKT_BLANKS = /\s*/y
const WKT_DIM = /\s*(zm|z|m)\b/iy
const WKT_EMPTY = /\s*empty\b/iy
const WKT_OPEN = /\s*\(/y
const WKT_CLOSE = /\s*\)/y
const WKT_COMMA = /\s*,/y
const WKT_NUMBER = /\s*(-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/iy

/** @type {[RegExp, GeometryKind][]} */
const NAMES = [
  [/\s*multipoint/iy, 'MultiPoint'],
  [/\s*multilinestring/iy, 'MultiLineString'],
  [/\s*multipolygon/iy, 'MultiPolygon'],
  [/\s*geometrycollection/iy, 'GeometryCollection'],
  [/\s*linestring/iy, 'LineString'],
  [/\s*polygon/iy, 'Polygon'],
  [/\s*point/iy, 'Point']
]

/** @typedef {Geometry & { declared?: boolean }} TextGeometry */

/**
 * @param {TextReader} p
 * @returns {TextGeometry | null}
 */
function readTextGeometry(p) {
  /** @type {GeometryKind | null} */
  let kind = null
  for (const [re, k] of NAMES) {
    if (p.take(re)) {
      kind = k
      break
    }
  }
  if (!kind) return null
  // The dimension suffix: attached (POINTM) or spaced (POINT ZM); its
  // absence leaves the coordinates to say (3 are X Y Z, PostGIS's way).
  const suf = p.take(WKT_DIM)?.[1].toLowerCase()
  /** @type {TextGeometry} */
  const g = {
    kind,
    hasZ: suf === 'z' || suf === 'zm',
    hasM: suf === 'm' || suf === 'zm',
    declared: !!suf
  }
  if (p.take(WKT_EMPTY)) {
    if (kind === 'Point') g.point = []
    else if (kind === 'LineString' || kind === 'MultiPoint') g.points = []
    else if (kind === 'Polygon' || kind === 'MultiLineString') g.rings = []
    else if (kind === 'MultiPolygon') g.polygons = []
    else g.members = []
    return g
  }
  const open = () => {
    if (!p.take(WKT_OPEN)) throw new Error('(')
  }
  const close = () => {
    if (!p.take(WKT_CLOSE)) throw new Error(')')
  }
  const comma = () => !!p.take(WKT_COMMA)
  /** @returns {number[]} */
  const coord = () => {
    /** @type {number[]} */
    const c = []
    for (;;) {
      const n = p.take(WKT_NUMBER)
      if (!n) break
      c.push(parseFloat(n[1]))
      if (c.length === 4) break
    }
    if (c.length < 2) throw new Error('coord')
    return c
  }
  /** @returns {number[][]} */
  const textPtList = () => {
    open()
    const pts = [coord()]
    while (comma()) pts.push(coord())
    close()
    return pts
  }
  /** @returns {number[][][]} */
  const textRingList = () => {
    open()
    const rings = [textPtList()]
    while (comma()) rings.push(textPtList())
    close()
    return rings
  }
  switch (kind) {
    case 'Point':
      open()
      g.point = coord()
      close()
      break
    case 'LineString':
      g.points = textPtList()
      break
    case 'Polygon':
    case 'MultiLineString':
      g.rings = textRingList()
      break
    case 'MultiPoint': {
      // Members bare (PostGIS prints them so) or each in parens (ISO).
      open()
      g.points = []
      do {
        const wrapped = !!p.take(WKT_OPEN)
        g.points.push(coord())
        if (wrapped) close()
      } while (comma())
      close()
      break
    }
    case 'MultiPolygon': {
      open()
      g.polygons = [textRingList()]
      while (comma()) g.polygons.push(textRingList())
      close()
      break
    }
    case 'GeometryCollection': {
      open()
      g.members = []
      do {
        const m = readTextGeometry(p)
        if (!m) throw new Error('member')
        const n = normalizeDims(m)
        if (!n) throw new Error('dims')
        g.members.push(n)
      } while (comma())
      close()
      break
    }
  }
  return g
}

/**
 * normalizeDims settles what the coordinates mean: a declared suffix must
 * match every point's count exactly; without one, three numbers are X Y Z
 * (PostGIS's unlabeled Z) and four are X Y Z M. Mixed counts decline.
 * @param {TextGeometry} g
 * @returns {Geometry | null}
 */
function normalizeDims(g) {
  let n = -1
  let ok = true
  eachCoord(g, (c) => {
    if (n === -1) n = c.length
    else if (n !== c.length) ok = false
  })
  const { declared } = g
  delete g.declared
  if (!ok) return null
  if (n === -1) return g // empty: the suffix's word stands
  if (declared) {
    return n === 2 + (g.hasZ ? 1 : 0) + (g.hasM ? 1 : 0) ? g : null
  }
  if (n === 3) g.hasZ = true
  else if (n === 4) {
    g.hasZ = true
    g.hasM = true
  } else if (n !== 2) return null
  return g
}

// ---- the sketch -----------------------------------------------------------

/**
 * hasXY: a drawable coordinate. An EMPTY point travels as NaN NaN in WKB
 * (PostGIS's own encoding), so finiteness is the real test.
 * @param {number[] | undefined} c
 * @returns {c is number[]}
 */
export function hasXY(c) {
  return !!c && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
}

/**
 * eachCoord visits every coordinate of a geometry, the multis and the
 * collection included: the one walker behind bounds, projection and dims.
 * @param {Geometry} geom
 * @param {(c: number[]) => void} fn
 */
function eachCoord(geom, fn) {
  if (hasXY(geom.point)) fn(geom.point)
  for (const p of geom.points ?? []) fn(p)
  for (const ring of geom.rings ?? []) for (const p of ring) fn(p)
  for (const poly of geom.polygons ?? []) for (const ring of poly) for (const p of ring) fn(p)
  for (const m of geom.members ?? []) eachCoord(m, fn)
}

/**
 * geometryExtent is the shared bounding box of many geometries, with the
 * coordinate count so a caller can budget its rendering.
 * @param {Geometry[]} gs
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number, points: number } | null}
 */
export function geometryExtent(gs) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let points = 0
  for (const g of gs) {
    eachCoord(g, (c) => {
      points++
      if (c[0] < minX) minX = c[0]
      if (c[0] > maxX) maxX = c[0]
      if (c[1] < minY) minY = c[1]
      if (c[1] > maxY) maxY = c[1]
    })
  }
  return points === 0 ? null : { minX, maxX, minY, maxY, points }
}

/**
 * geometrySvg draws the bare shape into an SVG viewBox: every coordinate
 * projected linearly into the box (equirectangular in miniature, which at
 * sketch size is what a reader expects of lon/lat), latitude up. Points come
 * back separately so the renderer can size their dots in pixels.
 * @param {Geometry} g
 * @param {number} w
 * @param {number} h
 * @param {number} [pad]
 * @returns {{ paths: string[], dots: { x: number, y: number }[] } | null}
 */
export function geometrySvg(g, w, h, pad = 8) {
  const ext = geometryExtent([g])
  if (!ext) return null
  const { minX, maxX, minY, maxY } = ext
  const spanX = maxX - minX
  const spanY = maxY - minY
  // One scale for both axes keeps the shape's aspect honest; an axis with no
  // extent (a single point, a flat line) stays out of the scale and its zero
  // span centers it through ox/oy below.
  /** @type {number[]} */
  const scales = []
  if (spanX > 0) scales.push((w - 2 * pad) / spanX)
  if (spanY > 0) scales.push((h - 2 * pad) / spanY)
  const scale = scales.length ? Math.min(...scales) : 1
  const ox = (w - spanX * scale) / 2
  const oy = (h - spanY * scale) / 2
  /** @param {number} x */
  const X = (x) => ox + (x - minX) * scale
  /** @param {number} y */
  const Y = (y) => h - (oy + (y - minY) * scale)
  /** @type {string[]} */
  const paths = []
  /** @type {{ x: number, y: number }[]} */
  const dots = []
  /** @param {Geometry} geom */
  const walk = (geom) => {
    if (hasXY(geom.point)) dots.push({ x: X(geom.point[0]), y: Y(geom.point[1]) })
    if (geom.kind === 'MultiPoint') for (const p of geom.points ?? []) dots.push({ x: X(p[0]), y: Y(p[1]) })
    else if (geom.points) paths.push('M' + geom.points.map((p) => `${X(p[0])},${Y(p[1])}`).join(' L'))
    if (geom.kind === 'Polygon' && geom.rings) {
      paths.push(geom.rings.map((ring) => 'M' + ring.map((p) => `${X(p[0])},${Y(p[1])}`).join(' L') + ' Z').join(' '))
    } else if (geom.rings && geom.kind === 'MultiLineString') {
      for (const linePts of geom.rings) paths.push('M' + linePts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' L'))
    }
    for (const poly of geom.polygons ?? []) {
      paths.push(poly.map((ring) => 'M' + ring.map((p) => `${X(p[0])},${Y(p[1])}`).join(' L') + ' Z').join(' '))
    }
    for (const m of geom.members ?? []) walk(m)
  }
  walk(g)
  return { paths, dots }
}

/**
 * drawGeometries renders MANY geometries into one 2D canvas context, all
 * sharing one bounding box and one scale: the whole column's shapes
 * overlaid, which is what "did my spatial query return what I think" looks
 * like. Canvas, not SVG, because a column can hold a hundred thousand
 * coordinates. The caller owns the canvas size (backing pixels) and the
 * colours (a view reads them from ctx.palette).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Geometry[]} gs
 * @param {number} w
 * @param {number} h
 * @param {{ stroke: string, fill: string, dot: string }} colors
 * @param {number} [pad]
 * @param {number} [dotR]
 */
export function drawGeometries(ctx, gs, w, h, colors, pad = 12, dotR = 2.5) {
  const ext = geometryExtent(gs)
  if (!ext) return
  const spanX = ext.maxX - ext.minX
  const spanY = ext.maxY - ext.minY
  /** @type {number[]} */
  const scales = []
  if (spanX > 0) scales.push((w - 2 * pad) / spanX)
  if (spanY > 0) scales.push((h - 2 * pad) / spanY)
  const scale = scales.length ? Math.min(...scales) : 1
  const ox = (w - spanX * scale) / 2
  const oy = (h - spanY * scale) / 2
  /** @param {number} x */
  const X = (x) => ox + (x - ext.minX) * scale
  /** @param {number} y */
  const Y = (y) => h - (oy + (y - ext.minY) * scale)
  ctx.lineWidth = 1.25
  ctx.lineJoin = 'round'
  ctx.strokeStyle = colors.stroke
  ctx.fillStyle = colors.fill
  /** @param {number[][]} pts */
  const ring = (pts) => {
    ctx.moveTo(X(pts[0][0]), Y(pts[0][1]))
    for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1]))
    ctx.closePath()
  }
  /** @param {Geometry} g */
  const draw = (g) => {
    if (hasXY(g.point)) {
      ctx.save()
      ctx.fillStyle = colors.dot
      ctx.beginPath()
      ctx.arc(X(g.point[0]), Y(g.point[1]), dotR, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    if (g.kind === 'MultiPoint') {
      ctx.save()
      ctx.fillStyle = colors.dot
      for (const p of g.points ?? []) {
        ctx.beginPath()
        ctx.arc(X(p[0]), Y(p[1]), dotR, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    } else if (g.points && g.points.length > 0) {
      ctx.beginPath()
      ctx.moveTo(X(g.points[0][0]), Y(g.points[0][1]))
      for (let i = 1; i < g.points.length; i++) ctx.lineTo(X(g.points[i][0]), Y(g.points[i][1]))
      ctx.stroke()
    }
    if (g.kind === 'Polygon' && g.rings) {
      ctx.beginPath()
      for (const r of g.rings) if (r.length > 1) ring(r)
      ctx.fill('evenodd')
      ctx.stroke()
    } else if (g.kind === 'MultiLineString' && g.rings) {
      for (const linePts of g.rings) {
        if (linePts.length < 2) continue
        ctx.beginPath()
        ctx.moveTo(X(linePts[0][0]), Y(linePts[0][1]))
        for (let i = 1; i < linePts.length; i++) ctx.lineTo(X(linePts[i][0]), Y(linePts[i][1]))
        ctx.stroke()
      }
    }
    for (const poly of g.polygons ?? []) {
      ctx.beginPath()
      for (const r of poly) if (r.length > 1) ring(r)
      ctx.fill('evenodd')
      ctx.stroke()
    }
    for (const m of g.members ?? []) draw(m)
  }
  for (const g of gs) draw(g)
}
