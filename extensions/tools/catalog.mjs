#!/usr/bin/env node
// The marketplace validator and catalog generator. Node, no dependencies.
//
//   node extensions/tools/catalog.mjs --check            validate every manifest and file (CI, every PR)
//   node extensions/tools/catalog.mjs --write            validate, then generate the index: extensions/catalog.json
//                                                        and extensions/locks/<id>.json (gitignored on main; the
//                                                        publish workflow puts them on the `catalog` branch)
//   node extensions/tools/catalog.mjs --write --commit <sha> --out <dir>
//                                                        the publish workflow: pin to the push and write elsewhere
//   --allow-missing-discussion                           a local checkout: a manifest may still say "discussion": 0
//   --base <ref>                                         the published catalog to compare versions against
//                                                        (default origin/catalog, then a local extensions/catalog.json)
//
// The directories and their manifests are the source of truth; the catalog
// is a derived INDEX that CI builds after every merge, so no pull request
// ever touches it and two contributors never collide on it. It holds only
// what search and the list need; the lock file of each extension holds the
// rest (the hashed file list, dependencies, permissions, discussion, author,
// license, the commit the files are served from), fetched when an extension
// is looked at or installed and verified against the hash the catalog
// carries for it.
//
// What it enforces is written down in docs/MARKETPLACE.md of the PlumeSQL
// repository (section 12); the numbered rules below quote it. When a rule
// here and that document disagree, one of them is wrong: fix it, do not
// bend the other.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = join(ROOT, '..')
const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const opt = (n) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : undefined
}
const write = flag('--write')
const allowMissingDiscussion = flag('--allow-missing-discussion')
const OUT = opt('--out') ? join(process.cwd(), opt('--out')) : ROOT

// ----- the vocabulary ---------------------------------------------------------

export const FORMAT = 1


// The annotation names PlumeSQL's parsers know (docs/ACTIONSPEC.md), with their
// aliases, for the structural check of rule 11: an unknown `@word` opening a
// header line is a typo the app would report, so the catalog refuses it first.
export const ANNOTATIONS = new Set([
  'description', 'desc', 'refresh', 'hide', 'toolbar', 'color', 'face', 'connection', 'extension',
  'inputs', 'ask', 'noask', 'for', 'env', 'file', 'dir', 'var', 'open-on-success', 'open-on-failure',
  'open-on-done', 'alert-on-success', 'alert-on-failure', 'alert-on-done', 'format-keywords', 'format-commas',
  'format-indent', 'format-width', 'readonly', 'confirm-writes', 'parse', 'button', 'row-action', 'action',
  'open', 'on', 'confirm', 'at', 'inline', 'pick'
])
// The markers a grid extension's leading comments may carry (docs/GRIDJSSPEC.md).
export const GRID_MARKERS = new Set(['ts-check', 'description', 'color', 'for', 'query', 'ask', 'noask', 'extension'])

const ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const RANGE_RE = /^>=(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const SPDX_RE = /^[A-Za-z0-9.+-]+$/
const KINDS = { '.plumesql.sql': 'query', '.plumesql.run': 'command', '.plumesql.js': 'grid' }
const MANIFEST_FIELDS = new Set([
  'format', 'id', 'kind', 'version', 'plumesql', 'name', 'description', 'categories', 'tags', 'requires',
  'files', 'dependencies', 'permissions', 'discussion', 'author', 'license', 'featured', 'icon', 'externals', 'demo',
  'recommend', 'forkedFrom'
])
// The app-side signals a manifest's `recommend` may name (rule 8e): the
// words the app knows; a new signal is a new word here and in the app.
const RECOMMEND_SIGNALS = new Set(['my-extensions'])
// The external libraries an extension loads at run time (rule 8b): every
// https URL the code names, in a view's `scripts: [...]` or an import, and
// nothing the code does not name. The app shows them with their hosts.
const EXTERNAL_RE = /['"](https:\/\/[^'"\s]+)['"]/g
// The logo (rule 8a): one of the extension's files, an image by extension,
// at most this many bytes; the app refuses a bigger one and draws the kind's
// glyph instead.
const ICON_EXTS = new Set(['.png', '.svg', '.jpg', '.jpeg', '.webp', '.gif'])
const ICON_MAX_BYTES = 64 * 1024
// The demo (rule 8d): a recording of the extension in USE (never its
// install), under media/ so it rides the README cache and not the install,
// an animated image, at most this many bytes. The app shows it as the second
// face of the page's "What it adds" section, behind a Map | Demo switch.
const DEMO_EXTS = new Set(['.gif', '.webp', '.png', '.jpg', '.jpeg'])
const DEMO_MAX_BYTES = 4 * 1024 * 1024
const REQUIRES_FIELDS = new Set(['pgExtensions', 'pgVersion'])
const PERMISSION_FIELDS = new Set(['fork'])
const AUTHOR_FIELDS = new Set(['name', 'url'])

// ----- collecting -----------------------------------------------------------------

const problems = []
const warnings = []
const fail = (where, msg) => problems.push(`${where}: ${msg}`)
const warn = (where, msg) => warnings.push(`${where}: ${msg}`)

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

function listDirs(p) {
  return readdirSync(p, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort()
}

function walkFiles(dir, base = dir) {
  const out = []
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith('.')) continue
    const p = join(dir, d.name)
    if (d.isDirectory()) out.push(...walkFiles(p, base))
    else out.push(relative(base, p).split('\\').join('/'))
  }
  return out.sort()
}

function readManifest(dir, where) {
  const p = join(dir, 'manifest.json')
  if (!existsSync(p)) {
    fail(where, 'manifest.json is missing') // rule 1
    return null
  }
  let m
  try {
    m = JSON.parse(readFileSync(p, 'utf8'))
  } catch (e) {
    fail(where, `manifest.json is not valid JSON: ${e.message}`) // rule 1
    return null
  }
  if (typeof m !== 'object' || m === null || Array.isArray(m)) {
    fail(where, 'manifest.json is not an object')
    return null
  }
  for (const k of Object.keys(m)) if (!MANIFEST_FIELDS.has(k)) fail(where, `unknown manifest field "${k}"`) // rule 1
  if (m.format !== FORMAT) fail(where, `format must be ${FORMAT}, found ${JSON.stringify(m.format)}`) // rule 1
  return m
}

// One extension directory: every rule that needs only this directory.
function collect(category, id) {
  const dir = join(ROOT, category, id)
  const where = `${category}/${id}`
  const m = readManifest(dir, where)
  if (!m) return null

  // rule 2: the id
  if (typeof m.id !== 'string' || !ID_RE.test(m.id) || m.id.length < 3 || m.id.length > 48) fail(where, `id "${m.id}" is not 3 to 48 characters of a-z, 0-9 and single hyphens, starting with a letter`)
  if (m.id !== id) fail(where, `id "${m.id}" differs from the directory name "${id}"`)

  // rule 3: kind, main file, files
  const present = walkFiles(dir).filter((f) => f !== 'manifest.json' && f !== 'README.md' && !f.startsWith('media/'))
  const mainExt = Object.keys(KINDS).find((ext) => present.includes(id + ext))
  if (!mainExt) fail(where, `no main file ${id}.plumesql.sql, ${id}.plumesql.run or ${id}.plumesql.js`)
  const kind = mainExt ? KINDS[mainExt] : undefined
  if (kind && m.kind !== kind) fail(where, `kind "${m.kind}" does not match the main file (${kind})`)
  if (!['query', 'command', 'grid'].includes(m.kind)) fail(where, `kind must be query, command or grid`)
  if (!Array.isArray(m.files) || m.files.length === 0 || !m.files.every((f) => typeof f === 'string')) {
    fail(where, 'files must be a non-empty list of paths')
  } else {
    if (mainExt && m.files[0] !== id + mainExt) fail(where, `files must list the main file first (${id + mainExt})`)
    for (const f of m.files) if (!present.includes(f)) fail(where, `files lists "${f}", which is not in the directory`)
    for (const f of present) if (!m.files.includes(f)) fail(where, `"${f}" is in the directory but not in files`)
    if (m.files.some((f) => f === 'manifest.json' || f === 'README.md' || f.startsWith('media/'))) fail(where, 'files must not list manifest.json, README.md or media/')
  }
  if (!existsSync(join(dir, 'README.md'))) fail(where, 'README.md is missing')

  // rule 4: categories
  if (!Array.isArray(m.categories) || m.categories.length === 0) fail(where, 'categories must be a non-empty list')
  else {
    for (const c of m.categories) if (!CATEGORIES.includes(c)) fail(where, `unknown category "${c}": a category is a directory under extensions/`)
    if (m.categories[0] !== category) fail(where, `the first category must be the directory's ("${category}"), found "${m.categories[0]}"`)
    if (new Set(m.categories).size !== m.categories.length) fail(where, 'categories repeats an entry')
  }

  // rule 6 and 7: versions
  if (typeof m.version !== 'string' || !SEMVER_RE.test(m.version)) fail(where, `version "${m.version}" is not MAJOR.MINOR.PATCH`)
  if (typeof m.plumesql !== 'string' || !RANGE_RE.test(m.plumesql)) fail(where, `plumesql "${m.plumesql}" is not a ">=X.Y.Z" range`)

  // the descriptive fields
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 40) fail(where, 'name must be 1 to 40 characters')
  else if (/\.$/.test(m.name.trim())) fail(where, 'name must not end with a period')
  if (typeof m.description !== 'string' || !m.description.trim() || m.description.length > 140) fail(where, 'description must be 1 to 140 characters')
  if (m.tags !== undefined) {
    if (!Array.isArray(m.tags) || m.tags.length > 12 || !m.tags.every((t) => typeof t === 'string' && /^[a-z0-9][a-z0-9 ._-]*$/.test(t))) fail(where, 'tags must be at most 12 lowercase words')
  }
  if (m.requires !== undefined) {
    if (typeof m.requires !== 'object' || m.requires === null) fail(where, 'requires must be an object')
    else {
      for (const k of Object.keys(m.requires)) if (!REQUIRES_FIELDS.has(k)) fail(where, `unknown requires field "${k}"`)
      if (m.requires.pgExtensions !== undefined && !(Array.isArray(m.requires.pgExtensions) && m.requires.pgExtensions.every((x) => typeof x === 'string'))) fail(where, 'requires.pgExtensions must be a list of names')
      if (m.requires.pgVersion !== undefined && !/^>=\d+(\.\d+)?$/.test(String(m.requires.pgVersion))) fail(where, 'requires.pgVersion must be ">=N" or ">=N.M"')
    }
  }
  if (m.dependencies !== undefined && !(Array.isArray(m.dependencies) && m.dependencies.every((d) => typeof d === 'string'))) fail(where, 'dependencies must be a list of ids')
  if (m.permissions !== undefined) {
    // rule 9
    if (typeof m.permissions !== 'object' || m.permissions === null) fail(where, 'permissions must be an object')
    else {
      for (const k of Object.keys(m.permissions)) if (!PERMISSION_FIELDS.has(k)) fail(where, `unknown permission "${k}"`)
      if (m.permissions.fork !== undefined && typeof m.permissions.fork !== 'boolean') fail(where, 'permissions.fork must be true or false')
    }
  }
  // rule 8 (existence is checked below, with the token)
  if (!Number.isInteger(m.discussion) || m.discussion < 0) fail(where, 'discussion must be the thread number (an integer)')
  else if (m.discussion === 0 && !allowMissingDiscussion) fail(where, 'discussion is 0: open the thread in Discussions (category Extensions, title the id) and write its number')
  if (typeof m.author !== 'object' || m.author === null || typeof m.author.name !== 'string' || !m.author.name.trim()) fail(where, 'author.name is required')
  else for (const k of Object.keys(m.author)) if (!AUTHOR_FIELDS.has(k)) fail(where, `unknown author field "${k}"`)
  if (typeof m.license !== 'string' || !SPDX_RE.test(m.license)) fail(where, 'license must be an SPDX identifier')
  if (m.featured !== undefined && typeof m.featured !== 'boolean') fail(where, 'featured must be true or false')
  // rule 8e: recommend names known app-side signals; forkedFrom names an id
  if (m.recommend !== undefined) {
    if (!Array.isArray(m.recommend) || !m.recommend.every((w) => typeof w === 'string')) fail(where, 'recommend must be a list of signal words')
    else for (const w of m.recommend) if (!RECOMMEND_SIGNALS.has(w)) fail(where, `unknown recommend signal "${w}" (known: ${[...RECOMMEND_SIGNALS].join(', ')})`)
  }
  if (m.forkedFrom !== undefined && (typeof m.forkedFrom !== 'string' || !ID_RE.test(m.forkedFrom))) fail(where, 'forkedFrom must be an extension id')

  // rule 8a: the logo is a listed file of an image type, within the size ceiling
  if (m.icon !== undefined) {
    if (typeof m.icon !== 'string' || !m.icon.trim()) fail(where, 'icon must be the path of an image file in the directory')
    else {
      const ext = m.icon.slice(m.icon.lastIndexOf('.')).toLowerCase()
      if (!ICON_EXTS.has(ext)) fail(where, `icon "${m.icon}" is not a PNG, SVG, JPEG, WebP or GIF`)
      if (!present.includes(m.icon)) fail(where, `icon "${m.icon}" is not in the directory (media/ is not for the icon; it installs with the files)`)
      else if (Array.isArray(m.files) && !m.files.includes(m.icon)) fail(where, `icon "${m.icon}" must be listed in files`)
      else if (statSync(join(dir, m.icon)).size > ICON_MAX_BYTES) fail(where, `icon "${m.icon}" is ${statSync(join(dir, m.icon)).size} bytes, the ceiling is ${ICON_MAX_BYTES}`)
    }
  }
  // rule 8d: the demo
  if (m.demo !== undefined) {
    if (typeof m.demo !== 'string' || !/^media\/[^/]+$/.test(m.demo)) fail(where, 'demo must be the path of a file directly under media/')
    else {
      const ext = m.demo.slice(m.demo.lastIndexOf('.')).toLowerCase()
      if (!DEMO_EXTS.has(ext)) fail(where, `demo "${m.demo}" is not a GIF, WebP, PNG or JPEG`)
      if (!existsSync(join(dir, m.demo))) fail(where, `demo "${m.demo}" is not in the directory`)
      else if (statSync(join(dir, m.demo)).size > DEMO_MAX_BYTES) fail(where, `demo "${m.demo}" is ${statSync(join(dir, m.demo)).size} bytes, the ceiling is ${DEMO_MAX_BYTES}`)
    }
  }

  // rule 8b: externals is the list of https URLs the code loads, exactly
  if (m.externals !== undefined && !(Array.isArray(m.externals) && m.externals.every((x) => typeof x === 'string'))) fail(where, 'externals must be a list of https URLs')
  else {
    const declared = new Set((m.externals ?? []).map(String))
    for (const x of declared) {
      let ok = false
      try { ok = new URL(x).protocol === 'https:' } catch { ok = false }
      if (!ok) fail(where, `external "${x}" is not an https URL`)
    }
    const found = new Set()
    for (const f of present.filter((f) => /\.(js|sql|run)$/.test(f))) {
      const text = readFileSync(join(dir, f), 'utf8')
      for (const hit of text.matchAll(EXTERNAL_RE)) found.add(hit[1])
    }
    for (const x of found) if (!declared.has(x)) fail(where, `the code loads ${x}, which externals does not list`)
    for (const x of declared) if (!found.has(x)) fail(where, `externals lists ${x}, which the code does not load`)
  }

  // rule 8c: dependencies is the list of marketplace ids the code references, exactly
  // (an `@extension <id>` line, an import from `$ext/<id>/`);
  // a path reference (./, $global/, $scripts/) is a file, not a dependency.
  {
    const declared = new Set(m.dependencies ?? [])
    const found = new Set()
    const idOf = (raw) => {
      const first = raw.trim().split(/\s+/)[0] ?? ''
      const bare = first.split(':')[0]
      return ID_RE.test(bare) && !first.includes('/') && !first.startsWith('.') && !first.startsWith('$') ? bare : ''
    }
    for (const f of present.filter((f) => /\.(js|sql|run)$/.test(f))) {
      const text = readFileSync(join(dir, f), 'utf8')
      for (const hit of text.matchAll(/^\s*(?:--+|#+|\/\/+)\s*@extension\s+(.+)$/gim)) {
        for (const item of hit[1].split(',')) {
          const ref = idOf(item)
          if (ref && ref !== id) found.add(ref)
        }
      }
      for (const hit of text.matchAll(/['"]\$ext\/([a-z0-9-]+)\//g)) if (hit[1] !== id) found.add(hit[1])
    }
    for (const d of found) if (!declared.has(d)) fail(where, `the code references ${d} (@extension or $ext/), which dependencies does not list`)
    for (const d of declared) if (!found.has(d)) fail(where, `dependencies lists ${d}, which the code does not reference`)
  }

  // rule 11 (structural half): every header line opening with @ names a known annotation
  if (mainExt) checkHeaders(join(dir, id + mainExt), kind, where)
  if (kind === 'grid') {
    for (const f of present.filter((f) => f.endsWith('.js') && f !== id + mainExt)) checkHeaders(join(dir, f), 'helper', where + '/' + f)
  }

  const files = Array.isArray(m.files)
    ? m.files.map((f) => {
        const buf = readFileSync(join(dir, f))
        return { path: f, sha256: sha256(buf), bytes: buf.length }
      })
    : []
  return { m, id, category, kind, files, path: `${category}/${id}` }
}

// Every comment line that opens with @ must name a known annotation (a query or
// command extension) or a known marker (a grid extension). Prose comments are
// fine; a misspelt annotation is not.
function checkHeaders(file, kind, where) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  if (kind === 'query' || kind === 'command') {
    const opener = kind === 'command' ? /^\s*#+\s*@([A-Za-z][\w-]*)/ : /^\s*(?:--+|\/\*+|\*+)\s*@([A-Za-z][\w-]*)/
    lines.forEach((l, i) => {
      const m = opener.exec(l)
      if (m && !ANNOTATIONS.has(m[1].toLowerCase())) fail(where, `line ${i + 1}: unknown annotation @${m[1]}`)
    })
    if (kind === 'query' && !/^\s*--+\s*@description\b/im.test(text) && !/^\s*--+\s*@desc\b/im.test(text)) fail(where, 'a query extension starts with a -- @description line')
    if (kind === 'command' && !/^\s*#+\s*@description\b/im.test(text) && !/^\s*#+\s*@desc\b/im.test(text)) fail(where, 'a command extension starts with a # @description line')
    if (kind === 'command' && /\{password\}/.test(text.split('\n').filter((l) => !/^\s*#+\s*@env\b/.test(l)).join('\n'))) fail(where, '{password} may stand on a # @env line and nowhere else')
  } else {
    // A grid extension's leading // comments, up to the first code line.
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (l.trim() === '') continue
      if (!/^\s*\/\//.test(l)) break
      const m = /^\s*\/\/\s*@([A-Za-z][\w-]*)/.exec(l)
      if (m && kind === 'grid' && !GRID_MARKERS.has(m[1])) fail(where, `line ${i + 1}: unknown marker // @${m[1]}`)
    }
    if (kind === 'grid' && !/^\s*\/\/\s*@description\b/m.test(text)) fail(where, 'a grid extension carries a // @description marker')
  }
}

// ----- the whole marketplace ------------------------------------------------------

// The categories are the DIRECTORIES under extensions/ (tools/ and locks/
// aside): nothing is listed anywhere, a new category is a new directory in
// the pull request that adds its first extension, and the review is what
// keeps the set sensible. What the validator checks is only that a name
// READS as a category (rule 4): a word or words of letters, digits and
// underscores separated by single spaces, at most 40 characters, so a
// directory can be shown as it is; that no two directories differ only in
// case, spacing or underscores (Backup / backup / Back up would be one
// rubric split three ways); and that every category holds an extension.
const CATEGORY_RE = /^[A-Za-z][A-Za-z0-9_]*(?: [A-Za-z0-9_]+)*$/
const categoryKey = (name) => name.toLowerCase().replace(/[\s_-]+/g, '')
const CATEGORIES = listDirs(ROOT).filter((d) => d !== 'tools' && d !== 'locks')
{
  const byKey = new Map()
  for (const c of CATEGORIES) {
    if (!CATEGORY_RE.test(c) || c.length > 40) fail(c, 'is not a category name: letters, digits and underscores in words separated by single spaces, at most 40 characters') // rule 4
    const k = categoryKey(c)
    if (byKey.has(k)) fail(c, `differs from the category "${byKey.get(k)}" only in case, spacing or underscores`) // rule 4
    else byKey.set(k, c)
  }
}

const entries = []
const seen = new Map()
for (const category of CATEGORIES) {
  const ids = listDirs(join(ROOT, category))
  if (ids.length === 0) fail(category, 'is a category directory with no extension in it') // rule 4
  for (const id of ids) {
    const e = collect(category, id)
    if (!e) continue
    if (seen.has(e.id)) fail(e.path, `id "${e.id}" is also ${seen.get(e.id)}`) // rule 2
    seen.set(e.id, e.path)
    entries.push(e)
  }
}
entries.sort((a, b) => a.id.localeCompare(b.id))
const byId = new Map(entries.map((e) => [e.id, e]))

// rule 5: dependencies exist, are not command extensions, form no cycle
for (const e of entries) {
  const deps = e.m.dependencies ?? []
  for (const d of deps) {
    const t = byId.get(d)
    if (!t) fail(e.path, `dependency "${d}" is not a catalog id`)
    else if (t.kind === 'command') fail(e.path, `dependency "${d}" is a command extension, which is never a dependency`)
    if (d === e.id) fail(e.path, 'depends on itself')
  }
  if (e.kind === 'command' && deps.length) fail(e.path, 'a command extension has no dependencies')
}
{
  const state = new Map()
  const visit = (id, trail) => {
    if (state.get(id) === 2) return
    if (state.get(id) === 1) {
      fail(trail[0], `dependency cycle: ${[...trail, id].join(' -> ')}`)
      return
    }
    state.set(id, 1)
    for (const d of byId.get(id)?.m.dependencies ?? []) if (byId.has(d)) visit(d, [...trail, id])
    state.set(id, 2)
  }
  for (const e of entries) visit(e.id, [])
}

function currentCommit() {
  const pinned = opt('--commit')
  if (pinned) return pinned
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}
const commit = currentCommit()

// A lock is everything the app needs to INSTALL or show the details of
// one extension, generated from its manifest and its files: the hashed
// file list, the dependencies, the permissions, the discussion, the author,
// the license, and the commit the files are served from. Bytes are
// canonical (stable key order, two-space indent, trailing newline) so the
// same content always hashes the same.
const lockCache = new Map()
function lockOf(e) {
  if (lockCache.has(e.id)) return lockCache.get(e.id)
  const lock = {
    format: FORMAT,
    id: e.id,
    kind: e.kind,
    version: e.m.version,
    plumesql: e.m.plumesql,
    commit,
    path: e.path,
    files: e.files,
    dependencies: e.m.dependencies ?? [],
    externals: e.m.externals ?? [],
    // The demo rides the lock: the detail view shows it, the install does
    // not fetch it (media/ is the README's, served through the cache).
    ...(e.m.demo ? { demo: e.m.demo } : {}),
    permissions: { fork: e.m.permissions?.fork ?? true },
    discussion: e.m.discussion,
    author: e.m.author,
    license: e.m.license
  }
  const text = JSON.stringify(lock, null, 2) + '\n'
  const out = { text, sha: sha256(Buffer.from(text)) }
  lockCache.set(e.id, out)
  return out
}

// The catalog's comment header (JSONC) goes before parsing: whole lines
// opening with // and nothing else, which is all the generator writes.
function stripComments(text) {
  return text
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n')
}

// The PUBLISHED catalog, for rules 2 (retired ids) and 6 (version bumps):
// the `catalog` branch's catalog.json (the publish workflow writes it at the
// branch root), else a locally generated extensions/catalog.json. Absent on
// a fresh repository.
function previousCatalog() {
  const base = opt('--base')
  const refs = base ? [base] : ['origin/catalog']
  for (const ref of refs) {
    for (const path of ['catalog.json', 'extensions/catalog.json']) {
      try {
        const out = execSync(`git show ${ref}:${path}`, { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
        return JSON.parse(stripComments(out))
      } catch {
        // try the next spelling or ref
      }
    }
  }
  const local = join(ROOT, 'catalog.json')
  if (existsSync(local)) {
    try {
      return JSON.parse(stripComments(readFileSync(local, 'utf8')))
    } catch {
      // unreadable: no previous
    }
  }
  return null
}
const prev = previousCatalog()
const retired = new Set(prev?.retired ?? [])
if (prev) {
  const prevById = new Map(prev.extensions.map((x) => [x.id, x]))
  for (const e of entries) {
    if (retired.has(e.id)) fail(e.path, `id "${e.id}" is retired and cannot come back`) // rule 2
    const p = prevById.get(e.id)
    if (!p) continue
    // The lock's hash changes with any installed file, so it is the
    // "files changed" signal against the published index.
    const changed = p.lockSha256 !== lockOf(e).sha
    const cmp = compareSemver(e.m.version, p.version)
    if (cmp < 0) fail(e.path, `version ${e.m.version} is lower than the published ${p.version}`) // rule 6
    if (changed && cmp === 0) fail(e.path, `files changed but version ${e.m.version} did not`) // rule 6
    if (!changed && cmp > 0) warn(e.path, `version bumped to ${e.m.version} with no file change`)
  }
  for (const p of prev.extensions) if (!byId.has(p.id)) retired.add(p.id) // a removed extension retires its id
}

function compareSemver(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

// rule 8: the discussion thread exists and its title is the id (needs a token)
async function checkDiscussions() {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY ?? 'hercstack/plumesql'
  if (!token) {
    warn('discussions', 'GITHUB_TOKEN is not set: the threads were not checked')
    return
  }
  const [owner, name] = repo.split('/')
  for (const e of entries) {
    const n = e.m.discussion
    if (!Number.isInteger(n) || n <= 0) continue
    const q = `query($owner:String!,$name:String!,$n:Int!){repository(owner:$owner,name:$name){discussion(number:$n){title category{name}}}}`
    let res
    try {
      res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { authorization: `bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query: q, variables: { owner, name, n } })
      }).then((r) => r.json())
    } catch (err) {
      warn(e.path, `discussion #${n} could not be checked: ${err.message}`)
      continue
    }
    const d = res?.data?.repository?.discussion
    if (!d) fail(e.path, `discussion #${n} does not exist`)
    else {
      if (d.title !== e.id) fail(e.path, `discussion #${n} is titled "${d.title}", not "${e.id}"`)
      if (d.category?.name !== 'Extensions') fail(e.path, `discussion #${n} is in category "${d.category?.name}", not "Extensions"`)
    }
  }
}
await checkDiscussions()

// ----- the index: the catalog and one lock per extension ----------------------------

const catalog = {
  format: FORMAT,
  commit,
  generatedAt: new Date().toISOString(),
  // The category directories, sorted as the panel lists them.
  categories: [...CATEGORIES].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })),
  retired: [...retired].sort(),
  extensions: entries.map((e) => ({
    id: e.id,
    kind: e.kind,
    version: e.m.version,
    plumesql: e.m.plumesql,
    name: e.m.name,
    description: e.m.description,
    categories: e.m.categories,
    tags: e.m.tags ?? [],
    requires: { pgExtensions: e.m.requires?.pgExtensions ?? [], ...(e.m.requires?.pgVersion ? { pgVersion: e.m.requires.pgVersion } : {}) },
    path: e.path,
    featured: e.m.featured === true,
    // The app-side signals that recommend it (rule 8e), the logo and the
    // author's name ride the catalog: the row shows them without a lock
    // in hand.
    ...((e.m.recommend ?? []).length ? { recommend: e.m.recommend } : {}),
    ...(e.m.icon ? { icon: e.m.icon } : {}),
    author: e.m.author.name,
    // The hosts the external libraries load from, so the row can say
    // "needs the network" and the app can offer the allowlist.
    ...((e.m.externals ?? []).length ? { hosts: [...new Set((e.m.externals ?? []).map((x) => new URL(x).host.toLowerCase()))] } : {}),
    lockSha256: lockOf(e).sha
  }))
}

if (write && problems.length === 0) {
  const locksDir = join(OUT, 'locks')
  mkdirSync(locksDir, { recursive: true })
  // Stale locks of retired extensions go, so the index never serves one.
  for (const f of readdirSync(locksDir)) if (f.endsWith('.json') && !byId.has(f.slice(0, -5))) rmSync(join(locksDir, f))
  for (const e of entries) writeFileSync(join(locksDir, e.id + '.json'), lockOf(e).text)
  // JSON with a comment header (JSONC): the first lines say what wrote the
  // file and from what, so nobody edits it by hand. PlumeSQL strips the
  // comments before parsing; the locks stay plain JSON, since their bytes
  // are what the catalog hashes.
  const header = [
    '// The PlumeSQL Extensions Marketplace catalog: the search index of every extension.',
    '// GENERATED by `node extensions/tools/catalog.mjs --write` from the manifests under',
    '// extensions/ and published by the publish workflow to the `catalog` branch after',
    '// every push to main. Never edit by hand; edit a manifest and run the tool.',
    `// Built from commit ${commit || '(uncommitted checkout)'} at ${catalog.generatedAt}.`
  ].join('\n')
  writeFileSync(join(OUT, 'catalog.json'), header + '\n' + JSON.stringify(catalog, null, 2) + '\n')
  console.log(`wrote ${relative(REPO, join(OUT, 'catalog.json'))} and ${entries.length} lock${entries.length === 1 ? '' : 's'}, commit ${commit || '(none)'}`)
}

for (const w of warnings) console.warn('warning: ' + w)
if (problems.length) {
  for (const p of problems) console.error('error: ' + p)
  console.error(`${problems.length} problem${problems.length === 1 ? '' : 's'}`)
  process.exit(1)
}
console.log(`${entries.length} extension${entries.length === 1 ? '' : 's'} valid`)
