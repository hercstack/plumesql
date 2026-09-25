# Density

![Plot density: A hexbin heatmap or density contours for a LOT of points, where a scatter would be a blob (Observable Plot, CDN)](media/plot-density.webp)

A hexbin heatmap or density contours for a lot of points, where a scatter would be a blob. Drawn with Observable Plot, pulled from a CDN.

## What it shows

A **Density** tab beside the grid: hexbin fills hexagons of the size you choose by count, contours draws density lines, both over a colour scheme you pick.

## Inputs

| Input | `@inputs` key | Default | Meaning |
|---|---|---|---|
| X | `x` | asked |  |
| Y | `y` | asked |  |
| Style | `style` | hexbin | hexbin fills hexagons by count; contours draws density lines |
| Hex size (px) | `bin` | 12 |  |
| Colours | `scheme` | turbo |  |
| Title | `title` | none |  |
| Top rows | `top` | 1000000 | How many rows the view reads from the result, from the first one; the rest are left out |

## Requirements

PostgreSQL 13 or newer. Nothing on the server: the view runs in the result's sandbox. Fetches its library from `cdn.jsdelivr.net` at run time. Allow the host once (the page offers it) or the view stays blank. Installs the Plot core extension with it, the shared helpers the Observable Plot charts draw with.

## Notes

Written for a LOT of rows: the whole result is paged in up to Top rows and reduced to what the pixels can show before Observable Plot, an SVG renderer, sees it. Attach it from a script with `-- @extension plot-density` above a query (add `open`, `only` or `beside` to open on the view), or from a result's own menu; the extension's page in PlumeSQL lists the lines to paste, and `-- @inputs` answers the inputs in the file so the chart draws with no dialog.
