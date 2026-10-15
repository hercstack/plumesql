// @ts-check
// @description A treemap you can walk around: rows as buildings grouped into districts, a number as the footprint, another as the height, a third as the colour (three.js)
// @color purple
import { THREE, createStage, loadRows, colIndex, colorRamp, fmtTick, num, message, csvCell } from '$ext/three-core/three-core.plumesql.js'

// The city's side in world units; districts and buildings share it out.
const SIDE = 20
// The street around a district, the gap between two buildings.
const STREET = 0.42, GAP = 0.09
// The tallest building, as a share of the side; the lowest stands this high.
const TALLEST = 0.26, LOWEST = 0.12
// How many of the largest buildings carry their name on the roof.
const NAMED = 12
// The districts and the categories a colour column shows by name.
const MAX_CATS = 12

/** @type {any} */
let stage = null
let csv = ''

/**
 * The squarified treemap (Bruls, Huizing and van Wijk): `values`, largest
 * first, share out the rectangle in rows that keep every cell as close to a
 * square as the order allows.
 * @param {number[]} values
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @returns {{ x: number, y: number, w: number, h: number }[]}
 */
const squarify = (values, x, y, w, h) => {
  const total = values.reduce((t, v) => t + v, 0)
  /** @type {{ x: number, y: number, w: number, h: number }[]} */
  const out = new Array(values.length)
  if (!(total > 0) || w <= 0 || h <= 0) return values.map(() => ({ x, y, w: 0, h: 0 }))
  const areas = values.map((v) => (v * w * h) / total)
  const worst = (/** @type {number} */ sum, /** @type {number} */ lo, /** @type {number} */ hi, /** @type {number} */ side) => {
    const s2 = side * side, sum2 = sum * sum
    return Math.max((s2 * hi) / sum2, sum2 / (s2 * lo))
  }
  let i = 0
  while (i < areas.length) {
    const side = Math.min(w, h)
    let sum = areas[i], lo = areas[i], hi = areas[i]
    let j = i + 1
    let ratio = worst(sum, lo, hi, side)
    while (j < areas.length) {
      const a = areas[j]
      const next = worst(sum + a, Math.min(lo, a), Math.max(hi, a), side)
      if (next > ratio) break
      sum += a
      lo = Math.min(lo, a)
      hi = Math.max(hi, a)
      ratio = next
      j++
    }
    if (w >= h) {
      // A column at the left, as wide as the row's area over the height.
      const cw = h > 0 ? sum / h : 0
      let yy = y
      for (let k = i; k < j; k++) {
        const hh = cw > 0 ? areas[k] / cw : 0
        out[k] = { x, y: yy, w: cw, h: hh }
        yy += hh
      }
      x += cw
      w -= cw
    } else {
      const rh = w > 0 ? sum / w : 0
      let xx = x
      for (let k = i; k < j; k++) {
        const ww = rh > 0 ? areas[k] / rh : 0
        out[k] = { x: xx, y, w: ww, h: rh }
        xx += ww
      }
      y += rh
      h -= rh
    }
    i = j
  }
  return out
}

// A cell as the tooltip shows it: a number in full, text as it is.
const show = (/** @type {unknown} */ v) => (v == null ? 'NULL' : String(v))

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'City 3D',
      // The left button orbits and the right button pans, so the app's view
      // menu stays on the header's dots button.
      contextMenu: false,
      inputs: [
        { key: 'area', kind: 'column', label: 'Footprint', types: ['numeric'], description: 'The number a building covers ground in proportion to (a size, an amount)' },
        { key: 'areaScale', kind: 'choice', label: 'Footprint scale', options: ['linear', 'sqrt'], default: 'linear', description: 'linear keeps the ground in proportion; sqrt keeps the order but lets the small buildings be seen beside a giant' },
        { key: 'district', kind: 'column', label: 'District', default: '', description: 'The category buildings group into, a district each; none makes one district' },
        { key: 'name', kind: 'column', label: 'Name', default: '', description: 'What a building is called, on its roof (the largest) and in the tooltip' },
        { key: 'height', kind: 'column', label: 'Height', types: ['numeric'], default: '', description: 'The number a building rises with; none keeps every building low' },
        { key: 'color', kind: 'column', label: 'Colour by', default: '', description: 'A number (along the ramp below) or a category; none colours by district' },
        { key: 'ramp', kind: 'choice', label: 'Colour ramp', options: ['ramp', 'alarm'], default: 'ramp', description: 'For a number: ramp runs blue, amber, red from low to high; alarm runs green, amber, red, for a number where high is bad' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '20000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      actions: [
        { label: 'Reset camera', icon: 'reset', run: () => { if (stage) { stage.spin(false); stage.reset() } } },
        { label: 'Spin', run: () => { if (stage) stage.spin() } },
        { label: 'Copy the chart data (CSV)', icon: 'copy', run: (ctx) => ctx.copy(csv) }
      ],
      render: async (root, data, ctx) => {
        if (stage) stage.dispose()
        stage = null
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const ai = colIndex(cols, inputs.area), di = colIndex(cols, inputs.district), ni = colIndex(cols, inputs.name)
        const hi_ = colIndex(cols, inputs.height), ci = colIndex(cols, inputs.color)
        if (ai < 0) { message(root, 'Pick a numeric Footprint column (the sliders button in the header).'); return }
        const rows = await loadRows(data, ctx, Math.max(1, Number(inputs.top) || 20000))

        // The buildings: rows with a positive footprint, grouped by district,
        // the districts and their buildings largest first. A sqrt footprint
        // keeps the order and lets the small ones be seen beside a giant.
        const ground_ = (/** @type {number} */ a) => (inputs.areaScale === 'sqrt' ? Math.sqrt(a) : a)
        /** @type {Map<string, { name: string, total: number, rows: number[] }>} */
        const districts = new Map()
        let left = 0
        rows.forEach((r, i) => {
          const a = num(r[ai])
          if (!(a > 0)) { left++; return }
          const key = di >= 0 ? (r[di] == null ? 'NULL' : String(r[di])) : ''
          let d = districts.get(key)
          if (!d) { d = { name: key, total: 0, rows: [] }; districts.set(key, d) }
          d.total += ground_(a)
          d.rows.push(i)
        })
        if (!districts.size) { message(root, 'No row has a positive footprint to build on.'); return }
        if (left) ctx.log(`City 3D: ${left} of ${rows.length} rows left out, with no positive footprint`)
        const ds = [...districts.values()].sort((a, b) => b.total - a.total)
        for (const d of ds) d.rows.sort((a, b) => num(rows[b][ai]) - num(rows[a][ai]))

        // Heights: from the lowest to the tallest, a building with no height
        // value standing at the lowest.
        let hMax = 0
        if (hi_ >= 0) for (const r of rows) { const v = num(r[hi_]); if (Number.isFinite(v) && v > hMax) hMax = v }
        const heightOf = (/** @type {number} */ i) => {
          if (hi_ < 0) return SIDE * 0.06
          const v = num(rows[i][hi_])
          return SIDE * (LOWEST * 0.25 + (Number.isFinite(v) && v > 0 && hMax > 0 ? (v / hMax) * TALLEST : 0))
        }

        const s = createStage(root, ctx, { maxPolar: Math.PI * 0.48 })
        stage = s
        const th = s.theme

        // Colour: a number along the chosen ramp (an empty value muted), a
        // category a colour each, the most frequent first; by default the
        // district's own colour.
        const stops = inputs.ramp === 'alarm' ? th.alarm : th.ramp
        const numeric = ci >= 0 && /int|numeric|decimal|real|double|float|money/i.test(cols[ci].type || '')
        let cLo = Infinity, cHi = -Infinity
        if (numeric) for (const r of rows) { const v = num(r[ci]); if (Number.isFinite(v)) { if (v < cLo) cLo = v; if (v > cHi) cHi = v } }
        /** @type {Map<string, number>} */
        const cats = new Map()
        if (ci >= 0 && !numeric) {
          /** @type {Map<string, number>} */
          const freq = new Map()
          for (const r of rows) { const k = r[ci] == null ? 'NULL' : String(r[ci]); freq.set(k, (freq.get(k) || 0) + 1) }
          ;[...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CATS).forEach(([k], i) => cats.set(k, i))
        }
        const districtIndex = new Map(ds.map((d, i) => [d.name, i]))
        const colorOf = (/** @type {number} */ i) => {
          const r = rows[i]
          if (numeric) {
            const v = num(r[ci])
            return Number.isFinite(v) ? colorRamp(stops, (v - cLo) / (cHi - cLo || 1)) : new THREE.Color(th.muted)
          }
          if (ci >= 0) {
            const c = cats.get(r[ci] == null ? 'NULL' : String(r[ci]))
            return new THREE.Color(c === undefined ? th.muted : th.series[c % th.series.length])
          }
          const d = districtIndex.get(di >= 0 ? (r[di] == null ? 'NULL' : String(r[di])) : '') ?? 0
          return new THREE.Color(th.series[d % th.series.length])
        }

        // The plan: districts share out the city, buildings their district.
        const half = SIDE / 2
        const plots = squarify(ds.map((d) => d.total), -half, -half, SIDE, SIDE)
        /** @type {{ row: number, district: string, x: number, z: number, w: number, d: number, h: number }[]} */
        const buildings = []
        /** @type {{ name: string, x: number, z: number, w: number, d: number }[]} */
        const plates = []
        ds.forEach((d, di2) => {
          const p = plots[di2]
          const inset = Math.min(STREET, p.w / 6, p.h / 6)
          const ix = p.x + inset, iz = p.y + inset, iw = p.w - inset * 2, id = p.h - inset * 2
          if (iw <= 0 || id <= 0) return
          plates.push({ name: d.name, x: ix, z: iz, w: iw, d: id })
          const cells = squarify(d.rows.map((i) => ground_(num(rows[i][ai]))), ix, iz, iw, id)
          d.rows.forEach((i, k) => {
            const c = cells[k]
            const g = Math.min(GAP, c.w / 4, c.h / 4)
            const w = c.w - g * 2, dd = c.h - g * 2
            if (w <= 0 || dd <= 0) return
            buildings.push({ row: i, district: d.name, x: c.x + g + w / 2, z: c.y + g + dd / 2, w, d: dd, h: heightOf(i) })
          })
        })
        if (!buildings.length) { message(root, 'Nothing large enough to build.'); return }
        const aName = cols[ai].name
        csv = [[...(di >= 0 ? [cols[di].name] : []), ...(ni >= 0 ? [cols[ni].name] : []), aName, ...(hi_ >= 0 ? [cols[hi_].name] : []), ...(ci >= 0 ? [cols[ci].name] : [])].map(csvCell).join(',')]
          .concat(buildings.map((b) => { const r = rows[b.row]; return [...(di >= 0 ? [r[di]] : []), ...(ni >= 0 ? [r[ni]] : []), r[ai], ...(hi_ >= 0 ? [r[hi_]] : []), ...(ci >= 0 ? [r[ci]] : [])].map(csvCell).join(',') }))
          .join('\n')

        // The ground: one slab per district, just above the plain.
        const slab = new THREE.BoxGeometry(1, 1, 1)
        slab.translate(0, 0.5, 0)
        const ground = new THREE.InstancedMesh(slab, new THREE.MeshStandardMaterial({ color: th.dark ? '#2a2d3d' : '#e3e5ea', roughness: 0.9 }), plates.length)
        const m4 = new THREE.Matrix4()
        plates.forEach((p, i) => {
          m4.makeScale(p.w, 0.06, p.d).setPosition(p.x + p.w / 2, 0, p.z + p.d / 2)
          ground.setMatrixAt(i, m4)
        })
        s.scene.add(ground)
        s.segments([-half, 0, -half, half, 0, -half, half, 0, -half, half, 0, half, half, 0, half, -half, 0, half, -half, 0, half, -half, 0, -half], th.line, 0.8)

        // The buildings: one instanced box each, a single draw call.
        const mesh = new THREE.InstancedMesh(slab, new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 }), buildings.length)
        const base = buildings.map((b, i) => {
          m4.makeScale(b.w, b.h, b.d).setPosition(b.x, 0.06, b.z)
          mesh.setMatrixAt(i, m4)
          const c = colorOf(b.row)
          mesh.setColorAt(i, c)
          return c
        })
        mesh.computeBoundingSphere()
        s.scene.add(mesh)

        // Names: the districts on their ground, the largest buildings on
        // their roofs; the rest in the tooltip.
        if (di >= 0) plates.slice(0, MAX_CATS * 2).forEach((p) => s.addLabel(p.name, p.x + p.w / 2, 0.1, p.z + p.d + 0.15, { color: th.fg, bold: true, maxWidth: 180, halo: true }))
        if (ni >= 0) {
          ;[...buildings].sort((a, b) => b.w * b.d - a.w * a.d).slice(0, NAMED).forEach((b) => s.addLabel(show(rows[b.row][ni]), b.x, b.h + 0.25, b.z, { color: th.fg, maxWidth: 120, halo: true }))
        }
        if (numeric && Number.isFinite(cLo)) s.legendRamp(cols[ci].name, fmtTick(cLo), fmtTick(cHi), stops)
        else if (ci >= 0) s.legendCategories(cols[ci].name, [...cats.keys()].map((k, i) => ({ name: k, color: th.series[i % th.series.length] })))
        else if (di >= 0) s.legendCategories(cols[di].name, ds.slice(0, MAX_CATS).map((d, i) => ({ name: d.name, color: th.series[i % th.series.length] })))

        s.controls.minDistance = 2
        s.controls.maxDistance = SIDE * 5
        // From the south east and well above: the districts read as a plan,
        // the heights as a skyline.
        s.setHome([SIDE * 0.72, SIDE * 1.1, SIDE * 1.2], [0, 0, SIDE * 0.03])

        // Hover names a building and its numbers; a click selects its row.
        const glow = new THREE.Color(th.dark ? '#ffffff' : '#000000')
        let lit = -1
        const light = (/** @type {number} */ i) => {
          if (lit >= 0 && lit !== i) mesh.setColorAt(lit, base[lit])
          if (i >= 0) mesh.setColorAt(i, base[i].clone().lerp(glow, 0.3))
          lit = i
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
        }
        s.onPointer({
          pick: (_x, _y, _px, _py, ray) => {
            const hit = ray.intersectObject(mesh, false)[0]
            return hit && hit.instanceId !== undefined ? { i: hit.instanceId } : null
          },
          hover: (hit, px, py) => {
            light(hit ? hit.i : -1)
            if (!hit) return
            const b = buildings[hit.i], r = rows[b.row]
            /** @type {[string, string][]} */
            const lines = []
            if (ni >= 0) lines.push([cols[ni].name, show(r[ni])])
            if (di >= 0) lines.push([cols[di].name, show(r[di])])
            lines.push([aName, show(r[ai])])
            if (hi_ >= 0) lines.push([cols[hi_].name, show(r[hi_])])
            if (ci >= 0 && ci !== hi_ && ci !== ai) lines.push([cols[ci].name, show(r[ci])])
            s.tip(lines, px, py)
          },
          click: (hit) => { if (typeof ctx.selectRow === 'function') ctx.selectRow(buildings[hit.i].row) }
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
