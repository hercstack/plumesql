// @ts-check
// @description A json / jsonb column reads compact on one line, the pretty-printed value on hover
// @color gray
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { type: /^jsonb?$/ },
    fn: (value) => {
      if (value == null) return value
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      let pretty = text
      try { pretty = JSON.stringify(JSON.parse(text), null, 2) } catch (e) { /* not JSON after all: show it as is */ }
      const line = text.replace(/\s+/g, ' ').trim()
      return { value: line.length > 120 ? line.slice(0, 119) + '\u2026' : line, title: pretty }
    }
  }
]
