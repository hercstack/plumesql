// @ts-check
// An hstore value arrives in the grid as its text, "a"=>"1", "b"=>NULL:
// readable for three keys, a wall for thirty. This module reads that text
// WITHOUT any query, with the grammar of the extension's own input function
// (hstore_in): pairs separated by commas, `key => value`, each side either
// double quoted (a backslash escapes the next character) or bare (a key up
// to whitespace or `=`, a value up to whitespace or `,`), and a bare NULL
// value (any case) is SQL NULL.
// What the server prints is always quoted; what a user types in the row
// editor need not be, so both read.

/**
 * A parsed hstore: its pairs in text order (a duplicated key keeps its
 * first value, as hstore_in keeps one; the count of the rest is kept), or
 * where the text stopped reading as one.
 * @typedef {{ ok: true, pairs: [string, string | null][], duplicates: number }} Hstore
 * @typedef {{ ok: false, error: string, at: number }} HstoreError
 */

/**
 * parseHstore reads hstore's text form.
 * @param {string} text
 * @returns {Hstore | HstoreError}
 */
export function parseHstore(text) {
  const s = text
  let i = 0
  /** @type {[string, string | null][]} */
  const pairs = []
  const seen = new Set()
  let duplicates = 0
  const ws = () => {
    while (i < s.length && /\s/.test(s[i])) i++
  }
  /** @param {string} error @returns {HstoreError} */
  const fail = (error) => ({ ok: false, error, at: i + 1 })
  // One token: quoted or bare, with its unescaped text and whether it was
  // quoted (a quoted "NULL" is the string, a bare NULL is SQL NULL).
  /**
   * @param {RegExp} stop what ends a bare token
   * @returns {{ text: string, quoted: boolean } | string}
   */
  const token = (stop) => {
    if (s[i] === '"') {
      i++
      let out = ''
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\') {
          i++
          if (i >= s.length) break
        }
        out += s[i++]
      }
      if (i >= s.length) return 'an unterminated quoted string'
      i++
      return { text: out, quoted: true }
    }
    let out = ''
    while (i < s.length && !stop.test(s[i])) {
      if (s[i] === '\\') {
        i++
        if (i >= s.length) return 'a trailing backslash'
      }
      out += s[i++]
    }
    if (out === '') return i < s.length ? `an unexpected "${s[i]}"` : 'the end of the text'
    return { text: out, quoted: false }
  }
  ws()
  if (i >= s.length) return { ok: true, pairs, duplicates }
  for (;;) {
    ws()
    const at = i
    const key = token(/[\s=]/)
    if (typeof key === 'string') {
      i = at
      return fail(`expected a key, found ${key}`)
    }
    ws()
    if (s[i] !== '=' || s[i + 1] !== '>') return fail(`expected "=>" after the key "${clip(key.text)}"`)
    i += 2
    ws()
    const vat = i
    const val = token(/[\s,]/)
    if (typeof val === 'string') {
      i = vat
      return fail(`expected a value for the key "${clip(key.text)}", found ${val}`)
    }
    const value = !val.quoted && val.text.toUpperCase() === 'NULL' ? null : val.text
    if (seen.has(key.text)) duplicates++
    else {
      seen.add(key.text)
      pairs.push([key.text, value])
    }
    ws()
    if (i >= s.length) break
    if (s[i] !== ',') return fail(`expected "," between pairs, found "${s[i]}"`)
    i++
  }
  return { ok: true, pairs, duplicates }
}

/** @param {string} t */
function clip(t) {
  return t.length > 24 ? `${t.slice(0, 24)}…` : t
}

/**
 * The pairs as a JSON object, pretty printed: what hstore_to_json builds
 * (every value a string, NULL a JSON null).
 * @param {[string, string | null][]} pairs
 */
export function hstoreJson(pairs) {
  return JSON.stringify(Object.fromEntries(pairs), null, 2)
}

/**
 * The pairs printed the way the server prints them (every key and value
 * quoted, backslash and quote escaped, ", " between pairs).
 * @param {[string, string | null][]} pairs
 */
export function hstoreText(pairs) {
  /** @param {string} t */
  const q = (t) => `"${t.replace(/[\\"]/g, (c) => `\\${c}`)}"`
  return pairs.map(([k, v]) => `${q(k)}=>${v === null ? 'NULL' : q(v)}`).join(', ')
}

/**
 * The reading line: "3 keys · 1 NULL".
 * @param {Hstore} h
 */
export function hstoreLine(h) {
  const n = h.pairs.length
  const nulls = h.pairs.filter((p) => p[1] === null).length
  const parts = [`${n.toLocaleString('en-US')} ${n === 1 ? 'key' : 'keys'}`]
  if (nulls > 0) parts.push(`${nulls.toLocaleString('en-US')} NULL`)
  return parts.join(' · ')
}

/** @param {string} t */
export function escapeHtml(t) {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

/**
 * The key => value table as markup: at most `max` lines, one per pair, the
 * last one "+ n more" when the pairs do not fit; every key and value escaped and clipped to one line, a
 * NULL value marked. Divs in a CSS grid (the host rebuilds markup from the
 * elements it knows, and a table is not one of them).
 * @param {[string, string | null][]} pairs
 * @param {{ width: number, max: number, muted?: string }} o
 */
export function hstoreTable(pairs, o) {
  if (pairs.length === 0) return ''
  const muted = o.muted ? `color:${o.muted};` : 'opacity:.65;'
  const cell = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;'
  /** @param {string} t */
  const one = (t) => escapeHtml(t.length > 200 ? `${t.slice(0, 200)}…` : t).replace(/[\r\n\t]/g, ' ')
  // Past `max` pairs the last line says how many more, so the box never
  // cuts it off.
  const shown = pairs.length > o.max ? Math.max(1, o.max - 1) : pairs.length
  const rows = pairs.slice(0, shown).map(
    ([k, v]) =>
      `<span style="${cell}${muted}" title="${one(k)}">${one(k)}</span>` +
      (v === null ? `<span style="${cell}${muted}font-style:italic">NULL</span>` : `<span style="${cell}" title="${one(v)}">${one(v)}</span>`)
  )
  const more = shown < pairs.length ? `<span style="grid-column:1 / 3;${muted}">+ ${(pairs.length - shown).toLocaleString('en-US')} more</span>` : ''
  return (
    `<div style="display:grid;grid-template-columns:minmax(0,max-content) minmax(0,1fr);gap:1px 10px;` +
    `max-width:${o.width}px;box-sizing:border-box;padding:4px 6px;font-size:11px;line-height:15px;font-family:var(--font-mono,monospace)">` +
    rows.join('') +
    more +
    `</div>`
  )
}
