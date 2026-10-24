# PlumeSQL 0.29.0

Write a join by walking a foreign key: type a dot after a key column and
pick a column of the table it points to. And two queries written alike
are two queries: the lines above one no longer reach the other.

## Join through a foreign key

In a SELECT, put a dot after a foreign key column, as if the key were the
row it points to:

```sql
select o.order_id, o.customer_id.
from orders o
```

The list offers the columns of `customer`. Pick `name`, and PlumeSQL
writes it and adds the join in one step (one undo, too):

```sql
select o.order_id, c.name
from orders o
join customer c on c.customer_id = o.customer_id
```

The path goes on as far as the keys do: `o.customer_id.address_id.city`
adds a join per step.

The join is written so the query returns the same rows as before:

- a key that cannot be NULL gets a `JOIN`: every row has its customer;
- a key that can be NULL gets a `LEFT JOIN`, so the rows without one stay;
- once a step is a `LEFT JOIN`, every step after it is one too.

If the query already joins that table over the same key, its alias is
used, with no second join. Anything else you want (another join type, a
condition of your own) you change in the text, like any SQL. The alias
follows your Refactors setting, and **Settings > Refactors > Join through
a foreign key column** turns it off.

When you type `o.`, a key column now shows where it leads on its row,
such as `→ customer`, so you can see which columns a dot can follow.

Prefer `USING`? A join written with `USING (customer_id)` is recognized
too: the path reuses it instead of joining the table again. And when you
write the join yourself, `join customer c using ` offers
`(customer_id)` right away: the key is known.

### Rewrite a join as USING, or as ON

Open the lightbulb (Ctrl+. or Cmd+.) on a query whose join is on one
shared column:

```sql
join customer c on c.customer_id = r.customer_id
-- Rewrite join customer as USING (customer_id):
join customer c using (customer_id)
```

and on a `USING` join, **Rewrite join customer as ON** goes back. With
the caret in a join, that join is offered; anywhere else in the query,
every join that can be rewritten. It is offered only
where the two read the same: when just one table left of the join has the
column (with two, `USING` would fail), and when the query does not select
a bare `*` (`USING` merges the two columns into one). Going back to `ON`,
a column the query reads without a table name gets the right one, so it
does not turn ambiguous.

## Joins that may repeat rows

This query runs, and it is wrong:

```sql
select c.customer_id, count(r.rental_id) as rentals, sum(p.amount) as paid
from customer c
left join rental r on r.customer_id = c.customer_id
left join payment p on p.customer_id = c.customer_id
group by c.customer_id;
```

Customer 1 has 32 rentals and paid 118.68. The query says 1024 and
3797.76: every rental is repeated once per payment, and every payment
once per rental.

PlumeSQL now reads every join against the keys of its tables, the idea
the Key Joins proposal (accepted by the SQL standard's working group in
October 2026) makes a guarantee of. A join on a unique key of the joined
table (its primary key, a unique index) keeps every row before it exactly
once. Any other join may repeat them:

- a quiet dotted hint under such a join says so on hover ("This join may
  repeat rows: each customer row once per matching rental row"). A
  customer joined to their rentals is often what you mean, so it stays
  quiet;
- a **warning**, in the Problems tab too, where it is most likely a
  mistake: a `sum`, `avg`, `count` of a column or `string_agg` over a
  table whose rows a join repeats, and two one-to-many joins multiplying
  each other, as above.

The fix is usually to aggregate each child in a subquery first. Only
what can be proven is said: a view, a subquery or a condition other than
equalities is left unread. **Settings > Editor > Joins that may repeat
rows** chooses all, warnings only, or off.

## Also in this release

- **Quick fixes from what PostgreSQL says.** Hover a problem and pick
  **Quick Fix**, or open the lightbulb, and the fix the server's own words
  settle is one click away:
  - "must appear in the GROUP BY clause": **Add c.customer_id to GROUP
    BY**, or the whole `GROUP BY` when the query has none;
  - "Perhaps you meant to reference the column "c.customer_id"" (or the
    table alias): **Change to c.customer_id**;
  - a `CREATE` of something that already exists: **Add IF NOT EXISTS**, or
    `CREATE OR REPLACE` for a view or a function;
  - a `DROP` of something that does not: **Add IF EXISTS**;
  - "cannot change return type of existing function": the `DROP FUNCTION`
    the server asks for, written above;
  - "column is of type integer but expression is of type text": **Cast to
    integer**;
  - a table named twice in a query: an alias for the second one.

  The **Problems** tab offers the same: a **Fix** column next to the line,
  one click applies it, and the row's right click menu lists every fix. A
  hover over a problem is short now: the problem, and its Quick Fix right
  under it.

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
