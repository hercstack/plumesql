// @ts-check
// @description PostGIS in the editor's lightbulb: geometry and geography columns as text a person can read, WKT or GeoJSON

// This extension REFACTORS (docs: GRIDJSSPEC, Refactors): on a SELECT whose
// list names a geometry or geography column (or a * that brings one), the
// editor's lightbulb (Ctrl+. or Cmd+.) offers the column through ST_AsText
// (WKT) or ST_AsGeoJSON, under its own name. It reads only what the editor
// hands it (the statement and its tables' columns from PlumeSQL's
// dictionary). Reading geometry VALUES in a result, and sketching them, is
// the PostGIS extension's.

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
 * Readable geometry: every geometry or geography column of the select list
 * (named, or brought by a * or a t.*) through `fn`, under its own name.
 * @param {RefactorStatement} statement
 * @param {string} fn
 * @returns {{ from: number, to: number, text: string }[]}
 */
function readableEdits(statement, fn) {
  const items = selectList(statement.text)
  if (!items) return []
  const multi = statement.tables.length > 1
  /** @param {RefactorTable} t */
  const qualifierOf = (t) => t.alias ?? t.name
  /** @param {RefactorTable} t @param {boolean} qualify */
  const expand = (t, qualify) =>
    t.columns.map((c) => {
      const ref = (qualify ? qualifierOf(t) + '.' : '') + ident(c.name)
      return GEO_COLUMN.test(c.type) ? `${fn}(${ref}) as ${ident(c.name)}` : ref
    })
  /** @type {{ from: number, to: number, text: string }[]} */
  const edits = []
  for (const it of items) {
    if (it.text === '*') {
      if (!statement.tables.some((t) => t.columns.some((c) => GEO_COLUMN.test(c.type)))) continue
      edits.push({ from: it.from, to: it.to, text: statement.tables.flatMap((t) => expand(t, multi)).join(', ') })
      continue
    }
    const star = /^("[^"]+"|[\w$]+)\.\*$/.exec(it.text)
    if (star) {
      const q = star[1].replace(/^"|"$/g, '')
      const t = statement.tables.find((x) => qualifierOf(x) === q || x.name === q)
      if (!t || !t.columns.some((c) => GEO_COLUMN.test(c.type))) continue
      edits.push({ from: it.from, to: it.to, text: expand(t, true).join(', ') })
      continue
    }
    const col = /^(?:("[^"]+"|[\w$]+)\.)?("[^"]+"|[\w$]+)$/.exec(it.text)
    if (!col) continue
    const q = col[1]?.replace(/^"|"$/g, '')
    const name = col[2].replace(/^"|"$/g, '')
    const owners = statement.tables.filter((t) => (q ? qualifierOf(t) === q || t.name === q : true))
    const c = owners.flatMap((t) => t.columns).find((x) => x.name === name)
    if (!c || !GEO_COLUMN.test(c.type)) continue
    edits.push({ from: it.from, to: it.to, text: `${fn}(${it.text}) as ${ident(name)}` })
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

/** @type {PlumeSQLExtension} */
export default {
  refactors: [{ id: 'readable-geometry', refactor: readableGeometry }]
}
