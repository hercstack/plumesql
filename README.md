<div align="center">

<img src="docs/images/logo.png" alt="PlumeSQL" width="96" height="96" />

# PlumeSQL

**Turn SQL into tools.**

A desktop IDE for PostgreSQL, where a SQL file can become a monitor,
a dashboard or a button.

[Download](https://github.com/hercstack/plumesql/releases) ·
[Videos](https://www.youtube.com/@plumesql) ·
[Extensions](extensions/) ·
[Discussions](https://github.com/hercstack/plumesql/discussions)

</div>

This SQL file is a lock monitor:

```sql
-- @description Backends waiting on a lock, and the backend holding it
-- @refresh 5s
select w.pid as waiter, b.pid as blocker, w.query as "waiting query"
from pg_catalog.pg_stat_activity w
     join lateral pg_catalog.unnest(pg_catalog.pg_blocking_pids(w.pid)) as bp on true
     join pg_catalog.pg_stat_activity b on b.pid = bp;

-- @button terminate blocker
-- @confirm Terminate backend $blocker? Any transaction it holds is rolled back, which is what releases the lock.
select pg_catalog.pg_terminate_backend($blocker);
```

It refreshes every five seconds and puts a Terminate button on every
row, which asks before it acts:

<img src="extensions/Activity%20and%20Locks/blocking-locks/media/blocking-locks.webp" alt="The lock monitor running: a blocked backend's row, its Terminate button, the confirmation, and the row gone" width="720" />

The full version, which also opens everything a blocker holds up, is
the [blocking-locks](extensions/Activity%20and%20Locks/blocking-locks/)
extension.

**Free, no account, for macOS, Windows and Linux.** The app is closed
source; the extensions and specifications in this repository are
[MIT](LICENSE). Made by Vedran Bilopavlović, author of
[NpgsqlRest](https://github.com/NpgsqlRest/NpgsqlRest), and Kristijan
Soldo.

## Deep on PostgreSQL

PlumeSQL does not try to be a universal database client. It uses
PostgreSQL's own parser, catalogs and sessions, and goes deep where
general-purpose clients stay shallow:

- **EXPLAIN that points at the problem.** The
  [explain-plan](extensions/Performance/explain-plan/) extension draws
  the plan and lists the facts worth a look first: a step taking a fifth
  of the time or more, row estimates off by ten times or more, a sort or
  a hash that spilled to disk, a bitmap gone lossy. EXPLAIN ANALYZE of a
  statement that writes runs inside a rollback.
- **PL/pgSQL checked as you type.** The statements in a function body
  are checked by your real server without creating anything, so a
  missing table shows before the function ever runs. plpgsql_check
  style warnings (unused variables, unreachable code, a missing RETURN)
  come without installing the extension.
- **A guard on production.** A script that declares `-- @readonly` has
  PostgreSQL itself refuse any write. An UPDATE or DELETE without WHERE
  is marked red before it runs, and COMMIT can ask first and show what
  the transaction changed. On a Production connection, reading runs as
  ever and a statement that changes data asks first.
- **The tree and completion see your session.** They read through the
  editor's own session: a temp table, or a table created in a
  transaction you have not committed, is right there in the object tree
  and in completion. Roll back and it is gone.

## Who makes it

PlumeSQL is made by [Vedran Bilopavlović](https://github.com/vbilopav)
and [Kristijan Soldo](https://github.com/kristijansoldo).

Vedran has worked with databases for 30 years and wrote
[NpgsqlRest](https://github.com/NpgsqlRest/NpgsqlRest), which serves
PostgreSQL functions, tables and SQL files as a REST API. PlumeSQL's
comment annotations are the same idea as NpgsqlRest's
([ACTIONSPEC.md §14.1](docs/ACTIONSPEC.md#141-other-vocabularies)).

Nothing here locks you in: a tool is a plain SQL file you can read and
run anywhere, and its format is an MIT specification. Every query
extension in this repository runs on PostgreSQL 13 to 18, TimescaleDB
and Citus on each push:

[![execute](https://github.com/hercstack/plumesql/actions/workflows/execute.yml/badge.svg)](https://github.com/hercstack/plumesql/actions/workflows/execute.yml)

## Install

Download from [Releases](https://github.com/hercstack/plumesql/releases):

| Platform | Package |
|---|---|
| macOS, Apple Silicon | `.dmg` |
| Windows | `.msi` or setup `.exe` |
| Linux | `.deb`, `.rpm` or `.AppImage` |

The app updates itself, and checks each update's signature before
installing it. What is new in each release is in
[`changelog/`](changelog/).

The macOS build is not notarized yet: open it once with right click and
Open, or run

```sh
xattr -dr com.apple.quarantine /Applications/PlumeSQL.app
```

The Windows installer is not signed yet: if SmartScreen stops it, choose
More info and Run anyway.

### From the command line

The Welcome tab adds a `plumesql` command to your shell. Then:

```sh
plumesql .                         # this folder, in the desktop app
plumesql -browser .                # this folder, in a browser tab
plumesql postgres://user@host/db   # open and connect, like psql
plumesql --help                    # everything else
```

## What else it does

- **Connections found in your project.** `.env`, `appsettings.json`,
  docker-compose, Django, Prisma, Rails, Spring: nothing to type.
- **Completion that understands your query.** PostgreSQL's own parser
  reads the statement, so completion works inside nested subqueries,
  CTEs and the aliases you just typed.
- **Refactors a click away.** The lightbulb beside each statement
  rewrites it for you: join a related table along its foreign key, fix
  an ambiguous column, preview the rows a DELETE would touch, turn an
  INSERT into an upsert, query JSON with containment. Extensions add
  their own, for PostGIS, pgvector and TimescaleDB.
- **psql's commands in the editor.** `\d`, `\dt`, `\df`, `\sf` and
  `\conninfo` answer right under the line, and the Log's console speaks
  psql too.
- **Results of any size.** Millions of rows, kept whole on disk and
  scrolled smoothly; edit rows in place and follow foreign keys.
- **A console over your results.** JavaScript under the Log, with the
  last result, the open tab and the database at hand.
- **Your database as files.** The object browser is a DDL snapshot on
  disk, one file per object, to search and compare without a query.
- **In the desktop app, or in your browser.** The same PlumeSQL runs in
  a tab of the browser you already have: `plumesql -browser .`
- **Feels like VS Code.** Its editor, its shortcuts, its command palette,
  one title row with the menus on Windows, and Import from VS Code for
  your settings, theme and connections.

## Extensions

Need a tool? Search the extensions first:

- **DBAs:** [lock monitor](extensions/Activity%20and%20Locks/blocking-locks/),
  [slow queries](extensions/Performance/top-queries/),
  [table bloat](extensions/Storage%20and%20Maintenance/table-bloat/),
  [health check](extensions/Server%20and%20Security/health-check/),
  [backup](extensions/Backup%20and%20Tools/backup/) and
  [restore](extensions/Backup%20and%20Tools/restore/)
- **Developers:** [visual EXPLAIN](extensions/Performance/explain-plan/),
  [query to CSV](extensions/Backup%20and%20Tools/query-to-csv/),
  [rows as SQL](extensions/Reshape/rows-as-sql/)
- **Data people:** [charts](extensions/Charts/echarts/),
  [dashboards](extensions/Dashboards/kpi-cards/),
  [PostGIS viewer](extensions/PostGIS/postgis/),
  [pgvector explorer](extensions/pgvector/pgvector/)

Install them from the Extensions tab in the app. Extensions are just
files: readable before you install them, editable and shareable, with no
plugin SDK to learn.

**Can't find it? Write one:** a SQL file, a command, or a small
JavaScript view over a result. A few `@` comments add inputs, row
buttons, a refresh timer and charts to a query; publish it to the
Marketplace and anyone can install it. Start with
[extensions/README.md](extensions/README.md); the format is open:
[ACTIONSPEC.md](docs/ACTIONSPEC.md).

## See it in action

- [PlumeSQL in 90 seconds](https://www.youtube.com/watch?v=HlLU1z-JeoY)
- [Refactorings: the lightbulb rewrites SQL for you](https://www.youtube.com/watch?v=-sZ1rtXzpt8)
- [Query extensions: SQL files with annotations](https://www.youtube.com/watch?v=f_ZE0SI1myU)
- [DBA tools as extensions](https://www.youtube.com/watch?v=erkLWykPNwQ)
- [A grid for millions of rows](https://www.youtube.com/watch?v=6KUaK5CGuvU)
- [EXPLAIN and the plan visualizer](https://www.youtube.com/watch?v=ukZQH5uEfOc)
- [Charts over your query results](https://www.youtube.com/watch?v=EnEd-aN30nU)

More, about a minute each:
[Connections and objects](https://www.youtube.com/playlist?list=PLaGGK16T-VQw) ·
[The SQL editor](https://www.youtube.com/playlist?list=PLSE-xanBhbd8) ·
[Data and the grid](https://www.youtube.com/playlist?list=PLT3-TpTaniTc) ·
[Annotations and extensions](https://www.youtube.com/playlist?list=PLOpBX3NpZSy0) ·
[PostgreSQL extensions](https://www.youtube.com/playlist?list=PLHw_hYKYYgq4) ·
[Workspace](https://www.youtube.com/playlist?list=PLaIRU3PzWLLA)

## Tech

- **Go server:** connections over the PostgreSQL wire protocol, DDL
  rendering, the vault. Localhost only, behind a token minted at launch.
- **Svelte 5 interface with Monaco**, the editor inside VS Code.
  PostgreSQL's real parser (libpg_query) and a tree-sitter grammar run
  in WebAssembly.
- **Tauri shell** with the system webview: no bundled browser, no Java.
- **The object browser is a DDL snapshot on disk**, so browsing costs
  the server nothing. Tested against PostgreSQL 13 to 18.

A 14 MB download (85 MB for the Linux AppImage), 37 MB installed, the
server ready about 40 ms after launch (M4 Pro MacBook).

## Privacy

No account, no telemetry. Your connections and data stay on your
machine. Passwords live in your project files or an encrypted vault, and
never reach the interface. PlumeSQL goes online only for updates and
release notes, the extension catalog and the video list, and YouTube
when you press play. Signing in to GitHub, to comment on extensions, is
optional.

## Help

- Questions: [Q&A in Discussions](https://github.com/hercstack/plumesql/discussions/categories/q-a)
- About an extension: its own thread under
  [Extensions](https://github.com/hercstack/plumesql/discussions/categories/extensions),
  where the comments from its page in the app also go
- Bugs: [Issues](https://github.com/hercstack/plumesql/issues), or Report a Bug in the app
- Security: [SECURITY.md](SECURITY.md)

## License

Everything in this repository (extensions, specifications) is
[MIT](LICENSE). The PlumeSQL app is free to use and closed source; it
shows its terms on first run.
