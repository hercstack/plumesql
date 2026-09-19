// @ts-check
// @description Folds rows into regular time buckets, a minute to a year, with the gaps filled, over the whole result, in the grid
// @color violet
import { loadRows, topOf, colIndex, colIndexes, ask, keyOf, fold, FOLDS, round, parseTime, truncTime, stepTime, timeText, UNITS } from '$ext/stats-core/stats-core.plumesql.js'

const MAX_BUCKETS = 100000
const MAX_GROUPS = 20
const tidy = (/** @type {number|null} */ v) => (v == null ? null : round(v, Math.abs(v) < 1 ? 4 : 2))

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Resample',
      inputs: [
        { key: 'time', kind: 'column', label: 'Time', types: ['temporal'], description: 'The date or timestamp column the buckets are cut from' },
        { key: 'unit', kind: 'choice', label: 'Bucket', options: UNITS, default: 'day', description: 'How wide one bucket is; weeks start on Monday' },
        { key: 'value', kind: 'multi-column', label: 'Values', types: ['numeric'], default: '', description: 'Numeric columns folded per bucket, as a comma list; blank counts rows' },
        { key: 'agg', kind: 'choice', label: 'Fold', options: FOLDS, default: 'sum', description: 'How the values of one bucket combine' },
        { key: 'fill', kind: 'choice', label: 'Empty buckets', options: ['zero', 'blank', 'previous'], default: 'zero', description: 'What a bucket with no rows shows: 0, nothing, or the bucket before it' },
        { key: 'group', kind: 'column', label: 'Split by', default: '', description: 'Column whose values each get a column of their own (the 20 most common), holding the first value; blank for none' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const ti = colIndex(cols, inputs.time), gi = colIndex(cols, inputs.group)
        if (ti < 0) return ask('Pick the Time column (the sliders button in the header)')
        const unit = UNITS.includes(inputs.unit) ? inputs.unit : 'day'
        const agg = FOLDS.includes(inputs.agg) ? inputs.agg : 'sum'
        const vis = colIndexes(cols, inputs.value)
        const rows = await loadRows(data, ctx, topOf(inputs))
        // A split takes the first measure alone: one column per group value is already wide.
        const measures = gi >= 0 ? vis.slice(0, 1) : vis
        const fmOf = (/** @type {unknown[]} */ vs) => (!measures.length ? vs.length : agg === 'count' ? vs.filter((v) => v != null && v !== '').length : fold(agg, vs))
        /** @type {string[]} */
        let series = []
        if (gi >= 0) {
          /** @type {Map<string, number>} */
          const freq = new Map()
          for (const r of rows) { const k = keyOf(r[gi]); freq.set(k, (freq.get(k) || 0) + 1) }
          series = Array.from(freq.keys()).sort((a, b) => /** @type {number} */ (freq.get(b)) - /** @type {number} */ (freq.get(a)))
          if (series.length > MAX_GROUPS) { ctx.log((series.length - MAX_GROUPS).toLocaleString() + ' less common values of ' + cols[gi].name + ' were left out; only the ' + MAX_GROUPS + ' most common get a column.'); series = series.slice(0, MAX_GROUPS) }
        } else series = measures.length ? measures.map((i) => agg + ' of ' + cols[i].name) : ['rows']
        const slot = new Map(series.map((s, i) => [s, i]))
        /** @type {Map<number, unknown[][]>} */
        const buckets = new Map()
        let lo = Infinity, hi = -Infinity, bad = 0
        for (const r of rows) {
          const t = parseTime(r[ti])
          if (t == null) { bad++; continue }
          const s = gi >= 0 ? slot.get(keyOf(r[gi])) : 0
          if (s == null) continue
          const b = truncTime(t, unit)
          if (b < lo) lo = b
          if (b > hi) hi = b
          let cell = buckets.get(b)
          if (!cell) { cell = series.map(() => []); buckets.set(b, cell) }
          if (gi >= 0 || !measures.length) cell[s].push(measures.length ? r[measures[0]] : 1)
          else for (let m = 0; m < measures.length; m++) cell[m].push(r[measures[m]])
        }
        if (bad) ctx.log(bad.toLocaleString() + ' rows had no readable time in ' + cols[ti].name + ' and were left out.')
        if (!buckets.size) return ask('No readable times in ' + cols[ti].name)
        const fill = inputs.fill || 'zero'
        /** @type {(number|null)[]} */
        const last = series.map(() => null)
        /** @type {unknown[][]} */
        const out = []
        let t = lo
        // Every bucket from the first to the last, the empty ones included, so a chart's x axis is regular.
        while (t <= hi) {
          if (out.length >= MAX_BUCKETS) { ctx.log('Stopped at ' + MAX_BUCKETS.toLocaleString() + ' buckets; pick a wider bucket or a shorter range.'); break }
          const cell = buckets.get(t)
          out.push([timeText(t, unit), ...series.map((_, s) => {
            const vs = cell ? cell[s] : []
            let v = vs.length ? tidy(/** @type {number|null} */ (fmOf(vs))) : fill === 'zero' ? 0 : fill === 'previous' ? last[s] : null
            if (vs.length) last[s] = v
            return v
          })])
          t = stepTime(t, unit)
        }
        return { columns: [{ name: 'bucket', type: unit === 'minute' || unit === 'hour' ? 'timestamp' : 'date' }, ...series.map((name) => ({ name, type: 'numeric' }))], rows: out, frozenColumns: { start: ['bucket'] } }
      }
    }
  ]
}
