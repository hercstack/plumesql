# Data analysis

Get to know a result, summarize it, find what stands out and chart it, all inside the grid: the analyst's everyday set in one install.

## What is in it

**Get to know the data**

- **Profile**: every column at a glance: how many are empty, how many different values, the range and the spread.
- **Data quality**: what is wrong in each column: empty values, duplicate keys, stray spaces, the same word spelled two ways, odd dates.
- **Frequencies**: the most common values of a column and how much of the whole each one is.

**Numbers and how they spread**

- **Histogram**: how a number column spreads out, counted in even steps.
- **Correlation**: which number columns go up and down together, and how strongly.
- **Outliers**: the values far away from the rest, listed or coloured in place.

**Summaries**

- **Group by**: totals, averages and counts per group, with a total row.
- **Pivot**: groups down the side, groups across the top, a total in every cell.
- **Percent of total**: each row's share of the whole, of its group, or as a running percent.
- **Period over period**: each month (or week, or year) beside the one before or the same period a year earlier, with the change.
- **KPI cards**: the big numbers of a dashboard, each with its change and a small trend line.

**Segments**

- **Clusters**: rows that are alike, put into groups by their numbers (for example customers who spend and visit alike).
- **RFM segments**: customers scored on how recently, how often and how much they buy, and named: champions, loyal, at risk, lost.

**Charts**

- **Plot chart**: lines, areas, dots or bars over one or more number columns.

**The same calculations as SQL**

- **Window function refactors**: a running total, moving average, change, share or rank written into your query from the editor's lightbulb.
- **Statistics refactors**: a description, correlation, trend, histogram or the outliers of a number column, as a query PostgreSQL computes over every row.

## Where to start

1. Run any query, right-click its result and choose **Extensions…**, then **Profile**: the quickest look at data you do not know yet.
2. On a query that returns a date and an amount (orders, payments), add `-- @extension period-over-period open` above it and pick the date and the amount when it asks: every month beside the one before, with the change and the change in percent.
3. Put the caret on a number column in the editor and open the lightbulb (Ctrl+. or ⌘.) for a running total, a rank or a share as a new column, computed by PostgreSQL.

A result extension can also stay on: in a script, `-- @extension profile` above a query shows it every time that query runs, and on an extension's page, **Applies to** puts it on every result (**Everywhere**) or on a workspace's. The pack's members are named in `data-analysis.plumesql-pack.json`; the pack's page lists them with where each one stands.
