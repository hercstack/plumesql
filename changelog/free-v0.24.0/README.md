# PlumeSQL 0.24.0

## Highlights

Our biggest release so far:

- **One script, several servers**, each part on its own connection.
- **A smarter lightbulb** that reads your data and learns from extensions.
- **PostgreSQL on your machine**: find your servers, get a new one, run
  the client tools in Docker.
- **Extensions you can trust**: see what one can do before you install it.
- **3D views and a real map** in the Marketplace.
- **Terminals in tabs** that tell you what runs in them.

New features come first, grouped by theme. Then **What changed** and
**Fixed**. A click on an extension's name opens its page in a new tab.

## One script, several servers

### Several connections in one script

Put a `-- @connection` line with a connection's name between two
statements, and everything below it runs on that connection:

```sql
-- @connection shop
select status, count(*) as orders from orders group by status;

-- @connection analytics
select count(*) as tables from pg_catalog.pg_tables;
```

![Three parts of a script, on shop, analytics and archive, each with a band in its connection's color](media/sections.png)

- Each part wears a colored band in its connection's color.
- The toolbar, completion, checks and the lightbulb follow your cursor's
  part.
- Run several parts at once: each runs on its own server, in order, and
  every result names its connection.
- Moving between parts keeps every connection open, transactions too.
- The text above the first `@connection` line runs on the connection you
  pick in the toolbar.

![The results, each header naming its connection: shop, then analytics](media/sections-results.png)

### Name a server by URL

`@connection` also takes a URL, for a server you have no connection for:

```sql
-- @connection postgres://app:${APP_PASSWORD}@db.local:5432/orders
```

Each `${NAME}` comes from your workspace's `.env` files or your
environment, so the password stays out of the script. Your environment's
values are never sent to a server the script names, unless it is your
own machine.

### See where a script runs

Every script in the Explorer shows a dot for each connection it uses:
green while connected, grey when not, red when the server does not
answer. Hover them for the list. Turn them off from the Explorer's menu.

![The Explorer: sales.sql with a green and a grey dot for its two connections, today.sql and remote.sql with one dot each](media/explorer-dots.png)

### A server that is down says so

A part whose server does not answer gets a dashed band and reads *not
answering*. The Log writes one message for the whole script, with a
**Go to line** button for each part.

### Parts in the Outline

The Outline starts each part with a row naming its connection, its state
and its lines.

## A smarter lightbulb

Press Ctrl+. (⌘. on macOS), or click the lightbulb.

### Build a table

On a `CREATE TABLE`: **Add a column…**, **Add an identity primary key**,
**Add created_at and updated_at** and **Add a reference to a table…**.

### Changes that read your results

These appear once the query has run:

- **Add the keys of payload as columns**: a JSON column's keys as
  columns.
- **Count by status**: your rows counted per value, in a query above.
- **Cast ordered to date**: when every value of a text column is a date
  (or a number, or a boolean).
- **Update this row** and **Delete this row**: for a query that returned
  one row.

![The list of payload's keys, each with its kind, all checked](media/json-keys.png)

![The list after a run: Cast ordered to date, Cast total to numeric, Count by status](media/data-refactors.png)

![An UPDATE of order 7 written below the query, every column with its current value](media/row-update.png)

### The index you are missing

A filter on a large table with no fitting index offers **Add an index on
… above**. What counts as large is yours to set.

![The lightbulb on a filter on events.customer_id, offering Add an index on events (customer_id) above](media/index-refactor.png)

### Window functions and statistics

Two new extensions write the SQL you usually look up:

- **[Window function refactors](https://github.com/hercstack/plumesql/tree/main/extensions/Calculations/window-refactors)**:
  running totals, moving averages, ranks, shares, top rows per group.
- **[Statistics refactors](https://github.com/hercstack/plumesql/tree/main/extensions/Analysis/statistics-refactors)**:
  describe a column, correlate, trend, histogram, outliers.

![The lightbulb on an amount column, offering a running total, a moving average, a share and a rank](media/window-refactors.png)

### More from PostGIS, pgvector and TimescaleDB

Update these three for their new changes:

- **[PostGIS refactors](https://github.com/hercstack/plumesql/tree/main/extensions/PostGIS/postgis-refactors)**:
  Transform to WGS 84, Rows within 1 km, Bounding box.
- **[pgvector refactors](https://github.com/hercstack/plumesql/tree/main/extensions/pgvector/pgvector-refactors)**:
  Order by nearest, an HNSW index.
- **[TimescaleDB refactors](https://github.com/hercstack/plumesql/tree/main/extensions/TimescaleDB/timescaledb-refactors)**:
  Average per time bucket.

![The lightbulb on a query over stores, offering Transform to WGS 84 (from EPSG:3857)](media/postgis-transform.png)

### Refactors that find you

A query over a vector, a geometry, a TimescaleDB table or a number column
offers to install the refactors that fit. Not interested? **Don't
suggest it again**.

### Which extension offered it

A change an extension offered carries a small cube at the end of its
row. Click it to open the extension's page.

### Options for refactor extensions

Extensions can have options, set in the Refactors settings or on their
page. Set the PostGIS distance to 500 and you get **Rows within 500 m**.

### A dot for what is new

A small blue dot on the lightbulb means something new appeared in its
list, for example after the query ran.

![The lightbulb with a small blue dot at its top right](media/bulb-dot.png)

### Refactors in the Outline

Hover a statement in the Outline for the same lightbulb, or show the
changes as rows under each statement.

![The Outline: a statement's row with its Format and lightbulb buttons](media/outline-lightbulb.png)

### Refactors settings, organized

The settings follow the lightbulb's groups, each with a switch for the
whole group, and fold away. Every change shows an example of what it
writes.

![The Refactors settings: Quick Fix and Extract groups with their switches, each change with an example](media/refactor-settings.png)

## Writing and running SQL

### Joins as you type

After `FROM` a table, completion offers the joins its foreign keys make,
written out whole. It works for PostgreSQL's own catalogs too.

![After from orders o, the completion list offers join customers c on c.id = o.customer_id, explaining why an inner join loses nothing](media/join-completion.png)

### More phrases completed

Completion also finishes the `ON` of a join, an `INSERT`'s columns, the
upsert after `ON CONFLICT`, `EXISTS` and the subquery after `IN`.

### Format your way

Formatting asks how: **Default**, **Compact**, **Expanded**, the other
keyword case or comma style, or your own named variants. The Outline
offers the same. Turn off **Ask how to format** to skip the question.

![The format list: Default, Compact, Expanded, Uppercase Keywords, Leading Commas and Formatting Settings](media/format-variants.png)

### A button on each line of the margin

The margin beside a statement has a button per line: the lightbulb,
then **Format**. Pick what each line holds (Run, Explain, Select, Copy,
Format) from **Gutter** in the toolbar. With no lightbulb in the margin,
**Floating Lightbulb** shows one in the code, as VS Code does.

### Foreign data wrappers

Servers show their user mappings (without passwords) and details,
right-click writes `CREATE SERVER`, `CREATE USER MAPPING` and `IMPORT
FOREIGN SCHEMA`, and completion knows the wrappers' options.

## Connections and passwords

### Asked for the password when it is needed

A server that wants a password asks for it. **Save it in the Vault**
keeps it, for discovered connections too.

### No password

Mark a server that needs no password, and PlumeSQL never asks.

### Passwords from a command

Use your cloud's access token or your password manager. PostgreSQL 18's
OAuth sign-in works too.

### A failed connection says who tried

The Log says what was connecting (a tab, a check, a refresh, an
extension), with links to the connection and the file.

### Where a discovered connection comes from

A `.env` that defines connections wears each one's elephant in the
Explorer. Picking a discovered connection lights up its file, and its
settings say where the values come from, with **Open .env**.

### New Script on a connection

From a connection's row in the Connections tree and from the object
browser.

## PostgreSQL on your machine

### Your local servers

The System page lists the servers on your machine, installed or in
Docker, without connecting. Add one to the Vault under a name you
choose, or write it to a `.env` file.

![Local servers on the System page: a server in Docker with Add to Vault and Create .env](media/local-servers.png)

### Get a server

No PostgreSQL yet? Start a sample database (Pagila, Chinook, an airline
demo, pgbench) or an empty server in Docker. You read the script first,
and the connection lands in your Vault. No Docker? Install with
Homebrew, apt, dnf or winget.

![The Get a server section: sample databases, each started in Docker with Get](media/get-a-server.png)

### Client tools in Docker

Any version of psql, pg_dump and pg_restore without installing anything.
A server running in Docker uses its own image's tools.

### Choose the client tools

Pick which tools a server version, a connection or a group uses, from
the ones new enough for that server.

### See the command first

Everything PlumeSQL would install shows the exact command first, with
**Copy** to run it yourself.

## Extensions you can trust

### See what an extension can do

PlumeSQL reads an extension's code and tells you before you install it:
reads only, changes data, runs psql on your machine. An update that can
do more says what is new.

![The install question: Install Psql 1.0.0? It runs psql on your machine and gets your connection's password, with Show code](media/install-question.png)

### Every install asks first

With **Show code**, **Show changes** for an update, and the extensions
that come along. **Don't ask again for** a kind, a category, a source or
an author you trust.

### Read the code that is coming

**View Source** shows the code an install would bring, and F12 on an
import opens that file too.

### Try before you install

Try a chart on your last result straight from the Marketplace, with the
flask button beside Install.

### Roll back an update

Liked the old version better? **Roll Back** puts it back.

### Restore a changed extension

If an extension's files change on disk, PlumeSQL stops running it and
offers **Restore**.

### Every update in one place

**Installed** starts with an **Updates** group, and **Update all** lists
what it brings before it updates everything.

### Recommendations explained

Every recommended extension says why, such as **postgis on gisdemo**. A
pack is reviewed on its page, and **Install all** lists everything first.

### Sort any list

Every list in the Extensions side tab has a sort button: by category,
name, downloads or likes.

### An extension's menu on a right-click

Right-click anywhere on an extension's page for its own menu.

## New in the Marketplace

### 3D views

Orbit and zoom with the mouse:

- **[Scatter 3D](https://github.com/hercstack/plumesql/tree/main/extensions/Charts/scatter-3d)**:
  three numbers at once, a point per row.
- **[3D Bars](https://github.com/hercstack/plumesql/tree/main/extensions/Charts/bars-3d)**:
  two categories and a number as the height.
- **[City 3D](https://github.com/hercstack/plumesql/tree/main/extensions/Charts/city-3d)**:
  rows as buildings in districts.
- **[Vector Space 3D](https://github.com/hercstack/plumesql/tree/main/extensions/pgvector/vector-space-3d)**:
  pgvector embeddings, clusters and outliers.
- **[Query landscape](https://github.com/hercstack/plumesql/tree/main/extensions/Performance/query-landscape)**:
  your costliest statements standing out.
- **[Storage city](https://github.com/hercstack/plumesql/tree/main/extensions/Storage%20and%20Maintenance/storage-city)**:
  your tables as buildings, by size and dead rows.

![City 3D: films as buildings in districts by category, colored by rental rate](media/city-3d.webp)

### A real map

**[Map](https://github.com/hercstack/plumesql/tree/main/extensions/PostGIS/postgis-map)**
puts a PostGIS result on a real map, from a host you allow, and keeps
what it loaded for offline use.

![Map: a hexagon grid over Zagreb, each hexagon raised and colored by its number of shops](media/map.webp)

### New packs

**[pgvector essentials](https://github.com/hercstack/plumesql/tree/main/extensions/Packs/pgvector-essentials)**
is new, and **[Data analysis](https://github.com/hercstack/plumesql/tree/main/extensions/Packs/data-analysis)**
now brings the window function and statistics refactors.

### For extension authors

Refactors get the last result's rows, the query's shape and options of
their own, and can suggest themselves. The specification has the
details.

## Terminals in tabs

### Every terminal is a tab

The bottom panel shows a tab for each terminal, beside the Log, and
**+** opens another.

![Two terminals in the bottom panel, one named after the ping running in it, and a terminal in an editor tab](media/terminal-tabs.png)

### Move a terminal where you want it

The arrow on a terminal's tab moves it to the editor area, and **Move to
Panel** brings it back. What runs keeps running.

### See what runs in a terminal

A terminal's tab is named after the program running in it, with a
running stripe.

### Nothing stops by accident

Closing a terminal, or quitting PlumeSQL, asks first while a program
runs.

![Stop sleep? The question before closing a terminal with a program at work, with Move to Panel](media/terminal-stop.png)

## Easier to read and find

### Page text size

Make the text of Settings, System, extension pages and these notes
larger: right-click any page, or use the command palette.

### Show one section

**Show only**, at the end of a section's title, shows that section
alone on any page with sections.

### Links open in new tabs

Middle-click a link, or hold ⌘ (Ctrl) as you click, and it opens in a
new tab while you keep reading.

### Search every page

Settings, System, a connection's settings, an extension's page and these
notes have a search box in their header. It marks every place your words
stand, says how many there are, and steps through them with the arrows,
Enter or Shift+Enter, like find in the editor. ⌘F (Ctrl+F) puts you in
the box.

![The System page searched for docker: 2 of 13, every place marked, the one looked at brighter, the sections without it left out of the list](media/page-search.png)

### Talk about a release under its notes

These release notes end with a **Discussion**: read what others say
about this release, and sign in with GitHub to comment or reply right
here. The notes also got a list of their sections, a search, and links
that open an extension's page.

### Settings linked from System

The System page shows the settings behind what it describes, each a
click away.

## What changed

### Updates wait for you

No more dialog at startup. The Log says a new version is out, the
feather in the side bar gets a badge, and you install when it suits you.

![The feather with its badge, and Install Update 0.24.0 and Restart in its menu](media/update-menu.png)

![The Log entry: PlumeSQL 0.24.0 is available, with Install and Restart](media/update-log.png)

### Fewer lightbulbs

The lightbulb shows only on the statement under your cursor and under
your mouse. **Gutter → On Every Statement** brings them all back.

![A yellow lightbulb on the statement with the cursor, a grey one on the statement under the mouse, none on the others](media/gutter.png)

### The lightbulb's list in groups

Quick Fix, Extract, Inline, Rewrite, Write a Statement. It also looks
like PlumeSQL's other menus now.

### A calmer row above each statement

**Run**, **Explain**, **Select** and **Copy**. Format and Refactor can be
turned on from its ⚙ menu.

### Many commands, one readable result

A long script of small commands no longer splits the results into
slivers. Results are numbered like their commands, and **Messages** is
one list for the whole run.

![Results of a long script: #4 SELECT t_city, #6 SELECT t_city and #8 SELECT orders, numbered like their commands](media/many-results.png)

### Larger text on every page

Settings, System, extension pages, About, Welcome and these notes read
a step larger.

### Every page with sections reads the same way

Section titles stay at the top as you scroll, and the list of sections
looks the same everywhere.

### Global-only settings in the Workspace tab

The settings that have one value everywhere, such as the theme, now show
in the Workspace tab too, with **Change in Global**.

### Your PGPASSWORD goes only where it should

It is offered to your own connections and local servers only, never to a
server a cloned project names.

### The install question waits for you

Open an extension's page from the question, and the question is still
there when you come back.

### Related extensions, explained

An extension's page lists related extensions in a section of their own,
each saying why, and **Show code** sits beside **Install**.

### Settings entries ask which scope

The lightbulb's **Refactor Settings** and the format list's **Formatting
Settings** ask Workspace or Global, like every other menu.

### PostgreSQL docs links open in your browser

The PostgreSQL docs links in the settings are plain links again, opened
by your browser.

### A side pane's own menu

Right-click a side pane's empty space for that pane's menu.

### Explorer marks by kind

The Explorer colors a file's mark by its kind: an `.env` no longer looks
like a script.

### The release notes and videos in System

They are listed with the other caches, and can be cleaned.

### The plumesql command, checked again

It is checked once more and added if missing, and every update keeps it
working.

## Fixed

- **Windows terminal.** The terminal in the Windows desktop app stayed
  empty.
- **Foreign tables.** A foreign table whose server is down no longer
  disconnects your tab.
- **Error details.** Failed queries show the server's DETAIL and HINT in
  the Log.
- **Foreign data wrapper statements.** Results and the Outline name them
  by what they create.
- **Lightbulb changes.** Each was checked against a real server, and the
  ones that broke a query are fixed.
- **JSON changes.** They now work on a subquery, a CTE, a `UNION` and a
  `VALUES` list.
- **Lightbulb list position.** It opens beside the lightbulb, not at the
  end of a long line.
- **Lightbulb list width.** Long items are no longer cut short.
- **Read-only connection settings.** They now fold with a line saying
  why, instead of a wall of greyed fields.
- **Section list.** It now lights the section you are reading.
- **Scroll position.** Pages reopen where you were reading.
- **Result view tabs.** A view opened in its own tab keeps the script's
  inputs and title.
- **File icon themes.** A package with only icons now offers **Preview**
  and **Use**.
- **Open VSX Themes.** A click on a theme keeps the list open.
- **Extension search.** The exact name you typed comes first.
- **Welcome tab.** Installing from it now asks first.
- **Extension kinds.** An update that changed an extension's kind now
  loads it right.
- **Removed extensions.** A result that refreshed on a timer no longer
  fills the Log.
- **Update diffs.** A stray error no longer appears when an update lands.
- **Hidden menus.** A menu opened while the Log showed could stay hidden.

## Tell us what you think

Questions and ideas go to
[Discussions](https://github.com/hercstack/plumesql/discussions), bugs to
[Issues](https://github.com/hercstack/plumesql/issues) or Report a Bug in
the app's menu. The video tour is on
[YouTube](https://www.youtube.com/@plumesql).
