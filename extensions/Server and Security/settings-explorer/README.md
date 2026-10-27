# Settings explorer

`SHOW ALL` answers three hundred and more parameters, and the few that differ are what you opened it for. The **Settings** tab beside the grid shows those: what your session changed, with the `RESET` that undoes it, and what the server sets apart from the built-in values.

![Settings explorer on SHOW ALL: 360 parameters, 3 changed in this session and 17 set for this server. Changed in this session: jit off where RESET gives on, random_page_cost 1.1 where it gives 4, work_mem 64MB where it gives 4MB, each with its RESET to copy. Set for this server: client_encoding UTF8, commit_timestamp_buffers 256kB, default_text_search_config english, the lc_ settings en_US.utf8 and listen_addresses *, the last a restart away](media/settings-explorer.webp)

Three `SET`s and a `SHOW ALL`: of 360 parameters, the three this session changed come first, each with what `RESET` gives back, and below them what this server (a Docker image) sets apart from PostgreSQL's built-in values, `listen_addresses` among them, which changes only with a restart.

## What it is for

- **What did I change?** After a few `SET`s in a script, the parameters your session holds that `RESET` would give back, each with its `RESET` to copy.
- **How is this server set up?** Everything the configuration file, `ALTER SYSTEM`, the database or your role sets apart from PostgreSQL's built-in values: what it is set to, what it would be, and where it changes (any session, a reload, a restart).
- **What is waiting for a restart?** On a `pg_settings` result, the parameters changed in the configuration that take effect only after the next restart.

## Try it

```sql
set work_mem = '64MB';
set jit = off;
show all;
```

The result's **Settings** tab lists `work_mem` and `jit` under **Changed in this session**, each with `RESET work_mem` and `RESET jit` to copy (or **Copy the RESETs** in the header for all of them), and under **Set for this server** what the server runs with beyond the defaults. The box at the top finds a parameter by name.

`select * from pg_settings` works the same way, and adds **Waiting for a restart** from its `pending_restart` column.

## What it reads

The result's parameter names, and their facts from PlumeSQL, which already holds them: the value in the session the result came from, what `RESET` gives and the built-in value, and where each one changes. Nothing more is asked of the server.

## Requirements

PostgreSQL 13 or newer, and PlumeSQL 0.29.0 or newer, which hands a view the server's parameters.
