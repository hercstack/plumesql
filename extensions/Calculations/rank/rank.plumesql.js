// @ts-check
// @description Adds a column ranking each row by a numeric column, over the whole result or within each group
// @color blue
import { loadRows, topOf, colIndex, num, keyOf, ask } from '$ext/stats-core/stats-core.plumesql.js'

// The grid lists 100,000 rows at most; the ranks are still computed over
// every row read.
const CAP = 100000

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Rank',
      inputs: [
        { key: 'column', kind: 'column', label: 'Column', types: ['numeric'], description: 'Numeric column the rows are ranked by' },
        { key: 'order', kind: 'choice', label: 'Order', options: ['descending', 'ascending'], default: 'descending', description: 'descending ranks the largest value 1; ascending the smallest' },
        { key: 'ties', kind: 'choice', label: 'Ties', options: ['competition', 'dense', 'average'], default: 'competition', description: 'competition: 1, 2, 2, 4; dense: 1, 2, 2, 3; average: 1, 2.5, 2.5, 4' },
        { key: 'group', kind: 'column', label: 'Group', default: '', description: 'Column whose values split the rows into groups, each ranked on its own' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const ci = colIndex(cols, inputs.column), gi = colIndex(cols, inputs.group)
        if (ci < 0) return ask('Pick the Column (the sliders button in the header)')
        const rows = await loadRows(data, ctx, topOf(inputs))
        const desc = inputs.order !== 'ascending'
        const ties = inputs.ties || 'competition'
        /** @type {Map<string, number[]>} */
        const groups = new Map()
        /** @type {(number|null)[]} */
        const values = rows.map((r) => num(r[ci]))
        values.forEach((v, i) => {
          if (v == null) return
          const k = gi >= 0 ? keyOf(rows[i][gi]) : ''
          const g = groups.get(k)
          if (g) g.push(i); else groups.set(k, [i])
        })
        /** @type {(number|null)[]} */
        const rank = new Array(rows.length).fill(null)
        for (const idx of groups.values()) {
          const v = (/** @type {number} */ i) => /** @type {number} */ (values[i])
          idx.sort((a, b) => (desc ? v(b) - v(a) : v(a) - v(b)))
          let dense = 0
          for (let i = 0; i < idx.length;) {
            let j = i
            while (j + 1 < idx.length && v(idx[j + 1]) === v(idx[i])) j++
            dense++
            const r = ties === 'dense' ? dense : ties === 'average' ? (i + j) / 2 + 1 : i + 1
            for (let k = i; k <= j; k++) rank[idx[k]] = r
            i = j + 1
          }
        }
        // The podium stands out, the way a leaderboard reads.
        const cell = (/** @type {number|null} */ r) => (r != null && r <= 3 ? { value: r, class: 'fmt-strong', align: /** @type {'right'} */ ('right') } : r)
        const out = rows.slice(0, CAP).map((r, i) => [...r.slice(0, ci + 1), cell(rank[i]), ...r.slice(ci + 1)])
        if (rows.length > CAP) ctx.log((rows.length - CAP).toLocaleString() + ' rows beyond the first ' + CAP.toLocaleString() + ' were ranked but not listed.')
        const columns = cols.map((c) => ({ name: c.name, type: c.type }))
        columns.splice(ci + 1, 0, { name: cols[ci].name + ' rank', type: 'numeric' })
        return { columns, rows: out }
      }
    }
  ]
}
