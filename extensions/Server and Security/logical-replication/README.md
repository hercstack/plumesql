# Logical replication

Logical replication on the connected database, in one list: each publication with what it publishes and the tables in it, and each subscription with the publications it follows, its slot and whether its worker is running. Refreshed every ten seconds while it is open.

## What it shows

One row per thing, publications first:

| kind | name | detail | state |
|---|---|---|---|
| `publication` | Its name. | How many tables (or all tables) and which changes it publishes: insert, update, delete, truncate. | `as the partition root` when a partitioned table is published as one table (`publish_via_partition_root`). |
| `published table` | `publication: schema.table`. | The table's size on disk, its partitions' together for a partitioned table. | A warning when the table has `REPLICA IDENTITY NOTHING`, so its updates and deletes would fail. |
| `subscription` | Its name. | The publications it follows and its replication slot. | `running, last message 0.4 s ago`, `not running` (its worker is down: look at the server log) or `DISABLED`. |

A database with neither says so in one line.

## Examples

Run it from the Extensions side tab (**Run**), on the publisher's database to see what goes out, and on the subscriber's to see what comes in. The output on a publisher with two publications:

| kind | name | detail | state |
|---|---|---|---|
| publication | pub_customers | 2 tables, publishes insert, update | |
| publication | pub_sales | 1 table, publishes insert, update, delete, truncate | as the partition root |
| published table | pub_customers: public.customers | 24 kB | |
| published table | pub_sales: public.sales | 1720 kB | |

To put a table into a publication, or take it out, the statements are `ALTER PUBLICATION pub_sales ADD TABLE public.refunds;` and `ALTER PUBLICATION pub_sales DROP TABLE public.refunds;`. A subscription that says `not running` restarts with `ALTER SUBSCRIPTION sub_sales DISABLE;` then `ENABLE;`, once the cause in the server log is fixed.

## Requirements

PostgreSQL 13 or newer. Reading publications needs no privilege; a subscription's state comes from `pg_stat_subscription`, which every role can read. The connection string of a subscription is never read (it may hold a password).

## Notes

The replication slots a publisher holds for its subscribers, with the WAL each one keeps, are in the Replication status extension. Lag in bytes is measured on the publisher, in its slots, not here.
