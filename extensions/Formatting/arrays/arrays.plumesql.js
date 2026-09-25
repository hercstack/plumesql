// @ts-check
// @description An array column reads as its items separated by commas, with the count on hover
// @color gray
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { type: /\[\]$/ },
    fn: (value) => {
      if (value == null) return value
      const s = String(value).trim()
      if (!s.startsWith('{') || !s.endsWith('}')) return value
      const inner = s.slice(1, -1)
      if (inner === '') return { value: '[]', class: 'fmt-muted', title: '0 items' }
      const items = []
      let cur = '', quoted = false, i = 0
      while (i < inner.length) {
        const ch = inner[i]
        if (quoted) {
          if (ch === '\\') { cur += inner[i + 1] ?? ''; i += 2; continue }
          if (ch === '\"') { quoted = false; i++; continue }
          cur += ch; i++; continue
        }
        if (ch === '\"') { quoted = true; i++; continue }
        if (ch === ',') { items.push(cur); cur = ''; i++; continue }
        cur += ch; i++
      }
      items.push(cur)
      return { value: items.map((t) => (t === 'NULL' ? '\u2205' : t)).join(', '), title: items.length + (items.length === 1 ? ' item' : ' items') }
    }
  }
]
