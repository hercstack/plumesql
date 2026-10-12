# Data analysis

Profile, summarize, reshape and chart query results, and write the SQL that computes them: the analyst's everyday set in one install.

## Where to start

Run a query, right-click its result and choose **Extensions…**, then **Profile**: every column's nulls, distinct values, range and distribution, the quickest look at data you do not know yet. **Data quality** and **Frequencies** go a step further, **Group by** and **Pivot** fold the rows, and **Plot chart** draws them.

In the editor, **Window function refactors** and **Statistics refactors** write the same calculations as SQL: put the caret on a number column and open the lightbulb (Ctrl+. or ⌘.) for a running total, a moving average, a rank or a share as a new column, or for a description, a correlation, a histogram or the outliers as a query above yours, computed by PostgreSQL over every row.

The result extensions apply to a result the same way. In a script, `-- @extension profile` above a query shows it every time that query runs, and on an extension's page, **Applies to** puts it on every result (**Everywhere**) or on a workspace's.

The pack's members are named in `data-analysis.plumesql-pack.json`, and PlumeSQL lists them on the pack's page with where each one stands.
