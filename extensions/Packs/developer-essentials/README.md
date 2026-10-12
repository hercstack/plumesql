# Developer essentials

The everyday set for someone writing an application against PostgreSQL:
find where a value lives, open a JSON column into real columns, turn
rows into INSERT statements for a fixture or a migration, and read a
query plan without squinting.

## Where to start

Run **Search data** from its row in the Extensions side tab: give it a value, and it finds every text column of every table that holds it, the first question in a database you did not write.

On a result, right-click and choose **Extensions…** for **JSON to columns** (a json column's keys as columns of their own) or **Rows as SQL** (the rows as INSERT or upsert statements, for a fixture or a migration). **Nulls**, **Json**, **Short uuid** and **Time ago** change how values read: on each one's page, **Applies to** **Everywhere** puts it on every result. **Explain plan** draws every `EXPLAIN` you run, with nothing to set up.

The pack's members are named in `developer-essentials.plumesql-pack.json`, and PlumeSQL lists them on the pack's page with where each one stands.
