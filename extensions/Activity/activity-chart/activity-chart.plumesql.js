// @ts-check
// @description The backends of a current activity result as a rolling graph: total, active, idle, in transaction and waiting, one sample per refresh
// @color blue

/** @typedef {{ t: number, counts: number[] }} Sample */
/** @typedef {{ hasState: boolean, hasWait: boolean }} Shape */
/** @typedef {{ samples: Sample[], lastKey: string, lastAt: number, hidden: Set<number>, root: HTMLElement | null, ctx: RenderContext | null, shape: Shape, hover: number }} Store */

const SERIES = ['Total', 'Active', 'Idle', 'In transaction', 'Waiting']
const COLORS = {
  dark: ['#c0caf5', '#9ece6a', '#7aa2f7', '#e0af68', '#f7768e'],
  light: ['#4b5563', '#3f9142', '#3b6fd9', '#b8860b', '#d1495b']
}

const g = /** @type {any} */ (globalThis)
/** @type {Store} */
const store = g.__plumesqlActivityChart || (g.__plumesqlActivityChart = { samples: [], lastKey: '', lastAt: 0, hidden: new Set(), root: null, ctx: null, shape: { hasState: true, hasWait: true }, hover: -1 })

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c)
const pad2 = (n) => (n < 10 ? '0' : '') + n
const clock = (t) => { const d = new Date(t); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) }
const ticks = (hi, n) => { const raw = Math.max(1, hi) / n; const mag = Math.pow(10, Math.floor(Math.log10(raw))); const norm = raw / mag; const step = Math.max(1, Math.round((norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag)); const out = []; for (let v = 0; v <= hi + 1e-9; v += step) out.push(v); if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step); return out }

/** @param {RenderData} data @param {Record<string, string>} inputs */
function count(data, inputs) {
  const cols = data.columns || []
  const si = cols.findIndex((c) => c.name === (inputs.state || 'state'))
  const wi = cols.findIndex((c) => c.name === (inputs.wait || 'waiting'))
  const rows = data.rows || []
  let active = 0, idle = 0, intx = 0, waiting = 0
  for (const r of rows) {
    const s = si >= 0 ? String(r[si] == null ? '' : r[si]).toLowerCase() : ''
    if (s === 'active') active++
    else if (s === 'idle') idle++
    else if (s.startsWith('idle in transaction')) intx++
    if (s === 'active' && wi >= 0 && r[wi] != null && String(r[wi]) !== '') waiting++
  }
  return { counts: [rows.length, active, idle, intx, waiting], hasState: si >= 0, hasWait: wi >= 0 }
}

/** @param {RenderData} data @param {Record<string, string>} inputs */
function sample(data, inputs) {
  const c = count(data, inputs)
  const key = JSON.stringify(data.rows || [])
  const now = Date.now()
  if (key === store.lastKey && now - store.lastAt < 1000) return c
  store.lastKey = key
  store.lastAt = now
  store.samples.push({ t: now, counts: c.counts })
  const keep = Math.max(2, Math.floor(Number(inputs.keep) || 200))
  if (store.samples.length > keep) store.samples.splice(0, store.samples.length - keep)
  return c
}

/** @param {HTMLElement} root @param {RenderContext} ctx @param {Shape} shape */
function draw(root, ctx, shape) {
  const light = ctx.theme === 'light'
  const fg = light ? '#1a1b26' : '#c8d0e0', mut = light ? '#6b7280' : '#8a92a6'
  const grid = light ? '#00000014' : '#ffffff14', axis = light ? '#00000033' : '#ffffff33'
  const bg = light ? '#ffffff' : 'transparent'
  const colors = COLORS[light ? 'light' : 'dark']
  const font = 'font:12px system-ui,sans-serif'
  root.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;padding:12px 14px 8px;box-sizing:border-box;color:' + fg + ';' + font + ';background:' + bg + ';user-select:none'
  root.appendChild(wrap)

  if (!shape.hasState) {
    wrap.innerHTML = '<div style="padding:6px;color:' + mut + '">Pick the state column (the sliders button in the header): the result has no column named <b>' + esc((ctx.inputs || {}).state || 'state') + '</b>.</div>'
    return
  }

  const samples = store.samples
  const last = samples[samples.length - 1]
  const shown = SERIES.map((_, i) => i).filter((i) => (i !== 4 || shape.hasWait))

  const legend = document.createElement('div')
  legend.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 16px;align-items:baseline;margin-bottom:8px'
  for (const i of shown) {
    const item = document.createElement('span')
    const off = store.hidden.has(i)
    item.style.cssText = 'display:inline-flex;align-items:baseline;gap:6px;cursor:pointer;opacity:' + (off ? '.45' : '1')
    item.title = (off ? 'Show ' : 'Hide ') + SERIES[i].toLowerCase()
    item.innerHTML = '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + colors[i] + ';transform:translateY(1px)"></span>' +
      '<span style="color:' + mut + '">' + esc(SERIES[i]) + '</span>' +
      '<span style="font-variant-numeric:tabular-nums;font-weight:600;font-size:14px">' + (last ? last.counts[i] : '–') + '</span>'
    item.onclick = () => { if (off) store.hidden.delete(i); else store.hidden.add(i); draw(root, ctx, shape) }
    legend.appendChild(item)
  }
  const note = document.createElement('span')
  note.style.cssText = 'margin-left:auto;color:' + mut + ';font-size:11px'
  note.textContent = samples.length < 2
    ? 'one sample; the graph moves with every refresh'
    : samples.length + ' samples · ' + clock(samples[0].t) + ' to ' + clock(last.t)
  legend.appendChild(note)
  wrap.appendChild(legend)

  const plot = document.createElement('div')
  plot.style.cssText = 'flex:1;min-height:60px;position:relative'
  wrap.appendChild(plot)
  const W = Math.max(120, plot.clientWidth || root.clientWidth - 28), H = Math.max(60, plot.clientHeight || root.clientHeight - 60)
  const L = 34, R = 10, T = 8, B = 22
  const pw = W - L - R, ph = H - T - B
  const maxVal = Math.max(1, ...samples.flatMap((s) => shown.filter((i) => !store.hidden.has(i)).map((i) => s.counts[i])))
  const ys = ticks(Math.max(5, maxVal), Math.max(2, Math.floor(ph / 32)))
  const yMax = ys[ys.length - 1]
  const t0 = samples.length ? samples[0].t : Date.now(), t1 = samples.length ? last.t : t0
  const span = Math.max(1000, t1 - t0)
  const X = (t) => samples.length < 2 ? L + pw / 2 : L + ((t - t0) / span) * pw
  const Y = (v) => T + ph - (v / yMax) * ph

  let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="display:block;overflow:visible">'
  for (const v of ys) {
    const y = Y(v).toFixed(1)
    svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="' + grid + '"/>'
    svg += '<text x="' + (L - 6) + '" y="' + y + '" dy="4" text-anchor="end" fill="' + mut + '" font-size="11" font-family="system-ui,sans-serif">' + v + '</text>'
  }
  svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '" stroke="' + axis + '"/>'
  if (samples.length >= 2) {
    const n = Math.max(2, Math.min(8, Math.floor(pw / 90)))
    for (let k = 0; k <= n; k++) {
      const t = t0 + (span * k) / n
      const x = X(t)
      svg += '<text x="' + x.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (k === 0 ? 'start' : k === n ? 'end' : 'middle') + '" fill="' + mut + '" font-size="11" font-family="system-ui,sans-serif">' + clock(t) + '</text>'
    }
  }
  for (const i of shown) {
    if (store.hidden.has(i)) continue
    const pts = samples.map((s) => X(s.t).toFixed(1) + ',' + Y(s.counts[i]).toFixed(1))
    if (pts.length >= 2) {
      svg += '<polyline fill="none" stroke="' + colors[i] + '" stroke-width="' + (i === 0 ? 1.5 : 2) + '" stroke-linejoin="round" stroke-linecap="round" points="' + pts.join(' ') + '"' + (i === 0 ? ' stroke-dasharray="4 3"' : '') + '/>'
    }
    if (pts.length) {
      const p = pts[pts.length - 1].split(',')
      svg += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3" fill="' + colors[i] + '"/>'
    }
  }
  const hi = store.hover
  if (hi >= 0 && hi < samples.length && samples.length >= 2) {
    const s = samples[hi]
    const x = X(s.t)
    svg += '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + T + '" y2="' + (T + ph) + '" stroke="' + axis + '" stroke-dasharray="2 3"/>'
    for (const i of shown) if (!store.hidden.has(i)) svg += '<circle cx="' + x.toFixed(1) + '" cy="' + Y(s.counts[i]).toFixed(1) + '" r="3.5" fill="' + colors[i] + '" stroke="' + (light ? '#fff' : '#1a1b26') + '" stroke-width="1.5"/>'
  }
  svg += '</svg>'
  plot.innerHTML = svg

  if (hi >= 0 && hi < samples.length && samples.length >= 2) {
    const s = samples[hi]
    const tip = document.createElement('div')
    const x = X(s.t)
    const left = x + 12 + 170 > W ? x - 12 - 170 : x + 12
    tip.style.cssText = 'position:absolute;top:' + (T + 4) + 'px;left:' + left.toFixed(0) + 'px;width:158px;padding:6px 8px;border-radius:4px;background:' + (light ? '#ffffffee' : '#24283bee') + ';border:1px solid ' + axis + ';font-size:11px;pointer-events:none;color:' + fg
    tip.innerHTML = '<div style="color:' + mut + ';margin-bottom:4px">' + clock(s.t) + '</div>' +
      shown.filter((i) => !store.hidden.has(i)).map((i) => '<div style="display:flex;justify-content:space-between;gap:8px"><span style="color:' + colors[i] + '">' + esc(SERIES[i]) + '</span><span style="font-variant-numeric:tabular-nums">' + s.counts[i] + '</span></div>').join('')
    plot.appendChild(tip)
  }

  plot.onmousemove = (ev) => {
    if (samples.length < 2) return
    const rect = plot.getBoundingClientRect()
    const px = ev.clientX - rect.left
    let best = -1, bd = Infinity
    samples.forEach((s, k) => { const d = Math.abs(X(s.t) - px); if (d < bd) { bd = d; best = k } })
    if (best !== store.hover) { store.hover = best; draw(root, ctx, shape) }
  }
  plot.onmouseleave = () => { if (store.hover !== -1) { store.hover = -1; draw(root, ctx, shape) } }
}

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Chart',
      when: (columns) => columns.some((c) => c.name === 'state'),
      ask: 'missing',
      inputs: [
        { key: 'state', kind: 'column', label: 'State column', default: 'state', types: ['text'], description: 'The column read as the backend state (active, idle, idle in transaction)' },
        { key: 'wait', kind: 'column', label: 'Waiting column', default: 'waiting', types: ['text'], description: 'An active row with a non-empty value here counts as waiting; a result without the column has no waiting series' },
        { key: 'keep', kind: 'number', label: 'Samples kept', default: '200', description: 'How many refreshes the graph remembers; under @refresh 3s, 200 is ten minutes' }
      ],
      actions: [
        { label: 'Reset', run: () => { store.samples = []; store.hover = -1; store.lastKey = ''; if (store.root && store.ctx) draw(store.root, store.ctx, store.shape) } },
        { label: 'Copy samples', run: (ctx) => ctx.copy(['time,' + SERIES.join(',')].concat(store.samples.map((s) => new Date(s.t).toISOString() + ',' + s.counts.join(','))).join('\n')) }
      ],
      render: (root, data, ctx) => {
        const c = sample(data, ctx.inputs || {})
        store.root = root
        store.ctx = ctx
        store.shape = { hasState: c.hasState, hasWait: c.hasWait }
        draw(root, ctx, store.shape)
      },
      resize: (root, _size, ctx) => {
        store.root = root
        store.ctx = ctx
        draw(root, ctx, store.shape)
      }
    }
  ]
}
