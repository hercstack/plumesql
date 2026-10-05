<div align="center">

<img src="docs/images/logo.png" alt="PlumeSQL" width="96" height="96" />

# PlumeSQL

**Turn SQL into tools.**

A desktop IDE for PostgreSQL, where a SQL file can become a monitor,
a dashboard or a button.

[Download](https://github.com/hercstack/plumesql/releases) ·
[plumesql.com](https://plumesql.com) ·
[Videos](https://www.youtube.com/@plumesql) ·
[Extensions](extensions/) ·
[Discussions](https://github.com/hercstack/plumesql/discussions)

Free · No account · macOS, Windows, Linux

<a href="https://www.youtube.com/watch?v=HlLU1z-JeoY"><img src="docs/images/intro.webp" alt="PlumeSQL in 90 seconds: watch on YouTube" width="720" /></a>

</div>

## Why PlumeSQL

- **Connections found in your project.** `.env`, `appsettings.json`,
  docker-compose, Django, Prisma, Rails, Spring: nothing to type.
- **Completion that understands your query.** PostgreSQL's own parser
  reads the statement, so completion works inside nested subqueries,
  CTEs and the aliases you just typed.
- **PL/pgSQL checked as you type.** Function bodies are checked against
  your real server, without creating anything.
- **Your session, honestly.** A temp table or a table created in an
  open transaction is right there in the object tree and in completion.
- **Results of any size.** Millions of rows, kept whole on disk and
  scrolled smoothly; edit rows in place and follow foreign keys.
- **A console over your results.** JavaScript under the Log, with the
  last result, the open tab and the database at hand.
- **Your database as files.** The object browser is a DDL snapshot on
  disk, one file per object, to search and compare without a query.
- **A guard on production.** Reading runs as ever; a statement that
  changes data asks first.
- **SQL that becomes a tool.** Save a query as a query extension and a
  few comments add inputs, row buttons, a refresh timer and charts.
- **Find an extension for the job, or write your own.**
- **In the desktop app, or in your browser.** The same PlumeSQL runs in
  a tab of the browser you already have: `plumesql -browser .`
- **Feels like VS Code.** Its editor, its shortcuts, its command palette,
  one title row with the menus on Windows, and Import from VS Code for
  your settings, theme and connections.

## Turn SQL into tools

A query extension is a SQL file (`lock-monitor.plumesql.sql`) with a few
`@` comments:

```sql
-- @description Backends waiting on a lock, and the one holding it
-- @refresh 5s
select w.pid as waiter, b.pid as blocker, w.query as "waiting query"
from pg_catalog.pg_stat_activity w
     join lateral pg_catalog.unnest(pg_catalog.pg_blocking_pids(w.pid)) as bp on true
     join pg_catalog.pg_stat_activity b on b.pid = bp;

-- @button terminate
-- @confirm Terminate backend $blocker? Its open transaction is rolled back.
select pg_catalog.pg_terminate_backend($blocker);
```

That is a live lock monitor with a Terminate button on every row.

**SQL → annotations → a tool → shared.** Publish it to the Marketplace
and anyone can install it. The format is open:
[ACTIONSPEC.md](docs/ACTIONSPEC.md).

## Need a tool? Search the extensions.

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
JavaScript view over a result. Start with
[extensions/README.md](extensions/README.md).

## See it in action

- [PlumeSQL in 90 seconds](https://www.youtube.com/watch?v=HlLU1z-JeoY)
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

## Built for PostgreSQL

PlumeSQL does not try to be a universal database client. It goes deep on
PostgreSQL: its parser, catalogs and sessions, PL/pgSQL, and extensions
like PostGIS, pgvector, TimescaleDB and Citus. If PostgreSQL is your
database, PlumeSQL is built around the way you work with it.

## Core philosophy

- **Extensible by anyone.** What a team needs is usually specific to that
  team, so tools are plain files: easy to write, share and read before
  you run them.
- **Your machine, your data.** No account, no telemetry, nothing in the
  cloud. Passwords live in your project files or an encrypted vault.
- **Light.** It opens in a moment and gets out of the way.

## Tech

- **Go server:** connections over the PostgreSQL wire protocol, DDL
  rendering, the vault. Localhost only, behind a token minted at launch.
- **Svelte 5 interface with Monaco**, the editor inside VS Code.
  PostgreSQL's real parser (libpg_query) and a tree-sitter grammar run
  in WebAssembly.
- **Tauri shell** with the system webview: no bundled browser, no Java.
- **The object browser is a DDL snapshot on disk**, so browsing costs
  the server nothing. Tested against PostgreSQL 13 to 18.

A 14 MB download, 37 MB installed, the server ready about 40 ms after
launch (M4 Pro MacBook).

## Install

Download from [Releases](https://github.com/hercstack/plumesql/releases):

| Platform | Package |
|---|---|
| macOS, Apple Silicon | `.dmg` |
| Windows | `.msi` or setup `.exe` |
| Linux | `.deb`, `.rpm` or `.AppImage` |

The app updates itself. What is new in each release is in
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

## Privacy

No account, no telemetry. Your connections and data stay on your
machine; passwords never reach the interface. PlumeSQL goes online only
for updates and release notes, the extension catalog and the video
list, and YouTube when you press play. Signing in to GitHub, to comment
on extensions, is optional.

## Help

- Questions and ideas: [Discussions](https://github.com/hercstack/plumesql/discussions)
- Bugs: [Issues](https://github.com/hercstack/plumesql/issues), or Report a Bug in the app
- Security: [SECURITY.md](SECURITY.md)

## License

Everything in this repository (extensions, specifications) is
[MIT](LICENSE). The PlumeSQL app is free to use and closed source; its
terms are on [plumesql.com](https://plumesql.com).
