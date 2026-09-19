// @ts-check
// @description hstore values read as a clean key => value table with the NULLs marked, decoded as JSON in the value tab, checked live in the row editor
// @color amber
import { parseHstore, hstoreJson, hstoreLine, hstoreTable, escapeHtml } from './lib/hstore.js'

// An hstore is a flat map printed as one line of quoted pairs. This
// extension INSPECTS those values (docs: GRIDJSSPEC, Inspectors): it reads
// the text in the sandbox, with no query to the server, and answers every
// surface PlumeSQL draws for an inspected value:
//
//   hover  the grid's hover card: the key count and the first pairs
//   peek   the strip above the peeked value (Space): the same, taller
//   value  the value tab: the count, the table, and the map as pretty JSON
//          for the editor's face, with a "Decode as JSON" toggle back to
//          the text as stored
//   field  the row editor: whether what is typed reads as an hstore, and
//          where it stops reading when it does not
//
// The inspector matches the column's DECLARED type (hstore, with or without
// a schema): a text column holding "a"=>"1" is text.

// How many pairs each surface lists before "+ n more": what its box holds
// at one 15px line a pair.
/** @type {Record<string, number>} */
const ROWS = { hover: 6, peek: 6, value: 8 }

/**
 * @param {string} value
 * @param {InspectContext} ctx
 */
function inspectHstore(value, ctx) {
  const h = parseHstore(value)
  if (ctx.surface === 'field') {
    // The verdict IS the answer here: a line of text under the input.
    const bad = 'error' in h && ctx.palette?.red ? `color:${ctx.palette.red};` : ''
    const text =
      'error' in h
        ? `not a valid hstore: ${h.error} (character ${h.at})`
        : hstoreLine(h) + (h.duplicates > 0 ? ` · ${h.duplicates} duplicate ${h.duplicates === 1 ? 'key' : 'keys'} dropped` : '')
    return { html: `<div style="${bad}font-size:11px;line-height:15px;white-space:normal">${escapeHtml(text)}</div>` }
  }
  if ('error' in h) return null
  const line = hstoreLine(h)
  const html = hstoreTable(h.pairs, { width: ctx.width, max: ROWS[ctx.surface] ?? 6, muted: ctx.palette?.muted }) || undefined
  if (ctx.surface !== 'value') return { html, line }
  const nulls = h.pairs.filter((p) => p[1] === null).length
  const facts = [`${h.pairs.length.toLocaleString('en-US')} ${h.pairs.length === 1 ? 'key' : 'keys'}`]
  if (nulls > 0) facts.push(`${nulls.toLocaleString('en-US')} NULL ${nulls === 1 ? 'value' : 'values'}`)
  return {
    html,
    line,
    facts,
    note: h.pairs.length > (ROWS.value ?? 8) ? 'The first pairs as stored; the JSON below holds them all.' : 'Every pair as stored; the JSON below is the same map.',
    face: {
      label: 'JSON',
      title: 'Show the hstore as a JSON object (as hstore_to_json builds it); off shows the value as stored',
      text: hstoreJson(h.pairs)
    }
  }
}

/** @type {PlumeSQLExtension} */
export default {
  inspectors: [{ match: { type: 'hstore' }, label: 'as JSON', inspect: inspectHstore }]
}
