# Refactor essentials

Every everyday refactor extension at once: the lightbulb (Ctrl+. or ⌘.) on a query then offers to make it correct, faster and easier to read, to open its JSON, arrays and ranges, to describe its numbers, to add window functions, to write sample rows for a table and to make a schema change safe.

## What is in it

**Queries that return what you meant**

- **Correctness refactors**: a LEFT JOIN the WHERE undoes, `= NULL`, `count(*)` over a LEFT JOIN, a BETWEEN that loses its last day, AND with OR without parentheses.

**Faster queries**

- **Performance refactors**: a condition an index can read, keyset pages instead of OFFSET, STABLE functions, NOT VALID constraints, and an index for a filter on a large table.

**Queries easier to read and build on**

- **Readability refactors**: aliases for a query's tables, one or all at once, and a query wrapped in a CTE or a subquery, or unwrapped again.

**JSON, arrays and ranges**

- **JSON refactors**: a JSON column's keys listed, an array or an object expanded into rows, its keys added as columns, `@>` containment and `#>>` paths.
- **Array refactors**: an array expanded into rows, its elements counted or added as columns, `= any` as `@>` containment, an array as text.
- **Range refactors**: a range's bounds and length as columns, a bounds check as `@>`, one row per day or number of a range.

**Numbers**

- **Statistics refactors**: a number column described, its correlation, trend, histogram and outliers; a count by a column's values; a text column cast to the type all its values fit.
- **Window function refactors**: a running total, a moving average, the change from the previous row, a share of the total, a rank, the top rows per group.

**Test data and schema changes**

- **Sample data**: made-up rows for a table, written as an INSERT script in a new tab.
- **Migration safety**: a lock wait with an end above an `ALTER TABLE`, a `CREATE INDEX` or a `DROP`, and on an index build the memory it needs.

## Where to start

1. Put the caret in a query and press Ctrl+. (⌘. on macOS). Each extension's refactors stand in the lightbulb's **Extensions** group, under its name when it has more than one for the statement.
2. Pick one: it edits the statement, or writes a query above it or in a new tab. Nothing runs until you run it.
3. What you do not want: **Settings > Refactors** turns one refactor off, and an extension you never use can be removed from its page.

Each member answers only where it fits: Migration safety on a schema change, JSON, Array and Range refactors on a column of their type, Statistics and Window function refactors on a number column. The pack's members are named in `refactor-essentials.plumesql-pack.json`; the pack's page lists them with where each one stands.
