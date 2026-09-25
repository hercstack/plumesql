#!/usr/bin/env node
// Every query extension executes: the marketplace's live test, the successor
// of PlumeSQL's private TestSeededActionsExecute. Node, no dependencies; psql
// does the talking.
//
//   node extensions/tools/execute.mjs --pg host:port:db:user:password[,host:port:...]
//   node extensions/tools/execute.mjs --pg ... --only blocking-locks
//
// For each `<Category>/<id>/<id>.plumesql.sql` the extension's OWN command (the
// header's statement, not the buttons') is bound the way PlumeSQL's input form
// would bind it (the registry placeholders for the connection, the header's
// @var defaults, an @for target that every server has) and sent through psql
// with ON_ERROR_STOP. A query that errors fails the run and names itself. A
// command extension (.plumesql.run) is a program, never executed here: its
// reading is the validator's business.
//
// Skips are printed, never silent: an extension whose folder needs a
// PostgreSQL extension (TimescaleDB, Citus, pg_cron, pg_partman) or whose text
// spends pg_stat_statements is probed first and skipped on a server that lacks
// it, and really executed on one that has it (the matrix carries a TimescaleDB
// and a Citus server). Ones whose @for target the extension manages (a
// hypertable, a distributed table) are skipped with a reason until this tool
// makes a scratch object for them.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const opt = (n) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : undefined
}
const spec = opt('--pg') ?? process.env.PLUMESQL_TEST_PG_MATRIX
if (!spec) {
  console.error('usage: execute.mjs --pg host:port:db:user:password[,...] [--only <id>]')
  process.exit(2)
}
const only = opt('--only')
const servers = spec.split(',').map((s) => {
  const [host, port, db, user, password] = s.split(':')
  return { host, port, db, user, password }
})

// What a folder needs: the PostgreSQL extension whose presence is probed.
const FOLDER_NEEDS = { TimescaleDB: 'timescaledb', Citus: 'citus', pg_cron: 'pg_cron', pg_partman: 'pg_partman' }

// ----- reading one extension -----------------------------------------------------

function extensions() {
  const out = []
  for (const category of readdirSync(ROOT, { withFileTypes: true })) {
    if (!category.isDirectory() || category.name === 'tools' || category.name.startsWith('.')) continue
    for (const d of readdirSync(join(ROOT, category.name), { withFileTypes: true })) {
      if (!d.isDirectory()) continue
      const main = join(ROOT, category.name, d.name, d.name + '.plumesql.sql')
      if (existsSync(main)) out.push({ id: d.name, category: category.name, file: main })
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

// The extension's own command: the first block (header comments and the
// statement they touch) up to the first blank line, minus its comment lines.
// Button headers follow after a blank line and are not run here.
function ownCommand(text) {
  const lines = text.replace(/^\uFEFF/, '').split('\n')
  const header = []
  const body = []
  let i = 0
  while (i < lines.length && lines[i].trim() === '') i++
  for (; i < lines.length; i++) {
    const l = lines[i]
    if (l.trim() === '' && body.length) break
    if (/^\s*--/.test(l)) {
      if (body.length === 0) header.push(l)
      continue
    }
    body.push(l)
  }
  return { header, sql: body.join('\n').trim() }
}

// The header's annotations, name and value.
function annotations(header) {
  return header
    .map((l) => /^\s*--+\s*@([A-Za-z][\w-]*)\s*(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => ({ name: m[1].toLowerCase(), value: m[2].trim() }))
}

// `"first", "second"` or `"lone"` or bare text.
function titled(value) {
  const two = /^"((?:[^"]|"")*)"\s*,\s*"((?:[^"]|"")*)"$/.exec(value)
  if (two) return { title: two[1].replace(/""/g, '"'), text: two[2].replace(/""/g, '"'), titled: true }
  const one = /^"((?:[^"]|"")*)"$/.exec(value)
  if (one) return { title: one[1].replace(/""/g, '"'), text: '', titled: false }
  return { title: value, text: '', titled: false }
}

// The values a run binds: the connection's registry placeholders, an @for
// target every server has (pg_catalog.pg_class), the clock, and the header's
// @var / @file / @dir declarations: `name=value` is a value, `name "prompt",
// "default"` opens on its default, `name "prompt"` alone is required and gets
// an empty string here (the form would insist; the test proves the statement).
function bindings(anns, server) {
  const now = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const v = {
    host: server.host, port: server.port, db: server.db, user: server.user, sslmode: '', conn: 'test', server: '17',
    year: String(now.getFullYear()), month: p(now.getMonth() + 1), day: p(now.getDate()), hour: p(now.getHours()),
    minute: p(now.getMinutes()), second: p(now.getSeconds()),
    schema: 'pg_catalog', name: 'pg_class', object: 'pg_catalog.pg_class', type: 'table'
  }
  v.date = `${v.year}-${v.month}-${v.day}`
  v.time = `${v.hour}-${v.minute}-${v.second}`
  v.timestamp = `${v.date}_${v.time}`
  const inline = new Set()
  for (const a of anns) {
    if (a.name === 'inline') for (const w of a.value.split(/[\s,]+/)) if (w) inline.add(w.replace(/^[{$:]|}$/g, '').toLowerCase())
    if (a.name !== 'var' && a.name !== 'file' && a.name !== 'dir') continue
    const m = /^(\$\d+|[A-Za-z][A-Za-z0-9_]*)(.*)$/.exec(a.value)
    if (!m) continue
    const name = m[1].toLowerCase()
    const rest = m[2]
    if (rest.startsWith('=')) v[name] = expand(rest.slice(1).trim(), v)
    else {
      const t = titled(rest.trim())
      v[name] = t.titled ? expand(t.text, v) : ''
    }
  }
  return { values: v, inline }
}

function expand(text, values) {
  return text.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (all, n) => (n.toLowerCase() in values ? values[n.toLowerCase()] : all))
}

// Bind the statement: an @inline name is spliced as written (an identifier
// the header chose); every other {name}, $name, :name and $n becomes a quoted
// literal, which PostgreSQL types like a parameter of unknown type.
function bind(sql, values, inline) {
  const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
  const known = (n) => n.toLowerCase() in values
  let out = sql.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (all, n) => {
    if (!known(n)) return all
    return inline.has(n.toLowerCase()) ? values[n.toLowerCase()] : lit(values[n.toLowerCase()])
  })
  // $name and :name outside strings and identifiers: a simple pass that skips
  // quoted spans, casts (::) and $$ bodies are not expected in a starter.
  out = out.replace(/('(?:[^']|'')*')|("(?:[^"]|"")*")|(?<![\w$:])[$:]([A-Za-z_][A-Za-z0-9_]*)/g, (all, s, q, n) => {
    if (s || q) return all
    return known(n) ? (inline.has(n.toLowerCase()) ? values[n.toLowerCase()] : lit(values[n.toLowerCase()])) : all
  })
  out = out.replace(/('(?:[^']|'')*')|\$(\d+)\b/g, (all, s, n) => {
    if (s) return all
    return known('$' + n) ? lit(values['$' + n]) : 'null'
  })
  return out
}

// ----- psql ------------------------------------------------------------------------

function psql(server, sql) {
  const r = spawnSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', server.host, '-p', server.port, '-U', server.user, '-d', server.db, '-At', '-c', sql], {
    env: { ...process.env, PGPASSWORD: server.password, PGCONNECT_TIMEOUT: '10' },
    encoding: 'utf8'
  })
  return { ok: r.status === 0, out: r.stdout ?? '', err: (r.stderr ?? '').trim() }
}

function hasExtension(server, name) {
  const r = psql(server, `select 1 from pg_catalog.pg_extension where extname = '${name}'`)
  return r.ok && r.out.trim() === '1'
}

// The server answers before anything is judged: a wrong password or a
// stopped container must fail the run loudly, never read as "nothing is
// installed here" and skip every extension.
function serverLabel(server) {
  const r = psql(server, 'select pg_catalog.current_setting(\'server_version\')')
  if (!r.ok) {
    console.error(`cannot reach ${server.host}:${server.port}: ${r.err}`)
    process.exit(2)
  }
  return `${server.host}:${server.port} (${r.out.trim()})`
}

// ----- the run ----------------------------------------------------------------------

let failures = 0
let ran = 0
let skipped = 0
for (const server of servers) {
  console.log(`\n== ${serverLabel(server)}`)
  const ts = hasExtension(server, 'timescaledb')
  const citus = hasExtension(server, 'citus')
  for (const ext of extensions()) {
    if (only && ext.id !== only) continue
    const text = readFileSync(ext.file, 'utf8')
    const { header, sql } = ownCommand(text)
    const anns = annotations(header)
    const where = `${ext.category}/${ext.id}`
    const needs = FOLDER_NEEDS[ext.category]
    if (needs && !hasExtension(server, needs)) {
      console.log(`skip ${where}: ${needs} is not installed here`)
      skipped++
      continue
    }
    const forTarget = anns.find((a) => a.name === 'for')?.value.toLowerCase() ?? ''
    if ((ts && /hypertable|continuous aggregate|chunk/.test(forTarget)) || (citus && /distributed|reference/.test(forTarget))) {
      console.log(`skip ${where}: @for ${forTarget} needs a scratch object this tool does not make yet`)
      skipped++
      continue
    }
    if (/pg_stat_statements/.test(text)) {
      const created = !hasExtension(server, 'pg_stat_statements') && psql(server, 'create extension if not exists pg_stat_statements').ok
      const probe = psql(server, 'select 1 from pg_stat_statements limit 1')
      if (!probe.ok) {
        if (created) psql(server, 'drop extension if exists pg_stat_statements')
        console.log(`skip ${where}: pg_stat_statements is not preloaded here`)
        skipped++
        continue
      }
    }
    const { values, inline } = bindings(anns, server)
    const bound = bind(sql, values, inline)
    // One statement proves itself by producing rows to page; several run as
    // written (a starter that sets and then selects).
    const single = (bound.match(/;/g) ?? []).length <= 1
    const probe = single ? `select 1 from (${bound.replace(/;\s*$/, '')}) as plumesql_probe limit 0` : bound
    const r = psql(server, probe)
    if (r.ok) {
      ran++
      console.log(`ok   ${where}`)
    } else {
      failures++
      console.log(`FAIL ${where}\n${r.err.split('\n').map((l) => '     ' + l).join('\n')}`)
    }
  }
}
console.log(`\n${ran} executed, ${skipped} skipped, ${failures} failed`)
process.exit(failures ? 1 : 0)
