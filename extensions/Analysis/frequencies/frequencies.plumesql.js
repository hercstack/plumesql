// @ts-check
// @description The most frequent values of a column with count, percent and cumulative percent, the rest in an Other line, in the grid
// @color violet
import { loadRows, topOf, colIndex, ask, num, round, tint } from '$ext/stats-core/stats-core.plumesql.js'

const OWN = new Set(['count', 'percent', 'cumulative %', 'bar'])
// Ties sort by value: as numbers when both read as numbers, else as text, NULL last.
const cmp = (/** @type {unknown} */ a, /** @type {unknown} */ b) => {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1
  const x = num(a), y = num(b)
  return x != null && y != null ? x - y : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Frequencies',
      inputs: [
        { key: 'column', kind: 'column', label: 'Column', description: 'The column whose values are counted' },
        { key: 'n', kind: 'number', label: 'Top values', default: '20', description: 'How many of the most frequent values get a line; the rest are counted together under Other' },
        { key: 'nulls', kind: 'choice', label: 'Nulls', options: ['count', 'skip'], default: 'count', description: 'count: NULL is a value like any other; skip: NULLs are left out of the counts and the percentages' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const ci = colIndex(cols, inputs.column)
        if (ci < 0) return ask('Pick the Column to count (the sliders button in the header)')
        const n = Math.max(1, Math.floor(num(inputs.n) ?? 20))
        const skipNulls = inputs.nulls === 'skip'
        const rows = await loadRows(data, ctx, topOf(inputs))
        /** @type {Map<unknown, number>} */
        const freq = new Map()
        let total = 0, nulls = 0
        for (const r of rows) {
          const v = r[ci]
          if (v == null) { nulls++; if (skipNulls) continue }
          // Server text is the key as it is; a number from a pipeline stage keys by its text, so 1 and '1' are one value.
          const k = v == null ? null : typeof v === 'string' ? v : String(v)
          freq.set(k, (freq.get(k) || 0) + 1)
          total++
        }
        if (!total) return ask('No values in ' + cols[ci].name + ' to count')
        const list = Array.from(freq.entries()).sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))
        const shown = list.slice(0, n)
        const peak = shown[0][1]
        const pct = (/** @type {number} */ c) => /** @type {number} */ (round((c / total) * 100, 2))
        const bar = (/** @type {number} */ c) => ({
          value: pct(c) + '%',
          html: '<div style="height:10px;border-radius:2px;width:' + round((c / peak) * 100, 1) + '%;background:' + tint('accent', 70) + '"></div>'
        })
        let running = 0
        /** @type {unknown[][]} */
        const out = shown.map(([v, c]) => {
          running += c
          return [v, c, pct(c), round((running / total) * 100, 2), bar(c)]
        })
        const rest = list.length - shown.length
        /** @type {number[]} */
        const bottom = []
        if (rest > 0) {
          const c = total - running
          bottom.push(out.length)
          out.push([{ value: 'Other (' + rest.toLocaleString() + ' values)', class: 'fmt-muted' }, c, pct(c), 100, bar(c)])
        }
        bottom.push(out.length)
        out.push(['Total (' + list.length.toLocaleString() + ' distinct)', total, 100, null, ''])
        ctx.log('Frequencies of ' + cols[ci].name + ': ' + list.length.toLocaleString() + ' distinct values over ' + total.toLocaleString() + ' rows' + (skipNulls && nulls ? ', ' + nulls.toLocaleString() + ' NULLs skipped' : '') + '.')
        const name = OWN.has(cols[ci].name) ? cols[ci].name + ' (result)' : cols[ci].name
        // The value column is text: the Other and Total lines share it, and a chart after a pipe takes it for the categories.
        const columns = [{ name, type: 'text' }, { name: 'count', type: 'integer' }, { name: 'percent', type: 'numeric' }, { name: 'cumulative %', type: 'numeric' }, { name: 'bar', type: 'text' }]
        return { columns, rows: out, frozenRows: { bottom }, frozenColumns: { start: [name] } }
      }
    }
  ]
}
