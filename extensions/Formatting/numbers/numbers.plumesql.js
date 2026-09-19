// @ts-check
// @description Every number column reads your way: thousands separators, a fixed number of decimals, negatives in red or in parentheses
// @color green
/** @type {PlumeSQLExtension} */
export default {
  inputs: [
    { key: 'grouping', kind: 'choice', label: 'Thousands', options: ['separated, 1,234,567', 'as sent, 1234567'], default: 'separated, 1,234,567' },
    { key: 'decimals', kind: 'choice', label: 'Decimals', options: ['as sent', '0', '1', '2', '3', '4'], default: 'as sent', description: 'A fixed number rounds the cell; the exact value stays on hover' },
    { key: 'negatives', kind: 'choice', label: 'Negatives', options: ['plain', 'in red', 'in parentheses'], default: 'plain' }
  ],
  rules: [
    {
      match: { type: /^(smallint|integer|bigint|numeric|decimal|real|double)/ },
      fn: (value, row, prevRow, ctx) => {
        const n = Number(value)
        if (value == null || value === '' || !Number.isFinite(n)) return value
        const o = ctx.inputs
        const fixed = /^\d$/.test(o.decimals ?? '') ? Number(o.decimals) : null
        // "As sent" keeps the digits the server sent after the point.
        const sent = (String(value).split('.')[1] ?? '').length
        const digits = fixed ?? Math.min(sent, 20)
        const grouped = !(o.grouping ?? '').startsWith('as sent')
        const text = new Intl.NumberFormat(undefined, { useGrouping: grouped, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(n))
        const title = fixed !== null && digits < sent ? String(value) : undefined
        if (n < 0 && o.negatives === 'in parentheses') return { value: '(' + text + ')', class: 'fmt-bad', align: 'right', title }
        const out = (n < 0 ? '-' : '') + text
        return { value: out, class: n < 0 && o.negatives === 'in red' ? 'fmt-bad' : undefined, align: 'right', title }
      }
    }
  ]
}
