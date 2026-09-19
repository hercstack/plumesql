// @ts-check
// @description Pearson or Spearman correlation between numeric columns, as a coloured matrix or a ranked list of pairs, in the grid
// @color violet
import { loadRows, topOf, colIndexes, isNumericCol, ask, num, round, pearson, spearman, ranks, tint } from '$ext/stats-core/stats-core.plumesql.js'

const MAX_COLUMNS = 30
const strength = (/** @type {number} */ r) => { const a = Math.abs(r); return a >= 0.7 ? 'strong' : a >= 0.3 ? 'moderate' : 'weak' }
// Blue for positive, red for negative, the stronger the deeper: a theme token, so every theme repaints it.
const paint = (/** @type {number|null} */ r, /** @type {number} */ n) =>
  r == null ? null : { value: round(r, 3), style: 'background:' + tint(r >= 0 ? 'accent' : 'red', Math.abs(r) * 60), title: 'r = ' + round(r, 3) + ', n = ' + n.toLocaleString() }

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Correlation',
      inputs: [
        { key: 'columns', kind: 'multi-column', label: 'Columns', types: ['numeric'], default: '', description: 'Numeric columns to correlate, as a comma list; blank takes every numeric column (up to 30)' },
        { key: 'method', kind: 'choice', label: 'Method', options: ['pearson', 'spearman'], default: 'pearson', description: 'pearson measures a straight line; spearman any steady rise or fall, by ranks' },
        { key: 'output', kind: 'choice', label: 'Output', options: ['matrix', 'pairs'], default: 'matrix', description: 'matrix is every column against every other; pairs is one row per pair, strongest first' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        let picked = colIndexes(cols, inputs.columns)
        if (!picked.length) picked = cols.map((c, i) => (isNumericCol(c) ? i : -1)).filter((i) => i >= 0)
        if (picked.length > MAX_COLUMNS) { ctx.log('Only the first ' + MAX_COLUMNS + ' of ' + picked.length + ' columns are correlated.'); picked = picked.slice(0, MAX_COLUMNS) }
        if (picked.length < 2) return ask('Pick two or more numeric Columns (the sliders button in the header)')
        const rows = await loadRows(data, ctx, topOf(inputs))
        const spear = inputs.method === 'spearman'
        const vals = picked.map((ci) => rows.map((r) => num(r[ci])))
        const complete = vals.map((v) => v.every((x) => x != null))
        // A column with no nulls is ranked once for every pair it takes part in.
        const fullRanks = vals.map((v, i) => (spear && complete[i] ? ranks(/** @type {number[]} */ (v)) : null))
        const names = picked.map((ci) => cols[ci].name)
        /** @type {{a:number,b:number,r:number|null,n:number}[]} */
        const pairs = []
        for (let a = 0; a < picked.length; a++) {
          for (let b = a + 1; b < picked.length; b++) {
            let r = null, n = rows.length
            const ra = fullRanks[a], rb = fullRanks[b]
            if (ra && rb) r = pearson(ra, rb)
            else {
              // Pairwise complete: a row counts for this pair when both of its values are there.
              /** @type {number[]} */
              const xs = [], ys = []
              for (let i = 0; i < rows.length; i++) { const x = vals[a][i], y = vals[b][i]; if (x != null && y != null) { xs.push(x); ys.push(y) } }
              n = xs.length
              r = spear ? spearman(xs, ys) : pearson(xs, ys)
            }
            pairs.push({ a, b, r, n })
          }
        }
        ctx.log((spear ? 'Spearman' : 'Pearson') + ' correlation over ' + rows.length.toLocaleString() + ' rows, ' + picked.length + ' columns.')
        if (inputs.output === 'pairs') {
          pairs.sort((p, q) => (q.r == null ? -1 : Math.abs(q.r)) - (p.r == null ? -1 : Math.abs(p.r)))
          return {
            columns: [{ name: 'a', type: 'text' }, { name: 'b', type: 'text' }, { name: 'r', type: 'numeric' }, { name: 'n', type: 'numeric' }, { name: 'strength', type: 'text' }],
            rows: pairs.map((p) => [names[p.a], names[p.b], paint(p.r, p.n), p.n, p.r == null ? null : strength(p.r)])
          }
        }
        /** @type {Map<string, {r:number|null,n:number}>} */
        const at = new Map()
        for (const p of pairs) { at.set(p.a + ',' + p.b, p); at.set(p.b + ',' + p.a, p) }
        const out = names.map((name, a) => [name, ...names.map((_, b) => {
          if (a === b) return paint(1, vals[a].filter((x) => x != null).length)
          const p = /** @type {{r:number|null,n:number}} */ (at.get(a + ',' + b))
          return paint(p.r, p.n)
        })])
        // A result column called "column" would clash with the key column's header.
        const head = names.includes('column') ? 'column ↓' : 'column'
        return { columns: [{ name: head, type: 'text' }, ...names.map((name) => ({ name, type: 'numeric' }))], rows: out, frozenColumns: { start: [head] } }
      }
    }
  ]
}
