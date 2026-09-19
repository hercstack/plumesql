// @ts-check
// @description A retention table: users grouped by the period of their first event, and the share still active in each period after, as a heatmap
// @color violet
import { loadRows, topOf, colIndex, ask, num, round, keyOf, parseTime, truncTime, stepTime, timeText, tint } from '$ext/stats-core/stats-core.plumesql.js'

const DAY = 86400000
const PERIODS = ['day', 'week', 'month']
// Whole periods from one period's start to another's: a month steps by the calendar.
const between = (/** @type {number} */ from, /** @type {number} */ to, /** @type {string} */ unit) => {
  if (unit === 'month') {
    const a = new Date(from), b = new Date(to)
    return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth()
  }
  return Math.round((to - from) / (unit === 'week' ? 7 * DAY : DAY))
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Cohorts',
      inputs: [
        { key: 'user', kind: 'column', label: 'User', description: 'The column that tells one user (a customer, an account) from another' },
        { key: 'time', kind: 'column', label: 'Event time', types: ['temporal'], description: 'The date or timestamp of each event; a user\'s first one decides the cohort' },
        { key: 'period', kind: 'choice', label: 'Period', options: PERIODS, default: 'month', description: 'The length of a cohort and of each step after it (weeks start on Monday)' },
        { key: 'value', kind: 'choice', label: 'Show', options: ['percent', 'count'], default: 'percent', description: 'percent: the share of the cohort active in that period; count: how many of its users were' },
        { key: 'periods', kind: 'number', label: 'Periods', default: '12', description: 'How many periods after the first get a column' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const ui = colIndex(cols, inputs.user), ti = colIndex(cols, inputs.time)
        if (ui < 0 || ti < 0) return ask('Pick the User and Event time columns (the sliders button in the header)')
        const unit = PERIODS.includes(inputs.period) ? inputs.period : 'month'
        const counts = inputs.value === 'count'
        const maxCols = Math.max(1, Math.min(1000, Math.floor(num(inputs.periods) ?? 12) + 1))
        const rows = await loadRows(data, ctx, topOf(inputs))
        /** @type {Map<string, {first: number, seen: Set<number>}>} */
        const users = new Map()
        let skipped = 0, last = -Infinity
        for (const r of rows) {
          const t = parseTime(r[ti])
          if (r[ui] == null || t == null) { skipped++; continue }
          const p = truncTime(t, unit)
          if (p > last) last = p
          const k = keyOf(r[ui])
          const u = users.get(k)
          if (!u) users.set(k, { first: p, seen: new Set([p]) })
          else { u.seen.add(p); if (p < u.first) u.first = p }
        }
        if (skipped) ctx.log(skipped.toLocaleString() + ' rows had no user or no readable ' + cols[ti].name + ' and were left out.')
        if (!users.size) return ask('No rows with a user and a readable ' + cols[ti].name)
        /** @type {Map<number, {size: number, active: number[]}>} */
        const cohorts = new Map()
        let span = 0
        for (const u of users.values()) {
          let c = cohorts.get(u.first)
          if (!c) { c = { size: 0, active: [] }; cohorts.set(u.first, c) }
          c.size++
          for (const p of u.seen) {
            const k = between(u.first, p, unit)
            if (k >= maxCols) continue
            c.active[k] = (c.active[k] || 0) + 1
            if (k + 1 > span) span = k + 1
          }
        }
        const starts = Array.from(cohorts.keys()).sort((a, b) => a - b)
        // A cohort's later periods exist only up to the latest event in the result: past it, blank, not 0.
        const width = Math.min(maxCols, Math.max(span, between(starts[0], last, unit) + 1))
        const cell = (/** @type {number} */ active, /** @type {number} */ size, /** @type {string} */ what) => {
          const pct = size ? (active / size) * 100 : 0
          return {
            value: counts ? active : round(pct, 1),
            style: 'background:' + tint('accent', 4 + pct * 0.6),
            title: active.toLocaleString() + ' of ' + size.toLocaleString() + ' users (' + round(pct, 1) + '%) ' + what,
            align: /** @type {'right'} */ ('right')
          }
        }
        const sums = new Array(width).fill(0), sizes = new Array(width).fill(0)
        /** @type {unknown[][]} */
        const out = starts.map((start) => {
          const c = /** @type {{size: number, active: number[]}} */ (cohorts.get(start))
          const seen = between(start, last, unit)
          const line = [timeText(start, 'day'), c.size]
          for (let k = 0; k < width; k++) {
            if (k > seen) { line.push(null); continue }
            const a = c.active[k] || 0
            sums[k] += a; sizes[k] += c.size
            line.push(cell(a, c.size, 'active in ' + unit + ' ' + k + ', the ' + unit + ' of ' + timeText(stepTime(start, unit, k), 'day')))
          }
          return line
        })
        // The All line weighs each cohort by its size, over the cohorts old enough to have that period.
        out.push(['All', users.size, ...sums.map((a, k) => (sizes[k] ? cell(a, sizes[k], 'active ' + k + ' ' + unit + (k === 1 ? '' : 's') + ' after their first, over the cohorts old enough to have it') : null))])
        ctx.log('Cohorts by ' + unit + ': ' + users.size.toLocaleString() + ' users in ' + starts.length.toLocaleString() + ' cohorts, ' + width + ' periods.')
        // The cohort column is text: the All line shares it, and ISO dates still sort as they read.
        const columns = [
          { name: 'cohort', type: 'text' }, { name: 'users', type: 'integer' },
          ...Array.from({ length: width }, (_, k) => ({ name: unit + ' ' + k, type: 'numeric' }))
        ]
        return { columns, rows: out, frozenRows: { bottom: [out.length - 1] }, frozenColumns: { start: ['cohort', 'users'] } }
      }
    }
  ]
}
