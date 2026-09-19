# Stats core

Shared helpers the analysis extensions import: paging a whole result in, reading numbers from server text, the folds (sum, mean, median, percentiles, standard deviation, distinct), ranks, Pearson and Spearman correlation, a least squares fit, histogram bins with round edges, date and time buckets, Holt and linear forecasts, a seeded sampler and theme aware cell colours. A library: it adds no view of its own and is installed as a dependency of the extensions that use it, never on its own.

## What it shows

Nothing to a result by itself. Group by, Histogram, Correlation, Unpivot, Resample, Forecast, Sample and the Calculations extensions import from `$ext/stats-core/stats-core.plumesql.js`.

## Requirements

PostgreSQL 13 or newer. Nothing loaded from the network: plain JavaScript run in the result's sandbox.

## Notes

The folds answer what a spreadsheet answers: the standard deviation is the sample one (STDEV.S), a percentile interpolates between ranks (PERCENTILE.INC, PostgreSQL's `percentile_cont`), tied ranks share their average place (RANK.AVG). Times are bucketed in UTC and weeks start on Monday, as `date_trunc('week', ...)` does.

Removing an extension that uses it keeps this one while another still needs it; it goes when the last one does.
