# JSON refactors

The JSON moves you look up every time, in the editor's lightbulb (Ctrl+. or ⌘.) on a query over a `json` or `jsonb` column: list the keys a column holds, turn an array or an object into rows, bring its keys out as columns, compare through `@>` so an index can help, shorten a chain of `->`, and print it readably.

## What it is for

- **What is in this column?** List its keys, with how many rows carry each.
- **One row per element.** An array of tags, an object of settings: a row for each, beside the row it came from.
- **Keys as columns.** After a run, the keys the values hold, each a column read as what it is: `(data->>'amount')::numeric as amount`.
- **A filter an index can serve.** `data->>'status' = 'open'` becomes `data @> '{"status": "open"}'`, which a GIN index on the column reads.
- **Shorter paths.** `data->'meta'->>'age'` becomes `data #>> '{meta,age}'`.
- **Readable output.** `jsonb_pretty(data)` in place of the column.

## Before and after

```sql
-- List the keys of data (a query above)
select k.json_key as key, count(*)
from orders o, jsonb_object_keys(o.data) as k(json_key)
where jsonb_typeof(o.data) = 'object'
group by k.json_key
order by count(*) desc, k.json_key;

-- Expand the array in tags into rows
select id, tags, tags_item.value from orders
left join lateral jsonb_array_elements(case jsonb_typeof(orders.tags) when 'array' then orders.tags end) as tags_item(value) on true;

-- Add the keys of data as columns, after a run
select id, data,
       (data->>'amount')::numeric as amount,
       data->>'status' as status
from orders;
```

An expansion never fails on a value of another shape: an object where an array was meant, a number or NULL gives no element, and the LEFT JOIN keeps its row.

## When it is offered

| Refactor | Offered when |
|---|---|
| List the keys | A SELECT reads a json column; after a run, only when the column holds objects |
| Expand into rows | A SELECT with one FROM item, not grouped and not DISTINCT; after a run, only the shape the column holds |
| Keys as columns | After a run, for the keys its values held (all at once, or one key by one) |
| @> containment | A `->>` compared with a string on a jsonb column (a number, true or NULL compares otherwise as text) |
| #>> path | Two or more `->` steps on a json column |
| Pretty print | A json column alone in the select list |

The json columns are the query's tables'. Over a subquery, a CTE, a UNION, a VALUES list or a SELECT with no FROM (`select '{"a": 1}'::json as c`) they are the ones its last run returned, and a UNION, a VALUES list or a SELECT with no FROM is read as `select * from (...) q`, every arm and every row kept as it is.

A json column the select list computes or renames (`data->'address' as address`, `data as payload`) is offered too once the query has run. Its name belongs to the list, where nothing beside it can use it, so the refactors write its expression instead: `data->'address'->>'city' as city`.

## Good to know

- Nothing runs on its own: each refactor edits the statement, or writes a query above it, and you run it.
- What a column holds (objects or arrays, which keys) is read from the last run's first rows, so some offers appear only after you run the query as it is written.
- These were part of PlumeSQL itself before 0.29.0; there they still are, so this extension offers them only from 0.29.0 on, never twice.

## Requirements

PostgreSQL 13 or newer, and PlumeSQL 0.29.0 or newer for the offers (an older PlumeSQL has them built in).
