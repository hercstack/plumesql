// @ts-check
// @description Range and multirange values read as their bounds, brackets, width or length with a bar placing them, and a whole column drawn as a timeline
// @color violet
import { rangeKind, parseRange, parseMultirange, describeRange, describeMultirange, segments, rangeSvg, niceTicks, tickLabel, packLanes } from './lib/range.js'

// A range in the grid is its text, [2024-03-01,2024-03-08), and its
// brackets carry half the meaning. This extension INSPECTS those values
// (docs: GRIDJSSPEC, Inspectors): it reads the text in the sandbox, with no
// query to the server, and answers every surface PlumeSQL draws for an
// inspected value:
//
//   hover  the grid's hover card: the width or length and a bar placing
//          the range, its brackets drawn as the notation writes them
//   peek   the strip above the peeked value (Space): the same
//   value  the value tab: the facts (each bound with its inclusivity, the
//          width, the length in days and hours, what is unbounded) and the bar
//   field  the row editor: the bar of what is typed, live
//
// and a VIEW, Range Timeline, that draws every range of a column on one
// axis (below, "The timeline").
//
// The inspectors match the column's DECLARED type: the built-in range and
// multirange types. A text column holding [1,5) is text.

// Every built-in range and multirange type, by its format_type name.
const RANGE_TYPE = /^(int4|int8|num|date|tstz|ts)(multi)?range$/

/**
 * The ranges a value holds: one for a range, every member of a multirange.
 * @param {string} value
 * @param {boolean} multi
 */
function readValue(value, multi) {
  if (multi) return parseMultirange(value)
  const r = parseRange(value)
  return r ? [r] : null
}

/**
 * @param {string} value
 * @param {InspectContext} ctx
 */
function inspectRange(value, ctx) {
  const t = rangeKind(ctx.column.type)
  if (!t) return null
  const rs = readValue(value, t.multi)
  if (!rs) return null
  const segs = segments(rs, t.kind)
  const time = t.kind === 'date' || t.kind === 'ts' || t.kind === 'tstz'
  const html = segs ? rangeSvg(segs, ctx.width, Math.min(ctx.height, 64), { now: time ? Date.now() : undefined }) : undefined
  if (ctx.surface === 'field') return html ? { html } : null
  const d = t.multi ? describeMultirange(rs, t.kind, ctx.column.type) : describeRange(rs[0], t.kind, ctx.column.type)
  if (ctx.surface !== 'value') return { html, line: d.line }
  return {
    html,
    line: d.line,
    facts: d.facts,
    note: time
      ? 'The bar places the range between its bounds, [ inclusive and ( exclusive, an arrow where it runs on; a dashed line marks now.'
      : 'The bar places the range between its bounds, [ inclusive and ( exclusive, an arrow where it runs on.'
  }
}

// ---- The timeline -------------------------------------------------------------
//
// Every range of one column drawn on one axis, on the public view API
// (docs: RESULTVIEWS, "A column menu entry"):
//
//   - `column` puts "Show Ranges on a Timeline" in the menu of every range
//     or multirange column while the view applies; choosing it opens this
//     view with inputs.column set to that column;
//   - ctx.rows(offset, limit, { columns }) pages that ONE column;
//   - each row is one lane while the lanes fit the pane (a bar's tooltip
//     names its row and value, a click selects the row in the grid); past that, ranges that do not overlap
//     share a lane, as a booking calendar draws them.

// The caps that keep a monster result drawable, said honestly in the line.
const MAX_RANGES = 20_000
const PAGE = 2_000
// The thinnest lane a row may have before lanes are packed.
const MIN_LANE = 6

/**
 * @typedef {{ lo: number, hi: number, row: number, text: string }} Bar
 * @typedef {{ bars: Bar[], rows: number, nulls: number, empty: number, bad: number, capped: boolean, total: number, done: boolean, kind: import('./lib/range.js').Kind, column: string, type: string }} Read
 */

/** @type {{ __rangeTimeline?: { seq: number, read?: Read, hits?: { x0: number, x1: number, y0: number, y1: number, row: number, text: string }[] } }} */
const G = /** @type {any} */ (globalThis)
const state = (G.__rangeTimeline ??= { seq: 0 })

/**
 * The column to draw: the picked one when it is a range column, else the
 * first range column of the result.
 * @param {{ name: string, type: string }[]} columns
 * @param {string | undefined} picked
 */
function pickColumn(columns, picked) {
  const byName = picked ? columns.find((c) => c.name === picked) : undefined
  if (byName && rangeKind(byName.type)) return byName
  return columns.find((c) => rangeKind(c.type)) ?? byName
}

/** @param {number} n */
const fmt = (n) => n.toLocaleString('en-US')

/**
 * The line over the drawing: "N ranges · k empty · k NULLs", the lane
 * packing, and how far the read went.
 * @param {Read} r
 * @param {number} lanes
 * @param {boolean} packed
 */
function lineFor(r, lanes, packed) {
  const parts = [`${fmt(r.bars.length)} ${r.bars.length === 1 ? 'range' : 'ranges'}`]
  if (packed) parts.push(`packed into ${fmt(lanes)} ${lanes === 1 ? 'lane' : 'lanes'}`)
  if (r.empty > 0) parts.push(`${fmt(r.empty)} empty`)
  if (r.nulls > 0) parts.push(`${fmt(r.nulls)} ${r.nulls === 1 ? 'NULL' : 'NULLs'}`)
  if (r.bad > 0) parts.push(`${fmt(r.bad)} not placed`)
  if (r.capped || (r.done && r.rows < r.total)) parts.push(`first ${fmt(r.rows)} of ${fmt(r.total)} rows`)
  else if (!r.done) parts.push(`reading, ${fmt(r.rows)} of ${fmt(r.total)} rows`)
  return parts.join(' · ')
}

/**
 * @param {HTMLElement} root
 * @param {RenderContext} ctx
 */
function layout(root, ctx) {
  const p = ctx.palette
  root.replaceChildren()
  root.style.cssText = 'margin:0;height:100vh;display:flex;flex-direction:column;overflow:hidden;font:12px system-ui,sans-serif'
  const line = document.createElement('div')
  line.className = 'range-line'
  line.style.cssText = `padding:6px 10px;color:${p?.muted ?? '#888'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`
  const box = document.createElement('div')
  box.style.cssText = 'flex:1;min-height:0;position:relative'
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;cursor:default'
  const empty = document.createElement('div')
  empty.className = 'range-empty'
  empty.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:${p?.muted ?? '#888'};font-size:13px;pointer-events:none`
  box.append(canvas, empty)
  root.append(line, box)
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const hit = (state.hits ?? []).find((h) => x >= h.x0 - 2 && x <= h.x1 + 2 && y >= h.y0 && y <= h.y1)
    if (hit) ctx.selectRow(hit.row)
  })
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const hit = (state.hits ?? []).find((h) => x >= h.x0 - 2 && x <= h.x1 + 2 && y >= h.y0 && y <= h.y1)
    canvas.style.cursor = hit ? 'pointer' : 'default'
    canvas.title = hit ? `row ${hit.row + 1}: ${hit.text}` : ''
  })
  return { line, canvas, empty }
}

/**
 * Draw the bars at the canvas's current size: an axis with round ticks on
 * top, a lane per row (or packed lanes), a range that runs to infinity
 * fading into the edge, and for a date or time axis a line at now.
 * Answers the lane count and whether the lanes were packed.
 * @param {HTMLCanvasElement} canvas
 * @param {Read} r
 * @param {RenderContext} ctx
 */
function paint(canvas, r, ctx) {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  state.hits = []
  if (w === 0 || h === 0) return { lanes: 0, packed: false }
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const g = canvas.getContext('2d')
  if (!g) return { lanes: 0, packed: false }
  g.scale(dpr, dpr)
  g.clearRect(0, 0, w, h)
  if (r.bars.length === 0) return { lanes: 0, packed: false }
  const p = ctx.palette
  const accent = p?.accent ?? '#4a9eff'
  const muted = p?.muted ?? '#888'
  const border = p?.border ?? '#8884'
  const time = r.kind === 'date' || r.kind === 'ts' || r.kind === 'tstz'

  const finite = []
  for (const b of r.bars) {
    if (Number.isFinite(b.lo)) finite.push(b.lo)
    if (Number.isFinite(b.hi)) finite.push(b.hi)
  }
  let min = Infinity
  let max = -Infinity
  for (const v of finite) {
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min)) {
    min = 0
    max = 1
  }
  if (min === max) {
    const d = time ? 43_200_000 : Math.abs(min) || 1
    min -= d
    max += d
  }
  const padL = 12
  const padR = 12
  const axisH = 22
  const x0 = padL + 16
  const x1 = w - padR - 16
  const X = (/** @type {number} */ v) => (v === -Infinity ? padL : v === Infinity ? w - padR : x0 + ((v - min) / (max - min)) * (x1 - x0))

  // Lanes: a row each while they fit, else packed.
  const avail = h - axisH - 8
  let lanes = r.rows
  /** @type {number[]} */
  let laneOf = r.bars.map((b) => b.row)
  let packed = false
  if (lanes * MIN_LANE > avail) {
    const pk = packLanes(r.bars)
    laneOf = pk.lane
    lanes = pk.lanes
    packed = true
  }
  const laneH = Math.max(0.5, Math.min(22, avail / Math.max(1, lanes)))
  const barH = Math.max(0.5, laneH > 6 ? laneH - 3 : laneH * 0.8)

  // The axis: ticks and their labels, a faint rule down the lanes.
  // A timestamptz axis reads in local time: its day ticks fall on local
  // midnights.
  const shift = r.kind === 'tstz' ? -new Date(min).getTimezoneOffset() * 60_000 : 0
  const { step, ticks } = niceTicks(min, max, Math.max(2, Math.floor((x1 - x0) / 110)), time, shift)
  g.font = '11px system-ui, sans-serif'
  g.textBaseline = 'middle'
  g.textAlign = 'center'
  g.lineWidth = 1
  for (const t of ticks) {
    const x = Math.round(X(t)) + 0.5
    g.strokeStyle = border
    g.beginPath()
    g.moveTo(x, axisH - 4)
    g.lineTo(x, h)
    g.stroke()
    g.fillStyle = muted
    // A label near an edge stays whole inside the pane.
    const label = tickLabel(t, r.kind, step)
    const half = g.measureText(label).width / 2
    g.fillText(label, Math.min(w - 4 - half, Math.max(4 + half, x)), axisH / 2 - 1)
  }

  const fade = (/** @type {number} */ xa, /** @type {number} */ xb, /** @type {boolean} */ left) => {
    const gr = g.createLinearGradient(xa, 0, xb, 0)
    const solid = accent
    const clear = /^#[0-9a-f]{6}$/i.test(accent) ? `${accent}00` : 'transparent'
    gr.addColorStop(0, left ? clear : solid)
    gr.addColorStop(1, left ? solid : clear)
    return gr
  }
  for (let i = 0; i < r.bars.length; i++) {
    const b = r.bars[i]
    const y = axisH + 4 + laneOf[i] * laneH + (laneH - barH) / 2
    const a = X(b.lo)
    const z = Math.max(a + 1.5, X(b.hi))
    if (b.lo === -Infinity || b.hi === Infinity) {
      // The endless side fades out over its last 40 pixels.
      g.fillStyle = accent
      const la = b.lo === -Infinity ? Math.min(z, a + 40) : a
      const lz = b.hi === Infinity ? Math.max(la, z - 40) : z
      g.fillRect(la, y, Math.max(0, lz - la), barH)
      if (b.lo === -Infinity) {
        g.fillStyle = fade(a, la, true)
        g.fillRect(a, y, la - a, barH)
      }
      if (b.hi === Infinity) {
        g.fillStyle = fade(lz, z, false)
        g.fillRect(lz, y, z - lz, barH)
      }
    } else {
      g.fillStyle = accent
      g.fillRect(a, y, z - a, barH)
    }
    if (!packed) state.hits.push({ x0: a, x1: z, y0: y, y1: y + barH, row: b.row, text: b.text })
  }
  if (time) {
    const now = Date.now()
    if (now >= min && now <= max) {
      const x = Math.round(X(now)) + 0.5
      g.strokeStyle = p?.red ?? '#e55'
      g.setLineDash([3, 3])
      g.beginPath()
      g.moveTo(x, axisH - 4)
      g.lineTo(x, h)
      g.stroke()
      g.setLineDash([])
    }
  }
  return { lanes, packed }
}

/** @param {Read} r */
function emptyText(r) {
  if (r.bars.length > 0) return ''
  if (!r.done) return 'Reading the column…'
  if (r.rows === 0) return 'The result has no rows to draw.'
  if (r.nulls === r.rows) return 'Every value in the column is NULL.'
  if (r.empty + r.nulls === r.rows) return 'Every range in the column is empty.'
  return 'Nothing in the column could be placed on an axis.'
}

/** @type {PlumeSQLExtension} */
export default {
  inspectors: [{ match: { type: RANGE_TYPE }, label: 'range', inspect: inspectRange }],
  views: [
    {
      tab: 'Range Timeline',
      // Only a result with a range or multirange column grows the tab.
      when: (columns) => columns.some((c) => /^(int4|int8|num|date|tstz|ts)(multi)?range$/.test(c.type)),
      inputs: [{ key: 'column', kind: 'column', label: 'Range column' }],
      ask: 'never',
      column: { input: 'column', label: 'Show Ranges on a Timeline', match: { type: RANGE_TYPE } },
      render: async (root, data, ctx) => {
        const seq = ++state.seq
        const col = pickColumn(data.columns, ctx.inputs.column)
        const ui = layout(root, ctx)
        const t = col ? rangeKind(col.type) : null
        if (!col || !t) {
          state.read = undefined
          ui.line.textContent = ''
          ui.empty.textContent = 'The result has no range column to draw.'
          return
        }
        /** @type {Read} */
        const r = { bars: [], rows: 0, nulls: 0, empty: 0, bad: 0, capped: false, total: ctx.rowCount, done: false, kind: t.kind, column: col.name, type: col.type }
        state.read = r
        const show = () => {
          const { lanes, packed } = paint(ui.canvas, r, ctx)
          ui.line.textContent = lineFor(r, lanes, packed)
          ui.line.title = `${col.name} (${col.type}): ${ui.line.textContent}`
          ui.empty.textContent = emptyText(r)
        }
        show()
        for (let at = 0; ; ) {
          const page = await ctx.rows(at, PAGE, { columns: [col.name] })
          if (seq !== state.seq) return
          if (page.length === 0) break
          for (const row of page) {
            const index = r.rows++
            const v = row[0]
            if (v === null || v === undefined) {
              r.nulls++
              continue
            }
            const rs = typeof v === 'string' ? readValue(v, t.multi) : null
            const segs = rs ? segments(rs, t.kind) : null
            if (!rs || !segs) {
              r.bad++
              continue
            }
            if (segs.length === 0) r.empty++
            for (const s of segs) r.bars.push({ lo: s.lo, hi: s.hi, row: index, text: String(v) })
            if (r.bars.length >= MAX_RANGES) {
              r.capped = true
              break
            }
          }
          if (r.capped || page.length < PAGE) break
          at += page.length
          show()
        }
        r.done = true
        r.total = Math.max(r.total, r.rows)
        show()
      },
      resize: (root, _size, ctx) => {
        const r = state.read
        const canvas = root.querySelector('canvas')
        const line = root.querySelector('.range-line')
        if (!r || !r.done || !canvas) throw new Error('nothing read yet')
        const { lanes, packed } = paint(canvas, r, ctx)
        if (line) line.textContent = lineFor(r, lanes, packed)
      }
    }
  ]
}
