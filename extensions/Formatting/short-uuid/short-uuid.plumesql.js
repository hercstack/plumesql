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
      // The short form is the cell's face (html) and the whole id stays its
      // value, so a copy of the cell copies an id that still finds the row.
      return { value: s, html: s.slice(0, 8) + '…', title: s, style: 'font-family: ui-monospace, SFMono-Regular, Menlo, monospace' }
    }
  }
]
