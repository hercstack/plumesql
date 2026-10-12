// @ts-check
// @description PostGIS in the editor's lightbulb: geometry and geography columns as text a person can read, WKT or GeoJSON

// This extension REFACTORS (docs: GRIDJSSPEC, Refactors): on a SELECT whose
// list names a geometry or geography column (or a * that brings one), the
// editor's lightbulb (Ctrl+. or Cmd+.) offers the column through ST_AsText
// (WKT) or ST_AsGeoJSON, under its own name. It reads only what the editor
// hands it (the statement and its tables' columns from PlumeSQL's
// dictionary). Reading geometry VALUES in a result, and sketching them, is
// the PostGIS extension's.
//
// Once the query has run, it reads the result's first rows too (ctx.result):
// a geometry stored in another reference system (EPSG:3857, a national
// grid) is offered transformed to WGS 84, longitude and latitude, the one
// maps and GeoJSON expect; and the rows within a kilometre of the first
// row's geometry (ST_DWithin on geography, nearest first). Without a run,
// the bounding box of a geometry column (ST_Extent) as a query above.

const GEO_COLUMN = /(?:^|\.)(geometry|geography)\b/i

/**
 * The select list of a SELECT: where it starts and ends in the text, and
 * its items split on the top-level commas, each with its offsets. Null for
 * a statement this cannot read (no top-level FROM, a string or a comment
 * it does not follow).
 * @param {string} text
 */
function selectList(text) {
  const head = /^\s*select\s+(?:distinct\s+(?:on\s*\([^)]*\)\s*)?)?/i.exec(text)
  if (!head) return null
  const start = head[0].length
  /** @type {{ from: number, to: number }[]} */
  const items = []
  let depth = 0
  let itemFrom = start
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (ch === "'" || ch === '"') {
      const close = text.indexOf(ch, i + 1)
      if (close < 0) return null
      i = close
      continue
    }
    if (ch === '-' && text[i + 1] === '-') return null
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (depth === 0 && ch === ',') {
      items.push({ from: itemFrom, to: i })
      itemFrom = i + 1
    } else if (depth === 0 && /^from\b/i.test(text.slice(i, i + 5)) && /\s/.test(text[i - 1] ?? ' ')) {
      items.push({ from: itemFrom, to: i })
      return items.map((it) => {
        const raw = text.slice(it.from, it.to)
        const lead = raw.length - raw.trimStart().length
        return { from: it.from + lead, to: it.from + raw.trimEnd().length, text: raw.trim() }
      })
    }
  }
  return null
}

/**
 * A name as SQL needs it: bare when it is a plain lower case word.
 * @param {string} name
 */
function ident(name) {
  return /^[a-z_][a-z0-9_$]*$/.test(name) ? name : '"' + name.replace(/"/g, '""') + '"'
}

/**
 * Every geometry or geography column of the select list (named, or brought
 * by a * or a t.*) through `wrap`, under its own name; `only` narrows the
 * columns wrapped.
 * @param {RefactorStatement} statement
 * @param {string | ((ref: string) => string)} fn a function name, or the wrapping itself
 * @param {RegExp} [only]
 * @returns {{ from: number, to: number, text: string }[]}
 */
function readableEdits(statement, fn, only = GEO_COLUMN) {
  const wrapOf = typeof fn === 'string' ? (/** @type {string} */ ref) => `${fn}(${ref})` : fn
  const GEO = only
  const items = selectList(statement.text)
  if (!items) return []
  const multi = statement.tables.length > 1
  /** @param {RefactorTable} t */
  const qualifierOf = (t) => t.alias ?? t.name
  /** @param {RefactorTable} t @param {boolean} qualify */
  const expand = (t, qualify) =>
    t.columns.map((c) => {
      const ref = (qualify ? qualifierOf(t) + '.' : '') + ident(c.name)
      return GEO.test(c.type) ? `${wrapOf(ref)} as ${ident(c.name)}` : ref
    })
  /** @type {{ from: number, to: number, text: string }[]} */
  const edits = []
  for (const it of items) {
    if (it.text === '*') {
      if (!statement.tables.some((t) => t.columns.some((c) => GEO.test(c.type)))) continue
      edits.push({ from: it.from, to: it.to, text: statement.tables.flatMap((t) => expand(t, multi)).join(', ') })
      continue
    }
    const star = /^("[^"]+"|[\w$]+)\.\*$/.exec(it.text)
    if (star) {
      const q = star[1].replace(/^"|"$/g, '')
      const t = statement.tables.find((x) => qualifierOf(x) === q || x.name === q)
      if (!t || !t.columns.some((c) => GEO.test(c.type))) continue
      edits.push({ from: it.from, to: it.to, text: expand(t, true).join(', ') })
      continue
    }
    const col = /^(?:("[^"]+"|[\w$]+)\.)?("[^"]+"|[\w$]+)$/.exec(it.text)
    if (!col) continue
    const q = col[1]?.replace(/^"|"$/g, '')
    const name = col[2].replace(/^"|"$/g, '')
    const owners = statement.tables.filter((t) => (q ? qualifierOf(t) === q || t.name === q : true))
    const c = owners.flatMap((t) => t.columns).find((x) => x.name === name)
    if (!c || !GEO.test(c.type)) continue
    edits.push({ from: it.from, to: it.to, text: `${wrapOf(it.text)} as ${ident(name)}` })
  }
  return edits
}

/**
 * @param {RefactorStatement} statement
 * @returns {RefactorOffer[]}
 */
function readableGeometry(statement) {
  if (statement.keyword !== 'select' || !statement.tables.length) return []
  /** @type {RefactorOffer[]} */
  const offers = []
  for (const [fn, label] of [['ST_AsText', 'WKT'], ['ST_AsGeoJSON', 'GeoJSON']]) {
    const edits = readableEdits(statement, fn)
    if (edits.length) offers.push({ title: `Readable geometry as ${label} (${fn})`, edits })
  }
  return offers
}

/**
 * The reference system (SRID) a geometry value carries, read from the
 * server's text for it, hex EWKB: a byte order, a type with the SRID flag,
 * then the SRID. 0 when it carries none or is not hex EWKB.
 * @param {string | null} hex
 */
function sridOf(hex) {
  if (!hex || !/^0[01][0-9a-f]{16,}$/i.test(hex)) return 0
  const le = hex.slice(0, 2) === '01'
  const word = (/** @type {number} */ at) => {
    const b = hex.slice(at, at + 8).match(/../g) ?? []
    return parseInt((le ? b.reverse() : b).join(''), 16) >>> 0
  }
  const type = word(2)
  return type & 0x20000000 ? word(10) : 0
}

/**
 * Transform to WGS 84: once the statement has run, a geometry column whose
 * first values sit in another reference system is offered through
 * ST_Transform(..., 4326), under its own name.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function transformToWgs84(statement, ctx) {
  const result = ctx.result
  if (statement.keyword !== 'select' || !result || !statement.tables.length) return []
  const srids = new Set()
  result.columns.forEach((c, i) => {
    // The type of a result column an extension made can read unknown,
    // so the values decide: hex EWKB, the server's text for a geometry.
    if (!/(?:^|\.)geometry\b|^unknown$/i.test(c.type)) return
    for (const row of result.rows.slice(0, 20)) {
      const srid = sridOf(row[i])
      if (srid) srids.add(srid)
    }
  })
  const from = [...srids].filter((s) => s !== 4326)
  if (!from.length) return []
  const edits = readableEdits(statement, (ref) => `ST_Transform(${ref}, 4326)`, /(?:^|\.)geometry\b/i)
  if (!edits.length) return []
  return [{ title: `Transform to WGS 84 (from EPSG:${from.join(', ')})`, edits }]
}

/**
 * Rows within a distance of the first row (the distance option, 1 km
 * unless set): once the statement has run, the first row's geometry
 * becomes the centre of a ST_DWithin on geography (in metres, whatever the
 * stored reference system), nearest first. On a SELECT without a WHERE, an
 * ORDER BY or a LIMIT of its own.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function withinOfFirstRow(statement, ctx) {
  const result = ctx.result
  if (statement.keyword !== 'select' || !result || !result.rows.length) return []
  const body = statement.text.replace(/[\s;]+$/, '')
  if (/\bwhere\b|\border\s+by\b|\blimit\b|\bgroup\s+by\b/i.test(body)) return []
  const set = Number(ctx.options?.distance)
  const metres = Number.isFinite(set) && set > 0 ? set : 1000
  const words = metres >= 1000 && metres % 100 === 0 ? `${metres / 1000} km` : `${metres} m`
  const qualify = statement.tables.length > 1
  /** @type {RefactorOffer[]} */
  const offers = []
  for (const t of statement.tables) {
    for (const c of t.columns) {
      const geo = /(?:^|\.)(geometry|geography)\b/i.exec(c.type)?.[1]?.toLowerCase()
      if (!geo || offers.length >= 2) continue
      const i = result.columns.findIndex((x) => x.name === c.name)
      const hex = i >= 0 ? result.rows[0][i] : null
      if (!hex || !/^0[01][0-9a-f]{16,}$/i.test(hex)) continue
      const col = (qualify ? (t.alias ?? t.name) + '.' : '') + ident(c.name)
      const srid = sridOf(hex)
      // geography is metres already; a geometry goes through WGS 84 first
      // unless it is stored there.
      const toGeog = (/** @type {string} */ g) =>
        geo === 'geography' ? g : srid && srid !== 4326 ? `ST_Transform(${g}, 4326)::geography` : `${g}::geography`
      const here = toGeog(geo === 'geography' ? `'${hex}'::geography` : `'${hex}'::geometry`)
      const there = toGeog(col)
      offers.push({
        title: `Rows within ${words} of the first row's ${c.name}`,
        edits: [
          {
            from: body.length,
            to: body.length,
            text: `\nwhere ST_DWithin(${there}, ${here}, ${metres})\norder by ST_Distance(${there}, ${here})`
          }
        ]
      })
    }
  }
  return offers
}

/**
 * Bounding box: the extent of a geometry or geography column the SELECT
 * returns (ST_Extent), as a query above over the statement as it is.
 * @param {RefactorStatement} statement
 * @returns {RefactorOffer[]}
 */
function boundingBox(statement) {
  if (statement.keyword !== 'select' || statement.tables.length !== 1) return []
  const body = statement.text.replace(/[\s;]+$/, '')
  if (/\bgroup\s+by\b/i.test(body)) return []
  const list = selectList(statement.text) ?? []
  // What each item names, its first word's last part, unquoted.
  const names = list.map((it) => {
    const head = it.text.split(/\s+/)[0]
    const last = head.slice(head.lastIndexOf('.') + 1)
    return last.startsWith('"') ? last.slice(1, -1) : last.toLowerCase()
  })
  const star = names.includes('*')
  const named = (/** @type {string} */ name) => names.includes(name)
  return statement.tables[0].columns
    .filter((c) => GEO_COLUMN.test(c.type) && (star || named(c.name)))
    .slice(0, 2)
    .map((c) => {
      const g = /(?:^|\.)geography\b/i.test(c.type) ? `${ident(c.name)}::geometry` : ident(c.name)
      return {
        title: `Bounding box of ${c.name} (a query above)`,
        edits: [{ from: 0, to: 0, text: `select ST_Extent(${g}) from (${body}) q;\n` }]
      }
    })
}

/** @type {PlumeSQLExtension} */
export default {
  refactors: [
    { id: 'readable-geometry', label: 'Readable geometry', description: 'A geometry or geography column as WKT or GeoJSON, under its own name.', example: 'ST_AsText(geom) as geom', refactor: readableGeometry },
    { id: 'transform-to-wgs84', label: 'Transform to WGS 84', description: 'Once the query has run: a column stored in another reference system, moved to longitude and latitude.', example: 'ST_Transform(geom, 4326) as geom', refactor: transformToWgs84 },
    { id: 'within-of-first-row', label: "Rows within a distance of the first row", description: "Once the query has run: the rows near the first row's geometry, nearest first.", example: 'where ST_DWithin(geom::geography, ..., 1000)', refactor: withinOfFirstRow },
    { id: 'bounding-box', label: 'Bounding box', description: 'The extent of a geometry column over every row the query returns, as a query above.', example: 'select ST_Extent(geom) from (...) q;', refactor: boundingBox }
  ],
  options: [
    {
      key: 'distance',
      kind: 'number',
      label: 'Distance in metres',
      default: 1000,
      description: 'How far from the first row the rows are kept, measured on geography.',
      refactor: 'within-of-first-row'
    }
  ]
}
