// @ts-check
// @description Groups rows that are alike into k clusters by k-means over the numbers you pick: every row with its cluster, or a summary
// @color violet
import { loadRows, topOf, colIndexes, ask, num, round, mean, stdev, random } from '$ext/stats-core/stats-core.plumesql.js'

const MAX_K = 20, MAX_ITER = 100

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Clusters',
      inputs: [
        { key: 'series', kind: 'multi-column', label: 'Features', types: ['numeric'], description: 'The numbers rows are compared on, as a comma list: two or more read best' },
        { key: 'k', kind: 'number', label: 'Clusters', default: '4', description: 'How many groups to find, 2 to 20' },
        { key: 'scale', kind: 'choice', label: 'Scale', options: ['standardize', 'as they are'], default: 'standardize', description: 'standardize weighs every feature alike (an amount in thousands does not drown a count); as they are keeps their units' },
        { key: 'output', kind: 'choice', label: 'Show', options: ['rows', 'summary'], default: 'rows', description: 'rows: the result with a cluster column; summary: one row per cluster, its size and the mean of every feature' },
        { key: 'seed', kind: 'number', label: 'Seed', default: '1', description: 'The same seed finds the same clusters; another one tries other starting points' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '200000', description: 'How many rows the view reads from the result, from the first one' }
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const feats = colIndexes(cols, inputs.series)
        if (!feats.length) return ask('Pick the Features, the numbers rows are compared on (the sliders button in the header)')
        const k = Math.max(2, Math.min(MAX_K, Math.round(Number(inputs.k) || 4)))
        const rows = await loadRows(data, ctx, topOf({ top: inputs.top || 200000 }))
        // Rows with every feature present; the rest get no cluster.
        /** @type {number[]} */
        const idx = []
        /** @type {number[][]} */
        const raw = []
        rows.forEach((r, i) => {
          const v = feats.map((f) => num(r[f]))
          if (v.every((x) => x != null)) { idx.push(i); raw.push(/** @type {number[]} */ (v)) }
        })
        if (raw.length < k) return ask(`Only ${raw.length} rows have every feature; ${k} clusters need at least as many`)
        if (raw.length < rows.length) ctx.log(`Clusters: ${rows.length - raw.length} rows missing a feature get no cluster.`)
        const d = feats.length
        const mu = [...Array(d).keys()].map((j) => /** @type {number} */ (mean(raw.map((v) => v[j]))))
        const sd = [...Array(d).keys()].map((j) => stdev(raw.map((v) => v[j])) || 1)
        const std = inputs.scale !== 'as they are'
        const pts = raw.map((v) => v.map((x, j) => (std ? (x - mu[j]) / sd[j] : x)))
        const dist = (/** @type {number[]} */ a, /** @type {number[]} */ b) => { let s = 0; for (let j = 0; j < d; j++) { const t = a[j] - b[j]; s += t * t } return s }

        // k-means++ starting points, then Lloyd's iterations until no row moves.
        const rnd = random(Math.round(Number(inputs.seed) || 1))
        /** @type {number[][]} */
        const centres = [pts[Math.floor(rnd() * pts.length)].slice()]
        const near = pts.map((p) => dist(p, centres[0]))
        while (centres.length < k) {
          let total = 0
          for (const x of near) total += x
          let pick = rnd() * total, c = 0
          while (c < pts.length - 1 && pick > near[c]) { pick -= near[c]; c++ }
          centres.push(pts[c].slice())
          for (let i = 0; i < pts.length; i++) near[i] = Math.min(near[i], dist(pts[i], centres[centres.length - 1]))
        }
        const label = new Int32Array(pts.length).fill(-1)
        let iter = 0
        for (; iter < MAX_ITER; iter++) {
          let moved = 0
          for (let i = 0; i < pts.length; i++) {
            let best = 0, bd = Infinity
            for (let c = 0; c < k; c++) { const x = dist(pts[i], centres[c]); if (x < bd) { bd = x; best = c } }
            if (label[i] !== best) { label[i] = best; moved++ }
          }
          if (!moved) break
          const sums = centres.map(() => new Float64Array(d)), counts = new Int32Array(k)
          for (let i = 0; i < pts.length; i++) { counts[label[i]]++; for (let j = 0; j < d; j++) sums[label[i]][j] += pts[i][j] }
          for (let c = 0; c < k; c++) if (counts[c]) for (let j = 0; j < d; j++) centres[c][j] = sums[c][j] / counts[c]
        }
        // Clusters numbered from the largest, so cluster 1 is the main group.
        // The number is a name, so it is written as one ("cluster 1"): a
        // pipeline reads a column's type from its values, and a bare 1, 2, 3
        // would be charted along a ramp instead of a colour each.
        const size = new Int32Array(k)
        for (const l of label) size[l]++
        const order = [...Array(k).keys()].sort((a, b) => size[b] - size[a])
        const number = new Int32Array(k)
        order.forEach((c, n) => { number[c] = n + 1 })
        ctx.log(`Clusters: ${k} clusters over ${pts.length} rows in ${iter + 1} rounds.`)

        if (inputs.output === 'summary') {
          return {
            columns: [{ name: 'cluster', type: 'text' }, { name: 'rows', type: 'numeric' }, { name: 'share %', type: 'numeric' }, ...feats.map((f) => ({ name: 'mean ' + cols[f].name, type: 'numeric' }))],
            rows: order.map((c) => {
              const members = raw.filter((_, i) => label[i] === c)
              return ['cluster ' + number[c], members.length, round((members.length / raw.length) * 100, 1), ...feats.map((_, j) => round(/** @type {number} */ (mean(members.map((v) => v[j]))), 4))]
            })
          }
        }
        const clusterOf = new Map(idx.map((r, i) => [r, 'cluster ' + number[label[i]]]))
        return {
          columns: [...cols.map((c) => ({ name: c.name, type: c.type })), { name: 'cluster', type: 'text' }],
          rows: rows.map((r, i) => [...r, clusterOf.get(i) ?? null])
        }
      }
    }
  ]
}
