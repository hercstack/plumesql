# Unused indexes

![Unused indexes: Indexes nothing has read since the statistics were reset](media/unused-indexes.webp)

Indexes nothing has read since the statistics were reset, largest
first. Each one is paid for on every write to its table and returns
nothing on reads, so the list is where disk and write time can be
reclaimed; the drill-down shows the write traffic that pays for one.

## What it shows

One row per user index with zero scans, excluding the ones that cannot
be dropped anyway: primary keys, unique indexes, indexes backing a
constraint and the replica identity index.

| Column | Meaning |
|---|---|
| schema, table, index | The index and its table. |
| size | What it takes on disk. |
| scans | Zero, by construction. |

**Write traffic** on a table opens a second grid with what the table
pays: rows inserted, updated (and how many of those were HOT updates,
which write no index), deleted, and its scan counts, one counter per
row.

## Requirements

PostgreSQL 13 or newer. The counters come from `pg_stat_user_indexes`
and `pg_stat_user_tables`, since the last statistics reset or the last
restart.

## Notes

Reads only: nothing is dropped here. An index unused on this server may
be read on a replica, or once a month by a report; check the reset time
and the replicas before dropping, and prefer `DROP INDEX CONCURRENTLY`.
