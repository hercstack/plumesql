# PlumeSQL 0.29.0

Two queries written alike are two queries: the lines above one no longer
reach the other.

## Fixed

- **The lines above a query belong to that query alone.** A script can
  hold the same query twice, say a copy pasted further down to try a
  different extension on it. The `-- @extension`, `-- @inputs`, `-- @ask`,
  `-- @noask`, `-- @var`, `-- @format` and `-- @computed` lines above one
  copy also reached the other: run the copy with no lines above it and it
  opened the same view, with the same answers and formats. Each query now
  reads only its own lines, and the file's header still reaches every
  query, as before.

  ```sql
  -- This one runs as a plain grid.
  select '{"rentals": []}'::jsonb as doc;

  -- This one opens as a table.
  -- @extension json-to-rows open
  -- @inputs column=doc, path=rentals
  select '{"rentals": []}'::jsonb as doc;
  ```

- **What a result writes into the script lands above its own query.**
  **Save in the script**, **For this query**, **Beside the Grid**, the
  run form's **Next time** and a format or computed column added from the
  grid wrote their line above the FIRST query with the same text, not the
  one the result came from, and **Move to an extension** took the other
  copy's lines along. They now work on the query you ran.

## Also in this release

- **The Problems tab says why a note is a note.** When a query uses a
  table or function that an earlier statement of the same script creates,
  the server has not got it yet, so the parser's check fails, though the
  run will work. PlumeSQL shows that as a muted note, not an error, and
  now says so plainly: a **Note** column beside the line reads
  "created on line 132". Click it to jump to that line; the row's right
  click menu has **Go to Line 132, Where It Is Created** too.
- **More of what a script makes is recognized.** A schema, a procedure,
  a table made by `SELECT ... INTO` and a column added by
  `ALTER TABLE ... ADD COLUMN` were shown as errors when a later statement
  used them. They are notes now, like a created table or function.

## Tell us what you think

Questions and ideas go to
[Discussions](https://github.com/hercstack/plumesql/discussions), bugs to
[Issues](https://github.com/hercstack/plumesql/issues) or Report a Bug in
the app's menu. The video tour is on
[YouTube](https://www.youtube.com/@plumesql).
