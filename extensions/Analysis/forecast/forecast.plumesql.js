// @ts-check
// @description Continues a time series a number of steps ahead with a 95% band, by Holt's trend or a straight line, in the grid
// @color violet
import { loadRows, topOf, colIndex, ask, num, round, parseTime, stepTime, guessUnit, holt, linearForecast, linearFit, UNITS, TEMPORAL } from '$ext/stats-core/stats-core.plumesql.js'

const tidy = (/** @type {number|null} */ v) => (v == null ? null : round(v, Math.abs(v) < 1 ? 4 : 2))
const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
// One shape for the whole column, a date or a timestamp, so the next stage of a pipeline reads one type.
const stamp = (/** @type {number} */ t, /** @type {boolean} */ clock) => {
  const d = new Date(t)
  const date = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate())
  return clock ? date + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) : date
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Forecast',
      inputs: [
        { key: 'time', kind: 'column', label: 'Time', types: ['temporal'], default: '', description: 'The date or timestamp column; blank takes the first one, or the row order when there is none' },
        { key: 'value', kind: 'column', label: 'Value', types: ['numeric'], description: 'The numeric column continued ahead' },
        { key: 'horizon', kind: 'number', label: 'Steps ahead', default: '12', description: 'How many steps the forecast runs past the last row' },
        { key: 'method', kind: 'choice', label: 'Method', options: ['holt', 'linear'], default: 'holt', description: 'holt follows a trend that may bend (double exponential smoothing); linear continues one straight line' },
        { key: 'unit', kind: 'choice', label: 'Step', options: ['auto', ...UNITS], default: 'auto', description: 'How far apart the future points are; auto reads it from the gaps in the series' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const vi = colIndex(cols, inputs.value)
        if (vi < 0) return ask('Pick the Value column (the sliders button in the header)')
        let ti = colIndex(cols, inputs.time)
        if (ti < 0) ti = cols.findIndex((c) => TEMPORAL.test(String(c.type)))
        const rows = await loadRows(data, ctx, topOf(inputs))
        const h = Math.max(1, Math.min(1000, Math.round(num(inputs.horizon) ?? 12)))
        /** @type {{t:number,y:number}[]} */
        const pts = []
        let skipped = 0
        rows.forEach((r, i) => {
          const y = num(r[vi]), t = ti < 0 ? i : parseTime(r[ti])
          if (y == null || t == null) skipped++
          else pts.push({ t, y })
        })
        if (skipped) ctx.log(skipped.toLocaleString() + ' rows without a time or a value were left out.')
        if (pts.length < 3) return ask('A forecast needs at least three rows with a time and a value')
        pts.sort((a, b) => a.t - b.t)
        const ys = pts.map((p) => p.y)
        const linear = inputs.method === 'linear'
        const fc = linear ? linearForecast(ys, h) : holt(ys, h)
        if (!fc) return ask('The series is too flat or too short to continue')
        const unit = ti < 0 ? '' : UNITS.includes(inputs.unit) ? inputs.unit : guessUnit(pts.map((p) => p.t))
        const clock = ti >= 0 && pts.some((p) => p.t % 86400000 !== 0)
        const timeOf = (/** @type {number} */ t) => (ti < 0 ? t : stamp(t, clock))
        const lastT = pts[pts.length - 1].t, lastY = ys[ys.length - 1]
        /** @type {unknown[][]} */
        const out = pts.map((p, i) => {
          const joint = i === pts.length - 1
          // The last actual row carries the forecast too, so the chart's forecast line starts where the actual one ends.
          return [timeOf(p.t), tidy(p.y), joint ? tidy(lastY) : null, joint ? tidy(lastY) : null, joint ? tidy(lastY) : null, 'actual']
        })
        const spread = 1.96 * fc.sigma
        fc.values.forEach((f, k) => {
          const band = spread * Math.sqrt(k + 1)
          out.push([timeOf(ti < 0 ? lastT + k + 1 : stepTime(lastT, unit, k + 1)), null, tidy(f), tidy(f - band), tidy(f + band), 'forecast'])
        })
        const fit = linear ? linearFit(ys.map((_, i) => i), ys) : null
        ctx.log('Forecast (' + (linear ? 'linear' : 'Holt') + ') of ' + cols[vi].name + ', ' + h + ' steps' + (unit ? ' of a ' + unit : ' of one row') + ': residual sigma ' + tidy(fc.sigma) + (fit ? ', r² ' + round(fit.r2, 3) : '') + '.')
        return {
          columns: [
            { name: 'time', type: ti < 0 ? 'numeric' : clock ? 'timestamp' : 'date' },
            { name: 'actual', type: 'numeric' }, { name: 'forecast', type: 'numeric' }, { name: 'low', type: 'numeric' }, { name: 'high', type: 'numeric' }, { name: 'kind', type: 'text' }
          ],
          rows: out
        }
      }
    }
  ]
}
