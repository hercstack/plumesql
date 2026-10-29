// @ts-check
// @description Arrays in the editor's lightbulb: expand an array into rows, count its elements, add its elements as columns, use @> containment, show it as text

// This extension REFACTORS (docs: GRIDJSSPEC, Refactors): on a statement
// over an array column, the moves people look up every time.
//
//   Expand the array in tags into rows            left join lateral unnest(tags) with ordinality ...
//   Count the elements of tags (a query above)    select e.value as element, count(*) ...
//   Add the elements of tags as columns           tags[1] as tags_1, tags[2] as tags_2
//   Add the last element of tags as a column      tags[cardinality(tags)] as tags_last
//   Use @> containment on tags                    tags @> array['x']::text[]
//   Show the arrays as text                       array_to_string(tags, ', ') as tags
//
// The array columns are the statement's tables' (the dictionary's types),
// or, over a subquery, a CTE, a UNION or a SELECT with no FROM, the ones
// its last run returned, and once it has run, the ones its select list
// computes. How long the arrays are is read from that run (ctx.result, its
// first rows), so the elements become columns only once the statement has
// run as written. It reads only what the editor hands it, so nothing is
// asked of the server.

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

/** An array type ('text[]', 'integer[]'), whose element type is before its []. @param {string} type */
function isType(type) {
  return /\[\]$/.test((type ?? '').trim())
}

/**
 * A computed column's expression as an operand: bare as a function's
 * argument; before a subscript in parentheses unless it is a column
 * (`(string_to_array(s, ','))[1]`: a call takes no subscript of its own).
 * @param {NonNullable<Column['expr']>} e
 * @param {'arg' | 'subscript'} then
 */
function operand(e, then) {
  if (then === 'arg' || e.kind === 'column') return e.text
  return `(${e.text})`
}

/** The reference a refactor writes for a column. @param {Column} c @param {'arg' | 'subscript'} then */
const refFor = (c, then) => (c.expr ? operand(c.expr, then) : refOf(c))

/**
 * How many elements an array value as PostgreSQL prints it holds ('{a,b}'
 * holds 2): null for one it cannot count by position (more dimensions, a
 * lower bound other than 1, a value cut short).
 * @param {unknown} value
 */
function lengthOf(value) {
  if (typeof value !== 'string' || !value.startsWith('{') || !value.endsWith('}')) return null
  if (value === '{}') return 0
  let n = 1
  let quoted = false
  for (let i = 1; i < value.length - 1; i++) {
    const c = value[i]
    if (quoted) {
      if (c === '\\') i++
      else if (c === '"') quoted = false
    } else if (c === '"') quoted = true
    else if (c === '{') return null
    else if (c === ',') n++
  }
  return n
}

/** The longest array a column held in the last run, or null. @param {RefactorContext} ctx @param {string} column */
function longestOf(ctx, column) {
  const r = ctx.result
  if (!r) return null
  const i = r.columns.findIndex((c) => c.name === column)
  if (i < 0) return null
  let most = null
  for (const row of r.rows) {
    if (row[i] === null || row[i] === undefined) continue
    const n = lengthOf(row[i])
    if (n === null) return null
    most = Math.max(most ?? 0, n)
  }
  return most
}

/** Whether a column's ref is reachable from FROM (a lateral call, a keys query). @param {Column} c */
const inFrom = (c) => !c.expr || c.expr.inFrom

/**
 * Expand an array into rows: a lateral unnest, one row per element with
 * its position, the element added to the select list. An empty array or
 * NULL gives no element, and the LEFT JOIN keeps its row.
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
    const alias = quote(`${c.column}_item`)
    const edits = joinRows(statement, f.m, `left join lateral unnest(${refFor(c, 'arg')}) with ordinality as ${alias}(value, n) on true`, `${alias}.value`)
    if (edits) out.push({ title: `Expand the array in ${c.column} into rows`, edits })
  }
  return out
}

/**
 * Count the elements: a query above (or in a new tab) counting the rows
 * per element, over the statement's own FROM and WHERE.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function countElements(statement, ctx) {
  const f = factsOf(statement, ctx)
  if (!f) return []
  return f.cols
    .filter(inFrom)
    .slice(0, 6)
    .map((c) => {
      const sql =
        `select e.value as element, count(*)\nfrom ${f.m.fromText}, unnest(${refFor(c, 'arg')}) as e(value)\n` +
        (f.m.where ? `where ${f.m.where}\n` : '') +
        `group by e.value\norder by count(*) desc, e.value;\n`
      if (ctx.queryPlace === 'tab') return { title: `Count the elements of ${c.column} (in a new tab)`, edits: [], tab: sql }
      return { title: `Count the elements of ${c.column} (a query above)`, edits: [{ from: 0, to: 0, text: sql }] }
    })
}

/**
 * Add the elements as columns: as many as the longest array of the last
 * run holds (2 to 10), each by its position, and the last element on its
 * own, whatever the length.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function elementColumns(statement, ctx) {
  const f = factsOf(statement, ctx)
  if (!f || !ctx.result) return []
  const have = new Set(ctx.result.columns.map((c) => c.name.toLowerCase()))
  /** @type {RefactorOffer[]} */
  const out = []
  for (const c of f.cols) {
    const most = longestOf(ctx, c.column)
    if (!most) continue
    const ref = c.expr ? refFor(c, 'subscript') : statement.tables.length <= 1 && !f.m.wrapped ? quote(c.column) : refOf(c)
    const base = c.column.toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'element'
    if (most >= 2 && most <= 10) {
      const names = Array.from({ length: most }, (_, i) => `${base}_${i + 1}`)
      if (!names.some((n) => have.has(n))) {
        const edits = addToList(f.m, names.map((n, i) => `${ref}[${i + 1}] as ${quote(n)}`))
        if (edits) out.push({ title: `Add the elements of ${c.column} as columns (${names[0]} … ${names[names.length - 1]})`, edits })
      }
    }
    if (!have.has(`${base}_last`)) {
      // The column again inside cardinality(): its argument, bare.
      const edits = addToList(f.m, [`${ref}[cardinality(${c.expr ? refFor(c, 'arg') : ref})] as ${quote(`${base}_last`)}`])
      if (edits) out.push({ title: `Add the last element of ${c.column} as a column`, edits })
    }
  }
  return out
}

/**
 * @> containment: `'x' = any(tags)` becomes `tags @> array['x']::text[]`,
 * which a GIN index on the column serves (= ANY never uses one). The
 * array is cast to the column's own type, so a varchar[] compares with a
 * varchar[]. Never under a NOT: where the array holds a NULL and not the
 * value, = ANY is NULL and @> false, which a NOT tells apart.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function containment(statement, ctx) {
  const cols = tableColumns(statement)
  if (!cols.length) return []
  const any = new RegExp(String.raw`^([\s\S]+?)\s*=\s*any\s*\(\s*(${REF})\s*\)$`, 'i')
  /** @type {{ from: number, to: number, text: string, column: string }[]} */
  const found = []
  for (const e of conditionsOf(statement)) {
    if (e.kind !== 'other') continue
    const m = any.exec(statement.text.slice(e.from, e.to))
    if (!m) continue
    const c = columnAt(cols, m[2])
    if (!c || /\bany\s*\(/i.test(m[1])) continue
    found.push({ from: e.from, to: e.to, text: `${m[2]} @> array[${m[1].trim()}]::${c.type}`, column: c.column })
  }
  const hit = pick(statement, found)
  return hit ? [{ title: `Use @> containment on ${hit.column} (a GIN index can serve it)`, edits: [{ from: hit.from, to: hit.to, text: hit.text }] }] : []
}

/**
 * Show the arrays as text: every array column the select list names, bare
 * or computed, through array_to_string under its own name (its elements
 * joined by a comma; a NULL element left out); over a wrapped statement,
 * its columns listed out of the wrapper.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function asText(statement, ctx) {
  const m = modelOf(statement)
  if (!m) return []
  const title = "Show the arrays as text (array_to_string)"
  if (m.wrapped) {
    const r = ctx.result
    if (!r?.columns.length) return []
    const names = r.columns.map((c) => c.name)
    if (new Set(names).size !== names.length || !r.columns.some((c) => isType(c.type))) return []
    const list = r.columns.map((c) => (isType(c.type) ? `array_to_string(q.${quote(c.name)}, ', ') as ${quote(c.name)}` : `q.${quote(c.name)}`))
    const body = statement.text.slice(0, m.wrapped.bodyLen)
    return [{ title, edits: [{ from: 0, to: m.wrapped.bodyLen, text: `select ${list.join(', ')}\nfrom (\n${indent(body)}\n) q` }] }]
  }
  const cols = columnsOf(statement, ctx, m)
  if (!cols.length || !m.items) return []
  /** @type {{ from: number, to: number, text: string }[]} */
  const edits = []
  for (const it of m.items) {
    if (it.star) continue
    const made = cols.find((c) => c.expr && c.column.toLowerCase() === it.name.toLowerCase())
    if (made?.expr) {
      edits.push({ from: it.from, to: it.to, text: `array_to_string(${operand(made.expr, 'arg')}, ', ') as ${quote(made.column)}` })
      continue
    }
    if (it.alias || !it.column) continue
    const written = statement.text.slice(it.from, it.to)
    if (!new RegExp(`^${REF}$`).test(written)) continue
    const c = columnAt(cols, written)
    if (c) edits.push({ from: it.from, to: it.to, text: `array_to_string(${written}, ', ') as ${quote(c.column)}` })
  }
  return edits.length ? [{ title, edits }] : []
}

/** @type {PlumeSQLExtension} */
export default {
  refactors: [
    { id: 'array-rows', label: 'Expand an array into rows', description: 'One row per element of an array, with its position, the element added to the select list; an empty array or NULL keeps its row.', example: 'left join lateral unnest(tags) with ordinality as tags_item(value, n) on true', refactor: expandRows },
    { id: 'array-columns', label: 'Add the elements of an array as columns', description: 'Once the query has run: as many columns as its longest array holds (up to 10), each element by its position, and the last element on its own.', example: 'tags[1] as tags_1, tags[2] as tags_2', refactor: elementColumns },
    { id: 'array-containment', label: 'Use @> containment', description: "'x' = any(tags) becomes tags @> array['x'], which a GIN index can serve.", example: "tags @> array['x']::text[]", refactor: containment },
    { id: 'array-text', label: 'Show an array as text', description: 'An array column in the select list becomes array_to_string(column, \', \').', example: "array_to_string(tags, ', ') as tags", refactor: asText },
    { id: 'array-count', label: 'Count the elements of an array', description: "A query above (or in a new tab) counting, per element, the rows that hold it, over the query's own FROM and WHERE.", example: 'select e.value as element, count(*) from t, unnest(t.tags) as e(value) ...', refactor: countElements }
  ]
}
