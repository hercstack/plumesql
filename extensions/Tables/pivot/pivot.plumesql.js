// @ts-check
// @description Rows by columns with a folded value and totals, over the whole result, in the grid (hand written)
// @color orange
// Plain numbers, two decimals at most: the grid aligns them by the column's
// type, and a copy into a spreadsheet parses them whatever the locale.
const fmt = (v) => (v == null ? null : Math.round(Number(v) * 100) / 100)

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Pivot',
      inputs: [
        { key: 'rows', kind: 'column', label: 'Row field', description: 'Column whose values become the rows' },
        { key: 'cols', kind: 'column', label: 'Column field', default: '', description: 'Column whose values become the columns; without one, a single total column' },
        { key: 'value', kind: 'column', label: 'Value field', types: ['numeric'], default: '', description: 'Numeric column folded into each cell; without one, a count of rows' },
        { key: 'agg', kind: 'choice', label: 'Fold', options: ['sum', 'count', 'mean', 'min', 'max'], default: 'sum', description: 'How the values of one cell combine' },
        { key: 'order', kind: 'choice', label: 'Row order', options: ['by total', 'as seen'], default: 'by total', description: 'by total sorts the rows by their total; as seen keeps the order of the result' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '1000000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      // The table lands in PlumeSQL's own grid: its Copy, filter, column
      // menus and export are the pivot's too, so no buttons of its own.
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const ri = cols.findIndex((c) => c.name === inputs.rows), ci = cols.findIndex((c) => c.name === inputs.cols), vi = cols.findIndex((c) => c.name === inputs.value)
        if (ri < 0) return { columns: [{ name: 'Pick the Row field (the sliders button in the header)', type: 'text' }], rows: [] }
        const top = Math.max(1, Number(inputs.top) || 1000000)
        let rows = data.rows || []
        if (top > rows.length && typeof ctx.rows === 'function') {
          try {
            const out = rows.slice()
            while (out.length < top) { const page = await ctx.rows(out.length, Math.min(200000, top - out.length)); if (!page || page.length === 0) break; for (const r of page) out.push(r) }
            rows = out
          } catch (e) { ctx.log('ctx.rows: ' + e) }
        }
        rows = rows.slice(0, top)
        const agg = vi < 0 ? 'count' : (inputs.agg || 'sum')
        const fold = (b) => (agg === 'count' ? b.n : agg === 'sum' ? b.sum : agg === 'mean' ? b.sum / b.n : agg === 'max' ? b.max : b.min)
        const rkeys = [], ckeys = []
        const rseen = new Set(), cseen = new Set()
        const grid = new Map()
        let skipped = 0
        for (const r of rows) {
          const v = vi < 0 ? 1 : Number(r[vi])
          if (!Number.isFinite(v)) continue
          const rk = String(r[ri] == null ? 'NULL' : r[ri]), ck = ci < 0 ? '' : String(r[ci] == null ? 'NULL' : r[ci])
          if (!rseen.has(rk)) { if (rseen.size >= 500) { skipped++; continue } rseen.add(rk); rkeys.push(rk) }
          if (!cseen.has(ck)) { if (cseen.size >= 60) { skipped++; continue } cseen.add(ck); ckeys.push(ck) }
          const key = rk + '\u0000' + ck
          let b = grid.get(key)
          if (!b) { b = { n: 0, sum: 0, min: Infinity, max: -Infinity }; grid.set(key, b) }
          b.n++; b.sum += v; if (v < b.min) b.min = v; if (v > b.max) b.max = v
        }
        const cellOf = (rk, ck) => { const b = grid.get(rk + '\u0000' + ck); return b ? fold(b) : null }
        const total = (bs) => { const t = { n: 0, sum: 0, min: Infinity, max: -Infinity }; for (const b of bs) { t.n += b.n; t.sum += b.sum; if (b.min < t.min) t.min = b.min; if (b.max > t.max) t.max = b.max } return t.n ? fold(t) : null }
        const rowTotal = (rk) => total(ckeys.map((ck) => grid.get(rk + '\u0000' + ck)).filter(Boolean))
        const colTotal = (ck) => total(rkeys.map((rk) => grid.get(rk + '\u0000' + ck)).filter(Boolean))
        const grand = total(Array.from(grid.values()))
        const ordered = inputs.order === 'as seen' ? rkeys : rkeys.slice().sort((a, b) => (rowTotal(b) || 0) - (rowTotal(a) || 0))
        // The columns in order: numerically when every key is a number (hours,
        // years, amounts), else alphabetically, never as first seen.
        if (ckeys.length > 1) {
          const allNum = ckeys.every((k) => k !== 'NULL' && k.trim() !== '' && Number.isFinite(Number(k)))
          ckeys.sort(allNum ? (a, b) => Number(a) - Number(b) : (a, b) => a.localeCompare(b))
        }
        // An empty cell is 0 for a count or a sum (nothing counted is zero)
        // and blank for a mean, a min or a max (nothing to average).
        const empty = agg === 'count' || agg === 'sum' ? 0 : null
        const cellOrEmpty = (rk, ck) => { const v = cellOf(rk, ck); return v == null ? empty : fmt(v) }
        const head = ci < 0 ? [agg === 'count' ? 'rows' : agg + ' of ' + cols[vi].name] : ckeys
        const columns = [{ name: cols[ri].name + (ci >= 0 ? ' ↓ / ' + cols[ci].name + ' →' : ''), type: 'text' }]
        for (const h of head) columns.push({ name: h, type: 'numeric' })
        if (ci >= 0) columns.push({ name: 'Total', type: 'numeric' })
        /** @type {unknown[][]} */
        const out = ordered.map((rk) => [rk, ...ckeys.map((ck) => cellOrEmpty(rk, ck)), ...(ci >= 0 ? [fmt(rowTotal(rk))] : [])])
        // The totals row closes the table, frozen at the bottom of the grid,
        // and the row-field column stays at the start while the rest scroll.
        out.push(['Total', ...ckeys.map((ck) => fmt(colTotal(ck))), ...(ci >= 0 ? [fmt(grand)] : [])])
        if (skipped) ctx.log(skipped.toLocaleString() + ' rows fell outside the first 500 row keys × 60 column keys and were left out; sort or filter in SQL to choose.')
        return { columns, rows: out, frozenRows: { bottom: [out.length - 1] }, frozenColumns: { start: [columns[0].name], ...(ci >= 0 ? { end: ['Total'] } : {}) } }
      }
    }
  ]
}
