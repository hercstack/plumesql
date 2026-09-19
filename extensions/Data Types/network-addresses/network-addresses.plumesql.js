// @ts-check
// @description inet, cidr, macaddr and macaddr8 values read as what they are: network, broadcast, netmask, host count, the kind of range, the flag bits of a MAC
// @color blue
import { parseIp, describeIp, expandIPv6, parseMac, describeMac } from './lib/net.js'

// An address in the grid is its text, 10.20.0.7/16, and what a person
// asks of it (which network? how big? is that a private range?) takes a
// subnet calculator. This extension INSPECTS those values (docs:
// GRIDJSSPEC, Inspectors): it reads the text in the sandbox, with no query
// to the server, and answers every surface PlumeSQL draws for an inspected
// value:
//
//   hover  the grid's hover card: one reading line and a strip of the
//          address's bits, the network part filled
//   peek   the strip above the peeked value (Space): the same
//   value  the value tab: the facts (address, network, broadcast, netmask,
//          addresses and hosts, the kind of range) and the address in
//          another spelling (IPv4 in binary, IPv6 expanded) for the editor's
//          face, with a "Decode address" toggle back to the text as stored
//   field  the row editor: what is typed read live, or why it is not an
//          address of the column's type
//
// The inspectors match the column's DECLARED type: a text column holding an
// address is text.

/**
 * The bit strip: one cell per bit for IPv4 (grouped by octet), the 128 bits
 * of IPv6 as eight groups of sixteen; the network part filled, the host
 * part an outline, the prefix written under it.
 * @param {4 | 6} family
 * @param {number} prefix
 * @param {number} w
 * @param {number} h
 */
function bitsSvg(family, prefix, w, h) {
  const bits = family === 4 ? 32 : 128
  const groups = family === 4 ? 4 : 8
  const per = bits / groups
  const pad = 6
  const gap = 4
  const barH = Math.min(18, Math.max(8, h - 30))
  const y = Math.max(4, Math.round((h - barH - 16) / 2))
  const groupW = (w - pad * 2 - gap * (groups - 1)) / groups
  const r = (/** @type {number} */ n) => Math.round(n * 10) / 10
  let out = ''
  for (let gi = 0; gi < groups; gi++) {
    const gx = pad + gi * (groupW + gap)
    const from = gi * per
    const netBits = Math.max(0, Math.min(per, prefix - from))
    const netW = (groupW * netBits) / per
    if (netBits > 0) out += `<path class="closed" style="fill-opacity:.55" stroke="none" d="M${r(gx)} ${y} h${r(netW)} v${barH} h${-r(netW)} Z"/>`
    out += `<rect x="${r(gx)}" y="${y}" width="${r(groupW)}" height="${barH}"/>`
    // IPv4: a tick per bit, so the octet reads as eight.
    if (family === 4)
      for (let b = 1; b < per; b++) {
        const x = r(gx + (groupW * b) / per)
        out += `<line class="axis" x1="${x}" x2="${x}" y1="${y + barH - 4}" y2="${y + barH}"/>`
      }
  }
  const px = r(pad + Math.floor(prefix / per) * (groupW + gap) + (groupW * (prefix % per)) / per - (prefix % per === 0 && prefix > 0 && prefix < bits ? gap / 2 : 0))
  const anchor = prefix === 0 ? 'start' : prefix === bits ? 'end' : 'middle'
  out += `<text x="${px}" y="${y + barH + 13}" font-size="10" text-anchor="${anchor}">/${prefix}</text>`
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${out}</svg>`
}

/**
 * @param {string} text
 * @param {InspectContext} ctx
 */
const lineHtml = (text, ctx, bad = false) =>
  `<div style="${bad && ctx.palette?.red ? `color:${ctx.palette.red};` : ''}font-size:11px;line-height:15px;white-space:normal">${text.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))}</div>`

/**
 * @param {string} value
 * @param {InspectContext} ctx
 */
function inspectIp(value, ctx) {
  const type = /cidr/i.test(ctx.column.type) ? 'cidr' : 'inet'
  const ip = parseIp(value)
  if (ctx.surface === 'field') {
    if (!ip) return { html: lineHtml(`not an ${type === 'cidr' ? 'IP network' : 'IP address'}`, ctx, true) }
    const d = describeIp(ip, type)
    // cidr refuses bits set right of the mask; say the value it would take.
    if (type === 'cidr' && ip.value !== d.net.network)
      return { html: lineHtml(`host bits set right of the /${ip.prefix} mask: the network is ${d.network}`, ctx, true) }
    return { html: lineHtml(d.line, ctx) }
  }
  if (!ip) return null
  const d = describeIp(ip, type)
  const html = bitsSvg(ip.family, ip.prefix, ctx.width, Math.min(ctx.height, 56))
  if (ctx.surface !== 'value') return { html, line: d.line }
  const suffix = ip.explicit || type === 'cidr' ? `/${ip.prefix}` : ''
  const face =
    ip.family === 4
      ? {
          label: 'binary',
          title: 'Show the address in binary, octet by octet; off shows the value as stored',
          text: [24n, 16n, 8n, 0n].map((s) => Number((ip.value >> s) & 255n).toString(2).padStart(8, '0')).join('.') + suffix
        }
      : { label: 'expanded', title: 'Show the IPv6 address expanded, every group of four digits written out; off shows the value as stored', text: expandIPv6(ip.value) + suffix }
  return {
    html,
    line: d.line,
    facts: d.facts,
    note:
      ip.family === 4
        ? 'The strip is the 32 bits of the address, the network part filled; the editor below spells them out.'
        : 'The strip is the 128 bits of the address in eight groups, the network part filled.',
    face
  }
}

/**
 * @param {string} value
 * @param {InspectContext} ctx
 */
function inspectMac(value, ctx) {
  const b = parseMac(value)
  const want = /macaddr8/i.test(ctx.column.type) ? 8 : 6
  if (ctx.surface === 'field') {
    // macaddr8 takes a 48-bit address too (it inserts ff:fe); macaddr
    // takes 48 bits alone.
    if (!b || (want === 6 && b.length !== 6)) return { html: lineHtml(want === 6 ? 'not a 48-bit MAC address' : 'not a MAC address', ctx, true) }
    return { html: lineHtml(describeMac(b).line, ctx) }
  }
  if (!b) return null
  const d = describeMac(b)
  if (ctx.surface !== 'value') return { line: d.line }
  return {
    line: d.line,
    facts: d.facts,
    note: 'Read from the address alone: the flag bits of its first octet, no vendor lookup.'
  }
}

/** @type {PlumeSQLExtension} */
export default {
  inspectors: [
    { match: { type: /^(inet|cidr)$/ }, label: 'address', inspect: inspectIp },
    { match: { type: /^macaddr8?$/ }, label: 'address', inspect: inspectMac }
  ]
}
