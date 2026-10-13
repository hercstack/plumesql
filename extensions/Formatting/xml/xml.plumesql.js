// @ts-check
// @description An xml column reads compact on one line, the indented document on hover
// @color gray

// The document indented two spaces a level, without a parser (a formula has
// no DOM): tags, text, comments and CDATA as they come, an element that holds
// only text kept on one line with it.
const pretty = (/** @type {string} */ xml) => {
  const tokens = xml.replace(/>\s+</g, '><').trim().match(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)
  if (!tokens) return xml
  /** @type {string[]} */
  const out = []
  let depth = 0
  const pad = () => '  '.repeat(depth)
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    const open = /^<[A-Za-z_][^>]*[^/]>$|^<[A-Za-z_]>$/.test(t)
    if (/^<\//.test(t)) { depth = Math.max(0, depth - 1); out.push(pad() + t) }
    else if (open && i + 2 < tokens.length && !tokens[i + 1].startsWith('<') && /^<\//.test(tokens[i + 2])) {
      out.push(pad() + t + tokens[i + 1].trim() + tokens[i + 2])
      i += 2
    } else if (open) { out.push(pad() + t); depth++ }
    else if (t.trim()) out.push(pad() + t.trim())
  }
  return out.join('\n')
}

/** @type {PlumeSQLExtension} */
export default [
  {
    match: { type: /^xml$/ },
    fn: (value) => {
      if (value == null) return value
      const text = String(value)
      const line = text.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim()
      const full = text.length > 200000 ? text.slice(0, 200000) + '\n…' : text
      const doc = pretty(full)
      return { value: line.length > 120 ? line.slice(0, 119) + '…' : line, title: doc.length > 8000 ? doc.slice(0, 8000) + '\n…' : doc }
    }
  }
]
