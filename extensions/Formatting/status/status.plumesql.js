// @ts-check
// @description A column named *status reads green, amber or red by its value
// @color orange
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { name: /status$/i },
    fn: (value) => {
      const v = String(value == null ? '' : value).toLowerCase()
      const ok = ['active', 'done', 'success', 'ok', 'completed', 'enabled', 'paid']
      const bad = ['error', 'failed', 'cancelled', 'canceled', 'disabled', 'rejected']
      const warn = ['pending', 'waiting', 'processing', 'review', 'queued']
      const cls = ok.includes(v) ? 'fmt-ok' : bad.includes(v) ? 'fmt-bad' : warn.includes(v) ? 'fmt-warn' : 'fmt-muted'
      return { value, class: cls }
    }
  }
]
