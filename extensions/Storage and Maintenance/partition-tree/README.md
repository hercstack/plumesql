# Partition tree

Every partitioned table of the connected database as a tree: the table with its partition key, then each partition indented under its parent with the bounds it takes, its kind, its size and its rows, a sub-partitioned partition with its own partitions under it, and the default partitions marked.

## What it shows

One row per table in the tree, a partition under its parent:

| Column | Meaning |
|---|---|
| partitioned_table | The table at the top of the tree. |
| partition | The partition, indented by its level. |
| level | 0 for the top, 1 for its partitions, 2 for theirs. |
| bounds | `PARTITION BY RANGE (sold_on)` on the top, then each partition's bounds: `FOR VALUES FROM (...) TO (...)`, `FOR VALUES IN (...)`, `WITH (MODULUS ..., REMAINDER ...)` or `DEFAULT`. |
| kind | `partitioned` (it has partitions of its own), `table`, or `foreign table`. |
| size | On disk with its indexes and TOAST; a partitioned table's is its partitions' together. |
| rows_estimate | The planner's estimate from the last ANALYZE; a partitioned table's is its partitions' together. |
| note | `default` on a default partition, `partitioned again` on a sub-partitioned one. |

## Examples

Run it from the Extensions side tab (**Run**). A sales table by quarter, its first quarter partitioned again by region:

| partition | level | bounds | kind | size | rows_estimate | note |
|---|---|---|---|---|---|---|
| sales | 0 | PARTITION BY RANGE (sold_on) | partitioned | 1760 kB | 30000 | |
| &nbsp;&nbsp;sales_2026_q1 | 1 | FOR VALUES FROM ('2026-01-01') TO ('2026-04-01') | partitioned | 648 kB | 10020 | partitioned again |
| &nbsp;&nbsp;&nbsp;&nbsp;sales_2026_q1_eu | 2 | FOR VALUES IN ('eu') | table | 216 kB | 3340 | |
| &nbsp;&nbsp;sales_2026_q2 | 1 | FOR VALUES FROM ('2026-04-01') TO ('2026-07-01') | table | 560 kB | 10101 | |
| &nbsp;&nbsp;sales_default | 1 | DEFAULT | table | 8192 bytes | 0 | default |

A default partition that grows is the first sign that partitions are not being made ahead: rows that should have gone into next quarter's partition landed in it. Partitions are drawn as a tree, folded and sized, by the Tree extension too:

```sql
-- @extension tree open
-- @inputs id=child, link=parent, size=bytes
select c.oid::regclass::text as child,
       h.inhparent::regclass::text as parent,
       pg_catalog.pg_total_relation_size(c.oid) as bytes
from pg_catalog.pg_class c
     left join pg_catalog.pg_inherits h on h.inhrelid = c.oid
where c.relkind in ('r', 'p')
  and (h.inhparent is not null or exists (select 1 from pg_catalog.pg_inherits x where x.inhparent = c.oid));
```

## Requirements

PostgreSQL 13 or newer, declarative partitioning (`PARTITION BY`). Tables split by inheritance alone are not partitioned tables and are not listed. pg_partman's partition sets have their own extension, Partition sets.

## Notes

The row counts are estimates and are 0 until a table has been analyzed. Sizes are read at the moment of the run.
