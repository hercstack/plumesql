# Dependents

What depends on the table, view or materialized view this was opened on, and what a `DROP` would do to each: the views and materialized views built on it, the foreign keys of other tables pointing at it, the SQL functions whose bodies use it, its triggers, indexes, policies, defaults and publications. Before dropping, renaming or rewriting an object, the list of what breaks.

## What it shows

One row per dependent object, the ones a `DROP` refuses over first:

| Column | Meaning |
|---|---|
| kind | What the dependent is: `view`, `materialized view`, `table constraint` (a foreign key of another table, or one of its own), `function`, `trigger`, `index`, `policy`, `default value`, `sequence`, `publication relation`, `rule`... |
| object | Its full name as PostgreSQL writes it: `orders_customer_id_fkey on public.orders`. |
| dependency | `normal`: it is a separate object that uses this one. `automatic`: it belongs to this one. |
| on_drop | `DROP refuses; DROP ... CASCADE drops it too` for a normal dependency, `dropped with it` for an automatic one. |

## Examples

Open it from a table's, a view's or a materialized view's menu in the object tree (**Run Dependents**), or from the header of a result that reads the table. On a `customers` table:

| kind | object | dependency | on_drop |
|---|---|---|---|
| function | public.customer_count() | normal | DROP refuses; DROP ... CASCADE drops it too |
| materialized view | public.customer_counts | normal | DROP refuses; DROP ... CASCADE drops it too |
| table constraint | orders_customer_id_fkey on public.orders | normal | DROP refuses; DROP ... CASCADE drops it too |
| view | public.big_customers | normal | DROP refuses; DROP ... CASCADE drops it too |
| index | public.customers_name_idx | automatic | dropped with it |
| trigger | customers_touch on public.customers | automatic | dropped with it |

Read the normal ones before a `DROP ... CASCADE`: the foreign key is dropped from `orders`, not `orders` itself, but the view and the materialized view go entirely, and with them whatever was built on them.

## Requirements

PostgreSQL 13 or newer. A function's body is a dependency only when PostgreSQL records it: a `BEGIN ATOMIC` or `RETURN` body of a SQL function (PostgreSQL 14 and newer) is, a PL/pgSQL body or a body in quotes is not, so a function that uses the table that way is not listed.

## Notes

The list is one level deep: a view on a view on this table shows the first view only; open Dependents on that view for the next level.
