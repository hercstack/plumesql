// @ts-check
// @description Groups the whole result by one or more columns, with up to three folded measures and a total row, in the grid
// @color violet
import { loadRows, topOf, colIndex, colIndexes, ask, num, round, keyOf, fold, FOLDS } from '$ext/stats-core/stats-core.plumesql.js'

const MAX_GROUPS = 100000
// Small values keep their digits: a mean of 0.0042 must not round to 0.
const tidy = (/** @type {number|null} */ v) => (v == null ? null : round(v, Math.abs(v) < 1 ? 4 : 2))
// Group keys sort as numbers when both read as numbers (years, ids), else as text.
const cmp = (/** @type {unknown} */ a, /** @type {unknown} */ b) => {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1
  const x = num(a), y = num(b)
  return x != null && y != null ? x - y : String(a).localeCompare(String(b))
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Group by',
      inputs: [
        { key: 'by', kind: 'multi-column', label: 'Group by', default: '', description: 'Columns whose values form the groups, as a comma list' },
        { key: 'm1', kind: 'column', label: 'Measure 1', default: '', description: 'Column folded per group; without one, a count of rows' },
        { key: 'f1', kind: 'choice', label: 'Fold 1', options: FOLDS, default: 'sum' },
        { key: 'm2', kind: 'column', label: 'Measure 2', default: '', description: 'A second folded column; blank leaves it out' },
        { key: 'f2', kind: 'choice', label: 'Fold 2', options: FOLDS, default: 'mean' },
        { key: 'm3', kind: 'column', label: 'Measure 3', default: '', description: 'A third folded column; blank leaves it out' },
        { key: 'f3', kind: 'choice', label: 'Fold 3', options: FOLDS, default: 'max' },
        { key: 'order', kind: 'choice', label: 'Order', options: ['by first measure', 'by group', 'as seen'], default: 'by first measure', description: 'by first measure sorts largest first; by group sorts the keys; as seen keeps the order of the result' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const by = colIndexes(cols, inputs.by)
        if (!by.length) return ask('Pick the Group by columns (the sliders button in the header)')
        const rows = await loadRows(data, ctx, topOf(inputs))
        // Measure 1 always exists (a row count without a column); 2 and 3 only when picked.
        const measures = [1, 2, 3].map((k) => ({ ci: colIndex(cols, inputs['m' + k]), agg: inputs['f' + k] || 'sum', k }))
          .filter((m) => m.k === 1 || m.ci >= 0)
          .map((m) => ({ ...m, agg: m.ci < 0 ? 'count' : FOLDS.includes(m.agg) ? m.agg : 'sum' }))
        const nameOf = (/** @type {{ci:number,agg:string}} */ m) => (m.ci < 0 ? 'rows' : m.agg + ' of ' + cols[m.ci].name)
        // count over a column counts its values, not its nulls (SQL's count(col)).
        const valueOf = (/** @type {{ci:number,agg:string}} */ m, /** @type {unknown[]} */ vs) =>
          m.ci < 0 ? vs.length : m.agg === 'count' ? vs.filter((v) => v != null && v !== '').length : fold(m.agg, vs)
        /** @type {Map<string, {keys: unknown[], vals: unknown[][]}>} */
        const groups = new Map()
        /** @type {unknown[][]} */
        const all = measures.map(() => [])
        let dropped = 0
        for (const r of rows) {
          const vs = measures.map((m) => (m.ci < 0 ? 1 : r[m.ci]))
          for (let m = 0; m < vs.length; m++) all[m].push(vs[m])
          const key = by.map((i) => keyOf(r[i])).join('\u0000')
          let g = groups.get(key)
          if (!g) {
            if (groups.size >= MAX_GROUPS) { dropped++; continue }
            g = { keys: by.map((i) => r[i]), vals: measures.map(() => []) }
            groups.set(key, g)
          }
          for (let m = 0; m < vs.length; m++) g.vals[m].push(vs[m])
        }
        const list = Array.from(groups.values()).map((g) => ({ keys: g.keys, out: measures.map((m, i) => tidy(/** @type {number|null} */ (valueOf(m, g.vals[i])))) }))
        if (inputs.order === 'by group') list.sort((a, b) => { for (let i = 0; i < by.length; i++) { const c = cmp(a.keys[i], b.keys[i]); if (c) return c } return 0 })
        else if (inputs.order !== 'as seen') list.sort((a, b) => (b.out[0] ?? -Infinity) - (a.out[0] ?? -Infinity))
        const columns = [...by.map((i) => ({ name: cols[i].name, type: cols[i].type })), ...measures.map((m) => ({ name: nameOf(m), type: 'numeric' }))]
        /** @type {unknown[][]} */
        const out = list.map((g) => [...g.keys, ...g.out])
        out.push(['Total', ...by.slice(1).map(() => null), ...measures.map((m, i) => tidy(/** @type {number|null} */ (valueOf(m, all[i]))))])
        if (dropped) ctx.log(dropped.toLocaleString() + ' rows fell outside the first ' + MAX_GROUPS.toLocaleString() + ' groups and were left out of the groups (the Total counts them); filter in SQL to choose.')
        return { columns, rows: out, frozenRows: { bottom: [out.length - 1] }, frozenColumns: { start: by.map((i) => cols[i].name) } }
      }
    }
  ]
}
