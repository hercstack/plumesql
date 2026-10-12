# Window function refactors

The window functions everybody looks up every time, a lightbulb away. On a `SELECT`, the editor's lightbulb (Ctrl+. or ⌘.) offers a running total, a moving average, the change from the previous row, a share of the total, a rank or a quartile, written into your query as a new column; and the top rows per group or the latest row per key, written as a query above yours, which stays as it was.

They are the SQL side of the Calculations grid extensions of the same names (Running total, Moving average, Change, Percent of total, Rank, Row numbers): those compute in the grid, over the rows a query returned; these let PostgreSQL compute over every row, in a query you keep, filter, share or serve.

## What it offers

Put the caret on a number column and open the lightbulb. From

```sql
select customer_id, placed_at, amount
from shop_order;
```

**Running total of amount** writes

```sql
select customer_id, placed_at, amount, sum(amount) over (order by placed_at) as amount_running_total
from shop_order
order by placed_at;
```

and **Running total of amount per customer_id** restarts it for each customer (`partition by customer_id`). The `order by` is added only when the query has none: a running total read down unordered rows means nothing. A one-line select list that would grow past 80 characters gets the new column on a line of its own.

![The lightbulb with the caret on amount: Running total of amount, per customer_id, Moving average of amount, Change, Percent of the total and more](media/offers.png)

**Running total of amount per customer_id**, run:

![The query with its new window column and its result: the amount adding up per customer](media/running-total.png)

| Offer | Writes |
|---|---|
| Running total | `sum(amount) over (order by placed_at)`, overall or per group |
| Moving average | `avg(amount) over (order by placed_at rows between 6 preceding and current row)`; over daily data `range between interval '6 days' preceding and current row`, right even when days are missing |
| Change | `amount - lag(amount) over (order by placed_at)` and the percent it is (a zero before reads NULL, never a division error) |
| Percent of total | `round(100.0 * amount / sum(amount) over (), 2)`, of the whole or of the row's group |
| Rank | `rank() over (order by amount desc)`, overall or within each group |
| Quartile | `ntile(4) over (order by amount)` |
| Row numbers | `row_number() over (order by placed_at)` |
| Top N per group | the 3 rows with the highest amount per customer, as a query above |
| Latest row per key | each customer's newest row with PostgreSQL's `distinct on`, as a query above |

On a grouped query the window reads the aggregate: with the caret on `sum(amount)` in

```sql
select date_trunc('month', placed_at) as month, sum(amount) as total
from shop_order
group by 1;
```

**Running total of total** writes `sum(sum(amount)) over (order by date_trunc('month', placed_at))`, and **total as a percent of the total** each month's share: `100.0 * sum(amount) / sum(sum(amount)) over ()`, the one people most often get wrong by hand.

## How it chooses

- **The number column**: the one under the caret (its item in the select list, or its name anywhere in the query); else the query's first number column that is no id.
- **The order**: the query's own `ORDER BY`, else a date or time column, else a hypertable's time column, else the primary key.
- **The group** ("per customer_id"): a foreign key column; or, once the query has run, a column whose values repeat in its first rows.
- **Days or rows** for a moving average: days when the order is a date, or a timestamp whose rows lie hours apart in the last run; rows otherwise (readings every few minutes would make seven days the whole result).

Window columns go into a query only where they can: a `SELECT` with its own list, not `DISTINCT`. A query above works over anything that returns rows, unions included once they have run.

## Options

On the extension's page and in the Refactors settings: the moving average's window (7) and whether it counts days or rows, change as a difference, a percent or both, how ties rank (`rank`, `dense_rank`, `row_number`), how many groups the quartile makes (4, or 10 for deciles) and how many rows per group (3).

## What it reads

The statement's shape (its select list and clauses) and its tables' columns from PlumeSQL's dictionary of the connection; for the group and the moving average's days, also the first rows of the query's last run in this tab, which PlumeSQL already has. Nothing is asked of the server until you run the query.

## Where it applies

In the SQL editor, wherever the extension is attached (everywhere from the install on; change it on its page).

## Requirements

PostgreSQL 13 or newer, and PlumeSQL 0.24.0 or newer.
