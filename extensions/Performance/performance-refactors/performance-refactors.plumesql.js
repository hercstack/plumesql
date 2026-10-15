// @ts-check
// @description Faster queries from the lightbulb: a condition an index can read, keyset pages instead of OFFSET, STABLE for read-only functions, constraints added without holding writes

// This extension REFACTORS (docs: GRIDJSSPEC, Refactors). Each one fixes a
// common reason PostgreSQL works much harder than it has to, returns the
// same rows as before (the keyset page says how the caller pages instead)
// and is offered only where the rewrite helps. Measured on PostgreSQL 17,
// 3 million rows (30 million for the constraint), three runs each:
//
//   created_at::date = '2025-06-01'           57 ms     ->  0.27 ms
//   order by id limit 50 offset 2000000      77-88 ms   ->  0.04 ms
//   where user_id = user_of(123), VOLATILE   356-403 ms ->  0.033-0.036 ms
//   add foreign key on 30 million rows       writes held 1.6 s -> an INSERT 1.1 ms
//
// It reads only what the editor hands it (the statement, its tables with
// their columns, indexes, constraints and row estimates, and for a CREATE
// FUNCTION what PostgreSQL's own parser read in its body), so nothing is
// asked of the server. Declare the function STABLE and Add the constraint
// NOT VALID need PlumeSQL 0.26.0 or later (statement.routine, and an ALTER
// TABLE's table in statement.tables); an older PlumeSQL offers the first two.

/**
 * @typedef {{ from: number, to: number, text: string }} Edit
 * @typedef {{ title: string, edits: Edit[] }} Offer
 * @typedef {{ type: string, notNull: boolean }} ColumnFacts
 * @typedef {{ name: string, column: (name: string) => ColumnFacts | null, pk: string[], btrees: { keys: string[], unique: boolean }[] | null }} TableFacts
 */

const IDENT = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)`

/**
 * A name as the catalog stores it: a quoted one exactly, a bare one in lower case.
 * @param {string} ident
 */
function unquote(ident) {
  return ident.startsWith('"') ? ident.slice(1, -1).replace(/""/g, '"') : ident.toLowerCase()
}

/** @param {string} name */
function quote(name) {
  return /^[a-z_][a-z0-9_$]*$/.test(name) ? name : '"' + name.replace(/"/g, '""') + '"'
}

/**
 * Where a string, a quoted name, a comment or a dollar body starting at i
 * ends; -1 when none starts there.
 * @param {string} text
 * @param {number} i
 */
function skip(text, i) {
  const n = text.length
  const c = text[i]
  if (c === '-' && text[i + 1] === '-') {
    const nl = text.indexOf('\n', i + 2)
    return nl < 0 ? n : nl + 1
  }
  if (c === '/' && text[i + 1] === '*') {
    let depth = 1
    let j = i + 2
    while (j < n) {
      if (text[j] === '/' && text[j + 1] === '*') {
        depth++
        j += 2
      } else if (text[j] === '*' && text[j + 1] === '/') {
        depth--
        j += 2
        if (depth === 0) return j
      } else j++
    }
    return n
  }
  if (c === "'" || c === '"') {
    const escapes = c === "'" && i > 0 && /[eE]/.test(text[i - 1]) && (i < 2 || !/[\w$]/.test(text[i - 2]))
    let j = i + 1
    while (j < n) {
      if (escapes && text[j] === '\\') {
        j += 2
        continue
      }
      if (text[j] === c) {
        if (text[j + 1] === c) {
          j += 2
          continue
        }
        return j + 1
      }
      j++
    }
    return n
  }
  if (c === '$') {
    const m = /^\$(?:[A-Za-z_][\w]*)?\$/.exec(text.slice(i))
    if (m && (i === 0 || !/[\w$]/.test(text[i - 1]))) {
      const close = text.indexOf(m[0], i + m[0].length)
      return close < 0 ? n : close + m[0].length
    }
  }
  return -1
}

/**
 * Whether an offset falls inside a string, a quoted name, a comment or a dollar body.
 * @param {string} text
 * @param {number} offset
 */
function insideAtomic(text, offset) {
  let i = 0
  while (i <= offset && i < text.length) {
    const a = skip(text, i)
    if (a > i) {
      if (offset > i && offset < a) return true
      i = a
      continue
    }
    i++
  }
  return false
}

/**
 * Whether an offset sits inside a parenthesised subquery: its tables are
 * not the statement's.
 * @param {string} text
 * @param {number} offset
 */
function inSubquery(text, offset) {
  /** @type {boolean[]} */
  const opens = []
  let i = 0
  while (i < offset) {
    const a = skip(text, i)
    if (a > i) {
      i = a
      continue
    }
    if (text[i] === '(') opens.push(/^\(\s*(select|with|values|table)\b/i.test(text.slice(i, i + 64)))
    else if (text[i] === ')') opens.pop()
    i++
  }
  return opens.includes(true)
}

/**
 * The token right before at, spacing and a line comment skipped: a word in
 * lower case, or one character.
 * @param {string} text
 * @param {number} at
 */
function tokenBefore(text, at) {
  let i = at - 1
  while (i >= 0) {
    if (/\s/.test(text[i])) {
      i--
      continue
    }
    const lineStart = text.lastIndexOf('\n', i) + 1
    const dash = text.indexOf('--', lineStart)
    if (dash >= 0 && dash <= i && !insideAtomic(text, dash)) {
      i = dash - 1
      continue
    }
    if (/[\w$]/.test(text[i])) {
      let j = i
      while (j > 0 && /[\w$]/.test(text[j - 1])) j--
      return text.slice(j, i + 1).toLowerCase()
    }
    return text[i]
  }
  return ''
}

/**
 * The token right after to, spacing and comments skipped.
 * @param {string} text
 * @param {number} to
 */
function tokenAfter(text, to) {
  let i = to
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++
      continue
    }
    const a = skip(text, i)
    if (a > i && (text.startsWith('--', i) || text.startsWith('/*', i))) {
      i = a
      continue
    }
    const m = /^[A-Za-z_][\w$]*/.exec(text.slice(i))
    if (m) return m[0].toLowerCase()
    return text.slice(i, i + 2) === '::' ? '::' : text[i]
  }
  return ''
}

// Two comparisons joined by AND stand where one stood: bare between AND
// and OR (AND binds tighter than OR), in parentheses anywhere else.
const SAFE_BEFORE = new Set(['', 'where', 'and', 'or', 'on', 'having', 'when', '('])
const SAFE_AFTER = new Set(['', 'and', 'or', ')', 'then', ';', 'order', 'group', 'limit', 'offset', 'fetch', 'having', 'window', 'returning', 'union', 'intersect', 'except', 'for'])
/**
 * @param {string} text
 * @param {number} from
 * @param {number} to
 * @param {string} both
 */
function grouped(text, from, to, both) {
  return SAFE_BEFORE.has(tokenBefore(text, from)) && SAFE_AFTER.has(tokenAfter(text, to)) ? both : `(${both})`
}

/**
 * A table of the statement as these rules read it.
 * @param {RefactorTable} t
 * @returns {TableFacts}
 */
function facts(t) {
  return {
    name: t.name,
    column: (name) => {
      const c = t.columns.find((x) => x.name === name)
      return c ? { type: c.type.toLowerCase(), notNull: !!c.notNull || !!c.pk } : null
    },
    pk: t.columns
      .filter((c) => c.pk)
      .sort((a, b) => (a.pk ?? 0) - (b.pk ?? 0))
      .map((c) => c.name),
    // Before PlumeSQL knew index keys there are none: nothing is claimed.
    btrees: t.indexes ? t.indexes.filter((ix) => ix.method === 'btree').map((ix) => ({ keys: ix.keys, unique: ix.unique })) : null
  }
}

/**
 * How the statement names a table: its alias, else its name.
 * @param {RefactorTable} t
 */
function qualifierOf(t) {
  return unquote(t.alias ?? t.ref.split('.').pop() ?? t.name)
}

// ---------------------------------------------------------------------------
// Compare the indexed column itself.

const DAY_LITERAL = /^((?:date|timestamp|timestamptz)\s+)?'(\d{4})-(\d{2})-(\d{2})'(\s*::\s*date)?$/i
/**
 * A day literal's parts, and how to write another day the same way.
 * @param {string} value
 */
function dayOf(value) {
  const v = DAY_LITERAL.exec(value.trim())
  if (!v) return null
  const y = Number(v[2])
  const m = Number(v[3])
  const d = Number(v[4])
  const t = new Date(Date.UTC(y, m - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null
  const pre = v[1] ?? ''
  const post = v[5] ?? ''
  /** @param {number} n @param {number} w */
  const pad = (n, w) => String(n).padStart(w, '0')
  /** @param {number[]} ymd */
  const write = (ymd) => `${pre}'${pad(ymd[0], 4)}-${pad(ymd[1], 2)}-${pad(ymd[2], 2)}'${post}`
  return { y, m, d, write }
}
/**
 * @param {number} y @param {number} m @param {number} d @param {number} days @param {number} months
 */
function shift(y, m, d, days, months) {
  const t = new Date(Date.UTC(y, m - 1 + months, d + days))
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]
}
/**
 * The day a value names, and the day after it.
 * @param {string} value
 */
function dayBounds(value) {
  const day = dayOf(value)
  if (day) return { lo: value.trim(), hi: day.write(shift(day.y, day.m, day.d, 1, 0)) }
  const v = value.trim()
  if (/^current_date$/i.test(v)) return { lo: v, hi: `${v} + 1` }
  const lo = /::/.test(v) ? `(${v})::date` : `${v}::date`
  return { lo, hi: `${lo} + 1` }
}

const TIME_TYPES = /^timestamp( with(out)? time zone)?$/
const DAY_TYPES = /^(date|timestamp( with(out)? time zone)?)$/
const NUMBER_TYPES = /^(smallint|integer|bigint|numeric(\(.*\))?)$/
const ANY_TYPE = /./

const DAY_VALUE = String.raw`(?:(?:date|timestamp|timestamptz)\s+)?'(?:[^']|'')*'(?:\s*::\s*date)?|current_date|[$:][A-Za-z_]\w*|\$\d+`
const LIT = String.raw`'(?:[^']|'')*'|-?\d+(?:\.\d+)?|true|false`
const NUM_VALUE = String.raw`-?\d+|[$:][A-Za-z_]\w*|\$\d+`
const COL = String.raw`(?:(?<q>${IDENT})\s*\.\s*)?(?<c>${IDENT})`
const startsWord = String.raw`(?<![\w$."])`

/**
 * @typedef {{ re: RegExp, types: RegExp, rewrite: (m: RegExpExecArray, col: string, text: string) => string | null }} Shape
 */
/** @type {Shape[]} */
const SHAPES = [
  // col::date, cast(col as date), date(col), compared with a day.
  ...[
    String.raw`${startsWord}${COL}\s*::\s*date(?![\w$])(?!\s*::)`,
    String.raw`${startsWord}cast\s*\(\s*${COL}\s+as\s+date\s*\)`,
    String.raw`${startsWord}date\s*\(\s*${COL}\s*\)`
  ].flatMap((cast) => [
    {
      re: new RegExp(String.raw`${cast}\s*(?<op><=|>=|<|>|=)\s*(?<v>${DAY_VALUE})`, 'gi'),
      types: TIME_TYPES,
      /** @type {Shape['rewrite']} */
      rewrite: (m, col, text) => {
        const g = /** @type {Record<string, string>} */ (m.groups)
        const { lo, hi } = dayBounds(g.v)
        if (g.op === '=') return grouped(text, m.index, m.index + m[0].length, `${col} >= ${lo} and ${col} < ${hi}`)
        if (g.op === '<') return `${col} < ${lo}`
        if (g.op === '<=') return `${col} < ${hi}`
        if (g.op === '>') return `${col} >= ${hi}`
        return `${col} >= ${lo}`
      }
    },
    {
      re: new RegExp(String.raw`${cast}\s+between\s+(?<a>${DAY_VALUE})\s+and\s+(?<b>${DAY_VALUE})`, 'gi'),
      types: TIME_TYPES,
      /** @type {Shape['rewrite']} */
      rewrite: (m, col, text) => {
        const g = /** @type {Record<string, string>} */ (m.groups)
        return grouped(text, m.index, m.index + m[0].length, `${col} >= ${dayBounds(g.a).lo} and ${col} < ${dayBounds(g.b).hi}`)
      }
    }
  ]),
  // date_trunc('<unit>', col) = a day on that unit's boundary. A day off
  // the boundary matches nothing, and a range from it would.
  {
    re: new RegExp(String.raw`${startsWord}date_trunc\s*\(\s*'(?<unit>day|week|month|quarter|year)'\s*,\s*${COL}\s*\)\s*=\s*(?<v>${DAY_VALUE})`, 'gi'),
    types: DAY_TYPES,
    rewrite: (m, col, text) => {
      const g = /** @type {Record<string, string>} */ (m.groups)
      const day = dayOf(g.v)
      if (!day) return null
      const unit = g.unit.toLowerCase()
      const monday = new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay() === 1
      const ok =
        unit === 'day' ||
        (unit === 'week' && monday) ||
        (unit === 'month' && day.d === 1) ||
        (unit === 'quarter' && day.d === 1 && (day.m - 1) % 3 === 0) ||
        (unit === 'year' && day.d === 1 && day.m === 1)
      if (!ok) return null
      const next = shift(day.y, day.m, day.d, unit === 'day' ? 1 : unit === 'week' ? 7 : 0, unit === 'month' ? 1 : unit === 'quarter' ? 3 : unit === 'year' ? 12 : 0)
      return grouped(text, m.index, m.index + m[0].length, `${col} >= ${g.v.trim()} and ${col} < ${day.write(next)}`)
    }
  },
  // extract(year from col) = 2025, date_part('year', col) = 2025.
  ...[String.raw`${startsWord}extract\s*\(\s*year\s+from\s+${COL}\s*\)`, String.raw`${startsWord}date_part\s*\(\s*'year'\s*,\s*${COL}\s*\)`].map(
    (fn) => ({
      re: new RegExp(String.raw`${fn}\s*=\s*(?<y>\d{4})(?![\w.])`, 'gi'),
      types: DAY_TYPES,
      /** @type {Shape['rewrite']} */
      rewrite: (m, col, text) => {
        const y = Number(/** @type {Record<string, string>} */ (m.groups).y)
        return grouped(text, m.index, m.index + m[0].length, `${col} >= '${y}-01-01' and ${col} < '${y + 1}-01-01'`)
      }
    })
  ),
  // coalesce(col, a) = b, a and b literals that differ: a NULL gives a,
  // which is not b, so no row matched through it.
  {
    re: new RegExp(String.raw`${startsWord}coalesce\s*\(\s*${COL}\s*,\s*(?<a>${LIT})\s*\)\s*=\s*(?<b>${LIT})(?![\w.])`, 'gi'),
    types: ANY_TYPE,
    rewrite: (m, col) => {
      const g = /** @type {Record<string, string>} */ (m.groups)
      /** @param {string} s */
      const norm = (s) => (/^-?\d/.test(s) ? String(Number(s)) : s.startsWith("'") ? s : s.toLowerCase())
      if (norm(g.a) === norm(g.b)) return null
      return `${col} = ${g.b}`
    }
  },
  // col + n or col - n compared with a value: the arithmetic moves across.
  {
    re: new RegExp(String.raw`${startsWord}${COL}\s*(?<sign>[+-])\s*(?<n>\d+)(?![\w.])\s*(?<op><>|!=|<=|>=|<|>|=)\s*(?<v>${NUM_VALUE})(?![\w.])`, 'gi'),
    types: NUMBER_TYPES,
    rewrite: (m, col, text) => {
      const g = /** @type {Record<string, string>} */ (m.groups)
      // Inside a longer expression the arithmetic is not this comparison's alone.
      const before = tokenBefore(text, m.index)
      if (!SAFE_BEFORE.has(before) && before !== 'not' && before !== ',') return null
      if (/^[-+*/%^|:.]/.test(tokenAfter(text, m.index + m[0].length))) return null
      const n = BigInt(g.n)
      const plus = g.sign === '+'
      const value = /^-?\d+$/.test(g.v) ? String(plus ? BigInt(g.v) - n : BigInt(g.v) + n) : `${g.v} ${plus ? '-' : '+'} ${g.n}`
      return `${col} ${g.op} ${value}`
    }
  }
]

/**
 * @param {RefactorStatement} statement
 * @returns {RefactorOffer | null}
 */
function indexRange(statement) {
  if (!['select', 'with', 'update', 'delete'].includes(statement.keyword)) return null
  const text = statement.text
  /** @type {{ from: number, to: number, text: string, col: string, table: string }[]} */
  const found = []
  for (const shape of SHAPES) {
    shape.re.lastIndex = 0
    for (let m = shape.re.exec(text); m; m = shape.re.exec(text)) {
      if (insideAtomic(text, m.index) || inSubquery(text, m.index)) continue
      const g = /** @type {Record<string, string>} */ (m.groups)
      const name = unquote(g.c)
      const qual = g.q ? unquote(g.q) : null
      const owners = statement.tables.filter((t) => (qual ? qualifierOf(t) === qual || t.name === qual : t.columns.some((c) => c.name === name)))
      if (owners.length !== 1) continue
      const t = facts(owners[0])
      if (t.btrees === null) continue
      // An index has to start with the column for the range to use it.
      if (!t.btrees.some((ix) => ix.keys[0] === name) && t.pk[0] !== name) continue
      const c = t.column(name)
      if (!c || !shape.types.test(c.type)) continue
      const written = g.q ? `${g.q}.${g.c}` : g.c
      const out = shape.rewrite(m, written, text)
      if (out === null) continue
      found.push({ from: m.index, to: m.index + m[0].length, text: out, col: written, table: t.name })
    }
  }
  if (!found.length) return null
  const at = found.find((f) => f.from <= statement.caret && statement.caret <= f.to) ?? (found.length === 1 ? found[0] : null)
  if (!at) return null
  return { title: `Compare ${at.col} itself, so the index on ${at.table} serves it`, edits: [{ from: at.from, to: at.to, text: at.text }] }
}

// ---------------------------------------------------------------------------
// Page by the last key instead of OFFSET.

/**
 * A clause's body split on its top-level commas.
 * @param {string} text
 */
function splitTop(text) {
  /** @type {string[]} */
  const out = []
  let depth = 0
  let start = 0
  let i = 0
  while (i < text.length) {
    const a = skip(text, i)
    if (a > i) {
      i = a
      continue
    }
    const c = text[i]
    if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (c === ',' && depth === 0) {
      out.push(text.slice(start, i))
      start = i + 1
    }
    i++
  }
  out.push(text.slice(start))
  return out
}

/**
 * Whether a top-level OR stands in the text.
 * @param {string} text
 */
function hasTopOr(text) {
  let depth = 0
  let i = 0
  while (i < text.length) {
    const a = skip(text, i)
    if (a > i) {
      i = a
      continue
    }
    const c = text[i]
    if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0 && /[A-Za-z_]/.test(c) && (i === 0 || !/[\w$]/.test(text[i - 1]))) {
      const w = /** @type {RegExpExecArray} */ (/^[A-Za-z_][\w$]*/.exec(text.slice(i)))[0]
      if (w.toLowerCase() === 'or') return true
      i += w.length
      continue
    }
    i++
  }
  return false
}

/**
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer | null}
 */
function keysetPage(statement, ctx) {
  const q = statement.query
  if (!q || q.distinct || statement.keyword !== 'select' || statement.tables.length !== 1) return null
  const cl = q.clauses
  if (!cl.from || !cl.orderBy || !cl.offset || !(cl.limit || cl.fetch) || cl.groupBy || cl.having || cl.window) return null
  if (q.items.some((i) => i.aggregate)) return null
  const text = statement.text
  // One table: no join, no second FROM item, no function or subquery.
  if (/,|\bjoin\b|\(/i.test(text.slice(cl.from.from, cl.from.to).replace(/^from\s+/i, ''))) return null
  const table = statement.tables[0]
  const t = facts(table)
  const qualifiers = new Set([qualifierOf(table), table.name])
  // The ORDER BY: plain columns of the table, one direction for all.
  const items = splitTop(text.slice(cl.orderBy.from, cl.orderBy.to).replace(/^order\s+by\s+/i, '')).map((s) =>
    new RegExp(String.raw`^\s*(?:(${IDENT})\s*\.\s*)?(${IDENT})(?:\s+(asc|desc))?\s*$`, 'i').exec(s)
  )
  if (items.some((m) => !m)) return null
  const ms = /** @type {RegExpExecArray[]} */ (items)
  const dirs = new Set(ms.map((m) => (m[3] ?? 'asc').toLowerCase()))
  if (dirs.size !== 1) return null
  const desc = dirs.has('desc')
  /** @type {string[]} */
  const cols = []
  /** @type {string[]} */
  const written = []
  for (const m of ms) {
    if (m[1] && !qualifiers.has(unquote(m[1]))) return null
    const name = unquote(m[2])
    const c = t.column(name)
    // A NULL key would drop out of a row comparison.
    if (!c || !c.notNull) return null
    cols.push(name)
    written.push(m[1] ? `${m[1]}.${m[2]}` : m[2])
  }
  // The order must be total (a unique key among the columns) and an index
  // must read it in that order, or the page still sorts the whole table.
  if (t.btrees === null) return null
  const set = new Set(cols)
  const btrees = [...t.btrees, ...(t.pk.length ? [{ keys: t.pk, unique: true }] : [])]
  const unique = btrees.some((ix) => ix.unique && ix.keys.length > 0 && ix.keys.every((k) => k !== '' && set.has(k)))
  const reads = btrees.some((ix) => cols.every((c, i) => ix.keys[i] === c))
  if (!unique || !reads) return null
  // The OFFSET: a parameter or an expression (a pager's), or a literal deep enough to matter.
  const value = text.slice(cl.offset.from, cl.offset.to).replace(/^offset\s+/i, '').replace(/\s+rows?\s*$/i, '').trim()
  const least = Number(ctx.options.keyset_min_offset ?? 10000)
  if (/^\d+$/.test(value) && Number(value) < least) return null
  const mark = ctx.paramStyle === ':name' ? ':' : '$'
  const used = new Set((text.match(/(?<!:)[$:][A-Za-z_]\w*/g) ?? []).map((x) => x.slice(1).toLowerCase()))
  const params = cols.map((c) => {
    const base = 'last_' + c.replace(/[^\w]/g, '_')
    let name = base
    for (let k = 2; used.has(name); k++) name = base + k
    used.add(name)
    return mark + name
  })
  const op = desc ? '<' : '>'
  const pred = cols.length === 1 ? `${written[0]} ${op} ${params[0]}` : `(${written.join(', ')}) ${op} (${params.join(', ')})`
  /** @type {Edit[]} */
  const edits = []
  let cut = cl.offset.from
  while (cut > 0 && /\s/.test(text[cut - 1])) cut--
  edits.push({ from: cut, to: cl.offset.to, text: '' })
  if (cl.where) {
    const body = text.slice(cl.where.from, cl.where.to)
    const kw = /** @type {RegExpExecArray} */ (/^where\s+/i.exec(body))[0].length
    if (hasTopOr(body.slice(kw))) {
      edits.push({ from: cl.where.from + kw, to: cl.where.from + kw, text: '(' })
      edits.push({ from: cl.where.to, to: cl.where.to, text: `) and ${pred}` })
    } else edits.push({ from: cl.where.to, to: cl.where.to, text: ` and ${pred}` })
  } else {
    const lineStart = text.lastIndexOf('\n', cl.orderBy.from - 1) + 1
    const lead = text.slice(lineStart, cl.orderBy.from)
    edits.push({ from: cl.orderBy.from, to: cl.orderBy.from, text: /^\s*$/.test(lead) && lineStart > 0 ? `where ${pred}\n${lead}` : `where ${pred} ` })
  }
  edits.sort((a, b) => a.from - b.from)
  return { title: `Page by the last ${cols.join(', ')} instead of OFFSET (the next page starts after ${params.join(', ')})`, edits }
}

// ---------------------------------------------------------------------------
// Declare the function STABLE.

/**
 * A PL/pgSQL function that declares no volatility is VOLATILE: called for
 * every row and never through an index. One whose body only reads gets
 * the word after its LANGUAGE.
 * @param {RefactorStatement} statement
 * @returns {RefactorOffer | null}
 */
function declareStable(statement) {
  const r = statement.routine
  if (!r || r.kind !== 'function' || r.language !== 'plpgsql' || r.volatility || !r.languageClause || !r.body) return null
  if (/^(setof )?(void|trigger|event_trigger)$/.test(r.returns ?? '')) return null
  const b = r.body
  if (b.writes || b.dynamic || b.transaction || b.locks) return null
  if (!b.calls.every((c) => c.volatility === 'immutable' || c.volatility === 'stable')) return null
  const upper = statement.text.slice(r.languageClause.from, r.languageClause.from + 8) === 'LANGUAGE'
  const at = r.languageClause.to
  return { title: 'Declare the function STABLE (it only reads: called once per query, its result can use an index)', edits: [{ from: at, to: at, text: upper ? ' STABLE' : ' stable' }] }
}

// ---------------------------------------------------------------------------
// Add the constraint NOT VALID, then VALIDATE it.

const NAME_RE = String.raw`${IDENT}(?:\s*\.\s*${IDENT})*`

/**
 * Where the statement's code ends (before a trailing ';', comments and
 * spacing), and where its ';' is.
 * @param {string} text
 */
function codeEnd(text) {
  let end = 0
  let semi = -1
  let i = 0
  while (i < text.length) {
    const a = skip(text, i)
    if (a > i) {
      if (!(text.startsWith('--', i) || text.startsWith('/*', i))) end = a
      i = a
      continue
    }
    if (text[i] === ';') {
      if (semi < 0) semi = i
    } else if (!/\s/.test(text[i]) && semi < 0) end = i + 1
    i++
  }
  return { end, semi }
}

/**
 * Whether a comma (a second subcommand) or NOT VALID stands at the top level from `from` on.
 * @param {string} text
 * @param {number} from
 */
function topLevel(text, from) {
  let depth = 0
  let i = from
  let prev = ''
  const out = { comma: false, notValid: false }
  while (i < text.length) {
    const a = skip(text, i)
    if (a > i) {
      i = a
      continue
    }
    const c = text[i]
    if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (c === ',' && depth === 0) out.comma = true
    else if (depth === 0 && /[A-Za-z_]/.test(c) && (i === 0 || !/[\w$]/.test(text[i - 1]))) {
      const w = /** @type {RegExpExecArray} */ (/^[A-Za-z_][\w$]*/.exec(text.slice(i)))[0].toLowerCase()
      if (prev === 'not' && w === 'valid') out.notValid = true
      prev = w
      i += w.length
      continue
    }
    i++
  }
  return out
}

/**
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer | null}
 */
function notValid(statement, ctx) {
  if (statement.keyword !== 'alter') return null
  const text = statement.text
  const head = new RegExp(
    String.raw`^\s*alter\s+table\s+(?:if\s+exists\s+)?(?<only>only\s+)?(?<table>${NAME_RE})\s*\*?\s+add\s+(?:constraint\s+(?<name>${IDENT})\s+)?(?<kind>foreign\s+key\s*\((?<cols>[^)]*)\)|check\s*\()`,
    'i'
  ).exec(text)
  if (!head) return null
  const g = /** @type {Record<string, string>} */ (head.groups)
  const tl = topLevel(text, head.index + head[0].length - (/^check/i.test(g.kind) ? 1 : 0))
  if (tl.comma || tl.notValid) return null
  // The table, as PlumeSQL 0.26.0 hands an ALTER TABLE's over, with its statistics.
  const table = statement.tables[0]
  if (!table || table.rows === undefined || table.rows < Number(ctx.options.not_valid_min_rows ?? 1000000)) return null
  const t = facts(table)
  const fk = /^foreign/i.test(g.kind)
  /** @type {Edit[]} */
  const edits = []
  let name = g.name ? unquote(g.name) : ''
  if (!name) {
    // The name PostgreSQL would choose, numbered past one the table has,
    // so VALIDATE can name it.
    let label
    if (fk) label = g.cols.split(',').map((c) => unquote(c.trim())).join('_')
    else {
      const expr = text.slice(head.index + head[0].length)
      label = [...expr.matchAll(new RegExp(IDENT, 'g'))].map((m) => unquote(m[0])).find((w) => t.column(w)) ?? ''
    }
    const base = [t.name, label].filter(Boolean).join('_')
    const suffix = fk ? 'fkey' : 'check'
    const taken = new Set(table.constraints ?? [])
    name = `${base}_${suffix}`
    for (let k = 1; taken.has(name); k++) name = `${base}_${suffix}${k}`
    // PostgreSQL shortens a name past 63 bytes its own way: not guessed.
    if (new TextEncoder().encode(name).length > 63) return null
    const kindAt = head.index + head[0].length - g.kind.length
    edits.push({ from: kindAt, to: kindAt, text: `constraint ${quote(name)} ` })
  }
  const indent = /^[ \t]*/.exec(text)?.[0] ?? ''
  const { end, semi } = codeEnd(text)
  const validate = `alter table ${g.only ? 'only ' : ''}${g.table} validate constraint ${quote(name)};`
  if (semi >= 0) {
    edits.push({ from: end, to: end, text: ' not valid' })
    edits.push({ from: semi + 1, to: semi + 1, text: `\n${indent}${validate}` })
  } else edits.push({ from: end, to: end, text: ` not valid;\n${indent}${validate}` })
  edits.sort((a, b) => a.from - b.from)
  return { title: `Add the constraint NOT VALID, then VALIDATE it (writes to ${t.name} go on while it is checked)`, edits }
}

/** @type {PlumeSQLExtension} */
export default {
  refactors: [
    {
      id: 'index-range',
      label: 'Compare the indexed column itself',
      description: "A cast, a function or arithmetic around an indexed column hides it from the index: created_at::date = '2025-06-01' read 3 million rows in 57 ms, the range on created_at 0.27 ms. Also date(), date_trunc on its unit's boundary, extract(year ...), coalesce(col, a) = b and col + n = v, when a btree index starts with the column.",
      example: "created_at >= '2025-06-01' and created_at < '2025-06-02'",
      refactor: indexRange
    },
    {
      id: 'keyset-page',
      label: 'Page by the last key instead of OFFSET',
      description: 'OFFSET reads and drops every row before the page (OFFSET 2,000,000: 77 to 88 ms); the page after the previous last key is read through the index (0.04 ms). The caller passes that key. For one table ordered by a unique NOT NULL key with an index.',
      example: 'where id > $last_id order by id limit 50',
      refactor: keysetPage
    },
    {
      id: 'declare-stable',
      label: 'Declare the function STABLE',
      description: 'A PL/pgSQL function that declares no volatility is VOLATILE: called for every row, never through an index (356 to 403 ms in a WHERE over 3 million rows). Declared STABLE when its body only reads: 0.033 to 0.036 ms. PlumeSQL 0.26.0 and later.',
      example: 'language plpgsql stable',
      refactor: declareStable
    },
    {
      id: 'not-valid',
      label: 'Add the constraint NOT VALID, then VALIDATE it',
      description: 'ADD FOREIGN KEY or CHECK holds every write to the table until all its rows are checked (1.6 s on 30 million rows); NOT VALID adds it at once and VALIDATE checks while writes go on (an INSERT meanwhile: 1.1 ms). PlumeSQL 0.26.0 and later.',
      example: 'alter table orders validate constraint orders_customer_id_fkey;',
      refactor: notValid
    }
  ],
  options: [
    { key: 'keyset_min_offset', kind: 'number', label: 'Smallest OFFSET to page by key', default: 10000, description: 'A written OFFSET below this is left alone: the rows it skips cost under a millisecond. A parameter is always offered.', refactor: 'keyset-page' },
    { key: 'not_valid_min_rows', kind: 'number', label: 'Smallest table', default: 1000000, description: "The statistics' row estimate a table needs: checking a constraint holds writes about 60 ms per million rows.", refactor: 'not-valid' }
  ]
}
