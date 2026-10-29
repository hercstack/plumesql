// @ts-check
// @description Ranges in the editor's lightbulb: a range's bounds and length as columns, @> for a bounds check, one row per day or number of a range, a multirange's ranges as rows

// This extension REFACTORS (docs: GRIDJSSPEC, Refactors): on a statement
// over a range or multirange column, the moves people look up every time.
//
//   Add the bounds of during as columns       lower(during) as during_lower, upper(during) as during_upper
//   Add the length of during as a column      upper(during) - lower(during) as during_length
//   Use @> on during                          during @> x, for lower(during) <= x and x < upper(during)
//   One row per day of during                 left join lateral generate_series(lower(during), upper(during) - 1, ...)
//   Expand the ranges of busy into rows       left join lateral unnest(busy) ...
//
// The range columns are the statement's tables' (the dictionary's types),
// or, over a subquery, a CTE, a UNION or a SELECT with no FROM, the ones
// its last run returned, and once it has run, the ones its select list
// computes. It reads only what the editor hands it, so nothing is asked of
// the server.

const NAME = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)`
const REF = String.raw`(?:${NAME}\s*\.\s*)?${NAME}`
const STRING = String.raw`'(?:[^']|'')*'`

/** @param {string} name */
function quote(name) {
  return /^[a-z_][a-z0-9_$]*$/.test(name) ? name : '"' + name.replace(/"/g, '""') + '"'
}
/** A name as the catalog stores it: a quoted one exactly, a bare one in lower case. @param {string} ident */
function unquote(ident) {
  const t = ident.trim()
  return t.startsWith('"') ? t.slice(1, -1).replace(/""/g, '"') : t.toLowerCase()
}
/** @param {string} s */
const literal = (s) => "'" + s.replace(/'/g, "''") + "'"
/** @param {string} s */
const unliteral = (s) => s.slice(1, -1).replace(/''/g, "'")

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
    let j = i + 1
    while (j < n) {
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
 * Where each line of a text starts that is code: never inside a string, a
 * quoted name or a dollar body, whose line breaks are part of the value; a
 * block comment's lines move with the code around them.
 * @param {string} text
 */
function codeLineStarts(text) {
  const starts = [0]
  for (let i = 0; i < text.length; ) {
    const a = skip(text, i)
    if (a > i) {
      if (text[i] === '/') for (let j = text.indexOf('\n', i); j >= 0 && j < a; j = text.indexOf('\n', j + 1)) starts.push(j + 1)
      // A line comment ends with its line break.
      if (text[a - 1] === '\n') starts.push(a)
      i = a
      continue
    }
    if (text[i] === '\n') starts.push(i + 1)
    i++
  }
  return starts
}

/** Two spaces before every line of code that has any. @param {string} text */
function indent(text) {
  const starts = new Set(codeLineStarts(text))
  let out = ''
  for (let i = 0; i < text.length; i++) {
    if (starts.has(i) && text[i] !== '\n') out += '  '
    out += text[i]
  }
  return out
}

/** Whether an offset falls inside a string, a quoted name, a comment or a dollar body. @param {string} text @param {number} offset */
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

/** The commas at a text's own depth, outside strings and comments. @param {string} text */
function topCommas(text) {
  let depth = 0
  let n = 0
  for (let i = 0; i < text.length; i++) {
    const a = skip(text, i)
    if (a > i) {
      i = a - 1
      continue
    }
    if (text[i] === '(') depth++
    else if (text[i] === ')') depth--
    else if (text[i] === ',' && depth === 0) n++
  }
  return n
}

/** The index of the parenthesis closing the one that opens text, or -1. @param {string} text */
function closingParen(text) {
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const a = skip(text, i)
    if (a > i) {
      i = a - 1
      continue
    }
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return i
  }
  return -1
}

/**
 * The statement as the refactors read it: its select list, its FROM list
 * and WHERE condition as text, and where each is. A set operation, a
 * VALUES list or a SELECT with no FROM (`select array[1, 2] as a`:
 * no FROM item to reach a column by, the column a name of the list's own)
 * is read as the subquery of `select * from (...) q`, its columns the
 * ones its last run returned, and every edit of it rewrites the whole
 * statement so.
 * A column the select list COMPUTES (`string_to_array(tags_text, ',') as
 * tags`) carries its expression: the name is the list's own, which nothing
 * at the list's level can reach, so the refactors write the expression.
 * @typedef {{ qualifier: string, table: string, column: string, type: string, expr?: { text: string, kind: string, op?: string, inFrom: boolean }, renamed?: boolean }} Column
 * @typedef {{ text: string, listFrom: number, listTo: number, list: string, fromAt: number, fromText: string, fromEnd: number, nextAt: number, where: string, bodyEnd: number, wrapped: null | { bodyLen: number, tail: string }, items: RefactorQueryItem[] | null }} Model
 * @param {RefactorStatement} statement
 * @returns {Model | null}
 */
function modelOf(statement) {
  const text = statement.text
  const q = statement.query
  if (q) {
    const from = q.clauses.from
    if (statement.keyword !== 'select') return null
    if (!from) return wrappedOf(statement)
    const later = Object.values(q.clauses)
      .filter((c) => c && c.from > from.to)
      .map((c) => /** @type {{ from: number }} */ (c).from)
    const nextAt = later.length ? Math.min(...later) : q.end
    const where = q.clauses.where
    return {
      text,
      listFrom: q.select.from,
      listTo: q.select.to,
      list: text.slice(q.select.from, q.select.to).trim(),
      fromAt: from.from,
      fromText: text.slice(from.from + 4, from.to).trim(),
      fromEnd: from.to,
      nextAt,
      where: where ? text.slice(where.from + 5, where.to).trim() : '',
      bodyEnd: q.end,
      wrapped: null,
      items: q.items
    }
  }
  // A set operation (select with no query facts) or a VALUES list.
  if (statement.keyword !== 'values' && statement.keyword !== 'select') return null
  if (statement.keyword === 'select' && !/\b(union|intersect|except)\b/i.test(text)) return null
  return wrappedOf(statement)
}

/**
 * The statement read as the subquery of `select * from (...) q`.
 * @param {RefactorStatement} statement
 * @returns {Model}
 */
function wrappedOf(statement) {
  const text = statement.text
  const body = text.replace(/[\s;]+$/, '')
  const tail = text.slice(body.length)
  const wrappedText = `select *\nfrom (\n${indent(body)}\n) q${tail}`
  const fromAt = 'select *\n'.length
  const fromEnd = wrappedText.length - tail.length
  return {
    text: wrappedText,
    listFrom: 'select '.length,
    listTo: 'select *'.length,
    list: '*',
    fromAt,
    fromText: `(\n${indent(body)}\n) q`,
    fromEnd,
    nextAt: fromEnd,
    where: '',
    bodyEnd: fromEnd,
    wrapped: { bodyLen: body.length, tail },
    items: null
  }
}

/**
 * The edits of a model as edits of the statement as written: a statement
 * inserted above stays an insertion; everything else, on a wrapped model,
 * becomes one replacement of the statement by its wrapped and edited form.
 * @param {Model} m
 * @param {{ from: number, to: number, text: string }[]} edits
 */
function asEdits(m, edits) {
  if (!m.wrapped) return edits
  const above = edits.filter((e) => e.from === 0 && e.to === 0 && /;\n?$/.test(e.text))
  const rest = edits.filter((e) => !above.includes(e)).sort((a, b) => b.from - a.from)
  if (!rest.length) return above
  let text = m.text
  for (const e of rest) text = text.slice(0, e.from) + e.text + text.slice(e.to)
  if (!text.endsWith(m.wrapped.tail)) return null
  return [...above, { from: 0, to: m.wrapped.bodyLen, text: text.slice(0, text.length - m.wrapped.tail.length) }]
}

/** The columns of the statement's tables of the type, by the name it reaches each by. @param {RefactorStatement} statement */
function tableColumns(statement) {
  /** @type {Column[]} */
  const out = []
  for (const t of statement.tables) {
    for (const c of t.columns) {
      if (isType(c.type)) out.push({ qualifier: t.alias ?? t.ref.replace(/\s+/g, '').split('.').pop() ?? t.name, table: t.name, column: c.name, type: c.type })
    }
  }
  return out
}

/**
 * The columns of the type: the statement's tables', each with the name the
 * statement reaches its table by. When none of its tables has one and it
 * reads ONE thing the dictionary does not know (a subquery in FROM, a CTE,
 * the wrapped UNION), the ones its last run RETURNED stand in, the ones its
 * select list passes through unrenamed. Either way, once the statement has
 * run, the ones its select list computes or renames join them, each with
 * its expression.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @param {Model} m
 * @returns {Column[]}
 */
function columnsOf(statement, ctx, m) {
  const computed = m.wrapped ? [] : computedColumns(statement, ctx, m)
  const names = new Set(computed.filter((c) => !c.renamed).map((c) => c.column.toLowerCase()))
  // A table's column the list hides behind a computed one of its name is
  // not what the result's column holds.
  const own = m.wrapped ? [] : tableColumns(statement).filter((c) => !names.has(c.column.toLowerCase()))
  if (own.length) return [...own, ...computed]
  return [...passedColumns(statement, ctx, m), ...computed]
}

/**
 * The columns of the type the last run returned that the select list
 * computes or renames, each with its expression as written.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @param {Model} m
 * @returns {Column[]}
 */
function computedColumns(statement, ctx, m) {
  const r = ctx.result
  if (!r || !m.items) return []
  /** @type {Column[]} */
  const out = []
  for (const it of m.items) {
    if (it.star || !it.expr) continue
    // A column under its own name is the table's, read as such.
    const renamed = !!it.column
    if (renamed && (!it.alias || it.alias.toLowerCase() === (it.column?.[it.column.length - 1] ?? '').toLowerCase())) continue
    const hits = r.columns.filter((c) => c.name.toLowerCase() === it.name.toLowerCase())
    if (hits.length !== 1 || !isType(hits[0].type)) continue
    const text = statement.text.slice(it.expr.from, it.expr.to)
    // An aggregate or a window function belongs to the select list, not to
    // a FROM item; nor is a renamed column worth a second one.
    const inFrom = !renamed && !it.aggregate && !/\bover\s*\(/i.test(text)
    out.push({ qualifier: '', table: '', column: hits[0].name, type: hits[0].type, expr: { text, kind: it.expr.parenthesized ? 'parenthesized' : it.expr.kind, op: it.expr.op, inFrom }, renamed })
  }
  return out
}

/**
 * The columns of the type the last run returned that the one FROM item the
 * dictionary does not know passes through the select list unrenamed.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @param {Model} m
 * @returns {Column[]}
 */
function passedColumns(statement, ctx, m) {
  /** @type {Column[]} */
  const out = []
  const r = ctx.result
  if (!r) return []
  /** @type {string} */
  let qualifier
  const from = m.fromText
  // One parenthesised item (two subqueries joined leave more after the
  // first's closing parenthesis), with its name and, if it has them, the
  // names of its columns: `(values ...) b(id, during)`.
  const close = from.startsWith('(') ? closingParen(from) : -1
  const derived = close > 0 ? new RegExp(String.raw`^\s*(?:as\s+)?(${NAME})?(?:\s*\(\s*${NAME}(?:\s*,\s*${NAME})*\s*\))?\s*$`, 'i').exec(from.slice(close + 1)) : null
  if (derived) {
    qualifier = derived[1] ?? ''
  } else {
    const named = new RegExp(String.raw`^(${NAME}(?:\s*\.\s*${NAME})?)(?:\s+(?:as\s+)?(${NAME}))?$`, 'i').exec(from)
    if (!named || /^(?:join|where|on|using)$/i.test(named[2] ?? '')) return []
    const last = unquote(named[1].split('.').pop() ?? '')
    if (statement.tables.some((t) => t.name === last)) return []
    qualifier = named[2] ?? named[1].split('.').pop() ?? ''
  }
  const items = m.items
  const star = !items || items.some((i) => i.star)
  const passed = new Set((items ?? []).filter((i) => i.column && !i.alias).map((i) => i.name.toLowerCase()))
  const computed = new Set((items ?? []).filter((i) => !i.column && !i.star).map((i) => i.name.toLowerCase()))
  for (const c of r.columns) {
    if (!isType(c.type) || computed.has(c.name.toLowerCase()) || !(star || passed.has(c.name.toLowerCase()))) continue
    if (out.some((o) => o.column === c.name)) continue
    out.push({ qualifier, table: unquote(qualifier || 'q'), column: c.name, type: c.type })
  }
  return out
}

/** How the statement reaches a column: qualified, or bare when its FROM item has no name. @param {Column} c */
const refOf = (c) => (c.qualifier ? `${c.qualifier}.${quote(c.column)}` : quote(c.column))

/**
 * The statement's facts for the type once: its model and its columns; null
 * where there are none.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 */
function factsOf(statement, ctx) {
  const m = modelOf(statement)
  if (!m) return null
  const cols = columnsOf(statement, ctx, m)
  return cols.length ? { m, cols } : null
}

/**
 * Where the select list ends and a new item goes, written one per line
 * under the list: `,\n       <item>`, the FROM on a line of its own after.
 * @param {Model} m
 * @param {string[]} items
 */
function addToList(m, items) {
  const fromOwnLine = /\n/.test(m.text.slice(m.listTo, m.fromAt))
  return asEdits(m, [{ from: m.listTo, to: fromOwnLine ? m.listTo : m.fromAt, text: items.map((t) => `,\n       ${t}`).join('') + (fromOwnLine ? '' : '\n') }])
}

/**
 * Join a lateral set returning call onto the statement's FROM: after a
 * comma list (`from a, b`) a JOIN binds to the last item only, and an
 * aggregated or DISTINCT query cannot list the new rows' columns (the
 * wrapper around one can), so neither is offered.
 * @param {RefactorStatement} statement
 * @param {Model} m
 * @param {string} join
 * @param {string} added what the select list gets, unless it is a `*`
 */
function joinRows(statement, m, join, added) {
  if (topCommas(m.fromText) > 0) return null
  const q = statement.query
  if (q && !m.wrapped && (q.clauses.groupBy || q.distinct || q.items.some((i) => i.aggregate))) return null
  const rest = m.nextAt < m.bodyEnd
  const listed = m.list !== '' && m.list !== '*'
  return asEdits(m, [
    ...(listed ? [{ from: m.listTo, to: m.listTo, text: `, ${added}` }] : []),
    { from: m.fromEnd, to: rest ? m.nextAt : m.fromEnd, text: `\n${join}${rest ? '\n' : ''}` }
  ])
}

/**
 * The conditions of the statement a rewrite may replace: every node of its
 * WHERE (a query's, an UPDATE's or a DELETE's) and of its joins' ON that no
 * NOT stands over (under a NOT, a NULL and a false part ways).
 * @param {RefactorStatement} statement
 * @returns {RefactorExpr[]}
 */
function conditionsOf(statement) {
  /** @type {RefactorExpr[]} */
  const out = []
  /** @param {RefactorExpr | undefined} e */
  const walk = (e) => {
    if (!e || e.kind === 'not' || e.kind.startsWith('not ')) return
    out.push(e)
    if (e.kind === 'and' || e.kind === 'or') for (const a of e.args ?? []) walk(a)
  }
  walk(statement.query?.where)
  for (const j of statement.query?.joins ?? []) walk(j.on)
  walk(statement.where)
  return out
}

/**
 * The one of several candidates the caret stands in, or the only one.
 * @template {{ from: number, to: number }} T
 * @param {RefactorStatement} statement
 * @param {T[]} all
 */
function pick(statement, all) {
  return all.find((m) => m.from <= statement.caret && statement.caret <= m.to) ?? (all.length === 1 ? all[0] : undefined)
}

/** The column a reference in the text names (tags, t.tags), or none. @param {Column[]} cols @param {string} ref */
function columnAt(cols, ref) {
  const parts = ref.split('.').map((p) => unquote(p))
  const name = parts[parts.length - 1]
  const q = parts.length > 1 ? parts[parts.length - 2] : undefined
  const hits = cols.filter((c) => !c.expr && c.column.toLowerCase() === name.toLowerCase() && (!q || unquote(c.qualifier).toLowerCase() === q.toLowerCase() || c.table.toLowerCase() === q.toLowerCase()))
  return hits.length === 1 ? hits[0] : undefined
}

/** PostgreSQL's own range and multirange types. @param {string} type */
function isType(type) {
  return /^(int4|int8|num|ts|tstz|date)(multi)?range$/i.test((type ?? '').trim())
}
/** @param {string} type */
const isMulti = (type) => /multirange$/i.test(type.trim())

/** The type of a range's values. */
const ELEMENT = { int4range: 'integer', int8range: 'bigint', numrange: 'numeric', tsrange: 'timestamp', tstzrange: 'timestamptz', daterange: 'date' }

/** The reference a refactor writes for a column: a computed one's expression is a call's argument. @param {Column} c */
const refFor = (c) => (c.expr ? c.expr.text : refOf(c))
/** @param {Column} c */
const inFrom = (c) => !c.expr || c.expr.inFrom

/**
 * The range columns the select list RETURNS: a `*` returns its tables'
 * columns, a bare item names one, and a computed one is the list's own;
 * a range column the query only filters on gets no column of its bounds.
 * @param {RefactorStatement} statement
 * @param {Model} m
 * @param {Column[]} cols
 */
function returned(statement, m, cols) {
  if (m.wrapped || !m.items || m.items.some((i) => i.star)) return cols
  const named = new Set(m.items.filter((i) => i.column && !i.alias).map((i) => i.name.toLowerCase()))
  return cols.filter((c) => c.expr || named.has(c.column.toLowerCase()))
}

/** The column's reference in the select list: bare over one table. @param {RefactorStatement} statement @param {Model} m @param {Column} c */
const listRef = (statement, m, c) => (c.expr ? refFor(c) : statement.tables.length <= 1 && !m.wrapped ? quote(c.column) : refOf(c))

/**
 * Add the bounds as columns: lower() and upper() under the column's name.
 * An unbounded side is NULL, an empty range both.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function bounds(statement, ctx) {
  const f = factsOf(statement, ctx)
  if (!f) return []
  const have = new Set((ctx.result?.columns ?? []).map((c) => c.name.toLowerCase()))
  /** @type {RefactorOffer[]} */
  const out = []
  for (const c of returned(statement, f.m, f.cols).slice(0, 6)) {
    const base = c.column.toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'range'
    const lo = `${base}_lower`
    const hi = `${base}_upper`
    if (have.has(lo) || have.has(hi)) continue
    const ref = listRef(statement, f.m, c)
    const edits = addToList(f.m, [`lower(${ref}) as ${quote(lo)}`, `upper(${ref}) as ${quote(hi)}`])
    if (edits) out.push({ title: `Add the bounds of ${c.column} as columns (${lo}, ${hi})`, edits })
  }
  return out
}

/**
 * Add the length as a column: upper() minus lower(), an interval for a
 * timestamp range, days for a date range, a number for a number range;
 * NULL for an unbounded or an empty one.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function length(statement, ctx) {
  const f = factsOf(statement, ctx)
  if (!f) return []
  const have = new Set((ctx.result?.columns ?? []).map((c) => c.name.toLowerCase()))
  /** @type {RefactorOffer[]} */
  const out = []
  for (const c of returned(statement, f.m, f.cols).slice(0, 6)) {
    const name = `${c.column.toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'range'}_length`
    if (have.has(name)) continue
    const ref = listRef(statement, f.m, c)
    const edits = addToList(f.m, [`upper(${ref}) - lower(${ref}) as ${quote(name)}`])
    if (edits) out.push({ title: `Add the length of ${c.column} as a column (upper minus lower)`, edits })
  }
  return out
}

/**
 * @> for a bounds check: `lower(r) <= x and x < upper(r)` (either way
 * round, either order) or `x between lower(r) and upper(r)` becomes
 * `r @> x`, x cast to the range's value type unless it is already one (a
 * daterange holds no timestamp: `lower(d) <= now()` compares the day's
 * midnight, which `d @> now()::date` does alike), which honors the range's
 * own bounds (BETWEEN takes in the
 * upper bound a [) range leaves out; an unbounded side matches every x,
 * where the comparison with its NULL matches none) and which a GiST index
 * on the column can serve. Never under a NOT.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function contains(statement, ctx) {
  const cols = tableColumns(statement).filter((c) => !isMulti(c.type))
  if (!cols.length) return []
  const text = statement.text
  const at = (/** @type {RefactorExpr} */ e) => text.slice(e.from, e.to)
  /** The range column a lower(r) or upper(r) call reads. @param {RefactorExpr | undefined} e @param {string} fn */
  const boundOf = (e, fn) => {
    if (!e || e.kind !== 'function' || e.name?.toLowerCase() !== fn || e.args?.length !== 1 || e.args[0].kind !== 'column') return undefined
    const ref = at(e.args[0])
    return columnAt(cols, ref) ? ref : undefined
  }
  /**
   * A side of the check: `lower(r) <= x` / `x >= lower(r)` gives
   * { side: 'lower', ref, x }, `x < upper(r)` / `upper(r) > x` 'upper'.
   * @param {RefactorExpr} e
   */
  const sideOf = (e) => {
    if (e.kind !== 'operator' || e.args?.length !== 2) return undefined
    const [a, b] = e.args
    if (e.op === '<=' && boundOf(a, 'lower')) return { side: 'lower', ref: boundOf(a, 'lower'), x: at(b), node: b }
    if (e.op === '>=' && boundOf(b, 'lower')) return { side: 'lower', ref: boundOf(b, 'lower'), x: at(a), node: a }
    if (e.op === '<' && boundOf(b, 'upper')) return { side: 'upper', ref: boundOf(b, 'upper'), x: at(a), node: a }
    if (e.op === '>' && boundOf(a, 'upper')) return { side: 'upper', ref: boundOf(a, 'upper'), x: at(b), node: b }
    return undefined
  }
  const norm = (/** @type {string} */ s) => s.replace(/\s+/g, '').toLowerCase()
  /**
   * x as a value of the range c holds: a string literal takes the type
   * itself, and so does a column of the tables declared that type.
   * @param {RefactorExpr} x @param {string} ref
   */
  const valueOf = (x, ref) => {
    const c = columnAt(cols, ref)
    const elem = c ? /** @type {Record<string, string>} */ (ELEMENT)[c.type.trim().toLowerCase()] : undefined
    const written = at(x)
    if (!elem || (x.kind === 'constant' && x.type === 'string')) return written
    if (x.kind === 'column') {
      const name = (x.column ?? []).slice(-1)[0]?.toLowerCase()
      const own = statement.tables.flatMap((t) => t.columns).filter((k) => k.name.toLowerCase() === name)
      if (own.length && own.every((k) => k.type.trim().toLowerCase() === elem || (elem === 'timestamptz' && k.type === 'timestamp with time zone') || (elem === 'timestamp' && k.type === 'timestamp without time zone'))) return written
    }
    // current_date and its kin read as a word.
    const bare = (['column', 'function', 'constant', 'cast', 'subquery'].includes(x.kind) && !x.parenthesized) || /^[A-Za-z_][\w$.]*$/.test(written)
    return `${bare ? written : `(${written})`}::${elem}`
  }
  /** @type {{ from: number, to: number, text: string, column: string }[]} */
  const found = []
  for (const e of conditionsOf(statement)) {
    if (e.kind === 'between' && e.args?.length === 3) {
      const lo = boundOf(e.args[1], 'lower')
      const hi = boundOf(e.args[2], 'upper')
      if (lo && hi && norm(lo) === norm(hi)) found.push({ from: e.from, to: e.to, text: `${lo} @> ${valueOf(e.args[0], lo)}`, column: unquote(lo.split('.').pop() ?? lo) })
      continue
    }
    if (e.kind !== 'and' || !e.args) continue
    // Two terms next to each other in the AND: `and` alone between them.
    for (let i = 0; i + 1 < e.args.length; i++) {
      const a = sideOf(e.args[i])
      const b = sideOf(e.args[i + 1])
      if (!a || !b || a.side === b.side || norm(a.ref ?? '') !== norm(b.ref ?? '') || norm(a.x) !== norm(b.x)) continue
      if (!/^\s*and\s*$/i.test(text.slice(e.args[i].to, e.args[i + 1].from))) continue
      found.push({ from: e.args[i].from, to: e.args[i + 1].to, text: `${a.ref} @> ${valueOf(a.node, a.ref ?? '')}`, column: unquote((a.ref ?? '').split('.').pop() ?? '') })
    }
  }
  const hit = pick(statement, found)
  return hit ? [{ title: `Use @> on ${hit.column} (its own bounds, a GiST index can serve it)`, edits: [{ from: hit.from, to: hit.to, text: hit.text }] }] : []
}

/**
 * One row per day of a date range, per number of an integer range (a
 * lateral generate_series from its lower bound to the last value before
 * its upper one, a range's canonical [) form), or per range of a
 * multirange (unnest). An empty or unbounded range gives no row, and the
 * LEFT JOIN keeps its own.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function expandRows(statement, ctx) {
  const f = factsOf(statement, ctx)
  if (!f) return []
  /** @type {RefactorOffer[]} */
  const out = []
  for (const c of f.cols.filter(inFrom).slice(0, 6)) {
    const t = c.type.trim().toLowerCase()
    const ref = refFor(c)
    const alias = quote(`${c.column}_item`)
    if (isMulti(t)) {
      const edits = joinRows(statement, f.m, `left join lateral unnest(${ref}) as ${alias}(value) on true`, `${alias}.value`)
      if (edits) out.push({ title: `Expand the ranges of ${c.column} into rows`, edits })
    } else if (t === 'daterange') {
      const edits = joinRows(statement, f.m, `left join lateral generate_series(lower(${ref}), upper(${ref}) - 1, interval '1 day') as ${alias}(value) on true`, `${alias}.value::date as ${quote(`${c.column}_day`)}`)
      if (edits) out.push({ title: `One row per day of ${c.column}`, edits })
    } else if (t === 'int4range' || t === 'int8range') {
      const edits = joinRows(statement, f.m, `left join lateral generate_series(lower(${ref}), upper(${ref}) - 1) as ${alias}(value) on true`, `${alias}.value`)
      if (edits) out.push({ title: `One row per number of ${c.column}`, edits })
    }
  }
  return out
}

/** @type {PlumeSQLExtension} */
export default {
  refactors: [
    { id: 'range-bounds', label: 'Add the bounds of a range as columns', description: 'lower() and upper() of a range column the query returns, each a column of its own; an unbounded side is NULL.', example: 'lower(during) as during_lower, upper(during) as during_upper', refactor: bounds },
    { id: 'range-length', label: 'Add the length of a range as a column', description: 'upper() minus lower(): an interval for a timestamp range, days for a date range, a number for a number range.', example: 'upper(during) - lower(during) as during_length', refactor: length },
    { id: 'range-contains', label: 'Use @> for a bounds check', description: 'lower(r) <= x and x < upper(r), or x between lower(r) and upper(r), becomes r @> x: the range\'s own bounds, and a GiST index can serve it.', example: 'during @> now()', refactor: contains },
    { id: 'range-rows', label: 'One row per day or number of a range', description: 'A date range as one row per day, an integer range as one row per number, a multirange as one row per range; an empty or unbounded one keeps its row.', example: "left join lateral generate_series(lower(during), upper(during) - 1, interval '1 day') ...", refactor: expandRows }
  ]
}
