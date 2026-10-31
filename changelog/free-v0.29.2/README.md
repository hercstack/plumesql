# PlumeSQL 0.29.2

Two columns joined into one from the lightbulb, GROUP BY written whole,
and a calmer completion list.

## Highlights

- **Concatenate the selected columns:** select `first_name, last_name`
  and the lightbulb makes one column of them.
- **GROUP BY in one go:** completion offers the whole clause, and the
  fix for a missing GROUP BY column adds every column at once.
- **A calmer completion list:** no more one-word pane beside it.

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
  column, as you type or on a run, the quick fix (the red bulb, ⌘. or Ctrl+., or the Fix column of
  Problems) now reads **Add GROUP BY a.first_name, a.last_name**, so one
  click settles it. The fix for only the column PostgreSQL named stays
  beside it.

## Fixed

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
