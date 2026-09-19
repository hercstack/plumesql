# PlumeSQL 0.22.0

The first public release. Thank you for trying it.

PlumeSQL is a desktop IDE for PostgreSQL with an extension for
everything. It reads your SQL the way the server does, keeps everything
on your machine, and needs no account.

## Worth trying first

- **Open a project folder.** PlumeSQL finds the connections your project
  already describes, in `.env`, `docker-compose.yml`, `appsettings.json`
  and some twenty other formats, without running any of your code.
- **Write a query.** Completion knows your tables, columns, CTEs and
  subquery aliases, because PostgreSQL's own parser reads the statement
  under your cursor.
- **Add an annotation.** A comment like `-- @refresh 5s` or
  `-- @button cancel` above a query turns a script into a small tool with
  a timer or buttons on its rows.
- **Open a function.** The server checks the statements inside its body
  as you type, without creating anything.
- **Run EXPLAIN** from the lens above a statement and read the plan as a
  picture: where the time goes and which estimates were off.
- **Open the Extensions side tab.** 167 extensions, from a health check
  of your database and lock monitors to charts, PostGIS and pgvector
  viewers, and color themes. The Developer essentials and DBA essentials
  packs install a good first set in one go.

## Coming from VS Code

The shortcuts are VS Code's wherever VS Code has one, and Import from VS
Code brings over your settings, keybindings, color theme and the
connections of your SQL extensions. The Welcome tab offers it on the
first start.

## Tell us what you think

Questions and ideas go to
[Discussions](https://github.com/hercstack/plumesql/discussions), bugs to
[Issues](https://github.com/hercstack/plumesql/issues) or Report a Bug in
the app's menu. The video tour is on
[YouTube](https://www.youtube.com/@plumesql).
