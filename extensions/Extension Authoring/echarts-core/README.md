# ECharts core

Shared helpers the ECharts chart extensions import: the theme's colours as ECharts options (text, lines, tooltips, axes, legends, the zoom slider, a categorical set and two ramps), one live chart per view that a redraw disposes, a calm note in place of a chart, and number and CSV helpers. A library: it adds no view of its own and is installed as a dependency of the charts that use it, never on its own initiative.

## What it shows

Nothing to a result by itself. Network graph, Sankey, Timeline, Tree, Sunburst, Candlestick, Parallel coordinates and World map import from `$ext/echarts-core/echarts-core.plumesql.js` and draw with it.

## Writing a chart on it

ECharts is a classic script, so a view lists it in its own `scripts` and its manifest's `externals`, and the library finds the global:

```js
import { echartsOf, themeOf, mount, note, NO_ECHARTS, tooltipOf } from '$ext/echarts-core/echarts-core.plumesql.js'

let chart = null
export default {
  views: [{
    tab: 'My chart',
    scripts: ['https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js'],
    inputs: [{ key: 'x', kind: 'column', label: 'X' }, { key: 'y', kind: 'column', label: 'Y', types: ['numeric'] }],
    render: (root, data, ctx) => {
      if (!echartsOf()) { note(root, NO_ECHARTS); return }
      const th = themeOf(ctx)
      chart = mount(root, chart)
      chart.setOption({ color: th.colors, tooltip: tooltipOf(th), xAxis: { type: 'category' }, yAxis: {}, series: [{ type: 'bar', data: [] }] })
    },
    resize: (root, size) => { if (!chart) throw new Error('no chart'); chart.resize(size) }
  }]
}
```

Under Dark and Light the colours are the curated set every chart was drawn against; under a theme extension they are that theme's own roles, so a chart follows Nord or Solarized like the rest of the app.

## Requirements

PostgreSQL 13 or newer. The charts that use it load ECharts from `cdn.jsdelivr.net`, which has to be an allowed remote script host (the Log offers Allow host).

## Notes

Removing a chart keeps this one while another still needs it; it goes when the last one does.
