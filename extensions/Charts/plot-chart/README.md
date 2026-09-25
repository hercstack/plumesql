# Plot chart

![Plot chart: Line / area / dot / bar over one or more Y columns, with a hover read-out and value badges (Observable Plot, CDN)](media/plot-chart.webp)

Line, area, dot or bar over one or more Y columns, with a hover read-out and value badges. Rendered by Observable Plot (a CDN load).

## What it shows

A **Chart** tab beside the grid: one series per numeric column you list, over a timestamp, a number or the row order; facet by a column to split it into panels; pick the curve for a line.

## Inputs

| Input | `@inputs` key | Default | Meaning |
|---|---|---|---|
| Mark | `mark` | line |  |
| X (a column, or the row order) | `x` | asked | Horizontal axis: a timestamp draws a time axis, a number a numeric one, anything else categories |
| Series (Y) | `series` | asked | One series per column; edit the comma list to add or remove one |
| Facet by | `facet` | none | Splits the chart into one panel per distinct value |
| Curve | `curve` | linear | Line shape between points: monotone-x is smooth, step is stairs, basis a spline |
| Palette | `palette` | Vivid |  |
| Title | `title` | none |  |
| Top rows | `top` | 500000 | How many rows the view reads from the result, from the first one; the rest are left out |

## Requirements

PostgreSQL 13 or newer. No server side: the result's sandbox draws it from the rows already fetched. The library comes from `cdn.jsdelivr.net` when the view draws, so that host has to be allowed first; the extension's page has the Allow button. The Plot core extension installs with it; that is where the helpers common to the Observable Plot charts live.

## Notes

Sized for a lot of rows. The rows are paged in up to Top and bucketed down to what fits the pixels before Observable Plot, an SVG renderer, gets them. From a script: `-- @extension plot-chart` (plus `open`, `only` or `beside` for how the view opens) above the query, and `-- @inputs` to answer the inputs in the file so the dialog never shows. From a result: its own menu. The page has every line ready.
