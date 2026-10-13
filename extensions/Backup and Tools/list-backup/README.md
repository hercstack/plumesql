# List backup

What a backup file holds, read from its table of contents, without restoring anything.

![The terminal shows pg_restore's listing of demo.dump: created 2026-10-13 from database plumesql_demo, 11 entries, custom format, dumped from PostgreSQL 17.10; then the entries: the schema postgres_air, the tables aircraft and airport, their data and their two primary keys](media/list-backup-toc.webp)

`demo.dump` read in a second: it was taken from the `plumesql_demo` database of a PostgreSQL 17.10 server, and holds one schema, two tables with their rows (`TABLE DATA`) and their two primary keys.

## When to use it

- **Before a restore**: check it is the right file, from the right database, taken when you think it was.
- **Tell two backups apart** that have similar names.
- **Plan a partial restore**: the listing is exactly what `pg_restore --use-list` takes, so you can keep only the lines you want.

## What it does

1. Asks which backup to read: the workspace's files, newest first.
2. Runs `pg_restore --list` on it, in a terminal of its own.

Only the file is read. No database is touched, so it asks nothing first and needs no connection.

## Settings

| Setting | Default | What it does |
|---|---|---|
| dump | asked | The backup file to read, picked from the workspace. |

## Good to know

- Each entry line reads: its number in the archive, two numbers from the server's catalog, then the object's kind (`TABLE`, `TABLE DATA`, `INDEX`, `CONSTRAINT` ...), its schema, its name and its owner. Lines starting with `;` are comments.
- It reads the files **Backup** writes, and any custom, directory or tar format archive from `pg_dump`. A plain SQL dump has no table of contents: open it as a file instead.

## Requirements

A PostgreSQL client installation on this machine with `pg_restore` (System, Client tools).
