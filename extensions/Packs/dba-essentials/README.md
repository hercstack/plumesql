# DBA essentials

The questions a database administrator asks every week, each one click away: what is running, what is stuck, what is slow, what is growing, and what is set up how.

## What is in it

**Start here**

- **Health check**: a checklist of what needs attention on this database, each finding with what to do about it.

**When something hangs or is slow right now**

- **Current activity**: what every connection is doing, with buttons to cancel a query or end a session, and the locks each one holds a click away.
- **Blocking locks**: who is waiting for whom, refreshed every five seconds.
- **Long running**: statements that have run longer than you say.
- **Idle in transaction**: sessions that opened a transaction and went quiet; they hold locks and hold back vacuum.
- **Wait events**: what the busy sessions are waiting on, grouped.

**Slow queries**

- **Top queries**: the heaviest statements on the server, from `pg_stat_statements` (the server needs that extension).
- **Explain plan**: every `EXPLAIN` you run drawn as a plan you can read: where the time goes, what was misjudged.
- **Performance refactors**: the lightbulb rewrites a slow query where it measurably helps: a condition the index can read, keyset pages instead of OFFSET, STABLE functions, constraints added without holding writes.

**Indexes**

- **Cache hit ratio**: how much is read from memory rather than from disk, per database, table and index.
- **Unused indexes**: indexes nothing reads, which still cost space and slow every write.
- **Duplicate indexes**: indexes another index already covers, with the statement to drop each.
- **Foreign keys without an index**: foreign keys that make deletes and joins slow, with the statement to add the index.

**Space and vacuum**

- **Table sizes**: the biggest tables and their indexes.
- **Table bloat**: space taken by dead rows that a vacuum could give back.
- **Vacuum candidates**: tables carrying the most dead rows, and when they were last cleaned.
- **Transaction age**: how far each database is from transaction ID wraparound, which PostgreSQL must never reach.
- **Integer overflow risk**: integer keys and sequences close to the end of their range.
- **Partition tree**: every partitioned table as a tree, with each partition's bounds, size and rows.

**Server, replication and security**

- **Replication status**: every standby and subscriber, with its lag.
- **Logical replication**: publications with their tables, and subscriptions with their state.
- **Non default settings**: what this installation changed from the defaults.
- **PostgreSQL extensions**: the extensions of this database, with the ones that have an update waiting.
- **Row security**: the tables that limit rows per user, and their policies.

**Before a change**

- **Dependents**: what depends on a table or view (views, foreign keys, functions, triggers) and what a `DROP` would do to each.

## Where to start

1. Run **Health check** from its row in the Extensions side tab: a short list of what needs attention, each finding with what to do.
2. Keep **Current activity** and **Blocking locks** at hand: they put buttons of their own in the title bar (**Activity** and **Locks**), the two to press when something hangs.
3. Run **Table sizes** and **Vacuum candidates** once a week: what grows and what is not being cleaned.

The pack's members are named in `dba-essentials.plumesql-pack.json`; the pack's page lists them with where each one stands.
