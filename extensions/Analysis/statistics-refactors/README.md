# Statistics refactors

PostgreSQL's statistical aggregates, a lightbulb away. On a `SELECT`, the editor's lightbulb (Ctrl+. or ⌘.) offers to describe a number column, correlate it with another, fit its trend over time, draw its histogram or list its outliers, each written as a query above yours that reads it as a CTE named `q`. Your query stays as it was, and its `WHERE`, joins and limits are what the statistics are about.

They are the SQL side of the Analysis grid extensions (Profile, Correlation, Histogram, Outliers): those compute in the grid, over the rows a query returned; these let PostgreSQL compute over every row, in a query you keep and share.

## What it offers

Put the caret on a number column and open the lightbulb. From

```sql
select * from shop_order where placed_at >= '2026-01-01';
```

**Describe amount** writes above it

```sql
with q as (
    select * from shop_order where placed_at >= '2026-01-01'
),
scale as (
    select greatest(2, 4 - floor(log(nullif(max(abs(amount)), 0)::numeric))::int) as d from q
)
select count(amount) as n,
       round((avg(amount))::numeric, d) as mean,
       round((stddev_samp(amount))::numeric, d) as stddev,
       min(amount) as min,
       round((percentile_cont(0.25) within group (order by amount))::numeric, d) as q1,
       round((percentile_cont(0.5) within group (order by amount))::numeric, d) as median,
       round((percentile_cont(0.75) within group (order by amount))::numeric, d) as q3,
       max(amount) as max
from q, scale
group by d;
```

The `scale` CTE rounds each statistic to about four significant digits of the column's largest value (two decimals at least): amounts in the hundreds keep two, ratios in the thousandths keep seven, and no float noise like `112.91499999999999` reaches the grid.

![The lightbulb on a query over orders, listing Describe amount, Describe amount per customer_id, Correlation of amount and items and more under Write a Statement](media/offers.png)

**Describe amount per customer_id**, run:

![The Describe query above the original, and its result: one row per customer with n, mean, stddev, min, q1, median, q3 and max](media/describe.png)

| Offer | Writes |
|---|---|
| Describe | count, mean, standard deviation, minimum, quartiles (median included) and maximum, overall or per group |
| Correlation | `corr(amount, items)` (Pearson), Spearman's (Pearson's of the ranks, ties given their average rank) and the r squared of a straight line, for the column and up to two others |
| Trend over time | `regr_slope(amount, extract(epoch from placed_at)) * 86400`: how much the number changes per day, with the r squared and the span; overall or per group |
| Histogram | the column counted in 10 evenly wide bins between its minimum and maximum (`width_bucket`, the maximum in the last bin), each bin's edges and share |
| Outliers | the rows outside the IQR fences (1.5 times the interquartile range beyond the quartiles, Tukey's rule), or past a z-score of 3 |
| Z-score | how many standard deviations each row lies from the mean, as a column written into your query |

## How it chooses

- **The number column**: the one under the caret, else the query's first number column that is no id. Any column the query returns counts, an aggregate's too.
- **The group** ("per customer_id"): a foreign key column the query returns; or, once it has run, a column whose values repeat in its first rows.
- **The time** for a trend: the first date or timestamp column the query returns.

## Options

On the extension's page and in the Refactors settings: the histogram's bins (10), the outliers' method (IQR fences or z-score), the IQR factor (1.5; 3 for the far ones) and the z-score threshold (3).

## What it reads

The statement's shape and its tables' columns from PlumeSQL's dictionary of the connection; for the group, also the first rows of the query's last run in this tab. Nothing is asked of the server until you run the query.

## Where it applies

In the SQL editor, wherever the extension is attached (everywhere from the install on; change it on its page).

## Requirements

PostgreSQL 13 or newer, and PlumeSQL 0.24.0 or newer.
