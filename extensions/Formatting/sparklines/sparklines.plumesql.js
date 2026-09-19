// @ts-check
// @description A numeric array column reads as a small line chart of its items, with the count, min and max
// @color green
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { type: /^(smallint|integer|bigint|int\d?|numeric|decimal|real|double precision|float\d?|money)(\(.*\))?\[\]$/i },
    fn: (value) => {
      if (value == null) return value
      const s = String(value).trim()
      if (!s.startsWith('{') || !s.endsWith('}')) return value
      // Numbers are never quoted in array text, so the braces of a
      // multidimensional array can go and the items split on commas.
      /** @type {number[]} */
      const ys = []
      for (const item of s.replace(/[{}]/g, '').split(',')) {
        const t = item.trim()
        if (t === '' || t === 'NULL') continue
        const n = Number(t.replace(/[^0-9eE.+-]/g, ''))
        if (Number.isFinite(n)) ys.push(n)
      }
      if (!ys.length) return { value, class: 'fmt-muted', title: '0 items' }
      const W = 80, H = 18, P = 2
      let lo = Infinity, hi = -Infinity
      for (const y of ys) { if (y < lo) lo = y; if (y > hi) hi = y }
      // More items than the line has room for (half a year of days in 80
      // pixels) scribble into a block: averaged into at most 40 points,
      // the shape reads; the hover keeps the real min, max and last.
      /** @type {number[]} */
      let drawn = ys
      if (ys.length > 40) {
        drawn = []
        for (let b = 0; b < 40; b++) {
          const from = Math.floor((b * ys.length) / 40), to = Math.floor(((b + 1) * ys.length) / 40)
          let s = 0
          for (let i = from; i < to; i++) s += ys[i]
          drawn.push(s / (to - from))
        }
      }
      let dlo = Infinity, dhi = -Infinity
      for (const y of drawn) { if (y < dlo) dlo = y; if (y > dhi) dhi = y }
      const span = dhi - dlo || 1
      const pts = drawn.map((y, i) => {
        const x = drawn.length === 1 ? W / 2 : P + (i / (drawn.length - 1)) * (W - 2 * P)
        const v = dhi === dlo ? H / 2 : H - P - ((y - dlo) / span) * (H - 2 * P)
        return x.toFixed(1) + ',' + v.toFixed(1)
      })
      const last = pts[pts.length - 1].split(',')
      // currentColor: the line takes the cell's text colour, so every theme
      // draws it without a colour of its own.
      const svg = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="vertical-align:middle;overflow:visible">' +
        (drawn.length > 1 ? '<polyline fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round" points="' + pts.join(' ') + '"/>' : '') +
        '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="1.8" fill="currentColor"/></svg>'
      const count = '<span style="opacity:.6;margin-left:6px">' + ys.length + '</span>'
      return { value, html: svg + count, title: ys.length + (ys.length === 1 ? ' item' : ' items') + ', min ' + lo + ', max ' + hi + ', last ' + ys[ys.length - 1] }
    }
  }
]
