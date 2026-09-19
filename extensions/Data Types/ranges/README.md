# Ranges

A range in the grid is its text, `[2024-03-01,2024-03-08)`, and its brackets carry half the meaning. This extension reads the built-in range and multirange types where you meet them, with no query to the server, and draws a whole column of them on one timeline: bookings, validity periods, shifts, price bands.

## What it shows

- **Hover** a cell: one line with the size of the range (`9 integers`, `width 2.5`, `7 days`, `1 day 2 h 30 min`, `unbounded above`) and a bar placing it between its bounds, the brackets drawn as the notation writes them (`[` inclusive, `(` exclusive), an arrow where a side runs to infinity, the outer bounds written under it. On a date or time range a dashed line marks now when it falls on the bar. A multirange draws every member on one bar (`3 ranges · 12 days in all`).
- **Peek** a cell (Space): the same line and bar above the value as stored.
- **Open Value in Tab**: the facts: the type, each bound with its inclusivity (`lower 2024-03-01, inclusive`, `no upper bound`, `upper infinity`), the width of a number range or how many integers an integer range holds, the length of a date or time range in days, and in hours and weeks where that helps, and what is unbounded. A multirange lists its members, its gaps and its total size.
- **Edit a row** (F2): the field draws the bar of what is typed, live; a half typed range draws nothing.
- **Show Ranges on a Timeline**, in the menu of a range or multirange column's header: a **Range Timeline** tab beside the grid draws every range of that column as a bar on one axis, one lane per row, with round ticks on top (months and years on the first of the month, dates as `YYYY-MM-DD`, times with their hour and minute; a `tstzrange` in your local time) and a dashed line at now on a date or time axis. A bar's tooltip names its row and its value, and a click on it selects the row in the grid. When the rows do not fit the pane, ranges that do not overlap share a lane, as a booking calendar draws them, and the line says `packed into N lanes`. A range that runs to infinity fades into the edge. The line above the drawing counts the ranges, the empty ones, the NULLs and anything that could not be placed, and the view reads the column page by page up to 20,000 ranges, saying how far it read (`first 20,000 of 25,000 rows`). It resizes with the pane and paints in the theme's colours.

Integer ranges count exactly, whatever their size. Dates and times are placed when the server prints them in ISO style (the default `DateStyle`); a bound in another style is still listed in the facts but not drawn, and the timeline says how many it could not place. A BC date is not placed.

## Where it applies

Every column whose declared type is `int4range`, `int8range`, `numrange`, `daterange`, `tsrange` or `tstzrange`, or one of their multiranges (`int4multirange` ... `tstzmultirange`, PostgreSQL 14 and newer), in every result, from the install on (a global scope you can change on its page). A text column holding `[1,5)` is text and stays that way. A range type of your own (`create type ... as range`) is not read. The Range Timeline tab shows only on a result that has a range or multirange column.

## Requirements

Nothing beyond PostgreSQL: the types are built in. Nothing runs on the server: the values are read from what the grid already holds.
