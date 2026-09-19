// @ts-check
// A pgvector value arrives in the grid as its text: a wall of floats
// ([0.013,-0.42,...], often 1536 of them) that says nothing at a glance.
// This module reads that text WITHOUT any query: the dense forms (vector and
// halfvec, one bracketed list) and the sparse one (sparsevec's
// {index:value,...}/dims). Out come the dimensions, the range, the L2 norm
// and a small sparkline of the components. The inspector gates on the
// COLUMN TYPE, never on the text alone: a JSON array of numbers parses
// identically and must keep its JSON face.

/**
 * A parsed vector. `dims` is the declared dimensionality (a sparse vector's
 * total, not its nonzero count); `values` the dense components, or a sparse
 * vector's nonzero entries in index order with `entries` carrying their
 * 1-based positions, as pgvector prints them.
 * @typedef {object} Vec
 * @property {number} dims
 * @property {number[]} values
 * @property {boolean} sparse
 * @property {number[]} [entries]
 */

/**
 * parseVector reads pgvector's text forms; null for anything else.
 * @param {string} text
 * @returns {Vec | null}
 */
export function parseVector(text) {
  const s = text.trim()
  if (s.startsWith('[') && s.endsWith(']')) {
    const body = s.slice(1, -1).trim()
    if (body === '') return null
    const parts = body.split(',')
    /** @type {number[]} */
    const values = new Array(parts.length)
    for (let i = 0; i < parts.length; i++) {
      const n = Number(parts[i])
      if (!Number.isFinite(n)) return null
      values[i] = n
    }
    return { dims: values.length, values, sparse: false }
  }
  const m = /^\{(.*)\}\/(\d+)$/.exec(s)
  if (m) {
    const dims = parseInt(m[2], 10)
    if (!Number.isFinite(dims) || dims <= 0) return null
    /** @type {number[]} */
    const values = []
    /** @type {number[]} */
    const entries = []
    const body = m[1].trim()
    if (body !== '') {
      for (const part of body.split(',')) {
        const kv = part.split(':')
        if (kv.length !== 2) return null
        const idx = Number(kv[0])
        const val = Number(kv[1])
        if (!Number.isInteger(idx) || idx < 1 || idx > dims || !Number.isFinite(val)) return null
        entries.push(idx)
        values.push(val)
      }
    }
    return { dims, values, sparse: true, entries }
  }
  return null
}

/**
 * vecStats: the reading line's numbers. The norm is over the stored
 * components (a sparse vector's zeros contribute nothing anyway); min and
 * max are of the stored components too, so a sparse vector reports its
 * nonzero range.
 * @param {Vec} v
 * @returns {{ min: number, max: number, norm: number } | null}
 */
export function vecStats(v) {
  if (v.values.length === 0) return null
  let min = Infinity
  let max = -Infinity
  let sq = 0
  for (const n of v.values) {
    if (n < min) min = n
    if (n > max) max = n
    sq += n * n
  }
  return { min, max, norm: Math.sqrt(sq) }
}

/**
 * vecSparkline draws the components as one polyline across the box,
 * downsampled to at most `w` buckets (the bucket mean; an embedding's shape
 * survives averaging, and the box is a sketch, not a plot). A sparse vector
 * paints its nonzero entries at their true positions over a zero baseline.
 * Returns the polyline points string and the zero line's y, both in box
 * coordinates.
 * @param {Vec} v
 * @param {number} w
 * @param {number} h
 * @param {number} [pad]
 * @returns {{ points: string, zeroY: number } | null}
 */
export function vecSparkline(v, w, h, pad = 4) {
  const s = vecStats(v)
  if (!s) return null
  const lo = Math.min(s.min, 0)
  const hi = Math.max(s.max, 0)
  const span = hi - lo || 1
  /** @param {number} n */
  const Y = (n) => pad + (hi - n) * ((h - 2 * pad) / span)
  const innerW = w - 2 * pad
  /** @type {string[]} */
  const pts = []
  if (v.sparse && v.entries) {
    // Zero everywhere, spikes where the entries are: baseline segments
    // interrupted by the nonzero values at their true positions.
    const zero = Y(0)
    pts.push(`${pad},${zero}`)
    for (let i = 0; i < v.entries.length; i++) {
      const x = pad + ((v.entries[i] - 1) / Math.max(1, v.dims - 1)) * innerW
      pts.push(`${x},${zero}`, `${x},${Y(v.values[i])}`, `${x},${zero}`)
    }
    pts.push(`${pad + innerW},${zero}`)
  } else {
    const n = v.values.length
    const buckets = Math.min(n, Math.max(2, Math.floor(innerW)))
    for (let b = 0; b < buckets; b++) {
      const from = Math.floor((b * n) / buckets)
      const to = Math.max(from + 1, Math.floor(((b + 1) * n) / buckets))
      let sum = 0
      for (let i = from; i < to; i++) sum += v.values[i]
      const x = pad + (buckets === 1 ? 0 : (b / (buckets - 1)) * innerW)
      pts.push(`${x},${Y(sum / (to - from))}`)
    }
  }
  return { points: pts.join(' '), zeroY: Y(0) }
}

/**
 * vecLine is the one-line reading every surface shows: dimensions (a sparse
 * vector's nonzero count beside them), range and L2 norm, in the same words
 * on the hover card, the peek and the value tab.
 * @param {Vec} v
 * @returns {string}
 */
export function vecLine(v) {
  const s = vecStats(v)
  /** @param {number} n */
  const fmt = (n) => String(+n.toPrecision(4))
  return `${v.sparse ? 'sparse, ' : ''}${v.dims.toLocaleString()} dims${v.sparse && v.entries ? ` (${v.entries.length} nonzero)` : ''}${s ? ` · min ${fmt(s.min)} · max ${fmt(s.max)} · ‖v‖ ${fmt(s.norm)}` : ''}`
}

/**
 * isVectorType says whether a column's declared type is pgvector's (the name
 * may arrive schema-qualified: format_type says public.vector when the
 * extension's schema is off the search_path).
 * @param {string} t
 * @returns {boolean}
 */
export function isVectorType(t) {
  return /^(?:"?[\w$]+"?\.)?(vector|halfvec|sparsevec)\b/i.test(t)
}
