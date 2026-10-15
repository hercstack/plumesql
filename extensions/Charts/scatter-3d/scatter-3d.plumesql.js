// @ts-check
// @description Three numbers at once: every row a point in 3D, a colour and a size by two more columns; orbit, spin, hover and click (three.js)
// @color purple
import { createStage, loadRows, colIndex, num, fmtTick, message, rgb01, rampRgb01, makePoints, pointPicker, pointMarker, axesBox, axisScale } from '$ext/three-core/three-core.plumesql.js'

// The categories a colour column shows by name; the rest share one colour.
const MAX_CATS = 12
// The cube the cloud lives in: [-HALF, HALF] on every axis.
const HALF = 5

/** @type {any} */
let stage = null

// A cell as the tooltip shows it: a number in full, text as it is.
const show = (/** @type {unknown} */ v) => (v == null ? 'NULL' : typeof v === 'number' ? String(Number(v.toPrecision(12))) : String(v))

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Scatter 3D',
      // The left button orbits and the right button pans, so the app's view
      // menu stays on the header's dots button.
      contextMenu: false,
      inputs: [
        { key: 'x', kind: 'column', label: 'X', types: ['numeric'], description: 'The number along the width' },
        { key: 'y', kind: 'column', label: 'Y', types: ['numeric'], description: 'The number along the height' },
        { key: 'z', kind: 'column', label: 'Z', types: ['numeric'], description: 'The number along the depth' },
        { key: 'color', kind: 'column', label: 'Colour by', default: '', description: 'A category (a colour each, the most frequent first) or a number (a ramp); none paints every point alike' },
        { key: 'size', kind: 'column', label: 'Size by', types: ['numeric'], default: '', description: 'A number the point grows with; none draws every point alike' },
        { key: 'label', kind: 'column', label: 'Label', default: '', description: 'What the tooltip names a point by: a name, a query, an id' },
        { key: 'xScale', kind: 'choice', label: 'X scale', options: ['linear', 'log'], default: 'linear', description: 'log spreads values that span orders of magnitude; it leaves out what is not positive' },
        { key: 'yScale', kind: 'choice', label: 'Y scale', options: ['linear', 'log'], default: 'linear' },
        { key: 'zScale', kind: 'choice', label: 'Z scale', options: ['linear', 'log'], default: 'linear' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '200000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
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
        const xi = colIndex(cols, inputs.x), yi = colIndex(cols, inputs.y), zi = colIndex(cols, inputs.z)
        const ci = colIndex(cols, inputs.color), si = colIndex(cols, inputs.size), li = colIndex(cols, inputs.label)
        if (xi < 0 || yi < 0 || zi < 0) { message(root, 'Pick the X, Y and Z columns, three numbers (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 200000))
        const kinds = /** @type {('linear' | 'log')[]} */ ([inputs.xScale, inputs.yScale, inputs.zScale].map((k) => (k === 'log' ? 'log' : 'linear')))

        // The axes: each a scale of its column; a row missing a number on
        // any axis (or not positive on a log one) is left out.
        const raw = [xi, yi, zi].map((c) => rows.map((r) => num(r[c])))
        const scales = raw.map((vals, a) => axisScale(vals, kinds[a], HALF))
        /** @type {number[]} */
        const keep = []
        for (let i = 0; i < rows.length; i++) {
          let ok = true
          for (let a = 0; a < 3 && ok; a++) ok = Number.isFinite(scales[a].map(raw[a][i]))
          if (ok) keep.push(i)
        }
        if (!keep.length) { message(root, 'No row has a number on all three axes' + (kinds.includes('log') ? ' (a log axis takes positive numbers only).' : '.')); return }
        if (keep.length < rows.length) ctx.log(`Scatter 3D: ${rows.length - keep.length} of ${rows.length} rows left out, missing a number on an axis` + (kinds.includes('log') ? ' or not positive on a log one' : ''))

        const s = createStage(root, ctx)
        stage = s
        const th = s.theme
        const n = keep.length
        const positions = new Float32Array(n * 3)
        const colors = new Float32Array(n * 3)
        const sizes = new Float32Array(n)
        keep.forEach((ri, k) => {
          positions[k * 3] = scales[0].map(raw[0][ri])
          positions[k * 3 + 1] = scales[1].map(raw[1][ri])
          positions[k * 3 + 2] = scales[2].map(raw[2][ri])
        })

        // Colour: a number reads along the theme's ramp, anything else a
        // colour per category, the most frequent first, the rest muted.
        const numeric = ci >= 0 && /int|numeric|decimal|real|double|float|money/i.test(cols[ci].type || '')
        /** @type {Map<string, number>} */
        const catIndex = new Map()
        /** @type {Int32Array} */
        const catOf = new Int32Array(n).fill(-1)
        /** @type {{ name: string, color: string, count: number }[]} */
        const legend = []
        if (ci >= 0 && numeric) {
          let lo = Infinity, hi = -Infinity
          for (const ri of keep) { const v = num(rows[ri][ci]); if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v } }
          keep.forEach((ri, k) => {
            const v = num(rows[ri][ci])
            const c = Number.isFinite(v) ? rampRgb01(th.ramp, (v - lo) / (hi - lo || 1)) : rgb01(th.muted)
            colors.set(c, k * 3)
          })
          if (Number.isFinite(lo)) s.legendRamp(cols[ci].name, fmtTick(lo), fmtTick(hi), th.ramp)
        } else if (ci >= 0) {
          /** @type {Map<string, number>} */
          const freq = new Map()
          for (const ri of keep) { const key = rows[ri][ci] == null ? 'NULL' : String(rows[ri][ci]); freq.set(key, (freq.get(key) || 0) + 1) }
          const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CATS)
          top.forEach(([name, count], i) => { catIndex.set(name, i); legend.push({ name, color: th.series[i % th.series.length], count }) })
          const rest = n - top.reduce((t, [, c]) => t + c, 0)
          if (rest > 0) legend.push({ name: 'other', color: th.muted, count: rest })
          keep.forEach((ri, k) => {
            const key = rows[ri][ci] == null ? 'NULL' : String(rows[ri][ci])
            const c = catIndex.get(key)
            catOf[k] = c === undefined ? top.length : c
            colors.set(rgb01(c === undefined ? th.muted : th.series[c % th.series.length]), k * 3)
          })
        } else {
          const c = rgb01(th.accent)
          for (let k = 0; k < n; k++) colors.set(c, k * 3)
        }

        // Size: 4 to 18 px by the square root of the number (an area reads
        // in proportion), never so small a pointer misses it; 5 px for every
        // point without a size column.
        if (si >= 0) {
          let hi = 0
          for (const ri of keep) { const v = num(rows[ri][si]); if (Number.isFinite(v) && v > hi) hi = v }
          keep.forEach((ri, k) => { const v = num(rows[ri][si]); sizes[k] = Number.isFinite(v) && v > 0 && hi > 0 ? 4 + 14 * Math.sqrt(v / hi) : 4 })
        } else sizes.fill(n > 50000 ? 3 : 5)

        const cloud = makePoints(s, positions, colors, sizes, { opacity: n > 20000 ? 0.8 : 0.92 })
        const picker = pointPicker(s, positions, sizes, cloud.hidden)
        const marker = pointMarker(s, th.fg)
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
        const names = [xi, yi, zi].map((c, a) => cols[c].name + (kinds[a] === 'log' ? ' (log)' : ''))
        axesBox(s, HALF, [
          { name: names[0], ticks: scales[0].ticks },
          { name: names[1], ticks: scales[1].ticks },
          { name: names[2], ticks: scales[2].ticks }
        ])
        s.controls.minDistance = 1
        s.controls.maxDistance = HALF * 12
        // Far enough for the whole box and its axis names at the view's
        // usual wide and low shape.
        s.setHome([HALF * 3.0, HALF * 2.0, HALF * 3.8], [0, -HALF * 0.08, 0])

        // Hover names the point and its numbers; a click selects its row.
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
            const lines = []
            if (li >= 0) lines.push([cols[li].name, show(r[li])])
            for (const c of [xi, yi, zi]) lines.push([cols[c].name, show(r[c])])
            if (ci >= 0) lines.push([cols[ci].name, show(r[ci])])
            if (si >= 0 && si !== xi && si !== yi && si !== zi) lines.push([cols[si].name, show(r[si])])
            s.tip(lines, px, py)
          },
          click: (hit) => { if (typeof ctx.selectRow === 'function') ctx.selectRow(keep[hit.i]) }
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
