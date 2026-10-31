# PlumeSQL 0.29.2

Two columns joined into one from the lightbulb, and a clearer install
question.

## Highlights

- **Concatenate the selected columns:** select `first_name, last_name`
  and the lightbulb makes one column of them.
- **Don't ask again, easier to read:** the choice under an install's
  question now says what it is about, and fits its answer.

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

## Fixed

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
