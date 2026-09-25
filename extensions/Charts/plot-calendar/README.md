# Calendar

![Plot calendar: One coloured cell per day, weeks across and weekdays down, a row per year (Observable Plot, CDN)](media/plot-calendar.webp)

One coloured cell per day, weeks across and weekdays down, a row per year: activity over time at a glance. The chart is Observable Plot's, fetched from a CDN when the tab opens.

## What it shows

A **Calendar** tab beside the grid: the rows are folded per day (a sum, a mean, a max, a min or a count) and each day is a cell coloured on the scheme you pick.

## Inputs

| Input | `@inputs` key | Default | Meaning |
|---|---|---|---|
| Date | `date` | asked |  |
| Value | `value` | none | Numeric column folded per day; without one, the number of rows per day |
| Per day | `agg` | sum | How the values of one day combine |
| Colours | `scheme` | greens |  |
| Top rows | `top` | 1000000 | How many rows the view reads from the result, from the first one; the rest are left out |

## Requirements

PostgreSQL 13 or newer. Runs entirely in the result's sandbox, with no server side. Loads `cdn.jsdelivr.net` at run time; the host must be on the allowed remote script hosts (the extension's page offers Allow). Brings the Plot core extension along: the shared helpers the Observable Plot charts are built on.

## Notes

Observable Plot renders SVG, so the view never hands it a million points: the result is read up to Top rows and reduced to the pixels' resolution first. `-- @extension plot-calendar` above a query attaches it; `open`, `only` or `beside` after the id says how the tab opens. With `-- @inputs` in the file the chart draws without the dialog. The lines to copy are on the extension's page, and a result's menu can attach it too.
