// @ts-check
// @description Colours the cells of the columns you pick that meet a condition: above, below, between, equal to, containing, empty
// @color green
/** @type {PlumeSQLExtension} */
export default {
  inputs: [
    { key: 'columns', kind: 'multi-column', label: 'Columns', description: 'The columns whose cells are checked; one or several, comma separated' },
    { key: 'when', kind: 'choice', label: 'Highlight when', options: ['greater than', 'less than', 'between', 'equal to', 'not equal to', 'contains', 'starts with', 'is empty', 'is not empty'], default: 'greater than' },
    { key: 'value', kind: 'text', label: 'Value', default: '', description: 'What a cell is compared with: a number, a date as 2026-09-01, or text' },
    { key: 'and', kind: 'text', label: 'And (for between)', default: '', description: 'The upper end for between; the two ends are included' },
    { key: 'colour', kind: 'color', label: 'Colour', default: 'red' },
    { key: 'style', kind: 'choice', label: 'Style', options: ['fill', 'text', 'bold text'], default: 'fill' }
  ],
  rules: [
    {
      match: { input: 'columns' },
      fn: (value, row, prevRow, ctx) => {
        const o = ctx.inputs
        const s = value == null ? '' : String(value)
        // Numbers compare as numbers, everything else as text, which also
        // orders ISO dates and timestamps the way they read.
        const num = (/** @type {string} */ x) => (x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : null)
        const cmp = (/** @type {string} */ a, /** @type {string} */ b) => {
          const na = num(a), nb = num(b)
          return na != null && nb != null ? na - nb : a < b ? -1 : a > b ? 1 : 0
        }
        const v1 = (o.value ?? '').trim(), v2 = (o.and ?? '').trim()
        const when = o.when || 'greater than'
        let hit = false
        if (when === 'is empty') hit = value == null || s === ''
        else if (when === 'is not empty') hit = !(value == null || s === '')
        else if (value == null || v1 === '') hit = false
        else if (when === 'greater than') hit = cmp(s, v1) > 0
        else if (when === 'less than') hit = cmp(s, v1) < 0
        else if (when === 'between') hit = v2 !== '' && cmp(s, v1) >= 0 && cmp(s, v2) <= 0
        else if (when === 'equal to') hit = cmp(s, v1) === 0
        else if (when === 'not equal to') hit = cmp(s, v1) !== 0
        else if (when === 'contains') hit = s.toLowerCase().includes(v1.toLowerCase())
        else if (when === 'starts with') hit = s.toLowerCase().startsWith(v1.toLowerCase())
        if (!hit) return value
        // A theme colour by name repaints with the theme; a custom one is
        // the #rrggbb the user picked.
        const c = /^#[0-9a-f]{6}$/i.test(o.colour || '') ? o.colour : 'var(--' + (['red', 'amber', 'green', 'accent', 'violet'].includes(o.colour) ? o.colour : 'red') + ')'
        const style = o.style === 'text' ? 'color: ' + c
          : o.style === 'bold text' ? 'color: ' + c + '; font-weight: 700'
            : 'background: color-mix(in srgb, ' + c + ' 32%, transparent)'
        return { value, style, title: when + (v1 ? ' ' + v1 : '') + (when === 'between' && v2 ? ' and ' + v2 : '') }
      }
    }
  ]
}
