# PlumeSQL 0.32.0

You can now edit tables: a table's Design lays out its columns, keys and indexes, and every change
goes into one script you read before anything runs. The owner, the grants and the options of any
object, and a function's own properties, are edited in Properties the same way. Comments are
Markdown everywhere. A result
now says when you changed its query since it ran, a script unfolds into its statements in the
Explorer, a whole script goes on a diagram and a query card there runs any statement, the
Objects tab always shows your script's database, and the PostgreSQL reference in the editor
reads right for JOIN and for the functions written the SQL standard's way.

## Highlights

- **Edit tables:** a table's **Design** lays out its columns, keys and indexes as grids you edit
  in place, and Properties shows everything about the row you pick.
- **Nothing runs unread:** every change goes into one **Changes** script for the connection,
  yours to read and edit, run in one transaction only when you press Run Changes and confirm.
- **Owners, grants and options of any object:** a table, a view, a sequence, a function, a
  schema or a type, edited in Properties: row security, triggers, a view's options, a
  sequence's numbering, an enum's values, a schema's name.
- **A function's properties:** volatility, parallel safety, security and settings in
  Properties, with a word when the body contradicts what the function promises.
- **Move a column:** PostgreSQL cannot, so PlumeSQL rebuilds the table in the new order, keys,
  views, triggers, grants and data included.
- **Comments are Markdown:** several lines, edited in a Markdown editor with its preview, the same
  on every table, column, view, function and type.
- **Results that say when the query changed:** an **Edited** mark on the result, with **Run**
  beside it.
- **A script's statements in the Explorer:** unfold a SQL file and click the statement you want.
- **Objects always shows your script's database:** no pin any more, and a click in Connections
  asks before it moves a script to another connection.
- **Scripts, extensions and files on a diagram:** a whole `.sql` file as a card of its
  statements, a query extension with its buttons and drill-downs, a command, a link to a
  document or another diagram.
- **Query cards that run anything:** a query card follows its script, runs any statement and
  asks its parameters, and `-- Revenue by category` above a query names its card.
- **The reference reads right:** JOIN's hover says what a joined table is, and substring,
  trim or JSON_QUERY show their own signatures and examples.
- **A true Zen Mode:** ⌘K Z gives the file you are in the whole window.

## Editing tables

### A table's Design

A table's tab now has two faces, switched in its header: **DDL**, as before, and **Design**, where
you edit it. Right click a table in the Objects tab and choose **Edit Table**, or use the same
command on a table's card on a diagram, in Properties or in the command palette.

![A table's Design: shop.orders with its schema, name and comment on one line, its columns as a grid with a renamed column and a changed type tinted, a new discount column marked with a plus, and Properties on the right showing everything about the selected status column](media/table-design.webp)

The columns are a grid: name, type, NOT NULL, default, identity and comment, each edited where it
stands. Enter writes a cell and goes down, the arrow keys move between cells, and ⌥↑ and ⌥↓ (Alt
on Windows and Linux) move a column. A changed cell is tinted and a ↺ in it puts back what the
database has. A name, a type or an expression PostgreSQL would not read says so under the cell,
before anything runs.

Below the columns, the keys, checks and foreign keys, then the indexes, are grids too. A key's
columns, a check's expression and an index's keys, method and condition are written in their
cells.

Properties is the inspector: it shows everything about the row you select, including what a grid
has no room for, such as an identity's numbering, a column's collation, a foreign key's target and
actions, or an index's INCLUDE. With no row selected, it shows the table itself: its owner, its
rows, and what stands around it (the foreign keys into it, its triggers, policies and views).

**New Table…** on a schema in the Objects tab, or **New Table Here** on a diagram, opens a new
table on its Design the same way. Its DDL face shows the CREATE TABLE as it will run.

### One script for every change, read before it runs

Nothing you do in a Design reaches the database by itself. Every change goes into the pending
changes of the connection, and **Review Changes** (in the table's header, with how many changes
wait) opens them as one script:

![The Changes tab: the editor toolbar, a line saying 3 changes on 1 table with Run Changes, a shop.orders button with 3 beside it, and the script: a column renamed, then one ALTER TABLE changing a type and adding a column, between BEGIN and COMMIT](media/changes-tab.webp)

The script lists what it changes under its toolbar; click a table to go back to its Design.
Statements that may lose data, may fail on the data or lock a big table say so in a comment above
them. What PostgreSQL would refuse, such as changing the type of a column a view uses, is said
before you run, with the way around it: **Recreate the Views Around It** drops the views and makes
them again after the change, with their grants and comments.

The status bar keeps the count in sight, from any tab:

![The status bar: 3 pending changes](media/pending-status.webp)

It wiggles each time the count grows (in Zen Mode it stands in the title bar), and the first
change you make writes a note in the corner
saying that nothing ran yet, with **Review Changes** on it:

![A note in the corner: Changes pending on postgres: nothing runs until you review them and Run Changes, with Review Changes under it](media/pending-notice.webp)

The script is yours to edit. Type in it and it stops following the Design, the tab says so and
wears the unsaved dot; **Write Again from the Editor** brings the generated script back. ⌘S saves
it as a script file of its own.

**Run Changes** reads the tables again first, so a table that changed on the server since you
began never runs on a stale picture. Then it asks, and runs the script in one transaction on a
connection of its own: everything or nothing. Afterwards the Objects tab and your diagrams catch
up, a diagram follows a renamed table, and the Log offers to update the scripts that still use an
old name. **Checks…** opens read only queries that count the rows a change would fail on (NULLs
under a new NOT NULL, duplicates under a new key), for you to run first.

**Undo** (⌘Z) takes back your last change. **Discard Table Changes** drops everything pending on a
table at once, and the Log keeps an **Undo** that puts it all back.

The way back is where you made the change. Undo and Redo stand beside Review Changes in the header
of every table, function or object you edit, and Properties' **Pending changes** group (Review
Changes, Undo, Redo) heads the page whatever you selected. Right-click the status bar's pending
changes for Review Changes, Undo, Redo or Discard All Changes from any tab, and a pending table's
card on a diagram has Undo and Discard on its own right-click, so you never leave the diagram to
take a change back.

### Moving a column rebuilds the table

PostgreSQL cannot move a column of an existing table. Move one anyway, with ↑ ↓ on its row or ⌥↑ and
⌥↓, and the Design says what that takes:

![Problems: a warning that the columns of shop.orders are in a new order, which PostgreSQL can only make by rebuilding the table under an exclusive lock, with Put the Order Back](media/rebuild-warning.webp)

The script then makes the table again in the new order: a new table, the rows copied under a lock,
the old one dropped and everything that rested on it made again. That is keys, indexes, foreign
keys in both directions, triggers, policies and row security, grants, the owner, statistics,
comments, the views on it, and sequences that keep their names and numbering. A table something
would be lost from, such as one in a publication or one a function's result type is made of, is
refused before the run. **Put the Order Back** undoes the move.

### What the editor knows of your PostgreSQL

The editor writes what your server accepts, from PostgreSQL 13 to 18: virtual generated columns
on 18, a changed generated expression in place on 17, NULLS NOT DISTINCT and ON DELETE SET NULL
on chosen columns on 15, and the rest on every version. It does not edit yet a table's policies,
storage options or partitions, nor a trigger beyond turning it on or off; they are shown, and kept
when a table is rebuilt.

## Editing properties

### Owners, grants and options of any object

Every table, view, materialized view, foreign table, sequence, function, procedure, schema and
type now has an **Owner and grants** group in Properties. PlumeSQL reads them when you press
**Edit Properties**, and then every field is yours: the owner, offered from the roles on the
server, and a row per role with its privileges as buttons to press or release. **Add role** gives
a new role its row, PUBLIC included.

![Properties of shop.orders: the owner postgres, shop_reader holding SELECT, shop_clerk newly given SELECT and UPDATE with its way back, Add role, row security turned on and the orders_touch trigger set to Disabled](media/object-grants.webp)

Each kind brings its own options with it:

- a table: row level security and FORCE, and each trigger Enabled, Disabled, Replica or Always;
- a view: security barrier, security invoker (PostgreSQL 15) and its check option;
- a sequence: its type, increment, bounds, start, cache and cycle, the value it restarts with,
  the column that owns it, and logged or unlogged (PostgreSQL 15);
- an enum: its values renamed, and new ones added where you say ("fine after sad");
- a schema: its name.

They go where every other change goes: into the Changes script, as `ALTER`, `GRANT` and `REVOKE`,
run with the rest when you press Run Changes and confirm. A schema's rename runs last, so every
statement before it still names its objects as they are. What PostgreSQL cannot do, such as
dropping an enum's value, is said before you run.

### A function's and a procedure's properties

A function's Properties edit what it promises the planner: volatility (Immutable, Stable,
Volatile), parallel safety, whether it is called on NULL input, its cost and rows. For a function
and a procedure alike, its security (Definer or Invoker), leakproof, the settings it runs with
(`SET search_path` and any other), its name and its schema.

PlumeSQL reads the body with PostgreSQL's own parser and says when it contradicts the promise: an
Immutable function that reads a table, or a Volatile one that reads nothing but its arguments.

![A function's Optimization in Properties: Volatility Immutable, and under it in red: Declared Immutable, but it reads shop.orders: Stable is what this body is, with Mark as Stable below; Parallel, Null input and Cost under it](media/function-props.webp)

The fix is a click beside it, **Mark as Stable** or **Mark as Immutable**, and a Security Definer
without a pinned `search_path` is offered **Add SET search_path**. Each change becomes one `ALTER
FUNCTION` in the Changes script.

## Comments

### Comments are Markdown, everywhere

A comment is now a box of several lines, on a table, a column, a key, an index, and on any object's
Properties: a view, a function, a type. The corner button opens it in a tab with PlumeSQL's
Markdown editor, its toolbar and the preview beside it:

![A column's comment in its tab: the Markdown source on the left with a bold word and a list, the rendered comment on the right, and Preview, Split and Source above them](media/comment-markdown.webp)

⌘Enter puts it back into the field. A comment change goes into the Changes script with the rest,
so you can describe many objects and run them at once; **Edit Comment…** in the Objects tab now
adds to the changes too.

### An expression in a SQL tab

A default, a check, a generated column, a USING or an index's condition has the same corner
button. It opens a SQL editor that tells you, as you type, when PostgreSQL would not read what
you wrote.

## Results

### A result says when its query changed

Change a query after running it and the result's header says **Edited**, with **Run** beside it
to run the query as it stands now. Moving the text around or adding a comment does not count;
a real change does. The rows stay as they were until you run it again.

![A result's header: SELECT count, then an Edited mark and Run beside it](media/result-edited.webp)

## Explorer

### A script's statements, one click away

A SQL file of two or more statements now has a chevron in the Explorer. Unfold it and every
statement is a row of its own, named as in the Outline, with the line it starts on:

![The Explorer: cards.sql unfolded into SELECT payment, SELECT film, UPDATE film, INSERT category and DELETE rental, each with its icon and its line, SELECT film highlighted as the statement the cursor is in; idle.sql below it, one statement and no chevron](media/explorer-statements.webp)

Click a statement and the file opens with it selected, while the keyboard stays in the Explorer,
so the arrow keys keep walking the statements. Enter or a double click puts you in the editor on
it. Only the statements show: what is inside one stays the Outline's.

Right click a statement to select, run or copy it. **Run Statement** opens the file and runs just
that statement, as the Outline's does.

While you work in a file you have unfolded, the statement your cursor is in is highlighted and
kept in view as you move, the way the Outline follows it.

A file you have open follows your edits before you save them. The Explorer remembers which files
you unfolded, and **Statements** in its menu turns the rows off.

### Statement icons that say what a statement does

The icons beside the statements, in the Outline and under a script in the Explorer, were
redrawn. A SELECT no longer wears a magnifier, which looked like a search: it shows a result's
rows. INSERT, DELETE and TRUNCATE are rows added, taken away and emptied, EXPLAIN is a plan's
tree, and BEGIN, COMMIT, ROLLBACK and SAVEPOINT each have their own: a flag, a check, an undo
and a bookmark.

## Diagrams

### A script on a diagram

Put a whole script on a diagram: **Add to Diagram…** on a `.sql` file in the Explorer, or drag
the file onto a diagram. The card lists the script's statements as the Explorer does, each with
its comment's first line, under the file's name in its `@color` and its `@description`.

![A script card: films.sql in green with its description, four statements, the first SELECT's rows open under it, the UPDATE with its play mark](media/script-card.webp)

Click a SELECT and its rows show under it; its refresh mark asks again. A statement that changes
the database has a play mark that runs it, and asks first every time, as everything a diagram
runs does; what the server said ("UPDATE 1") stands beside it. **Run Script** opens the script
and runs all of it there, the way Run All does, in one session with its transactions as you wrote
them, and the rows on the card then show what the run gave. Right-click a statement to open it in
the script or to put it on a card of its own.

The card is drawn from the script as it is now, so what you write there shows at once. When the
file is gone, the card says so and the diagram's checks count it.

### A statement from the Explorer on a diagram

Unfold a script in the Explorer and its statement rows have **Add to Diagram…** too, or drag one
onto a diagram: the statement becomes a query card from that script, with its comment and its
annotations on notes beside it.

### Extensions, commands and any file on a diagram

**Add to Diagram…** on a query or command extension in the Extensions tab, or on any file in the
Explorer, puts it on a diagram as a card of its kind; dragging a file onto a diagram does the
same.

A query extension's card runs like a query card, with everything its annotations say: where it
runs, its parameters, the columns it hides, its row buttons right in the card's grid, a drill-down
with **← Back**, the question it asks before a run, and its timer, which starts once you refresh
the card yourself and runs only while the diagram is in front. A command's card starts the
command in a terminal tab, as it starts from everywhere else, and asks first. Any other file is a
card that opens it: a Markdown document shows its first heading and lines, and another diagram's
card takes you to that diagram.

![A query extension's card with a Details button on every row, a command's card with its pg_dump line, a Markdown document's card and another diagram's card](media/extension-cards.webp)

### A query card is titled by its comment

Write a comment above the SQL of a query on a diagram and its first line becomes the card's
title, with the statement's name quieter beside it:

![A query card on a diagram: the dvdrental connection's elephant in its header, titled Revenue by category with SELECT payment beside it in grey, over ten of its sixteen rows of revenue per film category](media/query-card-title.webp)

Annotations such as `-- @extension ...` are left out, and a query without a comment keeps its
statement's name alone. Properties says the title too.

### The rest of the comment, and the annotations, as notes

When the comment above a query says more than its first line, Add to Diagram… puts the rest on a
sticky note beside the card. A sentence that runs on from the first line goes on the note whole.
The query's annotations go on a second, gray note under it, in plain words: what each one means,
and whether the card does it too. The view `@extension` names, `@inputs`, the `@format` and
`@computed` formulas and what the script says of its parameters work on the card as well; a
`@hide` or `@refresh` stays with the script, and the note says so.

Both notes are yours: edit them, restyle them or delete what you do not need. A Refresh never
touches them. **Add Comment as Note** and **Add Annotations as Note**, on the card's right click
and in Properties, make them again.

### A query card runs any statement, a change asked first

A query card on a diagram now holds an INSERT, UPDATE, DELETE, a CREATE or ALTER, a CALL or a
DO, not only a SELECT. A SELECT refreshes as before, read only. Anything else runs on **Run**,
the play mark where Refresh was, and asks first, every time: a diagram is easy to click, may come
from someone else, and shows no transaction. The question says what the statement changes, in red
when an UPDATE or DELETE has no WHERE, and that Undo on the diagram does not undo the database.

The card then shows what the server said it did ("UPDATE 12") and the rows a RETURNING gives, the
Log keeps the run with its SQL, and a CREATE or ALTER refreshes the connection's objects, so the
tables on the diagram follow at once. A connection set to block such changes blocks them here too,
and a script marked `@readonly` never runs one. BEGIN, SET and the other statements of a session
stay with their script.

A statement with run parameters (`$1`, `:name`) goes on a diagram too, answered as your script
answers it in the editor. An `-- @inputs` line answers without asking, `-- @ask` asks on every
run and `-- @noask` never asks. Otherwise the parameters are asked on the card's first run, with
the prompts and choices your script declares, and kept, so a Refresh runs again without asking.
The card shows the values it runs with, and **Parameters…** on it asks again.

A card from a script with `-- @connection` sections runs where its section says, and follows the
line when you change it.

The card's grid follows its script's formulas too: a `-- @format` or `-- @computed` line above
the statement, or in the script's header, shapes the card as it shapes the results.

### A query card follows its script, and says when it differs

A query card from a script is drawn from the script as it is now, the way a table's card is drawn
from the database. It follows its statement there, also when you rewrite it through Edit Query,
and never picks up another query that only stands where it stood.

When you change the statement in the script, the card says so at once: "Changed in cards.sql
since it last ran.", with an amber dot before its title. Refresh runs it as it is now; **Accept
Changes** records it without running.

When the statement is deleted, the card is missing: "Not in cards.sql any more.", with **Detach**
beside it, and nothing runs, not even its old copy, so a statement you deleted never runs from a
diagram. Detach makes the SQL the card's own, edited and run on the card. It is also in the card's
right click and in Properties.

Changed and missing cards count in the diagram's checks on the toolbar beside the tables
("1 changed · 2 missing"), whose menu accepts, selects or removes them.

### More rows on a card without a Refresh

Raise a query card's Rows in Properties and the rows show at once: a card keeps up to 100 rows,
whatever it shows, and the line under it says how many it shows of how many ("13 of 16"). A
Refresh still brings the rows you see first, and keeps the rest only when they come quickly, so
a slow query takes no longer than before.

## What changed

### Every title bar button, from the start

The title bar now shows all its buttons by default: Properties, the left sidebar, the bottom
panel, the right sidebar and the Layout menu, beside Zen Mode, Hide Sidebars and Panel, the
Terminal, the Log and the activity dot. They stay in Zen Mode too, so a sidebar or Properties is
one click away there. If you chose your own set on the title bar's right-click, it stays as you
left it; **Restore the Default Buttons** in the same menu shows them all.

The status bar no longer repeats the Terminal, the Log and the activity dot while the title bar
shows them. Take one out of the title bar and it comes back in the status bar, so each is always
in exactly one place.

### News in the status bar

What waits for your word now stands in one place, the status bar's right end: the pending
changes, an update on its way (**Download Update**, then Downloading, then **Restart to Update**,
with **See Notes** beside each), and a mode the window is in, such as a theme or icons previewed
with **Use** and **Cancel**, or Compare waiting for its second side. Each wiggles when it arrives
or moves on, so you notice it without looking for it.

The title bar keeps only its buttons, so the arrows, the command palette and the zoom stay within
reach while you preview a theme. In Zen Mode, which hides the status bar, the news show in the
title bar instead.

### The same buttons on every object row

Point at a table in the Objects tab and **Browse Data** and **Open DDL** appear at the end of its
row. They now appear wherever a row stands for an object: the Outline's objects under a statement,
and the "depends on" and "used by" rows an object unfolds in the Objects tab. A long name ends
short of them instead of running under them.

### The Objects tab always shows your script's connection

The Objects tab can no longer stand on another database than the script you are in, so the
tree and the editor's completion, hover and Go to Definition always answer from the same one.
The header's Automatic and the connection's Pin Object Browser Here are gone.

Exploring a database before you write anything still works the way other clients teach it: with
no script open, click a connection in Connections and its objects show at once, and New Script
then opens on it. With a script on another connection, the click asks first:

![A question: Assign staging to cards.sql? The Objects tab shows the connection of the active tab. cards.sql is on dvdrental; a new script on staging leaves it there. Buttons: Cancel, New Script, Assign to cards.sql](media/objects-assign.webp)

If the script has an open transaction, the question says that assigning another connection rolls
it back. The arrow keys in Connections never ask. A click on the connection in the Objects header
now opens the script's own connection picker, the one beside Run.

The crosshair in the Objects header, which lights and reveals the object under the editor's
cursor, is now called **Follow the Cursor**, in its tooltip, the pane's menu and Settings.

### A script's connection in its color in the Explorer

A script's mark after its name in the Explorer is now its connection's elephant, in the
connection's color, with the dot at its corner saying whether it is connected:

![The Explorer: idle.sql with a red elephant and a grey dot, live.sql with a red elephant and a green dot](media/explorer-connection.webp)

A connection without a color shows a plain elephant. The color says which connection, the dot
how it is, so a red Production connection never looks like one that does not answer. A query
card on a diagram wears the same elephant before its connection's name.

### Errors and decisions from the Log button

Point at the Log button and what this session logged since you last looked shows in the corner,
or its last entry when there is nothing new; before the session has logged anything, nothing
shows. The cards stay while you point at the button, and while the pointer is on a card, so you
can reach its fix or its X.

When something went wrong, the Log button carries a red count of the errors you have not seen.
Point at the count and the errors show in the corner, each with its own fix and **Dismiss**; click
the count and they are all dismissed, without opening the Log. A click anywhere else on the
button opens the Log as before.

Decisions that wait for you, such as **Update usages** after a rename or **Reconnect** after you
changed a connection, now have an amber count of their own. Click it and they show in the
corner the same way, ready to answer.

A right click on the button has the Log's own menu: open it, show or dismiss the errors, open
it on its errors alone (every other entry filtered out), show or set aside the decisions, Copy
All, Clear and Log Settings. The same commands are in the command
palette under PlumeSQL.

### A true Zen Mode

⌘K Z (Ctrl+K Z on Windows and Linux) now does what it does in VS Code: the file you are in gets
the whole window, with no tabs, toolbars, sidebars, bottom panel or status bar. A script's
results stay with it. The same keys or Escape twice bring everything back, and Zen Mode is also
in the Layout menu, the command palette and a button of its own at the left of the title bar's
buttons.

The sidebars stay a key or a click away, over the file: ⌘B and ⌥⌘B show them, ⌘J the bottom panel
and ⇧⌘Y Properties, also from a diagram's right click, and the title bar keeps its buttons, Zen
Mode's own among them for the way out. Leaving Zen Mode shows the window exactly as it was when
you entered it.

What Zen Mode used to do, both sidebars and the bottom panel hidden at once, is now **Hide
Sidebars and Panel**: the same title bar button as before, in the Layout menu and the command
palette, and back as they were on the next press. It has no shortcut by default; you can give
it one in the keyboard settings.

## Fixed

- **Open VSX theme pages open from the cache.** A theme package's page downloaded the whole
  package and its README every time you opened it, and Install downloaded the package again.
  They are now kept by version, verified, with each package's color and icon pills and its logo,
  so a page opened again, an Install after it or a restart downloads nothing until the package
  has a new version. They count in the Marketplace cache on the System page, which you can clear.
- **A script with `-- @connection` sections keeps its own connection.** After you ran a
  statement of a section that names another database, the script reopened on that database, so
  the statements above the first section failed there. It now reopens on its own connection.
- **A path in Properties stays where you scroll it.** On a script's page, the file's path shows
  its end. Scrolled back to read its start, it jumped to the end again as soon as the page took in
  something arriving later, such as the connection's details. It now stays where you left it.
- **A table view on a diagram shows its table.** A query card drawn by a view that computes rows,
  such as JSON rows, pivot or transpose, stayed empty while its footer counted the rows. The
  card now lists those rows in the app's own grid, as the results pane does.
- **A table added to a diagram of queries shows.** Add to Diagram… on a table, into a diagram
  holding only query cards or notes, put the table under them, where nothing showed it. It now
  stands right of everything on the diagram. Adding something the diagram already holds chooses
  it there and brings it into sight, moving it out from under a note or a card, and the Log
  says so. A diagram with no connection yet is offered too, and takes the connection of what
  you add to it.
- **Rename selects the name, not its extension.** Renaming a file in the Explorer chooses its
  name with the extension left out, also for PlumeSQL's own two-dot extensions: `Queries` of
  `Queries.plumesql-diagram.json`, `demo` of `demo.plumesql.sql`.
- **JOIN's reference starts at the beginning.** The hover on JOIN (and INNER, CROSS, NATURAL,
  OUTER) opened in the middle of the section, at "This latter equivalence does not hold
  exactly…", and showed a table of sample rows as its example. It now says what a joined
  table is, and its example is a query.
- **substring, trim and the SQL/JSON functions show their own reference.** Their hover showed
  the title of the table listing them and an example from somewhere else in it, sometimes an
  error message. It now shows the function's signatures, what it does and its own examples,
  as every other builtin function does. This covers position, overlay, JSON_OBJECT,
  JSON_ARRAY, JSON_EXISTS, JSON_VALUE, JSON_QUERY, JSON_OBJECTAGG and JSON_ARRAYAGG too.
- **Query cards stay sharp.** A query card whose rows scroll (its SQL unfolded, or the card
  made smaller) looked blurred, in the app and in Chrome. Its rows now scroll as before, with
  the wheel, the trackpad or by dragging the bar, and the card stays sharp.
- **The dynamic parser checks again when the server was busy.** A check the server could not
  take at that moment waited for your next keystroke; it now tries again on its own.
- **No Disconnect for a tab that is not connected.** The connection picker offered Disconnect
  even with no connection chosen. It now offers it only when there is something to
  disconnect, and ends with New connection… so an empty list always has a way forward.

## Tell us what you think

Questions and ideas go to
[Discussions](https://github.com/hercstack/plumesql/discussions), bugs to
[Issues](https://github.com/hercstack/plumesql/issues) or Report a Bug in
the app's menu. The video tour is on
[YouTube](https://www.youtube.com/@plumesql).
