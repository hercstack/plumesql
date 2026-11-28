// @ts-check
// @description Save a result as an Excel workbook from Save As: the rows under a bold header on sheet data, the columns and their types on sheet fields
// @color green

// A Save As format returns ONE string, which PlumeSQL writes to the file as
// UTF-8 text. A workbook is a zip, so every byte of this one is kept in the
// range where UTF-8 text and bytes are the same, below 0x80: the parts are
// stored, not deflated (no compressor in the sandbox, and deflate writes
// any byte); every other character in the XML is a character reference;
// and the zip's few binary fields (CRC-32, sizes, offsets) are brought into
// that range by spaces after each part's root element, which XML allows,
// and by the padding a local header's extra field and the last directory
// entry's comment may carry.

const NUMBER = /^(smallint|integer|bigint|numeric|decimal|real|double precision|int[248]?|float[48])$/i
const FLOAT = /^(real|double precision|float[48])$/i
const BOOLEAN = /^bool(ean)?$/i
const CELL_MAX = 32767
const SHEET_MAX = 1048576

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG = 'http://schemas.openxmlformats.org/package/2006/'
const CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.'
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'

/** Text as XML character data in ASCII alone. @param {string} s */
const esc = (s) => {
  if (s.length > CELL_MAX) s = s.slice(0, CELL_MAX)
  if (/^[ !#-%'-;=?-~]*$/.test(s)) return s
  let out = ''
  for (const ch of s) {
    const c = /** @type {number} */ (ch.codePointAt(0))
    if (c === 38) out += '&amp;'
    else if (c === 60) out += '&lt;'
    else if (c === 62) out += '&gt;'
    else if (c === 34) out += '&quot;'
    else if (c >= 32 && c < 127) out += ch
    else if (c === 9 || c === 10 || c === 13) out += '&#' + c + ';'
    // Characters XML 1.0 has no place for, a lone surrogate among them.
    else if (c < 32 || c === 0xfffe || c === 0xffff || (c >= 0xd800 && c <= 0xdfff)) continue
    else out += '&#' + c + ';'
  }
  return out
}

/** @param {number} c 0-based column */
const colName = (c) => {
  let s = ''
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** Significant digits of a decimal's text. @param {string} v */
const digits = (v) => {
  let d = v.replace(/[^0-9.]/g, '')
  if (d.includes('.')) d = d.replace(/0+$/, '')
  return d.replace('.', '').replace(/^0+/, '').length
}

/** @param {string} ref @param {string} v @param {boolean} bold */
const textCell = (ref, v, bold) =>
  '<c r="' + ref + '" t="inlineStr"' + (bold ? ' s="1"' : '') + '><is><t' +
  (/^\s|\s$|[\t\n\r]/.test(v) ? ' xml:space="preserve"' : '') + '>' + esc(v) + '</t></is></c>'

/** One value, a number or a boolean where the column's type says so. @param {string} ref @param {string | null} v @param {string} type */
const valueCell = (ref, v, type) => {
  if (v === null || v === undefined) return ''
  v = String(v)
  const base = type.split('(')[0].trim()
  if (BOOLEAN.test(base) && /^(t|f|true|false)$/.test(v)) return '<c r="' + ref + '" t="b"><v>' + (v[0] === 't' ? 1 : 0) + '</v></c>'
  // Excel keeps 15 significant digits: a wider numeric or bigint stays exact, as text.
  if (NUMBER.test(base) && v !== '' && v.trim() === v && Number.isFinite(Number(v)) && (FLOAT.test(base) || digits(v) <= 15))
    return '<c r="' + ref + '"><v>' + v + '</v></c>'
  return textCell(ref, v, false)
}

/** @param {string[]} rows @param {string} ref */
const sheet = (rows, ref) =>
  DECL + '<worksheet xmlns="' + NS + '"><dimension ref="' + ref + '"/><sheetData>' + rows.join('') + '</sheetData></worksheet>'

/** @param {number} r @param {string[]} cells */
const row = (r, cells) => '<row r="' + r + '">' + cells.join('') + '</row>'

// ----- the zip ----------------------------------------------------------------

const TABLE = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  TABLE[n] = c
}
/** A byte the file may hold. @param {number} b */
const okByte = (b) => b < 0x80
/** @param {number} n */
const ok32 = (n) => okByte(n & 255) && okByte((n >>> 8) & 255) && okByte((n >>> 16) & 255) && okByte(n >>> 24)
/** A local extra field length that can be written: none, or its 4 header bytes and the rest. @param {number} e */
const okExtra = (e) => e === 0 || (e >= 4 && okByte(e) && okByte(e - 4))

/** @param {number} n */
const u16 = (n) => String.fromCharCode(n & 255, (n >>> 8) & 255)
/** @param {number} n */
const u32 = (n) => String.fromCharCode(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, n >>> 24)

const DOS_TIME = 0
const DOS_DATE = (40 << 9) | (1 << 5) | 1 // 2020-01-01: the stamp is not the point, its bytes are

/**
 * The zip as a string of bytes below 0x80. Each part (ASCII already) is
 * padded with spaces until its size and its CRC-32 are writable and the next
 * header can start on a writable offset, at most 127 bytes of local extra
 * field away.
 * @param {[string, string][]} parts
 */
const zip = (parts) => {
  const out = [], dir = []
  let offset = 0
  for (const [name, content] of parts) {
    let state = -1
    for (let i = 0; i < content.length; i++) state = TABLE[(state ^ content.charCodeAt(i)) & 255] ^ (state >>> 8)
    let size = content.length, pad = 0, extra = -1, sum = 0
    for (;;) {
      sum = (state ^ -1) >>> 0
      if (ok32(size) && ok32(sum)) {
        const next = offset + 30 + name.length + size
        for (let e = 0; e < 128; e++) if (okExtra(e) && ok32(next + e)) { extra = e; break }
        if (extra >= 0) break
      }
      state = TABLE[(state ^ 32) & 255] ^ (state >>> 8)
      size++
      pad++
    }
    const fixed = u16(20) + u16(0) + u16(0) + u16(DOS_TIME) + u16(DOS_DATE) + u32(sum) + u32(size) + u32(size) + u16(name.length)
    const ext = extra ? u16(0x5850) + u16(extra - 4) + ' '.repeat(extra - 4) : ''
    out.push('PK\x03\x04' + fixed + u16(extra) + name + ext, content, ' '.repeat(pad))
    dir.push({ name, fixed, offset })
    offset += 30 + name.length + extra + size
  }
  let dirSize = dir.reduce((n, d) => n + 46 + d.name.length, 0), comment = 0
  while (comment < 128 && (!ok32(dirSize + comment) || !okByte(comment))) comment++
  if (comment >= 128) throw new Error('the workbook directory could not be laid out')
  dirSize += comment
  dir.forEach((d, i) => {
    const last = i === dir.length - 1 ? comment : 0
    out.push('PK\x01\x02' + u16(20) + d.fixed + u16(0) + u16(last) + u16(0) + u16(0) + u32(0) + u32(d.offset) + d.name + ' '.repeat(last))
  })
  out.push('PK\x05\x06' + u16(0) + u16(0) + u16(dir.length) + u16(dir.length) + u32(dirSize) + u32(offset) + u16(0))
  const file = out.join('')
  if (/[^\x00-\x7f]/.test(file)) throw new Error('the workbook would not survive being written as text')
  return file
}

// ----- the workbook -----------------------------------------------------------

/** @param {FormatData} data @param {FormatContext} ctx */
const workbook = (data, ctx) => {
  const cols = data.columns
  if (!cols.length) throw new Error('The result has no columns to save.')
  if (data.rows.length > SHEET_MAX - 1) throw new Error('A sheet holds 1,048,575 rows below its header; this result has ' + data.rows.length + '.')
  const letters = cols.map((_, c) => colName(c))
  const dataRows = [row(1, cols.map((c, i) => textCell(letters[i] + '1', c.name, true)))]
  data.rows.forEach((r, i) => dataRows.push(row(i + 2, r.map((v, c) => valueCell(letters[c] + (i + 2), v, cols[c].type || '')))))

  const now = new Date(), two = (/** @type {number} */ x) => String(x).padStart(2, '0')
  const when = now.getFullYear() + '-' + two(now.getMonth() + 1) + '-' + two(now.getDate()) + ' ' +
    two(now.getHours()) + ':' + two(now.getMinutes()) + ':' + two(now.getSeconds())
  const fieldRows = [row(1, [textCell('A1', 'field', true), textCell('B1', 'type', true)])]
  cols.forEach((c, i) => fieldRows.push(row(i + 2, [textCell('A' + (i + 2), c.name, false), textCell('B' + (i + 2), c.type || '', false)])))
  const facts = [['rows', String(data.rows.length)]]
  if (ctx.source) facts.push(['source', ctx.source.schema + '.' + ctx.source.table])
  facts.push(['exported', when])
  facts.forEach(([label, value], i) => {
    const r = cols.length + 3 + i
    fieldRows.push(row(r, [textCell('A' + r, label, true), label === 'rows' ? '<c r="B' + r + '"><v>' + value + '</v></c>' : textCell('B' + r, value, false)]))
  })

  const rel = (/** @type {string} */ id, /** @type {string} */ type, /** @type {string} */ target) =>
    '<Relationship Id="' + id + '" Type="' + RELS + '/' + type + '" Target="' + target + '"/>'
  const font = (/** @type {boolean} */ bold) => '<font>' + (bold ? '<b/>' : '') + '<sz val="11"/><name val="Calibri"/></font>'
  return zip([
    ['[Content_Types].xml', DECL + '<Types xmlns="' + PKG + 'content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="' + CT + 'sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="' + CT + 'styles+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="' + CT + 'worksheet+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="' + CT + 'worksheet+xml"/></Types>'],
    ['_rels/.rels', DECL + '<Relationships xmlns="' + PKG + 'relationships">' + rel('rId1', 'officeDocument', 'xl/workbook.xml') + '</Relationships>'],
    ['xl/workbook.xml', DECL + '<workbook xmlns="' + NS + '" xmlns:r="' + RELS + '"><sheets>' +
      '<sheet name="data" sheetId="1" r:id="rId1"/><sheet name="fields" sheetId="2" r:id="rId2"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', DECL + '<Relationships xmlns="' + PKG + 'relationships">' +
      rel('rId1', 'worksheet', 'worksheets/sheet1.xml') + rel('rId2', 'worksheet', 'worksheets/sheet2.xml') + rel('rId3', 'styles', 'styles.xml') + '</Relationships>'],
    ['xl/styles.xml', DECL + '<styleSheet xmlns="' + NS + '">' +
      '<fonts count="2">' + font(false) + font(true) + '</fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ['xl/worksheets/sheet2.xml', sheet(fieldRows, 'A1:B' + (cols.length + 2 + facts.length))],
    ['xl/worksheets/sheet1.xml', sheet(dataRows, 'A1:' + letters[letters.length - 1] + dataRows.length)]
  ])
}

/** Copy As gets the rows as tab separated text with a header, which pastes into Excel as cells. @param {FormatData} data */
const tabbed = (data) => {
  const cell = (/** @type {string | null} */ v) => (v == null ? '' : /[\t\n\r"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v)
  return [data.columns.map((c) => cell(c.name)), ...data.rows.map((r) => r.map(cell))].map((r) => r.join('\t')).join('\n')
}

/** @type {PlumeSQLExtension} */
export default {
  formats: [
    {
      id: 'xlsx',
      label: 'Excel workbook',
      extension: 'xlsx',
      format: (data, ctx) => (ctx.purpose === 'save' ? workbook(data, ctx) : tabbed(data))
    }
  ]
}
