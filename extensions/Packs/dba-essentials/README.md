# DBA essentials

The first extensions a database administrator reaches for: activity, locks, slow queries and plans, sizes, bloat, vacuum, indexes and settings.

## What it installs

- `health-check`
- `current-activity`
- `blocking-locks`
- `long-running`
- `idle-in-transaction`
- `wait-events`
- `top-queries`
- `explain-plan`
- `cache-hit-ratio`
- `unused-indexes`
- `duplicate-indexes`
- `fk-without-index`
- `table-sizes`
- `table-bloat`
- `vacuum-candidates`
- `transaction-age`
- `integer-overflow-risk`
- `replication-status`
- `non-default-settings`

## How it installs

A pack has no code of its own: it names the extensions above, and Install all installs the ones you do not have yet, each the way its own kind installs. A grid or theme extension installs at once; a query or command extension shows its code and asks for your consent first, one after the other, exactly as it would on its own page. Skip any of them, or remove one later, and the rest stay.

## Notes

Every member has its own page, requirements and README; the pack's page lists them with where each one stands.
