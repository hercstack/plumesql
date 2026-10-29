# Range refactors

The range moves you look up every time, in the editor's lightbulb (Ctrl+. or ⌘.) on a query over a range column (`daterange`, `tstzrange`, `int4range` and the others, and their multiranges): its bounds and length as columns, a bounds check written as `@>`, and one row per day or number of a range.

## What it is for

- **Bounds as columns.** `lower(during)` and `upper(during)`, each a column you can sort or export.
- **How long?** `upper(during) - lower(during)`: an interval for a timestamp range, days for a date range.
- **A check that means what the range means.** `lower(during) <= x and x < upper(during)` becomes `during @> x`: shorter, it honors the range's own bounds, and a GiST index on the column can serve it.
- **A calendar.** A date range as one row per day, an integer range as one row per number.
- **Multiranges.** One row per range a multirange holds.

## Before and after

```sql
-- Add the bounds of during as columns
select id, during,
       lower(during) as during_lower,
       upper(during) as during_upper
from bookings;

-- Use @> on during
select * from bookings where lower(during) <= current_date and current_date < upper(during);
select * from bookings where during @> current_date::date;

-- One row per day of during
select id, during, during_item.value::date as during_day from bookings
left join lateral generate_series(lower(bookings.during), upper(bookings.during) - 1, interval '1 day') as during_item(value) on true;
```

## When it is offered

| Refactor | Offered when |
|---|---|
| Bounds as columns | A range column the query returns (a `*`, or the column named) |
| Length as a column | The same |
| @> for a bounds check | `lower(r) <= x and x < upper(r)` (either way round, either order) or `x between lower(r) and upper(r)` on a range column of the query's tables, never under a NOT |
| One row per day or number | A date or integer range, or a multirange, in a SELECT with one FROM item, not grouped and not DISTINCT |

The range columns are the query's tables'. Over a subquery, a CTE, a UNION or a SELECT with no FROM they are the ones its last run returned, and a range the select list computes is offered once the query has run.

## Good to know

- Nothing runs on its own: each refactor edits the statement and you run it.
- `@>` is what the range says, which is not always what the comparison said. BETWEEN takes in the upper bound a `[)` range leaves out. An unbounded side (`[2026-01-01,)`) matches every value, where the comparison with its NULL bound matched none. That difference is usually the bug the rewrite fixes.
- The value is cast to the range's own type when it is not one already: a date range holds no timestamp, and `d @> now()::date` is what `lower(d) <= now() and now() < upper(d)` compared.
- One row per day runs to the day before the upper bound, a range's canonical `[)` form. An empty or unbounded range gives no row, and the LEFT JOIN keeps its own.
- The overlap of two periods kept as two columns (`a.start < b.end and b.start < a.end`) is left as it is. As a range, a row whose end comes before its start would fail the whole query.

## Requirements

PostgreSQL 13 or newer (multiranges: 14), and PlumeSQL 0.29.0 or newer.
