// @ts-check
// @description Every column's nulls, distinct count, range, mean and distribution, over the whole result, in the grid (hand written)
// @color orange
const num = (v) => (v == null ? null : Math.round(Number(v) * 100) / 100)
const short = (s, n) => { const t = String(s); return t.length > n ? t.slice(0, n - 1) + '…' : t }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c)
const fmt = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Profile',
      inputs: [{ key: 'top', kind: 'number', label: 'Top rows', default: '1000000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }],
      // One row per column of the result, in PlumeSQL's own grid. The
      // distribution cell is DECORATED: its value is text (what copy reads),
      // its html the histogram drawn in the grid's cell.
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const top = Math.max(1, Number(inputs.top) || 1000000)
        let rows = data.rows || []
        if (top > rows.length && typeof ctx.rows === 'function') {
          try {
            const out = rows.slice()
            while (out.length < top) { const page = await ctx.rows(out.length, Math.min(200000, top - out.length)); if (!page || page.length === 0) break; for (const r of page) out.push(r) }
            rows = out
          } catch (e) { ctx.log('ctx.rows: ' + e) }
        }
        rows = rows.slice(0, top)
        const N = rows.length
        const DISTINCT_CAP = 200000, COUNT_CAP = 20000
        const stats = cols.map((c) => ({
          col: c, numeric: /int|numeric|decimal|real|double|float|serial|money/i.test(c.type),
          nulls: 0, distinct: new Set(), capped: false, min: null, max: null, sum: 0, cnt: 0, counts: new Map(), lenMin: Infinity, lenMax: 0,
          bins: /** @type {number[] | null} */ (null)
        }))
        for (const r of rows) {
          for (let k = 0; k < stats.length; k++) {
            const s = stats[k], v = r[k]
            if (v == null) { s.nulls++; continue }
            const key = String(v)
            if (!s.capped) { s.distinct.add(key); if (s.distinct.size >= DISTINCT_CAP) s.capped = true }
            if (s.numeric) {
              const n = Number(v)
              if (Number.isFinite(n)) { s.cnt++; s.sum += n; if (s.min == null || n < s.min) s.min = n; if (s.max == null || n > s.max) s.max = n }
            } else {
              if (s.min == null || key < s.min) s.min = key
              if (s.max == null || key > s.max) s.max = key
              if (key.length < s.lenMin) s.lenMin = key.length
              if (key.length > s.lenMax) s.lenMax = key.length
              const c = s.counts.get(key)
              if (c !== undefined) s.counts.set(key, c + 1)
              else if (s.counts.size < COUNT_CAP) s.counts.set(key, 1)
            }
          }
        }
        const BINS = 24
        for (const s of stats) { if (s.numeric && s.cnt && s.max > s.min) s.bins = new Array(BINS).fill(0) }
        for (const r of rows) {
          for (let k = 0; k < stats.length; k++) {
            const s = stats[k]
            if (!s.bins) continue
            const n = Number(r[k])
            if (r[k] == null || !Number.isFinite(n)) continue
            s.bins[Math.min(BINS - 1, Math.floor(((n - s.min) / (s.max - s.min)) * BINS))]++
          }
        }
        const dark = ctx.theme !== 'light'
        const accent = dark ? '#7aa2f7' : '#5a8bf0'
        const out = stats.map((s) => {
          const nullPct = N ? Math.round((s.nulls / N) * 1000) / 10 : null
          const distinct = (s.capped ? '≥ ' : '') + s.distinct.size.toLocaleString()
          /** @type {unknown} */
          let distribution = null
          if (s.bins) {
            const peak = Math.max.apply(null, s.bins)
            const range = fmt(s.min) + ' … ' + fmt(s.max)
            distribution = {
              value: s.bins.join(' '),
              html: '<span style="display:inline-flex;align-items:flex-end;gap:1px;height:18px;vertical-align:middle">' + s.bins.map((b) => '<span style="width:4px;height:' + Math.max(1, Math.round((b / peak) * 18)) + 'px;background:' + accent + ';border-radius:1px 1px 0 0"></span>').join('') + '</span>',
              title: range + ' in ' + BINS + ' bins'
            }
          } else if (!s.numeric && s.counts.size) {
            const top4 = Array.from(s.counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4)
            const most = top4[0][1]
            distribution = {
              value: top4.map(([v, n]) => short(v, 24) + ' ×' + n.toLocaleString()).join(', '),
              html: top4.map(([v, n]) => '<span style="display:inline-flex;align-items:center;gap:4px;margin-right:8px"><span style="display:inline-block;width:' + Math.max(2, Math.round((n / most) * 28)) + 'px;height:7px;border-radius:3px;background:' + accent + '"></span>' + esc(short(v, 18)) + ' <span style="opacity:.7">×' + n.toLocaleString() + '</span></span>').join(''),
              title: top4.map(([v, n]) => v + ' ×' + n.toLocaleString()).join(', ')
            }
          }
          return [
            s.col.name,
            s.col.type,
            s.nulls,
            nullPct,
            distinct,
            s.numeric ? num(s.min) : s.min == null ? null : short(s.min, 40),
            s.numeric ? num(s.max) : s.max == null ? null : short(s.max, 40),
            s.numeric && s.cnt ? num(s.sum / s.cnt) : null,
            s.numeric ? null : s.lenMin === Infinity ? null : s.lenMin + '–' + s.lenMax,
            distribution
          ]
        })
        return {
          columns: [
            { name: 'column', type: 'text' },
            { name: 'type', type: 'text' },
            { name: 'nulls', type: 'integer' },
            { name: 'null %', type: 'numeric' },
            { name: 'distinct', type: 'text' },
            { name: 'min', type: 'text' },
            { name: 'max', type: 'text' },
            { name: 'mean', type: 'numeric' },
            { name: 'length', type: 'text' },
            { name: 'distribution', type: 'text' }
          ],
          rows: out
        }
      }
    }
  ]
}
