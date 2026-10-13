# Health check

Is anything wrong with this database that will hurt later? One click, and a checklist answers: each problem with how serious it is and what to do about it.

![Health check on a small shop database: two high findings (an invalid index left by a failed CREATE INDEX CONCURRENTLY, and a table that is 75% dead rows), three medium ones (the orders key two thirds of the way to the integer limit, an abandoned replication slot keeping 580 MB of WAL, a foreign key without an index), two low ones, and six checks that found nothing](media/health-check-findings.webp)

A shop database checked in 21 milliseconds. The two `high` lines need attention today: an index that is maintained on every write but can never be used, and an `events` table where three rows in four are dead. The `medium` ones are the slow fuses: the `orders.id` key has used 67.5% of what an `integer` can count, and a replication slot nobody reads has kept 580 MB of WAL on disk. Each row also says what to do about it, in the column to the right of the picture.

## When to use it

- **You inherit a database**, from a colleague, a client or a company you just joined, and want to know what state it is in before you touch anything.
- **Before a release or a migration**, to make sure nothing is close to the edge (a key about to run out, wraparound, an invalid index).
- **Something feels slow or the disk keeps growing**, and you want the usual suspects listed in one place: dead rows, missing indexes, stale statistics, a forgotten slot.
- **As a monthly habit**, the database equivalent of a car's service check.

## How to read it

One row per finding, the most serious first, then the checks that found nothing as `ok` lines at the end:

| Column | Meaning |
|---|---|
| severity | `high` (act now), `medium` (plan a fix), `low` (worth knowing), or `ok` for a check with nothing to report. |
| check | Which check found it. |
| object | The database, table, index, sequence, slot or session (`pid`) it is about. |
| finding | What is wrong, with the numbers behind it. |
| what to do | The remedy, usually one statement. |

What each check looks for, and where it draws the line:

| Check | Finds | Why it matters |
|---|---|---|
| transaction wraparound | Databases whose oldest unfrozen transaction is more than 1 billion transactions old (`medium`; `high` past 1.5 billion), and `low` once it is 20% past `autovacuum_freeze_max_age`. | At about 2 billion the server stops accepting writes until a long VACUUM finishes. |
| integer overflow | Sequences, and the `smallint` or `integer` columns they feed, past 50% of their range (`medium`; `high` from 75%). A sequence feeding an integer column is measured against the column's limit. | When the key runs out, every insert fails. **Integer overflow risk** lists every key in detail. |
| invalid indexes | Indexes marked invalid, usually left by a failed `CREATE INDEX CONCURRENTLY`. Always `high`. | They slow every write and never help a read. |
| long transactions | Client sessions with a transaction open for more than an hour (`high` past six hours). | They hold back vacuum everywhere and may hold locks. |
| idle in transaction | Sessions doing nothing inside an open transaction for more than five minutes (`high` past an hour). | Usually an application that forgot to commit. |
| replication slots | Inactive replication slots, with the WAL they keep. | An abandoned slot keeps WAL forever: the classic full disk. |
| connections | Client connections at 80% of `max_connections` or more (`high` from 90%). | At 100% new connections are refused. |
| cache hit ratio | This database's buffer cache hit ratio below 99% (`medium` below 90%), once it has read at least 100,000 blocks. | Too many reads go to disk. |
| primary keys | User tables without a primary key; `medium` above about 10,000 rows. Partitions are left out, they follow their parent. | Replication, row editing and most tools need a key to tell rows apart. |
| foreign keys without an index | Foreign keys whose columns no index starts with; `medium` above about 10,000 rows. | Deleting or updating a parent row scans the whole child table. |
| dead rows | Tables with more than 10,000 dead rows making up more than 20% of the table (`high` when the dead outnumber the live). | Wasted space and slower scans: vacuum is falling behind. |
| stale statistics | Tables over 10,000 rows never analyzed, or with more than 20% of their rows changed since the last analyze. | The planner guesses its plans from these numbers. |
| unused indexes | Indexes of 1 MB or more nothing has read since the statistics were reset, leaving out unique, primary key and constraint indexes (`medium` from 100 MB). | They cost space and slow every write. |

The thresholds are a first sorting, not a verdict: a table without a primary key may be a log on purpose, and an index unused here may serve a standby or a monthly report.

## Try it

Open the **Extensions** side tab, find **Health check** and press its **Run**. It asks which connection when the tab has none, then answers at once. Press the refresh button in its header to check again after a fix. To keep it one click away, right-click its row and pick **Pin to**.

To see findings on a **test database** (never on a server that matters), make a few problems on purpose:

```sql
create table events (id serial, kind text);
insert into events (kind) select 'view' from generate_series(1, 40000);
alter table events set (autovacuum_enabled = false);
delete from events where id % 4 <> 0;          -- dead rows, and no primary key

create table lines (id bigserial primary key, order_id int);
insert into lines (order_id) select g % 1000 from generate_series(1, 20000) g;
create unique index concurrently lines_order_unique on lines (order_id);
-- fails on the duplicates and leaves an invalid index behind
```

Run **Health check** again: `dead rows` and `primary keys` report `events`, and `invalid indexes` reports `lines_order_unique`. Drop both tables when you are done.

## Good to know

It only reads: nothing is vacuumed, analyzed, dropped or changed. Every check reads PostgreSQL's own statistics and catalogs (`pg_stat_user_tables`, `pg_stat_activity`, `pg_replication_slots`, `pg_index`, `pg_sequences` and a few more), so it is fast even on a big database. The statistics count since their last reset (`pg_stat_reset`), which matters for the unused index check. **Security review** is the companion checklist for roles, passwords and access.

## Requirements

PostgreSQL 13 or newer. Any role can run it. Without `pg_read_all_stats` (or superuser) the session checks see only your own sessions, and the table checks only the tables you may read.
