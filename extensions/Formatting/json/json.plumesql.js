// @ts-check
// @description A json / jsonb column reads compact on one line, the pretty-printed value on hover
// @color gray
// The document on one line, its whitespace dropped OUTSIDE strings only
// (a string's own spaces and every number's digits stay exactly as sent),
// with a space after each comma and colon the way jsonb writes them.
const compact = (/** @type {string} */ s) => {
  let out = ''
  let inStr = false, esc = false
  for (const ch of s) {
    if (inStr) {
      out += ch
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; out += ch; continue }
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') continue
    out += ch
    if (ch === ',' || ch === ':') out += ' '
  }
  return out
}
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { type: /^jsonb?$/ },
    fn: (value) => {
      if (value == null) return value
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      let pretty = text
      try { pretty = JSON.stringify(JSON.parse(text), null, 2) } catch (e) { /* not JSON after all: show it as is */ }
      // The whole line is the value (the grid cuts what does not fit), so a
      // copy of the cell is the complete document, still valid JSON.
      return { value: compact(text), title: pretty }
    }
  }
]
