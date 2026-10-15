// @ts-check
// @description Bars in 3D: a category along the width, another along the depth, a number as the height; orbit, zoom and pan with the mouse (three.js)
// @color purple
import { THREE, createStage, loadRows, colIndex, colorRamp, fmtTick, ticks, num, csvCell, message } from '$ext/three-core/three-core.plumesql.js'

const MAX_CATS = 80

// The stage of the last draw (three-core): a new draw disposes it first, so
// no WebGL context is left behind; resize and the header actions reach it.
/** @type {any} */
let stage = null
let csv = ''

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: '3D Bars',
      // The left button orbits and the right button pans, so the app's view
      // menu stays on the header's dots button.
      contextMenu: false,
      inputs: [
        { key: 'x', kind: 'column', label: 'X (categories)', description: 'One bar per distinct value, along the width' },
        { key: 'z', kind: 'column', label: 'Depth (categories)', default: '', description: 'A second category along the depth; none draws a single row of bars' },
        { key: 'value', kind: 'column', label: 'Height', types: ['numeric'], default: '', description: 'The number each bar stands for; count needs none' },
        { key: 'agg', kind: 'choice', label: 'Combine', options: ['sum', 'avg', 'min', 'max', 'count'], default: 'sum', description: 'How the rows that share one X and depth make one bar' },
        { key: 'color', kind: 'choice', label: 'Colour by', options: ['height', 'depth', 'x'], default: 'height' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '100000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      actions: [
        { label: 'Reset camera', icon: 'reset', run: () => { if (stage) stage.reset() } },
        { label: 'Copy the chart data (CSV)', icon: 'copy', run: (ctx) => ctx.copy(csv) }
      ],
      render: async (root, data, ctx) => {
        if (stage) stage.dispose()
        stage = null
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const xi = colIndex(cols, inputs.x), zi = colIndex(cols, inputs.z), vi = colIndex(cols, inputs.value)
        const agg = inputs.agg || 'sum'
        if (xi < 0) { message(root, 'Pick an X column (the sliders button in the header).'); return }
        if (vi < 0 && agg !== 'count') { message(root, 'Pick a numeric Height column, or Combine by count (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 100000))

        // The grid of bars: categories in the order they first appear (an
        // ORDER BY in the query orders the axes), at most MAX_CATS per axis.
        const label = (v) => (v == null ? 'NULL' : String(v))
        /** @type {Map<string, number>} */
        const xCats = new Map()
        /** @type {Map<string, number>} */
        const zCats = new Map()
        /** @type {Map<number, { sum: number, n: number, min: number, max: number, rows: number, first: number }>} */
        const cells = new Map()
        let dropped = 0
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i]
          const xk = label(r[xi]), zk = zi >= 0 ? label(r[zi]) : ''
          let x = xCats.get(xk), z = zCats.get(zk)
          if (x === undefined) { if (xCats.size >= MAX_CATS) { dropped++; continue } x = xCats.size; xCats.set(xk, x) }
          if (z === undefined) { if (zCats.size >= MAX_CATS) { dropped++; continue } z = zCats.size; zCats.set(zk, z) }
          const key = z * MAX_CATS + x
          let c = cells.get(key)
          if (!c) { c = { sum: 0, n: 0, min: Infinity, max: -Infinity, rows: 0, first: i }; cells.set(key, c) }
          c.rows++
          const v = vi >= 0 ? num(r[vi]) : NaN
          if (Number.isFinite(v)) { c.sum += v; c.n++; if (v < c.min) c.min = v; if (v > c.max) c.max = v }
        }
        if (dropped) ctx.log(`3D Bars: ${dropped} rows left out, past the first ${MAX_CATS} categories of an axis`)
        const valueOf = (c) => (agg === 'count' ? c.rows : c.n === 0 ? NaN : agg === 'avg' ? c.sum / c.n : agg === 'min' ? c.min : agg === 'max' ? c.max : c.sum)
        const xNames = [...xCats.keys()], zNames = [...zCats.keys()]
        /** @type {{ x: number, z: number, v: number, rows: number, first: number }[]} */
        const bars = []
        let lo = 0, hi = 0
        for (const [key, c] of cells) {
          const v = valueOf(c)
          if (!Number.isFinite(v)) continue
          bars.push({ x: key % MAX_CATS, z: Math.floor(key / MAX_CATS), v, rows: c.rows, first: c.first })
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
        if (!bars.length) { message(root, 'No numeric values to draw.'); return }
        const vName = agg === 'count' ? 'count' : agg + '(' + cols[vi].name + ')'
        csv = [[cols[xi].name, ...(zi >= 0 ? [cols[zi].name] : []), vName, 'rows'].map(csvCell).join(',')]
          .concat(bars.map((b) => [xNames[b.x], ...(zi >= 0 ? [zNames[b.z]] : []), b.v, b.rows].map(csvCell).join(',')))
          .join('\n')

        const s = createStage(root, ctx, { maxPolar: Math.PI * 0.495 })
        stage = s
        const th = s.theme

        // World units: one cell per category, the tallest bar about as tall
        // as the floor is wide (never below 4, so a lone bar is no needle).
        const nx = xNames.length, nz = zNames.length
        const H = Math.max(4, Math.max(nx, nz) * 0.8)
        const k = H / Math.max(hi - lo, 1e-12)

        // The floor: one cell per bar. The value axis is a post with its
        // ticks that stands on whichever floor corner is leftmost on screen
        // (moved every frame), so no orbit hides it behind the bars.
        const cx = (nx - 1) / 2, cz = (nz - 1) / 2
        const gx0 = -cx - 0.5, gx1 = cx + 0.5, gz0 = -cz - 0.5, gz1 = cz + 0.5
        const floor = []
        for (let i = 0; i <= nx; i++) floor.push(gx0 + i, 0, gz0, gx0 + i, 0, gz1)
        for (let j = 0; j <= nz; j++) floor.push(gx0, 0, gz0 + j, gx1, 0, gz0 + j)
        s.segments(floor, th.line)
        const tickVals = ticks(lo, hi, 5)
        const postPts = [0, lo * k, 0, 0, hi * k, 0]
        for (const t of tickVals) postPts.push(0, t * k, 0, 0.25, t * k, 0) // along local +x, turned outward with the post
        const post = s.segments(postPts, th.muted)
        const corners = [[gx0, gz0], [gx1, gz0], [gx1, gz1], [gx0, gz1]].map(([x, z]) => new THREE.Vector3(x, 0, z))

        // One instanced box for every bar: a single draw call, so thousands
        // of bars orbit at full frame rate.
        const box = new THREE.BoxGeometry(0.72, 1, 0.72)
        box.translate(0, 0.5, 0)
        const mesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 }), bars.length)
        const colorMode = inputs.color || 'height'
        const base = bars.map((b, i) => {
          const c = colorMode === 'depth' && zi >= 0 ? new THREE.Color(th.series[b.z % th.series.length])
            : colorMode !== 'height' ? new THREE.Color(th.series[b.x % th.series.length])
            : colorRamp(th.ramp, (b.v - lo) / (hi - lo || 1))
          mesh.setColorAt(i, c)
          return c
        })
        const m4 = new THREE.Matrix4()
        const place = (grow) => {
          bars.forEach((b, i) => {
            const h = Math.max(Math.abs(b.v) * k * grow, 1e-4)
            m4.makeScale(1, h, 1).setPosition(b.x - cx, b.v < 0 ? -h : 0, b.z - cz)
            mesh.setMatrixAt(i, m4)
          })
          mesh.instanceMatrix.needsUpdate = true
          mesh.computeBoundingSphere()
        }
        s.scene.add(mesh)

        // The axis labels: the categories along the floor's edges, the
        // value's ticks and name riding the post.
        const every = (n) => Math.max(1, Math.ceil(n / 30))
        // Each axis's names in a group of their own, its title first: where
        // the view foreshortens an axis, the names that would overlap the
        // title or one another step aside.
        s.addLabel(cols[xi].name, 0, 0, gz1 + 2.2, { color: th.fg, group: 'x' })
        if (zi >= 0) s.addLabel(cols[zi].name, gx1 + 2.2, 0, 0, { color: th.fg, group: 'z' })
        xNames.forEach((name, i) => { if (i % every(nx) === 0) s.addLabel(name, i - cx, 0, gz1 + 0.45, { group: 'x' }) })
        if (zi >= 0) zNames.forEach((name, j) => { if (j % every(nz) === 0) s.addLabel(name, gx1 + 0.45, 0, j - cz, { group: 'z' }) })
        /** @type {{ l: any, y: number, out: number }[]} */
        const onPost = []
        for (const t of tickVals) onPost.push({ l: s.addLabel(fmtTick(t), 0, 0, 0, { align: 'right' }), y: t * k, out: 0.4 })
        onPost.push({ l: s.addLabel(vName, 0, 0, 0, { color: th.fg }), y: hi * k + H * 0.08, out: 0 })
        const v3 = new THREE.Vector3()
        const outward = new THREE.Vector3()
        s.onFrame(() => {
          let best = corners[0], bx = Infinity
          for (const c of corners) { v3.copy(c).project(s.camera); if (v3.x < bx) { bx = v3.x; best = c } }
          outward.set(best.x, 0, best.z).normalize()
          post.position.copy(best)
          post.rotation.y = Math.atan2(-outward.z, outward.x)
          for (const p of onPost) p.l.at.set(best.x + outward.x * p.out, p.y, best.z + outward.z * p.out)
        })
        if (colorMode === 'height') s.legendRamp('', fmtTick(lo), fmtTick(hi), th.ramp)

        const target = [0, (lo + hi) * k / 3, 0]
        const radius = Math.max(nx, nz, H) * 1.35 + 3
        s.controls.minDistance = 1
        s.controls.maxDistance = radius * 6
        s.setHome([target[0] + radius * 0.75, target[1] + radius * 0.6, target[2] + radius * 1.05], target)

        // The bars grow out of the floor on the first draw.
        const t0 = performance.now(), GROW = 650
        const grow = () => {
          if (!s.alive) return
          const t = Math.min(1, (performance.now() - t0) / GROW)
          place(1 - Math.pow(1 - t, 3))
          s.draw()
          if (t < 1) requestAnimationFrame(grow)
        }
        grow()

        // Hover reads the bar under the pointer, a click selects its first
        // row in the grid.
        const glow = new THREE.Color(th.dark ? '#ffffff' : '#000000')
        let lit = -1
        const light = (i) => {
          if (lit >= 0 && lit !== i) mesh.setColorAt(lit, base[lit])
          if (i >= 0) mesh.setColorAt(i, base[i].clone().lerp(glow, 0.25))
          lit = i
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
        }
        s.onPointer({
          pick: (nx_, ny_, px, py, ray) => {
            const hit = ray.intersectObject(mesh, false)[0]
            return hit && hit.instanceId !== undefined ? { i: hit.instanceId } : null
          },
          hover: (hit, px, py) => {
            light(hit ? hit.i : -1)
            if (!hit) return
            const b = bars[hit.i]
            s.tip(
              [[cols[xi].name, xNames[b.x]]]
                .concat(zi >= 0 ? [[cols[zi].name, zNames[b.z]]] : [])
                .concat([[vName, String(Number(b.v.toPrecision(12)))]])
                .concat(b.rows > 1 ? [['rows', String(b.rows)]] : []),
              px,
              py
            )
          },
          click: (hit) => { if (typeof ctx.selectRow === 'function') ctx.selectRow(bars[hit.i].first) }
        })
      },
      // A settled pane resize re-projects the scene in one frame instead of
      // rebuilding every bar.
      resize: (root, size) => {
        if (!stage || !stage.alive || !stage.canvas.isConnected) throw new Error('no 3D scene to resize')
        stage.resize(size.width, size.height)
      }
    }
  ]
}
