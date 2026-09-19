// @ts-check
// @description Amount columns read as money: the currency, the way of writing it and the columns are yours to pick, negatives in parentheses if you like
// @color green
// money arrives in the server's lc_monetary shape ($1,234.50, -$5.00,
// 1.234,50 €): the separator before the last one or two digits is the
// point, every other one groups.
const money = (/** @type {string} */ s) => {
  const neg = /^\s*\(|-/.test(s)
  const d = s.replace(/[^0-9.,]/g, '')
  const m = /^(.*?)[.,](\d{1,2})$/.exec(d)
  const t = m ? m[1].replace(/[.,]/g, '') + '.' + m[2] : d.replace(/[.,]/g, '')
  return t === '' ? NaN : (neg ? -1 : 1) * Number(t)
}
/** @type {Record<string, string | undefined>} */
const LOCALES = { 'Your locale': undefined, 'European, 1.234,56 €': 'de-DE', 'English, €1,234.56': 'en-US', 'Swiss, 1’234.56': 'de-CH', 'French, 1 234,56 €': 'fr-FR' }

/** @type {PlumeSQLExtension} */
export default {
  inputs: [
    { key: 'columns', kind: 'multi-column', label: 'Columns', default: 'amount, price, cost, total, balance, salary, fee', description: 'The amount columns; the usual names are picked when the result has them' },
    { key: 'currency', kind: 'text', label: 'Currency', default: 'EUR', description: 'The ISO code: EUR, USD, GBP, CHF, JPY; empty for a plain number with two decimals' },
    { key: 'locale', kind: 'choice', label: 'Written', options: Object.keys(LOCALES), default: 'Your locale' },
    { key: 'style', kind: 'choice', label: 'Negatives', options: ['with a minus', 'in parentheses (accounting)'], default: 'with a minus', description: 'Accounting also shows a zero as a dash' }
  ],
  rules: [
    {
      match: { input: 'columns' },
      fn: (value, row, prevRow, ctx) => {
        if (value == null || value === '') return value
        const n = /^money/.test(ctx.column.type) ? money(String(value)) : Number(value)
        if (!Number.isFinite(n)) return value
        const o = ctx.inputs
        const title = String(value)
        const code = (o.currency ?? '').trim().toUpperCase()
        const locale = LOCALES[o.locale ?? ''] ?? undefined
        /** @type {Intl.NumberFormatOptions} */
        const opts = /^[A-Z]{3}$/.test(code) ? { style: 'currency', currency: code } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        let fmt
        try {
          fmt = new Intl.NumberFormat(locale, opts)
        } catch {
          fmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        }
        if ((o.style ?? '').startsWith('in parentheses')) {
          if (n === 0) return { value: '-', align: 'right', title }
          const text = fmt.format(Math.abs(n))
          // A positive keeps a hidden parenthesis so its digits line up with
          // the negatives above and below it.
          if (n < 0) return { value: '(' + text + ')', class: 'fmt-bad', align: 'right', title }
          return { value: text, html: text + '<span style="visibility:hidden">)</span>', align: 'right', title }
        }
        return { value: fmt.format(n), class: n < 0 ? 'fmt-bad' : undefined, align: 'right', title }
      }
    }
  ]
}
