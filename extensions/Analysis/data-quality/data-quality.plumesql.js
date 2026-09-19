// @ts-check
// @description One row per column with its checks: nulls, empty strings, key duplicates, unparsed values, stray spaces, case variants, odd dates
// @color violet
import { loadRows, topOf, NUMERIC, TEMPORAL, parseTime } from '$ext/stats-core/stats-core.plumesql.js'

// Distinct values are counted up to this many per column; past it the count reads "at least".
const DISTINCT_CAP = 200000
// A column "looks like" a family when this share of its values reads as one.
const LOOKS = 0.9
// Each check keeps a few of the values it caught, for the cell's hover text.
const EXAMPLES = 3
const BOOL = /^(t|f|true|false|yes|no|on|off|y|n|1|0)$/i
const UUID = /^\{?[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\}?$/i
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i
const SPECIAL_NUMBER = /^[+-]?(nan|infinity)$/i
const DATE = /^\d{4}-\d{2}-\d{2}/
// A column name that reads as a key: id, uuid, key, or <something>_id first in the result.
const KEY_NAME = /^(id|uuid|guid|key)$/i
const KEY_SUFFIX = /_(id|uuid|key)$/i

// The family a declared type belongs to; text and everything unlisted is checked by what its values look like.
const familyOf = (/** @type {string} */ type) => {
  const t = String(type || '').toLowerCase()
  if (t.endsWith('[]')) return 'array'
  if (/^money/.test(t)) return 'money'
  if (NUMERIC.test(t)) return 'number'
  if (TEMPORAL.test(t)) return 'date'
  if (/^bool/.test(t)) return 'boolean'
  if (/^json/.test(t)) return 'json'
  if (t === 'uuid') return 'uuid'
  if (/^(text|character|char|varchar|name|citext|bpchar)/.test(t) || t === '') return 'text'
  return 'other'
}
// Whether a value reads as a family; a date counts BC and infinity as dates (out of range, not unparsed).
const DATE_EDGE = /^[+-]?infinity$|\sBC$/i
const parses = (/** @type {string} */ family, /** @type {string} */ s) => {
  switch (family) {
    case 'number': return NUMBER.test(s.trim()) || SPECIAL_NUMBER.test(s.trim())
    case 'date': return DATE_EDGE.test(s.trim()) || (DATE.test(s.trim()) && parseTime(s) != null)
    case 'boolean': return BOOL.test(s.trim())
    case 'uuid': return UUID.test(s.trim())
    case 'json': try { JSON.parse(s); return true } catch { return false }
    default: return true
  }
}

/**
 * @typedef {{ n: number, examples: string[] }} Tally
 * @returns {Tally}
 */
const tally = () => ({ n: 0, examples: [] })
const hit = (/** @type {Tally} */ t, /** @type {string} */ s) => { t.n++; if (t.examples.length < EXAMPLES) t.examples.push(s) }
const quote = (/** @type {string} */ s) => JSON.stringify(s.length > 40 ? s.slice(0, 39) + '…' : s)
// A count cell: blank when the check does not apply, the plain number when clean, coloured with its examples when not.
const countCell = (/** @type {Tally|null} */ t, /** @type {string} */ cls, /** @type {string} */ what) =>
  t == null ? null
    : t.n === 0 ? 0
      : { value: t.n, class: cls, title: what + ': ' + t.n.toLocaleString() + (t.examples.length ? ', e.g. ' + t.examples.map(quote).join(', ') : '') }

/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Data quality',
      inputs: [
        { key: 'from', kind: 'text', label: 'Earliest date', default: '1900-01-01', description: 'A date or timestamp before this is out of range (a sentinel like 0001-01-01, a typo in the year)' },
        { key: 'to', kind: 'text', label: 'Latest date', default: '2100-12-31', description: 'A date or timestamp after this is out of range (9999-12-31, infinity)' },
      ],
      table: async (data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const from = parseTime(inputs.from || '1900-01-01') ?? parseTime('1900-01-01')
        const to = parseTime(inputs.to || '2100-12-31') ?? parseTime('2100-12-31')
        // An end given as a day includes that whole day.
        const toEnd = /** @type {number} */ (to) + (/^\d{4}-\d{2}-\d{2}$/.test(String(inputs.to || '2100-12-31').trim()) ? 86400000 - 1 : 0)
        const rows = await loadRows(data, ctx, topOf(inputs))
        const N = rows.length
        const stats = cols.map((c) => ({
          declared: familyOf(c.type),
          nulls: 0, empty: tally(), spaces: tally(), nonNull: 0,
          distinct: /** @type {Map<string, number>} */ (new Map()), capped: false,
          // Case variants: a lower-cased value to the first spelling seen, and whether another spelling followed.
          lower: /** @type {Map<string, {first: string, other: string|null}>} */ (new Map()),
          // What the values look like, for a text column: how many read as a number, a date, a boolean.
          looks: { number: 0, date: 0, boolean: 0 }
        }))
        for (const r of rows) {
          for (let k = 0; k < stats.length; k++) {
            const s = stats[k], v = r[k]
            if (v == null) { s.nulls++; continue }
            const str = typeof v === 'string' ? v : String(v)
            s.nonNull++
            if (str === '') { hit(s.empty, str); continue }
            if (str.trim() !== str) hit(s.spaces, str)
            if (!s.capped) {
              s.distinct.set(str, (s.distinct.get(str) || 0) + 1)
              if (s.distinct.size >= DISTINCT_CAP) s.capped = true
              if (s.declared === 'text') {
                // Spaces are their own check: two spellings differ in case only when their trimmed forms do.
                const t = str.trim()
                const low = t.toLowerCase()
                const seen = s.lower.get(low)
                if (!seen) s.lower.set(low, { first: t, other: null })
                else if (seen.other == null && seen.first !== t) seen.other = t
              }
            }
            if (s.declared === 'text') {
              const t = str.trim()
              if (NUMBER.test(t)) s.looks.number++
              else if (DATE.test(t) && parseTime(t) != null) s.looks.date++
              else if (BOOL.test(t)) s.looks.boolean++
            }
          }
        }
        // Second pass, per column: values that do not read as the family, and dates out of range.
        const families = stats.map((s) => {
          if (s.declared !== 'text') return { family: s.declared, inferred: false }
          const filled = s.nonNull - s.empty.n
          for (const f of /** @type {('number'|'date'|'boolean')[]} */ (['number', 'date', 'boolean'])) {
            if (filled >= 5 && s.looks[f] >= LOOKS * filled) return { family: f, inferred: true }
          }
          return { family: 'text', inferred: false }
        })
        const checked = families.map((f) => ['number', 'date', 'boolean', 'uuid', 'json'].includes(f.family))
        const unparsed = families.map((_, k) => (checked[k] ? tally() : null))
        const odd = families.map((f) => (f.family === 'date' ? tally() : null))
        for (const r of rows) {
          for (let k = 0; k < stats.length; k++) {
            if (!checked[k]) continue
            const v = r[k]
            if (v == null || v === '') continue
            const str = typeof v === 'string' ? v : String(v)
            const f = families[k].family
            if (!parses(f, str)) { hit(/** @type {Tally} */ (unparsed[k]), str); continue }
            if (f === 'date') {
              const t = parseTime(str.trim())
              if (DATE_EDGE.test(str.trim()) || t == null || t < /** @type {number} */ (from) || t > toEnd) hit(/** @type {Tally} */ (odd[k]), str)
            }
          }
        }
        const out = cols.map((c, k) => {
          const s = stats[k]
          const fam = families[k]
          const filled = s.nonNull - s.empty.n
          const distinct = s.distinct.size
          // A key: its name says so, or it is the first column (or a uuid) and nearly unique over enough rows
          // that a repeat stands out. A nearly unique measure (a price, a timestamp) further right is not one.
          const nearlyUnique = !s.capped && filled >= 20 && distinct >= 0.99 * filled
          const keyLike = fam.family !== 'boolean' && filled > 0 &&
            (KEY_NAME.test(c.name) || (k === 0 && (KEY_SUFFIX.test(c.name) || nearlyUnique)) || (fam.family === 'uuid' && nearlyUnique))
          /** @type {Tally|null} */
          let dups = null
          // Past the distinct cap the counts would be partial: blank, not a clean 0.
          if (keyLike && !s.capped) {
            dups = tally()
            for (const [v, n] of s.distinct) if (n > 1) { dups.n += n - 1; if (dups.examples.length < EXAMPLES) dups.examples.push(v) }
          }
          /** @type {Tally|null} */
          let cases = null
          if (fam.family === 'text' && !s.capped) {
            cases = tally()
            for (const e of s.lower.values()) if (e.other != null) hit(cases, e.first + ' / ' + e.other)
          }
          /** @type {string[]} */
          const bad = [], warn = []
          if (N && s.nulls === N) warn.push('always NULL')
          if (keyLike && s.nulls) bad.push('NULLs in a key')
          if (dups && dups.n) bad.push('repeated key values')
          const un = unparsed[k]
          if (un && un.n) (fam.inferred ? warn : bad).push('values that do not read as ' + fam.family)
          if (s.empty.n) warn.push('empty strings')
          if (s.spaces.n) warn.push('leading or trailing spaces')
          if (cases && cases.n) warn.push('case variants')
          const od = odd[k]
          if (od && od.n) warn.push('dates out of range')
          if (!s.capped && distinct === 1 && filled === N && N > 1) warn.push('one value throughout')
          const status = bad.length ? { value: 'fail', class: 'fmt-bad' } : warn.length ? { value: 'check', class: 'fmt-warn' } : { value: 'ok', class: 'fmt-ok' }
          const issues = bad.concat(warn)
          return [
            c.name,
            c.type,
            fam.family + (fam.inferred ? ' (looks like)' : ''),
            { ...status, title: issues.length ? issues.join('; ') : 'No check found anything' },
            s.nulls,
            N ? Math.round((s.nulls / N) * 1000) / 10 : null,
            countCell(fam.family === 'text' || fam.inferred ? s.empty : null, 'fmt-warn', 'Empty strings'),
            (s.capped ? '≥ ' : '') + distinct.toLocaleString(),
            keyLike ? 'yes' : '',
            countCell(dups, 'fmt-bad', 'Rows beyond the first with a repeated value'),
            countCell(un, fam.inferred ? 'fmt-warn' : 'fmt-bad', 'Values that do not read as ' + fam.family),
            countCell(s.spaces, 'fmt-warn', 'Values with leading or trailing spaces'),
            countCell(cases, 'fmt-warn', 'Values written in more than one case'),
            countCell(od, 'fmt-warn', 'Dates before ' + (inputs.from || '1900-01-01') + ' or after ' + (inputs.to || '2100-12-31')),
            issues.join('; ')
          ]
        })
        ctx.log('Data quality over ' + N.toLocaleString() + ' rows, ' + cols.length + ' columns: ' +
          out.filter((r) => /** @type {{value: string}} */ (r[3]).value === 'fail').length + ' fail, ' +
          out.filter((r) => /** @type {{value: string}} */ (r[3]).value === 'check').length + ' to check.')
        const columns = [
          { name: 'column', type: 'text' }, { name: 'type', type: 'text' }, { name: 'family', type: 'text' }, { name: 'status', type: 'text' },
          { name: 'nulls', type: 'integer' }, { name: 'null %', type: 'numeric' }, { name: 'empty', type: 'integer' }, { name: 'distinct', type: 'text' },
          { name: 'key', type: 'text' }, { name: 'key repeats', type: 'integer' }, { name: 'unparsed', type: 'integer' }, { name: 'spaces', type: 'integer' },
          { name: 'case variants', type: 'integer' }, { name: 'dates out of range', type: 'integer' }, { name: 'issues', type: 'text' }
        ]
        return { columns, rows: out, frozenColumns: { start: ['column'] } }
      }
    }
  ]
}
