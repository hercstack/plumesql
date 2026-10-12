// @ts-check
// @description Shared three.js scene for the 3D chart extensions: orbit, labels, hover and click, points, axes, theme colours (a library, no views of its own)
import * as THREE_NS from 'https://cdn.jsdelivr.net/npm/three@0.186.1/+esm'
import { OrbitControls as ORBIT } from 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/controls/OrbitControls.js/+esm'

// The library itself, for the extensions that build on this one: one copy of
// three.js however many 3D views a result shows. Cast to any, as plot-core's
// Plot is: a chart gains nothing from fighting the CDN types.
export const THREE = /** @type {any} */ (THREE_NS)
export const OrbitControls = /** @type {any} */ (ORBIT)

// ─── Values ──────────────────────────────────────────────────────────────────
// A cell as a number: NULL and '' are missing, never 0, which Number(null)
// would make them.
export const num = (/** @type {unknown} */ v) => (v == null || v === '' ? NaN : Number(v))
export const esc = (/** @type {unknown} */ s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c)
export const csvCell = (/** @type {unknown} */ v) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
// A tick or a value read short: 1.2k, 3.4M, 5G.
export const fmtTick = (/** @type {unknown} */ v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  const a = Math.abs(n)
  const t = (/** @type {number} */ x) => String(Number(x.toFixed(1)))
  return a >= 1e12 ? t(n / 1e12) + 'T' : a >= 1e9 ? t(n / 1e9) + 'G' : a >= 1e6 ? t(n / 1e6) + 'M' : a >= 1e3 ? t(n / 1e3) + 'k' : String(Number(n.toPrecision(4)))
}
// Round steps covering [lo, hi], about n of them.
export const ticks = (/** @type {number} */ lo, /** @type {number} */ hi, /** @type {number} */ n) => {
  const span = hi - lo || 1
  const raw = span / n
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag
  const out = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v)
  return out
}
export const colIndex = (/** @type {{ name: string }[]} */ cols, /** @type {unknown} */ name) => cols.findIndex((c) => c.name === name)
// A calm line in place of the chart: what is missing, and where to set it.
export const message = (/** @type {HTMLElement} */ root, /** @type {string} */ text) => {
  root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif">' + esc(text) + '</div>'
}

// The view's first window is capped (extensions.viewRowCap); the rest comes
// in through ctx.rows, in PAGES, up to `top` rows.
export const loadRows = async (/** @type {any} */ data, /** @type {any} */ ctx, /** @type {number} */ top) => {
  let rows = data.rows || []
  if (top > rows.length && typeof ctx.rows === 'function') {
    try {
      const out = rows.slice()
      while (out.length < top) {
        const page = await ctx.rows(out.length, Math.min(200000, top - out.length))
        if (!page || page.length === 0) break
        for (const r of page) out.push(r)
      }
      rows = out
    } catch (e) {
      ctx.log('ctx.rows: ' + e)
    }
  }
  return rows.slice(0, top)
}

// ─── Theme ───────────────────────────────────────────────────────────────────
// The colours a 3D view paints with. Under Dark and Light, the curated set the
// charts were drawn against; under a theme extension, that theme's own roles
// (ctx.palette), so Nord or Solarized recolour the bars, the points and the
// labels alike.
const VIVID = ['#7aa2f7', '#f7768e', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#ff9e64', '#41a6b5', '#c0caf5', '#73daca', '#db4b4b', '#ff007c']
/**
 * @typedef {{ dark: boolean, fg: string, muted: string, pane: string, line: string, accent: string,
 *   series: string[], ramp: string[], alarm: string[] }} Theme
 */
/** @returns {Theme} */
export const themeOf = (/** @type {any} */ ctx) => {
  const dark = ctx.theme !== 'light'
  const p = ctx.palette && ctx.palette.id !== 'dark' && ctx.palette.id !== 'light' ? ctx.palette : null
  if (!p) {
    return {
      dark,
      fg: dark ? '#c8d3f5' : '#3a3f4b',
      muted: dark ? '#8a92a6' : '#6b7280',
      pane: dark ? '#1f2030' : '#f4f5f8',
      line: dark ? '#3b3f52' : '#d4d7de',
      accent: dark ? '#7aa2f7' : '#5a8bf0',
      series: VIVID,
      // Low to high: blue, amber, red.
      ramp: ['#7aa2f7', '#e0af68', '#f7768e'],
      // Good to bad: green, amber, red.
      alarm: ['#9ece6a', '#e0af68', '#f7768e']
    }
  }
  const pick = (/** @type {string[]} */ keys) => [...new Set(keys.map((k) => p[k]).filter((c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)))]
  const series = pick(['accent', 'red', 'green', 'amber', 'violet', 'keyword', 'string', 'number', 'type', 'func', 'comment'])
  return {
    dark,
    fg: p.text,
    muted: p.muted,
    pane: p.background,
    line: p.border,
    accent: p.accent,
    series: series.length ? series : VIVID,
    ramp: pick(['accent', 'amber', 'red']),
    alarm: pick(['green', 'amber', 'red'])
  }
}
// A colour along a ramp, t from 0 to 1, as a THREE.Color.
export const colorRamp = (/** @type {string[]} */ stops, /** @type {number} */ t) => {
  const u = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(u))
  if (stops.length < 2) return new THREE.Color(stops[0] || '#888888')
  return new THREE.Color(stops[i]).lerp(new THREE.Color(stops[i + 1]), u - i)
}
// The same ramp as a CSS gradient, for a legend.
export const cssRamp = (/** @type {string[]} */ stops) => 'linear-gradient(90deg,' + stops.join(',') + ')'
// A hex colour as display (sRGB) components 0..1, what a points shader paints
// as is: the renderer converts only its own materials' output.
export const rgb01 = (/** @type {string} */ hex) => {
  const h = String(hex).replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16) || 0
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
// A ramp colour as display components, for the points shader.
export const rampRgb01 = (/** @type {string[]} */ stops, /** @type {number} */ t) => {
  const u = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(u))
  if (stops.length < 2) return rgb01(stops[0] || '#888888')
  const a = rgb01(stops[i]), b = rgb01(stops[i + 1]), f = u - i
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

// ─── The stage ───────────────────────────────────────────────────────────────
// One live scene per view: a renderer on a canvas filling the root, a
// perspective camera with OrbitControls (left button orbits, right button or
// Shift pans, wheel zooms, the arrow keys pan once the canvas has focus),
// labels as HTML over the canvas, a tooltip, hover and click with a drag never
// taken for a click, and a frame drawn only when something moved. A view keeps
// the stage of its last draw and disposes it before the next, so no WebGL
// context is left behind.
/**
 * @typedef {{ at: any, el: HTMLElement, align: 'center' | 'right' | 'left', w: number }} Label
 * @typedef {{ i: number, [k: string]: unknown }} Hit
 * @typedef {{ pick: (ndcX: number, ndcY: number, px: number, py: number, ray: any) => (Hit | null), hover?: (hit: Hit | null, px: number, py: number) => void, click?: (hit: Hit, e: PointerEvent) => void }} PointerHandlers
 */
export const createStage = (/** @type {HTMLElement} */ root, /** @type {any} */ ctx, /** @type {{ fov?: number, maxPolar?: number, lights?: boolean }} */ opts = {}) => {
  const theme = themeOf(ctx)
  const W = root.clientWidth || 640, H = root.clientHeight || 360
  root.innerHTML = ''
  root.style.position = 'relative'
  root.style.overflow = 'hidden'
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.max(1, Math.min(3, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1)))
  renderer.setSize(W, H)
  renderer.setClearColor(0x000000, 0)
  const canvas = renderer.domElement
  canvas.style.cssText = 'display:block;outline:none;cursor:grab;touch-action:none'
  canvas.tabIndex = 0
  root.appendChild(canvas)

  const scene = new THREE.Scene()
  if (opts.lights !== false) {
    scene.add(new THREE.HemisphereLight(0xffffff, theme.dark ? 0x30344a : 0xb8bcc8, theme.dark ? 1.6 : 1.9))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(0.6, 2, 1.4)
    scene.add(sun)
  }
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 40, W / H, 0.05, 5000)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.12
  if (opts.maxPolar !== undefined) controls.maxPolarAngle = opts.maxPolar
  controls.listenToKeyEvents(canvas)

  // Labels: HTML over the canvas, placed by projecting their 3D anchor each
  // frame, crisp at any zoom and in the theme's colours. (Copy as Image takes
  // the canvas, so the picture has no labels.)
  const layer = document.createElement('div')
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;font:11px system-ui,sans-serif;color:' + theme.muted
  root.appendChild(layer)
  /** @type {Label[]} */
  let labels = []
  const tipEl = document.createElement('div')
  tipEl.style.cssText = 'position:absolute;display:none;pointer-events:none;font:11px system-ui,sans-serif;color:' + theme.fg + ';background:' + theme.pane + ';border:1px solid ' + theme.line + ';border-radius:5px;padding:5px 8px;white-space:nowrap;max-width:420px;overflow:hidden;text-overflow:ellipsis;z-index:3'
  root.appendChild(tipEl)

  /** @type {(() => void)[]} */
  const frameHooks = []
  const v3 = new THREE.Vector3()
  const placeLabels = () => {
    const w = root.clientWidth || W, h = root.clientHeight || H
    for (const l of labels) {
      v3.copy(l.at).project(camera)
      if (v3.z > 1 || v3.z < -1) {
        l.el.style.display = 'none'
        continue
      }
      l.el.style.display = ''
      if (!l.w) l.w = l.el.offsetWidth
      const px = (v3.x * 0.5 + 0.5) * w, py = (-v3.y * 0.5 + 0.5) * h
      // Kept inside the view: an axis name at the left edge stayed half out.
      const at = l.align === 'right' ? px - l.w : l.align === 'left' ? px : px - l.w / 2
      const x = Math.max(2, Math.min(w - l.w - 2, at))
      l.el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(py - 7) + 'px)'
    }
  }

  let alive = true
  let pending = false
  let raf = 0
  // A slow turn around the target (the Spin action): motion is what makes a
  // cloud's depth readable. A press on the canvas stops it.
  let spinning = false
  const draw = () => {
    for (const f of frameHooks) f()
    renderer.render(scene, camera)
    placeLabels()
  }
  const frame = () => {
    raf = 0
    pending = false
    if (!alive) return
    // With damping on, update() emits change again until the motion settles.
    controls.update()
    draw()
    if (spinning) request()
  }
  const request = () => {
    if (!alive || pending) return
    pending = true
    raf = requestAnimationFrame(frame)
  }
  controls.addEventListener('change', request)

  let homePos = new THREE.Vector3(6, 5, 8)
  let homeTarget = new THREE.Vector3(0, 0, 0)
  const reset = () => {
    controls.target.copy(homeTarget)
    camera.position.copy(homePos)
    camera.lookAt(homeTarget)
    controls.update()
    request()
  }

  /** @type {PointerHandlers | null} */
  let handlers = null
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  /** @type {{ x: number, y: number, button: number } | null} */
  let down = null
  /** @type {Hit | null} */
  let hovered = null
  const hitAt = (/** @type {PointerEvent} */ e) => {
    if (!handlers) return { hit: null, px: 0, py: 0 }
    const r = canvas.getBoundingClientRect()
    const px = e.clientX - r.left, py = e.clientY - r.top
    ndc.set((px / r.width) * 2 - 1, -(py / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    return { hit: handlers.pick(ndc.x, ndc.y, px, py, ray), px, py }
  }
  const setHover = (/** @type {Hit | null} */ hit, /** @type {number} */ px, /** @type {number} */ py) => {
    const same = hit && hovered && hit.i === hovered.i
    hovered = hit
    canvas.style.cursor = hit ? 'pointer' : down ? 'grabbing' : 'grab'
    if (handlers && handlers.hover && (!same || hit)) handlers.hover(hit, px, py)
    if (!hit) tipEl.style.display = 'none'
    request()
  }
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, button: e.button }
    if (spinning) stage.spin(false)
    canvas.focus({ preventScroll: true })
    setHover(null, 0, 0)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (down || !handlers || spinning) return
    const p = hitAt(e)
    setHover(p.hit, p.px, p.py)
  })
  canvas.addEventListener('pointerup', (e) => {
    const d = down
    down = null
    // A drag (an orbit, a pan) is not a click.
    if (!d || d.button !== 0 || Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4 || !handlers) {
      setHover(null, 0, 0)
      return
    }
    const p = hitAt(e)
    if (p.hit && handlers.click) handlers.click(p.hit, e)
    setHover(p.hit, p.px, p.py)
  })
  canvas.addEventListener('pointerleave', () => {
    if (!down) setHover(null, 0, 0)
  })
  canvas.addEventListener('dblclick', () => reset())
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'Home' || e.key === '0') {
      e.preventDefault()
      reset()
    }
  })

  const stage = {
    THREE,
    theme,
    root,
    renderer,
    scene,
    camera,
    controls,
    canvas,
    layer,
    request,
    draw,
    reset,
    get alive() {
      return alive
    },
    // Turn slowly around the target, or stop; no argument toggles. Answers
    // whether it spins now.
    spin(/** @type {boolean | undefined} */ on) {
      spinning = on === undefined ? !spinning : on
      controls.autoRotate = spinning
      controls.autoRotateSpeed = 2
      if (spinning) setHover(null, 0, 0)
      request()
      return spinning
    },
    // Where the camera stands at first and after a reset (a double-click,
    // Home or 0, the header's Reset camera).
    setHome(/** @type {number[]} */ position, /** @type {number[]} */ target) {
      homePos = new THREE.Vector3(position[0], position[1], position[2])
      homeTarget = new THREE.Vector3(target[0], target[1], target[2])
      reset()
    },
    // A label anchored at a point of the scene; `color` paints it in a role
    // colour (the theme's text for a name, the muted for a tick), and `halo`
    // rings it in the pane's colour, for a label that stands over a coloured
    // shape (a roof) rather than the empty ground.
    addLabel(/** @type {string} */ text, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z, /** @type {{ color?: string, align?: 'center' | 'right' | 'left', maxWidth?: number, bold?: boolean, halo?: boolean }} */ o = {}) {
      const el = document.createElement('div')
      el.textContent = text
      el.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;max-width:' + (o.maxWidth ?? 140) + 'px;overflow:hidden;text-overflow:ellipsis;will-change:transform' + (o.color ? ';color:' + o.color : '') + (o.bold ? ';font-weight:600' : '') + (o.halo ? ';text-shadow:0 0 3px ' + theme.pane + ',0 0 2px ' + theme.pane + ',0 0 1px ' + theme.pane : '')
      layer.appendChild(el)
      /** @type {Label} */
      const l = { el, at: new THREE.Vector3(x, y, z), align: o.align ?? 'center', w: 0 }
      labels.push(l)
      return l
    },
    clearLabels() {
      for (const l of labels) l.el.remove()
      labels = []
    },
    // The tooltip: rows of a name (muted) and a value, near the pointer.
    tip(/** @type {[string, string][] | null} */ rows, /** @type {number} */ px, /** @type {number} */ py) {
      if (!rows || !rows.length) {
        tipEl.style.display = 'none'
        return
      }
      tipEl.innerHTML = rows.map(([k, v]) => (k ? '<span style="color:' + theme.muted + '">' + esc(k) + '</span> ' : '') + esc(v)).join('<br>')
      tipEl.style.display = ''
      const w = root.clientWidth || W, h = root.clientHeight || H
      tipEl.style.left = Math.max(0, px + 14 + tipEl.offsetWidth > w ? px - tipEl.offsetWidth - 10 : px + 14) + 'px'
      tipEl.style.top = Math.max(0, Math.min(h - tipEl.offsetHeight, py + 12)) + 'px'
    },
    // Called on every drawn frame, before the scene is rendered: an axis that
    // moves with the camera, a label set that follows.
    onFrame(/** @type {() => void} */ fn) {
      frameHooks.push(fn)
    },
    onPointer(/** @type {PointerHandlers} */ h) {
      handlers = h
    },
    // A set of line segments, pairs of points, in one draw call.
    segments(/** @type {number[]} */ pts, /** @type {string} */ color, /** @type {number} */ opacity = 1) {
      const o = new THREE.LineSegments(
        new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
        new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })
      )
      scene.add(o)
      return o
    },
    // A legend in the top right corner: a ramp from lo to hi.
    legendRamp(/** @type {string} */ title, /** @type {string} */ lo, /** @type {string} */ hi, /** @type {string[]} */ stops) {
      const lg = document.createElement('div')
      lg.style.cssText = 'position:absolute;top:10px;right:12px;font:11px system-ui,sans-serif;color:' + theme.fg + ';background:' + theme.pane + ';border:1px solid ' + theme.line + ';border-radius:5px;padding:5px 8px;display:flex;align-items:center;gap:6px;pointer-events:none;z-index:2'
      lg.innerHTML = (title ? '<span style="color:' + theme.muted + '">' + esc(title) + '</span>' : '') + esc(lo) + '<span style="width:70px;height:8px;border-radius:2px;background:' + cssRamp(stops) + '"></span>' + esc(hi)
      root.appendChild(lg)
      return lg
    },
    // A legend of categories, each a swatch and a name; with `onToggle`, a
    // click on one hides or shows it (its row dims while hidden).
    legendCategories(/** @type {string} */ title, /** @type {{ name: string, color: string, count?: number }[]} */ entries, /** @type {((index: number, shown: boolean) => void) | undefined} */ onToggle) {
      const lg = document.createElement('div')
      lg.style.cssText = 'position:absolute;top:10px;right:12px;max-height:calc(100% - 20px);overflow:auto;font:11px system-ui,sans-serif;color:' + theme.fg + ';background:' + theme.pane + ';border:1px solid ' + theme.line + ';border-radius:5px;padding:5px 8px;z-index:2;' + (onToggle ? '' : 'pointer-events:none')
      if (title) {
        const t = document.createElement('div')
        t.textContent = title
        t.style.cssText = 'color:' + theme.muted + ';margin-bottom:3px'
        lg.appendChild(t)
      }
      entries.forEach((e, i) => {
        const row = document.createElement('div')
        row.style.cssText = 'display:flex;align-items:center;gap:6px;line-height:17px;white-space:nowrap;' + (onToggle ? 'cursor:pointer' : '')
        row.innerHTML = '<span style="width:9px;height:9px;border-radius:50%;flex:none;background:' + e.color + '"></span><span style="max-width:160px;overflow:hidden;text-overflow:ellipsis">' + esc(e.name) + '</span>' + (e.count !== undefined ? '<span style="color:' + theme.muted + '">' + esc(e.count) + '</span>' : '')
        let shown = true
        if (onToggle) {
          row.title = 'Click to hide or show'
          row.addEventListener('click', () => {
            shown = !shown
            row.style.opacity = shown ? '1' : '0.35'
            onToggle(i, shown)
          })
        }
        lg.appendChild(row)
      })
      root.appendChild(lg)
      return lg
    },
    resize(/** @type {number} */ width, /** @type {number} */ height) {
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
      for (const l of labels) l.w = 0
      request()
    },
    dispose() {
      if (!alive) return
      alive = false
      cancelAnimationFrame(raf)
      controls.dispose()
      scene.traverse((/** @type {any} */ o) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((/** @type {any} */ m) => m.dispose())
      })
      renderer.dispose()
      renderer.forceContextLoss()
    }
  }
  return stage
}
/** @typedef {ReturnType<typeof createStage>} Stage */

// ─── Points ──────────────────────────────────────────────────────────────────
// A cloud of round points in one draw call, each with its own colour (display
// components, rgb01) and size in CSS pixels, the same at any zoom so a cluster
// stays readable up close. `hidden` (one byte per point, 1 hides it) is how a
// legend toggles a category.
export const makePoints = (/** @type {Stage} */ stage, /** @type {Float32Array} */ positions, /** @type {Float32Array} */ colors, /** @type {Float32Array} */ sizes, /** @type {{ opacity?: number }} */ o = {}) => {
  const n = positions.length / 3
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  const hidden = new Float32Array(n)
  geo.setAttribute('aHidden', new THREE.BufferAttribute(hidden, 1))
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: { uScale: { value: stage.renderer.getPixelRatio() }, uOpacity: { value: o.opacity ?? 0.92 } },
    vertexShader:
      'attribute vec3 aColor; attribute float aSize; attribute float aHidden; uniform float uScale; varying vec3 vColor; varying float vHidden;' +
      'void main(){ vColor = aColor; vHidden = aHidden; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aHidden > 0.5 ? 0.0 : aSize * uScale; }',
    fragmentShader:
      'uniform float uOpacity; varying vec3 vColor; varying float vHidden;' +
      'void main(){ if (vHidden > 0.5) discard; vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard;' +
      ' float edge = smoothstep(0.25, 0.19, d); float rim = smoothstep(0.13, 0.19, d) * 0.22; gl_FragColor = vec4(vColor * (1.0 - rim), uOpacity * edge); }'
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  stage.scene.add(points)
  return {
    points,
    count: n,
    hidden,
    // Hide or show the points of a mask (1 hides), then redraw.
    setHidden(/** @type {(i: number) => boolean} */ isHidden) {
      for (let i = 0; i < n; i++) hidden[i] = isHidden(i) ? 1 : 0
      geo.attributes.aHidden.needsUpdate = true
      stage.request()
    }
  }
}

// The point under the pointer, in screen space: the cloud is projected into a
// grid of 24 px cells once the camera has settled and a pointer moves, so a
// hover over a million points is a lookup, not a ray through every one.
export const pointPicker = (/** @type {Stage} */ stage, /** @type {Float32Array} */ positions, /** @type {Float32Array} */ sizes, /** @type {Float32Array | null} */ hidden) => {
  const n = positions.length / 3
  const CELL = 24
  /** @type {Map<number, number[]>} */
  let grid = new Map()
  let sx = new Float32Array(n), sy = new Float32Array(n), sz = new Float32Array(n)
  let dirty = true
  stage.controls.addEventListener('change', () => {
    dirty = true
  })
  const build = () => {
    dirty = false
    grid = new Map()
    const cam = stage.camera
    cam.updateMatrixWorld()
    const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements
    const w = stage.canvas.clientWidth, h = stage.canvas.clientHeight
    for (let i = 0; i < n; i++) {
      if (hidden && hidden[i] > 0.5) {
        sz[i] = 2
        continue
      }
      const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2]
      const cw = m[3] * x + m[7] * y + m[11] * z + m[15]
      const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / cw
      const ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw
      const nz = (m[2] * x + m[6] * y + m[10] * z + m[14]) / cw
      sz[i] = nz
      if (nz < -1 || nz > 1 || cw <= 0) continue
      const px = (nx * 0.5 + 0.5) * w, py = (-ny * 0.5 + 0.5) * h
      sx[i] = px
      sy[i] = py
      const key = Math.floor(px / CELL) * 65536 + Math.floor(py / CELL)
      const cell = grid.get(key)
      if (cell) cell.push(i)
      else grid.set(key, [i])
    }
  }
  return {
    invalidate() {
      dirty = true
    },
    // The nearest point within its own radius (plus a little), the one in
    // front when two overlap; -1 when none.
    pick(/** @type {number} */ px, /** @type {number} */ py) {
      if (dirty) build()
      const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL)
      let best = -1, bestD = Infinity, bestZ = Infinity
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cell = grid.get((cx + dx) * 65536 + (cy + dy))
          if (!cell) continue
          for (const i of cell) {
            const r = sizes[i] / 2 + 3
            const d = (sx[i] - px) ** 2 + (sy[i] - py) ** 2
            if (d > r * r) continue
            if (d < bestD - 4 || (Math.abs(d - bestD) <= 4 && sz[i] < bestZ)) {
              best = i
              bestD = d
              bestZ = sz[i]
            }
          }
        }
      }
      return best
    }
  }
}

// A ring around one point (the hovered or the picked one), drawn over
// everything; `set(null)` hides it.
export const pointMarker = (/** @type {Stage} */ stage, /** @type {string} */ color) => {
  const pos = new Float32Array(3)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const [r, g, b] = rgb01(color)
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    uniforms: { uSize: { value: 16 * stage.renderer.getPixelRatio() } },
    vertexShader: 'uniform float uSize; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = uSize; }',
    fragmentShader: 'void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5 || d < 0.36) discard; gl_FragColor = vec4(' + [r, g, b].map((v) => v.toFixed(3)).join(',') + ', 1.0); }'
  })
  const o = new THREE.Points(geo, mat)
  o.renderOrder = 10
  o.visible = false
  o.frustumCulled = false
  stage.scene.add(o)
  return {
    set(/** @type {number[] | null} */ at, /** @type {number} */ sizePx = 10) {
      if (!at) o.visible = false
      else {
        pos[0] = at[0]
        pos[1] = at[1]
        pos[2] = at[2]
        geo.attributes.position.needsUpdate = true
        mat.uniforms.uSize.value = (sizePx + 8) * stage.renderer.getPixelRatio()
        o.visible = true
      }
      stage.request()
    }
  }
}

// ─── An axes box ─────────────────────────────────────────────────────────────
// The cube a cloud of points lives in, [-half, half] on every axis: its
// edges faint, and each axis's ticks and name on the edge that faces the
// viewer, chosen again as the camera turns (the bottom edge nearest the front
// for X and Z, the upright edge furthest left for Y), so no orbit hides an
// axis behind the cloud.
/**
 * @typedef {{ name: string, ticks: { at: number, label: string }[] }} AxisSpec
 */
export const axesBox = (/** @type {Stage} */ stage, /** @type {number} */ half, /** @type {[AxisSpec, AxisSpec, AxisSpec]} */ axes) => {
  const s = half
  const c = [-s, s]
  const edges = []
  for (const y of c) for (const z of c) edges.push(-s, y, z, s, y, z)
  for (const x of c) for (const z of c) edges.push(x, -s, z, x, s, z)
  for (const x of c) for (const y of c) edges.push(x, y, -s, x, y, s)
  stage.segments(edges, stage.theme.line, 0.9)
  // The tick marks are labels alone: a mark drawn in 3D would hang off
  // whichever edge the axis left.
  const th = stage.theme
  /** @type {{ axis: number, label: Label, at: number, name: boolean }[]} */
  const placed = []
  axes.forEach((a, axis) => {
    for (const t of a.ticks) placed.push({ axis, label: stage.addLabel(t.label, 0, 0, 0, { align: axis === 1 ? 'right' : 'center' }), at: t.at, name: false })
    placed.push({ axis, label: stage.addLabel(a.name, 0, 0, 0, { color: th.fg, align: axis === 1 ? 'right' : 'center', maxWidth: 200 }), at: 0, name: true })
  })
  const v = new THREE.Vector3()
  const screen = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => {
    v.set(x, y, z).project(stage.camera)
    return v
  }
  stage.onFrame(() => {
    // X: of the bottom edges along x (y = -s, z = ±s), the one lower on
    // screen; Z likewise (x = ±s); Y: of the upright edges, the leftmost.
    const xz = screen(0, -s, s).y < screen(0, -s, -s).y ? s : -s
    const zx = screen(s, -s, 0).y < screen(-s, -s, 0).y ? s : -s
    let yx = -s, yz = s, best = Infinity
    for (const x of c) for (const z of c) {
      const p = screen(x, 0, z)
      if (p.x < best) {
        best = p.x
        yx = x
        yz = z
      }
    }
    const out = 0.09 * s
    for (const p of placed) {
      const pos = p.name ? 0 : p.at
      if (p.axis === 0) p.label.at.set(pos, -s - (p.name ? out * 3.2 : out * 1.2), xz + Math.sign(xz) * out)
      else if (p.axis === 2) p.label.at.set(zx + Math.sign(zx) * out, -s - (p.name ? out * 3.2 : out * 1.2), pos)
      else p.label.at.set(yx + Math.sign(yx) * out, p.name ? s + out * 1.6 : pos, yz + Math.sign(yz) * out)
    }
  })
}

// A linear or logarithmic scale of a value to [-half, half]: its ticks too.
// A log scale drops the values that are not positive (the caller counts them).
export const axisScale = (/** @type {number[]} */ values, /** @type {'linear' | 'log'} */ kind, /** @type {number} */ half) => {
  const log = kind === 'log'
  let lo = Infinity, hi = -Infinity
  for (const raw of values) {
    if (!Number.isFinite(raw) || (log && raw <= 0)) continue
    const v = log ? Math.log10(raw) : raw
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (!Number.isFinite(lo)) {
    lo = 0
    hi = 1
  }
  if (hi - lo < 1e-12) {
    lo -= 0.5
    hi += 0.5
  }
  const map = (/** @type {number} */ raw) => {
    if (!Number.isFinite(raw) || (log && raw <= 0)) return NaN
    const v = log ? Math.log10(raw) : raw
    return ((v - lo) / (hi - lo)) * 2 * half - half
  }
  /** @type {{ at: number, label: string }[]} */
  const tickList = []
  if (log) {
    for (let e = Math.ceil(lo); e <= Math.floor(hi); e++) tickList.push({ at: ((e - lo) / (hi - lo)) * 2 * half - half, label: fmtTick(Math.pow(10, e)) })
    if (tickList.length < 2) for (const t of ticks(lo, hi, 4)) tickList.push({ at: ((t - lo) / (hi - lo)) * 2 * half - half, label: fmtTick(Math.pow(10, t)) })
  } else for (const t of ticks(lo, hi, 5)) tickList.push({ at: ((t - lo) / (hi - lo)) * 2 * half - half, label: fmtTick(t) })
  return { map, ticks: tickList, lo, hi }
}

// A library: no rules and no views of its own.
export default { rules: [], views: [] }
