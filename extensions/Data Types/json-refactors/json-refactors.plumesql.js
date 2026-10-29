// @ts-check
// @description JSON in the editor's lightbulb: list a column's keys, expand an array or an object into rows, add its keys as columns, use @> containment, collapse to a #>> path, pretty print

// This extension REFACTORS (docs: GRIDJSSPEC, Refactors): on a statement
// over a json or jsonb column, the moves people look up every time.
//
//   List the keys of data (a query above)       select k.json_key as key, count(*) ...
//   Expand the array in tags into rows          left join lateral jsonb_array_elements(...)
//   Expand the keys of data into rows           left join lateral jsonb_each(...)
//   Add the keys of data as columns             (data->>'amount')::numeric as amount
//   Use @> containment on data                  data @> '{"status": "open"}'
//   Collapse to a #>> path                      data #>> '{meta,age}'
//   Pretty print the JSON columns               jsonb_pretty(data) as data
//
// The json columns are the statement's tables' (the dictionary's types),
// or, over a subquery, a CTE or a UNION, the ones its last run returned.
// What the values hold (objects, arrays, which keys) is read from that run
// (ctx.result, its first rows), so a key becomes a column only once the
// statement has run as written. It reads only what the editor hands it,
// so nothing is asked of the server. These were PlumeSQL's own refactors
// before 0.29.0, which still offers them itself: they answer only where
// ctx.settings (new in 0.29.0) is there, never twice.

const JSON_TYPE = /^(?:"?[\w$]+"?\.)?(jsonb?)$/i
const NAME = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)`
const JSON_REF = String.raw`(?:${NAME}\s*\.\s*)?${NAME}`
const JSON_STRING = String.raw`'(?:[^']|'')*'`

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
 * VALUES list or a SELECT with no FROM (`select '{"a": 1}'::json as c`:
 * no FROM item to reach a column by, the column a name of the list's own)
 * is read as the subquery of `select * from (...) q`, its json columns the
 * ones its last run returned, and every edit of it rewrites the whole
 * statement so.
 * A json column the select list COMPUTES (`data->'address' as address`)
 * carries its expression: the name is the list's own, which nothing at the
 * list's level can reach, so the refactors write the expression itself.
 * @typedef {{ qualifier: string, table: string, column: string, jsonb: boolean, expr?: { text: string, kind: string, op?: string, inFrom: boolean }, renamed?: boolean }} JsonColumn
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

/** The json or jsonb columns of the statement's tables, by the name it reaches each by. @param {RefactorStatement} statement */
function tableJsonColumns(statement) {
  /** @type {JsonColumn[]} */
  const out = []
  for (const t of statement.tables) {
    for (const c of t.columns) {
      const j = JSON_TYPE.exec(c.type)
      if (j) out.push({ qualifier: t.alias ?? t.ref.replace(/\s+/g, '').split('.').pop() ?? t.name, table: t.name, column: c.name, jsonb: j[1].toLowerCase() === 'jsonb' })
    }
  }
  return out
}

/**
 * The json or jsonb columns: the statement's tables', each with the name
 * the statement reaches its table by. When none of its tables has one and
 * it reads ONE thing the dictionary does not know (a subquery in FROM, a
 * CTE, the wrapped UNION), the json columns its last run RETURNED stand in,
 * the ones its select list passes through unrenamed (a `*`, or the bare
 * name): those are the FROM item's own columns, reachable by the same name.
 * Either way, once the statement has run, the json columns its select list
 * computes join them, each with its expression.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @param {Model} m
 * @returns {JsonColumn[]}
 */
function jsonColumnsOf(statement, ctx, m) {
  const computed = m.wrapped ? [] : computedJsonColumns(statement, ctx, m)
  const names = new Set(computed.filter((c) => !c.renamed).map((c) => c.column.toLowerCase()))
  // A table's column the list hides behind a computed one of its name
  // (`data->'meta' as data`) is not what the result's column holds.
  const own = m.wrapped ? [] : tableJsonColumns(statement).filter((c) => !names.has(c.column.toLowerCase()))
  if (own.length) return [...own, ...computed]
  return [...passedJsonColumns(statement, ctx, m), ...computed]
}

/**
 * The json columns the last run returned that the select list computes
 * (an expression with a name of the list's own, `data->'address' as
 * address`) or renames (`data as payload`), each with its expression as
 * written.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @param {Model} m
 * @returns {JsonColumn[]}
 */
function computedJsonColumns(statement, ctx, m) {
  const r = ctx.result
  if (!r || !m.items) return []
  /** @type {JsonColumn[]} */
  const out = []
  for (const it of m.items) {
    if (it.star || !it.expr) continue
    // A column under its own name is the table's, read as such.
    const renamed = !!it.column
    if (renamed && (!it.alias || it.alias.toLowerCase() === (it.column?.[it.column.length - 1] ?? '').toLowerCase())) continue
    const hits = r.columns.filter((c) => c.name.toLowerCase() === it.name.toLowerCase())
    if (hits.length !== 1) continue
    const j = JSON_TYPE.exec(hits[0].type)
    if (!j) continue
    const text = statement.text.slice(it.expr.from, it.expr.to)
    // An aggregate or a window function belongs to the select list: not in
    // a FROM item (a lateral expansion, a keys query); nor is a renamed
    // column worth a second expansion of the column it renames.
    const inFrom = !renamed && !it.aggregate && !/\bover\s*\(/i.test(text)
    out.push({ qualifier: '', table: '', column: hits[0].name, jsonb: j[1].toLowerCase() === 'jsonb', expr: { text, kind: it.expr.parenthesized ? 'parenthesized' : it.expr.kind, op: it.expr.op, inFrom }, renamed })
  }
  return out
}

/**
 * The json columns the last run returned that the one FROM item the
 * dictionary does not know (a subquery, a CTE, the wrapped UNION) passes
 * through the select list unrenamed.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @param {Model} m
 * @returns {JsonColumn[]}
 */
function passedJsonColumns(statement, ctx, m) {
  /** @type {JsonColumn[]} */
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
    // A table the dictionary knows, with no json column of its own.
    const last = unquote(named[1].split('.').pop() ?? '')
    if (statement.tables.some((t) => t.name === last)) return []
    qualifier = named[2] ?? named[1].split('.').pop() ?? ''
  }
  // The list's own items: a `*` among them passes every column through,
  // and a name an EXPRESSION of the list takes is the list's, not the
  // FROM item's, so it cannot be reached in FROM or WHERE.
  const items = m.items
  const star = !items || items.some((i) => i.star)
  const passed = new Set((items ?? []).filter((i) => i.column && !i.alias).map((i) => i.name.toLowerCase()))
  const computed = new Set((items ?? []).filter((i) => !i.column && !i.star).map((i) => i.name.toLowerCase()))
  for (const c of r.columns) {
    const j = JSON_TYPE.exec(c.type)
    if (!j || computed.has(c.name.toLowerCase()) || !(star || passed.has(c.name.toLowerCase()))) continue
    if (out.some((o) => o.column === c.name)) continue
    out.push({ qualifier, table: unquote(qualifier || 'q'), column: c.name, jsonb: j[1].toLowerCase() === 'jsonb' })
  }
  return out
}

/** How the statement reaches a column: qualified, or bare when its FROM item has no name. @param {JsonColumn} c */
const refOf = (c) => (c.qualifier ? `${c.qualifier}.${quote(c.column)}` : quote(c.column))

/**
 * A computed column's expression as an operand: bare as a function's
 * argument; before a `->` step or a `::` cast in parentheses unless it
 * already binds tighter (a column, a call, a cast, a constant, a subquery,
 * and before a step another `->` or `#>`, the same precedence left to right).
 * @param {NonNullable<JsonColumn['expr']>} e
 * @param {'arg' | 'path' | 'cast'} then
 */
function operand(e, then) {
  if (then === 'arg') return e.text
  if (['column', 'function', 'cast', 'constant', 'subquery'].includes(e.kind)) return e.text
  if (then === 'path' && e.kind === 'operator' && (e.op === '->' || e.op === '#>')) return e.text
  return `(${e.text})`
}

/** The reference a refactor writes for a column. @param {JsonColumn} c @param {'arg' | 'path' | 'cast'} then */
const refFor = (c, then) => (c.expr ? operand(c.expr, then) : refOf(c))

/**
 * The values a json column held in the last run, parsed (an unparsable or
 * cut value is left out).
 * @param {RefactorContext} ctx
 * @param {string} column
 */
function valuesOf(ctx, column) {
  const r = ctx.result
  if (!r) return []
  const i = r.columns.findIndex((c) => c.name === column)
  if (i < 0) return []
  /** @type {unknown[]} */
  const out = []
  for (const row of r.rows) {
    const v = row[i]
    if (v === null || v === undefined) continue
    try {
      out.push(JSON.parse(String(v)))
    } catch {
      // A value cut at the host's limit, or not JSON: not read.
    }
  }
  return out
}

/**
 * Whether a column's values are worth expanding as `shape`: yes when its
 * last run shows that shape (or both), or when there is no run to tell
 * (the expansion is written to be safe on any value); no when every value
 * is of the other shape, where it would only add an empty column.
 * @param {RefactorContext} ctx
 * @param {string} column
 * @param {'object' | 'array'} shape
 */
function shapeFits(ctx, column, shape) {
  const vals = valuesOf(ctx, column).filter((v) => v !== null && typeof v === 'object')
  if (!vals.length) return true
  return vals.some((v) => (shape === 'array' ? Array.isArray(v) : !Array.isArray(v)))
}

/**
 * The keys the values of a column held in the last run, in the order
 * they first came, each with what its values are.
 * @param {RefactorContext} ctx
 * @param {string} column
 */
function keysOf(ctx, column) {
  /** @type {Map<string, string>} */
  const kinds = new Map()
  for (const v of valuesOf(ctx, column)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue
    for (const [k, x] of Object.entries(v)) {
      const kind = x === null ? null : Array.isArray(x) ? 'array' : typeof x === 'object' ? 'object' : typeof x === 'number' ? 'number' : typeof x === 'boolean' ? 'boolean' : 'string'
      const was = kinds.get(k)
      if (was === undefined) kinds.set(k, kind ?? '')
      else if (kind && was === '') kinds.set(k, kind)
      else if (kind && was !== kind) kinds.set(k, 'string')
    }
  }
  return [...kinds].map(([key, kind]) => ({ key, kind: kind || 'string' }))
}

/**
 * The match of a pattern the caret stands in, or the only one, outside
 * strings and comments; none when several and the caret is in none.
 * @param {RefactorStatement} statement
 * @param {RegExp} re
 */
function oneMatch(statement, re) {
  /** @type {RegExpExecArray[]} */
  const all = []
  for (let m = re.exec(statement.text); m; m = re.exec(statement.text)) if (!insideAtomic(statement.text, m.index)) all.push(m)
  return all.find((m) => m.index <= statement.caret && statement.caret <= m.index + m[0].length) ?? (all.length === 1 ? all[0] : undefined)
}

/** The json column a reference in the text names (data, t.data), or none. @param {JsonColumn[]} cols @param {string} ref */
function columnAt(cols, ref) {
  const parts = ref.split('.').map((p) => unquote(p))
  const name = parts[parts.length - 1]
  const q = parts.length > 1 ? parts[parts.length - 2] : undefined
  const hits = cols.filter((c) => c.column.toLowerCase() === name.toLowerCase() && (!q || unquote(c.qualifier).toLowerCase() === q.toLowerCase() || c.table.toLowerCase() === q.toLowerCase()))
  return hits.length === 1 ? hits[0] : undefined
}

/**
 * The statement's json facts once, for every refactor: its model and its
 * json columns; null where there is nothing to say (an older PlumeSQL,
 * which offers these itself, or no json column).
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 */
function factsOf(statement, ctx) {
  if (!ctx.settings) return null
  const m = modelOf(statement)
  if (!m) return null
  const cols = jsonColumnsOf(statement, ctx, m)
  return cols.length ? { m, cols } : null
}

/**
 * The json columns of any statement a condition can stand in (an UPDATE, a
 * DELETE, a WITH as much as a SELECT): the model's where there is one,
 * else its tables'; null over a set operation, whose arms are its own.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 */
function anyColumnsOf(statement, ctx) {
  if (!ctx.settings) return null
  const m = modelOf(statement)
  if (m?.wrapped) return null
  const cols = (m ? jsonColumnsOf(statement, ctx, m) : tableJsonColumns(statement)).filter((c) => !c.expr)
  return cols.length ? { cols } : null
}

/**
 * List the keys of a column: a query above (or in a new tab) counting the
 * rows per key, over the statement's own FROM and WHERE, objects only.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function listKeys(statement, ctx) {
  const f = factsOf(statement, ctx)
  if (!f) return []
  return f.cols
    .filter((c) => (!c.expr || c.expr.inFrom) && shapeFits(ctx, c.column, 'object'))
    .slice(0, 6)
    .map((c) => {
      const p = c.jsonb ? 'jsonb' : 'json'
      const ref = refFor(c, 'arg')
      const sql =
        `select k.json_key as key, count(*)\nfrom ${f.m.fromText}, ${p}_object_keys(${ref}) as k(json_key)\n` +
        `where ${p}_typeof(${ref}) = 'object'${f.m.where ? ` and (${f.m.where})` : ''}\n` +
        `group by k.json_key\norder by count(*) desc, k.json_key;\n`
      if (ctx.queryPlace === 'tab') return { title: `List the keys of ${c.column} (in a new tab)`, edits: [], tab: sql }
      return { title: `List the keys of ${c.column} (a query above)`, edits: [{ from: 0, to: 0, text: sql }] }
    })
}

/**
 * Expand a column into rows: a lateral join on an array's elements (one
 * row each, as <column>_item.value) or on an object's keys (one row each,
 * as <column>_item.key and .value). The function only sees a value of its
 * shape: any other (an object where an array was meant, a scalar, NULL)
 * gives no element, and the LEFT JOIN keeps its row with NULLs, where the
 * bare function would fail the whole query.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @param {'array' | 'object'} shape
 * @returns {RefactorOffer[]}
 */
function expandRows(statement, ctx, shape) {
  const f = factsOf(statement, ctx)
  if (!f) return []
  const { m } = f
  // After a comma list (`from a, b`) the JOIN binds to the last item only.
  if (topCommas(m.fromText) > 0) return []
  // An aggregated or DISTINCT query cannot list the new rows' columns (the
  // wrapper around one can).
  const q = statement.query
  if (q && !m.wrapped && (q.clauses.groupBy || q.distinct || q.items.some((i) => i.aggregate))) return []
  const rest = m.nextAt < m.bodyEnd
  const addToList = m.list !== '' && m.list !== '*'
  const taken = new Set(statement.tables.flatMap((t) => t.columns.map((c) => c.name.toLowerCase())))
  /** @type {RefactorOffer[]} */
  const out = []
  for (const c of f.cols.filter((x) => (!x.expr || x.expr.inFrom) && shapeFits(ctx, x.column, shape)).slice(0, 6)) {
    const p = c.jsonb ? 'jsonb' : 'json'
    const ref = refFor(c, 'arg')
    const alias = quote(`${c.column}_item`)
    const fn = shape === 'array' ? `${p}_array_elements` : `${p}_each`
    // key and value, unless a table of the statement has a column so named.
    const k = taken.has('key') || taken.has('value') ? 'item_key' : 'key'
    const v = k === 'item_key' ? 'item_value' : 'value'
    const cols = shape === 'array' ? `(${v})` : `(${k}, ${v})`
    const join = `left join lateral ${fn}(case ${p}_typeof(${ref}) when '${shape}' then ${ref} end) as ${alias}${cols} on true`
    const added = shape === 'array' ? `${alias}.${v}` : `${alias}.${k}, ${alias}.${v}`
    const edits = asEdits(m, [
      ...(addToList ? [{ from: m.listTo, to: m.listTo, text: `, ${added}` }] : []),
      { from: m.fromEnd, to: rest ? m.nextAt : m.fromEnd, text: `\n${join}${rest ? '\n' : ''}` }
    ])
    if (edits) out.push({ title: shape === 'array' ? `Expand the array in ${c.column} into rows` : `Expand the keys of ${c.column} into rows (key, value)`, edits })
  }
  return out
}

/** @param {RefactorStatement} statement @param {RefactorContext} ctx */
const expandArray = (statement, ctx) => expandRows(statement, ctx, 'array')
/** @param {RefactorStatement} statement @param {RefactorContext} ctx */
const expandObject = (statement, ctx) => expandRows(statement, ctx, 'object')

/**
 * Add the keys of a json column as columns: the keys its values hold in
 * the last run (so only once the statement has run), each written into
 * the select list the way its values read: ->> for text, a cast for
 * numbers and booleans, -> for a nested object or array. One offer adds
 * them all; the first few keys are offered one by one too.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function keyColumns(statement, ctx) {
  const f = factsOf(statement, ctx)
  if (!f || !ctx.result) return []
  const { m } = f
  const fromOwnLine = /\n/.test(m.text.slice(m.listTo, m.fromAt))
  const indent = '       '
  const have = new Set(ctx.result.columns.map((c) => c.name.toLowerCase()))
  /** @type {RefactorOffer[]} */
  const out = []
  for (const c of f.cols) {
    /** @param {string} key */
    const plainOf = (key) => {
      const plain = key.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'key'
      return /^[0-9]/.test(plain) ? `${c.column}_${plain}` : plain
    }
    const keys = keysOf(ctx, c.column).filter((k) => !have.has(plainOf(k.key)))
    if (!keys.length) continue
    // Over one relation the column needs no qualifier.
    const ref = c.expr ? refFor(c, 'path') : statement.tables.length <= 1 && !m.wrapped ? quote(c.column) : refOf(c)
    /** @param {{ key: string, kind: string }} k */
    const exprOf = (k) => {
      const lit = literal(k.key)
      if (k.kind === 'object' || k.kind === 'array') return `${ref}->${lit}`
      if (k.kind === 'number') return `(${ref}->>${lit})::numeric`
      if (k.kind === 'boolean') return `(${ref}->>${lit})::boolean`
      return `${ref}->>${lit}`
    }
    /** @param {{ key: string, kind: string }[]} picked */
    const edits = (picked) =>
      asEdits(m, [
        {
          from: m.listTo,
          to: fromOwnLine ? m.listTo : m.fromAt,
          text: picked.map((k) => `,\n${indent}${exprOf(k)} as ${quote(plainOf(k.key))}`).join('') + (fromOwnLine ? '' : '\n')
        }
      ])
    const shown = keys.slice(0, 4).map((k) => k.key).join(', ') + (keys.length > 4 ? ' …' : '')
    const all = edits(keys)
    if (all) out.push({ title: keys.length === 1 ? `Add ${keys[0].key} of ${c.column} as a column` : `Add the keys of ${c.column} as columns (${shown})`, edits: all })
    if (keys.length > 1) {
      for (const k of keys.slice(0, 5)) {
        const one = edits([k])
        if (one) out.push({ title: `Add ${k.key} of ${c.column} as a column`, edits: one })
      }
    }
    if (out.length >= 12) break
  }
  return out
}

/**
 * @> containment: data->>'key' = 'value' on a jsonb column becomes
 * data @> '{"key": "value"}', which a GIN index on the column serves.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function containment(statement, ctx) {
  const f = anyColumnsOf(statement, ctx)
  if (!f || !f.cols.some((c) => c.jsonb)) return []
  const m = oneMatch(statement, new RegExp(String.raw`(${JSON_REF})\s*->>\s*(${JSON_STRING})\s*=\s*(${JSON_STRING})`, 'g'))
  if (!m) return []
  const c = columnAt(f.cols, m[1])
  if (!c?.jsonb) return []
  // ->> compares TEXT, @> compares JSON: '5' matches {"qty": 5} by text and
  // not by containment. Offered only for a value that can only be a string.
  const value = unliteral(m[3])
  if (/^(?:-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null)$/i.test(value)) return []
  const json = `{${JSON.stringify(unliteral(m[2]))}: ${JSON.stringify(value)}}`
  return [{ title: `Use @> containment on ${c.column} (a GIN index can serve it)`, edits: [{ from: m.index, to: m.index + m[0].length, text: `${m[1]} @> ${literal(json)}` }] }]
}

/**
 * Collapse to a path: two or more -> steps (the last may be ->>) become one
 * #> or #>> with the path as a text array.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function collapsePath(statement, ctx) {
  const f = anyColumnsOf(statement, ctx)
  if (!f) return []
  const step = String.raw`\s*->>?\s*(?:${JSON_STRING}|\d+)`
  const m = oneMatch(statement, new RegExp(String.raw`(${JSON_REF})((?:${step}){2,})`, 'g'))
  if (!m || !columnAt(f.cols, m[1])) return []
  const steps = [...m[2].matchAll(new RegExp(String.raw`->(>?)\s*(${JSON_STRING}|\d+)`, 'g'))]
  if (steps.slice(0, -1).some((x) => x[1] === '>')) return []
  const op = steps[steps.length - 1][1] === '>' ? '#>>' : '#>'
  const elems = steps.map((x) => (x[2].startsWith("'") ? unliteral(x[2]) : x[2]))
  // Quoted unless plain; NULL (any case) unquoted is an SQL NULL element.
  const path = '{' + elems.map((e) => (/^[^\s,{}"\\]+$/.test(e) && !/^null$/i.test(e) ? e : '"' + e.replace(/["\\]/g, '\\$&') + '"')).join(',') + '}'
  return [{ title: `Collapse to a ${op} path`, edits: [{ from: m.index, to: m.index + m[0].length, text: `${m[1]} ${op} ${literal(path)}` }] }]
}

/**
 * Pretty print: a json or jsonb column named in the select list becomes
 * jsonb_pretty(column), under its own name; over a set operation, its
 * columns (the last run's) listed out of the wrapper, each json one through
 * jsonb_pretty.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function prettyPrint(statement, ctx) {
  if (!ctx.settings) return []
  const m = modelOf(statement)
  if (!m) return []
  const title = 'Pretty print the JSON columns (jsonb_pretty)'
  if (m.wrapped) {
    const r = ctx.result
    if (!r?.columns.length) return []
    const names = r.columns.map((c) => c.name)
    if (new Set(names).size !== names.length || !r.columns.some((c) => JSON_TYPE.test(c.type))) return []
    const list = r.columns.map((c) => {
      const kind = JSON_TYPE.exec(c.type)?.[1]?.toLowerCase()
      const ref = `q.${quote(c.name)}`
      return kind ? `jsonb_pretty(${ref}${kind === 'jsonb' ? '' : '::jsonb'}) as ${quote(c.name)}` : ref
    })
    const body = statement.text.slice(0, m.wrapped.bodyLen)
    return [{ title, edits: [{ from: 0, to: m.wrapped.bodyLen, text: `select ${list.join(', ')}\nfrom (\n${indent(body)}\n) q` }] }]
  }
  const cols = jsonColumnsOf(statement, ctx, m)
  if (!cols.length || !m.items) return []
  /** @type {{ from: number, to: number, text: string }[]} */
  const edits = []
  for (const it of m.items) {
    if (it.star) continue
    // A computed or renamed one: its expression through jsonb_pretty, under
    // its name.
    const made = cols.find((c) => c.expr && c.column.toLowerCase() === it.name.toLowerCase())
    if (made?.expr) {
      edits.push({ from: it.from, to: it.to, text: `jsonb_pretty(${made.jsonb ? operand(made.expr, 'arg') : `${operand(made.expr, 'cast')}::jsonb`}) as ${quote(made.column)}` })
      continue
    }
    if (it.alias || !it.column) continue
    const written = statement.text.slice(it.from, it.to)
    if (!new RegExp(`^${JSON_REF}$`).test(written)) continue
    const c = columnAt(cols.filter((x) => !x.expr), written)
    if (c) edits.push({ from: it.from, to: it.to, text: `jsonb_pretty(${written}${c.jsonb ? '' : '::jsonb'}) as ${quote(c.column)}` })
  }
  return edits.length ? [{ title, edits }] : []
}

/** @type {PlumeSQLExtension} */
export default {
  refactors: [
    { id: 'json-key-columns', label: 'Add the keys of a JSON column as columns', description: 'Once the query has run: the keys its values hold, all at once or one by one, each a column read the way its values are (text, a number, a boolean, a nested value).', example: "(data->>'amount')::numeric as amount", refactor: keyColumns },
    { id: 'json-array-rows', label: 'Expand a JSON array into rows', description: 'One row per element of a JSON array, the element added to the select list.', example: 'left join lateral jsonb_array_elements(...) as data_item(value) on true', refactor: expandArray },
    { id: 'json-each-rows', label: 'Expand a JSON object into rows', description: 'One row per key of a JSON object, the key and the value added to the select list.', example: 'left join lateral jsonb_each(...) as data_item(key, value) on true', refactor: expandObject },
    { id: 'json-containment', label: 'Use @> containment', description: 'data->>\'key\' = \'value\' on a jsonb column becomes data @> \'{"key": "value"}\', which a GIN index can serve.', example: 'data @> \'{"status": "open"}\'', refactor: containment },
    { id: 'json-path', label: 'Collapse to a #>> path', description: 'A chain of -> steps becomes one #> or #>> path.', example: "data #>> '{meta,age}'", refactor: collapsePath },
    { id: 'json-pretty', label: 'Pretty print JSON', description: 'A JSON column in the select list becomes jsonb_pretty(column).', example: 'jsonb_pretty(data) as data', refactor: prettyPrint },
    { id: 'json-keys', label: 'List the keys of a JSON column', description: 'A query above (or in a new tab) counting, per key, the rows that carry it, over the query\'s own FROM and WHERE.', example: 'select k.json_key as key, count(*) from t, jsonb_object_keys(t.data) as k(json_key) ...', refactor: listKeys }
  ]
}
