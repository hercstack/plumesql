# Readability refactors

A query written against its tables' full names reads long: `customer.first_name`, `address.city_id`, `public.customer.email`. These refactors give the tables short aliases and rewrite every column that names them, in one step, from the editor's lightbulb (**Ctrl+.**, **Cmd+.** on a Mac).

![The lightbulb on a query over customer and address without aliases offers Add aliases to every table (customer c, address a), Add the alias c to customer and Add the alias a to address; after the first one the query reads select c.first_name, a.city_id from customer c join address a on a.address_id = c.address_id where c.active = 1](media/readability-refactors.webp)

## What it is for

- **Every table at once.** On a query whose tables have no alias, **Add aliases to every table** names each one (`customer c`, `address a`) and rewrites every `customer.` and `address.` in the query to the alias.
- **One table.** **Add the alias c to customer** does it for one: the table under the caret, or each table in turn.
- **Only what reads as that table.** A qualifier inside an inner query that names the same table for itself stays as it is, and so does text in a string or a comment. `public.customer.email` becomes `c.email`.
- **A query to build on.** **Wrap in a CTE** and **Wrap in a subquery** put the query, unchanged, inside a `WITH` or a subquery named after its first table, read whole, so you can filter it, join it or count it next.
- **And back.** **Unwrap** turns a query that only reads a subquery or one CTE whole back into the query it holds.

## Try it

```sql
select customer.first_name, customer.last_name, address.city_id
from customer
join address on address.address_id = customer.address_id
where customer.active = 1;
```

Put the caret on the statement, press **Ctrl+.** (**Cmd+.**) and pick **Add aliases to every table (customer c, address a)**:

```sql
select c.first_name, c.last_name, a.city_id
from customer c
join address a on a.address_id = c.address_id
where c.active = 1;
```

One undo takes it back. To rename an alias afterwards, put the caret on it and press **F2**: every place it is read changes with it.

## Wrap and unwrap

```sql
select * from customer;

-- Wrap in a CTE
with c as (
  select * from customer
)
select * from c;

-- Wrap in a subquery
select *
from (
  select * from customer
) c;
```

Unwrap takes either back to `select * from customer;`. It is offered only where the outer query adds nothing: `select * from (...) c` or `with c as (...) select * from c`, with no WHERE, join, ORDER BY or other column. A query that selects INTO a table or locks its rows (FOR UPDATE) is not wrapped. To move a subquery that is part of a larger query into a WITH, or a CTE used once back into its place, PlumeSQL has Extract subquery into a CTE and Inline a CTE of its own.

## Options

**Alias style** (Settings, Refactors): `initials`, the first letter of each word of the table's name (`customer_order` becomes `co`), or `first letters`, its first three letters (`cus`). The name Wrap gives the CTE or the subquery follows it too (`q` for a query with no table). An alias the query already uses, or a word SQL reserves, gets a number (`c2`).

## What it reads

What the editor hands it about the statement: its tables, where each is written and which qualifiers read as it (PlumeSQL 0.29.0 and later). Nothing is asked of the server.
