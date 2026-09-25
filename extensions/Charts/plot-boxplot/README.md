# Box plot

![Plot boxplot: Quartiles, median and outliers of a value per group (Observable Plot, CDN)](media/plot-boxplot.webp)

Quartiles, median and outliers of a value per group. Observable Plot draws it, loaded from a CDN.

## What it shows

A **Box plot** tab beside the grid: one box per group (or one for the whole result) with the median, the quartiles, the whiskers and the outliers as dots.

## Inputs

| Input | `@inputs` key | Default | Meaning |
|---|---|---|---|
| Value | `value` | asked |  |
| Group | `group` | none | Column that splits the data into one group per value |
| Palette | `palette` | Vivid |  |
| Title | `title` | none |  |
| Top rows | `top` | 1000000 | How many rows the view reads from the result, from the first one; the rest are left out |

## Requirements

PostgreSQL 13 or newer. The view draws in the result's sandbox; the server is not involved. Needs `cdn.jsdelivr.net` among the allowed remote script hosts, since the library loads from there when the view opens; Allow is on the extension's page. Depends on the Plot core extension (the helpers every Observable Plot chart here shares), which installs alongside.

## Notes

Made for big results: up to Top rows are paged in and thinned to what the pixels can carry before they reach Observable Plot, which draws SVG and would choke on the raw count. Put `-- @extension plot-boxplot open` above the query to land on the chart after Run (`only` hides the grid, `beside` splits the two), or attach it from the result's menu. An `-- @inputs` line in the file answers the inputs, so nothing asks; the page lists the lines.
