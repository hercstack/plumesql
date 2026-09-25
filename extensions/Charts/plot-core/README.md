# Plot core

Shared helpers the Observable Plot chart extensions import: paging a whole result in, thinning and sampling a million points to what the pixels can show, colour palettes and ramps, axis and margin helpers, the theme's ink and paper. A library: it adds no view of its own and is installed as a dependency of the plot extensions, never on its own initiative.

## What it shows

Nothing to a result by itself. The `plot-*` extensions import from `$ext/plot-core/plot-core.plumesql.js` and draw with it.

## Requirements

PostgreSQL 13 or newer. Loads `cdn.jsdelivr.net` (Observable Plot) at run time; the host must be on the allowed remote script hosts (the page offers Allow).

## Notes

Removing a plot extension keeps this one while another still needs it; it goes when the last one does.
