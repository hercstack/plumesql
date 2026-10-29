// @ts-check
// @description Aliases for a query's tables from the editor's lightbulb, one table's or every table's at once; a query wrapped in a CTE or a subquery, and unwrapped

// This extension REFACTORS (docs: GRIDJSSPEC, Refactors): on a statement
// whose tables have no alias, the editor's lightbulb (Ctrl+. or Cmd+.)
// offers to give one an alias, or all of them:
//
//   select customer.first_name, address.city_id
//   from customer
//   join address on address.address_id = customer.address_id
//
// becomes, with "Add aliases to every table":
//
//   select c.first_name, a.city_id
//   from customer c
//   join address a on a.address_id = c.address_id
//
// The alias goes right after the table's name, and every qualifier that
// reads as that table (customer.first_name, public.customer.first_name)
// becomes the alias, never one of an inner query that names the same table
// for itself, nor one in a string or a comment. It reads only what the
// editor hands it: where each table is written and its qualifiers
// (RefactorTable.written and .qualifiers, PlumeSQL 0.29.0 and later), so
// nothing is asked of the server. To rename an alias afterwards, F2 on it.

// The words a bare alias may not be (it would read as SQL).
const RESERVED = new Set([
  'all', 'and', 'any', 'as', 'asc', 'by', 'case', 'cast', 'check', 'do', 'end', 'for', 'from', 'if', 'in', 'is', 'join', 'left', 'limit',
  'not', 'null', 'of', 'on', 'or', 'order', 'right', 'set', 'some', 'table', 'then', 'to', 'union', 'user', 'using', 'when', 'where', 'with'
])

/**
 * A name folded the way PostgreSQL reads it.
 * @param {string} name
 */
const fold = (name) => (name.startsWith('"') ? name.slice(1, -1).replace(/""/g, '"') : name.toLowerCase())

/**
 * The alias a table gets: its name's initials (customer_order: co), or its
 * first letters (cus), never one the statement already uses or a word SQL
 * reserves; a number follows when the plain one is taken.
 * @param {string} name
 * @param {Set<string>} taken
 * @param {string} style
 */
function aliasFor(name, taken, style) {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  let base = style === 'first letters' ? (words.join('').slice(0, 3) || 't') : words.map((w) => w[0]).join('') || 't'
  if (!/^[a-z_]/.test(base)) base = 't' + base
  let alias = base
  for (let k = 2; taken.has(alias) || RESERVED.has(alias); k++) alias = base + k
  taken.add(alias)
  return alias
}

/**
 * The statement's tables that have no alias and whose places the editor
 * knows, with the names already in use.
 * @param {RefactorStatement} statement
 */
function bare(statement) {
  const taken = new Set(statement.tables.map((t) => fold(t.alias ?? t.name)))
  const tables = statement.tables.filter((t) => !t.alias && t.written && t.qualifiers)
  return { taken, tables }
}

/**
 * The edits that give one table its alias.
 * @param {RefactorTable} t
 * @param {string} alias
 */
function aliasEdits(t, alias) {
  const w = /** @type {{ from: number, to: number }} */ (t.written)
  return [{ from: w.to, to: w.to, text: ' ' + alias }, ...(t.qualifiers ?? []).map((q) => ({ from: q.from, to: q.to, text: alias }))]
}

/**
 * Add an alias to one table: the one under the caret first, else each.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function addAlias(statement, ctx) {
  const { taken, tables } = bare(statement)
  if (!tables.length) return []
  const style = String(ctx.options?.style ?? 'initials')
  const under = tables.filter((t) => t.written && t.written.from <= statement.caret && statement.caret <= t.written.to)
  return (under.length ? under : tables).map((t) => {
    const alias = aliasFor(t.name, new Set(taken), style)
    return { title: `Add the alias ${alias} to ${t.name}`, edits: aliasEdits(t, alias) }
  })
}

/**
 * Add aliases to every table that has none, in one edit.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function addAliases(statement, ctx) {
  const { taken, tables } = bare(statement)
  if (tables.length < 2) return []
  const style = String(ctx.options?.style ?? 'initials')
  const named = tables.map((t) => ({ t, alias: aliasFor(t.name, taken, style) }))
  return [{ title: `Add aliases to every table (${named.map((n) => `${n.t.name} ${n.alias}`).join(', ')})`, edits: named.flatMap((n) => aliasEdits(n.t, n.alias)) }]
}

// ── Wrap a query in a CTE or a subquery, and unwrap one ─────────────────────
// A query to build on (filter it, join it, count it) goes into a CTE or a
// subquery first, its text unchanged and indented under the wrapper; a
// wrapper that adds nothing (select * from (...) c, with c as (...) select
// * from c) goes back to the query it holds.

const NAME = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)`

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
    const end = text.indexOf('*/', i + 2)
    return end < 0 ? n : end + 2
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
 * The index of the parenthesis closing the one at `open`, or -1.
 * @param {string} text
 * @param {number} open
 */
function closing(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
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
 * The statement's body (without its `;` and what follows it) and that tail.
 * @param {RefactorStatement} statement
 */
function bodyOf(statement) {
  const end = statement.query?.end ?? statement.text.replace(/[\s;]+$/, '').length
  return { body: statement.text.slice(0, end), end }
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

/**
 * A text with the indentation its lines of code after the first share
 * taken off (a multi-line string keeps its own), its first line's too.
 * @param {string} text
 */
function dedent(text) {
  const starts = codeLineStarts(text).filter((s) => s > 0 && s < text.length)
  const lead = (/** @type {number} */ s) => /^[ \t]*/.exec(text.slice(s, s + 200))?.[0].length ?? 0
  const filled = starts.filter((s) => text[s + lead(s)] !== '\n' && s + lead(s) < text.length)
  const common = filled.length ? Math.min(...filled.map(lead)) : 0
  const cut = new Map(starts.map((s) => [s, Math.min(common, lead(s))]))
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const n = cut.get(i)
    if (n) i += n
    if (i < text.length) out += text[i]
  }
  return out.replace(/^[ \t]+/, '')
}

/**
 * Whether the statement is a query that can stand inside a CTE or a
 * subquery: a SELECT, a VALUES list, TABLE, a WITH over one; never one that
 * selects INTO a table or locks its rows.
 * @param {RefactorStatement} statement
 */
function wrappable(statement) {
  if (!['select', 'with', 'values', 'table'].includes(statement.keyword)) return false
  const q = statement.query
  if (q && (q.clauses.into || q.clauses.for)) return false
  // A WITH over a data-modifying statement is no query to wrap.
  if (statement.keyword === 'with' && !q && !/\bselect\b/i.test(statement.text)) return false
  return true
}

/**
 * The name the wrapper reads the query by: its first table's initials (the
 * alias style), else q.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 */
function wrapperName(statement, ctx) {
  const taken = new Set(statement.tables.map((t) => fold(t.alias ?? t.name)))
  const first = statement.tables[0]
  return first ? aliasFor(first.name, taken, String(ctx.options?.style ?? 'initials')) : 'q'
}

/**
 * Wrap the query in a CTE: with c as (the query) select * from c.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function wrapCte(statement, ctx) {
  if (!wrappable(statement)) return []
  const { body, end } = bodyOf(statement)
  const name = wrapperName(statement, ctx)
  return [{ title: `Wrap in a CTE (with ${name} as ...)`, edits: [{ from: 0, to: end, text: `with ${name} as (\n${indent(body)}\n)\nselect * from ${name}` }] }]
}

/**
 * Wrap the query in a subquery: select * from (the query) c.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function wrapSubquery(statement, ctx) {
  if (!wrappable(statement)) return []
  const { body, end } = bodyOf(statement)
  const name = wrapperName(statement, ctx)
  return [{ title: `Wrap in a subquery (select * from (...) ${name})`, edits: [{ from: 0, to: end, text: `select *\nfrom (\n${indent(body)}\n) ${name}` }] }]
}

/**
 * Unwrap: a statement that only reads a subquery or one CTE whole (select
 * * from (...) c, with c as (...) select * from c, nothing else) becomes
 * the query it holds.
 * @param {RefactorStatement} statement
 * @returns {RefactorOffer[]}
 */
function unwrap(statement) {
  const { body, end } = bodyOf(statement)
  const sub = /^select\s+(?:\*|(NAME)\s*\.\s*\*)\s+from\s*\(/i.source.replace('NAME', NAME)
  const m = new RegExp(sub, 'i').exec(body)
  if (m) {
    const open = m[0].length - 1
    const close = closing(body, open)
    if (close < 0) return []
    const alias = new RegExp(String.raw`^\s*(?:as\s+)?(${NAME})?\s*$`, 'i').exec(body.slice(close + 1))
    if (!alias || (m[1] && fold(m[1]) !== fold(alias[1] ?? ''))) return []
    const inner = body.slice(open + 1, close).trim()
    if (!/^(select|with|values|table)\b/i.test(inner)) return []
    return [{ title: 'Unwrap the subquery (its query alone)', edits: [{ from: 0, to: end, text: dedent(inner) }] }]
  }
  const w = new RegExp(String.raw`^with\s+(${NAME})\s+as\s+(?:not\s+)?(?:materialized\s+)?\(`, 'i').exec(body)
  if (!w || /^with\s+recursive\b/i.test(body)) return []
  const open = w[0].length - 1
  const close = closing(body, open)
  if (close < 0) return []
  const rest = new RegExp(String.raw`^\s*select\s+\*\s+from\s+(${NAME})(?:\s+(?:as\s+)?${NAME})?\s*$`, 'i').exec(body.slice(close + 1))
  if (!rest || fold(rest[1]) !== fold(w[1])) return []
  const inner = body.slice(open + 1, close).trim()
  if (!/^(select|with|values|table)\b/i.test(inner)) return []
  return [{ title: `Unwrap the CTE ${fold(w[1])} (its query alone)`, edits: [{ from: 0, to: end, text: dedent(inner) }] }]
}

/** @type {PlumeSQLExtension} */
export default {
  refactors: [
    { id: 'add-alias', label: 'Add an alias', description: 'Gives a table without one an alias, right after its name, and rewrites every column it qualifies to read through the alias.', example: 'from customer where customer.active = 1 becomes from customer c where c.active = 1', refactor: addAlias },
    { id: 'add-aliases', label: 'Add aliases to every table', description: 'The same for every table of the query that has none, in one step.', example: 'from customer join address on address.address_id = customer.address_id becomes from customer c join address a on a.address_id = c.address_id', refactor: addAliases },
    { id: 'wrap-cte', label: 'Wrap in a CTE', description: 'The query, unchanged, becomes a CTE named after its first table, read whole below it: a query to build on.', example: 'with c as (select * from customer) select * from c', refactor: wrapCte },
    { id: 'wrap-subquery', label: 'Wrap in a subquery', description: 'The query, unchanged, becomes a subquery named after its first table, read whole: a query to build on.', example: 'select * from (select * from customer) c', refactor: wrapSubquery },
    { id: 'unwrap', label: 'Unwrap a subquery or a CTE', description: 'A query that only reads a subquery or one CTE whole, adding nothing, becomes the query it holds.', example: 'select * from (select * from customer) c becomes select * from customer', refactor: unwrap }
  ],
  options: [
    { key: 'style', kind: 'choice', label: 'Alias style', options: ['initials', 'first letters'], default: 'initials', description: 'initials takes the first letter of each word of the name (customer_order: co); first letters takes the name\'s first three letters (cus).' }
  ]
}
