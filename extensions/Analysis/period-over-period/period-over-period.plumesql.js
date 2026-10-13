// @ts-check
// @description Each period beside the one before or the same period a year earlier: the value, the earlier one, the change and the change %
// @color violet
import { loadRows, topOf, colIndex, colIndexes, ask, fold, FOLDS, round, parseTime, truncTime, stepTime, timeText } from '$ext/stats-core/stats-core.plumesql.js'

const UNITS = ['day', 'week', 'month', 'quarter', 'year']
const MAX_PERIODS = 20000

// The period a comparison looks back to: the one before, or the same one a
// year earlier (a week 52 weeks back, so it falls on the same weekday).
const back = (/** @type {number} */ t, /** @type {string} */ unit, /** @type {string} */ compare) => {
  if (compare !== 'same period last year') return stepTime(t, unit, -1)
  const d = new Date(t)
  switch (unit) {
    case 'day': return Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate())
    case 'week': return stepTime(t, 'week', -52)
    case 'month': return stepTime(t, 'month', -12)
    case 'quarter': return stepTime(t, 'quarter', -4)
    default: return stepTime(t, 'year', -1)
  }
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Period over period',
      inputs: [
        { key: 'time', kind: 'column', label: 'Time', types: ['temporal'], description: 'The date or timestamp column the periods are cut from' },
        { key: 'unit', kind: 'choice', label: 'Period', options: UNITS, default: 'month', description: 'How long one period is; weeks start on Monday' },
        { key: 'value', kind: 'multi-column', label: 'Values', types: ['numeric'], default: '', description: 'Numeric columns folded per period, as a comma list; blank counts rows' },
        { key: 'agg', kind: 'choice', label: 'Fold', options: FOLDS, default: 'sum', description: 'How the values of one period combine' },
        { key: 'compare', kind: 'choice', label: 'Compare with', options: ['previous period', 'same period last year'], default: 'previous period', description: 'The period before, or the same period a year earlier (year over year)' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '1000000', description: 'How many rows the view reads from the result, from the first one' }
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const ti = colIndex(cols, inputs.time)
        if (ti < 0) return ask('Pick the Time column (the sliders button in the header)')
        const unit = UNITS.includes(inputs.unit) ? inputs.unit : 'month'
        const agg = FOLDS.includes(inputs.agg) ? inputs.agg : 'sum'
        const compare = inputs.compare === 'same period last year' ? 'same period last year' : 'previous period'
        const vis = colIndexes(cols, inputs.value)
        const rows = await loadRows(data, ctx, topOf(inputs))
        const names = vis.length ? vis.map((i) => cols[i].name) : ['rows']

        /** @type {Map<number, unknown[][]>} */
        const buckets = new Map()
        let lo = Infinity, hi = -Infinity, bad = 0
        for (const r of rows) {
          const t = parseTime(r[ti])
          if (t == null) { bad++; continue }
          const b = truncTime(t, unit)
          if (b < lo) lo = b
          if (b > hi) hi = b
          let cell = buckets.get(b)
          if (!cell) { cell = names.map(() => []); buckets.set(b, cell) }
          if (vis.length) vis.forEach((vi, m) => /** @type {unknown[][]} */ (cell)[m].push(r[vi]))
          else cell[0].push(1)
        }
        if (bad) ctx.log(`Period over period: ${bad} rows had no readable time in ${cols[ti].name} and were left out.`)
        if (!buckets.size) return ask('No readable times in ' + cols[ti].name)
        // A period with no rows counts as nothing for a count or a sum, and as
        // unknown for anything else (a mean of no rows is not zero).
        const empty = !vis.length || agg === 'count' || agg === 'sum' ? 0 : null
        const valueAt = (/** @type {number} */ t, /** @type {number} */ m) => {
          const cell = buckets.get(t)
          if (!cell) return t >= lo && t <= hi ? empty : null
          const v = vis.length ? fold(agg, cell[m]) : cell[0].length
          return v == null ? null : round(Number(v), 4)
        }
        /** @type {unknown[][]} */
        const out = []
        for (let t = lo; t <= hi && out.length < MAX_PERIODS; t = stepTime(t, unit)) {
          const before = back(t, unit, compare)
          /** @type {unknown[]} */
          const row = [timeText(t, unit)]
          names.forEach((_, m) => {
            const v = valueAt(t, m), p = before >= lo ? valueAt(before, m) : null
            const ch = v != null && p != null ? round(v - p, 4) : null
            const pct = v != null && p != null && p !== 0 ? round(((v - p) / Math.abs(p)) * 100, 1) : null
            row.push(v, p, ch, pct)
          })
          out.push(row)
        }
        if (out.length >= MAX_PERIODS) ctx.log(`Period over period: stopped at ${MAX_PERIODS} periods; pick a longer period.`)
        const label = (/** @type {string} */ n) => (vis.length ? agg + ' of ' + n : n)
        const earlier = compare === 'previous period' ? 'previous' : 'last year'
        return {
          columns: [{ name: unit, type: 'date' }, ...names.flatMap((n) => [
            { name: label(n), type: 'numeric' }, { name: earlier, type: 'numeric' }, { name: 'change', type: 'numeric' }, { name: 'change %', type: 'numeric' }
          ])],
          rows: out,
          frozenColumns: { start: [unit] }
        }
      }
    }
  ]
}
