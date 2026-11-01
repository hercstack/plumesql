# PlumeSQL 0.29.2

SQL functions written the standard way, two columns joined into one from
the lightbulb, GROUP BY written whole, and a calmer completion list.

## Highlights

- **BEGIN ATOMIC:** a SQL function whose body is a string gets a hint, and
  one click rewrites it so PostgreSQL tracks what it depends on.
- **Concatenate the selected columns:** select `first_name, last_name`
  and the lightbulb makes one column of them.
- **GROUP BY in one go:** completion offers the whole clause, and the
  fix for a missing GROUP BY column adds every column at once.
- **A calmer completion list:** no more one-word pane beside it.

## SQL functions, written the standard way

A `LANGUAGE sql` function written `AS $$ ... $$` is checked when you
create it, but PostgreSQL keeps only its text and parses it again when it
runs. A table it uses can be dropped or renamed later without a word, and
the function breaks at its next call.

Written as `BEGIN ATOMIC ... END`, or `RETURN` an expression, PostgreSQL
14 and later store the body parsed, with its names bound and recorded as
dependencies: `DROP TABLE` refuses while the function uses the table, and
no call parses the body again.

Such a function now gets a dotted hint on its name. The lightbulb (⌘. or
Ctrl+.) rewrites the body, after every option, where PostgreSQL wants it:

```sql
create function rentals_of(c int) returns bigint
as $$
    select count(*) from rental where customer_id = c;
$$ language sql stable;
```

becomes

```sql
create function rentals_of(c int) returns bigint language sql stable
begin atomic
    select count(*) from rental where customer_id = c;
end;
```

and a body that is a single `SELECT a + b` becomes `return a + b`.

The hint appears only where the rewrite takes the body as it is: a server
of PostgreSQL 14 or later, no polymorphic type such as `anyelement`, no
SQL built at run time, only SELECT, INSERT, UPDATE, DELETE and MERGE, and
every table and function the body uses already in your database. Its
names are then fixed when the function is created, so a function meant to
read whatever the caller's `search_path` finds keeps its string body; an
`-- @allow atomic-body` line above it says so.

```setting
editor.flagAtomicBody
```

## Concatenate the selected columns

Select two or more neighbouring text columns of a query's select list,
open the lightbulb (⌘. or Ctrl+., or the bulb beside the statement) and
pick how to join them:

```sql
select a.first_name, a.last_name, count(film_id)
```

becomes

```sql
select concat_ws(' ', a.first_name, a.last_name) as first_last_name, count(film_id)
```

- **`concat_ws` comes first** because it skips a NULL: with `||`, one
  missing last name makes the whole value NULL.
- **`||` with a space between**, or **`||` alone**, are offered too.
- The new column gets a name from the parts (`first_name` and
  `last_name` make `first_last_name`), ready to be renamed.

It is offered only where the result stays right: every selected column is
text, none is a `*` or an aggregate, and the query does not GROUP BY or
ORDER BY by position. A GROUP BY of the two columns stays as it is. Like
every refactor, it can be switched off in the Refactors settings.

## GROUP BY in one go

A query with `count(...)` or another aggregate needs every other column in
its GROUP BY, and PostgreSQL names them one at a time:

```sql
select a.first_name || ' ' || a.last_name as first_last_name, count(film_id)
from film_actor
join actor a on a.actor_id = film_actor.actor_id
```

- **Completion writes the clause.** Type `g` on the next line and the list
  starts with `group by a.first_name, a.last_name`.
- **The fix adds all of them.** When PostgreSQL reports the missing
  column, as you type or on a run, the quick fix (the red bulb, ⌘. or
  Ctrl+., or the Fix column of Problems) now reads **Add GROUP BY a.first_name, a.last_name**, so one
  click settles it. The fix for only the column PostgreSQL named stays
  beside it.

## Fixed

- **Undo takes back a fix from the Problems tab.** A click on a row's
  Fix applied it, but Cmd+Z could then undo nothing. One undo now takes
  the whole fix back.

- **The lock hints say what is locked.** Adding a CHECK constraint
  blocks reads as well as writes (only a FOREIGN KEY lets reads go on),
  and ADD PRIMARY KEY ... USING INDEX is instant only once its columns
  are NOT NULL. The hints now say both.

- **A function's hint stands on its name.** The volatility and SECURITY
  DEFINER hints could mark a word of the comment above the function, one
  like "a function that ...", instead of the function's name.

- **No more one-word pane beside the completion list.** A pane next to
  the list showed a single word such as "next", "schema" or "an alias
  follows". That word now stands on the row itself, and the pane opens
  only where it has something to tell, such as a table's or a function's
  card.

- **The install question's Don't ask again reads clearly.** Installing an
  extension that asks first offers to skip the question next time. The
  choice stood alone across the whole dialog, reading "Ask again next
  time", pressed up against the text above it. Now it reads **Next time**
  followed by the choice, which starts at **Ask first**, is only as wide
  as the answer you pick, and has room above it as well as below.

## Tell us what you think

Questions and ideas go to
[Discussions](https://github.com/hercstack/plumesql/discussions), bugs to
[Issues](https://github.com/hercstack/plumesql/issues) or Report a Bug in
the app's menu. The video tour is on
[YouTube](https://www.youtube.com/@plumesql).
