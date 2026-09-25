# Beeswarm

![Plot beeswarm: One dodged dot per row, the distribution of a value, a sample of a LOT of rows (Observable Plot, CDN)](media/plot-beeswarm.webp)

One dodged dot per row, the distribution of a value, from a sample of a lot of rows. Drawn with Observable Plot, pulled from a CDN.

## What it shows

A **Beeswarm** tab beside the grid: every dot is a row, dodged so none overlap, split into one swarm per group when a Group column is given; a larger result is sampled down to the number of dots you allow.

## Inputs

| Input | `@inputs` key | Default | Meaning |
|---|---|---|---|
| Value | `value` | asked |  |
| Group | `group` | none | Column that splits the data into one group per value |
| Dots drawn | `dots` | 4000 | A larger result is sampled down to this many dots |
| Palette | `palette` | Vivid |  |
| Title | `title` | none |  |
| Top rows | `top` | 1000000 | How many rows the view reads from the result, from the first one; the rest are left out |

## Requirements

PostgreSQL 13 or newer. Nothing on the server: the view runs in the result's sandbox. Fetches its library from `cdn.jsdelivr.net` at run time. Allow the host once (the page offers it) or the view stays blank. Installs the Plot core extension with it, the shared helpers the Observable Plot charts draw with.

## Notes

Written for a LOT of rows: the whole result is paged in up to Top rows and reduced to what the pixels can show before Observable Plot, an SVG renderer, sees it. Attach it from a script with `-- @extension plot-beeswarm` above a query (add `open`, `only` or `beside` to open on the view), or from a result's own menu; the extension's page in PlumeSQL lists the lines to paste, and `-- @inputs` answers the inputs in the file so the chart draws with no dialog.
