# Developer essentials

The everyday set for someone writing an application against PostgreSQL:
find where a value lives, open a JSON column into real columns, turn
rows into INSERT statements for a fixture or a migration, and read a
query plan without squinting.

## What it installs

- `search-data`: find a value in every text column of a schema
- `json-to-columns`: a json or jsonb column's keys as columns beside it
- `json-to-rows`: a json or jsonb column as a table of its own, arrays as rows
- `rows-as-sql`: rows as INSERT, UPDATE or upsert statements, to copy, save or read in a tab
- `explain-plan`: the plan of an EXPLAIN as a picture you can read
- `profile`: every column's nulls, distinct values, range and distribution
- `json`: json and jsonb values compact on one line, pretty on hover
- `nulls`: NULL and the empty string told apart at a glance
- `short-uuid`: uuid columns shortened to their first characters
- `time-ago`: `*_at` timestamps read as "3 hours ago"

## How it installs

A pack has no code of its own: it names the extensions above, and Install all installs the ones you do not have yet, each the way its own kind installs. A grid extension installs at once; a query extension shows its code and asks for your consent first, exactly as it would on its own page. Skip any of them, or remove one later, and the rest stay.

## Notes

Every member has its own page, requirements and README; the pack's page lists them with where each one stands.
