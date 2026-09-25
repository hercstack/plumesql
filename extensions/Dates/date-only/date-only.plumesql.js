// @ts-check
// @description A timestamp column named *_at shows just the date, dropping the time
// @color green
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { name: /_at$/, type: /^timestamp/ },
    fn: (value) => (value ? String(value).slice(0, 10) : value)
  }
]
