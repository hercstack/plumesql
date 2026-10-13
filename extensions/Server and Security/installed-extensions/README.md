# PostgreSQL extensions

Which PostgreSQL extensions does this database use, which of them have an update waiting, and what else could it install? The statement for each is ready to copy.

![PostgreSQL extensions of a test database: hstore 1.7 installed with 1.8 available and ALTER EXTENSION hstore UPDATE ready, pg_trgm and plpgsql installed and current, then amcheck, autoinc, bloom, btree_gin, btree_gist, citext, cube, dblink and more not installed, each with its CREATE EXTENSION statement](media/installed-extensions-list.webp)

`hstore` in this database is still at version 1.7 while the server offers 1.8, so it sits at the top with the statement that updates it. `pg_trgm` and `plpgsql` are current. Below them, every extension the server could install here and does not yet use, each with what it is for: 59 rows on a stock PostgreSQL 17.

These are PostgreSQL's own extensions (the `CREATE EXTENSION` kind, such as PostGIS, pg_trgm or pgvector), not PlumeSQL's.

## When to use it

- **After upgrading PostgreSQL**: the server's files are new but each database keeps its old extension versions until someone runs `ALTER EXTENSION ... UPDATE`. The top of this list is that to-do list.
- **"Can I use fuzzy search / UUIDs / a key-value column here?"**: see what the server offers before you ask for it to be installed.
- **Getting to know a database**: the extensions it uses say a lot about what it does (PostGIS: maps; pg_partman: partitions; pg_stat_statements: someone watches performance).

## How to read it

Installed extensions first (those with an update at the very top), then the ones the server offers but this database has not installed:

| Column | Meaning |
|---|---|
| extension | Its name. |
| installed | The version in this database; empty when not installed. |
| available | The version the server's files offer. |
| status | `update available`, `installed`, `not installed`, or `installed, no longer offered`: the server's files for it are gone, as after an upgrade that left an extension out. |
| schema | Where its objects live. |
| description | What it is for, in the extension's own words. |
| statement | `ALTER EXTENSION ... UPDATE;` for an update, `CREATE EXTENSION ...;` for an install. |

## Try it

Open the **Extensions** side tab, find **PostgreSQL extensions** and press its **Run**. Copy a statement from the grid into a script and run it there, at a moment you choose: an update can take a lock and, on a large database, run for a while.

To see an update waiting on a **test database**, install an older version on purpose:

```sql
create extension hstore version '1.7';
-- run PostgreSQL extensions: hstore is at the top, "update available"
alter extension hstore update;
```

## Good to know

The list is per database: an extension installed in another database of the same server shows as `not installed` here. It reads `pg_extension` and `pg_available_extensions`, and only reads. The Marketplace's own extensions that need a PostgreSQL extension (PostGIS, pgvector, TimescaleDB, Citus) say which in their requirements.

## Requirements

PostgreSQL 13 or newer. Reading the list needs no privilege; running the statements needs the right to create in the database, and a superuser for an extension that is not marked trusted.
