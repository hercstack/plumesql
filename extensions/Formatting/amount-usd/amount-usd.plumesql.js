// @ts-check
// @description A numeric column named amount/price/cost/total/balance/salary reads as USD
// @color green
/** @type {PlumeSQLExtension} */
export default [
  {
    match: { name: /(amount|price|cost|total|balance|salary)$/i, type: /^(smallint|integer|bigint|numeric|decimal|real|double)/ },
    fn: (value) => {
      const n = Number(value)
      if (!Number.isFinite(n)) return value
      const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })
      return { value: money.format(n), align: 'right' }
    }
  }
]
