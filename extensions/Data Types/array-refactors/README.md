# Array refactors

The array moves you look up every time, in the editor's lightbulb (Ctrl+. or ⌘.) on a query over an array column (`text[]`, `integer[]`): one row per element, a count of the elements, the elements as columns, a filter an index can serve, and the array as plain text.

## What it is for

- **One row per element.** The tags of a post, the items of an order: a row for each, beside the row it came from, with its position.
- **Which elements, how often?** A query that counts the rows holding each element.
- **Elements as columns.** After a run, as many columns as the longest array holds: a pair, a coordinate, the first and second choice.
- **A filter an index can serve.** `'pg' = any(tags)` never uses an index; `tags @> array['pg']` does, with a GIN index on the column.
- **Plain text.** `array_to_string(tags, ', ')` for reading or exporting.

## Before and after

```sql
-- Expand the array in tags into rows
select id, tags, tags_item.value from posts
left join lateral unnest(posts.tags) with ordinality as tags_item(value, n) on true;

-- Count the elements of tags (a query above)
select e.value as element, count(*)
from posts, unnest(posts.tags) as e(value)
group by e.value
order by count(*) desc, e.value;

-- Add the elements of point as columns, after a run
select id, point,
       point[1] as point_1,
       point[2] as point_2
from places;

-- Use @> containment on tags
select * from posts where tags @> array['pg']::text[];
```

An expansion never fails or drops a row: an empty array or NULL gives no element, and the LEFT JOIN keeps its row.

## When it is offered

| Refactor | Offered when |
|---|---|
| Expand into rows | A SELECT with one FROM item, not grouped and not DISTINCT |
| Count the elements | A SELECT reading an array column |
| Elements as columns | After a run, when its longest array holds 2 to 10 elements (and the last element on its own, whatever the length) |
| @> containment | `value = any(column)` on an array column of the query's tables, never under a NOT |
| As text | An array column in the select list |

The array columns are the query's tables'. Over a subquery, a CTE, a UNION or a SELECT with no FROM they are the ones its last run returned. An array the select list computes (`string_to_array(title, ' ') as words`) is offered too once the query has run, its expression written in place of its name: `(string_to_array(title, ' '))[1] as words_1`.

## Good to know

- Nothing runs on its own: each refactor edits the statement, or writes a query above it, and you run it.
- `@>` casts the value to the column's own type (`array['pg']::character varying(20)[]`), so a varchar array compares with a varchar array.
- Where the array holds a NULL and not the value, `= any` gives NULL and `@>` false. A WHERE drops both rows alike, which is why the rewrite is never offered under a NOT.
- How long the arrays are is read from the last run's first rows, so the element columns appear only after you run the query as it is written.

## Requirements

PostgreSQL 13 or newer, and PlumeSQL 0.29.0 or newer.
