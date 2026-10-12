// @ts-check
// @description Window functions in the editor's lightbulb: a running total, a moving average, the change, a share, a rank, the top rows per group

// This extension REFACTORS (docs: GRIDJSSPEC, Refactors): on a SELECT, the
// editor's lightbulb (Ctrl+. or Cmd+.) offers the window functions people
// look up every time, written into the query as a new column:
//
//   select *, sum(amount) over (order by placed_at) as amount_running_total
//   from shop_order
//   order by placed_at;
//
// and, where a window's result has to be filtered, as a query written above
// the one you have (the top rows per group, the latest row per key), which
// stays as it was. They are the SQL side of the Calculations grid
// extensions of the same names (Running total, Moving average, Change,
// Percent of total, Rank): those compute in the grid over the rows a query
// returned, these let PostgreSQL compute over every row, in a query you
// keep, filter and share.
//
// The column comes from the CARET: put it on a number column to choose it
// (else the query's first number column that is no id). The order is the
// query's own ORDER BY, else a date or time column, else the primary key;
// the group ("per customer_id") is a foreign key column, or, once the query
// has run, a column whose values repeat. It reads only what the editor hands
// it (statement.query, the tables' columns, the last result's first rows),
// so nothing is asked of the server.

const NUMERIC = /^(smallint|integer|bigint|real|double precision|numeric|decimal)\b/i
const TEMPORAL = /^(date|timestamp|time)\b/i
// A RANGE frame in days needs a date or a timestamp to count from.
const DATED = /^(date|timestamp)\b/i
// An aggregate whose value is a number whatever it reads.
const NUMBER_AGGREGATES = /^\s*(count|sum|avg)\s*\(/i

/**
 * A name as SQL needs it.
 * @param {string} name
 */
function ident(name) {
  return /^[a-z_][a-z0-9_$]*$/.test(name) ? name : '"' + name.replace(/"/g, '""') + '"'
}

/** @param {string} name */
const isId = (name) => /^id$|_id$/i.test(name)

/**
 * @typedef {{ name: string, expr: string, type: string, fk?: boolean, pk?: boolean, aggregate?: boolean, window?: boolean, from?: number, to?: number }} Col
 */

/**
 * What a refactor here chooses from: the query's OUTPUT columns (its items,
 * a star expanded into its table's columns) and the columns it can READ
 * (its tables'), each with the expression the select list would use.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 */
function model(statement, ctx) {
  const q = statement.query
  /** @type {Col[]} */
  const readable = []
  const many = statement.tables.length > 1
  for (const t of statement.tables) {
    const qual = t.alias ?? t.ref
    for (const c of t.columns) {
      readable.push({ name: c.name, expr: (many ? qual + '.' : '') + ident(c.name), type: c.type, fk: !!c.ref, pk: !!c.pk })
    }
  }
  /** @type {Col[]} */
  const out = []
  if (q) {
    for (const it of q.items) {
      if (it.star) {
        const qual = it.text.replace(/\s*\.\s*\*$/, '').trim()
        const named = qual !== '*'
        for (const t of statement.tables) {
          if (named && qual !== (t.alias ?? t.ref) && qual !== t.name) continue
          for (const c of t.columns) {
            out.push({ name: c.name, expr: (named || many ? (t.alias ?? t.ref) + '.' : '') + ident(c.name), type: c.type, fk: !!c.ref, pk: !!c.pk })
          }
        }
        continue
      }
      const r = it.column ? readable.find((c) => c.name === it.column?.[it.column.length - 1]) : undefined
      out.push({
        name: it.name,
        expr: exprOf(statement.text, it),
        type: it.type ?? (it.aggregate && NUMBER_AGGREGATES.test(it.text) ? 'numeric' : ''),
        fk: r?.fk,
        pk: r?.pk,
        aggregate: it.aggregate,
        // A window call already: PostgreSQL nests no window in another.
        window: /\bover\s*[(\w]/i.test(it.text),
        from: it.from,
        to: it.to
      })
    }
  } else if (ctx.result && /^(select|with)$/.test(statement.keyword)) {
    // A set operation: no one list to write into, but its result's columns
    // can be wrapped.
    for (const c of ctx.result.columns) out.push({ name: c.name, expr: ident(c.name), type: c.type })
  }
  return { q, out, readable, grouped: !!q?.clauses.groupBy }
}

/**
 * An item's expression without its alias: what another item may repeat.
 * @param {string} text
 * @param {RefactorQueryItem} it
 */
function exprOf(text, it) {
  const s = text.slice(it.from, it.to)
  if (!it.alias) return s
  const a = it.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return s.replace(new RegExp(`\\s+(?:as\\s+)?(?:"${a.replace(/"/g, '""')}"|${a})$`, 'i'), '')
}

/**
 * The word under the caret, lower case, or ''.
 * @param {RefactorStatement} statement
 */
function caretWord(statement) {
  const t = statement.text
  let a = statement.caret
  let b = statement.caret
  while (a > 0 && /[\w$]/.test(t[a - 1])) a--
  while (b < t.length && /[\w$]/.test(t[b])) b++
  return t.slice(a, b).toLowerCase()
}

/**
 * The number column the refactors read: the one under the caret (its item,
 * or its name), else the first one that is no id. In a grouped query, a
 * number aggregate.
 * @param {RefactorStatement} statement
 * @param {Col[]} out
 * @param {boolean} grouped
 */
function measure(statement, out, grouped) {
  const cands = out.filter((c) => NUMERIC.test(c.type) && !c.window && (grouped ? c.aggregate : !c.aggregate) && (grouped || !isId(c.name)))
  if (!cands.length) return null
  const w = caretWord(statement)
  return (
    cands.find((c) => c.from !== undefined && c.to !== undefined && statement.caret >= c.from && statement.caret <= c.to) ??
    cands.find((c) => c.name.toLowerCase() === w) ??
    cands[0]
  )
}

/**
 * The order a window runs in: the query's own ORDER BY (its first plain
 * column), else a date or time column, else the hypertable's time column,
 * else the primary key. In a grouped query, its first GROUP BY term.
 * @param {RefactorStatement} statement
 * @param {ReturnType<typeof model>} m
 * @returns {Col | null}
 */
function order(statement, m) {
  const { q, out, readable, grouped } = m
  if (!q) return null
  const text = statement.text
  if (grouped) {
    const g = q.clauses.groupBy
    if (!g) return null
    const first = text.slice(g.from, g.to).replace(/^group\s+by\s+/i, '').split(',')[0].trim()
    if (/^\d+$/.test(first)) {
      const it = q.items[Number(first) - 1]
      return it ? { name: it.name, expr: exprOf(text, it), type: it.type ?? '' } : null
    }
    const it = q.items.find((i) => exprOf(text, i).trim() === first)
    return { name: it?.name ?? first, expr: first, type: it?.type ?? readable.find((c) => c.name === first.split('.').pop())?.type ?? '' }
  }
  if (q.clauses.orderBy) {
    const first = text.slice(q.clauses.orderBy.from, q.clauses.orderBy.to).replace(/^order\s+by\s+/i, '').split(',')[0].trim()
    const plain = /^([\w$]+\.)?[\w$]+/.exec(first)?.[0]
    if (plain && /^[\w$.]+(\s+(asc|desc))?(\s+nulls\s+(first|last))?$/i.test(first)) {
      // A window sees no output alias and no ordinal: those are read
      // back to the item's own expression.
      const item = /^\d+$/.test(plain) ? q.items[Number(plain) - 1] : q.items.find((i) => i.alias && i.alias.toLowerCase() === plain.toLowerCase())
      if (item && !item.star && !/\bover\s*[(\w]/i.test(item.text)) return { name: item.name, expr: exprOf(text, item), type: item.type ?? '' }
      if (!/^\d+$/.test(plain) && !item) {
        const name = plain.split('.').pop() ?? plain
        const known = out.find((c) => c.name === name) ?? readable.find((c) => c.name === name)
        if (!known?.window) return { name, expr: plain, type: known?.type ?? '' }
      }
    }
  }
  const timed = out.find((c) => TEMPORAL.test(c.type) && !c.window) ?? readable.find((c) => TEMPORAL.test(c.type))
  if (timed) return timed
  const ts = statement.tables.find((t) => t.timescale?.timeColumn)
  if (ts) return readable.find((c) => c.name === ts.timescale?.timeColumn) ?? null
  if (statement.tables.length === 1) {
    const pk = statement.tables[0].columns.filter((c) => c.pk)
    if (pk.length === 1) return readable.find((c) => c.name === pk[0].name) ?? null
  }
  return null
}

/**
 * The group a window restarts for ("per customer_id"): a foreign key
 * column, or, once the query has run, a column whose values repeat in its
 * first rows. Only among the output columns when it must be one (a query
 * written above reads the query's columns, nothing else).
 * @param {ReturnType<typeof model>} m
 * @param {RefactorContext} ctx
 * @param {Col} not the measure, which is no group
 * @param {boolean} outputOnly
 * @returns {Col | null}
 */
function group(m, ctx, not, outputOnly) {
  if (m.grouped) return null
  const fk = m.out.find((c) => c.fk && c.name !== not.name)
  if (fk) return fk
  const r = ctx.result
  if (r && r.rows.length >= 4) {
    for (const [i, c] of r.columns.entries()) {
      if (c.name === not.name || NUMERIC.test(c.type) || TEMPORAL.test(c.type) || isId(c.name)) continue
      const values = r.rows.map((row) => row[i]).filter((v) => v !== null)
      const distinct = new Set(values).size
      if (distinct >= 2 && distinct <= values.length / 2) {
        const col = m.out.find((o) => o.name === c.name)
        if (col) return col
      }
    }
  }
  if (outputOnly) return null
  return m.readable.find((c) => c.fk && c.name !== not.name) ?? null
}

/**
 * A new column appended to the select list, and an ORDER BY when the
 * query has none (a running total read down unordered rows means nothing).
 * @param {RefactorStatement} statement
 * @param {RefactorQuery} q
 * @param {string} column the item, alias included
 * @param {string | null} orderBy what to order by when the query does not
 * @returns {{ from: number, to: number, text: string }[]}
 */
function appendColumn(statement, q, column, orderBy) {
  const text = statement.text
  const list = text.slice(q.select.from, q.select.to)
  let sep = ', '
  if (list.includes('\n')) {
    const lineStart = text.lastIndexOf('\n', q.items[q.items.length - 1].from - 1) + 1
    sep = ',\n' + (/^[ \t]*/.exec(text.slice(lineStart))?.[0] ?? '')
  } else {
    // A one-line list grown past 80 characters takes the new item on a
    // line of its own, under the first.
    const lineStart = text.lastIndexOf('\n', q.select.from - 1) + 1
    const lineEnd = text.indexOf('\n', q.select.to)
    const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd)
    if (line.length + column.length + 2 > 80) sep = ',\n' + ' '.repeat(q.select.from - lineStart)
  }
  const edits = [{ from: q.select.to, to: q.select.to, text: sep + column }]
  if (orderBy && !q.clauses.orderBy) {
    const tail = q.clauses.limit ?? q.clauses.offset ?? q.clauses.fetch ?? q.clauses.for
    if (tail) edits.push({ from: tail.from, to: tail.from, text: `order by ${orderBy}\n` })
    else edits.push({ from: q.end, to: q.end, text: `\norder by ${orderBy}` })
  }
  return edits
}

/**
 * A column name the query does not have yet.
 * @param {Col[]} out
 * @param {string} name
 */
function fresh(out, name) {
  const taken = new Set(out.map((c) => c.name))
  let n = name
  for (let k = 2; taken.has(n); k++) n = `${name}_${k}`
  return ident(n)
}

/**
 * Whether a window column can go INTO the query: a SELECT with a list of
 * its own that is not DISTINCT, and either grouped or with no aggregate
 * (an ungrouped aggregate query returns one row).
 * @param {ReturnType<typeof model>} m
 */
function inPlace(m) {
  const q = m.q
  if (!q || q.distinct || q.clauses.into) return false
  return m.grouped || !m.out.some((c) => c.aggregate)
}

/**
 * A query written above (or in a new tab), over the statement's own as a
 * CTE named q.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @param {string} title
 * @param {string} sql the new query's body after "with q as (...)"
 * @returns {RefactorOffer}
 */
function above(statement, ctx, title, sql) {
  const end = statement.query?.end ?? statement.text.replace(/[\s;]+$/, '').length
  const inner = statement.text.slice(0, end).replace(/\n/g, '\n    ')
  const full = `with q as (\n    ${inner}\n)\n${sql};\n`
  if (ctx.queryPlace === 'tab') return { title: title.replace(/ \(above\)$/, ' (new tab)'), edits: [], tab: full }
  return { title, edits: [{ from: 0, to: 0, text: full }] }
}

/** @param {unknown} v @param {number} lo @param {number} hi @param {number} dflt */
function count(v, lo, hi, dflt) {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}

/**
 * The setting up every refactor here shares: the model, the number
 * column, the order and whether the column can go into the query.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 */
function setup(statement, ctx) {
  if (!/^(select|with)$/.test(statement.keyword)) return null
  const m = model(statement, ctx)
  const x = measure(statement, m.out, m.grouped)
  if (!x) return null
  return { m, x, t: order(statement, m), here: inPlace(m) }
}

/**
 * Running total: sum over the rows so far, and per group.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function runningTotal(statement, ctx) {
  const s = setup(statement, ctx)
  if (!s || !s.here || !s.t || !s.m.q) return []
  const { m, x, t } = s
  const q = s.m.q
  const offers = [
    {
      title: `Running total of ${x.name}`,
      edits: appendColumn(statement, q, `sum(${x.expr}) over (order by ${t.expr}) as ${fresh(m.out, x.name + '_running_total')}`, t.expr)
    }
  ]
  const g = group(m, ctx, x, false)
  if (g) {
    offers.push({
      title: `Running total of ${x.name} per ${g.name}`,
      edits: appendColumn(statement, q, `sum(${x.expr}) over (partition by ${g.expr} order by ${t.expr}) as ${fresh(m.out, x.name + '_running_total')}`, `${g.expr}, ${t.expr}`)
    })
  }
  return offers
}

/**
 * Whether an order column counts in days: a date does; a timestamp does
 * when the query has run and its rows lie hours apart (readings every few
 * minutes average over rows: seven days of them would be the whole
 * result).
 * @param {Col} t
 * @param {RefactorContext} ctx
 */
function daily(t, ctx) {
  if (/^date\b/i.test(t.type)) return true
  if (!DATED.test(t.type) || !ctx.result) return false
  const i = ctx.result.columns.findIndex((c) => c.name === t.name)
  if (i < 0) return false
  const times = ctx.result.rows
    .map((r) => Date.parse(String(r[i] ?? '').replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b)
  const gaps = times.slice(1).map((v, k) => v - times[k]).filter((g) => g > 0).sort((a, b) => a - b)
  if (gaps.length < 3) return false
  return gaps[Math.floor(gaps.length / 2)] >= 6 * 3600 * 1000
}

/**
 * Moving average: the average of the last N rows, or, over a date order
 * (daily), of the last N days (a RANGE frame, right when days are missing).
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function movingAverage(statement, ctx) {
  const s = setup(statement, ctx)
  if (!s || !s.here || !s.t || !s.m.q) return []
  const { m, x, t } = s
  const n = count(ctx.options.window, 2, 1000, 7)
  const byDate = ctx.options.frame !== 'by rows' && !m.grouped && daily(t, ctx)
  const frame = byDate ? `range between interval '${n - 1} days' preceding and current row` : `rows between ${n - 1} preceding and current row`
  return [
    {
      title: `Moving average of ${x.name}, ${n} ${byDate ? 'days' : 'rows'}`,
      edits: appendColumn(statement, s.m.q, `avg(${x.expr}) over (order by ${t.expr} ${frame}) as ${fresh(m.out, x.name + '_moving_avg')}`, t.expr)
    }
  ]
}

/**
 * Change: the difference from the previous row and the percent it is
 * (no division by zero: a zero before reads NULL).
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function change(statement, ctx) {
  const s = setup(statement, ctx)
  if (!s || !s.here || !s.t || !s.m.q) return []
  const { m, x, t } = s
  const prev = `lag(${x.expr}) over (order by ${t.expr})`
  const diff = `${x.expr} - ${prev} as ${fresh(m.out, x.name + '_change')}`
  const pct = `round((100.0 * (${x.expr} - ${prev}) / nullif(${prev}, 0))::numeric, 2) as ${fresh(m.out, x.name + '_change_pct')}`
  const kind = String(ctx.options.change ?? 'difference and percent')
  const column = kind === 'difference' ? diff : kind === 'percent' ? pct : `${diff}, ${pct}`
  return [{ title: `Change of ${x.name} from the previous row`, edits: appendColumn(statement, s.m.q, column, t.expr) }]
}

/**
 * Percent of total: each row's share of the whole, and of its group.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function percentOfTotal(statement, ctx) {
  const s = setup(statement, ctx)
  if (!s || !s.here || !s.m.q) return []
  const { m, x } = s
  /** @param {string} over */
  const pct = (over) => `round((100.0 * ${x.expr} / nullif(sum(${x.expr}) over (${over}), 0))::numeric, 2)`
  const offers = [{ title: `${x.name} as a percent of the total`, edits: appendColumn(statement, s.m.q, `${pct('')} as ${fresh(m.out, x.name + '_pct')}`, null) }]
  const g = group(m, ctx, x, false)
  if (g) {
    offers.push({
      title: `${x.name} as a percent of its ${g.name}'s total`,
      edits: appendColumn(statement, s.m.q, `${pct('partition by ' + g.expr)} as ${fresh(m.out, x.name + '_pct_of_' + g.name)}`, null)
    })
  }
  return offers
}

/**
 * Rank: by the number column, highest first, overall and per group.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function rank(statement, ctx) {
  const s = setup(statement, ctx)
  if (!s || !s.here || !s.m.q) return []
  const { m, x } = s
  const fn = ['rank', 'dense_rank', 'row_number'].includes(String(ctx.options.rank)) ? String(ctx.options.rank) : 'rank'
  const offers = [{ title: `Rank by ${x.name}`, edits: appendColumn(statement, s.m.q, `${fn}() over (order by ${x.expr} desc) as ${fresh(m.out, x.name + '_rank')}`, null) }]
  const g = group(m, ctx, x, false)
  if (g) {
    offers.push({
      title: `Rank by ${x.name} within its ${g.name}`,
      edits: appendColumn(statement, s.m.q, `${fn}() over (partition by ${g.expr} order by ${x.expr} desc) as ${fresh(m.out, x.name + '_rank')}`, null)
    })
  }
  return offers
}

/**
 * Tiles: which quarter (or Nth) of the rows by the number column a row is
 * in, lowest first.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function tiles(statement, ctx) {
  const s = setup(statement, ctx)
  if (!s || !s.here || !s.m.q) return []
  const n = count(ctx.options.tiles, 2, 100, 4)
  const word = n === 4 ? 'quartile' : n === 5 ? 'quintile' : n === 10 ? 'decile' : `tile_of_${n}`
  return [
    {
      title: n === 4 ? `Quartile of ${s.x.name}` : `Which of ${n} groups ${s.x.name} is in`,
      edits: appendColumn(statement, s.m.q, `ntile(${n}) over (order by ${s.x.expr}) as ${fresh(s.m.out, s.x.name + '_' + word)}`, null)
    }
  ]
}

/**
 * Row numbers: in the query's order (or the one this extension picks).
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function rowNumbers(statement, ctx) {
  if (!/^(select|with)$/.test(statement.keyword)) return []
  const m = model(statement, ctx)
  if (!inPlace(m) || !m.q) return []
  const t = order(statement, m)
  if (!t) return []
  if (m.out.some((c) => /^(rn|row_number)$/i.test(c.name))) return []
  return [{ title: `Row numbers by ${t.name}`, edits: appendColumn(statement, m.q, `row_number() over (order by ${t.expr}) as row_number`, t.expr) }]
}

/**
 * Top N per group: the rows with the highest number in each group, as a
 * query above (a window's result is filtered only from outside it).
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function topPerGroup(statement, ctx) {
  if (!/^(select|with)$/.test(statement.keyword)) return []
  const m = model(statement, ctx)
  if (m.grouped) return []
  const x = measure(statement, m.out, false)
  if (!x) return []
  const g = group(m, ctx, x, true)
  if (!g) return []
  const n = count(ctx.options.top, 1, 1000, 3)
  const gx = ident(g.name)
  const sql =
    `select *\n` +
    `from (\n` +
    `    select q.*, row_number() over (partition by ${gx} order by ${ident(x.name)} desc) as rank_in_${g.name.replace(/\W/g, '_')}\n` +
    `    from q\n` +
    `) ranked\n` +
    `where rank_in_${g.name.replace(/\W/g, '_')} <= ${n}\n` +
    `order by ${gx}, rank_in_${g.name.replace(/\W/g, '_')}`
  return [above(statement, ctx, `Top ${n} rows by ${x.name} per ${g.name} (above)`, sql)]
}

/**
 * Latest per key: each group's newest row, PostgreSQL's DISTINCT ON, as a
 * query above.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function latestPerKey(statement, ctx) {
  if (!/^(select|with)$/.test(statement.keyword)) return []
  const m = model(statement, ctx)
  if (m.grouped) return []
  const t = m.out.find((c) => TEMPORAL.test(c.type))
  if (!t) return []
  const g = group(m, ctx, t, true)
  if (!g) return []
  const sql = `select distinct on (${ident(g.name)}) *\nfrom q\norder by ${ident(g.name)}, ${ident(t.name)} desc`
  return [above(statement, ctx, `Latest row per ${g.name}, by ${t.name} (above)`, sql)]
}

/** @type {PlumeSQLExtension} */
export default {
  refactors: [
    { id: 'running-total', label: 'Running total', description: 'A column that adds the number up row by row, over the query or per group, in the order of its dates.', example: 'sum(amount) over (order by placed_at)', refactor: runningTotal },
    { id: 'moving-average', label: 'Moving average', description: 'The average of the last few rows, or of the last few days when the query is ordered by a date.', example: "avg(amount) over (order by day range between interval '6 days' preceding and current row)", refactor: movingAverage },
    { id: 'change', label: 'Change', description: 'The difference from the previous row, and the percent it is.', example: 'amount - lag(amount) over (order by placed_at)', refactor: change },
    { id: 'percent-of-total', label: 'Percent of total', description: "Each row's share of the total, or of its group's.", example: 'round(100.0 * amount / sum(amount) over (), 2)', refactor: percentOfTotal },
    { id: 'rank', label: 'Rank', description: 'A rank by the number, highest first, overall or within each group.', example: 'rank() over (order by amount desc)', refactor: rank },
    { id: 'tiles', label: 'Quartile', description: 'Which quarter of the rows (or which of N groups) by the number a row is in.', example: 'ntile(4) over (order by amount)', refactor: tiles },
    { id: 'row-numbers', label: 'Row numbers', description: 'A column that numbers the rows in their order.', example: 'row_number() over (order by placed_at)', refactor: rowNumbers },
    { id: 'top-per-group', label: 'Top N per group', description: 'The rows with the highest number in each group, as a query above yours.', example: 'row_number() over (partition by customer_id order by amount desc) <= 3', refactor: topPerGroup },
    { id: 'latest-per-key', label: 'Latest row per key', description: "Each group's newest row, with PostgreSQL's DISTINCT ON, as a query above yours.", example: 'select distinct on (customer_id) * ... order by customer_id, placed_at desc', refactor: latestPerKey }
  ],
  options: [
    { key: 'window', kind: 'number', label: 'Moving average window', default: 7, description: 'How many rows, or days, each average reads.', refactor: 'moving-average' },
    { key: 'frame', kind: 'choice', label: 'Moving average frame', options: ['by date', 'by rows'], default: 'by date', description: 'By date counts the days before each row when the query is ordered by a date; by rows counts the rows.', refactor: 'moving-average' },
    { key: 'change', kind: 'choice', label: 'Change as', options: ['difference and percent', 'difference', 'percent'], default: 'difference and percent', refactor: 'change' },
    { key: 'rank', kind: 'choice', label: 'Ties', options: ['rank', 'dense_rank', 'row_number'], default: 'rank', description: 'rank leaves gaps after ties (1, 1, 3), dense_rank does not (1, 1, 2), row_number numbers ties apart.', refactor: 'rank' },
    { key: 'tiles', kind: 'number', label: 'Groups', default: 4, description: '4 for quartiles, 10 for deciles.', refactor: 'tiles' },
    { key: 'top', kind: 'number', label: 'Rows per group', default: 3, refactor: 'top-per-group' }
  ]
}
