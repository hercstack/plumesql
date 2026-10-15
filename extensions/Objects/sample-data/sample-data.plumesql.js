// @ts-check
// @description Made-up rows for a table from the lightbulb: an INSERT script in a new tab, which runs only when you run it

// This extension REFACTORS (docs: GRIDJSSPEC, Refactors): on a statement
// that names a table (a SELECT from it, an INSERT, UPDATE or DELETE on it),
// the editor's lightbulb (Ctrl+. or Cmd+.) offers to write rows of made-up
// data for that table. The script opens in a NEW, unsaved tab and nothing
// runs: it is yours to read, change and run, or to close.
//
//   with ref_customers_id as (
//       select array_agg(id) as v from public.customers
//   )
//   insert into orders (customer_id, total, status, created_at)
//   select
//       ref_customers_id.v[1 + floor(random() * cardinality(ref_customers_id.v))::int],
//       round((random() * 1000)::numeric, 2),
//       (array['active', 'inactive', 'pending'])[1 + floor(random() * 3)::int],
//       now() - random() * interval '365 days'
//   from generate_series(1, 100) as g, ref_customers_id;
//
// Each value comes from the column's type and name: an email reads like
// one, a price is a sum of money, a birth date is an adult's. Identity and
// generated columns are left to the table, a serial too (PlumeSQL 0.26.0
// tells which; an older one only knows the key, and a single integer key
// is taken for one). A foreign key takes an existing row of the table it
// references, at random. A unique column gets a random suffix, a plain
// integer key the next numbers after the largest. A type it has no sample
// for is left out when it may be NULL, and named in the script when it may
// not, so the INSERT says what it needs before anything is written. It
// reads only what the editor hands it: nothing is asked of the server.

const ROWS_MAX = 100000

/**
 * A name as SQL needs it.
 * @param {string} name
 */
function ident(name) {
  return /^[a-z_][a-z0-9_$]*$/.test(name) ? name : '"' + name.replace(/"/g, '""') + '"'
}

/** @param {string} s */
const lit = (s) => "'" + s.replace(/'/g, "''") + "'"

/**
 * One of a list, at random for every row.
 * @param {string[]} list
 */
const pick = (list) => `(array[${list.map(lit).join(', ')}])[1 + floor(random() * ${list.length})::int]`

const FIRST = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy', 'Mallory', 'Niaj', 'Olivia', 'Peggy', 'Rupert', 'Sybil', 'Trent', 'Victor', 'Walter', 'Zoe']
const LAST = ['Smith', 'Jones', 'Brown', 'Taylor', 'Wilson', 'Davies', 'Evans', 'Thomas', 'Johnson', 'Roberts', 'Walker', 'Wright', 'Hall', 'Green', 'King', 'Baker', 'Hill', 'Moore', 'Clark', 'Lewis']
const CITIES = ['London', 'Paris', 'Berlin', 'Madrid', 'Rome', 'Vienna', 'Zagreb', 'Lisbon', 'Prague', 'Oslo', 'Tokyo', 'Toronto']
const COUNTRIES = ['Croatia', 'Germany', 'France', 'Spain', 'Italy', 'Austria', 'Portugal', 'Norway', 'Japan', 'Canada']
const COUNTRY_CODES = ['HR', 'DE', 'FR', 'ES', 'IT', 'AT', 'PT', 'NO', 'JP', 'CA']
const SENTENCES = ['Lorem ipsum dolor sit amet.', 'Consectetur adipiscing elit.', 'Sed do eiusmod tempor incididunt.', 'Ut labore et dolore magna aliqua.', 'Ut enim ad minim veniam.', 'Quis nostrud exercitation ullamco.']
const STREETS = ['Main St', 'High St', 'Oak Ave', 'Park Rd', 'Mill Ln', 'Church St']
// A table of people: its name column holds a person's name.
const PEOPLE = /(user|customer|person|people|employee|author|member|contact|staff|client|account|student|teacher|patient|player|owner)/i

/**
 * "orders" reads "Order", "order_items" "Order item": what a row of the
 * table is, for a name column of a table that is not of people.
 * @param {string} table
 */
function rowWord(table) {
  const words = table.replace(/[_\s]+/g, ' ').trim().split(' ')
  const last = words.pop() ?? table
  const one = /ies$/i.test(last) ? last.slice(0, -3) + 'y' : /(ses|xes|zes|ches|shes)$/i.test(last) ? last.slice(0, -2) : /s$/i.test(last) && !/ss$/i.test(last) ? last.slice(0, -1) : last
  const all = [...words, one].join(' ')
  return all.charAt(0).toUpperCase() + all.slice(1)
}

/**
 * A made-up value for one column, as SQL computed per row (`g` is the row
 * number); null when there is no sample for its type.
 * @param {RefactorColumn} col
 * @param {RefactorTable} table
 * @param {boolean} unique
 * @returns {{ expr: string, note?: string } | null}
 */
function valueFor(col, table, unique) {
  const type = col.type.toLowerCase()
  const isArray = /\[\]$/.test(type)
  const base = type.replace(/\[\]$/, '').replace(/\(.*\)/, '').trim()
  const args = /\((\d+)(?:\s*,\s*(\d+))?\)/.exec(type)
  const name = col.name.toLowerCase()
  const one = scalar(base, args, name, col, table, unique)
  if (!one) return null
  return isArray ? { expr: `array[${one.expr}, ${one.expr}]`, note: one.note } : one
}

/**
 * @param {string} base
 * @param {RegExpExecArray | null} args
 * @param {string} name
 * @param {RefactorColumn} col
 * @param {RefactorTable} table
 * @param {boolean} unique
 * @returns {{ expr: string, note?: string } | null}
 */
function scalar(base, args, name, col, table, unique) {
  const qtable = qualified(table)
  // A plain integer key with no default (or a unique integer): the next
  // numbers after the largest, so they never meet the rows there.
  if (/^(smallint|integer|bigint)$/.test(base) && (unique || col.pk)) {
    return { expr: `(select coalesce(max(${ident(col.name)}), 0) from ${qtable}) + g` }
  }
  if (/^(smallint|integer|bigint)$/.test(base)) {
    // A flag kept in a number (active, enabled): 0 or 1.
    if (/^(is_|has_)?(active|enabled|disabled|deleted|visible|flag)$/.test(name)) return { expr: 'floor(random() * 2)::int' }
    if (/(^|_)age$/.test(name)) return { expr: '18 + floor(random() * 60)::int' }
    if (/(^|_)year$/.test(name)) return { expr: '1990 + floor(random() * 36)::int' }
    if (/(qty|quantity|count|items|units)$/.test(name)) return { expr: '1 + floor(random() * 10)::int' }
    if (/(rating|stars|score|rank)$/.test(name)) return { expr: '1 + floor(random() * 5)::int' }
    if (/(percent|pct)/.test(name)) return { expr: 'floor(random() * 101)::int' }
    return { expr: base === 'bigint' ? 'floor(random() * 1000000)::bigint' : 'floor(random() * 1000)::int' }
  }
  if (base === 'numeric' || base === 'decimal' || base === 'real' || base === 'double precision') {
    const scale = args?.[2] != null ? Number(args[2]) : base === 'numeric' || base === 'decimal' ? 2 : 4
    const room = args ? Math.min(1000, 10 ** (Number(args[1]) - scale) - 1) : 1000
    const num = (/** @type {string} */ e) => (base === 'numeric' || base === 'decimal' ? `round((${e})::numeric, ${scale})` : `(${e})`)
    if (/(^|_)(lat|latitude)$/.test(name)) return { expr: num('random() * 180 - 90') }
    if (/(^|_)(lon|lng|long|longitude)$/.test(name)) return { expr: num('random() * 360 - 180') }
    if (/(percent|pct|rate|ratio)/.test(name)) return { expr: num(`random() * ${Math.min(100, room)}`) }
    return { expr: num(`random() * ${room}`) }
  }
  if (base === 'money') return { expr: '(random() * 1000)::numeric(10, 2)::money' }
  if (base === 'boolean') return { expr: /(active|enabled|visible|verified|published|valid)/.test(name) ? 'random() < 0.8' : 'random() < 0.5' }
  if (base === 'text' || base === 'character varying' || base === 'character' || base === 'citext' || base === 'name') {
    const t = text(name, table, unique)
    const n = args ? Number(args[1]) : 0
    return n ? { expr: `left(${t}, ${n})` } : { expr: t }
  }
  if (base === 'date') {
    if (/(birth|dob)/.test(name)) return { expr: 'current_date - (6570 + floor(random() * 18250))::int' }
    if (/(expir|due|until|deadline|ends?_|_end)/.test(name)) return { expr: 'current_date + floor(random() * 365)::int' }
    return { expr: 'current_date - floor(random() * 365)::int' }
  }
  if (base === 'timestamp with time zone' || base === 'timestamp without time zone') {
    const now = base === 'timestamp with time zone' ? 'now()' : 'localtimestamp'
    if (/(expir|due|until|deadline|ends?_|_end|scheduled)/.test(name)) return { expr: `${now} + random() * interval '365 days'` }
    return { expr: `${now} - random() * interval '365 days'` }
  }
  if (base === 'time without time zone') return { expr: "time '08:00' + random() * interval '10 hours'" }
  if (base === 'time with time zone') return { expr: "(time '08:00' + random() * interval '10 hours')::timetz" }
  if (base === 'interval') return { expr: 'make_interval(mins => floor(random() * 600)::int)' }
  if (base === 'uuid') return { expr: 'gen_random_uuid()' }
  if (base === 'jsonb' || base === 'json') return { expr: `${base}_build_object('n', g, 'tag', ${pick(['a', 'b', 'c'])})` }
  if (base === 'bytea') return { expr: "decode(md5(random()::text), 'hex')" }
  if (base === 'inet') return { expr: "('10.' || floor(random() * 256)::int || '.' || floor(random() * 256)::int || '.' || (1 + floor(random() * 254))::int)::inet" }
  if (base === 'cidr') return { expr: "('10.' || floor(random() * 256)::int || '.' || floor(random() * 256)::int || '.0/24')::cidr" }
  if (base === 'tsvector') return { expr: `to_tsvector('simple', ${pick(SENTENCES)})` }
  if (base === 'xml') return { expr: 'xmlelement(name item, g)' }
  if (base === 'int4range' || base === 'int8range' || base === 'numrange') return { expr: `${base}(g, g + 1 + floor(random() * 10)::int)` }
  if (base === 'daterange') return { expr: "daterange(current_date - floor(random() * 365)::int, current_date)" }
  if (base === 'tstzrange' || base === 'tsrange') {
    const now = base === 'tstzrange' ? 'now()' : 'localtimestamp'
    return { expr: `${base}(${now} - random() * interval '30 days', ${now})` }
  }
  // pgvector: a vector of the column's size, each element its own random
  // (the reference to g makes the subquery run for every row).
  if (base === 'vector' && args) return { expr: `(select array_agg(random() + g * 0) from generate_series(1, ${Number(args[1])}))::vector` }
  // PostGIS: a point somewhere on Earth, in the column's reference system.
  if (base === 'geometry' && /^geometry\(point(,\s*\d+)?\)/i.test(col.type)) {
    const srid = /,\s*(\d+)\)/.exec(col.type)?.[1] ?? '4326'
    return { expr: `ST_SetSRID(ST_MakePoint(random() * 360 - 180, random() * 180 - 90), ${srid})` }
  }
  return null
}

/**
 * Text that reads like the column's name says.
 * @param {string} name
 * @param {RefactorTable} table
 * @param {boolean} unique
 */
function text(name, table, unique) {
  const tag = "left(md5(random()::text), 6)"
  const u = (/** @type {string} */ e) => (unique ? `${e} || '-' || ${tag}` : e)
  if (/e_?mail/.test(name)) return `'user' || g || '.' || ${tag} || '@example.com'`
  if (/^(first_?name|given_?name|forename)$/.test(name)) return pick(FIRST)
  if (/^(last_?name|surname|family_?name)$/.test(name)) return pick(LAST)
  if (/(user_?name|login|handle|nickname)$/.test(name)) return `'user' || g || '-' || ${tag}`
  if (/(^|_)(full_?name|display_?name|contact_?name|customer_?name|name)$/.test(name)) {
    return PEOPLE.test(table.name) || /(full|display|contact|customer)/.test(name) ? u(`${pick(FIRST)} || ' ' || ${pick(LAST)}`) : u(`${lit(rowWord(table.name) + ' ')} || g`)
  }
  if (/country_?code|(^|_)iso2?$/.test(name)) return pick(COUNTRY_CODES)
  if (/country/.test(name)) return pick(COUNTRIES)
  if (/city|town/.test(name)) return pick(CITIES)
  if (/phone|mobile|(^|_)tel$|fax/.test(name)) return `'+1 555 ' || lpad(floor(random() * 10000)::int::text, 4, '0')`
  // The scheme apart from the host: the code never names a site it would
  // load (the Marketplace reads every URL in an extension's code as one).
  if (/url|website|homepage|(^|_)link$/.test(name)) return `'https:' || '//example.com/' || g`
  if (/zip|postal|postcode/.test(name)) return `lpad(floor(random() * 100000)::int::text, 5, '0')`
  if (/address|street/.test(name)) return `(1 + floor(random() * 200))::int || ' ' || ${pick(STREETS)}`
  if (/colou?r/.test(name)) return pick(['red', 'green', 'blue', 'orange', 'purple', 'black', 'white'])
  if (/currency/.test(name)) return pick(['EUR', 'USD', 'GBP', 'JPY'])
  if (/(^|_)(lang|language|locale)$/.test(name)) return pick(['en', 'de', 'fr', 'hr', 'es'])
  if (/password|hash|secret|token/.test(name)) return 'md5(random()::text)'
  if (/slug/.test(name)) return u(`'item-' || g`)
  if (/(^|_)(code|sku|ref|reference)$/.test(name)) return 'upper(left(md5(random()::text), 8))'
  if (/(title|subject|headline)/.test(name)) return u(`${lit(rowWord(table.name) + ' title ')} || g`)
  if (/(description|note|comment|body|content|summary|message|bio|text)/.test(name)) return pick(SENTENCES)
  if (/(status|state|stage)$/.test(name)) return pick(['active', 'inactive', 'pending'])
  return u(`${lit(name + ' ')} || g`)
}

/** @param {{ schema: string, name: string }} t */
const qualified = (t) => (t.schema && t.schema !== 'public' ? ident(t.schema) + '.' : '') + ident(t.name)

/**
 * The script for one table.
 * @param {RefactorTable} table
 * @param {number} rows
 */
function script(table, rows) {
  const cols = table.columns
  // PlumeSQL 0.26.0 hands how each column takes its value; an older one
  // does not, and a single integer key is then taken for an identity.
  const facts = cols.some((c) => c.identity || c.generated || c.default != null)
  const keys = cols.filter((c) => c.pk)
  const integerKey = keys.length === 1 && /^(smallint|integer|bigint)$/i.test(keys[0].type) ? keys[0] : null
  const uniques = new Set(
    (table.indexes ?? []).filter((i) => i.unique && i.keys.length === 1).map((i) => i.keys[0])
  )
  /** @type {string[]} */
  const notes = []
  /** @type {string[]} */
  const names = []
  /** @type {string[]} */
  const values = []
  /** @type {Map<string, string>} */
  const refs = new Map()
  for (const col of cols) {
    if (col.identity) {
      notes.push(`${col.name}: left to its identity.`)
      continue
    }
    if (col.generated) {
      notes.push(`${col.name}: computed by the table (a generated column).`)
      continue
    }
    if (col.default != null && /^nextval\(/i.test(col.default)) {
      notes.push(`${col.name}: left to its sequence.`)
      continue
    }
    if (!facts && col === integerKey) {
      notes.push(`${col.name}: left to the table (taken for an identity or a serial; if it has neither, add it: one number per row).`)
      continue
    }
    if (col.ref) {
      const target = qualified({ schema: col.ref.schema, name: col.ref.table })
      const cte = ident(('ref_' + col.ref.table + '_' + col.ref.column).toLowerCase().replace(/[^a-z0-9_]+/g, '_'))
      if (!refs.has(cte)) refs.set(cte, `select array_agg(${ident(col.ref.column)}) as v from ${target}`)
      names.push(ident(col.name))
      values.push(`${cte}.v[1 + floor(random() * cardinality(${cte}.v))::int]`)
      notes.push(`${col.name}: an existing ${target}.${col.ref.column}, at random (${target} needs rows first).`)
      continue
    }
    const unique = uniques.has(col.name) || (keys.length === 1 && keys[0] === col)
    const v = valueFor(col, table, unique)
    if (v) {
      names.push(ident(col.name))
      values.push(v.expr)
      if (v.note) notes.push(v.note)
      continue
    }
    if (!col.notNull) {
      notes.push(`${col.name} (${col.type}): left NULL, no sample for this type.`)
      continue
    }
    // A type this has no sample for, in a column that needs a value: an
    // enum is the usual one, and its labels can be picked without knowing
    // them; anything else the user gives.
    names.push(ident(col.name))
    values.push(`(enum_range(null::${col.type}))[1 + floor(random() * cardinality(enum_range(null::${col.type})))::int]`)
    notes.push(`${col.name} (${col.type}): one of its labels at random, if it is an enum; if not, give it a value.`)
  }
  if (!names.length) return null
  // A key made of references (a link table's) can meet a pair already
  // there, picked at random: such a row is skipped, not an error.
  const refNames = new Set(cols.filter((c) => c.ref).map((c) => c.name))
  const keySets = [keys.map((c) => c.name), ...(table.indexes ?? []).filter((i) => i.unique).map((i) => i.keys)]
  const conflicts = keySets.some((k) => k.length > 0 && k.some((n) => refNames.has(n)))
  if (conflicts) notes.push('A row whose key is there already is skipped (on conflict do nothing), so fewer may go in.')
  const target = qualified(table)
  const lines = [
    `-- Sample data: ${rows} rows of made-up values for ${table.schema ? table.schema + '.' : ''}${table.name}.`,
    '-- Nothing has run. Read it, change what you need (the row count is in',
    '-- generate_series), then run it.',
    ...notes.map((n) => '-- ' + n)
  ]
  const ctes = [...refs].map(([name, sql]) => `    ${name} as (\n        ${sql}\n    )`)
  const from = ['generate_series(1, ' + rows + ') as g', ...refs.keys()].join(', ')
  return [
    ...lines,
    ...(ctes.length ? ['with', ctes.join(',\n')] : []),
    `insert into ${target} (${names.join(', ')})`,
    'select',
    values.map((v) => '    ' + v).join(',\n'),
    `from ${from}` + (conflicts ? '\non conflict do nothing;' : ';'),
    ''
  ].join('\n')
}

/** @type {PlumeSQLExtension} */
export default {
  refactors: [
    {
      id: 'sample-data',
      label: 'Sample data',
      description: 'Rows of made-up values for a table the statement names, written as an INSERT in a new unsaved tab; nothing runs until you run it.',
      example: "insert into orders (total) select round((random() * 1000)::numeric, 2) from generate_series(1, 100) as g",
      refactor: (statement, ctx) => {
        const rows = Math.max(1, Math.min(ROWS_MAX, Math.round(Number(ctx.options.rows) || 100)))
        /** @type {{ title: string, edits: [], tab: string }[]} */
        const offers = []
        for (const table of statement.tables.slice(0, 3)) {
          if (!table.columns?.length) continue
          const sql = script(table, rows)
          if (sql) offers.push({ title: `Write ${rows} rows of sample data for ${table.name} (new tab)`, edits: [], tab: sql })
        }
        return offers
      }
    }
  ],
  options: [
    { key: 'rows', kind: 'number', label: 'Rows', default: 100, description: 'How many rows the script inserts, from 1 to 100,000; the number stands in its generate_series to change before a run.', refactor: 'sample-data' }
  ]
}
