// @ts-check
// @description A uuid column shows its first 8 characters, the whole id on hover
// @color gray
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { type: 'uuid' },
    fn: (value) => {
      if (value == null) return value
      const s = String(value)
      return { value: s.slice(0, 8) + '\u2026', title: s, style: 'font-family: ui-monospace, SFMono-Regular, Menlo, monospace' }
    }
  }
]
