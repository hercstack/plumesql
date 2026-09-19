// @ts-check
// @description Turns columns into rows: one row per kept key and melted column, a name and a value, over the whole result, in the grid
// @color violet
import { loadRows, topOf, colIndexes, isNumericCol, num, ask } from '$ext/stats-core/stats-core.plumesql.js'

const MAX_ROWS = 1000000

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Unpivot',
      inputs: [
        { key: 'keep', kind: 'multi-column', label: 'Keep', default: '', description: 'Identifier columns repeated on every output row, as a comma list' },
        { key: 'columns', kind: 'multi-column', label: 'Columns to melt', default: '', description: 'Columns turned into name and value rows; blank takes every column not kept' },
        { key: 'names', kind: 'text', label: 'Name column', default: 'name', description: 'The header of the column holding the melted column names' },
        { key: 'values', kind: 'text', label: 'Value column', default: 'value', description: 'The header of the column holding their values' },
        { key: 'skip', kind: 'choice', label: 'Skip nulls', options: ['no', 'yes'], default: 'no', description: 'yes leaves out the rows whose value is null' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const keep = colIndexes(cols, inputs.keep)
        let melt = colIndexes(cols, inputs.columns).filter((i) => !keep.includes(i))
        if (!melt.length) melt = cols.map((_, i) => i).filter((i) => !keep.includes(i))
        if (!melt.length) return ask('Every column is kept; leave at least one to melt (the sliders button in the header)')
        const rows = await loadRows(data, ctx, topOf(inputs))
        // One value column holds every melted column: numbers only when all of them are numbers.
        const numeric = melt.every((i) => isNumericCol(cols[i]))
        const skip = inputs.skip === 'yes'
        const nameHead = String(inputs.names || 'name').trim() || 'name', valueHead = String(inputs.values || 'value').trim() || 'value'
        /** @type {unknown[][]} */
        const out = []
        let left = 0
        for (const r of rows) {
          for (const i of melt) {
            const raw = r[i]
            const v = raw == null ? null : numeric ? num(raw) : typeof raw === 'object' ? JSON.stringify(raw) : String(raw)
            if (skip && v == null) continue
            if (out.length >= MAX_ROWS) { left++; continue }
            out.push([...keep.map((k) => r[k]), cols[i].name, v])
          }
        }
        if (left) ctx.log(left.toLocaleString() + ' rows past the first ' + MAX_ROWS.toLocaleString() + ' were left out; melt fewer columns or read fewer rows.')
        return {
          columns: [...keep.map((k) => ({ name: cols[k].name, type: cols[k].type })), { name: nameHead, type: 'text' }, { name: valueHead, type: numeric ? 'numeric' : 'text' }],
          rows: out,
          frozenColumns: keep.length ? { start: keep.map((k) => cols[k].name) } : undefined
        }
      }
    }
  ]
}
