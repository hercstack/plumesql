// @ts-check
// @description Customers scored on recency, frequency and money spent, 1 to 5 each, and named by segment: champions, loyal, at risk, lost
// @color violet
import { loadRows, topOf, colIndex, ask, num, round, keyOf, parseTime, ranks } from '$ext/stats-core/stats-core.plumesql.js'

const DAY = 86400000
// The segments, by the recency (R) and frequency (F) scores, the usual RFM
// map; the order is the order the summary lists them in.
const SEGMENTS = ['Champions', 'Loyal customers', 'Potential loyalists', 'New customers', 'Promising', 'Needs attention', "Can't lose them", 'At risk', 'Hibernating', 'Lost']
const segmentOf = (/** @type {number} */ r, /** @type {number} */ f) =>
  r >= 4 && f >= 4 ? 'Champions'
    : r >= 4 && f === 1 ? 'New customers'
      : r >= 4 ? 'Potential loyalists'
        : r === 3 && f >= 4 ? 'Loyal customers'
          : r === 3 && f === 3 ? 'Needs attention'
            : r === 3 ? 'Promising'
              : r === 1 && f >= 4 ? "Can't lose them"
                : r <= 2 && f >= 3 ? 'At risk'
                  : r === 2 ? 'Hibernating' : 'Lost'
const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
const dayText = (/** @type {number} */ t) => { const d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) }

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'RFM',
      inputs: [
        { key: 'customer', kind: 'column', label: 'Customer', description: 'Who bought: one customer per distinct value' },
        { key: 'time', kind: 'column', label: 'Date', types: ['temporal'], description: 'When each purchase was' },
        { key: 'value', kind: 'column', label: 'Amount', types: ['numeric'], default: '', description: 'What each purchase was worth; none scores money by the number of purchases' },
        { key: 'asof', kind: 'choice', label: 'Recency counted to', options: ['the latest purchase', 'today'], default: 'the latest purchase', description: 'the latest purchase in the data (right for a sample or an old dataset), or today' },
        { key: 'output', kind: 'choice', label: 'Show', options: ['customers', 'segments'], default: 'customers', description: 'customers: one row each with scores and segment; segments: one row per segment' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '1000000', description: 'How many rows the view reads from the result, from the first one' }
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const ci = colIndex(cols, inputs.customer), ti = colIndex(cols, inputs.time), vi = colIndex(cols, inputs.value)
        if (ci < 0 || ti < 0) return ask('Pick the Customer and Date columns, and the Amount (the sliders button in the header)')
        const rows = await loadRows(data, ctx, topOf(inputs))
        /** @type {Map<string, { last: number, n: number, money: number }>} */
        const by = new Map()
        let latest = -Infinity, bad = 0
        for (const r of rows) {
          const t = parseTime(r[ti])
          if (t == null || r[ci] == null) { bad++; continue }
          const k = keyOf(r[ci])
          const v = vi >= 0 ? num(r[vi]) ?? 0 : 1
          const c = by.get(k)
          if (c) { c.n++; c.money += v; if (t > c.last) c.last = t } else by.set(k, { last: t, n: 1, money: v })
          if (t > latest) latest = t
        }
        if (bad) ctx.log(`RFM: ${bad} rows with no customer or no readable date left out.`)
        if (by.size < 5) return ask('RFM scores need five customers or more')
        const asof = inputs.asof === 'today' ? Date.now() : latest
        const list = [...by.entries()].map(([k, c]) => ({ k, ...c, rec: Math.max(0, Math.floor((asof - c.last) / DAY)) }))
        // A score is the quintile a customer falls in: 5 for the most recent,
        // the most frequent, the most spent; ties share a score.
        const quint = (/** @type {number[]} */ xs) => { const rk = ranks(xs); return rk.map((x) => Math.min(5, 1 + Math.floor(((x - 0.5) / xs.length) * 5))) }
        const R = quint(list.map((c) => -c.rec)), F = quint(list.map((c) => c.n)), M = quint(list.map((c) => c.money))
        const scored = list.map((c, i) => ({ ...c, r: R[i], f: F[i], m: M[i], seg: segmentOf(R[i], F[i]) }))
        if (inputs.output === 'segments') {
          return {
            columns: [{ name: 'segment', type: 'text' }, { name: 'customers', type: 'numeric' }, { name: 'share %', type: 'numeric' }, { name: 'mean recency days', type: 'numeric' }, { name: 'mean frequency', type: 'numeric' }, { name: vi >= 0 ? 'total ' + cols[vi].name : 'purchases', type: 'numeric' }],
            rows: SEGMENTS.map((s) => {
              const g = scored.filter((c) => c.seg === s)
              if (!g.length) return null
              const sum = (/** @type {number[]} */ xs) => xs.reduce((a, b) => a + b, 0)
              return [s, g.length, round((g.length / scored.length) * 100, 1), round(sum(g.map((c) => c.rec)) / g.length, 1), round(sum(g.map((c) => c.n)) / g.length, 2), round(sum(g.map((c) => c.money)), 2)]
            }).filter((r) => r !== null)
          }
        }
        scored.sort((a, b) => SEGMENTS.indexOf(a.seg) - SEGMENTS.indexOf(b.seg) || b.money - a.money)
        return {
          columns: [
            { name: cols[ci].name, type: cols[ci].type }, { name: 'last purchase', type: 'date' }, { name: 'recency days', type: 'numeric' },
            { name: 'frequency', type: 'numeric' }, { name: vi >= 0 ? cols[vi].name : 'purchases', type: 'numeric' },
            { name: 'r', type: 'numeric' }, { name: 'f', type: 'numeric' }, { name: 'm', type: 'numeric' }, { name: 'rfm', type: 'text' }, { name: 'segment', type: 'text' }
          ],
          rows: scored.map((c) => [c.k, dayText(c.last), c.rec, c.n, round(c.money, 2), c.r, c.f, c.m, '' + c.r + c.f + c.m, c.seg]),
          frozenColumns: { start: [cols[ci].name] }
        }
      }
    }
  ]
}
