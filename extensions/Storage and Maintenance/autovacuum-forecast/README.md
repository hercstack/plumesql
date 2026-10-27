# Autovacuum forecast

When will autovacuum get to this table? The **Autovacuum** tab beside a table statistics result answers for each table: how far its dead rows are from the next vacuum, its inserted rows from the next vacuum for inserts, and its changed rows from the next analyze, by the thresholds your server runs with.

![Autovacuum forecast on pg_stat_user_tables: the thresholds above the table (50 + 0.2 × its rows dead rows, 1,000 + 0.2 × its rows inserted ones, 50 + 0.1 × its rows changed ones, the launcher every minute). events, 80,000 rows: dead rows at 125% and changed rows at 248%, analyze due. orders, 108,571 rows: dead at 79%, analyze due. sessions_log, 2,700 rows: analyze at 94%. Each vacuumed by hand at 14:03](media/autovacuum-forecast.webp)

Three tables a while after a manual vacuum. `events` is past its vacuum threshold (125% of the dead rows that trigger one) and well past its analyze, `orders` is at 79% of its vacuum, and the small `sessions_log` is at 94% of its next analyze. The line above the table says what the thresholds are on this server.

## What it is for

- **A table that keeps bloating.** Its dead rows climb and the vacuum seems never to come: the bar says how far it still is, and the line above the table says why (a 20% scale factor on a 50 million row table waits for 10 million dead rows).
- **Statistics that lag.** Plans go wrong after a big load because the table was not analyzed yet: the **Changed** column says how near the next autoanalyze is.
- **Autovacuum turned off.** The view says so at the top, as it does when `track_counts` is off and nothing is counted at all.

## Try it

```sql
select * from pg_stat_user_tables;
```

The **Autovacuum** tab lists the tables nearest to their next autovacuum or autoanalyze first: each one's rows, which comes next and how far along it is, and a bar for its dead, inserted and changed rows (amber from 80%, red when it is due; hover a bar for the numbers). `pg_stat_all_tables` works too, the system tables included.

## How it counts

Autovacuum vacuums a table once its dead rows pass `autovacuum_vacuum_threshold + autovacuum_vacuum_scale_factor × its rows` (on PostgreSQL 18 at most `autovacuum_vacuum_max_threshold`), vacuums it for its inserts past `autovacuum_vacuum_insert_threshold + autovacuum_vacuum_insert_scale_factor × its rows` (PostgreSQL 13 and newer), and analyzes it past `autovacuum_analyze_threshold + autovacuum_analyze_scale_factor × its rows` changed rows. The view reads those values from your server, and takes the statistics' live rows as the table's rows.

A table's own storage parameters (`alter table ... set (autovacuum_vacuum_scale_factor = 0.01)`) override the server's, and a statistics result does not show them: for such a table the bar reads the server's thresholds, not the table's.

## Requirements

PostgreSQL 13 or newer, and PlumeSQL 0.29.0 or newer, which hands a view the server's parameters. Nothing more is asked of the server than your query.
