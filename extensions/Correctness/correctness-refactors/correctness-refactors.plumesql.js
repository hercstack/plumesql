// @ts-check
// @description Queries that return what you meant: a LEFT JOIN its WHERE undoes, = NULL, count(*) over a LEFT JOIN, BETWEEN that drops the last day, AND and OR without parentheses

// This extension REFACTORS (docs: GRIDJSSPEC, Refactors). Each one catches
// a query that runs without an error and returns something other than its
// author meant, and offers the fix in the editor's lightbulb. An offer that
// returns the same rows says so; one that changes the result says that too,
// in its title, because changing the result is the point.
//
// It reads only what the editor hands it: the statement's tables with their
// columns, and what PostgreSQL's own parser read in the query (its joins,
// its WHERE and its items' expressions, statement.query.joins, .where and
// items[].expr, PlumeSQL 0.26.2 and later). It carries no SQL parser and
// asks nothing of the server.

/**
 * @typedef {{ from: number, to: number, text: string }} Edit
 * @typedef {{ title: string, edits: Edit[] }} Offer
 */

/** @param {string} name */
const unquote = (name) => (name.startsWith('"') ? name.slice(1, -1).replace(/""/g, '"') : name.toLowerCase())

/**
 * The statement's text of an expression.
 * @param {RefactorStatement} st
 * @param {{ from: number, to: number }} e
 */
const textOf = (st, e) => st.text.slice(e.from, e.to)

/**
 * A short form of an expression's text for a title.
 * @param {RefactorStatement} st
 * @param {{ from: number, to: number }} e
 */
function brief(st, e) {
  const t = textOf(st, e).replace(/\s+/g, ' ')
  return t.length > 40 ? t.slice(0, 38) + '…' : t
}

/**
 * The terms of a WHERE joined by AND, or the WHERE itself.
 * @param {RefactorExpr | undefined} where
 * @returns {RefactorExpr[]}
 */
function terms(where) {
  if (!where) return []
  return where.kind === 'and' ? where.args ?? [] : [where]
}

/**
 * Every expression in a tree, the tree first, with its parent.
 * @param {RefactorExpr | undefined} e
 * @param {(e: RefactorExpr, parent: RefactorExpr | null) => void} visit
 * @param {RefactorExpr | null} [parent]
 */
function walk(e, visit, parent = null) {
  if (!e) return
  visit(e, parent)
  for (const a of e.args ?? []) walk(a, visit, e)
}

/**
 * The statement's table a qualifier names (its alias, or its name when it has none).
 * @param {RefactorStatement} st
 * @param {string} q
 */
function tableNamed(st, q) {
  return st.tables.find((t) => (t.alias ? unquote(t.alias) === q : t.name === q || unquote(t.ref.split('.').pop() ?? '') === q)) ?? null
}

/**
 * The name a join's side is known by in the query: its alias, else its table.
 * @param {RefactorJoin} j
 */
const joinName = (j) => j.alias ?? j.table ?? null

/**
 * Whether a column reference belongs to the joined side named `name`: by
 * its qualifier, or, bare, when only that side's table has the column.
 * @param {RefactorStatement} st
 * @param {string[]} col
 * @param {string} name
 */
function columnOf(st, col, name) {
  if (col.length > 1) return col[col.length - 2] === name
  const owners = st.tables.filter((t) => t.columns.some((c) => c.name === col[0]))
  const own = tableNamed(st, name)
  return owners.length === 1 && !!own && owners[0] === own
}

/**
 * An expression that is NULL whenever a column of `name` is NULL: the
 * column itself, a cast of it, an operator over it (PostgreSQL's built-in
 * operators return NULL for a NULL operand). A function is not trusted to.
 * @param {RefactorStatement} st
 * @param {RefactorExpr} e
 * @param {string} name
 * @returns {boolean}
 */
function nullWith(st, e, name) {
  if (e.kind === 'column') return !!e.column && columnOf(st, e.column, name)
  if (e.kind === 'cast' || e.kind === 'operator') return (e.args ?? []).some((a) => nullWith(st, a, name))
  return false
}

/**
 * A WHERE term that no row passes when the side `name` has no match (all
 * its columns NULL): a comparison, BETWEEN, IN, LIKE or IS NOT NULL over
 * such an expression, or NOT of one. IS NULL, IS DISTINCT FROM, COALESCE,
 * CASE and OR let a NULL through and are never read as dropping it.
 * @param {RefactorStatement} st
 * @param {RefactorExpr} e
 * @param {string} name
 * @returns {boolean}
 */
function dropsUnmatched(st, e, name) {
  const a = e.args
  if (!a) return false
  switch (e.kind) {
    case 'operator':
      return a.length === 2 && a.some((x) => nullWith(st, x, name))
    case 'between':
    case 'not between':
    case 'in':
    case 'not in':
    case 'like':
    case 'not like':
    case 'ilike':
    case 'not ilike':
    case 'is not null':
      return nullWith(st, a[0], name)
    case 'not':
      return a.length === 1 && a[0].kind !== 'is null' && a[0].kind !== 'is not null' && a[0].kind !== 'not' && dropsUnmatched(st, a[0], name)
    default:
      return false
  }
}

/**
 * The LEFT JOINs the WHERE undoes, each with the terms that drop its unmatched rows.
 * @param {RefactorStatement} st
 */
function undoneLeftJoins(st) {
  const q = st.query
  if (!q?.joins || !q.where) return []
  // A RIGHT or FULL join turns NULLs around: nothing is read then.
  if (q.joins.some((j) => j.kind === 'right' || j.kind === 'full')) return []
  /** @type {{ join: RefactorJoin, name: string, drops: RefactorExpr[] }[]} */
  const out = []
  for (const j of q.joins) {
    const name = joinName(j)
    if (j.kind !== 'left' || !name || !j.keyword) continue
    const drops = terms(q.where).filter((t) => dropsUnmatched(st, t, name))
    if (drops.length) out.push({ join: j, name, drops })
  }
  return out
}

// ---------------------------------------------------------------------------
// A LEFT JOIN its WHERE undoes.

/**
 * @param {RefactorStatement} st
 * @returns {Offer[]}
 */
function leftJoinUndone(st) {
  /** @type {Offer[]} */
  const offers = []
  for (const { join, name, drops } of undoneLeftJoins(st)) {
    const kw = /** @type {{ from: number, to: number }} */ (join.keyword)
    const upper = /[A-Z]/.test(textOf(st, kw))
    offers.push({
      title: `Write JOIN ${name}: the WHERE (${brief(st, drops[0])}) already drops the rows the LEFT JOIN kept, same rows`,
      edits: [{ from: kw.from, to: kw.to, text: upper ? 'JOIN' : 'join' }]
    })
    // The rows without a match kept: a single <> turned into IS DISTINCT
    // FROM, which lets their NULL through and still drops the value.
    const d = drops[0]
    if (drops.length === 1 && d.kind === 'operator' && d.op === '<>' && d.args && d.args.length === 2) {
      const [l, r] = d.args
      if (nullWith(st, l, name) !== nullWith(st, r, name)) {
        offers.push({
          title: `Keep the rows ${name} has no match for: ${brief(st, l)} is distinct from ${brief(st, r)}, more rows`,
          edits: [{ from: d.from, to: d.to, text: `${textOf(st, l)} ${upper ? 'IS DISTINCT FROM' : 'is distinct from'} ${textOf(st, r)}` }]
        })
      }
    }
  }
  return offers
}

// ---------------------------------------------------------------------------
// = NULL and <> NULL, never true.

/**
 * Every condition the query writes: the WHERE and the joins' ON.
 * @param {RefactorStatement} st
 * @returns {RefactorExpr[]}
 */
function conditions(st) {
  const q = st.query
  if (!q) return []
  /** @type {RefactorExpr[]} */
  const out = []
  if (q.where) out.push(q.where)
  for (const j of q.joins ?? []) if (j.on) out.push(j.on)
  return out
}

/**
 * @param {RefactorStatement} st
 * @returns {Offer | null}
 */
function compareNull(st) {
  /** @type {Edit[]} */
  const edits = []
  /** @type {string[]} */
  const shown = []
  for (const c of conditions(st)) {
    walk(c, (e) => {
      if (e.kind !== 'operator' || (e.op !== '=' && e.op !== '<>') || e.args?.length !== 2) return
      const [l, r] = e.args
      const isNull = (/** @type {RefactorExpr} */ x) => x.kind === 'constant' && x.type === 'null'
      if (isNull(l) === isNull(r)) return
      const other = isNull(l) ? r : l
      const words = e.op === '=' ? 'is null' : 'is not null'
      const upper = /\bNULL\b/.test(textOf(st, e))
      edits.push({ from: e.from, to: e.to, text: `${textOf(st, other)} ${upper ? words.toUpperCase() : words}` })
      shown.push(`${brief(st, other)} ${words}`)
    })
  }
  if (!edits.length) return null
  const what = shown.length === 1 ? shown[0] : `${shown.length} comparisons`
  return { title: `Write ${what}: a comparison with NULL is never true, so no row passes it`, edits }
}

// ---------------------------------------------------------------------------
// count(*) over a LEFT JOIN counts a row without a match as 1.

/**
 * @param {RefactorStatement} st
 * @returns {Offer[]}
 */
function countUnmatched(st) {
  const q = st.query
  if (!q?.joins || !q.clauses.groupBy) return []
  if (q.joins.some((j) => j.kind === 'right' || j.kind === 'full')) return []
  const stars = q.items.filter((it) => it.expr?.kind === 'function' && it.expr.name === 'count' && it.expr.star && !it.expr.over)
  if (!stars.length) return []
  const undone = new Set(undoneLeftJoins(st).map((u) => u.join))
  /** @type {Offer[]} */
  const offers = []
  for (const j of q.joins) {
    const name = joinName(j)
    if (j.kind !== 'left' || !name || undone.has(j)) continue
    // Grouped by the joined side itself, count(*) counts the left side's
    // rows per group, which is what it is for there.
    const groupedBy = q.items.some((it) => !it.aggregate && it.expr && mentions(st, it.expr, name))
    const groupText = st.text.slice(q.clauses.groupBy.from, q.clauses.groupBy.to).toLowerCase()
    if (groupedBy || groupText.includes(`${name}.`)) continue
    const col = keyOf(st, j, name)
    if (!col) continue
    const ref = `${name}.${col}`
    offers.push({
      title: `Count ${name}'s rows: count(${ref}) is 0 where ${name} has no match, count(*) counts 1`,
      edits: stars.map((it) => {
        const star = /** @type {{ from: number, to: number }} */ (/** @type {RefactorExpr} */ (it.expr).star)
        return { from: star.from, to: star.to, text: ref }
      })
    })
  }
  return offers
}

/**
 * Whether an expression names a column of `name` anywhere in it.
 * @param {RefactorStatement} st
 * @param {RefactorExpr} e
 * @param {string} name
 * @returns {boolean}
 */
function mentions(st, e, name) {
  if (e.kind === 'column') return !!e.column && columnOf(st, e.column, name)
  return (e.args ?? []).some((a) => mentions(st, a, name))
}

/**
 * A column of the joined side that is never NULL when it matched: its
 * primary key, else the column its ON compares.
 * @param {RefactorStatement} st
 * @param {RefactorJoin} j
 * @param {string} name
 */
function keyOf(st, j, name) {
  const t = tableNamed(st, name)
  const pk = t?.columns.find((c) => c.pk)
  if (pk) return pk.name
  const on = j.on
  if (on?.kind === 'operator' && on.op === '=' && on.args) {
    const c = on.args.find((a) => a.kind === 'column' && a.column && a.column.length > 1 && a.column[a.column.length - 2] === name)
    if (c?.column) return c.column[c.column.length - 1]
  }
  if (j.using?.length) return j.using[0]
  return null
}

// ---------------------------------------------------------------------------
// BETWEEN and <= with a day, on a timestamp.

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * The day a bound is, when it is one: '2025-06-30', '2025-06-30'::date, date '2025-06-30'.
 * @param {RefactorExpr} e
 */
function dayOf(e) {
  if (e.kind === 'constant' && e.type === 'string' && DAY.test(e.value ?? '')) return e.value ?? null
  if (e.kind === 'cast' && e.name === 'date' && e.args?.length === 1) return dayOf(e.args[0])
  return null
}

/** @param {string} day */
function nextDay(day) {
  const m = DAY.exec(day)
  if (!m) return day
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1))
  return d.toISOString().slice(0, 10)
}

/**
 * The column's declared type, from its table.
 * @param {RefactorStatement} st
 * @param {string[]} col
 */
function typeOf(st, col) {
  const name = col[col.length - 1]
  const owners = col.length > 1 ? [tableNamed(st, col[col.length - 2])].filter((t) => !!t) : st.tables.filter((t) => t.columns.some((c) => c.name === name))
  if (owners.length !== 1 || !owners[0]) return null
  return owners[0].columns.find((c) => c.name === name)?.type ?? null
}

/**
 * @param {RefactorStatement} st
 * @returns {Offer[]}
 */
function lastDay(st) {
  /** @type {Offer[]} */
  const offers = []
  for (const c of conditions(st)) {
    walk(c, (e, parent) => {
      const a = e.args
      if (!a || !a[0] || a[0].kind !== 'column' || !a[0].column) return
      const type = typeOf(st, a[0].column) ?? ''
      if (!/^timestamp/.test(type)) return
      const col = textOf(st, a[0])
      // Inside an OR or a NOT, two terms in place of one need parentheses.
      const wrap = !!parent && parent.kind !== 'and'
      if (e.kind === 'between' && a.length === 3) {
        const hi = dayOf(a[2])
        if (!hi) return
        const next = nextDay(hi)
        const text = `${col} >= ${textOf(st, a[1])} and ${col} < '${next}'`
        offers.push({
          title: `Keep all of ${hi}: ${brief(st, a[0])} < '${next}' (BETWEEN stops at ${hi} 00:00 on a timestamp), more rows`,
          edits: [{ from: e.from, to: e.to, text: wrap ? `(${text})` : text }]
        })
      } else if (e.kind === 'operator' && e.op === '<=' && a.length === 2) {
        const hi = dayOf(a[1])
        if (!hi) return
        const next = nextDay(hi)
        offers.push({
          title: `Keep all of ${hi}: ${brief(st, a[0])} < '${next}' (<= stops at ${hi} 00:00 on a timestamp), more rows`,
          edits: [{ from: e.from, to: e.to, text: `${col} < '${next}'` }]
        })
      }
    })
  }
  return offers
}

// ---------------------------------------------------------------------------
// AND and OR without parentheses.

/**
 * @param {RefactorStatement} st
 * @returns {Offer[]}
 */
function andOr(st) {
  /** @type {Offer[]} */
  const offers = []
  for (const c of conditions(st)) {
    walk(c, (e) => {
      if (e.kind !== 'or' || !e.args) return
      const bare = e.args.filter((a) => a.kind === 'and' && !a.parenthesized && a.args)
      if (!bare.length) return
      /** @type {Edit[]} */
      const edits = []
      for (const a of bare) {
        edits.push({ from: a.from, to: a.from, text: '(' })
        edits.push({ from: a.to, to: a.to, text: ')' })
      }
      const shape = e.args.map((a) => (bare.includes(a) ? '(… and …)' : '…')).join(' or ')
      offers.push({ title: `Write the parentheses PostgreSQL reads: ${shape}, same rows`, edits })
      // The other grouping, for the plain two-term shapes: a and b or c,
      // a or b and c.
      if (e.args.length === 2 && bare.length === 1 && bare[0].args?.length === 2) {
        const [x, y] = e.args
        const and = /** @type {RefactorExpr[]} */ (bare[0].args)
        const t = (/** @type {RefactorExpr} */ v) => textOf(st, v)
        const text = x === bare[0] ? `${t(and[0])} and (${t(and[1])} or ${t(y)})` : `(${t(x)} or ${t(and[0])}) and ${t(and[1])}`
        const shape2 = x === bare[0] ? '… and (… or …)' : '(… or …) and …'
        offers.push({ title: `Group it the other way: ${shape2}, other rows`, edits: [{ from: e.from, to: e.to, text }] })
      }
    })
  }
  return offers
}

/** @type {PlumeSQLExtension} */
export default {
  refactors: [
    {
      id: 'left-join-undone',
      label: 'A LEFT JOIN its WHERE undoes',
      description:
        "A condition in the WHERE on the joined table's columns drops every row the LEFT JOIN kept without a match (their columns are NULL), so the query returns what a JOIN would. Write it as the JOIN it is, or, for a single <>, keep the rows without a match with IS DISTINCT FROM. PlumeSQL 0.26.2 and later.",
      example: "where d.department_name is distinct from 'HR'",
      refactor: leftJoinUndone
    },
    {
      id: 'compare-null',
      label: 'A comparison with NULL',
      description: 'x = NULL and x <> NULL are never true, so no row passes them: written IS NULL and IS NOT NULL. In the WHERE and in a join’s ON. PlumeSQL 0.26.2 and later.',
      example: 'where deleted_at is null',
      refactor: compareNull
    },
    {
      id: 'count-unmatched',
      label: 'count(*) over a LEFT JOIN',
      description:
        "count(*) counts the row the LEFT JOIN keeps for a customer with no orders, so that customer counts 1. Counting the joined table's key counts 0. Offered for a grouped query not grouped by the joined table. PlumeSQL 0.26.2 and later.",
      example: 'count(o.order_id)',
      refactor: countUnmatched
    },
    {
      id: 'last-day',
      label: 'BETWEEN that stops at midnight',
      description:
        "On a timestamp, BETWEEN '2025-06-01' AND '2025-06-30' (and <= '2025-06-30') stops at June 30 00:00, so the rest of the last day is left out. The end becomes the next day, excluded. PlumeSQL 0.26.2 and later.",
      example: "created_at >= '2025-06-01' and created_at < '2025-07-01'",
      refactor: lastDay
    },
    {
      id: 'and-or',
      label: 'AND and OR without parentheses',
      description:
        "AND binds before OR: status = 'paid' and region = 'EU' or vip is (status = 'paid' and region = 'EU') or vip. Write the parentheses PostgreSQL reads (same rows), or group it the other way (other rows). PlumeSQL 0.26.2 and later.",
      example: "(status = 'paid' and region = 'EU') or vip",
      refactor: andOr
    }
  ]
}
