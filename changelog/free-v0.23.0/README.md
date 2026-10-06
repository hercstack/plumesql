# PlumeSQL 0.23.0

This release is about the lightbulb. It now knows far more ways to
rewrite a query, extensions can add their own, and it has a fixed place
next to every statement.

Watch it in under three minutes:
[Refactorings in PlumeSQL](https://www.youtube.com/watch?v=-sZ1rtXzpt8).

## The lightbulb rewrites your SQL

Every statement has a lightbulb in the gutter, on its first line. Click
it, or press Ctrl+. (⌘. on macOS) anywhere in the statement, and pick a
change. You can also right-click the statement and open
**Refactorings**. Each change is one step, so Ctrl+Z (⌘Z) takes it back.

A few examples:

**Join a related table.** PlumeSQL follows the foreign keys and writes
the `ON` for you. A key that can never be NULL gets a `JOIN`, a nullable
one a `LEFT JOIN`, so no rows go missing.

```sql
-- before
select * from orders o where o.total > 100;

-- after
select * from orders o
join customers c on c.id = o.customer_id
where o.total > 100;
```

**Fix an ambiguous column.** PostgreSQL refuses a column that two of
your tables have ("column reference is ambiguous"). The lightbulb offers
one fix per table: pick one, and every bare use of the column gets it.

```sql
-- before
select id, status from orders o
join customers c on c.id = o.customer_id;

-- after
select o.id, status from orders o
join customers c on c.id = o.customer_id;
```

**Rewrite NOT IN as NOT EXISTS.** `NOT IN` with a subquery returns no
rows at all once the subquery contains a single NULL. `NOT EXISTS` does
what you meant.

```sql
-- before
select * from customers c
where c.id not in (select customer_id from blocked);

-- after
select * from customers c
where not exists (select 1 from blocked where customer_id = c.id);
```

**Look before you delete.** Preview the rows writes a SELECT of exactly
the rows your DELETE or UPDATE would change, right above it. Run it
first, then run the real thing.

```sql
-- before
delete from orders where status = 'cancelled';

-- after
select * from orders
where status = 'cancelled';
delete from orders where status = 'cancelled';
```

**Turn an INSERT into an upsert.** ON CONFLICT on the table's primary
key, with every other column updated from the new row.

```sql
-- before
insert into customers (id, name, email)
values (1, 'Ana', 'ana@example.com');

-- after
insert into customers (id, name, email)
values (1, 'Ana', 'ana@example.com')
on conflict (id) do update set
    name = excluded.name,
    email = excluded.email;
```

**Query JSON the way an index can help.** A `->>` compared to a value
becomes `@>` containment, which a GIN index on the column can serve.

```sql
-- before
select id, meta from orders where meta->>'channel' = 'web';

-- after
select id, meta from orders where meta @> '{"channel": "web"}';
```

Also new in the list:

- **Add ORDER BY** the primary key, so a `LIMIT` returns the same rows
  every time.
- **Extract a value into a parameter:** `status = 'open'` becomes
  `status = $status`, and PlumeSQL asks for the value when you run it.
- **Add WHERE by the primary key** to an UPDATE or a DELETE that has
  none yet, and **Add RETURNING \***.
- **Count the rows** a query returns, written above it.
- **Inline a CTE**, the opposite of Extract into a CTE.
- For JSON columns: **list the keys** a column holds, **expand** an
  array or an object into rows (only the expansion your data calls for,
  once the query has run), **collapse** `data->'a'->>'b'` to
  `data #>> '{a,b}'`, and **pretty print** a column.

## Refactors from extensions

Extensions can now add their own refactors to the lightbulb. Three are
new in the Marketplace:

- **PostGIS refactors** show a geometry column as text you can read,
  with `ST_AsText` or `ST_AsGeoJSON`.
- **pgvector refactors** write the nearest neighbour query for a vector
  column, in each of the three distances.
- **TimescaleDB refactors** count a hypertable's rows by the hour or by
  the day, in a query written above yours.

For example, on a hypertable of readings:

```sql
-- before
select * from readings where store_id = 1;

-- after
select time_bucket('1 day', time) as bucket, count(*)
from readings
where store_id = 1
group by bucket
order by bucket;
select * from readings where store_id = 1;
```

When a query returns a column that an extension can read (a geometry, a
vector), the lightbulb also suggests that extension and writes its
`-- @extension` line above the query. If it is not installed yet, that
line offers to install it.

Refactors are a kind of extension of their own, with their own filter in
the Marketplace. Want your team's rules in the lightbulb? **New
Extension → Refactor extension** starts from a working example.

The **PostGIS** extension also shows geometry cells in the grid as
readable text now (`SRID=4326;POINT(15.98 45.81)`) instead of hex.

## A lightbulb next to every statement

The button in the gutter is the lightbulb now. It is grey on every
statement and yellow on the one your cursor is in, so you always see
which statement Ctrl+Enter and Ctrl+. will act on. It turns red when the
statement has a problem to fix. Nothing floats over your code any more.

Prefer the play button you had before? The **Gutter** menu in the editor
toolbar puts Run, Format or Copy there instead, or nothing at all. The
lens above the statement leaves out whatever the gutter shows.

## Choose your refactors

**Settings → Refactors** lists them all, PlumeSQL's own and your
extensions', each with a checkbox. Turn off the ones you never use, and
choose how they write:

- how many rows **Add LIMIT** asks for,
- what alias a joined table gets (its initials, its full name, or none),
- whether **Count the rows** and **Preview the rows** write above the
  statement or open a new tab,
- `$name` or `:name` parameters.

The lightbulb's list ends with **Refactor Settings…**, one click away.

## Open a folder by typing its path

Click the folder name in the status bar and start typing a path: `/`,
`~`, `C:\`, or `../` for a folder next to the one you are in. The
matching folders show up, **Tab** completes the highlighted one the way
a terminal does, and **Enter** opens it. The same menu has **Close
Folder** too.

## Release notes you won't miss

If you skipped a few updates, this page now shows the notes of every
release you missed, below the newest. The version picker at the top
opens any earlier release, and so does **Help → Release Notes for a
Version…**.

## Also in this release

- **The same list anywhere in a statement.** The lightbulb used to offer
  different changes depending on where you clicked. Now every spot in a
  statement gets the same list.
- **Refactors right after you connect.** While PlumeSQL is still reading
  a new database's tables, the lightbulb already offers what needs no
  tables, and says that more are coming.
- **Menus in the Outline.** Right-click a column, a parameter or a CTE
  in the Outline for its own actions, such as Find in Script and Copy
  Name. A statement's menu has its Refactorings too.
- **Qualify columns waits for a second table.** Over a single table a
  bare column is never ambiguous, so it is no longer offered there.

## Fixed

- Add LIMIT, Add GROUP BY and the other changes that add a clause at the
  end no longer leave an empty line when the `;` is on a line of its own.

## Tell us what you think

Questions and ideas go to
[Discussions](https://github.com/hercstack/plumesql/discussions), bugs to
[Issues](https://github.com/hercstack/plumesql/issues) or Report a Bug in
the app's menu. The video tour is on
[YouTube](https://www.youtube.com/@plumesql).
