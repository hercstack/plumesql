// @ts-check
// @description pgvector values (vector, halfvec, sparsevec) read as their dimensions, range and norm, with a sparkline of the components
// @color violet
import { parseVector, vecLine, vecSparkline } from './lib/vec.js'

// A pgvector value is a wall of floats, often 1536 of them. This extension
// INSPECTS those values (docs: GRIDJSSPEC, Inspectors): it reads the text in
// the sandbox, with no query to the server, and answers the surfaces
// PlumeSQL draws for an inspected value:
//
//   hover  the grid's hover card: one reading line and a sparkline
//   peek   the strip above the peeked value (Space): the same
//   value  the value tab: the subtitle, the facts and the sparkline; the
//          editor keeps the stored value
//
// The row editor's field is left alone (a typed vector literal gets no
// preview). The inspectors match the column's DECLARED type (vector, halfvec,
// sparsevec, with or without a typmod or a schema): a JSON array of numbers
// in a json or text column keeps its own face.

/**
 * The sparkline markup: a quiet zero line and the components' polyline,
 * with the host's sketch classes, which PlumeSQL paints in the theme's
 * colours.
 * @param {{ points: string, zeroY: number } | null} spark
 * @param {number} w
 * @param {number} h
 * @returns {string | undefined}
 */
function sparkHtml(spark, w, h) {
  if (!spark) return undefined
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><line class="axis" x1="4" x2="${w - 4}" y1="${spark.zeroY}" y2="${spark.zeroY}"/><polyline points="${spark.points}"/></svg>`
}

/**
 * @param {string} value
 * @param {InspectContext} ctx
 */
function inspectVector(value, ctx) {
  if (ctx.surface === 'field') return null
  const v = parseVector(value)
  if (!v) return null
  const html = sparkHtml(vecSparkline(v, ctx.width, ctx.height), ctx.width, ctx.height)
  if (ctx.surface !== 'value') return { html, line: vecLine(v) }
  return {
    html,
    line: `${v.sparse ? 'sparse ' : ''}vector · ${v.dims.toLocaleString()} dims`,
    facts: [ctx.column.type || 'vector', vecLine(v)],
    note: 'A sparkline of the components, downsampled to fit; the editor below shows the stored value.'
  }
}

/** @type {PlumeSQLExtension} */
export default {
  inspectors: [
    { match: { type: 'vector' }, label: 'vector', inspect: inspectVector },
    { match: { type: 'halfvec' }, label: 'vector', inspect: inspectVector },
    { match: { type: 'sparsevec' }, label: 'vector', inspect: inspectVector }
  ]
}
