// @ts-check
// @description Finds rows repeated on the key columns you pick, or on every column: each repeated key with its count and row numbers, or the result marked
// @color violet
import { loadRows, topOf, colIndexes, tint } from '$ext/stats-core/stats-core.plumesql.js'

// The grid lists 100,000 rows at most; the counts still read every row.
const CAP = 100000
// A repeated key lists this many row numbers; the count says how many there are.
const LIST = 50
const OWN = new Set(['count', 'rows', 'first row'])
// A cell as a key part: NULL stands apart from the text 'NULL', and two NULLs
// match each other, as GROUP BY and DISTINCT treat them.
const part = (/** @type {unknown} */ v) => (v == null ? '\u0001' : 'v' + String(v))
const rowList = (/** @type {number[]} */ at) =>
  at.slice(0, LIST).map((i) => i + 1).join(', ') + (at.length > LIST ? ', … ' + (at.length - LIST).toLocaleString() + ' more' : '')

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Duplicates',
      inputs: [
        { key: 'columns', kind: 'multi-column', label: 'Key columns', default: '', description: 'Columns whose values together make a row\'s key, as a comma list; blank compares every column' },
        { key: 'output', kind: 'choice', label: 'Output', options: ['groups', 'marked'], default: 'groups', description: 'groups: one row per repeated key, the most repeated first; marked: the result with the key cells of repeated rows coloured' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        let keys = colIndexes(cols, inputs.columns)
        if (!keys.length) keys = cols.map((_, i) => i)
        if (!keys.length) return { columns: [{ name: 'The result has no columns', type: 'text' }], rows: [] }
        const rows = await loadRows(data, ctx, topOf(inputs))
        /** @type {Map<string, number[]>} */
        const seen = new Map()
        /** @type {string[]} */
        const keyOfRow = new Array(rows.length)
        // Which occurrence of its key each row is, from 1.
        const nthOfRow = new Int32Array(rows.length)
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i]
          const key = keys.length === 1 ? part(r[keys[0]]) : keys.map((ci) => part(r[ci])).join('\u0000')
          keyOfRow[i] = key
          const at = seen.get(key)
          if (at) { at.push(i); nthOfRow[i] = at.length } else { seen.set(key, [i]); nthOfRow[i] = 1 }
        }
        const groups = Array.from(seen.values()).filter((at) => at.length > 1)
        let inGroups = 0
        for (const at of groups) inGroups += at.length
        const on = keys.length === cols.length ? 'every column' : keys.map((ci) => cols[ci].name).join(', ')
        ctx.log('Duplicates on ' + on + ': ' + groups.length.toLocaleString() + ' repeated keys over ' + inGroups.toLocaleString() + ' of ' + rows.length.toLocaleString() + ' rows, ' + (inGroups - groups.length).toLocaleString() + ' rows beyond the first of each.')
        if (inputs.output === 'marked') {
          const marked = new Set(keys)
          /** @type {Map<number[], string>} */
          const listed = new Map()
          const out = rows.slice(0, CAP).map((r, i) => {
            const at = /** @type {number[]} */ (seen.get(keyOfRow[i]))
            if (at.length < 2) return r
            // The first row of a key is lighter than its repeats: dedupe keeps the first and drops the deeper ones.
            const nth = nthOfRow[i]
            const style = 'background:' + tint('amber', nth === 1 ? 18 : 38)
            let list = listed.get(at)
            if (list == null) { list = rowList(at); listed.set(at, list) }
            const title = (nth === 1 ? 'First of ' : 'Repeat ' + nth + ' of ') + at.length + ' rows with this key: rows ' + list
            return r.map((v, ci) => (marked.has(ci) ? { value: v, style, title } : v))
          })
          if (rows.length > CAP) ctx.log((rows.length - CAP).toLocaleString() + ' rows beyond the first ' + CAP.toLocaleString() + ' were counted but not listed.')
          return { columns: cols.map((c) => ({ name: c.name, type: c.type })), rows: out }
        }
        // Most repeated first; a tie keeps the order the keys first appear in.
        groups.sort((a, b) => b.length - a.length || a[0] - b[0])
        if (groups.length > CAP) ctx.log((groups.length - CAP).toLocaleString() + ' repeated keys beyond the first ' + CAP.toLocaleString() + ' were not listed.')
        const out = groups.slice(0, CAP).map((at) => [
          ...keys.map((ci) => rows[at[0]][ci]),
          at.length,
          { value: rowList(at), title: 'Row numbers from 1, in the order of the result' },
          at[0] + 1
        ])
        const columns = [
          // A key column named like one of ours says so, so no two columns share a name.
          ...keys.map((ci) => ({ name: OWN.has(cols[ci].name) ? cols[ci].name + ' (result)' : cols[ci].name, type: cols[ci].type })),
          { name: 'count', type: 'integer' }, { name: 'rows', type: 'text' }, { name: 'first row', type: 'integer' }
        ]
        return { columns, rows: out }
      }
    }
  ]
}
