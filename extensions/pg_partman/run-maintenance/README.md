# Run maintenance

Make pg_partman do its housekeeping now instead of at its next scheduled run: create the partitions that are due, remove the ones past their retention.

![The question: run pg_partman's maintenance now? It creates the partitions that are due and drops or detaches the ones past retention, on every partition set](media/run-maintenance-confirm.webp)

![The answer after the run: logs.events, a partition a day, made 4 ahead and kept 30 days, has 15 partitions from 18 September to 18 October; public.part_demo has 9, from 1 to 9 September](media/run-maintenance-answer.webp)

The answer is every set the run looked after, as it stands right after it. `logs.events` makes a partition a day, keeps them 30 days and makes 4 ahead: 15 partitions, the oldest from 18 September, the newest already for 18 October, ready before its rows arrive. `public.part_demo` holds no rows yet, and without `infinite_time_partitions` pg_partman makes partitions ahead of the newest row a set holds, not ahead of today: it stays at 9 September.

**pg_partman** is a PostgreSQL extension that looks after partitioned tables: tables split into child tables, the **partitions**, one per day or month. PostgreSQL never makes the next partition on its own; pg_partman's **maintenance** does, ahead of time, and removes partitions past their retention. Normally it runs on a schedule; this runs it once, now.

## When to use it

- **You just created or changed a partition set** (a new premake, a retention) and want the result now, not in an hour.
- **Inserts fail or land in the default partition** because the partitions for today or tomorrow do not exist yet: maintenance was not running.
- **You lowered the retention** and want the space back today.

## What it does

1. A form asks for pg_partman's schema (`partman` by default).
2. It asks before it runs, and the question says that partitions past retention are dropped or detached.
3. It calls `run_maintenance()`, which goes over every partition set with maintenance `on`, exactly as the scheduled run would.

The answer is one row per partition set it maintains, read right after the run: its interval, how many partitions it makes ahead, its retention, how many partitions it has now (the default partition not counted), and the oldest and the newest of them. A partition retention removed is gone from the count and from oldest; open a set's partitions in Partition sets for the whole list.

## Settings

| Setting | Default | What it does |
|---|---|---|
| pg_partman schema (`partman_schema`) | partman | The schema pg_partman was installed in. |

## Try it

Run it from the Extensions side tab: its row's **Run**. With the daily `public.events` set from Partition sets' example, run it on the next day: a new partition for the day after the last one appears.

Maintenance must also run on its own, regularly. With pg_cron, every hour:

```sql
select cron.schedule('partman-maintenance', '0 * * * *', 'call partman.run_maintenance_proc()');
```

or with pg_partman's own background worker (`pg_partman_bgw` in `shared_preload_libraries`).

## Good to know

With retention set and `keep on retention` off, maintenance DROPS old partitions with their rows; read the set's retention in Partition sets before you run it. Maintenance never moves rows out of the default partition; pg_partman's `partition_data_proc` does. The schema is placed in the query as an identifier, quoted by the server, since a schema name cannot travel as a parameter.

## Requirements

PostgreSQL 13 or newer with the `pg_partman` extension; without it the run answers with the server's own error. The right to run the maintenance (the owner of the partition sets, or a superuser).
