// @ts-check
// @description Aliases for a query's tables from the editor's lightbulb: one table's, or every table's at once, each qualifier rewritten to it

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

/** @type {PlumeSQLExtension} */
export default {
  refactors: [
    { id: 'add-alias', label: 'Add an alias', description: 'Gives a table without one an alias, right after its name, and rewrites every column it qualifies to read through the alias.', example: 'from customer where customer.active = 1 becomes from customer c where c.active = 1', refactor: addAlias },
    { id: 'add-aliases', label: 'Add aliases to every table', description: 'The same for every table of the query that has none, in one step.', example: 'from customer join address on address.address_id = customer.address_id becomes from customer c join address a on a.address_id = c.address_id', refactor: addAliases }
  ],
  options: [
    { key: 'style', kind: 'choice', label: 'Alias style', options: ['initials', 'first letters'], default: 'initials', description: 'initials takes the first letter of each word of the name (customer_order: co); first letters takes the name\'s first three letters (cus).' }
  ]
}
