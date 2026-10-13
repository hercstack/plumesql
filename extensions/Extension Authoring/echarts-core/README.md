# ECharts core

The shared toolkit of PlumeSQL's ECharts charts, so each of them follows the app's theme and tidies up after itself the same way. You do not install it yourself: it comes with the charts that use it.

## What it gives an extension author

Import it from `$ext/echarts-core/echarts-core.plumesql.js` and list `echarts-core` in your manifest's `dependencies`. It has no view of its own.

- **The library itself**: ECharts is a classic script, so your view lists it in its own `scripts` (and your manifest in `externals`); `echartsOf()` finds the global, or answers `null` when it did not load.
- **One chart per view**: `mount(root, previous)` disposes the chart the view drew last and starts a new one filling the view, so a redraw leaves no canvas or listener behind.
- **The theme**: `themeOf(ctx)` gives the colours to paint with (text, muted text, lines, grid, panes, the accent, a categorical set, two ramps, up and down). Under Dark and Light they are the curated set every chart was drawn against; under a theme extension, that theme's own colours, so a chart follows Nord or Solarized like the rest of the app.
- **Options in the theme**: `titleOf`, `tooltipOf`, `axisOf`, `legendOf` and `sliderOf` return the ECharts option pieces every chart repeats, already coloured; each takes extra options to merge.
- **Small helpers**: `note(root, message)` for a calm line in place of a chart, `NO_ECHARTS` (the message when the library did not load), `rampColor`, `fmtNum` (1.2k, 3.4M), `csvCell` and `csvOf` for a Copy data menu, and `esc` for text put into a tooltip.

A bar chart of one number per category:

```js
import { echartsOf, themeOf, mount, note, NO_ECHARTS, tooltipOf, axisOf } from '$ext/echarts-core/echarts-core.plumesql.js'

let chart = null
/** @type {PlumeSQLExtension} */
export default {
  views: [{
    tab: 'My chart',
    scripts: ['https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'],
    inputs: [
      { key: 'x', kind: 'column', label: 'Category' },
      { key: 'y', kind: 'column', label: 'Value', types: ['numeric'] }
    ],
    render: (root, data, ctx) => {
      if (!echartsOf()) { note(root, NO_ECHARTS); return }
      const inputs = ctx.inputs || {}
      const cols = data.columns || []
      const xi = cols.findIndex((c) => c.name === inputs.x), yi = cols.findIndex((c) => c.name === inputs.y)
      if (xi < 0 || yi < 0) { note(root, 'Pick a Category and a Value (the sliders button in the header).'); return }
      const th = themeOf(ctx)
      chart = mount(root, chart)
      chart.setOption({
        color: th.colors,
        tooltip: tooltipOf(th, { trigger: 'axis' }),
        xAxis: axisOf(th, { type: 'category', data: data.rows.map((r) => r[xi]) }),
        yAxis: axisOf(th, { type: 'value' }),
        series: [{ type: 'bar', data: data.rows.map((r) => Number(r[yi])) }]
      })
    },
    resize: (root, size) => { if (!chart) throw new Error('no chart'); chart.resize(size) }
  }]
}
```

The manifest of such a chart lists `"dependencies": ["echarts-core"]` and `"externals": ["https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"]`.

## Who uses it

Network graph, Sankey, Timeline, Tree, Sunburst, Candlestick, Parallel coordinates and World map.

## Good to know

Removing a chart keeps this one while another still needs it; it goes when the last one does.

## Requirements

PostgreSQL 13 or newer. The charts that use it load ECharts from `cdn.jsdelivr.net`, which has to be an allowed remote script host (the Log offers Allow host).
