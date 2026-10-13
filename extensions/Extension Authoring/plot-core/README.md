# Plot core

The shared toolkit of PlumeSQL's Observable Plot charts, so each of them pages, thins and colours a result the same way. You do not install it yourself: it comes with the `plot-*` extensions.

## What it gives an extension author

Import it from `$ext/plot-core/plot-core.plumesql.js` and list `plot-core` in your manifest's `dependencies`. It has no view of its own.

- **Plot itself**: `P`, Observable Plot with `P.plot` wrapped so a figure's text, its legend included, takes its style's colour (`baseStyle` gives the theme's).
- **Rows**: `loadRows(data, ctx, top)` pages a whole result in; `colIndex`, `seriesIdxs`, `asNum`.
- **Many points**: `thin`, `bucketMean` and `sample` bring a million points down to what the pixels can show, keeping peaks; `extent`, `sortByX`, `lowerBound`, `upperBound`.
- **Axes**: `xKind` (time, number or category), `parseTime` (the server's wall clock, as UTC: Plot's time axis is UTC, so a chart never shifts a time by this machine's zone), `timeText`, `xValue`, `fmtX`, `fmtTick`, `fmtNum`, `anchorZero`, `leftMargin`, `sparse`.
- **Colour and style**: `palettes` (Vivid, Cool, Warm, Mono), `ramps`, `usePalette(ctx)` (call it first in a draw: it follows the app's theme or a theme extension), `inkOf`, `paperOf`, `mutedOf`, `accentOf`, `baseStyle`, `contrast`.
- **Extras**: `pointerMarks` (a hover read-out), `edgeBadges` (value badges at the line ends), `areaGradients` (gradient fills), `note(root, message)` for a calm message in place of a chart.

A bar chart of one number per category:

```js
import { P, loadRows, colIndex, usePalette, baseStyle, palettes, note } from '$ext/plot-core/plot-core.plumesql.js'

/** @type {PlumeSQLExtension} */
export default {
  views: [{
    tab: 'Bars',
    inputs: [
      { key: 'category', kind: 'column', label: 'Category' },
      { key: 'value', kind: 'column', label: 'Value', types: ['numeric'] }
    ],
    render: async (root, data, ctx) => {
      const inputs = ctx.inputs || {}
      const cols = data.columns || []
      const ci = colIndex(cols, inputs.category), vi = colIndex(cols, inputs.value)
      if (ci < 0 || vi < 0) { note(root, 'Pick a Category and a Value (the sliders button in the header).'); return }
      const rows = await loadRows(data, ctx, 10000)
      const dark = usePalette(ctx)
      const fig = P.plot({
        width: root.clientWidth || 640, height: root.clientHeight || 360, marginLeft: 120,
        style: baseStyle(dark),
        marks: [P.barX(rows, { x: (r) => Number(r[vi]), y: (r) => String(r[ci]), fill: palettes.Vivid[0], tip: true })]
      })
      root.innerHTML = ''
      root.append(fig)
    }
  }]
}
```

## Who uses it

Plot chart, Plot focus, Plot ranked, Plot beeswarm, Plot boxplot, Plot calendar, Plot density, Plot heatmap, Plot horizon, Plot regression, Plot ridgeline and Plot streamgraph.

## Good to know

Removing a plot extension keeps this one while another still needs it; it goes when the last one does.

## Requirements

PostgreSQL 13 or newer. Loads Observable Plot from `cdn.jsdelivr.net` at run time; the host must be on the allowed remote script hosts (the page offers Allow).
