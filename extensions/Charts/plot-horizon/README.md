# Horizon

![Plot horizon: Many series in compact folded bands, one row each, for a LOT of rows (Observable Plot, CDN)](media/plot-horizon.webp)

Many series in compact folded bands, one row each, for a lot of rows. Rendered by Observable Plot (a CDN load).

## What it shows

A **Horizon** tab beside the grid: each series is one thin row whose values are folded into colour bands, so dozens of series compare in the height of one chart.

## Inputs

| Input | `@inputs` key | Default | Meaning |
|---|---|---|---|
| X (a column, or the row order) | `x` | asked | Horizontal axis: a timestamp draws a time axis, a number a numeric one, anything else categories |
| Series (one row each) | `series` | asked | One horizon row per column; edit the comma list to add or remove one |
| Bands | `bands` | 3 | How many colour bands the values are folded into, 1 to 5 |
| Colours | `scheme` | blues |  |
| Top rows | `top` | 1000000 | How many rows the view reads from the result, from the first one; the rest are left out |

## Requirements

PostgreSQL 13 or newer. No server side: the result's sandbox draws it from the rows already fetched. The library comes from `cdn.jsdelivr.net` when the view draws, so that host has to be allowed first; the extension's page has the Allow button. The Plot core extension installs with it; that is where the helpers common to the Observable Plot charts live.

## Notes

Sized for a lot of rows. The rows are paged in up to Top and bucketed down to what fits the pixels before Observable Plot, an SVG renderer, gets them. From a script: `-- @extension plot-horizon` (plus `open`, `only` or `beside` for how the view opens) above the query, and `-- @inputs` to answer the inputs in the file so the dialog never shows. From a result: its own menu. The page has every line ready.
