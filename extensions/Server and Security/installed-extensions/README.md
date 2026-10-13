# PostgreSQL extensions

The PostgreSQL extensions of the connected database (the `CREATE EXTENSION` kind, not PlumeSQL's): the installed ones first, those with a newer version ready at the top with the statement that updates them, and after them every extension the server offers but this database has not installed, with the statement that installs it.

## What it shows

| Column | Meaning |
|---|---|
| extension | Its name. |
| installed | The version in this database; empty when not installed. |
| available | The version the server's files offer. |
| status | `update available`, `installed`, `installed, no longer offered` (the server's files for it are gone, as after an upgrade without them) or `not installed`. |
| schema | Where its objects live. |
| description | What it is for. |
| statement | `ALTER EXTENSION ... UPDATE;` for an update, `CREATE EXTENSION ...;` for an install. |

## Examples

Run it from the Extensions side tab (**Run**). After a server upgrade the top of the list tells what to update:

| extension | installed | available | status | statement |
|---|---|---|---|---|
| hstore | 1.7 | 1.8 | update available | ALTER EXTENSION hstore UPDATE; |
| pg_trgm | 1.6 | 1.6 | installed | |
| plpgsql | 1.0 | 1.0 | installed | |
| amcheck | | 1.4 | not installed | CREATE EXTENSION amcheck; |

Copy a statement from the grid into a script and run it there, where you choose the moment: an update can take a lock and run for a while on a large database.

## Requirements

PostgreSQL 13 or newer. Reading the list needs no privilege; running the statements needs the right to create in the database (and superuser for an untrusted extension).

## Notes

The list is per database: an extension installed in another database of the same server shows as not installed here. The Marketplace's own extensions that need a PostgreSQL extension (PostGIS, pgvector, TimescaleDB) say which in their requirements.
