// @ts-check
// @description Statistics in the editor's lightbulb: describe a number column, its correlation, trend, histogram and outliers, computed by PostgreSQL; count by a column's values, cast a text column

// This extension REFACTORS (docs: GRIDJSSPEC, Refactors): on a SELECT, the
// editor's lightbulb (Ctrl+. or Cmd+.) offers PostgreSQL's statistical
// aggregates over the rows your query returns, each written as a query
// ABOVE yours (which stays as it was) that reads it as a CTE named q:
//
//   with q as (
//       select * from shop_order where placed_at > now() - interval '1 year'
//   )
//   select count(amount) as n, avg(amount) as mean, stddev_samp(amount) as stddev,
//          percentile_cont(0.5) within group (order by amount) as median, ...
//   from q;
//
// Describe (count, mean, standard deviation, quartiles), Correlation
// (Pearson and Spearman), Trend over time (a linear regression's slope per
// day), Histogram (width_bucket) and Outliers (IQR fences or z-score), and
// a z-score column written into the query itself. They are the SQL side of
// the Analysis grid extensions (Profile, Correlation, Histogram, Outliers):
// those compute in the grid, these let PostgreSQL compute over every row.
//
// The column comes from the CARET: put it on a number column to choose it
// (else the query's first number column that is no id). A group ("per
// customer_id") is a foreign key column, or, once the query has run, a
// column whose values repeat. It reads only what the editor hands it, so
// nothing is asked of the server.

const NUMERIC = /^(smallint|integer|bigint|real|double precision|numeric|decimal)\b/i
const TEMPORAL = /^(date|timestamp|time)\b/i
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
  // A body that starts with a comma continues the WITH list (more CTEs).
  const full = `with q as (\n    ${inner}\n)${sql.startsWith(',') ? '' : '\n'}${sql};\n`
  if (ctx.queryPlace === 'tab') return { title: title.replace(/ \(above\)$/, ' (new tab)'), edits: [], tab: full }
  return { title, edits: [{ from: 0, to: 0, text: full }] }
}

/** @param {unknown} v @param {number} lo @param {number} hi @param {number} dflt */
function count(v, lo, hi, dflt) {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}


/** @param {unknown} v @param {number} lo @param {number} hi @param {number} dflt */
function num(v, lo, hi, dflt) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}

/**
 * The query's output columns and its number column (the caret's, else the
 * first that is no id): what every query above reads. Any output column
 * will do, an aggregate's too, since the query is read as a whole.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 */
function setup(statement, ctx) {
  if (!/^(select|with)$/.test(statement.keyword)) return null
  const m = model(statement, ctx)
  const nums = m.out.filter((c) => NUMERIC.test(c.type) && !isId(c.name) && !c.window)
  if (!nums.length) return null
  const w = caretWord(statement)
  const x =
    nums.find((c) => c.from !== undefined && c.to !== undefined && statement.caret >= c.from && statement.caret <= c.to) ??
    nums.find((c) => c.name.toLowerCase() === w) ??
    nums[0]
  return { m, x, nums, X: ident(x.name) }
}

/**
 * The decimals a statistic of a column keeps: about four significant
 * digits of its largest value, two at least (an amount in the hundreds
 * keeps two, a ratio in the thousandths keeps seven), as a CTE named
 * scale with one column, d.
 * @param {string} X the column, as SQL names it
 */
function scale(X) {
  return `,\nscale as (\n    select greatest(2, 4 - floor(log(nullif(max(abs(${X})), 0)::numeric))::int) as d from q\n)`
}

/**
 * Describe: the count, mean, standard deviation, minimum, quartiles and
 * maximum of the number column, overall and per group.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function describe(statement, ctx) {
  const s = setup(statement, ctx)
  if (!s) return []
  const { m, x, X } = s
  const r = (/** @type {string} */ e) => `round((${e})::numeric, d)`
  const stats =
    `count(${X}) as n,\n` +
    `       ${r(`avg(${X})`)} as mean,\n` +
    `       ${r(`stddev_samp(${X})`)} as stddev,\n` +
    `       min(${X}) as min,\n` +
    `       ${r(`percentile_cont(0.25) within group (order by ${X})`)} as q1,\n` +
    `       ${r(`percentile_cont(0.5) within group (order by ${X})`)} as median,\n` +
    `       ${r(`percentile_cont(0.75) within group (order by ${X})`)} as q3,\n` +
    `       max(${X}) as max`
  const offers = [above(statement, ctx, `Describe ${x.name} (above)`, `${scale(X)}\nselect ${stats}\nfrom q, scale\ngroup by d`)]
  const g = group(m, ctx, x, true)
  if (g) {
    const G = ident(g.name)
    offers.push(above(statement, ctx, `Describe ${x.name} per ${g.name} (above)`, `${scale(X)}\nselect ${G},\n       ${stats}\nfrom q, scale\ngroup by ${G}, d\norder by ${G}`))
  }
  return offers
}

/**
 * Correlation: Pearson's of the number column with each other number
 * column (two at most), with Spearman's (Pearson's of their ranks, ties
 * given their average rank) and the r squared of a straight line.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function correlation(statement, ctx) {
  const s = setup(statement, ctx)
  if (!s) return []
  const { x, X, nums } = s
  return nums
    .filter((c) => c.name !== x.name)
    .slice(0, 2)
    .map((y) => {
      const Y = ident(y.name)
      const sql =
        `select round(corr(${X}, ${Y})::numeric, 4) as pearson,\n` +
        `       round(corr(rank_x, rank_y)::numeric, 4) as spearman,\n` +
        `       round(regr_r2(${Y}, ${X})::numeric, 4) as r_squared,\n` +
        `       count(*) as n\n` +
        `from (\n` +
        `    select ${X}, ${Y},\n` +
        `           rank() over (order by ${X}) + (count(*) over (partition by ${X}) - 1) / 2.0 as rank_x,\n` +
        `           rank() over (order by ${Y}) + (count(*) over (partition by ${Y}) - 1) / 2.0 as rank_y\n` +
        `    from q\n` +
        `    where ${X} is not null and ${Y} is not null\n` +
        `) ranked`
      return above(statement, ctx, `Correlation of ${x.name} and ${y.name} (above)`, sql)
    })
}

/**
 * Trend over time: the slope of a straight line through the number column
 * against a date or time column, per day, with its r squared; overall and
 * per group.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function trend(statement, ctx) {
  const s = setup(statement, ctx)
  if (!s) return []
  const { m, x, X } = s
  const t = m.out.find((c) => TEMPORAL.test(c.type) && !/^time\b/i.test(c.type))
  if (!t) return []
  const T = ident(t.name)
  const stats =
    `round((regr_slope(${X}, extract(epoch from ${T})) * 86400)::numeric, d) as change_per_day,\n` +
    `       round(regr_r2(${X}, extract(epoch from ${T}))::numeric, 4) as r_squared,\n` +
    `       min(${T}) as since,\n` +
    `       max(${T}) as until,\n` +
    `       count(*) as n`
  const offers = [above(statement, ctx, `Trend of ${x.name} over ${t.name} (above)`, `${scale(X)}\nselect ${stats}\nfrom q, scale\ngroup by d`)]
  const g = group(m, ctx, x, true)
  if (g && g.name !== t.name) {
    const G = ident(g.name)
    offers.push(above(statement, ctx, `Trend of ${x.name} over ${t.name} per ${g.name} (above)`, `${scale(X)}\nselect ${G},\n       ${stats}\nfrom q, scale\ngroup by ${G}, d\norder by ${G}`))
  }
  return offers
}

/**
 * Histogram: the number column counted in evenly wide bins between its
 * minimum and maximum (the maximum in the last bin), with each bin's
 * range and share.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function histogram(statement, ctx) {
  const s = setup(statement, ctx)
  if (!s) return []
  const { x, X } = s
  const n = count(ctx.options.bins, 2, 200, 10)
  const sql =
    `,\nbounds as (\n` +
    // The bins' edges keep as many decimals as the range needs: three
    // significant digits of its width.
    `    select min(${X}) as lo, max(${X}) as hi,\n` +
    `           case when max(${X}) > min(${X}) then greatest(0, 3 - floor(log((max(${X}) - min(${X}))::numeric))::int) else 2 end as digits\n` +
    `    from q\n` +
    `),\n` +
    `binned as (\n` +
    `    select case when hi > lo then least(width_bucket(${X}, lo, hi, ${n}), ${n}) else 1 end as bin, lo, hi, digits\n` +
    `    from q, bounds\n` +
    `    where ${X} is not null\n` +
    `)\n` +
    `select bin,\n` +
    `       round((lo + (bin - 1) * (hi - lo) / ${n}.0)::numeric, digits) as from_value,\n` +
    `       round((lo + bin * (hi - lo) / ${n}.0)::numeric, digits) as to_value,\n` +
    `       count(*) as n,\n` +
    `       round(100.0 * count(*) / sum(count(*)) over (), 1) as pct\n` +
    `from binned\n` +
    `group by bin, lo, hi, digits\n` +
    `order by bin`
  return [above(statement, ctx, `Histogram of ${x.name}, ${n} bins (above)`, sql)]
}

/**
 * Outliers: the rows whose number lies outside the IQR fences (1.5 times
 * the interquartile range beyond the quartiles), or whose z-score is past
 * the threshold.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function outliers(statement, ctx) {
  const s = setup(statement, ctx)
  if (!s) return []
  const { m, x, X } = s
  if (ctx.options.method === 'z-score') {
    const z = num(ctx.options.threshold, 0.5, 100, 3)
    const Z = fresh(m.out, x.name + '_z')
    const sql =
      `select *\n` +
      `from (\n` +
      `    select q.*, (${X} - avg(${X}) over ()) / nullif(stddev_samp(${X}) over (), 0) as ${Z}\n` +
      `    from q\n` +
      `) scored\n` +
      `where abs(${Z}) > ${z}\n` +
      `order by abs(${Z}) desc`
    return [above(statement, ctx, `Outliers of ${x.name}, z-score over ${z} (above)`, sql)]
  }
  const k = num(ctx.options.factor, 0.1, 100, 1.5)
  const sql =
    `,\nfences as (\n` +
    `    select percentile_cont(0.25) within group (order by ${X}) as q1,\n` +
    `           percentile_cont(0.75) within group (order by ${X}) as q3\n` +
    `    from q\n` +
    `)\n` +
    `select q.*\n` +
    `from q, fences\n` +
    `where ${X} < q1 - ${k} * (q3 - q1) or ${X} > q3 + ${k} * (q3 - q1)\n` +
    `order by ${X}`
  return [above(statement, ctx, `Outliers of ${x.name}, outside ${k} IQR (above)`, sql)]
}

/**
 * Z-score: how many standard deviations each row's number lies from the
 * mean, as a column written into the query.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 * @returns {RefactorOffer[]}
 */
function zScore(statement, ctx) {
  if (!/^(select|with)$/.test(statement.keyword)) return []
  const m = model(statement, ctx)
  if (!inPlace(m) || m.grouped || !m.q) return []
  const x = measure(statement, m.out, false)
  if (!x) return []
  const col = `round(((${x.expr} - avg(${x.expr}) over ()) / nullif(stddev_samp(${x.expr}) over (), 0))::numeric, 2) as ${fresh(m.out, x.name + '_z')}`
  return [{ title: `Z-score of ${x.name}`, edits: appendColumn(statement, m.q, col, null) }]
}

// ── Count by a column's values, and Cast a text column ─────────────────────
// Both read the rows the query returned (ctx.result): a column holding a
// few categories, counted per value; a text column whose every value reads
// as a date, a moment, a number or a boolean, cast to it. They were the
// editor's own before PlumeSQL 0.29.0, which still offers them itself, so
// they answer only where ctx.settings (new in 0.29.0) is there.

const ID_LIKE = /^id$|_id$|^uuid$|_uuid$/i
const TEXT_TYPE = /^(text|character varying|character|varchar|name|citext)\b/i
// Types whose values are measurements, moments or payloads, never a
// handful of categories.
const NOT_CATEGORY = /^(smallint|integer|bigint|real|double precision|numeric|money|date|time|timestamp|interval|json|jsonb|bytea|uuid|xml|tsvector|geometry|geography|vector|halfvec|sparsevec)\b|\[\]$/i
// A column NAMED like a code (a postal code, a phone, an account number)
// keeps its digits text: they are not a quantity, whatever they look like.
const CODE_WORDS = new Set(['zip', 'zipcode', 'postal', 'postcode', 'phone', 'mobile', 'fax', 'code', 'account', 'iban', 'sku', 'ean', 'isbn', 'ssn', 'pin', 'nr', 'number', 'no'])
const VALUE_CAP = 4096

/**
 * Count by a column's values: a column of a few repeating values (two up to
 * the option's most, each value repeating), counted per value over the
 * query, as a query above it or in a new tab.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 */
function countByValue(statement, ctx) {
  const q = statement.query
  const r = ctx.result
  if (!ctx.settings || !r || !q || !/^(select|with)$/.test(statement.keyword)) return []
  if (q.distinct || q.clauses.groupBy || q.items.some((i) => i.aggregate) || r.rows.length < 6) return []
  const most = count(ctx.options.count_by_max, 2, 1000, 20)
  /** @type {Map<string, number>} */
  const seen = new Map()
  for (const c of r.columns) seen.set(c.name, (seen.get(c.name) ?? 0) + 1)
  /** @type {{ name: string, repeat: number }[]} */
  const picks = []
  r.columns.forEach((c, i) => {
    if ((seen.get(c.name) ?? 0) > 1 || ID_LIKE.test(c.name) || NOT_CATEGORY.test(c.type)) return
    const values = r.rows.map((row) => row[i]).filter((v) => v !== null)
    if (values.length < 6 || values.some((v) => String(v).length >= 200)) return
    const distinct = new Set(values).size
    if (distinct < 2 || distinct > most || distinct * 2 > values.length) return
    picks.push({ name: c.name, repeat: values.length / distinct })
  })
  const body = statement.text.slice(0, q.end).trim()
  return picks
    .sort((a, b) => b.repeat - a.repeat)
    .slice(0, 3)
    .map((p) => {
      const col = ident(p.name)
      const sql = `select ${col}, count(*)\nfrom (${body}) q\ngroup by ${col}\norder by count(*) desc;`
      if (ctx.queryPlace === 'tab') return { title: `Count by ${p.name} (in a new tab)`, edits: [], tab: sql + '\n' }
      return { title: `Count by ${p.name} (a query above)`, edits: [{ from: 0, to: 0, text: sql + '\n' }] }
    })
}

/**
 * The type every value reads as, or null: a date, a moment (with or
 * without a zone), a whole or a decimal number, a boolean. Leading zeros
 * keep a number text, and so does a column named like a code.
 * @param {string[]} values
 * @param {boolean} codeLike
 */
function castFor(values, codeLike) {
  const v = values.map((x) => x.trim())
  const all = (/** @type {RegExp} */ re) => v.every((x) => re.test(x))
  if (all(/^\d{4}-\d{2}-\d{2}$/) && v.every((x) => !Number.isNaN(Date.parse(x)))) return 'date'
  if (all(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}(:?\d{2})?)$/i)) return 'timestamptz'
  if (all(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/)) return 'timestamp'
  const leadingZero = v.some((x) => /^[+-]?0\d/.test(x)) || codeLike
  if (!leadingZero && all(/^[+-]?\d{1,18}$/)) return v.every((x) => Math.abs(Number(x)) <= 2147483647) ? 'integer' : 'bigint'
  if (!leadingZero && all(/^[+-]?(\d+\.\d+|\d+|\.\d+)$/) && v.some((x) => x.includes('.'))) return 'numeric'
  if (all(/^(true|false|t|f|yes|no)$/i)) return 'boolean'
  return null
}

const COLUMN_REF = /^(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"(?:[^"]|"")+"|[A-Za-z_][\w$]*))*$/

/**
 * Cast a text column: a column of the select list, text in the result,
 * whose every value (three at least) reads as another type, cast to it
 * under its own name.
 * @param {RefactorStatement} statement
 * @param {RefactorContext} ctx
 */
function castText(statement, ctx) {
  const q = statement.query
  const r = ctx.result
  if (!ctx.settings || !r || !q || !/^(select|with)$/.test(statement.keyword) || r.rows.length < 3) return []
  /** @type {RefactorOffer[]} */
  const out = []
  for (const it of q.items) {
    if (out.length >= 3) break
    if (it.star) continue
    // The column reference alone: the item up to its alias.
    let end = it.to
    if (it.alias) {
      const m = new RegExp(String.raw`\s+(?:as\s+)?(?:"${it.alias.replace(/"/g, '""')}"|${it.alias.replace(/[^\w$]/g, '\\$&')})\s*$`, 'i').exec(statement.text.slice(it.from, it.to))
      if (!m) continue
      end = it.from + m.index
    }
    const ref = statement.text.slice(it.from, end)
    if (!COLUMN_REF.test(ref.trim())) continue
    const i = r.columns.findIndex((c) => c.name === it.name)
    if (i < 0 || !TEXT_TYPE.test(r.columns[i].type)) continue
    const values = /** @type {string[]} */ (r.rows.map((row) => row[i]).filter((v) => v !== null))
    // An empty string casts to no date, number or boolean: the cast would fail on its row.
    if (values.length < 3 || values.some((x) => x === '' || x.length >= VALUE_CAP)) continue
    const to = castFor(values, it.name.toLowerCase().split(/[^a-z0-9]+/).some((w) => CODE_WORDS.has(w)))
    if (!to) continue
    out.push({ title: `Cast ${it.name} to ${to} (all its values fit)`, edits: [{ from: it.from, to: end, text: `${ref}::${to}${it.alias ? '' : ' as ' + ident(it.name)}` }] })
  }
  return out
}

/** @type {PlumeSQLExtension} */
export default {
  refactors: [
    { id: 'describe', label: 'Describe', description: 'The count, mean, standard deviation, minimum, quartiles and maximum of a number column, overall or per group, as a query above yours.', example: 'percentile_cont(0.5) within group (order by amount) as median', refactor: describe },
    { id: 'correlation', label: 'Correlation', description: "Pearson's and Spearman's correlation of two number columns, with the r squared of a straight line, as a query above yours.", example: 'corr(amount, items) as pearson', refactor: correlation },
    { id: 'trend', label: 'Trend over time', description: 'The slope of a straight line through a number column over a date column, per day, with its r squared, as a query above yours.', example: 'regr_slope(amount, extract(epoch from placed_at)) * 86400 as change_per_day', refactor: trend },
    { id: 'histogram', label: 'Histogram', description: 'A number column counted in evenly wide bins, with each bin\'s range and share, as a query above yours.', example: 'width_bucket(amount, lo, hi, 10) as bin', refactor: histogram },
    { id: 'outliers', label: 'Outliers', description: 'The rows whose number lies outside the IQR fences, or past a z-score, as a query above yours.', example: 'where amount > q3 + 1.5 * (q3 - q1)', refactor: outliers },
    { id: 'z-score', label: 'Z-score', description: 'How many standard deviations a row lies from the mean, as a column of the query.', example: '(amount - avg(amount) over ()) / stddev_samp(amount) over ()', refactor: zScore },
    { id: 'count-by-value', label: "Count by a column's values", description: 'Once the query has run: a column holding a few categories (from 2 values up to the most the option below allows, each repeating) is counted per value, in a query above or a new tab. PlumeSQL 0.29.0 and later.', example: 'select status, count(*) from (...) q group by status order by count(*) desc', refactor: countByValue },
    { id: 'cast-text', label: 'Cast a text column', description: 'Once the query has run: a text column whose values all read as dates, moments, numbers or booleans is cast to that type, under its own name. PlumeSQL 0.29.0 and later.', example: 'created::date as created', refactor: castText }
  ],
  options: [
    { key: 'bins', kind: 'number', label: 'Bins', default: 10, refactor: 'histogram' },
    { key: 'method', kind: 'choice', label: 'Method', options: ['IQR fences', 'z-score'], default: 'IQR fences', description: 'IQR fences read the quartiles and hold for skewed data; a z-score reads the mean and the standard deviation.', refactor: 'outliers' },
    { key: 'factor', kind: 'number', label: 'IQR factor', default: 1.5, description: 'How many interquartile ranges beyond the quartiles a value is an outlier: 1.5 is Tukey\'s, 3 the far ones.', refactor: 'outliers' },
    { key: 'threshold', kind: 'number', label: 'Z-score threshold', default: 3, refactor: 'outliers' },
    { key: 'count_by_max', kind: 'number', label: 'Most values to count by', default: 20, description: 'The most distinct values a column may hold in the sample and still count as categories.', refactor: 'count-by-value' }
  ]
}
