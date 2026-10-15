// @ts-check
// @description Embeddings in 3D: a vector column projected on its three principal axes, a point per row, coloured by a category; click a point for its nearest neighbours (three.js)
// @color purple
import { createStage, loadRows, colIndex, num, fmtTick, message, esc, rgb01, rampRgb01, makePoints, pointPicker, pointMarker, axesBox } from '$ext/three-core/three-core.plumesql.js'

// The categories a colour column shows by name; the rest share one colour.
const MAX_CATS = 12
// The cube the bulk of the cloud fills: [-HALF, HALF] on every axis.
const HALF = 5

/** @type {any} */
let stage = null

// ─── Vectors ─────────────────────────────────────────────────────────────────
// A cell as numbers: pgvector's vector and halfvec ('[1,2,3]'), its sparsevec
// ('{1:0.5,3:2}/10', its indexes from 1), a float array ('{1,2,3}'), a JSON
// array, or an array the result already holds. Null when it reads as none.
/** @returns {number[] | null} */
const parseVector = (/** @type {unknown} */ cell) => {
  if (cell == null) return null
  if (Array.isArray(cell)) return cell.map(Number)
  const t = String(cell).trim()
  const sparse = /^\{([^}]*)\}\/(\d+)$/.exec(t)
  if (sparse) {
    const out = new Array(Number(sparse[2])).fill(0)
    for (const part of sparse[1].split(',')) {
      const [i, v] = part.split(':')
      const k = Number(i) - 1
      if (k >= 0 && k < out.length) out[k] = Number(v)
    }
    return out
  }
  const m = /^[[{]([\s\S]*)[\]}]$/.exec(t)
  if (!m || !m[1].trim()) return null
  const out = m[1].split(',').map(Number)
  return out.every(Number.isFinite) ? out : null
}

// ─── PCA ─────────────────────────────────────────────────────────────────────
// The three principal axes of the rows of X (n rows of d numbers): the rows
// centred, a block power iteration on X^T X for the leading subspace, then a
// Rayleigh-Ritz step that turns it to the axes themselves, largest variance
// first. Answers the rows' coordinates on them and the share of the whole
// variance each keeps. Self-contained: it runs in a worker as its source.
/** @returns {{ proj: Float32Array, explained: number[] }} */
function pca3(/** @type {ArrayBuffer} */ buf, /** @type {number} */ n, /** @type {number} */ d, /** @type {number} */ iters) {
  const X = new Float32Array(buf)
  const mean = new Float64Array(d)
  for (let i = 0; i < n; i++) { const o = i * d; for (let j = 0; j < d; j++) mean[j] += X[o + j] }
  for (let j = 0; j < d; j++) mean[j] /= n
  let total = 0
  for (let i = 0; i < n; i++) { const o = i * d; for (let j = 0; j < d; j++) { const v = X[o + j] - mean[j]; X[o + j] = v; total += v * v } }
  const k = 3
  let seed = 12345
  const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5 }
  const orth = (/** @type {Float64Array[]} */ V) => {
    for (let a = 0; a < V.length; a++) {
      for (let b = 0; b < a; b++) { let dot = 0; for (let j = 0; j < d; j++) dot += V[a][j] * V[b][j]; for (let j = 0; j < d; j++) V[a][j] -= dot * V[b][j] }
      let nn = 0
      for (let j = 0; j < d; j++) nn += V[a][j] * V[a][j]
      nn = Math.sqrt(nn) || 1
      for (let j = 0; j < d; j++) V[a][j] /= nn
    }
  }
  let Q = [new Float64Array(d), new Float64Array(d), new Float64Array(d)]
  for (const q of Q) for (let j = 0; j < d; j++) q[j] = rand()
  orth(Q)
  const Y = [new Float64Array(n), new Float64Array(n), new Float64Array(n)]
  const project = () => {
    for (let i = 0; i < n; i++) {
      const o = i * d
      let s0 = 0, s1 = 0, s2 = 0
      for (let j = 0; j < d; j++) { const x = X[o + j]; s0 += x * Q[0][j]; s1 += x * Q[1][j]; s2 += x * Q[2][j] }
      Y[0][i] = s0; Y[1][i] = s1; Y[2][i] = s2
    }
  }
  for (let it = 0; it < iters; it++) {
    project()
    const Z = [new Float64Array(d), new Float64Array(d), new Float64Array(d)]
    for (let i = 0; i < n; i++) {
      const o = i * d, y0 = Y[0][i], y1 = Y[1][i], y2 = Y[2][i]
      for (let j = 0; j < d; j++) { const x = X[o + j]; Z[0][j] += x * y0; Z[1][j] += x * y1; Z[2][j] += x * y2 }
    }
    orth(Z)
    Q = Z
  }
  project()
  // B = (XQ)^T (XQ), 3 x 3 and symmetric: Jacobi turns it diagonal.
  const B = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) { let s = 0; for (let i = 0; i < n; i++) s += Y[a][i] * Y[b][i]; B[a][b] = s }
  const W = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  for (let sweep = 0; sweep < 30; sweep++) {
    let off = 0
    for (let p = 0; p < k; p++) for (let q = p + 1; q < k; q++) off += B[p][q] * B[p][q]
    if (off < 1e-18) break
    for (let p = 0; p < k; p++) {
      for (let q = p + 1; q < k; q++) {
        if (Math.abs(B[p][q]) < 1e-30) continue
        const theta = (B[q][q] - B[p][p]) / (2 * B[p][q])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1), s = t * c
        for (let r = 0; r < k; r++) { const bp = B[r][p], bq = B[r][q]; B[r][p] = c * bp - s * bq; B[r][q] = s * bp + c * bq }
        for (let r = 0; r < k; r++) { const bp = B[p][r], bq = B[q][r]; B[p][r] = c * bp - s * bq; B[q][r] = s * bp + c * bq }
        for (let r = 0; r < k; r++) { const wp = W[r][p], wq = W[r][q]; W[r][p] = c * wp - s * wq; W[r][q] = s * wp + c * wq }
      }
    }
  }
  const order = [0, 1, 2].sort((a, b) => B[b][b] - B[a][a])
  const proj = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      const col = order[a]
      proj[i * 3 + a] = Y[0][i] * W[0][col] + Y[1][i] * W[1][col] + Y[2][i] * W[2][col]
    }
  }
  return { proj, explained: order.map((c) => (total > 0 ? Math.max(0, B[c][c]) / total : 0)) }
}

// The projection off the page's thread: a worker made from the function's
// own source, so a large result keeps the app answering while it works.
// Where no worker can be made, it runs here.
const runPca = (/** @type {Float32Array} */ X, /** @type {number} */ n, /** @type {number} */ d, /** @type {number} */ iters) =>
  new Promise((resolve) => {
    const inline = () => setTimeout(() => resolve(pca3(X.slice().buffer, n, d, iters)), 20)
    try {
      const src = 'const pca3 = ' + pca3.toString() + ';\nself.onmessage = (e) => { const r = pca3(e.data.buf, e.data.n, e.data.d, e.data.iters); self.postMessage(r, [r.proj.buffer]) }'
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))
      const w = new Worker(url)
      w.onmessage = (e) => { resolve(e.data); w.terminate(); URL.revokeObjectURL(url) }
      w.onerror = (e) => { e.preventDefault(); w.terminate(); URL.revokeObjectURL(url); inline() }
      const copy = X.slice()
      w.postMessage({ buf: copy.buffer, n, d, iters }, [copy.buffer])
    } catch {
      inline()
    }
  })

// A cell as the tooltip shows it.
const show = (/** @type {unknown} */ v) => (v == null ? 'NULL' : String(v))

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Vector Space',
      // The left button orbits and the right button pans, so the app's view
      // menu stays on the header's dots button.
      contextMenu: false,
      inputs: [
        { key: 'vector', kind: 'column', label: 'Vector', description: 'The embeddings: a vector, halfvec or sparsevec column (pgvector), or an array of numbers' },
        { key: 'color', kind: 'column', label: 'Colour by', default: '', description: 'A category (a colour each, the most frequent first) or a number (a ramp); none paints every point alike' },
        { key: 'label', kind: 'column', label: 'Label', default: '', description: 'What a point is called in its tooltip and among the neighbours: a title, the start of a text' },
        { key: 'neighbours', kind: 'number', label: 'Neighbours', default: '5', description: 'How many nearest neighbours (cosine, in the full vectors) a click on a point shows' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '3000', description: 'How many rows the view reads from the result, from the first one; the projection takes longer the more there are' }
      ],
      actions: [
        { label: 'Reset camera', icon: 'reset', run: () => { if (stage) { stage.spin(false); stage.reset() } } },
        { label: 'Spin', run: () => { if (stage) stage.spin() } }
      ],
      render: async (root, data, ctx) => {
        if (stage) stage.dispose()
        stage = null
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const vi = colIndex(cols, inputs.vector), ci = colIndex(cols, inputs.color), li = colIndex(cols, inputs.label)
        if (vi < 0) { message(root, 'Pick the Vector column, the embeddings (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 3000))

        // The vectors: the rows whose cell reads as one, of the dimension
        // most of them have (a stray dimension is another model's).
        /** @type {(number[] | null)[]} */
        const parsed = rows.map((r) => parseVector(r[vi]))
        /** @type {Map<number, number>} */
        const dims = new Map()
        for (const v of parsed) if (v && v.length) dims.set(v.length, (dims.get(v.length) || 0) + 1)
        const d = [...dims.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
        /** @type {number[]} */
        const keep = []
        parsed.forEach((v, i) => { if (v && v.length === d) keep.push(i) })
        const n = keep.length
        if (n < 4 || d < 2) { message(root, n < 4 ? 'Fewer than four rows have a vector to project.' : 'The vectors have a single dimension: nothing to project.'); return }
        if (n < rows.length) ctx.log(`Vector Space: ${rows.length - n} of ${rows.length} rows left out, with no vector or one of another dimension than ${d}`)
        const X = new Float32Array(n * d)
        const norms = new Float32Array(n)
        keep.forEach((ri, k) => {
          const v = /** @type {number[]} */ (parsed[ri])
          let s = 0
          for (let j = 0; j < d; j++) { X[k * d + j] = v[j]; s += v[j] * v[j] }
          norms[k] = Math.sqrt(s)
        })

        message(root, `Projecting ${n.toLocaleString()} vectors of ${d} dimensions…`)
        const { proj, explained } = /** @type {{ proj: Float32Array, explained: number[] }} */ (await (d <= 3
          ? Promise.resolve({ proj: (() => { const p = new Float32Array(n * 3); for (let k = 0; k < n; k++) for (let a = 0; a < d; a++) p[k * 3 + a] = X[k * d + a]; return p })(), explained: [] })
          : runPca(X, n, d, d > 200 ? 30 : 50)))

        // The bulk of the cloud fills the box: one scale for all three axes
        // (distances keep their proportions), set by the 98th percentile of
        // the points' distance from the centre, so an outlier stands outside
        // rather than shrinking everyone else.
        const radii = new Float32Array(n)
        for (let k = 0; k < n; k++) radii[k] = Math.hypot(proj[k * 3], proj[k * 3 + 1], proj[k * 3 + 2])
        const sorted = Float32Array.from(radii).sort()
        const r98 = sorted[Math.min(n - 1, Math.floor(n * 0.98))] || 1
        const scale = HALF / r98
        const positions = new Float32Array(n * 3)
        for (let k = 0; k < n * 3; k++) positions[k] = proj[k] * scale

        const s = createStage(root, ctx)
        stage = s
        const th = s.theme

        // Colour: a category a colour each, the most frequent first, the rest
        // muted; a number along the theme's ramp.
        const colors = new Float32Array(n * 3)
        const sizes = new Float32Array(n).fill(n > 20000 ? 3 : n > 5000 ? 4 : 6)
        const numeric = ci >= 0 && /int|numeric|decimal|real|double|float|money/i.test(cols[ci].type || '')
        const catOf = new Int32Array(n).fill(-1)
        /** @type {{ name: string, color: string, count: number }[]} */
        const legend = []
        if (ci >= 0 && numeric) {
          let lo = Infinity, hi = -Infinity
          for (const ri of keep) { const v = num(rows[ri][ci]); if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v } }
          keep.forEach((ri, k) => { const v = num(rows[ri][ci]); colors.set(Number.isFinite(v) ? rampRgb01(th.ramp, (v - lo) / (hi - lo || 1)) : rgb01(th.muted), k * 3) })
          if (Number.isFinite(lo)) s.legendRamp(cols[ci].name, fmtTick(lo), fmtTick(hi), th.ramp)
        } else if (ci >= 0) {
          /** @type {Map<string, number>} */
          const freq = new Map()
          for (const ri of keep) { const key = show(rows[ri][ci]); freq.set(key, (freq.get(key) || 0) + 1) }
          const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CATS)
          /** @type {Map<string, number>} */
          const index = new Map()
          top.forEach(([name, count], i) => { index.set(name, i); legend.push({ name, color: th.series[i % th.series.length], count }) })
          const rest = n - top.reduce((t, [, c]) => t + c, 0)
          if (rest > 0) legend.push({ name: 'other', color: th.muted, count: rest })
          keep.forEach((ri, k) => {
            const c = index.get(show(rows[ri][ci]))
            catOf[k] = c === undefined ? top.length : c
            colors.set(rgb01(c === undefined ? th.muted : th.series[c % th.series.length]), k * 3)
          })
        } else {
          const c = rgb01(th.accent)
          for (let k = 0; k < n; k++) colors.set(c, k * 3)
        }

        const cloud = makePoints(s, positions, colors, sizes)
        const picker = pointPicker(s, positions, sizes, cloud.hidden)
        const marker = pointMarker(s, th.fg)
        const chosen = pointMarker(s, th.accent)
        if (legend.length) {
          /** @type {Set<number>} */
          const off = new Set()
          s.legendCategories(cols[ci].name, legend, (i, shown) => {
            if (shown) off.delete(i)
            else off.add(i)
            cloud.setHidden((k) => off.has(catOf[k]))
            picker.invalidate()
          })
        }
        const pc = (/** @type {number} */ a) => 'PC' + (a + 1) + (explained[a] !== undefined ? ' · ' + (explained[a] * 100).toFixed(1) + '%' : '')
        axesBox(s, HALF, [{ name: pc(0), ticks: [] }, { name: pc(1), ticks: [] }, { name: pc(2), ticks: [] }])
        // What the picture keeps of the vectors, in its corner.
        const note = document.createElement('div')
        const kept = explained.reduce((t, v) => t + v, 0)
        note.textContent = d <= 3
          ? `${n.toLocaleString()} vectors of ${d} dimensions, as they are`
          : `${n.toLocaleString()} vectors of ${d} dimensions; the three axes keep ${(kept * 100).toFixed(1)}% of their variance`
        note.style.cssText = 'position:absolute;left:12px;bottom:10px;font:11px system-ui,sans-serif;color:' + th.muted + ';pointer-events:none;z-index:2'
        root.appendChild(note)

        // A click on a point: its nearest neighbours by cosine similarity in
        // the FULL vectors (the projection only places them), lines from it
        // to each and a list in the corner. The click stays in the view (a
        // row selected in the grid would replace it); the list's entries,
        // the point's own name included, select their rows.
        const kNear = Math.max(0, Math.min(50, Math.floor(Number(inputs.neighbours) || 5)))
        /** @type {any} */
        let lines = null
        const panel = document.createElement('div')
        panel.style.cssText = 'position:absolute;left:12px;bottom:30px;max-width:46%;max-height:calc(100% - 60px);overflow:auto;display:none;font:11px system-ui,sans-serif;color:' + th.fg + ';background:' + th.pane + ';border:1px solid ' + th.line + ';border-radius:5px;padding:6px 8px;z-index:2'
        root.appendChild(panel)
        const nameOf = (/** @type {number} */ k) => (li >= 0 ? show(rows[keep[k]][li]) : 'row ' + (keep[k] + 1))
        const clearNear = () => {
          if (lines) { s.scene.remove(lines); lines.geometry.dispose(); lines.material.dispose(); lines = null }
          chosen.set(null)
          panel.style.display = 'none'
          s.request()
        }
        const showNear = (/** @type {number} */ k) => {
          clearNear()
          chosen.set([positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]], sizes[k] + 4)
          if (!kNear) return
          /** @type {{ k: number, sim: number }[]} */
          const best = []
          const o = k * d, nk = norms[k] || 1
          for (let m = 0; m < n; m++) {
            if (m === k || cloud.hidden[m] > 0.5) continue
            let dot = 0
            const om = m * d
            for (let j = 0; j < d; j++) dot += X[o + j] * X[om + j]
            const sim = dot / (nk * (norms[m] || 1))
            if (best.length < kNear || sim > best[best.length - 1].sim) {
              best.push({ k: m, sim })
              best.sort((a, b) => b.sim - a.sim)
              if (best.length > kNear) best.pop()
            }
          }
          const pts = []
          for (const b of best) pts.push(positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2], positions[b.k * 3], positions[b.k * 3 + 1], positions[b.k * 3 + 2])
          lines = s.segments(pts, th.accent, 0.85)
          panel.innerHTML = '<div style="display:flex;gap:8px;align-items:baseline;margin-bottom:4px"><span style="color:' + th.muted + '">Nearest to</span><b data-row="' + keep[k] + '" title="Select its row" style="cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(nameOf(k)) + '</b><span data-x style="margin-left:auto;cursor:pointer;color:' + th.muted + '" title="Close">✕</span></div>' +
            best.map((b) => '<div data-row="' + keep[b.k] + '" style="display:flex;gap:8px;cursor:pointer;line-height:17px;white-space:nowrap" title="Select its row"><span style="color:' + th.muted + ';font-variant-numeric:tabular-nums">' + b.sim.toFixed(3) + '</span><span style="overflow:hidden;text-overflow:ellipsis">' + esc(nameOf(b.k)) + '</span></div>').join('')
          panel.style.display = ''
          s.request()
        }
        panel.addEventListener('click', (e) => {
          const t = /** @type {HTMLElement} */ (e.target)
          if (t.closest('[data-x]')) { clearNear(); return }
          const row = t.closest('[data-row]')
          if (row && typeof ctx.selectRow === 'function') ctx.selectRow(Number(row.getAttribute('data-row')))
        })
        s.canvas.addEventListener('keydown', (e) => { if (e.key === 'Escape') clearNear() })

        s.controls.minDistance = 1
        s.controls.maxDistance = HALF * 12
        s.setHome([HALF * 3.0, HALF * 2.0, HALF * 3.8], [0, -HALF * 0.08, 0])

        s.onPointer({
          pick: (_x, _y, px, py) => {
            const k = picker.pick(px, py)
            return k >= 0 ? { i: k } : null
          },
          hover: (hit, px, py) => {
            if (!hit) { marker.set(null); return }
            const k = hit.i, r = rows[keep[k]]
            marker.set([positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]], sizes[k])
            /** @type {[string, string][]} */
            const tip = []
            tip.push([li >= 0 ? cols[li].name : '', nameOf(k)])
            if (ci >= 0 && ci !== li) tip.push([cols[ci].name, show(r[ci])])
            s.tip(tip, px, py)
          },
          click: (hit) => showNear(hit.i)
        })
      },
      // A settled pane resize re-projects the scene in one frame.
      resize: (root, size) => {
        if (!stage || !stage.alive || !stage.canvas.isConnected) throw new Error('no 3D scene to resize')
        stage.resize(size.width, size.height)
      }
    }
  ]
}
