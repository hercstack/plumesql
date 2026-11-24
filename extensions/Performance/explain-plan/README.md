# Explain plan

See why a query is slow: the plan PostgreSQL ran, drawn as a diagram of where the time went, with the steps worth a look listed first, a misestimate said where it starts, and the change that would fix it. It opens by itself on every EXPLAIN result, and on PlumeSQL 0.33.0 and later it is tied to the query it explains: a step chosen marks in the editor what it reads, and the caret on a table chooses the step that reads it.

![Explain plan: a search for Saturday rentals by one staff member on dvdrental. Execution time 2.8 ms, 1,154 rows returned, one step. What stands out: the Seq Scan on rental takes 98% of the time; its rows were underestimated 29 times (40 planned, 1,154 actual) because it filters on an expression, EXTRACT(dow FROM rental_date), which PostgreSQL keeps no statistics on, with the CREATE STATISTICS that gives it some as a statement to copy; and its filter discarded 93% of the 16,044 rows it read. The step's detail beside the diagram shows 1,154 rows kept against 14.9k removed by the filter](media/explain-plan-estimate.webp)

A search for Saturday rentals by one staff member. The plan has one step, reading the whole `rental` table, and what stands out about it says what is wrong and why: almost all the time is spent there, PostgreSQL expected 40 rows and got 1,154 because it has no statistics on "the day of the week of a date", and it read 16,044 rentals to keep 7% of them. The statement under it gives the planner those statistics.

## What it is for

- **Why is this query slow?** The step that takes most of the time is named first, with its share, so you know where to look before reading a line of the plan.
- **Where did PostgreSQL guess wrong, and why?** It picks a plan from estimates of how many rows each step returns. One wrong guess low in the plan is wrong again in every step built on it, so the view says it once, at the step where it starts, and says how many steps above carry it. Where your database's facts show why (two conditions on columns that go together, estimated as if they were independent; a condition on an expression PostgreSQL keeps no statistics on), it says that too, with the `CREATE STATISTICS` that fixes it.
- **Would an index help?** A scan that reads a whole table to keep a little of it gets the index that would serve its filter, equalities first and then a range, the way a btree serves them; or the index already there that the planner passed over.
- **Is it running out of memory?** A sort or a hash that spilled to disk, temporary files, a step run thousands of times in a loop: each one listed with its numbers, ready to paste into a ticket.

## How to read it

The **Plan** tab beside the grid shows its first screen at once: the run in a line, what stands out, and the plan as a picture with the chosen step's detail beside it; the plan as a table follows below.

- **The run**: how long the query ran (or, for a plain EXPLAIN that did not run it, its estimated cost), how long planning took and what it read, how many rows it returned, how much data it read and how much of that came from memory (cached), how many steps the plan has, and JIT compile time when there was any. Under it, when the EXPLAIN carried them, the settings that differ from the defaults (`SETTINGS`), the triggers that fired with their time, and what sending the rows cost (`SERIALIZE`, PostgreSQL 17). And what the server's own parameters add to the plan (PlumeSQL 0.29.0 and newer): the share of the run JIT took and the thresholds the plan's cost crossed to get it (`jit_above_cost` and the others), reads that carry no time because `track_io_timing` is off, and the planner's `enable_` switches that were off.
- **What stands out**: a row per step worth a look, its facts after its name, the three that matter most first and the rest one click away (**Show more**); a join or a sort is named by its condition or key, so two Hash Joins are told apart, and a click on the row shows the step in the picture. A step that takes a fifth of the time or more, a row estimate off by ten times or more where the misestimate starts (with why, when the plan and your database show it), a filter that threw away nearly everything it read, a sort or hash that spilled to disk, temporary files, an inner step run thousands of times in a nested loop, a subquery run once per row of its parent, heap fetches in an index only scan, a bitmap gone lossy, a Gather that launched fewer workers than it planned, and a step the planner was told to avoid and used anyway (PostgreSQL 17 marks it when an `enable_` setting is off). Beside a spill, the memory it had: `work_mem` (and for a hash, `hash_mem_multiplier` and what the two make), beside the workers the server's limits, and beside the avoided step the switches that were off, each the value the query ran under (a `SET` earlier in the script counts). Only what the plan, the server and your database's own facts say; nothing is guessed.
- **What to do about it**: under a fact whose numbers point at a change, that change, its statement a chip that copies itself (click it, or Enter on it): the `work_mem` that should keep a spilled sort, hash or temporary file in memory (twice what the sort wrote out, all the batches of a hash, rounded up to a size people set), `max_parallel_workers` when the session's own limit was below the workers planned, `RESET` for the planner's switches the session turned off, `jit = off` when compiling took a fifth of the run or more, and `track_io_timing = on` when the reads carry no time. Each of those is for the session (`SET`), not the server: `work_mem` counts for every sort and hash of every query of every connection, so a value raised for one query belongs to the session that runs it. And from your database's facts (PlumeSQL 0.33.0 and later): `CREATE STATISTICS` on two columns or more that the misestimate's conditions compare by equality, or on the expression it filters on (PostgreSQL 14 and newer), each followed by the `ANALYZE` that fills it, when no statistics object covers them yet; and `CREATE INDEX` for a scan that read a whole table to keep a tenth of it or less, when the index would serve its whole filter and none begins with those columns. Nothing runs: you copy the statement and run it yourself.
- **Where it goes**: the whole plan as a **Diagram**, or as **Boxes**, as tall as the pane has room for and the plan needs.
  - In the diagram every step is a card under the step that uses its rows: its name, the table and index it reads (or, for a join, a sort or a grouping, its condition or key), its rows as the plan counts them (`60.0k = 3 × 20.0k loops`: per loop, times the loops, the arithmetic EXPLAIN leaves to you), what its filter kept of what it read, what it took itself, and its estimate: `×45 more than the 441 planned` in amber or red where a misestimate starts, `carried from Seq Scan` in grey where a step only builds on it. The bar under its name is its OWN share: blue costs little by itself, amber and red is where the time really goes. The line up to its parent is as thick as the rows it passes up, on a scale where four rows and sixty thousand read apart at a glance, labelled with their number (and what was planned, where a misestimate starts); the lines from the chosen card up to the result are in the accent, its way out. The first look opens on the step that stands out most.
  - In the boxes each step is as wide as its share with everything under it, coloured by its own share.
  - Switch what both measure between **Time**, **Rows**, **Cost** and **Buffers** (data read). One the plan cannot give is shown off, and its tooltip names the EXPLAIN option that brings it.
- **The chosen step**, beside the picture: what stands out about it (a misestimate it only carries says where it came from), its time, its rows (actual against planned, per loop times the loops, and a bar of what its filter kept against what it removed), what it read (a bar of cached against read from disk, and what it wrote to temporary files), its cost, the conditions and keys it works by, and every other property in a fold, **All properties**, the ones that say nothing (a zero, a false) left out.
- **Steps**: the plan as a table, one row per step: its own time as a bar, its time with everything under it, its rows (with `×29↑` beside them when the estimate was that far off, ↑ for more rows than expected, ↓ for fewer, grey where the step only carries it), its loops and its notes. The box above it finds steps by name, table, index or anything in their conditions, keeping each match in its place with the steps above it.

A step's own time is its time in all minus the steps under it, and its time in all counts every loop, except under a Gather, where the loops are workers running side by side. Under a Limit a step stops early on purpose, so fewer rows than planned there is the Limit working, not a wrong guess, and it is not flagged.

## Your query beside its plan

On PlumeSQL 0.33.0 and later the plan knows the query it explains, as long as the editor still holds it as it ran:

- **A step chosen marks what it reads.** Click a card, a row of what stands out or of Steps: the editor marks the table the step reads where your query names it, and every column read through its alias (`o.channel`, `o.placed_at`), bringing them into view; a join marks the tables under it. Your caret, selection and focus stay where they were.
- **The caret chooses the step.** Put the caret on a table of the query, or on a column read through its alias, and the plan chooses the step that reads it, its card brought into view and its detail beside.
- **The advice reads your tables.** Which indexes a table has and which extended statistics, from the connection's own objects: the statement offered is the one that is missing, never one that is already there.

![Explain plan beside its query: the query's subquery counts one customer's rentals, and the plan's Seq Scan on rental r, chosen, is marked in the editor where the query names rental and reads r.customer_id. What stands out: the Seq Scan on rental r takes 81% of the time and its filter discarded 100% of 786,156 rows read, with CREATE INDEX ON public.rental (customer_id) to copy](media/explain-plan-link.webp)

## Try it

Run any EXPLAIN in a script; the Plan tab opens with the result. The examples use the [dvdrental](https://neon.com/postgresql/postgresql-getting-started/postgresql-sample-database) sample database; the third runs on any connection.

**A filter PostgreSQL cannot predict**, the picture above: it has no statistics for "the day of the week of a date", so it guesses, and reads the whole table. The view says so and offers the statistics object that gives it some (PostgreSQL 14 and newer); after it and an `ANALYZE`, PostgreSQL expects 1,158 rows instead of 40.

```sql
explain analyze
select * from rental
where extract(dow from rental_date) = 6 and staff_id = 1;
```

**The best customers since July**: a join of three tables, grouped and sorted. Everything came from memory (2.1 MB, 100% cached), and the time is spread over the joins and the grouping; no single step stands out as a problem.

```sql
explain (analyze, buffers)
select c.first_name || ' ' || c.last_name as customer, sum(p.amount) as spent
from customer c
     join payment p using (customer_id)
     join rental r using (rental_id)
where r.rental_date >= '2005-07-01'
group by c.customer_id
order by spent desc
limit 10;
```

![Explain plan: a three-table join. Execution time 9.3 ms, 10 rows, 2.1 MB of buffers all cached, 10 steps. What stands out: the Hash Join on p.rental_id = r.rental_id takes 27% of the time. The diagram shows Limit, Sort, HashAggregate and two Hash Joins down a line that thickens to 12.6k rows, the chosen Hash Join amber, its detail beside: 12.6k actual against 11.6k planned, all of it read from memory](media/explain-plan-join.webp)

Read the diagram from the top: the Limit and the Sort pass up ten rows and cost almost nothing themselves; their bars are empty. The line thickens down the stack, 599 rows into the Sort, 12.6k out of the joins, and the bars warm in the grouping (HashAggregate) and the joins: the amber Hash Join, a quarter of the time, is the most expensive single step, and still only 2.5 ms.

**A sort that does not fit in memory** (any connection): a million rows sorted by a text value, to skip almost all of them.

```sql
explain (analyze, buffers)
select g, md5(g::text) as h
from generate_series(1, 1000000) g
order by h
limit 5 offset 999990;
```

![Explain plan: a sort of a million rows. Execution time 1.28 s, 5 rows returned, JIT 3.4 ms. What stands out: the Sort on md5(g::text) takes 57% of the time and spilled to disk (45 MB, external merge) under a work_mem of 4MB, with SET work_mem = '128MB' to copy, and the Function Scan takes 40% and wrote 13.4 MB to temporary files, with SET work_mem = '32MB'. In the diagram a million rows flow up a thick line from the Function Scan into the red Sort](media/explain-plan-spill.webp)

1.28 seconds to return five rows. The Sort is red twice: more than half the time, and it spilled to disk because the rows did not fit in `work_mem` (an external merge). The Function Scan wrote 13.4 MB of temporary files holding the million generated rows. Raising `work_mem` for this session, or a query that does not sort a million rows to keep five, are the two ways out.

**A subquery run once per row** (dvdrental): the 50 best customers with their address and how many rentals each has, counted by a subquery in the select list.

```sql
explain (analyze, buffers)
with top as (
  select customer_id, sum(amount) as spent
  from payment group by customer_id order by spent desc limit 50
)
select c.first_name, c.last_name, t.spent, a.address, ci.city,
       (select count(*) from rental r where r.customer_id = c.customer_id) as rentals
from top t
join customer c on c.customer_id = t.customer_id
join address a on a.address_id = c.address_id
join city ci on ci.city_id = a.city_id
where c.active = 1
order by t.spent desc;
```

![Explain plan: a query with a subquery in its select list. What stands out: the Seq Scan on rental r takes 81% of the time and its filter discarded 100% of 786,156 rows read, with CREATE INDEX ON public.rental (customer_id) to copy, and the Aggregate is a subquery run once per row, 49 times. The diagram's three Nested Loops and their index scans are cheap; on the right a SubPlan 1 card and the red Seq Scan under it, 1,715 rows = 35 × 49 loops, keeping 0.2% of what it read](media/explain-plan-diagram.webp)

The joins are fast: index scans, one row each. The time is on the right of the diagram, under **SubPlan 1**: the subquery counts one customer's rentals by reading the whole `rental` table, and it runs once for each of the 49 customers, 786,156 rows read to count 1,715. No index of `rental` begins with `customer_id`, so the view offers the one that turns each run into a few index reads; joining a grouped count once instead of a subquery per row is the other way out.

## Using it

Run EXPLAIN, the editor's **Explain ▾** lens or the run glyph's right click on any statement. The lens speaks PostgreSQL's default text form (its last variant asks for JSON), and EXPLAIN ANALYZE of a statement that writes runs inside a rollback, so nothing is changed. Any EXPLAIN typed by hand works too, in JSON or in text, with or without ANALYZE and BUFFERS; the more the plan carries, the more the view shows. Without ANALYZE the query does not run: you see the plan and its estimates, but no times, and nothing can stand out (the view says so, with the way to EXPLAIN ANALYZE).

**Copy plan** in the header copies the plan as it came from the server, **Copy summary** a short text of the totals and what stands out, ready for a ticket.

### The diagram

On PlumeSQL 0.31.0 and later the diagram is drawn by PlumeSQL's own diagram canvas, the one its database diagrams use: the plan laid out top to bottom, each card its step's share as a bar (red from half the whole, amber from a fifth), its rows and its own time, how far the estimate was off and what to look at; the lines as thick as the rows they carry, the selected step's way up to the result in the accent. Drag to move around, the wheel zooms, **−**, **Fit** and **+** sit in its corner, and a plan of more than two dozen steps gets a minimap. A deep plan opens at a size its cards read at, the step that stands out most in sight (on PlumeSQL 0.33.0 and later; its top before). A click chooses a step (its detail shows beside), a double click shows it in Steps, and a card's **−** folds the steps under it (in the table too), **+** bringing them back.

On older versions the extension draws the diagram itself: **−**, **Fit** and **+** in the header zoom, so does Ctrl or Cmd with the wheel, and dragging the background moves around a large plan.

### Keyboard

In the diagram the arrows choose the nearest card that way (on older versions: Up the step that uses this one's rows, Down its first input, Left and Right the card beside it); Enter shows the step in Steps; **+** and **−** zoom and **0** fits. In the Steps table, Up and Down walk the steps, Left folds a step or goes to its parent, Right unfolds it or goes to its first child, Home and End go to the first and the last. Enter on a row of what stands out shows its step in the picture.

## Good to know

EXPLAIN ANALYZE runs the query to time it. A query that takes ten minutes takes ten minutes to explain; a plain EXPLAIN answers at once, with estimates only.

The advice from your database's facts is offered only where they show it: no `CREATE STATISTICS` where a statistics object already covers the columns (or an index already covers an expression), no `CREATE INDEX` where an index begins with those columns or where the filter holds a condition the index could not read (an expression, a `LIKE`), which may be what threw the rows away. An index on an expression gives PostgreSQL both the statistics and a faster way in; it is yours to weigh against the writes it costs.

## Requirements

PostgreSQL 13 or newer. Nothing runs on the server: it reads the plan already fetched, the server's configuration parameters PlumeSQL already holds (PlumeSQL 0.29.0 and newer; an older one shows the plan without them), and the relations of the explained statement with their indexes and extended statistics from the connection's objects PlumeSQL already holds (PlumeSQL 0.33.0 and newer; an older one shows the plan without the link to the query and without the advice they bring). It installs with **stats-core**, the shared helper library of the Analysis extensions, and applies everywhere from the install on (a global scope you can change on its page).
