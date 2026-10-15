// @ts-check
// @description Fly through a result in 3D: rows as boxes packed on shelves in blocks, linked rows joined by paths with signals running along them; W A S D to fly (three.js)
// @color purple
import { THREE, createStage, loadRows, colIndex, colorRamp, fmtTick, num, message, csvCell, esc, rgb01 } from '$ext/three-core/three-core.plumesql.js'

// The shape of the world, in world units: a box with no size is 1 wide, the
// smallest and the largest a size can make, the gap between two boxes on a
// shelf, the aisle between two blocks.
const UNIT = 1, MIN_SIDE = 0.35, MAX_SIDE = 4.5
const GAP = 0.25, AISLE = 3.5
// The categories a colour shows by name, the blocks named over their roofs,
// the boxes named over their tops.
const MAX_CATS = 12, NAMED_BLOCKS = 24, NAMED_BOXES = 10
// The paths drawn, and the signals running along them (each one a packet).
const MAX_LINKS = 20000, MAX_SIGNALS = 2500, CURVE_STEPS = 12
// Flight: radians per pixel dragged, and how a key changes the speed.
const LOOK = 0.0042, FAST = 4, SLOW = 0.2

/** @type {any} */
let stage = null
let csv = ''
// What the header buttons reach in the live scene.
/** @type {{ fly: () => void, tour: () => void, signals: () => void, reset: () => void } | null} */
let api = null
/** @type {((e: MouseEvent) => void) | null} */
let onDbl = null
/** @type {WeakSet<HTMLElement>} */
const dblRoots = new WeakSet()

// A cell as the card and the tooltip show it.
const show = (/** @type {unknown} */ v) => (v == null ? 'NULL' : typeof v === 'object' ? JSON.stringify(v) : String(v))
const keyOf = (/** @type {unknown} */ v) => (v == null ? 'NULL' : String(v))

// The ids a link cell names: one value, or a PostgreSQL array ({1,2,3}) or a
// JSON array ([1,2,3]) of them.
const linkIds = (/** @type {unknown} */ v) => {
  if (v == null || v === '') return []
  if (Array.isArray(v)) return v.filter((x) => x != null).map(String)
  const s = String(v).trim()
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    return s
      .slice(1, -1)
      .split(',')
      .map((x) => x.trim().replace(/^"(.*)"$/, '$1'))
      .filter((x) => x && x !== 'NULL' && x !== 'null')
  }
  return [s]
}

/**
 * Boxes packed in the order they come, the way memory is laid out: along a
 * shelf, then the next shelf behind it, and in `stacks`, the next floor up
 * once a floor is full. The shelf is as long as makes the block close to a
 * square (a cube in stacks). Positions are the box's base centre, relative to
 * the block's corner.
 * @param {{ side: number, x: number, y: number, z: number }[]} items
 * @param {boolean} stacked
 */
const packBlock = (items, stacked) => {
  let largest = UNIT, room = 0
  for (const it of items) {
    largest = Math.max(largest, it.side)
    room += stacked ? (it.side + GAP) ** 3 : (it.side + GAP) ** 2
  }
  const width = Math.max(stacked ? Math.cbrt(room) * 1.25 : Math.sqrt(room) * 1.1, largest)
  let x = 0, y = 0, z = 0, depth = 0, floor = 0, w = 0, h = 0, d = 0
  for (const it of items) {
    const s = it.side
    if (x > 0 && x + s > width) {
      x = 0
      z += depth + GAP
      depth = 0
    }
    if (stacked && z > 0 && z + s > width) {
      x = 0
      z = 0
      y += floor + GAP
      depth = 0
      floor = 0
    }
    it.x = x + s / 2
    it.y = y
    it.z = z + s / 2
    x += s + GAP
    depth = Math.max(depth, s)
    floor = Math.max(floor, s)
    w = Math.max(w, x - GAP)
    d = Math.max(d, z + depth)
    h = Math.max(h, y + floor)
  }
  return { w, h, d }
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Flythrough 3D',
      // Every button of the mouse steers (the right one pans, and looks
      // around in flight), so the app's view menu stays on the header's dots.
      contextMenu: false,
      inputs: [
        { key: 'group', kind: 'column', label: 'Group', default: '', description: 'The category rows gather into, a block of shelves each; none makes one block' },
        { key: 'size', kind: 'column', label: 'Size', types: ['numeric'], default: '', description: 'The number a box grows with; none makes every box the same' },
        { key: 'sizeScale', kind: 'choice', label: 'Size scale', options: ['volume', 'log'], default: 'volume', description: 'volume: a box holds its number (its volume in proportion); log: a box grows with the number of digits, so a giant does not hide the rest' },
        { key: 'name', kind: 'column', label: 'Name', default: '', description: 'What a box is called, over the largest ones, on the card and in the tooltip' },
        { key: 'color', kind: 'column', label: 'Colour by', default: '', description: 'A number (along the ramp below) or a category; none colours by group' },
        { key: 'ramp', kind: 'choice', label: 'Colour ramp', options: ['ramp', 'alarm'], default: 'ramp', description: 'For a number: ramp runs blue, amber, red from low to high; alarm runs green, amber, red, for a number where high is bad' },
        { key: 'id', kind: 'column', label: 'Id', default: '', description: 'What other rows call a row by when they link to it (a key)' },
        { key: 'link', kind: 'column', label: 'Links to', default: '', description: 'The id a row points at (a parent, a foreign key), or an array of them; each becomes a path to that row' },
        { key: 'layout', kind: 'choice', label: 'Layout', options: ['shelves', 'stacks'], default: 'shelves', description: 'shelves: one floor per block, every box seen from above; stacks: floors on floors, blocks as cubes, for a great many rows' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '50000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      actions: [
        { label: 'Fly', run: () => { if (api) api.fly() } },
        { label: 'Tour', run: () => { if (api) api.tour() } },
        { label: 'Signals', run: () => { if (api) api.signals() } },
        { label: 'Reset camera', icon: 'reset', run: () => { if (api) api.reset() } },
        { label: 'Copy the chart data (CSV)', icon: 'copy', run: (ctx) => ctx.copy(csv) }
      ],
      render: async (root, data, ctx) => {
        if (stage) stage.dispose()
        stage = null
        api = null
        onDbl = null
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const gi = colIndex(cols, inputs.group), si = colIndex(cols, inputs.size), ni = colIndex(cols, inputs.name)
        const ci = colIndex(cols, inputs.color), ii = colIndex(cols, inputs.id), li = colIndex(cols, inputs.link)
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 50000))
        if (!rows.length) { message(root, 'The result has no rows to fly through.'); return }

        // ─── The boxes ───────────────────────────────────────────────────────
        // A box's side from its size: in proportion to the cube root (its
        // volume holds the number) or to the logarithm; a row with no size,
        // or one that is not positive, gets the smallest box.
        let sMax = 0, sMinPos = Infinity
        if (si >= 0) for (const r of rows) { const v = num(r[si]); if (v > 0) { if (v > sMax) sMax = v; if (v < sMinPos) sMinPos = v } }
        const logScale = inputs.sizeScale === 'log'
        const sideOf = (/** @type {number} */ i) => {
          if (si < 0 || !(sMax > 0)) return UNIT
          const v = num(rows[i][si])
          if (!(v > 0)) return MIN_SIDE
          const t = logScale
            ? (sMax > sMinPos ? (Math.log10(v) - Math.log10(sMinPos)) / (Math.log10(sMax) - Math.log10(sMinPos)) : 1)
            : Math.cbrt(v / sMax)
          return MIN_SIDE + (MAX_SIDE - MIN_SIDE) * Math.max(0, Math.min(1, t))
        }

        // Groups in the order the result first names them, rows in their own
        // order: the query's ORDER BY is the order along the shelves.
        /** @type {Map<string, { name: string, items: { row: number, side: number, x: number, y: number, z: number }[], w: number, h: number, d: number, bx: number, bz: number }>} */
        const groups = new Map()
        rows.forEach((r, i) => {
          const key = gi >= 0 ? keyOf(r[gi]) : ''
          let g = groups.get(key)
          if (!g) { g = { name: key, items: [], w: 0, h: 0, d: 0, bx: 0, bz: 0 }; groups.set(key, g) }
          g.items.push({ row: i, side: sideOf(i), x: 0, y: 0, z: 0 })
        })
        const stacked = inputs.layout === 'stacks'
        const blocks = [...groups.values()]
        for (const g of blocks) Object.assign(g, packBlock(g.items, stacked))

        // The blocks on the ground, packed the same way with an aisle
        // between them, so the city has streets to fly along.
        let room = 0, widest = 0
        for (const g of blocks) { room += (g.w + AISLE) * (g.d + AISLE); widest = Math.max(widest, g.w) }
        const street = Math.max(Math.sqrt(room) * 1.15, widest)
        {
          let x = 0, z = 0, depth = 0
          for (const g of blocks) {
            if (x > 0 && x + g.w > street) { x = 0; z += depth + AISLE; depth = 0 }
            g.bx = x
            g.bz = z
            x += g.w + AISLE
            depth = Math.max(depth, g.d)
          }
        }
        let cityW = 0, cityD = 0, cityH = 0
        for (const g of blocks) { cityW = Math.max(cityW, g.bx + g.w); cityD = Math.max(cityD, g.bz + g.d); cityH = Math.max(cityH, g.h) }
        const ox = -cityW / 2, oz = -cityD / 2
        for (const g of blocks) { g.bx += ox; g.bz += oz }
        const SPAN = Math.max(cityW, cityD, 8)

        // Every box in world space, in row order.
        const n = rows.length
        const px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n), side = new Float32Array(n)
        /** @type {string[]} */
        const groupOf = new Array(n)
        for (const g of blocks) for (const it of g.items) {
          px[it.row] = g.bx + it.x
          py[it.row] = it.y
          pz[it.row] = g.bz + it.z
          side[it.row] = it.side
          groupOf[it.row] = g.name
        }

        // ─── The links ───────────────────────────────────────────────────────
        // A row's link names another row's id; the first row with that id is
        // the one it reaches. Ids the view has not read are counted, not drawn.
        /** @type {number[]} */
        const links = []
        /** @type {Map<number, number[]>} */
        const out = new Map(), into = new Map()
        let dangling = 0, linked = 0
        if (ii >= 0 && li >= 0) {
          /** @type {Map<string, number>} */
          const byId = new Map()
          rows.forEach((r, i) => { const k = r[ii]; if (k != null && !byId.has(String(k))) byId.set(String(k), i) })
          rows.forEach((r, i) => {
            for (const id of linkIds(r[li])) {
              const j = byId.get(id)
              if (j === undefined) { dangling++; continue }
              if (j === i) continue
              linked++
              if (links.length / 2 < MAX_LINKS) links.push(i, j)
              const o = out.get(i); if (o) o.push(j); else out.set(i, [j])
              const t = into.get(j); if (t) t.push(i); else into.set(j, [i])
            }
          })
          if (dangling) ctx.log(`Flythrough 3D: ${dangling} links name an id that is not among the ${n} rows read, and are not drawn`)
          if (linked > MAX_LINKS) ctx.log(`Flythrough 3D: ${linked} links, the first ${MAX_LINKS} drawn`)
        } else if (li >= 0 || ii >= 0) ctx.log('Flythrough 3D: links need both Id and Links to; pick the other one in the inputs (the sliders button)')

        csv = [[...(gi >= 0 ? [cols[gi].name] : []), ...(ni >= 0 ? [cols[ni].name] : []), ...(si >= 0 ? [cols[si].name] : []), ...(ci >= 0 ? [cols[ci].name] : []), ...(ii >= 0 ? [cols[ii].name] : []), ...(li >= 0 ? [cols[li].name] : [])].map(csvCell).join(',')]
          .concat(rows.map((r) => [...(gi >= 0 ? [r[gi]] : []), ...(ni >= 0 ? [r[ni]] : []), ...(si >= 0 ? [r[si]] : []), ...(ci >= 0 ? [r[ci]] : []), ...(ii >= 0 ? [r[ii]] : []), ...(li >= 0 ? [r[li]] : [])].map(csvCell).join(',')))
          .join('\n')

        // ─── The scene ───────────────────────────────────────────────────────
        const s = createStage(root, ctx, { fov: 55 })
        stage = s
        const th = s.theme
        const surface = ctx.palette ? ctx.palette.surface : ''
        const ground = typeof surface === 'string' && /^#[0-9a-f]{6}$/i.test(surface) ? surface : th.pane
        s.scene.background = new THREE.Color(ground)
        // The far blocks fade into the ground colour: depth you can read while
        // flying, and a city that ends softly rather than at the far plane.
        s.scene.fog = new THREE.Fog(ground, SPAN * 0.9, SPAN * 3.2)
        s.camera.far = SPAN * 8 + 200
        s.camera.near = 0.05
        s.camera.updateProjectionMatrix()
        const additive = th.dark

        // Colour: a number along the chosen ramp (an empty value muted), a
        // category a colour each, the most frequent first; by default the
        // group's own colour.
        const stops = inputs.ramp === 'alarm' ? th.alarm : th.ramp
        const numeric = ci >= 0 && /int|numeric|decimal|real|double|float|money/i.test(cols[ci].type || '')
        let cLo = Infinity, cHi = -Infinity
        if (numeric) for (const r of rows) { const v = num(r[ci]); if (Number.isFinite(v)) { if (v < cLo) cLo = v; if (v > cHi) cHi = v } }
        /** @type {Map<string, number>} */
        const cats = new Map()
        if (ci >= 0 && !numeric) {
          /** @type {Map<string, number>} */
          const freq = new Map()
          for (const r of rows) { const k = keyOf(r[ci]); freq.set(k, (freq.get(k) || 0) + 1) }
          ;[...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CATS).forEach(([k], i) => cats.set(k, i))
        }
        const groupIndex = new Map(blocks.map((g, i) => [g.name, i]))
        const colorOf = (/** @type {number} */ i) => {
          const r = rows[i]
          if (numeric) {
            const v = num(r[ci])
            return Number.isFinite(v) ? colorRamp(stops, (v - cLo) / (cHi - cLo || 1)) : new THREE.Color(th.muted)
          }
          if (ci >= 0) {
            const c = cats.get(keyOf(r[ci]))
            return new THREE.Color(c === undefined ? th.muted : th.series[c % th.series.length])
          }
          return new THREE.Color(th.series[(groupIndex.get(groupOf[i]) ?? 0) % th.series.length])
        }

        // The ground: a grid under the whole city and a slab under each block.
        const grid = new THREE.GridHelper(SPAN * 3, Math.min(240, Math.max(12, Math.round(SPAN * 3 / 4))), th.line, th.line)
        grid.position.y = -0.02
        grid.material.transparent = true
        grid.material.opacity = th.dark ? 0.45 : 0.6
        s.scene.add(grid)
        const cube = new THREE.BoxGeometry(1, 1, 1)
        cube.translate(0, 0.5, 0)
        const slabs = new THREE.InstancedMesh(cube, new THREE.MeshStandardMaterial({ color: th.dark ? '#2a2d3d' : '#e3e5ea', roughness: 0.95 }), blocks.length)
        const m4 = new THREE.Matrix4()
        blocks.forEach((g, i) => {
          m4.makeScale(g.w + 1, 0.05, g.d + 1).setPosition(g.bx + g.w / 2, -0.05, g.bz + g.d / 2)
          slabs.setMatrixAt(i, m4)
        })
        s.scene.add(slabs)

        // The boxes: one instanced cube each, a single draw call.
        const mesh = new THREE.InstancedMesh(cube, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.08 }), n)
        /** @type {any[]} */
        const base = new Array(n)
        for (let i = 0; i < n; i++) {
          const k = side[i]
          m4.makeScale(k, k, k).setPosition(px[i], py[i], pz[i])
          mesh.setMatrixAt(i, m4)
          base[i] = colorOf(i)
          mesh.setColorAt(i, base[i])
        }
        mesh.computeBoundingSphere()
        s.scene.add(mesh)

        // The paths: a curve from the top of a box to the top of the one it
        // links to, rising with the distance, as plain segments in one draw
        // call, coloured from the one end's colour to the other's.
        const top = (/** @type {number} */ i, /** @type {any} */ v) => v.set(px[i], py[i] + side[i], pz[i])
        const a = new THREE.Vector3(), b = new THREE.Vector3()
        const nLinks = links.length / 2
        // The control points of every path, for the signals: p0, p1, p2, p3.
        const ctl = new Float32Array(nLinks * 12)
        for (let e = 0; e < nLinks; e++) {
          top(links[e * 2], a)
          top(links[e * 2 + 1], b)
          const lift = a.distanceTo(b) * 0.22 + 1.2
          ctl.set([a.x, a.y, a.z, a.x, a.y + lift, a.z, b.x, b.y + lift, b.z, b.x, b.y, b.z], e * 12)
        }
        const bez = (/** @type {number} */ e, /** @type {number} */ t, /** @type {Float32Array} */ to, /** @type {number} */ at) => {
          const o = e * 12, u = 1 - t
          const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t
          to[at] = w0 * ctl[o] + w1 * ctl[o + 3] + w2 * ctl[o + 6] + w3 * ctl[o + 9]
          to[at + 1] = w0 * ctl[o + 1] + w1 * ctl[o + 4] + w2 * ctl[o + 7] + w3 * ctl[o + 10]
          to[at + 2] = w0 * ctl[o + 2] + w1 * ctl[o + 5] + w2 * ctl[o + 8] + w3 * ctl[o + 11]
        }
        if (nLinks) {
          const pos = new Float32Array(nLinks * CURVE_STEPS * 6), col = new Float32Array(nLinks * CURVE_STEPS * 6)
          const c = new THREE.Color()
          for (let e = 0; e < nLinks; e++) {
            const ca = base[links[e * 2]], cb = base[links[e * 2 + 1]]
            for (let k = 0; k < CURVE_STEPS; k++) {
              const at = (e * CURVE_STEPS + k) * 6
              bez(e, k / CURVE_STEPS, pos, at)
              bez(e, (k + 1) / CURVE_STEPS, pos, at + 3)
              c.copy(ca).lerp(cb, k / CURVE_STEPS)
              col.set([c.r, c.g, c.b], at)
              c.copy(ca).lerp(cb, (k + 1) / CURVE_STEPS)
              col.set([c.r, c.g, c.b], at + 3)
            }
          }
          const geo = new THREE.BufferGeometry()
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
          geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
          // Fainter the more there are: a few paths read as lines, thousands
          // as a haze, never as a white dome over the city.
          const opacity = Math.max(0.05, Math.min(additive ? 0.4 : 0.55, (additive ? 6 : 9) / Math.sqrt(nLinks)))
          const paths = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }))
          paths.frustumCulled = false
          s.scene.add(paths)
        }

        // The signals: a packet running along each of up to MAX_SIGNALS
        // paths, from the row that links to the row it reaches, at one speed
        // in world units, so a long path takes longer. Soft round points,
        // brighter in the middle; added over a dark ground, they glow.
        const nSig = Math.min(nLinks, MAX_SIGNALS)
        const sigEdge = new Uint32Array(nSig), sigPhase = new Float32Array(nSig), sigLen = new Float32Array(nSig)
        const sigPos = new Float32Array(nSig * 3)
        /** @type {any} */
        let signals = null
        if (nSig) {
          const sigCol = new Float32Array(nSig * 3)
          const glow = rgb01(th.dark ? '#ffffff' : th.fg)
          for (let k = 0; k < nSig; k++) {
            const e = Math.floor((k * nLinks) / nSig)
            sigEdge[k] = e
            sigPhase[k] = (k * 0.6180339) % 1
            const o = e * 12
            sigLen[k] = Math.hypot(ctl[o + 9] - ctl[o], ctl[o + 10] - ctl[o + 1], ctl[o + 11] - ctl[o + 2]) * 1.3 + 2
            const src = rgb01('#' + base[links[e * 2]].getHexString())
            sigCol.set([(src[0] + glow[0]) / 2, (src[1] + glow[1]) / 2, (src[2] + glow[2]) / 2], k * 3)
          }
          const geo = new THREE.BufferGeometry()
          geo.setAttribute('position', new THREE.BufferAttribute(sigPos, 3))
          geo.setAttribute('aColor', new THREE.BufferAttribute(sigCol, 3))
          signals = new THREE.Points(geo, new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
            uniforms: { uSize: { value: 7 * s.renderer.getPixelRatio() }, uNear: { value: SPAN * 0.08 } },
            vertexShader:
              'attribute vec3 aColor; uniform float uSize; uniform float uNear; varying vec3 vColor;' +
              'void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;' +
              ' gl_PointSize = clamp(uSize * uNear / max(0.001, -mv.z), 2.0, uSize * 3.0); }',
            fragmentShader:
              'varying vec3 vColor; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard;' +
              ' float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vColor, a * a); }'
          }))
          signals.frustumCulled = false
          s.scene.add(signals)
        }
        let signalsOn = nSig > 0
        let clock = 0
        const moveSignals = () => {
          if (!signals) return
          for (let k = 0; k < nSig; k++) {
            const t = (((clock * SPAN) / 14 / sigLen[k] + sigPhase[k]) % 1 + 1) % 1
            bez(sigEdge[k], t, sigPos, k * 3)
          }
          signals.geometry.attributes.position.needsUpdate = true
        }
        moveSignals()

        // Names: the blocks with the most rows over their roofs, the largest
        // boxes over their tops; the rest on the card and in the tooltip (a
        // hundred names at once only cover one another).
        if (gi >= 0) for (const g of [...blocks].sort((x, y) => y.items.length - x.items.length).slice(0, NAMED_BLOCKS)) s.addLabel(g.name, g.bx + g.w / 2, g.h + 1.2, g.bz + g.d / 2, { color: th.fg, bold: true, maxWidth: 180, halo: true })
        if (ni >= 0) {
          const big = Array.from({ length: n }, (_, i) => i).sort((x, y) => side[y] - side[x]).slice(0, NAMED_BOXES)
          for (const i of big) s.addLabel(show(rows[i][ni]), px[i], py[i] + side[i] + 0.35, pz[i], { color: th.fg, maxWidth: 120, halo: true })
        }
        if (numeric && Number.isFinite(cLo)) s.legendRamp(cols[ci].name, fmtTick(cLo), fmtTick(cHi), stops)
        else if (ci >= 0) s.legendCategories(cols[ci].name, [...cats.keys()].map((k, i) => ({ name: k, color: th.series[i % th.series.length] })))
        else if (gi >= 0) s.legendCategories(cols[gi].name, blocks.slice(0, MAX_CATS).map((g, i) => ({ name: g.name, color: th.series[i % th.series.length] })))

        // ─── The overlays: the card of the picked row and the keys ───────────
        const panel = 'position:absolute;font:12px system-ui,sans-serif;color:' + th.fg + ';background:' + th.pane + ';border:1px solid ' + th.line + ';border-radius:6px;z-index:2'
        const hud = document.createElement('div')
        hud.style.cssText = panel + ';left:10px;bottom:10px;padding:6px 9px;line-height:18px;pointer-events:none;max-width:calc(100% - 40px);opacity:.92'
        root.appendChild(hud)
        const cross = document.createElement('div')
        cross.style.cssText = 'position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border:1.5px solid ' + th.fg + ';border-radius:50%;opacity:.55;pointer-events:none;display:none;z-index:2'
        root.appendChild(cross)
        const card = document.createElement('div')
        card.style.cssText = panel + ';left:10px;top:10px;padding:8px 10px;max-width:min(360px,calc(100% - 40px));max-height:calc(100% - 90px);overflow:auto;display:none;pointer-events:auto'
        root.appendChild(card)
        const kbd = (/** @type {string} */ k) => '<span style="display:inline-block;min-width:9px;padding:0 4px;border:1px solid ' + th.line + ';border-radius:3px;font-size:11px;line-height:15px;text-align:center;color:' + th.fg + '">' + esc(k) + '</span>'
        const mutedSpan = (/** @type {string} */ t) => '<span style="color:' + th.muted + '">' + esc(t) + '</span>'

        // ─── The camera: orbit, flight, a glide, the tour ────────────────────
        const cam = s.camera
        /** @type {'orbit' | 'fly'} */
        let mode = 'orbit'
        // In flight the camera's own state is the truth: OrbitControls' update
        // aims the camera at its target on every frame, so the frame hook puts
        // the flight's position and heading back after it.
        const flyPos = new THREE.Vector3()
        const euler = new THREE.Euler(0, 0, 0, 'YXZ')
        let speed = Math.max(3, SPAN / 18)
        /** @type {Set<string>} */
        const keys = new Set()
        /** @type {{ from: any, to: any, lookFrom: any, lookTo: any, t: number, dur: number, done?: () => void } | null} */
        let glide = null
        /** @type {{ curve: any, t: number, dur: number } | null} */
        let tour = null
        let hudHidden = false
        let ahead = -1
        let aheadAt = 0
        let selected = -1

        const forward = () => cam.getWorldDirection(new THREE.Vector3())
        const drawHud = () => {
          if (hudHidden) { hud.style.display = 'none'; return }
          hud.style.display = ''
          const stats = mutedSpan(n + ' rows' + (blocks.length > 1 ? ' in ' + blocks.length + ' groups' : '') + (nLinks ? ', ' + nLinks + ' links' : ''))
          if (tour) {
            hud.innerHTML = '<b>Tour</b> ' + mutedSpan('any key or a click takes over') + '<br>' + stats
            return
          }
          if (mode === 'fly') {
            const target = ahead >= 0 ? mutedSpan('ahead ') + esc(ni >= 0 ? show(rows[ahead][ni]) : 'row ' + (ahead + 1)) + (gi >= 0 ? ' ' + mutedSpan('in ' + groupOf[ahead]) : '') : mutedSpan('nothing straight ahead')
            const steer = document.hasFocus() && document.activeElement === s.canvas
            hud.innerHTML =
              '<b>Flying</b> ' + mutedSpan('speed ' + fmtTick(speed) + ' per second') + '<br>' +
              (steer ? '' : '<b>Click the view to steer with the keys</b><br>') +
              kbd('W') + kbd('A') + kbd('S') + kbd('D') + ' fly ' + kbd('Q') + kbd('E') + ' down, up ' + mutedSpan('drag to look') + '<br>' +
              kbd('Shift') + ' faster ' + kbd('Space') + ' slower ' + mutedSpan('wheel sets the speed') + '<br>' +
              kbd('Enter') + ' pick ahead ' + kbd('G') + ' go to the picked ' + kbd('F') + ' or ' + kbd('Esc') + ' land ' + kbd('H') + ' hide' + '<br>' +
              target
            return
          }
          hud.innerHTML =
            kbd('F') + ' or ' + kbd('W') + ' fly ' + mutedSpan('drag to orbit, right drag to pan, wheel to zoom') + '<br>' +
            mutedSpan('click a box for its row, double-click to go there ') + kbd('G') + ' ' + kbd('H') + ' hide<br>' + stats
        }

        // Where the city is seen whole: from the front edge, high above.
        s.setHome([0, Math.max(cityH * 2, SPAN * 0.55), SPAN * 0.85], [0, 0, 0])
        s.controls.minDistance = 0.5
        s.controls.maxDistance = SPAN * 5

        const land = (/** @type {boolean} */ keepTarget = false) => {
          if (mode !== 'fly') return
          mode = 'orbit'
          keys.clear()
          cross.style.display = 'none'
          s.canvas.style.cursor = 'grab'
          if (!keepTarget) s.controls.target.copy(cam.position).addScaledVector(forward(), Math.max(4, SPAN * 0.12))
          s.controls.enabled = true
          s.controls.update()
          drawHud()
          s.request()
        }
        const takeOff = () => {
          stopTour()
          glide = null
          if (mode === 'fly') return
          mode = 'fly'
          // The cruising speed from where the camera is: what it looks at is
          // six seconds away, so a take-off from high above crosses the city
          // and one beside a box creeps along the shelf.
          speed = Math.max(0.5, Math.min(SPAN * 2, cam.position.distanceTo(s.controls.target) / 6))
          // A tooltip from before stays where it was while the world moves.
          s.tip(null, 0, 0)
          light(-1)
          flyPos.copy(cam.position)
          euler.setFromQuaternion(cam.quaternion, 'YXZ')
          euler.z = 0
          s.controls.enabled = false
          s.spin(false)
          cross.style.display = ''
          s.canvas.style.cursor = 'crosshair'
          s.canvas.focus({ preventScroll: true })
          aheadAt = 0
          drawHud()
          loop()
        }
        const stopTour = () => {
          if (!tour) return
          tour = null
          if (mode === 'orbit') {
            s.controls.enabled = true
            s.controls.target.copy(cam.position).addScaledVector(forward(), Math.max(4, SPAN * 0.12))
            s.controls.update()
          }
          drawHud()
        }

        // A glide brings the camera near a box and turns it to face it: in
        // orbit the box becomes the target, in flight the flight goes on from
        // there.
        const goTo = (/** @type {number} */ i) => {
          if (i < 0) return
          stopTour()
          s.tip(null, 0, 0)
          const centre = new THREE.Vector3(px[i], py[i] + side[i] / 2, pz[i])
          const away = cam.position.clone().sub(centre)
          away.y = Math.max(away.y, away.length() * 0.35)
          const dist = side[i] * 2.6 + 3
          const to = centre.clone().add(away.normalize().multiplyScalar(dist))
          const lookFrom = mode === 'fly' ? cam.position.clone().add(forward()) : s.controls.target.clone()
          glide = { from: cam.position.clone(), to, lookFrom, lookTo: centre, t: 0, dur: Math.min(1.6, 0.6 + cam.position.distanceTo(to) / (SPAN * 1.5)) }
          loop()
        }

        // The tour: a slow flight over the blocks in the order they stand,
        // low enough to read the boxes, looking a little ahead and down.
        const startTour = () => {
          land(true)
          glide = null
          const pts = [cam.position.clone()]
          const order = blocks.slice(0, 40)
          for (const g of order) pts.push(new THREE.Vector3(g.bx + g.w / 2, g.h + Math.max(2.5, Math.min(12, (g.w + g.d) * 0.22)), g.bz + g.d + AISLE * 0.5))
          if (order.length === 1) {
            const g = order[0]
            pts.push(new THREE.Vector3(g.bx + g.w, g.h + 3, g.bz + g.d / 2), new THREE.Vector3(g.bx + g.w / 2, g.h + 3, g.bz - AISLE), new THREE.Vector3(g.bx, g.h + 3, g.bz + g.d / 2))
          }
          const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
          tour = { curve, t: 0, dur: Math.max(12, curve.getLength() / Math.max(2, SPAN / 22)) }
          s.controls.enabled = false
          drawHud()
          loop()
        }

        // The selection: an outline around the box, its paths drawn bright,
        // its row on the card and in the grid.
        const edgesGeo = new THREE.EdgesGeometry(cube)
        const outline = new THREE.LineSegments(edgesGeo, new THREE.LineBasicMaterial({ color: th.dark ? '#ffffff' : '#000000', depthTest: false, transparent: true, opacity: 0.9 }))
        outline.renderOrder = 10
        outline.visible = false
        s.scene.add(outline)
        /** @type {any} */
        let bright = null
        const select = (/** @type {number} */ i) => {
          selected = i
          if (bright) { s.scene.remove(bright); bright.geometry.dispose(); bright.material.dispose(); bright = null }
          if (i < 0) { outline.visible = false; card.style.display = 'none'; s.request(); return }
          const k = side[i] * 1.06
          outline.scale.set(k, k, k)
          outline.position.set(px[i], py[i] - side[i] * 0.03, pz[i])
          outline.visible = true
          const mine = []
          for (let e = 0; e < nLinks; e++) if (links[e * 2] === i || links[e * 2 + 1] === i) mine.push(e)
          if (mine.length) {
            const pos = new Float32Array(mine.length * CURVE_STEPS * 6)
            mine.forEach((e, m) => {
              for (let q = 0; q < CURVE_STEPS; q++) {
                const at = (m * CURVE_STEPS + q) * 6
                bez(e, q / CURVE_STEPS, pos, at)
                bez(e, (q + 1) / CURVE_STEPS, pos, at + 3)
              }
            })
            bright = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), new THREE.LineBasicMaterial({ color: th.dark ? '#ffffff' : th.accent, transparent: true, opacity: 0.95 }))
            bright.renderOrder = 9
            bright.frustumCulled = false
            s.scene.add(bright)
          }
          // The card: the row's values, then where its links lead, each a
          // button that goes there.
          const r = rows[i]
          const title = ni >= 0 ? show(r[ni]) : 'Row ' + (i + 1)
          let html = '<div style="display:flex;gap:8px;align-items:baseline"><b style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(title) + '</b>' +
            '<span data-close style="cursor:pointer;color:' + th.muted + '" title="Close">✕</span></div>'
          if (gi >= 0) html += '<div style="margin-bottom:4px">' + mutedSpan(cols[gi].name + ': ') + esc(groupOf[i]) + '</div>'
          html += '<table style="border-collapse:collapse;font-size:11.5px">'
          cols.slice(0, 18).forEach((c, k) => {
            const v = show(r[k])
            html += '<tr><td style="color:' + th.muted + ';padding:1px 10px 1px 0;vertical-align:top;white-space:nowrap">' + esc(c.name) + '</td><td style="padding:1px 0;word-break:break-word">' + esc(v.length > 120 ? v.slice(0, 120) + '…' : v) + '</td></tr>'
          })
          html += '</table>'
          if (cols.length > 18) html += '<div style="color:' + th.muted + '">and ' + (cols.length - 18) + ' more columns in the grid</div>'
          const chip = (/** @type {number} */ j) => '<span data-go="' + j + '" style="display:inline-block;margin:2px 4px 0 0;padding:0 6px;border:1px solid ' + th.line + ';border-radius:9px;cursor:pointer;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:top">' + esc(ni >= 0 ? show(rows[j][ni]) : 'row ' + (j + 1)) + '</span>'
          const o = out.get(i) || [], t = into.get(i) || []
          if (o.length) html += '<div style="margin-top:6px;color:' + th.muted + '">Links to</div>' + o.slice(0, 8).map(chip).join('') + (o.length > 8 ? mutedSpan(' and ' + (o.length - 8) + ' more') : '')
          if (t.length) html += '<div style="margin-top:6px;color:' + th.muted + '">Linked from ' + t.length + '</div>' + t.slice(0, 8).map(chip).join('') + (t.length > 8 ? mutedSpan(' and ' + (t.length - 8) + ' more') : '')
          // The grid is one click away, never taken to on its own: in a tab
          // layout, revealing the row replaces the view with the grid.
          if (typeof ctx.selectRow === 'function') html += '<div style="margin-top:8px"><span data-grid style="cursor:pointer;color:' + th.accent + '">Show in the grid</span></div>'
          card.innerHTML = html
          card.style.display = ''
          s.request()
        }
        card.addEventListener('click', (e) => {
          const el = /** @type {HTMLElement} */ (e.target)
          if (el.closest('[data-close]')) { select(-1); return }
          if (el.closest('[data-grid]')) { if (selected >= 0) ctx.selectRow(selected); return }
          const go = el.closest('[data-go]')
          if (go) {
            const j = Number(go.getAttribute('data-go'))
            select(j)
            goTo(j)
          }
        })
        // Wheel and drags over the card are the card's, never the camera's.
        card.addEventListener('wheel', (e) => e.stopPropagation())
        card.addEventListener('pointerdown', (e) => e.stopPropagation())

        // ─── Hover and click ─────────────────────────────────────────────────
        const glowC = new THREE.Color(th.dark ? '#ffffff' : '#000000')
        let lit = -1
        const light = (/** @type {number} */ i) => {
          if (lit >= 0 && lit !== i) mesh.setColorAt(lit, base[lit])
          if (i >= 0) mesh.setColorAt(i, base[i].clone().lerp(glowC, 0.3))
          lit = i
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
        }
        const tipLines = (/** @type {number} */ i) => {
          const r = rows[i]
          /** @type {[string, string][]} */
          const lines = []
          if (ni >= 0) lines.push([cols[ni].name, show(r[ni])])
          if (gi >= 0) lines.push([cols[gi].name, show(r[gi])])
          if (si >= 0) lines.push([cols[si].name, show(r[si])])
          if (ci >= 0 && ci !== si) lines.push([cols[ci].name, show(r[ci])])
          const o = (out.get(i) || []).length, t = (into.get(i) || []).length
          if (o || t) lines.push(['links', o + ' out, ' + t + ' in'])
          return lines
        }
        const ray = new THREE.Raycaster()
        const pickRay = (/** @type {any} */ r) => {
          const hit = r.intersectObject(mesh, false)[0]
          return hit && hit.instanceId !== undefined ? hit.instanceId : -1
        }
        s.onPointer({
          pick: (_x, _y, _px, _py, r) => {
            const i = pickRay(r)
            return i >= 0 ? { i } : null
          },
          hover: (hit, hx, hy) => {
            light(hit ? hit.i : -1)
            if (hit) s.tip(tipLines(hit.i), hx, hy)
          },
          click: (hit) => select(hit.i)
        })

        // A double-click on a box goes there; on the ground it lands and
        // brings the camera home (the stage's own double-click). Caught on
        // the way down, before the stage's: root outlives the draws, so it
        // listens once and the current draw answers.
        if (!dblRoots.has(root)) {
          dblRoots.add(root)
          root.addEventListener('dblclick', (e) => { if (onDbl) onDbl(e) }, true)
        }
        onDbl = (/** @type {MouseEvent} */ e) => {
          if (e.target !== s.canvas) return
          const rect = s.canvas.getBoundingClientRect()
          ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), cam)
          const i = pickRay(ray)
          if (i >= 0) {
            e.stopPropagation()
            select(i)
            goTo(i)
          } else {
            stopTour()
            land(true)
          }
        }

        // ─── Flight: drag to look, keys to move ──────────────────────────────
        /** @type {{ x: number, y: number } | null} */
        let looking = null
        s.canvas.addEventListener('pointerdown', (e) => {
          if (tour) stopTour()
          glide = null
          if (mode !== 'fly') return
          looking = { x: e.clientX, y: e.clientY }
          s.canvas.setPointerCapture(e.pointerId)
        })
        s.canvas.addEventListener('pointermove', (e) => {
          if (!looking || mode !== 'fly') return
          euler.y -= (e.clientX - looking.x) * LOOK
          euler.x = Math.max(-1.5, Math.min(1.5, euler.x - (e.clientY - looking.y) * LOOK))
          looking = { x: e.clientX, y: e.clientY }
          s.request()
        })
        const endLook = (/** @type {PointerEvent} */ e) => {
          looking = null
          if (s.canvas.hasPointerCapture(e.pointerId)) s.canvas.releasePointerCapture(e.pointerId)
        }
        s.canvas.addEventListener('pointerup', endLook)
        s.canvas.addEventListener('pointercancel', endLook)
        s.canvas.addEventListener('wheel', (e) => {
          if (mode !== 'fly') return
          e.preventDefault()
          speed = Math.max(0.2, Math.min(SPAN * 4, speed * (e.deltaY > 0 ? 0.8 : 1.25)))
          drawHud()
        }, { passive: false })
        const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space'])
        s.canvas.addEventListener('keydown', (e) => {
          if (e.ctrlKey || e.metaKey || e.altKey) return
          if (tour) { stopTour(); if (e.code === 'Escape') return }
          const c = e.code
          if (c === 'KeyF') { e.preventDefault(); if (!e.repeat) mode === 'fly' ? land() : takeOff(); return }
          if (c === 'Escape') { if (mode === 'fly') land(); else select(-1); return }
          if (c === 'KeyH') { hudHidden = !hudHidden; drawHud(); return }
          if (c === 'KeyG') { goTo(selected >= 0 ? selected : ahead); return }
          if (c === 'Home' || c === 'Digit0') { land(true); return }
          if (c === 'Enter' && mode === 'fly') { if (ahead >= 0) select(ahead); return }
          // A flying key in orbit takes off; the arrows stay the orbit's pan.
          if (mode !== 'fly' && /^Key[WASDQE]$/.test(c)) takeOff()
          if (mode === 'fly' && MOVE.has(c)) {
            e.preventDefault()
            e.stopPropagation()
            keys.add(c)
            loop()
          }
        })
        s.canvas.addEventListener('keyup', (e) => keys.delete(e.code))
        s.canvas.addEventListener('blur', () => { keys.clear(); if (mode === 'fly') drawHud() })
        s.canvas.addEventListener('focus', () => { if (mode === 'fly') drawHud() })

        // ─── The frame ───────────────────────────────────────────────────────
        // Runs before every render. Moves what moves, by the time since the
        // last frame, and puts the camera where the flight, a glide or the
        // tour says it is.
        let last = 0
        const ease = (/** @type {number} */ t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
        const lookPoint = new THREE.Vector3()
        s.onFrame(() => {
          const now = performance.now()
          const dt = last ? Math.min(0.08, (now - last) / 1000) : 0
          last = now
          if (signalsOn) {
            clock += dt
            moveSignals()
          }
          if (tour) {
            tour.t = Math.min(1, tour.t + dt / tour.dur)
            const at = tour.curve.getPointAt(ease(tour.t))
            const next = tour.curve.getPointAt(Math.min(1, ease(tour.t) + 0.025))
            cam.position.copy(at)
            lookPoint.copy(next).sub(at)
            if (lookPoint.lengthSq() < 1e-6) lookPoint.copy(forward())
            lookPoint.normalize().multiplyScalar(6).add(at)
            lookPoint.y -= 2.2
            cam.lookAt(lookPoint)
            s.controls.target.copy(lookPoint)
            if (tour.t >= 1) {
              tour = null
              s.controls.enabled = true
              drawHud()
            }
          } else if (glide) {
            glide.t = Math.min(1, glide.t + dt / glide.dur)
            const k = ease(glide.t)
            cam.position.lerpVectors(glide.from, glide.to, k)
            lookPoint.lerpVectors(glide.lookFrom, glide.lookTo, k)
            cam.lookAt(lookPoint)
            if (mode === 'fly') {
              flyPos.copy(cam.position)
              euler.setFromQuaternion(cam.quaternion, 'YXZ')
              euler.z = 0
            } else s.controls.target.copy(lookPoint)
            if (glide.t >= 1) glide = null
          } else if (mode === 'fly') {
            let k = keys.has('ShiftLeft') || keys.has('ShiftRight') ? FAST : 1
            if (keys.has('Space')) k *= SLOW
            const f = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'))
            const r = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'))
            const u = Number(keys.has('KeyE')) - Number(keys.has('KeyQ'))
            cam.quaternion.setFromEuler(euler)
            if (f || r || u) {
              const move = new THREE.Vector3(r, 0, -f).applyQuaternion(cam.quaternion)
              move.y += u
              if (move.lengthSq() > 1) move.normalize()
              flyPos.addScaledVector(move, speed * k * dt)
            }
            cam.position.copy(flyPos)
            // OrbitControls aims at its target on every update: keep the
            // target straight ahead, so its next update changes nothing.
            s.controls.target.copy(flyPos).add(forward())
            // What lies straight ahead, a few times a second.
            if (now - aheadAt > 150) {
              aheadAt = now
              ray.setFromCamera(new THREE.Vector2(0, 0), cam)
              const i = pickRay(ray)
              if (i !== ahead) { ahead = i; drawHud() }
            }
          }
        })

        // Frames are drawn on demand; while something moves on its own (a
        // flight, a glide, the tour, the signals), one is asked for every
        // animation frame until it stops.
        let looping = false
        const moving = () => s.alive && (mode === 'fly' || glide !== null || tour !== null || (signalsOn && nSig > 0))
        const loop = () => {
          if (looping) return
          looping = true
          const tick = () => {
            if (!moving()) { looping = false; last = 0; return }
            s.request()
            requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }

        api = {
          fly: () => (mode === 'fly' ? land() : takeOff()),
          tour: () => (tour ? stopTour() : startTour()),
          signals: () => {
            if (!nSig) { ctx.log('Flythrough 3D: no links to send signals along; pick Id and Links to in the inputs (the sliders button)'); return }
            signalsOn = !signalsOn
            if (signals) signals.visible = signalsOn
            last = 0
            loop()
            s.request()
          },
          reset: () => {
            stopTour()
            glide = null
            land(true)
            s.spin(false)
            s.reset()
          }
        }
        drawHud()
        loop()
      },
      // A settled pane resize re-projects the scene in one frame.
      resize: (root, size) => {
        if (!stage || !stage.alive || !stage.canvas.isConnected) throw new Error('no 3D scene to resize')
        stage.resize(size.width, size.height)
      }
    }
  ]
}
