// @ts-check
// @description A tab that DRAWS the rows: an interactive hand drawn bar chart
// @color cyan
/** @type {number[]} */
let values = []
/** @type {PlumeSQLExtension} */
export default {
  views: [
    {
      tab: 'Bars',
      inputs: [
        { key: 'value', kind: 'column', label: 'Value', types: ['numeric'] },
        { key: 'top', kind: 'number', label: 'Top rows', default: '50', description: 'How many rows the view reads from the result, from the first one; the rest are left out' }
      ],
      actions: [{ label: 'Copy values', run: (ctx) => ctx.copy(values.join('\n')) }],
      render: async (root, data, ctx) => {
        const cols = data.columns || []
        const inputs = ctx.inputs || {}
        const idx = cols.findIndex((c) => c.name === inputs.value)
        const light = ctx.theme === 'light'
        const fg = light ? '#1a1b26' : '#c8d0e0', mut = light ? '#6b7280' : '#8a92a6'
        const pos = light ? '#5a8bf0' : '#7aa2f7', neg = light ? '#e06c75' : '#f7768e', track = light ? '#00000012' : '#ffffff14'
        if (idx < 0) { root.innerHTML = '<div style="padding:18px;color:' + mut + ';font:13px system-ui,sans-serif">Pick a value column (the sliders button in the header).</div>'; return }
        const top = Math.max(1, Number(inputs.top) || 50)
        const rows = (data.rows || []).slice(0, top)
        values = rows.map((r) => Number(r[idx]) || 0)
        const max = Math.max(1, ...values.map((v) => Math.abs(v)))
        const fmt = (n) => Math.abs(n) >= 1000 ? n.toLocaleString() : String(n)
        root.innerHTML = ''
        const wrap = document.createElement('div')
        wrap.style.cssText = 'padding:16px 18px;font:12px system-ui,sans-serif;color:' + fg
        const head = document.createElement('div')
        head.style.cssText = 'margin-bottom:10px;color:' + mut + ';font-size:11px;letter-spacing:.05em;text-transform:uppercase'
        head.textContent = cols[idx].name + ' \u00b7 ' + values.length + ' rows'
        wrap.appendChild(head)
        values.forEach((v, i) => {
          const rowEl = document.createElement('div')
          rowEl.style.cssText = 'display:flex;align-items:center;gap:8px;margin:4px 0;cursor:pointer'
          rowEl.title = 'Row ' + (i + 1) + ' = ' + v + ' (click to select)'
          rowEl.onclick = () => ctx.selectRow(i)
          const n = document.createElement('span')
          n.style.cssText = 'flex:0 0 auto;width:26px;text-align:right;color:' + mut + ';font-variant-numeric:tabular-nums'
          n.textContent = String(i + 1)
          const t = document.createElement('div')
          t.style.cssText = 'flex:1;min-width:0;height:16px;border-radius:3px;background:' + track
          const bar = document.createElement('div')
          bar.style.cssText = 'height:100%;border-radius:3px;background:' + (v < 0 ? neg : pos) + ';width:' + (Math.abs(v) / max * 100).toFixed(1) + '%'
          t.appendChild(bar)
          const val = document.createElement('span')
          val.style.cssText = 'flex:0 0 auto;min-width:48px;text-align:right;color:' + fg + ';font-variant-numeric:tabular-nums'
          val.textContent = fmt(v)
          rowEl.appendChild(n); rowEl.appendChild(t); rowEl.appendChild(val)
          wrap.appendChild(rowEl)
        })
        root.appendChild(wrap)
      }
    }
  ]
}
