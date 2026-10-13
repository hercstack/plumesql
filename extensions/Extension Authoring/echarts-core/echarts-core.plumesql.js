// @ts-check
// @description Shared helpers for the ECharts chart extensions: theme colours as ECharts options, one chart per view, tooltips, axes (a library, no views)

// The ECharts browser build is a classic script, so each view lists it in its
// own `scripts` (and its manifest's externals) and finds the global here; a
// library cannot load scripts.
export const echartsOf = () => /** @type {any} */ (window).echarts || null

// ─── Theme ───────────────────────────────────────────────────────────────────
// The colours a chart paints with. Under Dark and Light, the curated set the
// charts were drawn against; under a theme extension, that theme's own roles
// (ctx.palette), so Nord or Solarized recolour the series, the text and the
// tooltip alike.
const VIVID = ['#7aa2f7', '#f7768e', '#9ece6a', '#e0af68', '#bb9af7', '#7dcfff', '#ff9e64', '#41a6b5', '#c0caf5', '#73daca', '#db4b4b', '#ff007c']
/**
 * @typedef {{ dark: boolean, fg: string, muted: string, line: string, grid: string, pane: string, bg: string, accent: string,
 *   colors: string[], ramp: string[], alarm: string[], up: string, down: string }} Theme
 */
/** @returns {Theme} */
export const themeOf = (/** @type {any} */ ctx) => {
  const dark = ctx.theme !== 'light'
  const p = ctx.palette && ctx.palette.id !== 'dark' && ctx.palette.id !== 'light' ? ctx.palette : null
  const hex = (/** @type {unknown} */ c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)
  if (!p) {
    return {
      dark,
      fg: dark ? '#c8d3f5' : '#3a3f4b',
      muted: dark ? '#8a92a6' : '#6b7280',
      line: dark ? '#3b3f52' : '#d4d7de',
      grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      pane: dark ? '#1f2030' : '#f4f5f8',
      bg: dark ? '#1a1b26' : '#ffffff',
      accent: dark ? '#7aa2f7' : '#5a8bf0',
      colors: VIVID,
      ramp: ['#7aa2f7', '#e0af68', '#f7768e'],
      alarm: ['#9ece6a', '#e0af68', '#f7768e'],
      up: '#9ece6a',
      down: '#f7768e'
    }
  }
  const pick = (/** @type {string[]} */ keys) => [...new Set(keys.map((k) => p[k]).filter(hex))]
  const colors = pick(['accent', 'red', 'green', 'amber', 'violet', 'keyword', 'string', 'number', 'type', 'func', 'comment'])
  return {
    dark,
    fg: p.text,
    muted: p.muted,
    line: p.border,
    grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    pane: p.background,
    bg: p.surface,
    accent: p.accent,
    colors: colors.length ? colors : VIVID,
    ramp: pick(['accent', 'amber', 'red']),
    alarm: pick(['green', 'amber', 'red']),
    up: hex(p.green) ? p.green : '#9ece6a',
    down: hex(p.red) ? p.red : '#f7768e'
  }
}

// ─── The chart ───────────────────────────────────────────────────────────────
// One live chart per view: `mount` disposes the one the view drew last (pass
// it in) and starts a new one filling the root, so no canvas or listener is
// left behind by a redraw.
export const mount = (/** @type {HTMLElement} */ root, /** @type {any} */ previous) => {
  if (previous) previous.dispose()
  root.innerHTML = ''
  const el = document.createElement('div')
  el.style.cssText = 'width:100%;height:100%'
  root.appendChild(el)
  return echartsOf().init(el, null, { renderer: 'canvas' })
}

// A calm line in place of the chart: what is missing, and where to set it.
export const note = (/** @type {HTMLElement} */ root, /** @type {string} */ msg) => {
  const el = document.createElement('div')
  el.style.cssText = 'padding:16px;color:#888;font:13px system-ui,sans-serif'
  el.textContent = msg
  root.replaceChildren(el)
}
export const NO_ECHARTS = 'ECharts did not load. Allow the CDN host in the Log.'

// The pieces every option repeats, in the theme's colours.
export const titleOf = (/** @type {Theme} */ th, /** @type {string | undefined} */ text) =>
  text ? { text, left: 12, top: 8, textStyle: { color: th.fg, fontSize: 13, fontWeight: 600 } } : undefined
export const tooltipOf = (/** @type {Theme} */ th, /** @type {object} */ extra = {}) => ({
  backgroundColor: th.pane, borderColor: th.line, textStyle: { color: th.fg, fontSize: 11 }, confine: true, ...extra
})
export const axisOf = (/** @type {Theme} */ th, /** @type {object} */ extra = {}) => ({
  axisLine: { lineStyle: { color: th.line } },
  axisTick: { lineStyle: { color: th.line } },
  axisLabel: { color: th.muted, fontSize: 11 },
  splitLine: { lineStyle: { color: th.grid } },
  nameTextStyle: { color: th.muted, fontSize: 11 },
  ...extra
})
export const legendOf = (/** @type {Theme} */ th, /** @type {object} */ extra = {}) => ({
  type: 'scroll', textStyle: { color: th.fg, fontSize: 11 }, pageTextStyle: { color: th.muted }, pageIconColor: th.accent, pageIconInactiveColor: th.line, ...extra
})
// A zoom slider under a chart, quiet in the theme.
export const sliderOf = (/** @type {Theme} */ th, /** @type {object} */ extra = {}) => ({
  type: 'slider', height: 18, bottom: 8, borderColor: th.line, textStyle: { color: th.muted, fontSize: 10 },
  fillerColor: th.dark ? 'rgba(122,162,247,0.18)' : 'rgba(90,139,240,0.15)', handleStyle: { color: th.accent, borderColor: th.accent },
  dataBackground: { lineStyle: { color: th.line }, areaStyle: { color: th.grid } }, ...extra
})
// A colour along a ramp, t from 0 to 1, as #rrggbb.
export const rampColor = (/** @type {string[]} */ stops, /** @type {number} */ t) => {
  if (stops.length < 2) return stops[0] || '#888888'
  const u = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(u)), f = u - i
  const a = parseInt(stops[i].slice(1), 16), b = parseInt(stops[i + 1].slice(1), 16)
  const mix = (/** @type {number} */ s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * f)
  return '#' + ((mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).padStart(6, '0')
}

// ─── Values ──────────────────────────────────────────────────────────────────
// A number read short: 1.2k, 3.4M, 5G.
export const fmtNum = (/** @type {unknown} */ v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  const a = Math.abs(n)
  const t = (/** @type {number} */ x) => String(Number(x.toFixed(1)))
  return a >= 1e12 ? t(n / 1e12) + 'T' : a >= 1e9 ? t(n / 1e9) + 'G' : a >= 1e6 ? t(n / 1e6) + 'M' : a >= 1e4 ? t(n / 1e3) + 'k' : String(Number(n.toPrecision(6)))
}
export const csvCell = (/** @type {unknown} */ v) => {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
export const csvOf = (/** @type {string[]} */ header, /** @type {unknown[][]} */ rows) =>
  [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n')
// Escape text put into a tooltip's markup.
export const esc = (/** @type {unknown} */ s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c)

// A library: no rules and no views of its own.
export default { rules: [], views: [] }
