// @ts-check
// @description Flags outliers of the numeric columns you pick, by IQR fences or z-score: a list of the outlying values, or the result with them coloured
// @color violet
import { loadRows, topOf, colIndexes, isNumericCol, ask, num, round, sorted, quantile, mean, stdev, tint } from '$ext/stats-core/stats-core.plumesql.js'

// The grid lists 100,000 rows at most; the fences still read every row.
const CAP = 100000
const RIGHT = /** @type {'right'} */ ('right')
const OWN = new Set(['row', 'column', 'value', 'side', 'limit', 'past limit', 'score'])
// Small numbers keep their digits: a fence of 0.0042 must not round to 0.
const tidy = (/** @type {number|null} */ v) => (v == null ? null : round(v, Math.abs(v) < 1 ? 4 : 2))

/**
 * One column's test: the limits a value must stay within, and for a value
 * outside them the side, the limit it crossed, how far past it and the score
 * (z, or IQRs past the fence), with a sentence saying why.
 * @typedef {{ side: 'high'|'low', limit: number, past: number, score: number, why: string }} Verdict
 * @param {number[]} xs the column's numbers over every row read
 * @param {string} method
 * @param {number} k the IQR multiplier
 * @param {number} z the z-score threshold
 * @returns {((x: number) => Verdict|null) | null} null when the column cannot be judged
 */
const tester = (xs, method, k, z) => {
  if (method === 'z-score') {
    const m = /** @type {number} */ (mean(xs)), sd = stdev(xs)
    if (sd == null || sd === 0) return null
    const lo = m - z * sd, hi = m + z * sd
    return (x) => {
      const s = (x - m) / sd
      if (Math.abs(s) <= z) return null
      const high = s > 0
      return {
        side: high ? 'high' : 'low', limit: high ? hi : lo, past: Math.abs(x - (high ? hi : lo)), score: s,
        why: 'z = ' + round(s, 2) + ': ' + round(Math.abs(s), 2) + ' standard deviations ' + (high ? 'above' : 'below') + ' the mean ' + tidy(m) + ' (sd ' + tidy(sd) + '), past ' + z
      }
    }
  }
  const s = sorted(xs)
  const q1 = /** @type {number} */ (quantile(s, 0.25)), q3 = /** @type {number} */ (quantile(s, 0.75))
  const iqr = q3 - q1
  const lo = q1 - k * iqr, hi = q3 + k * iqr
  return (x) => {
    if (x >= lo && x <= hi) return null
    const high = x > hi
    const limit = high ? hi : lo
    const past = Math.abs(x - limit)
    // With an IQR of 0 every value off the middle is out; the score says how far in units of 1.
    const score = iqr > 0 ? past / iqr : past
    return {
      side: high ? 'high' : 'low', limit, past, score,
      why: (high ? 'above the upper fence ' + tidy(hi) + ' (Q3 ' + tidy(q3) + ' + ' : 'below the lower fence ' + tidy(lo) + ' (Q1 ' + tidy(q1) + ' - ') +
        k + ' × IQR ' + tidy(iqr) + '), ' + (iqr > 0 ? round(score, 2) + ' IQRs past it' : tidy(past) + ' past it')
    }
  }
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Outliers',
      inputs: [
        { key: 'columns', kind: 'multi-column', label: 'Columns', types: ['numeric'], description: 'Numeric columns whose outliers are flagged, each judged on its own, as a comma list' },
        { key: 'method', kind: 'choice', label: 'Method', options: ['iqr', 'z-score'], default: 'iqr', description: 'iqr: outside the quartiles by a multiple of the interquartile range; z-score: too many standard deviations from the mean' },
        { key: 'k', kind: 'number', label: 'IQR multiplier', default: '1.5', description: 'For iqr: how many IQRs beyond the quartiles the fences stand; 1.5 is Tukey\'s, 3 flags only the far out' },
        { key: 'z', kind: 'number', label: 'Z threshold', default: '3', description: 'For z-score: a value further than this many standard deviations from the mean is an outlier' },
        { key: 'output', kind: 'choice', label: 'Output', options: ['list', 'marked'], default: 'list', description: 'list: one row per outlying value, the furthest out first; marked: the result with the outlying cells coloured' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const picked = colIndexes(cols, inputs.columns)
        const skipped = picked.filter((i) => !isNumericCol(cols[i]))
        const targets = picked.filter((i) => isNumericCol(cols[i]))
        if (skipped.length) ctx.log('Outliers reads numbers; left alone: ' + skipped.map((i) => cols[i].name).join(', '))
        if (!targets.length) return ask('Pick the numeric Columns to check (the sliders button in the header)')
        const method = inputs.method === 'z-score' ? 'z-score' : 'iqr'
        const kIn = num(inputs.k), zIn = num(inputs.z)
        const k = kIn != null && kIn >= 0 ? kIn : 1.5
        const z = zIn != null && zIn > 0 ? zIn : 3
        const rows = await loadRows(data, ctx, topOf(inputs))
        /** @type {Map<number, (x: number) => Verdict|null>} */
        const tests = new Map()
        for (const ci of targets) {
          /** @type {number[]} */
          const xs = []
          for (const r of rows) { const x = num(r[ci]); if (x != null) xs.push(x) }
          const t = xs.length >= 3 ? tester(xs, method, k, z) : null
          if (t) tests.set(ci, t)
          else ctx.log(cols[ci].name + ': too few numbers, or all the same, to judge; left alone.')
        }
        if (inputs.output === 'marked') {
          let flagged = 0
          const out = rows.slice(0, CAP).map((r) => r.map((v, ci) => {
            const t = tests.get(ci)
            const x = t ? num(v) : null
            const verdict = t && x != null ? t(x) : null
            if (!verdict) return v
            flagged++
            return { value: v, style: 'background:' + tint(verdict.side === 'high' ? 'red' : 'amber', 35), class: 'fmt-strong', title: verdict.why, align: RIGHT }
          }))
          if (rows.length > CAP) ctx.log((rows.length - CAP).toLocaleString() + ' rows beyond the first ' + CAP.toLocaleString() + ' were read for the limits but not listed.')
          ctx.log('Outliers (' + method + '): ' + flagged.toLocaleString() + ' cells coloured in the rows listed.')
          return { columns: cols.map((c) => ({ name: c.name, type: c.type })), rows: out }
        }
        /** @type {{ i: number, ci: number, x: unknown, v: Verdict }[]} */
        const found = []
        for (let i = 0; i < rows.length; i++) {
          for (const [ci, t] of tests) {
            const x = num(rows[i][ci])
            if (x == null) continue
            const v = t(x)
            if (v) found.push({ i, ci, x: rows[i][ci], v })
          }
        }
        found.sort((a, b) => Math.abs(b.v.score) - Math.abs(a.v.score) || a.i - b.i)
        const perCol = targets.filter((ci) => tests.has(ci)).map((ci) => cols[ci].name + ' ' + found.filter((f) => f.ci === ci).length.toLocaleString())
        ctx.log('Outliers (' + method + ') over ' + rows.length.toLocaleString() + ' rows: ' + perCol.join(', ') + '.')
        if (found.length > CAP) ctx.log((found.length - CAP).toLocaleString() + ' outlying values beyond the first ' + CAP.toLocaleString() + ' were not listed.')
        const scoreName = method === 'z-score' ? 'z' : 'IQRs past fence'
        const columns = [
          { name: 'row', type: 'integer' }, { name: 'column', type: 'text' }, { name: 'value', type: 'numeric' }, { name: 'side', type: 'text' },
          { name: 'limit', type: 'numeric' }, { name: 'past limit', type: 'numeric' }, { name: scoreName, type: 'numeric' },
          // The whole row follows, so the outlying record can be told apart; a result column named like one of ours says so.
          ...cols.map((c) => ({ name: OWN.has(c.name) || c.name === scoreName ? c.name + ' (result)' : c.name, type: c.type }))
        ]
        const out = found.slice(0, CAP).map((f) => [
          f.i + 1, cols[f.ci].name,
          { value: f.x, style: 'background:' + tint(f.v.side === 'high' ? 'red' : 'amber', 35), title: f.v.why, align: RIGHT },
          f.v.side, tidy(f.v.limit), tidy(f.v.past), round(f.v.score, 2),
          ...rows[f.i]
        ])
        return { columns, rows: out, frozenColumns: { start: ['row', 'column', 'value'] } }
      }
    }
  ]
}
