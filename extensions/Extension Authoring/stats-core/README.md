# Stats core

The arithmetic behind PlumeSQL's analysis extensions, shared so each of them computes a median or a correlation the same way. You do not install it yourself: it comes with the extensions that use it.

## What it gives an extension author

Import it from `$ext/stats-core/stats-core.plumesql.js` and list `stats-core` in your manifest's `dependencies`. It has no view of its own and loads nothing from the network: plain JavaScript run in the result's sandbox.

- **Rows**: `loadRows(data, ctx, top)` pages a whole result in past the first window; `topOf`, `colIndex`, `colIndexes`, `isNumericCol`, and `ask(message)`, a one-column table that tells the reader what to pick.
- **Numbers**: `num` reads a number from the server's text, `round`, `keyOf`.
- **Folds**: `fold(agg, values)` for `count`, `sum`, `mean`, `median`, `min`, `max`, `stdev`, `p90` and `distinct` (`FOLDS` lists them); `sum`, `mean`, `variance`, `stdev`, `sorted`, `quantile`, `median` on their own.
- **Ranks and links**: `ranks`, `pearson`, `spearman`, `linearFit` (least squares).
- **Bins**: `niceWidth`, `binEdges` (round edges), `binOf`, `edgeText`.
- **Time**: `parseTime`, `truncTime`, `stepTime`, `timeText`, `guessUnit` over `UNITS` (minute to year).
- **Forecasts**: `holt` (trend-aware smoothing) and `linearForecast`.
- **Sampling and colour**: `random(seed)`, a repeatable sampler; `tint(token, percent)`, a cell colour from the theme; `escapeHtml`.

A table view that answers "the median per group":

```js
import { loadRows, topOf, colIndex, ask, fold } from '$ext/stats-core/stats-core.plumesql.js'

/** @type {PlumeSQLExtension} */
export default {
  views: [{
    tab: 'Median per group',
    inputs: [
      { key: 'group', kind: 'column', label: 'Group' },
      { key: 'value', kind: 'column', label: 'Value', types: ['numeric'] }
    ],
    table: async (data, ctx) => {
      const inputs = ctx.inputs || {}
      const cols = data.columns || []
      const gi = colIndex(cols, inputs.group), vi = colIndex(cols, inputs.value)
      if (gi < 0 || vi < 0) return ask('Pick the Group and the Value (the sliders button in the header)')
      const groups = new Map()
      for (const r of await loadRows(data, ctx, topOf(inputs))) {
        const k = r[gi] == null ? null : String(r[gi])
        if (!groups.has(k)) groups.set(k, [])
        groups.get(k).push(r[vi])
      }
      return {
        columns: [{ name: cols[gi].name, type: 'text' }, { name: 'median', type: 'numeric' }],
        rows: [...groups].map(([k, values]) => [k, fold('median', values)])
      }
    }
  }]
}
```

## Who uses it

Group by, Histogram, Correlation, Frequencies, Outliers, Duplicates, Data quality, Cohorts, Clusters, RFM segments, Period over period, Resample, Forecast, Sample, Unpivot, the Calculations (Change, Rank, Moving average, Percent of total, Totals and subtotals), Conditional format, the Dashboards (KPI cards, Gauge, Funnel, Pareto, Treemap, Waterfall), the ECharts charts and Explain plan.

## Good to know

The folds answer what a spreadsheet answers: the standard deviation is the sample one (STDEV.S), a percentile interpolates between ranks (PERCENTILE.INC, PostgreSQL's `percentile_cont`), and tied ranks share their average place (RANK.AVG). Times are bucketed in UTC and weeks start on Monday, as `date_trunc('week', ...)` does.

Removing an extension that uses it keeps this one while another still needs it; it goes when the last one does.

## Requirements

PostgreSQL 13 or newer.
