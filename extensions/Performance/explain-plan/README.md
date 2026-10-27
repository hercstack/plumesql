# Explain plan

See why a query is slow: the plan PostgreSQL ran, drawn as a diagram of where the time went, with the steps worth a look listed first. It opens by itself on every EXPLAIN result.

![Explain plan: the plan of a query on dvdrental's rentals. Execution time 2.4 ms, 1,154 rows returned, one step. What stands out: the Seq Scan on rental takes 98% of the time, its rows were underestimated 29 times (40 planned, 1,154 actual), and its filter discarded 93% of the 16,044 rows it read. The diagram's one card is red, and the step's detail says the filter removed 14,890 rows, 93% of the rows read](media/explain-plan-estimate.webp)

A search for Saturday rentals by one staff member. The plan has one step, reading the whole `rental` table, and the three facts under it say what is wrong with it: almost all the time is spent there, PostgreSQL expected 40 rows and got 1,154, and it read 16,044 rentals to keep 7% of them. On a small table that costs 3 ms; on a table a thousand times bigger, this is where an index belongs.

## What it is for

- **Why is this query slow?** The step that takes most of the time is named first, with its share, so you know where to look before reading a line of the plan.
- **Did PostgreSQL guess wrong?** It picks a plan from estimates of how many rows each step returns. When an estimate is off ten times or more (an outdated table, a condition it cannot predict), the plan it picked may be the wrong one, and the view says where.
- **Is it running out of memory?** A sort or a hash that spilled to disk, temporary files, a step run thousands of times in a loop: each one listed with its numbers, ready to paste into a ticket.

## How to read it

The **Plan** tab beside the grid has four parts, top to bottom, and the selected step's detail beside them:

- **The summary**: how long the query ran (or, for a plain EXPLAIN that did not run it, its estimated cost), how long planning took and what it read, how many rows it returned, how much data it read and how much of that came from memory (cached), how many steps the plan has, and JIT compile time when there was any. Under it, when the EXPLAIN carried them, the settings that differ from the defaults (`SETTINGS`), the triggers that fired with their time, and what sending the rows cost (`SERIALIZE`, PostgreSQL 17). And what the server's own parameters add to the plan (PlumeSQL 0.29.0 and newer): the share of the run JIT took and the thresholds the plan's cost crossed to get it (`jit_above_cost` and the others), reads that carry no time because `track_io_timing` is off, and the planner's `enable_` switches that were off.
- **What stands out**: the facts worth a look first, each a link to its step, and a join or a sort named by its condition or key, so two Hash Joins are told apart. A step that takes a fifth of the time or more, row estimates off by ten times or more, a filter that threw away nearly everything it read, a sort or hash that spilled to disk, temporary files, an inner step run thousands of times in a nested loop, a subquery run once per row of its parent, heap fetches in an index only scan, a bitmap gone lossy, a Gather that launched fewer workers than it planned, and a step the planner was told to avoid and used anyway (PostgreSQL 17 marks it when an `enable_` setting is off). Beside a spill, the memory it had: `work_mem` (and for a hash, `hash_mem_multiplier` and what the two make), beside the workers the server's limits, and beside the avoided step the switches that were off, each the value the query ran under (a `SET` earlier in the script counts). Only what the plan and the server say; nothing is guessed.
- **What to do about it**: under a fact whose numbers point at a change, that change, its statement a chip that copies itself (click it, or Enter on it): the `work_mem` that should keep a spilled sort, hash or temporary file in memory (twice what the sort wrote out, all the batches of a hash, rounded up to a size people set), `max_parallel_workers` when the session's own limit was below the workers planned, `RESET` for the planner's switches the session turned off, `jit = off` when compiling took a fifth of the run or more, and `track_io_timing = on` when the reads carry no time. Each is for the session (`SET`), not the server: `work_mem` counts for every sort and hash of every query of every connection, so a value raised for one query belongs to the session that runs it.
- **Where it goes**: the whole plan as a **Diagram**, or as **Boxes**.
  - In the diagram every step is a card under the step that uses its rows: its kind as an icon, its name, the table and index it reads (or, for a join, a sort or a grouping, its condition or key), what it took itself and its share, the rows it returned (with `×29↑` when the estimate was that far off) and how many times it ran. The bar along the card's foot is its OWN share: blue costs little by itself, amber and red is where the time really goes. The line up to its parent is as thick as the rows it passes up, labelled with their number; the lines from the selected card up to the result are in the accent, its way out.
  - In the boxes each step is as wide as its share with everything under it, coloured by its own share.
  - Switch what both measure between **Time**, **Rows**, **Cost** and **Buffers** (data read). One the plan cannot give is shown off, and its tooltip names the EXPLAIN option that brings it.
- **Steps**: the plan as a table, one row per step: its own time as a bar, its time with everything under it, its rows (with `×29↑` beside them when the estimate was that far off, ↑ for more rows than expected, ↓ for fewer), its loops and its notes. The box above it finds steps by name, table, index or anything in their conditions, keeping each match in its place with the steps above it.

Select a step, in the diagram, the boxes or the table, to read everything the plan says about it on the side: its conditions, sort keys, memory, buffers and every other property, and how much a filter removed as a share of the rows it read.

A step's own time is its time in all minus the steps under it, and its time in all counts every loop, except under a Gather, where the loops are workers running side by side. Under a Limit a step stops early on purpose, so fewer rows than planned there is the Limit working, not a wrong guess, and it is not flagged.

## Try it

Run any EXPLAIN in a script; the Plan tab opens with the result. The examples use the [dvdrental](https://neon.com/postgresql/postgresql-getting-started/postgresql-sample-database) sample database; the third runs on any connection.

**A filter PostgreSQL cannot predict**, the picture above: it has no statistics for "the day of the week of a date", so it guesses, and reads the whole table.

```sql
explain analyze
select * from rental
where extract(dow from rental_date) = 6 and staff_id = 1;
```

**The best customers since July**: a join of three tables, grouped and sorted. Everything came from memory (2.2 MB, 100% cached), and the time is spread over the joins and the grouping; no single step stands out as a problem.

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

![Explain plan: a three-table join. Execution time 11 ms, 10 rows, 2.2 MB of buffers all cached, 10 steps. What stands out: the Hash Join on p.rental_id = r.rental_id takes 25% of the time. The diagram shows Limit, Sort, HashAggregate and two Hash Joins down a thick line of 12.6k rows, the selected Hash Join amber with its condition on its card](media/explain-plan-join.webp)

Read the diagram from the top: the Limit and the Sort pass up ten rows and cost almost nothing themselves; their bars are empty. The line thickens down the stack, 599 rows into the Sort, 12.6k out of the joins, and the bars warm in the grouping (HashAggregate) and the joins: the amber Hash Join, a quarter of the time, is the most expensive single step, and still only 2.8 ms.

**A sort that does not fit in memory** (any connection): a million rows sorted by a text value, to skip almost all of them.

```sql
explain (analyze, buffers)
select g, md5(g::text) as h
from generate_series(1, 1000000) g
order by h
limit 5 offset 999990;
```

![Explain plan: a sort of a million rows. Execution time 1.24 s, 5 rows returned, JIT 3.6 ms. What stands out: the Sort on md5(g::text) takes 56% of the time and spilled to disk (external merge), and the Function Scan takes 41% and wrote 13.4 MB to temporary files. In the diagram a million rows flow up a thick line from the Function Scan into the red Sort](media/explain-plan-spill.webp)

1.24 seconds to return five rows. The Sort is red twice: more than half the time, and it spilled to disk because the rows did not fit in `work_mem` (an external merge). The Function Scan wrote 13.4 MB of temporary files holding the million generated rows. Raising `work_mem` for this session, or a query that does not sort a million rows to keep five, are the two ways out.

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

![Explain plan: a query with a subquery in its select list. What stands out: the Seq Scan on rental r takes 87% of the time, its filter discarded 100% of 786,156 rows read, and the Aggregate is a subquery run once per row, 49 times. The diagram's three Nested Loops and their index scans are cheap; on the right a SubPlan 1 card and the red Seq Scan under it, ×49](media/explain-plan-diagram.webp)

The joins are fast: index scans, one row each. The time is on the right of the diagram, under **SubPlan 1**: the subquery counts one customer's rentals by reading the whole `rental` table, and it runs once for each of the 49 customers, 786,156 rows read to count 1,715. An index on `rental (customer_id)` turns each run into a few index reads; so does joining a grouped count once instead of a subquery per row.

## Using it

Run EXPLAIN, the editor's **Explain ▾** lens or the run glyph's right click on any statement. The lens speaks PostgreSQL's default text form (its last variant asks for JSON), and EXPLAIN ANALYZE of a statement that writes runs inside a rollback, so nothing is changed. Any EXPLAIN typed by hand works too, in JSON or in text, with or without ANALYZE and BUFFERS; the more the plan carries, the more the view shows. Without ANALYZE the query does not run: you see the plan and its estimates, but no times.

**Copy plan** in the header copies the plan as it came from the server, **Copy summary** a short text of the totals and what stands out, ready for a ticket.

### The diagram

The first diagram fits the pane. **−**, **Fit** and **+** in the header zoom, so does Ctrl or Cmd with the wheel; drag the background to move around a large plan. The **−** under a card folds the steps under it (in the table too), and **+** brings them back.

### Keyboard

In the diagram, Up goes to the step that uses this one's rows, Down to its first input, Left and Right to the card beside it; Enter shows the step in Steps; **+** and **−** zoom and **0** fits. In the Steps table, Up and Down walk the steps, Left folds a step or goes to its parent, Right unfolds it or goes to its first child, Home and End go to the first and the last. Enter on a fact goes to its step.

## Good to know

EXPLAIN ANALYZE runs the query to time it. A query that takes ten minutes takes ten minutes to explain; a plain EXPLAIN answers at once, with estimates only.

The first example's estimate is fixable: PostgreSQL 14 and newer can keep statistics on an expression (`create statistics rental_dow on (extract(dow from rental_date)) from rental;` then `analyze rental;`), after which it expects 1,158 rows instead of 40. An index on the expression gives it both the statistics and a faster way in.

## Requirements

PostgreSQL 13 or newer. Nothing runs on the server: it reads the plan already fetched, and the server's configuration parameters PlumeSQL already holds (PlumeSQL 0.29.0 and newer; an older one shows the plan without them). It installs with **stats-core**, the shared helper library of the Analysis extensions, and applies everywhere from the install on (a global scope you can change on its page).
