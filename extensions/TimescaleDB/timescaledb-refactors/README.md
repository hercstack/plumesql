# TimescaleDB refactors

Time series read best by the hour or by the day. On a `SELECT` over a TimescaleDB hypertable, the editor's lightbulb (Ctrl+. or ⌘.) offers the same rows counted per time bucket, written as a query above the one you have, which stays as it was.

## What it writes

From

```sql
select * from metrics where device = 7;
```

the lightbulb's **Count by time bucket, 1 hour** writes above it

```sql
select time_bucket('1 hour', ts) as bucket, count(*)
from metrics
where device = 7
group by bucket
order by bucket;
```

with the hypertable's own time column and the query's own `WHERE`. **Count by time bucket, 1 day** does the same by the day. Change the bucket or the aggregate in the new query to taste: it is plain SQL.

## Where it applies

In the SQL editor, wherever the extension is attached (everywhere from the install on; change it on its page), on a `SELECT` over one hypertable that does not group already. The time column comes from PlumeSQL's dictionary of the connection, so nothing is asked of the server until you run the query.

## Requirements

PostgreSQL 13 or newer with TimescaleDB (`create extension timescaledb`), and PlumeSQL 0.23.0 or newer, which offers extensions' refactors in the editor.
