// @ts-check
// @description Columns become rows and rows become columns, one column per row of the result, in the grid (hand written)
// @color orange
const short = (s, n) => { const t = String(s); return t.length > n ? t.slice(0, n - 1) + '…' : t }

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Transpose',
      inputs: [
        { key: 'names', kind: 'column', label: 'Column names from', default: '', description: 'A column whose values name the new columns (a key, a code); without one the columns are numbered' },
        { key: 'top', kind: 'number', label: 'Rows to turn', default: '60', description: 'How many rows of the result become columns, from the first one; a grid reads best under a few dozen' }
      ],
      // A wide row reads best as a column: every column of the result is a
      // row of the table, every row of the result a column of it. psql's \\x
      // for the grid, over several rows at once.
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const top = Math.max(1, Math.min(500, Number(inputs.top) || 60))
        let rows = data.rows || []
        if (top > rows.length && typeof ctx.rows === 'function') {
          try {
            const out = rows.slice()
            while (out.length < top) { const page = await ctx.rows(out.length, Math.min(200000, top - out.length)); if (!page || page.length === 0) break; for (const r of page) out.push(r) }
            rows = out
          } catch (e) { ctx.log('ctx.rows: ' + e) }
        }
        rows = rows.slice(0, top)
        const ni = cols.findIndex((c) => c.name === inputs.names)
        // The new columns: named by the chosen column's values (made unique
        // when they repeat), else numbered as the rows were.
        const seen = new Map()
        const heads = rows.map((r, i) => {
          let h = ni >= 0 && r[ni] != null && String(r[ni]).trim() !== '' ? short(String(r[ni]), 40) : 'row ' + (i + 1)
          const n = seen.get(h) || 0
          seen.set(h, n + 1)
          return n ? h + ' (' + (n + 1) + ')' : h
        })
        const columns = [{ name: 'column', type: 'text' }, { name: 'type', type: 'text' }, ...heads.map((h) => ({ name: h, type: 'text' }))]
        const out = cols.map((c, k) => [c.name, c.type, ...rows.map((r) => (r[k] == null ? null : r[k]))])
        return { columns, rows: out, frozenColumns: { start: ['column'] } }
      }
    }
  ]
}
