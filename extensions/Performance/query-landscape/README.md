# Query landscape

![Query landscape: Every statement on this server in 3D: calls, mean time and cache hit, sized by total time, from pg_stat_statements](media/query-landscape.webp)

Every statement on this server in 3D, from `pg_stat_statements`: how often it runs, how long it takes on average and how much of what it reads comes from the cache, each point sized by the time it costs in total. The statements that matter stand out at a glance: big, high and far to the right.

## What it shows

The statements of the current database (up to 5000, the costliest first) in a grid, opened on a **Landscape** tab drawn by Scatter 3D (which installs with it):

| Axis | Column | Scale |
|---|---|---|
| Width | `calls` | log |
| Height | `mean_ms`, the mean execution time | log |
| Depth | `cache_pct`, the share of blocks found in shared buffers | linear |
| Size | `total_ms`, the total execution time | |
| Colour | `kind`, the statement's first word (`select`, `update`, `insert` ...) | |

Hover a point for its numbers and its text; click it to select its row in the grid, where `rows_per_call` and the full statement are too. A big point high up is slow and costly; one far to the right runs constantly, so a small saving there adds up; one at the low end of the depth reads from disk. **Spin** turns the landscape slowly; the legend hides and shows a kind with a click.

The query is the extension's own file, a read of `pg_stat_statements` and nothing else.

## Requirements

PostgreSQL 13 or newer with the `pg_stat_statements` extension: `shared_preload_libraries = 'pg_stat_statements'` in the server's configuration (a restart), then `create extension pg_stat_statements;` in the database. The statistics count from the last `pg_stat_statements_reset()`. three.js comes from `cdn.jsdelivr.net`, which has to be an allowed remote script host (the Log offers Allow host when it is not).

## Notes

A statement that touched no blocks (a `SET`, a `BEGIN`) has no cache share and is left out of the picture, not out of the grid. The view's inputs are set in the file (`-- @inputs`): the sliders button in the view's header changes them for this result, and Fork to Scripts makes a copy of your own to change them for good.
