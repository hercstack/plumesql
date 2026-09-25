// @ts-check
// @description A million points on the GPU: pan, zoom, hover the nearest row and click to select it (hand written WebGL)
// @color purple
const palette = ['#7aa2f7', '#f7768e', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#ff9e64', '#41a6b5', '#c0caf5', '#73daca', '#db4b4b', '#ff007c']
const fmtTick = (v) => { const n = Number(v); if (!Number.isFinite(n)) return ''; const a = Math.abs(n); const t = (x) => String(Number(x.toFixed(1))); return a >= 1e9 ? t(n / 1e9) + 'G' : a >= 1e6 ? t(n / 1e6) + 'M' : a >= 1e3 ? t(n / 1e3) + 'k' : String(Number(n.toPrecision(4))) }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c)
const rgb = (hex) => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255]
const ticks = (lo, hi, n) => { const span = hi - lo || 1; const raw = span / n; const mag = Math.pow(10, Math.floor(Math.log10(raw))); const norm = raw / mag; const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag; const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(v); return out }

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Scatter GL',
      inputs: [
        { key: 'x', kind: 'column', label: 'X', types: ['numeric'] },
        { key: 'y', kind: 'column', label: 'Y', types: ['numeric'] },
        { key: 'color', kind: 'column', label: 'Colour', default: '', description: 'Column the points are coloured by' },
        { key: 'size', kind: 'number', label: 'Point size (px)', default: '3' },
        { key: 'top', kind: 'number', label: 'Top rows', default: '1000000', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const xi = cols.findIndex((c) => c.name === inputs.x), yi = cols.findIndex((c) => c.name === inputs.y), ci = cols.findIndex((c) => c.name === inputs.color)
        if (xi < 0 || yi < 0) { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif">Pick a numeric X and Y (the sliders button in the header).</div>'; return }
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
        const dark = ctx.theme !== 'light'
        const fg = dark ? '#c8d3f5' : '#3a3f4b', mut = dark ? '#8a92a6' : '#6b7280', line = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)', pane = dark ? '#1f2030' : '#f4f5f8'
        const n0 = rows.length
        const xs = new Float64Array(n0), ys = new Float64Array(n0), rowOf = new Int32Array(n0)
        let n = 0, xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity
        for (let i = 0; i < n0; i++) {
          const x = Number(rows[i][xi]), y = Number(rows[i][yi])
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue
          xs[n] = x; ys[n] = y; rowOf[n] = i; n++
          if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y
        }
        if (!n) { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif">No numeric points to draw.</div>'; return }
        if (xmax === xmin) xmax = xmin + 1
        if (ymax === ymin) ymax = ymin + 1
        const pos = new Float32Array(n * 2), col = new Float32Array(n * 3)
        for (let i = 0; i < n; i++) { pos[2 * i] = (xs[i] - xmin) / (xmax - xmin); pos[2 * i + 1] = (ys[i] - ymin) / (ymax - ymin) }
        /** @type {{ label: string, color: string }[]} */
        const legend = []
        const accent = rgb(dark ? '#7aa2f7' : '#5a8bf0')
        if (ci >= 0 && /int|numeric|decimal|real|double|float|serial/i.test(cols[ci].type)) {
          let lo = Infinity, hi = -Infinity
          for (let i = 0; i < n; i++) { const v = Number(rows[rowOf[i]][ci]); if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v } }
          const a = rgb('#7aa2f7'), b = rgb('#e0af68'), c = rgb('#f7768e')
          for (let i = 0; i < n; i++) {
            const v = Number(rows[rowOf[i]][ci])
            const t = Number.isFinite(v) && hi > lo ? (v - lo) / (hi - lo) : 0.5
            const from = t < 0.5 ? a : b, to = t < 0.5 ? b : c, u = t < 0.5 ? t * 2 : (t - 0.5) * 2
            col[3 * i] = from[0] + (to[0] - from[0]) * u; col[3 * i + 1] = from[1] + (to[1] - from[1]) * u; col[3 * i + 2] = from[2] + (to[2] - from[2]) * u
          }
          legend.push({ label: cols[ci].name + ' ' + fmtTick(lo), color: '#7aa2f7' }, { label: fmtTick((lo + hi) / 2), color: '#e0af68' }, { label: fmtTick(hi), color: '#f7768e' })
        } else if (ci >= 0) {
          const cats = new Map()
          for (let i = 0; i < n; i++) {
            const k = String(rows[rowOf[i]][ci] == null ? '' : rows[rowOf[i]][ci])
            let slot = cats.get(k)
            if (slot === undefined) { slot = cats.size < palette.length ? cats.size : -1; cats.set(k, slot) }
            const c = slot < 0 ? rgb(mut) : rgb(palette[slot])
            col[3 * i] = c[0]; col[3 * i + 1] = c[1]; col[3 * i + 2] = c[2]
          }
          for (const [k, slot] of cats) if (slot >= 0) legend.push({ label: k, color: palette[slot] })
          if (cats.size > palette.length) legend.push({ label: 'other', color: mut })
        } else {
          for (let i = 0; i < n; i++) { col[3 * i] = accent[0]; col[3 * i + 1] = accent[1]; col[3 * i + 2] = accent[2] }
        }
        const W = root.clientWidth || 640, H = root.clientHeight || 360
        const dpr = Math.max(1, Math.min(3, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1))
        const M = { l: 56, r: 16, t: 16, b: 38 }
        const plotW = Math.max(10, W - M.l - M.r), plotH = Math.max(10, H - M.t - M.b)
        root.innerHTML = ''
        root.style.position = 'relative'
        root.style.overflow = 'hidden'
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
        canvas.style.cssText = 'width:' + W + 'px;height:' + H + 'px;display:block;cursor:crosshair;touch-action:none'
        root.appendChild(canvas)
        const gl = typeof canvas.getContext === 'function' ? canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true }) : null
        if (!gl) { root.innerHTML = '<div style="padding:16px;color:#888;font:13px system-ui,sans-serif">WebGL is not available here.</div>'; return }
        const compile = (type, source) => {
          const sh = gl.createShader(type)
          if (!sh) throw new Error('WebGL: no shader')
          gl.shaderSource(sh, source); gl.compileShader(sh)
          if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('WebGL: ' + (gl.getShaderInfoLog(sh) || 'shader'))
          return sh
        }
        const prog = gl.createProgram()
        if (!prog) throw new Error('WebGL: no program')
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, 'attribute vec2 p;attribute vec3 c;uniform vec2 s;uniform vec2 o;uniform float z;varying vec3 vc;void main(){gl_Position=vec4(p*s+o,0.0,1.0);gl_PointSize=z;vc=c;}'))
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, 'precision mediump float;varying vec3 vc;void main(){vec2 d=gl_PointCoord-0.5;float r=dot(d,d);if(r>0.25)discard;float a=(1.0-smoothstep(0.15,0.25,r))*0.85;gl_FragColor=vec4(vc*a,a);}'))
        gl.linkProgram(prog)
        gl.useProgram(prog)
        const buf = (attr, arr, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); const loc = gl.getAttribLocation(prog, attr); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0) }
        buf('p', pos, 2)
        buf('c', col, 3)
        const uS = gl.getUniformLocation(prog, 's'), uO = gl.getUniformLocation(prog, 'o'), uZ = gl.getUniformLocation(prog, 'z')
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        gl.enable(gl.SCISSOR_TEST)
        gl.scissor(Math.round(M.l * dpr), Math.round(M.b * dpr), Math.round(plotW * dpr), Math.round(plotH * dpr))
        gl.viewport(0, 0, canvas.width, canvas.height)
        const size = Math.max(1, Number(inputs.size) || 3) * dpr
        let view = { x0: 0, x1: 1, y0: 0, y1: 1 }
        const ax = document.createElement('canvas')
        ax.width = canvas.width; ax.height = canvas.height
        ax.style.cssText = 'position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;pointer-events:none'
        root.appendChild(ax)
        const c2 = ax.getContext('2d')
        const toPx = (u) => M.l + ((u - view.x0) / (view.x1 - view.x0)) * plotW
        const toPy = (v) => M.t + plotH - ((v - view.y0) / (view.y1 - view.y0)) * plotH
        let hovered = -1
        const drawAxes = () => {
          if (!c2) return
          c2.setTransform(dpr, 0, 0, dpr, 0, 0)
          c2.clearRect(0, 0, W, H)
          c2.font = '11px system-ui, sans-serif'
          c2.strokeStyle = line; c2.lineWidth = 1
          c2.fillStyle = mut
          const dx = (u) => xmin + u * (xmax - xmin), dy = (v) => ymin + v * (ymax - ymin)
          c2.textAlign = 'center'; c2.textBaseline = 'top'
          for (const t of ticks(dx(view.x0), dx(view.x1), Math.max(3, Math.floor(plotW / 90)))) {
            const px = toPx((t - xmin) / (xmax - xmin))
            if (px < M.l - 0.5 || px > M.l + plotW + 0.5) continue
            c2.beginPath(); c2.moveTo(px, M.t); c2.lineTo(px, M.t + plotH); c2.stroke()
            c2.fillText(fmtTick(t), px, M.t + plotH + 6)
          }
          c2.textAlign = 'right'; c2.textBaseline = 'middle'
          for (const t of ticks(dy(view.y0), dy(view.y1), Math.max(3, Math.floor(plotH / 50)))) {
            const py = toPy((t - ymin) / (ymax - ymin))
            if (py < M.t - 0.5 || py > M.t + plotH + 0.5) continue
            c2.beginPath(); c2.moveTo(M.l, py); c2.lineTo(M.l + plotW, py); c2.stroke()
            c2.fillText(fmtTick(t), M.l - 6, py)
          }
          c2.fillStyle = fg
          c2.textAlign = 'center'; c2.textBaseline = 'bottom'
          c2.fillText(cols[xi].name, M.l + plotW / 2, H - 4)
          c2.save(); c2.translate(12, M.t + plotH / 2); c2.rotate(-Math.PI / 2); c2.textBaseline = 'top'; c2.fillText(cols[yi].name, 0, 0); c2.restore()
          c2.strokeStyle = mut
          c2.strokeRect(M.l + 0.5, M.t + 0.5, plotW - 1, plotH - 1)
          if (hovered >= 0) {
            c2.beginPath(); c2.arc(toPx(pos[2 * hovered]), toPy(pos[2 * hovered + 1]), size / dpr + 3, 0, Math.PI * 2)
            c2.strokeStyle = fg; c2.lineWidth = 1.5; c2.stroke()
          }
        }
        const draw = () => {
          const sx = (2 * plotW) / (W * (view.x1 - view.x0)), sy = (2 * plotH) / (H * (view.y1 - view.y0))
          gl.clearColor(0, 0, 0, 0)
          gl.clear(gl.COLOR_BUFFER_BIT)
          gl.uniform2f(uS, sx, sy)
          gl.uniform2f(uO, (2 * M.l) / W - 1 - view.x0 * sx, (2 * M.b) / H - 1 - view.y0 * sy)
          gl.uniform1f(uZ, size)
          gl.drawArrays(gl.POINTS, 0, n)
          drawAxes()
        }
        let raf = 0
        const schedule = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; draw() }) }
        if (legend.length) {
          const lg = document.createElement('div')
          lg.style.cssText = 'position:absolute;top:' + (M.t + 6) + 'px;right:' + (M.r + 6) + 'px;font:11px system-ui,sans-serif;color:' + fg + ';background:' + pane + ';border:1px solid ' + line + ';border-radius:5px;padding:5px 8px;display:flex;flex-direction:column;gap:3px;max-height:40%;overflow:auto'
          lg.innerHTML = legend.map((l) => '<span style="display:flex;align-items:center;gap:6px"><span style="width:9px;height:9px;border-radius:50%;background:' + l.color + '"></span>' + esc(l.label) + '</span>').join('')
          root.appendChild(lg)
        }
        const tip = document.createElement('div')
        tip.style.cssText = 'position:absolute;display:none;pointer-events:none;font:11px system-ui,sans-serif;color:' + fg + ';background:' + pane + ';border:1px solid ' + line + ';border-radius:5px;padding:5px 8px;white-space:nowrap;z-index:2'
        root.appendChild(tip)
        const nearest = (px, py) => {
          let best = -1, bd = 12 * 12
          const kx = plotW / (view.x1 - view.x0), ky = plotH / (view.y1 - view.y0)
          for (let i = 0; i < n; i++) {
            const dx = M.l + (pos[2 * i] - view.x0) * kx - px, dy = M.t + plotH - (pos[2 * i + 1] - view.y0) * ky - py
            const d = dx * dx + dy * dy
            if (d < bd) { bd = d; best = i }
          }
          return best
        }
        let hoverRaf = 0
        const hover = (px, py) => {
          if (hoverRaf) return
          hoverRaf = requestAnimationFrame(() => {
            hoverRaf = 0
            const i = px < M.l || px > M.l + plotW || py < M.t || py > M.t + plotH ? -1 : nearest(px, py)
            if (i === hovered) return
            hovered = i
            if (i < 0) { tip.style.display = 'none'; drawAxes(); return }
            const r = rows[rowOf[i]]
            tip.innerHTML = cols.slice(0, 8).map((c, k) => '<span style="color:' + mut + '">' + esc(c.name) + '</span> ' + esc(r[k] == null ? 'NULL' : r[k])).join('<br>')
            tip.style.display = ''
            const tx = px + 14 + tip.offsetWidth > W ? px - tip.offsetWidth - 10 : px + 14
            tip.style.left = Math.max(0, tx) + 'px'
            tip.style.top = Math.max(0, Math.min(H - tip.offsetHeight, py + 12)) + 'px'
            drawAxes()
          })
        }
        canvas.addEventListener('wheel', (e) => {
          e.preventDefault()
          const r = canvas.getBoundingClientRect()
          const fx = Math.max(0, Math.min(1, (e.clientX - r.left - M.l) / plotW)), fy = Math.max(0, Math.min(1, 1 - (e.clientY - r.top - M.t) / plotH))
          const k = Math.exp(-e.deltaY * 0.0015)
          const cx = view.x0 + fx * (view.x1 - view.x0), cy = view.y0 + fy * (view.y1 - view.y0)
          const w = Math.max(1e-7, (view.x1 - view.x0) / k), h = Math.max(1e-7, (view.y1 - view.y0) / k)
          view = { x0: cx - fx * w, x1: cx + (1 - fx) * w, y0: cy - fy * h, y1: cy + (1 - fy) * h }
          hovered = -1; tip.style.display = 'none'
          schedule()
        }, { passive: false })
        let drag = null
        canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, v: view, moved: false }; try { canvas.setPointerCapture(e.pointerId) } catch (err) {} })
        canvas.addEventListener('pointermove', (e) => {
          const r = canvas.getBoundingClientRect()
          if (drag) {
            const dx = e.clientX - drag.x, dy = e.clientY - drag.y
            if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true
            const ux = (dx / plotW) * (drag.v.x1 - drag.v.x0), uy = (dy / plotH) * (drag.v.y1 - drag.v.y0)
            view = { x0: drag.v.x0 - ux, x1: drag.v.x1 - ux, y0: drag.v.y0 + uy, y1: drag.v.y1 + uy }
            canvas.style.cursor = 'grabbing'
            schedule()
            return
          }
          hover(e.clientX - r.left, e.clientY - r.top)
        })
        const up = (e) => {
          if (!drag) return
          const clicked = !drag.moved
          drag = null
          canvas.style.cursor = 'crosshair'
          if (clicked && hovered >= 0 && typeof ctx.selectRow === 'function') ctx.selectRow(rowOf[hovered])
        }
        canvas.addEventListener('pointerup', up)
        canvas.addEventListener('pointercancel', up)
        canvas.addEventListener('pointerleave', () => { if (!drag) { hovered = -1; tip.style.display = 'none'; drawAxes() } })
        canvas.addEventListener('dblclick', () => { view = { x0: 0, x1: 1, y0: 0, y1: 1 }; schedule() })
        draw()
      }
    }
  ]
}
