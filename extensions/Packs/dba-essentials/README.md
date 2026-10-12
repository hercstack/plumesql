# DBA essentials

The first extensions a database administrator reaches for: activity, locks, slow queries and plans, sizes, bloat, vacuum, indexes and settings.

## Where to start

Run **Health check** from its row in the Extensions side tab: a checklist of what needs attention on this database, each finding with what to do about it.

**Current activity** and **Blocking locks** bring buttons of their own (**Activity** and **Locks**, the Log says where each one landed): the two to have at hand when something hangs. **Top queries** reads `pg_stat_statements`, so the server needs that extension. **Explain plan** draws every `EXPLAIN` you run as a plan you can read, with nothing to set up.

The pack's members are named in `dba-essentials.plumesql-pack.json`, and PlumeSQL lists them on the pack's page with where each one stands.
