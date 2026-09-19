// @ts-check
// @description A repeatable sample of the result's rows: random, every k-th, or the first of each group, in their original order, in the grid
// @color violet
import { loadRows, topOf, colIndex, ask, num, keyOf, random } from '$ext/stats-core/stats-core.plumesql.js'

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Sample',
      inputs: [
        { key: 'n', kind: 'number', label: 'Rows', default: '1000', description: 'How many rows the sample keeps' },
        { key: 'percent', kind: 'number', label: 'Percent', default: '', description: 'A share of the rows instead of a count; when set it wins over Rows' },
        { key: 'seed', kind: 'number', label: 'Seed', default: '42', description: 'The same seed draws the same rows; change it for another sample' },
        { key: 'method', kind: 'choice', label: 'Method', options: ['random', 'systematic', 'first-per-group'], default: 'random', description: 'random draws evenly; systematic takes every k-th row from a random start; first-per-group the first row of each group' },
        { key: 'group', kind: 'column', label: 'Group', default: '', description: 'The column whose values form the groups, for first-per-group' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const method = inputs.method || 'random'
        const gi = colIndex(cols, inputs.group)
        if (method === 'first-per-group' && gi < 0) return ask('Pick the Group column for first-per-group (the sliders button in the header)')
        const rows = await loadRows(data, ctx, topOf(inputs))
        const N = rows.length
        const pct = num(inputs.percent)
        const k = Math.max(0, Math.min(N, Math.round(pct != null ? (N * pct) / 100 : num(inputs.n) ?? 1000)))
        const rand = random(num(inputs.seed) ?? 42)
        /** @type {number[]} */
        let picked = []
        if (method === 'first-per-group') {
          const seen = new Set()
          let groups = 0
          for (let i = 0; i < N; i++) {
            const g = keyOf(rows[i][gi])
            if (seen.has(g)) continue
            seen.add(g); groups++
            if (picked.length < k) picked.push(i)
          }
          if (groups > picked.length) ctx.log('Kept the first row of ' + picked.length.toLocaleString() + ' of ' + groups.toLocaleString() + ' groups; raise Rows for more.')
        } else if (method === 'systematic') {
          const step = k ? N / k : 0
          const start = rand() * step
          for (let j = 0; j < k; j++) picked.push(Math.min(N - 1, Math.floor(start + j * step)))
        } else {
          // Reservoir sampling (Algorithm R): one pass, every row equally likely, whatever N is.
          for (let i = 0; i < N; i++) {
            if (i < k) picked.push(i)
            else { const j = Math.floor(rand() * (i + 1)); if (j < k) picked[j] = i }
          }
          picked.sort((a, b) => a - b)
        }
        ctx.log('Sample (' + method + '): ' + picked.length.toLocaleString() + ' of ' + N.toLocaleString() + ' rows.')
        return { columns: cols.map((c) => ({ name: c.name, type: c.type })), rows: picked.map((i) => rows[i]) }
      }
    }
  ]
}
