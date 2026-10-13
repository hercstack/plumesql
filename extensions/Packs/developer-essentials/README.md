# Developer essentials

The everyday set for someone writing an application against PostgreSQL: find where a value lives, see what depends on a table, open JSON into columns, turn rows into SQL and read what binary columns hold.

## What is in it

**Find your way in a database you did not write**

- **Search data**: every text column of every table that holds a value you give, with a count and a sample.
- **Dependents**: what depends on a table or view before you change it: views, foreign keys, functions, triggers.

**JSON**

- **JSON to columns**: a JSON column's keys as columns of their own, right beside it.
- **JSON to rows**: a JSON column as a table of its own, arrays opened into rows.
- **Json**: JSON reads compact on one line, the indented value on hover.

**Fixtures and migrations**

- **Rows as SQL**: the result's rows as `INSERT`, `UPDATE` or upsert statements, to copy or save.

**Reading values**

- **Nulls**: a NULL and an empty string never look alike.
- **Short uuid**: a uuid shows its first 8 characters, the whole id on hover.
- **Time ago**: a timestamp named `*_at` reads as "3 hours ago", the exact time on hover.
- **Bytea**: a binary column reads as what it holds: a PNG of 640 x 480, a PDF, a zip, text.

**Performance**

- **Explain plan**: every `EXPLAIN` you run drawn as a plan you can read.
- **Profile**: every column of a result at a glance: empty values, distinct values, range.

## Where to start

1. Run **Search data** from its row in the Extensions side tab and give it a value: it finds every table and column that holds it.
2. On a result with a JSON column, right-click and choose **Extensions…**, then **JSON to columns**.
3. On any result, right-click and choose **Extensions…**, then **Rows as SQL**, for the rows as statements for a test fixture or a migration.

**Nulls**, **Json**, **Short uuid**, **Time ago** and **Bytea** change how values read: on each one's page, **Applies to** **Everywhere** puts it on every result. The pack's members are named in `developer-essentials.plumesql-pack.json`; the pack's page lists them with where each one stands.
