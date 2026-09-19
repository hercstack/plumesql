// @ts-check
// @description The result's rows as SQL: INSERT, multi-row INSERT, UPDATE by key or upsert, to copy, to save or in a tab (hand written)
// @color orange

// The last draw's SQL, for the header's buttons (they run beside render in
// the same frame).
let sqlAll = ''
let sqlFirst = ''

const NUMERIC = /^(smallint|integer|bigint|numeric|decimal|real|double precision|money|int[248]?|float[48]?|serial|bigserial|oid)\b/i
const BOOLEAN = /^bool(ean)?$/i
// Types whose literal reads best with an explicit cast, so the statement
// says what it is even pasted where no target column decides it.
const CAST = /^(jsonb?|uuid|date|time|timestamp|interval|inet|cidr)\b|\[\]$/i

// A plain lowercase name needs no quotes unless it is a word SQL reserves;
// the list is the reserved words a column or a table is likely to be called.
const RESERVED = new Set(('all analyse analyze and any array as asc asymmetric both case cast check collate column constraint create ' +
  'current_catalog current_date current_role current_time current_timestamp current_user default deferrable desc distinct do else ' +
  'end except false fetch for foreign from grant group having in initially intersect into lateral leading limit localtime ' +
  'localtimestamp not null offset on only or order placing primary references returning select session_user some symmetric ' +
  'table then to trailing true union unique user using variadic when where window with').split(' '))
export const ident = (/** @type {string} */ name) =>
  /^[a-z_][a-z0-9_$]*$/.test(name) && !RESERVED.has(name) ? name : '"' + String(name).replace(/"/g, '""') + '"'

// The target as typed: a name with a quote in it is taken as SQL already
// written; otherwise each dotted part is quoted when it needs to be.
export const target = (/** @type {string} */ typed) => {
  const t = String(typed || '').trim()
  if (!t) return 'my_table'
  if (t.includes('"')) return t
  return t.split('.').map((p) => ident(p.trim())).join('.')
}

const quote = (/** @type {string} */ s) => "'" + s.replace(/'/g, "''") + "'"

// One value as a SQL literal, by the column's type when it is known.
export const literal = (/** @type {unknown} */ v, /** @type {string} */ type) => {
  if (v == null) return 'NULL'
  const t = String(type || '').trim()
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : quote(String(v)) + (t ? '::' + t : '')
  const text = typeof v === 'object' ? JSON.stringify(v) : String(v)
  if (BOOLEAN.test(t)) {
    if (/^(t|true)$/i.test(text)) return 'true'
    if (/^(f|false)$/i.test(text)) return 'false'
  }
  // A number in its own text is written bare; NaN and Infinity stay quoted.
  if (NUMERIC.test(t) && !/^money/i.test(t) && /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(text)) return text
  return quote(text) + (CAST.test(t) ? '::' + t : '')
}

/**
 * The statements for a set of rows.
 * @param {{ name: string, type: string }[]} cols
 * @param {unknown[][]} rows
 * @param {{ table: string, kind: string, keys: string[], batch: number }} o
 */
export const statements = (cols, rows, o) => {
  // The first column of a name wins; a repeat could not be written twice.
  /** @type {number[]} */
  const idx = []
  const names = new Set()
  cols.forEach((c, i) => { if (!names.has(c.name)) { names.add(c.name); idx.push(i) } })
  const list = idx.map((i) => ident(cols[i].name)).join(', ')
  const tuple = (/** @type {unknown[]} */ r) => '(' + idx.map((i) => literal(r[i], cols[i].type)).join(', ') + ')'
  const keyIdx = o.keys.map((k) => cols.findIndex((c) => c.name === k)).filter((i) => i >= 0)
  const rest = idx.filter((i) => !keyIdx.includes(i))
  /** @type {string[]} */
  const out = []
  if (o.kind === 'multi-row insert') {
    const n = Math.max(1, o.batch)
    for (let s = 0; s < rows.length; s += n) out.push('insert into ' + o.table + ' (' + list + ') values\n  ' + rows.slice(s, s + n).map(tuple).join(',\n  ') + ';')
  } else if (o.kind === 'update') {
    for (const r of rows) {
      out.push('update ' + o.table + ' set ' + rest.map((i) => ident(cols[i].name) + ' = ' + literal(r[i], cols[i].type)).join(', ') +
        ' where ' + keyIdx.map((i) => ident(cols[i].name) + (r[i] == null ? ' is null' : ' = ' + literal(r[i], cols[i].type))).join(' and ') + ';')
    }
  } else if (o.kind === 'upsert') {
    const conflict = keyIdx.map((i) => ident(cols[i].name)).join(', ')
    const set = rest.length ? 'do update set ' + rest.map((i) => ident(cols[i].name) + ' = excluded.' + ident(cols[i].name)).join(', ') : 'do nothing'
    for (const r of rows) out.push('insert into ' + o.table + ' (' + list + ') values ' + tuple(r) + '\non conflict (' + conflict + ') ' + set + ';')
  } else {
    for (const r of rows) out.push('insert into ' + o.table + ' (' + list + ') values ' + tuple(r) + ';')
  }
  return out
}

const escapeHtml = (/** @type {unknown} */ s) => String(s).replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'))

// The panel shows this much; the Copy button copies everything.
const SHOWN_CHARS = 400000

// The copy and save formats: the same statements, straight to the
// clipboard or a file from the grid's Copy As and Save As. The target is
// the table the result was read from when PlumeSQL knows it, and its key
// is the key of an UPDATE or an upsert.
const asFormat = (/** @type {string} */ kind) => (/** @type {FormatData} */ data, /** @type {FormatContext} */ ctx) => {
  const src = ctx.source
  const table = src ? (src.schema ? ident(src.schema) + '.' : '') + ident(src.table) : 'my_table'
  const keys = src ? src.key.filter((k) => data.columns.some((c) => c.name === k)) : []
  if ((kind === 'update' || kind === 'upsert') && keys.length === 0) {
    throw new Error('an ' + kind + ' needs the columns that identify a row, and this result has none PlumeSQL knows (a query on one table with a primary key has). Open the SQL tab of the result to pick them.')
  }
  if (!src) ctx.log('The result is not read from one table PlumeSQL knows, so the statements write to my_table.')
  return statements(data.columns, data.rows, { table, kind, keys, batch: 100 }).join('\n') + '\n'
}

/** @type {PlumeSQLExtension} */
export default {
  formats: [
    { id: 'sql-insert', label: 'SQL INSERT', extension: 'sql', format: asFormat('insert') },
    { id: 'sql-insert-multi', label: 'SQL multi-row INSERT', extension: 'sql', format: asFormat('multi-row insert') },
    { id: 'sql-update', label: 'SQL UPDATE', extension: 'sql', format: asFormat('update') },
    { id: 'sql-upsert', label: 'SQL upsert', extension: 'sql', format: asFormat('upsert') }
  ],
  views: [
    {
      tab: 'SQL',
      inputs: [
        { key: 'table', kind: 'text', label: 'Target table', default: 'my_table', description: 'The table the statements write to, schema qualified if you like (public.film)' },
        { key: 'kind', kind: 'choice', label: 'Statements', options: ['insert', 'multi-row insert', 'update', 'upsert'], default: 'insert', description: 'One INSERT per row, INSERTs of many rows, an UPDATE per row by its key, or INSERT ... ON CONFLICT DO UPDATE' },
        { key: 'keys', kind: 'multi-column', label: 'Key columns', types: ['any'], default: '', description: 'The columns that identify a row: the WHERE of an UPDATE, the conflict target of an upsert' },
        { key: 'batch', kind: 'number', label: 'Rows per INSERT', default: '100', description: 'For a multi-row insert, how many rows one statement carries' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '10000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      actions: [
        { label: 'Copy', icon: 'copy', run: (ctx) => ctx.copy(sqlAll) },
        { label: 'Copy first 100 rows', run: (ctx) => ctx.copy(sqlFirst) }
      ],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const dark = ctx.theme !== 'light'
        const pal = ctx.palette
        const fg = pal ? pal.text : dark ? '#c8d3f5' : '#3a3f4b', mut = pal ? pal.muted : dark ? '#8a92a6' : '#6b7280'
        const bg = pal ? pal.surface : dark ? '#1a1b26' : '#ffffff', kw = pal ? pal.keyword : dark ? '#bb9af7' : '#7c4dff'
        const amber = pal ? pal.amber : '#e0af68'
        root.style.cssText = 'margin:0;height:100%;overflow:auto;background:' + bg + ';color:' + fg + ';font:13px system-ui,-apple-system,sans-serif'
        const kind = inputs.kind || 'insert'
        const keys = String(inputs.keys || '').split(',').map((s) => s.trim()).filter(Boolean)
        const needsKey = kind === 'update' || kind === 'upsert'
        if (needsKey && !keys.some((k) => cols.some((c) => c.name === k))) {
          root.innerHTML = '<div style="padding:16px;color:' + mut + '">An ' + escapeHtml(kind) + ' needs the key columns that identify a row. Pick them (the sliders button in the header).</div>'
          sqlAll = sqlFirst = ''
          return
        }
        const top = Math.max(1, Number(inputs.top) || 10000)
        let rows = data.rows || []
        const total = typeof ctx.rowCount === 'number' ? ctx.rowCount : rows.length
        if (top > rows.length && total > rows.length && typeof ctx.rows === 'function') {
          try {
            const out = rows.slice()
            while (out.length < top) { const page = await ctx.rows(out.length, Math.min(50000, top - out.length)); if (!page || page.length === 0) break; for (const r of page) out.push(r) }
            rows = out
          } catch (e) { ctx.log('ctx.rows: ' + e) }
        }
        rows = rows.slice(0, top)
        const o = { table: target(inputs.table), kind, keys, batch: Math.max(1, Number(inputs.batch) || 100) }
        const all = statements(cols, rows, o)
        sqlAll = all.join('\n')
        sqlFirst = statements(cols, rows.slice(0, 100), o).join('\n')
        const head = all.length.toLocaleString() + (all.length === 1 ? ' statement' : ' statements') + ' for ' +
          (rows.length < total ? 'the first ' + rows.length.toLocaleString() + ' of ' + total.toLocaleString() + ' rows' : rows.length.toLocaleString() + (rows.length === 1 ? ' row' : ' rows'))
        const shown = sqlAll.length > SHOWN_CHARS ? sqlAll.slice(0, sqlAll.lastIndexOf('\n', SHOWN_CHARS)) : sqlAll
        const more = shown.length < sqlAll.length ? '<div style="padding:8px 16px;color:' + amber + '">The panel stops here; Copy copies all of it.</div>' : ''
        // A statement's first words in the keyword colour; nothing inside a
        // line is painted, where a value's own text could look like SQL.
        const painted = escapeHtml(shown).replace(/^(insert into|update|on conflict)\b/gm, (m) => '<span style="color:' + kw + '">' + m + '</span>')
        root.innerHTML = '<div style="padding:10px 16px 0;color:' + mut + '">' + escapeHtml(head) + '</div>' +
          '<pre style="margin:0;padding:10px 16px 16px;font:12px ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;tab-size:2;user-select:text">' + painted + '</pre>' + more
      }
    }
  ]
}
