# Focus

![Plot focus: Brush a window on the overview and the detail below zooms to it, with a hover read-out on both (Observable Plot, CDN)](media/plot-focus.webp)

Brush a window on the overview and the detail below zooms to it, with a hover read-out on both. Observable Plot draws it, loaded from a CDN.

## What it shows

A **Focus** tab beside the grid: a compact overview on top and the detail chart below; drag a window on the overview and the detail redraws to it, one series per numeric column.

## Inputs

| Input | `@inputs` key | Default | Meaning |
|---|---|---|---|
| X (a number, a timestamp, or the row order) | `x` | asked |  |
| Series (Y) | `series` | asked | One series per column; edit the comma list to add or remove one |
| Palette | `palette` | Vivid |  |
| Title | `title` | none |  |
| Top rows | `top` | 1000000 | How many rows the view reads from the result, from the first one; the rest are left out |

## Requirements

PostgreSQL 13 or newer. The view draws in the result's sandbox; the server is not involved. Needs `cdn.jsdelivr.net` among the allowed remote script hosts, since the library loads from there when the view opens; Allow is on the extension's page. Depends on the Plot core extension (the helpers every Observable Plot chart here shares), which installs alongside.

## Notes

Made for big results: up to Top rows are paged in and thinned to what the pixels can carry before they reach Observable Plot, which draws SVG and would choke on the raw count. Put `-- @extension plot-focus open` above the query to land on the chart after Run (`only` hides the grid, `beside` splits the two), or attach it from the result's menu. An `-- @inputs` line in the file answers the inputs, so nothing asks; the page lists the lines.
