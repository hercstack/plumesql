// @ts-check
// @description A bytea value reads as what it holds: a PNG of 640 x 480, a PDF, a zip, text, with its size; the bytes on hover, base64 in the value tab
// @color gray

// The server sends bytea as hex (bytea_output = 'hex', the default since
// PostgreSQL 9.0): \x followed by two digits a byte. Bytes are read straight
// out of that text, never decoded whole, so a large value costs nothing.
/** @param {string} s */
const reader = (s) => {
  const n = (s.length - 2) >> 1
  /** @param {number} i */
  const at = (i) => (i < n ? parseInt(s.substr(2 + i * 2, 2), 16) : -1)
  /** @param {number} i @param {number} len */
  const ascii = (i, len) => { let t = ''; for (let k = 0; k < len; k++) t += String.fromCharCode(at(i + k)); return t }
  const be16 = (/** @type {number} */ i) => (at(i) << 8) | at(i + 1)
  const be32 = (/** @type {number} */ i) => ((at(i) << 24) >>> 0) + ((at(i + 1) << 16) | (at(i + 2) << 8) | at(i + 3))
  const le16 = (/** @type {number} */ i) => at(i) | (at(i + 1) << 8)
  return { n, at, ascii, be16, be32, le16 }
}
const size = (/** @type {number} */ b) => (b < 1024 ? b + ' bytes' : b < 1048576 ? (b / 1024).toFixed(1) + ' kB' : b < 1073741824 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1073741824).toFixed(2) + ' GB')

// What the bytes are, by their first ones (the file's signature), and an
// image's size where its header says it.
/** @returns {{ kind: string, dims?: string, extra?: string } | null} */
const identify = (/** @type {ReturnType<typeof reader>} */ r) => {
  if (r.n === 0) return { kind: 'empty' }
  const sig = r.ascii(0, 16)
  if (r.at(0) === 0x89 && sig.slice(1, 4) === 'PNG') return { kind: 'PNG image', dims: r.be32(16) + ' × ' + r.be32(20) }
  if (sig.startsWith('GIF8')) return { kind: 'GIF image', dims: r.le16(6) + ' × ' + r.le16(8) }
  if (r.at(0) === 0xff && r.at(1) === 0xd8 && r.at(2) === 0xff) {
    // A JPEG's size is in its start-of-frame segment: walk the segments.
    let i = 2
    for (let guard = 0; guard < 400 && i + 9 < r.n; guard++) {
      if (r.at(i) !== 0xff) break
      const m = r.at(i + 1)
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { kind: 'JPEG image', dims: r.be16(i + 7) + ' × ' + r.be16(i + 5) }
      i += 2 + r.be16(i + 2)
    }
    return { kind: 'JPEG image' }
  }
  if (sig.startsWith('RIFF') && sig.slice(8, 12) === 'WEBP') return { kind: 'WebP image' }
  if (sig.startsWith('BM')) return { kind: 'BMP image', dims: (r.at(18) | (r.at(19) << 8) | (r.at(20) << 16)) + ' × ' + Math.abs((r.at(22) | (r.at(23) << 8) | (r.at(24) << 16) | (r.at(25) << 24)) >> 0) }
  if (sig.startsWith('II*\u0000') || sig.startsWith('MM\u0000*')) return { kind: 'TIFF image' }
  if (sig.startsWith('<svg') || sig.startsWith('<?xml')) return { kind: sig.startsWith('<svg') ? 'SVG image' : 'XML document' }
  if (sig.startsWith('%PDF-')) return { kind: 'PDF document', extra: 'version ' + r.ascii(5, 3) }
  if (sig.startsWith('PK\u0003\u0004')) {
    // An Office document is a zip whose first entry names it.
    const name = r.ascii(30, Math.min(40, r.le16(26)))
    const kind = name.startsWith('word/') ? 'Word document (zip)' : name.startsWith('xl/') ? 'Excel workbook (zip)' : name.startsWith('ppt/') ? 'PowerPoint deck (zip)' : name === 'mimetype' ? 'OpenDocument or EPUB (zip)' : 'zip archive'
    return { kind }
  }
  if (r.at(0) === 0x1f && r.at(1) === 0x8b) return { kind: 'gzip data' }
  if (sig.startsWith('BZh')) return { kind: 'bzip2 data' }
  if (r.at(0) === 0xfd && sig.slice(1, 5) === '7zXZ') return { kind: 'xz data' }
  if (r.at(0) === 0x28 && r.at(1) === 0xb5 && r.at(2) === 0x2f && r.at(3) === 0xfd) return { kind: 'zstd data' }
  if (sig.startsWith('7z¼¯')) return { kind: '7-Zip archive' }
  if (sig.startsWith('SQLite format 3')) return { kind: 'SQLite database' }
  if (sig.startsWith('PGDMP')) return { kind: 'pg_dump archive' }
  if (sig.startsWith('ID3') || (r.at(0) === 0xff && (r.at(1) & 0xe0) === 0xe0)) return { kind: 'MP3 audio' }
  if (sig.startsWith('OggS')) return { kind: 'Ogg media' }
  if (sig.slice(4, 8) === 'ftyp') return { kind: 'MP4 media' }
  if (sig.startsWith('\u0000asm')) return { kind: 'WebAssembly module' }
  // Text: every byte of the first few hundred printable, or UTF-8 sequences.
  let text = true
  for (let i = 0; i < Math.min(r.n, 512); i++) { const b = r.at(i); if (b < 9 || (b > 13 && b < 32 && b !== 27)) { text = false; break } }
  if (text) return { kind: 'text' }
  return null
}
const hexPreview = (/** @type {string} */ s, /** @type {number} */ count) => {
  const bytes = []
  for (let i = 0; i < count && 2 + i * 2 < s.length; i++) bytes.push(s.substr(2 + i * 2, 2))
  return bytes.join(' ')
}
const textPreview = (/** @type {ReturnType<typeof reader>} */ r, /** @type {number} */ count) => {
  const bytes = []
  for (let i = 0; i < Math.min(r.n, count); i++) bytes.push(r.at(i))
  try { return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes)) } catch (e) { return '' }
}
// The whole value as base64, up to 4 MB of bytes (the value tab's other face).
const B64_MAX = 4 * 1048576
const base64 = (/** @type {string} */ s) => {
  const n = Math.min((s.length - 2) >> 1, B64_MAX)
  let bin = ''
  for (let i = 0; i < n; i++) bin += String.fromCharCode(parseInt(s.substr(2 + i * 2, 2), 16))
  return btoa(bin)
}
const reading = (/** @type {string} */ s) => {
  const r = reader(s)
  const id = identify(r)
  const parts = [id ? id.kind : 'binary', ...(id && id.dims ? [id.dims] : []), ...(id && id.extra ? [id.extra] : []), size(r.n)]
  return { r, id, line: parts.join(' · ') }
}
const isHex = (/** @type {unknown} */ v) => typeof v === 'string' && v.startsWith('\\x') && /^\\x[0-9a-fA-F]*$/.test(v.slice(0, 66))

/** @type {PlumeSQLExtension} */
export default {
  rules: [
    {
      match: { type: /^bytea$/ },
      fn: (value) => {
        if (!isHex(value)) return value
        const s = String(value)
        const { r, id, line } = reading(s)
        const peek = id && id.kind === 'text' ? '\n\n' + textPreview(r, 400) : ''
        return { value: line, title: hexPreview(s, 48) + (r.n > 48 ? ' …' : '') + peek, class: 'fmt-muted' }
      }
    }
  ],
  inspectors: [
    {
      match: { type: 'bytea' },
      label: 'as base64',
      inspect: (value, ctx) => {
        if (!isHex(value)) return null
        const s = String(value)
        const { r, id, line } = reading(s)
        if (ctx.surface !== 'value') return { line }
        const facts = [id ? id.kind : 'binary data', size(r.n)]
        if (id && id.dims) facts.push(id.dims + ' pixels')
        if (id && id.extra) facts.push(id.extra)
        facts.push('starts ' + hexPreview(s, 8))
        const text = id && id.kind === 'text'
        return {
          line,
          facts,
          note: text ? 'The bytes read as text; the face shows them as base64.' : 'Read from the first bytes, the signature a file starts with; the face shows the bytes as base64' + (r.n > B64_MAX ? ', the first 4 MB.' : '.'),
          face: { text: base64(s), label: 'as base64' }
        }
      }
    }
  ]
}
