# PlumeSQL 0.33.0

## Highlights

- **Comments, written on the diagram:** every card shows its object's comment as Markdown, a
  click edits it right there, and a long one says how much it leaves out. Comments are the
  knowledge of your database, for people and for the tools that read it.
- **Functions in JavaScript and Python:** a PL/V8 or PL/Python function is edited the way a
  PL/pgSQL one is: drawn in its own language, completed, checked, navigated and outlined, and the
  SQL inside its queries completes your tables and columns.
- **Edit tables on the diagram:** double-click a table's card and change its columns right
  there, without leaving the diagram, and draw its foreign keys to other tables.
- **Sketch the model with notes:** draw arrows between notes on a diagram, then make them tables
  in one step, and a new table a note again.
- **A sketch style for diagrams:** the whole diagram drawn as by hand, as draw.io's sketch style
  draws it.
- **Lines of your own on a diagram:** join any two tables, notes or areas with a line, for what
  the database does not say, styled and labeled your way.
- **From a logical model to tables:** crow's foot marks on the lines between notes, logical types,
  and Make Table turns the model into tables, join tables included.
- **Diagrams in the console:** ask a diagram questions and change it with a line of
  JavaScript in the Log's console: what drifted from the database, every audit table greyed,
  the tables a schema has that the diagram leaves out added, a data dictionary in Markdown.
- **A model from Mermaid:** Import from Mermaid (or just paste) Mermaid's erDiagram text on a
  diagram, and its entities become notes and its relationships lines with crow's feet, ready to
  make tables.
- **Functions and procedures in a script of their own:** Edit Function opens a function's code
  ready to change, and any script with one `CREATE FUNCTION` is one too: it says before the run
  what PostgreSQL will do with a changed signature, writes a call and a test for it, and its
  properties, comment and grants in Properties are written into it.
- **DDL, laid out your way:** a function's parameters one per line, a table's columns lined up,
  and none of what PostgreSQL would assume anyway, each rule a setting of its own.
- **Properties from a right click:** a table, a schema or a file shows its properties from
  its menu.
- **A shorter right click in Objects:** an object's menu in groups, eighteen entries instead of
  twenty-seven.
- **Everything for a statement in its right click:** run it, explain it, select, copy and
  format it, the same as its lens and its gutter buttons, even with both switched off, and the
  menu says which statement and which word it acts on.
- **More in the status bar:** how your last run went, and the session's search_path, one click
  from putting another schema first.
- **Commit and Rollback in the toolbar:** while a transaction is open, its end is one click
  beside the connection.

## Diagrams

### Edit a table on its card

Designing on a diagram no longer sends you to another tab. Double-click a table's card, or
press Enter with it chosen, and the card opens for editing: every column with its name, its
type, `NOT NULL` or `NULL` and its place in the primary key (the key), all changed in place.
**+ Add column** adds one, the × beside a column drops it (struck through, with **Keep** to
change your mind), and the table's name in the header renames it.

![A table's card being edited on a diagram: its columns' names, types, NOT NULL and key, a new column added](media/card-edit.webp)

The type comes from a list of PostgreSQL's types and your database's own: click the field,
or type to narrow it. A type nothing knows is marked in red.

Enter writes a field and goes down to the next column, Escape puts it back, and a second
Escape or the ✓ in the header ends the editing. Properties shows everything else about the
column you are on: its default, identity, collation and comment.

Every change waits in the Changes script, as changes from the table's Design do: nothing
reaches the database until you review it and run it. A new table made on the diagram, with
**New Table Here…**, opens for editing on its card at once.

A new table lives only in your pending changes and on its card, so deleting its card from the
diagram discards the table too. Undo on the diagram brings both back.

### Draw a foreign key

While a table is open for editing on its card, every column has a small arrow, its foreign
key. Drag it to another table and the column references that table's primary key. The line
follows your pointer, and the table under it says what the key would reference, or why it
can't (a table with no one-column key is outlined in red). Drop it on a unique column of the
other table to reference that column instead, or on another column of the same card for a
key to the table itself; Escape lets go without drawing anything.

![A foreign key being drawn on a diagram: a line from the orders card to the product card, which says what it would reference](media/card-fk.webp)

**+ Reference**, beside **+ Add column**, makes the column for you: drag it to `product` and
`orders` gets a `product_id` of the same type as the key, with its foreign key. Clicking the
arrow (or pressing Enter on it) lists the diagram's tables instead, and takes a key away
again. The new key is drawn at once, as a pending line, and waits in the Changes script with
the rest; ON DELETE and the other options are in Properties. Until it is created, the line is
the key: delete the line (or choose **Remove Foreign Key** on it) and the key goes too.

### Sketch with notes, then make tables

A model often starts as a sketch: a box for each thing, an arrow between the ones that belong
together. Draw it with notes. A chosen note has a small arrow handle on its right edge: drag it
to another note (or to a table's card), and the note points there. A note can have as many
arrows as it needs; **Draw Line To…** on its right click lists the diagram's notes and objects
instead, and a chosen arrow goes with Delete. These arrows are lines of your own (below), so
everything a line can do, they do.

![Three notes on a diagram, orders pointing to customers and to products](media/notes-sketch.webp)

When the sketch is ready, choose the notes and pick **Make Tables** on their right click. Each
note becomes a table not created yet, its card where the note stood:

- the note's first line is the table's name (`Customer orders` becomes `customer_orders`),
- each item of its list is a column, written as in CREATE TABLE: `- email text not null`,
  `- total numeric(12,2) default 0`, `- placed timestamptz not null default now()` (a column
  with no type is `text`),
- the rest of the note's words become the table's comment,
- each arrow becomes a foreign key to the table it points to, in a new column such as
  `customers_id`.

![The same three made tables: orders with customers_id and products_id, the keys drawn between the cards](media/notes-tables.webp)

As with every change made on the diagram, nothing reaches the database until you review the
Changes script and run it. Changed your mind? **Make Note** on a new table writes it back as a
note, its keys as arrows, and the diagram's Undo goes back either way.

### Sketch style

Turn on **Sketch** on the Diagram page in Properties and the whole diagram is drawn as by hand:
the tables' borders, the lines with their crow's feet and arrows, the notes, the areas and the
schema frames. Any of them can say otherwise on its own page, or for its group (every table,
every foreign key line, a schema), so you can sketch the draft and keep what is settled crisp.
**Roughness** beside it chooses the hand: Light, Normal or Strong.

![A diagram drawn in the sketch style: tables, notes, an area and the lines between them, all drawn as by hand](media/diagram-sketch.webp)

A drawing never trembles: each element is drawn the same way every time, however you pan or
zoom. The words, the fills and the fonts stay as they are, and Copy as SVG or PNG takes the
drawing with it.

### Lines of your own

Not every relationship is a foreign key. Many databases declare few or none, and a diagram
often needs to say more: this view feeds that report, these two tables are matched by a code.
Now you can draw it. **Draw Line To…** on the right click of a table, a note or an area joins it
to another one; a chosen note's arrow handle does the same by dragging.

![Lines of your own: straight, curved, in steps and smooth, with labels, crow's feet and arrows, between tables, notes and an area](media/diagram-lines.webp)

A line always belongs to the two things it joins. Drag one of its ends onto another table, note
or area and it moves there; delete a note and its lines go with it. In between, it is yours to
shape:

- **Straight, Curved, Step or Smooth**, with waypoints you drag out of it, exactly as on a
  foreign key line: drag a step's segment aside and the line goes around the table in its way.
- **A mark at each end:** an arrow, an open arrow, a dot, a crow's foot or a bar.
- **A label of your words:** double-click the line (or press Enter) and type; drag the label
  anywhere along it.
- **Its color, width, stroke and sketch**, all on its own page in Properties, and **Reverse**
  turns it round.

A line that has collected too many bends? **Reset Line**, on its right click and its page,
gives it back as a new one is drawn in one step: its look, its waypoints and its sides. It
works on foreign key lines too. And a note's line to what it is attached to is now a line like
any other, Step and Smooth included.

### From a logical model to tables

A sketch says what the things are. A logical model also says how many: a customer places zero
or many orders, every order belongs to exactly one customer. Now a line between notes can say
that too, in crow's foot notation: pick **Start** and **End** on its right click or its page in
Properties (one, exactly one, zero or one, many, one or many, zero or many).

![A logical model on a diagram: notes with their attributes, lines with crow's feet between them](media/logical-model.webp)

**Make Table** reads the marks:

- The foreign key goes on the **many** side, whichever way you drew the line.
- **Exactly one** on the other end makes the key NOT NULL; zero or one leaves it optional.
- **Many on both ends** makes a join table between the two (`order_product`), with a key to
  each and both as its primary key.
- **One on both ends** makes the key UNIQUE.

Attributes can stay logical too: write `- total currency` or `- placed datetime` and the table
gets `numeric(12,2)` and `timestamptz`; an attribute with no type at all gets `text`. The list
of logical types is yours to change in Settings.

![The same model made tables: keys named customer_id and order_id, the join table between orders and products](media/logical-tables.webp)

### Keys named your way

A new table's key is now named for the table in the singular: `customer_id` for customers,
`category_id` for categories, and a column that references it is named the same. Prefer `id`,
or `customers_id`? Settings ▸ Objects ▸ Editing tables has it, along with the key's type (`bigint`
or `integer`), `GENERATED ALWAYS` or `BY DEFAULT`, what a new foreign key does ON DELETE, and the
type of a column you gave none. New Table, Make Table and the foreign keys you draw on a diagram
all follow them.

### A model from Mermaid

A model often starts as text: in a document, a wiki page, or an answer from an AI assistant,
written in Mermaid's `erDiagram`. Choose **Insert ▸ Import from Mermaid…** on a diagram's toolbar
(or on its right click): the model you copied is already in (chosen, so pasting something else
replaces it), and before anything happens the dialog says what it will make. Copied a whole README? Fine: the model is read out of its
```` ```mermaid ```` block. Or skip the dialog and just **Paste** on the diagram (⌘V).

![Import from Mermaid: the model's text, and what it will make before anything is done](media/mermaid-import.webp)

Each entity becomes a note with its attributes, each relationship a line with its crow's feet
and its words, and an entity named like a table already on the diagram joins that table's
card instead. Then **Make Table**, as with any notes.

```
erDiagram
  customers ||--o{ reviews : writes
  products ||--o{ reviews : gets
  reviews {
    int rating
    string body
  }
```

![A model pasted as Mermaid: a reviews note joined to the customers and products tables by crow's foot lines](media/mermaid-model.webp)

### Diagrams in the console

The Log's console line now knows the diagram on screen as `diagram`. What the mouse does one
card at a time, a line does over the whole diagram:

- `diagram.cards` prints every card as a table; `diagram.checks` lists the ones that differ from
  the database, and what changed.
- `Object.values(db.shop).filter(t => t.type === 'table' && !diagram.cards[t.name])` asks what
  the diagram leaves out, and `diagram.add(...$_)` adds it.
- `diagram.cards.filter(c => c.name.startsWith('audit_')).look({ collapsed: true })` folds every
  audit table; `diagram.lines.filter(l => l.kind === 'dep').hide()` hides the dependency lines.
- `diagram.import(text)` reads a Mermaid model in, `diagram.notes.makeTables()` makes it tables,
  `diagram.link(a, b, { from: 'zeroMany', to: 'oneOnly' })` draws a line with its marks.
- `diagram.mermaid` writes the diagram back as Mermaid, and `diagram.dictionary` as a data
  dictionary in Markdown: each table's comment and its columns with their types, keys,
  references and comments, ready for a wiki or a ticket.

Every change is the diagram's own gesture, one step of its Undo (`diagram.undo()` too). Type
`help.diagram` for the rest.

![The console under a diagram: the cards printed as a table, audit tables added and folded with one line each](media/diagram-console.webp)

## Properties

### Properties from a right click

Right-click an object or a schema in Objects, or a file in the Explorer, and choose
**Properties**: PlumeSQL opens it as a click would and shows the Properties tab beside it, even
when you had switched the tab off. A schema's Properties are the schema's own, its comment
ready to edit. From Objects, Properties opens below the tree, so the row you asked about stays
in sight, and the × in its header closes it there. When Properties already shows it, the menu leaves the entry
out, and the same goes for a diagram's Display, Line or Note Properties and for Editor
Properties.

## Status bar

### The last run, and the search_path

The status bar now says how the script's last run went, in the words of the results: `245
rows in 18 ms · 2m ago`, **Failed** in red, a counter while it runs. A click brings the results
back into sight, a failed run's messages first, even when you folded them away.

Beside it stands the session's `search_path`, where names written without a schema are looked
up. Click it to put one of your schemas first, write the list yourself or reset it to the
server's default: each is a `SET` on the tab's own session, as if you had typed it.

They use only the room the status bar has free: on a narrower window they step aside,
`search_path` first, and nothing else moves for them.

The connection stands out now too: on a field of its own, in its color when it has one, its
name first and in full strength, with a chevron that says it is a picker. The session's pid and
age moved into its tooltip.

## Commit and Rollback in the toolbar

### The open transaction's end, beside the connection

When a script opens a transaction, the editor toolbar already marked it with an amber **tx**.
Now **Commit** and **Rollback** stand right beside it, for as long as the transaction is open,
and go when it ends:

![The editor toolbar in a transaction: the connection marked tx, then Commit and Rollback beside it](media/tx-commit-rollback.webp)

They run exactly `COMMIT` and `ROLLBACK` on the script's session, as if you had typed them, and
the results stay as they are. Their tooltips say what you are about to end: the rows changed,
the schema changes, how long the transaction has been open. Commit still asks first on a
connection set to confirm a commit.

Once a statement fails inside the transaction, nothing but a rollback can run on that session,
so only **Rollback** stays, in red:

![A failed transaction: the connection marked tx failed, and Rollback alone in red](media/tx-failed.webp)

The connection's right click and the command palette (**Commit Transaction**, **Rollback
Transaction**) have them too.

## Functions and procedures

### Edit Function

Right-click a function or a procedure in Objects and choose **Edit Function** (or **Edit
Procedure**; it is also on its DDL tab, its card on a diagram, its Properties and in the command
palette). Its code opens in a new script: its `CREATE OR REPLACE` as the database has it, laid
out as the DDL is, with everything the SQL editor does inside the body.

It is not the only way in. Any script with one `CREATE FUNCTION` or `CREATE PROCEDURE` is a
function's script, a file of your repository opened from the Explorer as much as a script Edit
Function opened. A script with two of them is a script like any other.

A function's script has a toolbar of its own: which function it makes and on which connection,
then:

- **Add Call**: a call of the function, written into the script below it.
- **Add Test**: a check written into the script, run each time you apply it.
- **Compare with Database**: your `CREATE` beside the function as the database has it now
  (your calls and tests are not part of it). Written another way (lowercase, `$$` for
  `$function$`, `AS` on a line of its own), the same function shows no difference: only what
  changes something is marked.
- **Open DDL**: the function's DDL, as the database has it.

The same are in the editor's right click, under Function.

![A function's code in a script of its own: the function it edits and its connection at the left of its toolbar, Add Call, Add Test, Compare with Database and Open DDL at the right](media/edit-function.webp)

**Run** runs the whole script, the `CREATE OR REPLACE` and your call and tests below it. Once the
script has seen the function (Edit Function opened it, or you ran the script), Run first checks
that nobody changed it in the database since; if someone did, you choose to replace their change
or to compare.

Switch the script to another connection and it reads the function there: Compare with Database
and Open DDL show that database's, and say so when it has no such function yet (the script's
first run creates it).

### The signature, before you run

Rename a parameter, change the result type or remove a default, and PostgreSQL refuses to
replace the function. The script says so as you type, in PostgreSQL's terms: a replace, a second
function beside the old one, or a refusal. The function's name in the script is underlined, and
its Quick Fix (⌘.), like the button at the end of the script's toolbar, is **Write DROP and
CREATE**: it writes the way out into the script, the function's owner, grants and comment put
back, for you to read and run.

![A parameter renamed: the function's name underlined, the toolbar saying CREATE OR REPLACE cannot do this, Write DROP and CREATE at its end](media/edit-signature.webp)

### Add Call

**Add Call** writes a call of the function right below its `CREATE`, in the same script: its
arguments are asked in a form when you run it, each by its parameter's name, a default already
filled in. A script that calls the function already gets no second call: the cursor goes to the
one it has.

When the function's body writes (an `INSERT`, an `UPDATE`, DDL), the call is written between
`BEGIN` and `ROLLBACK`: you see what it returns, and nothing it wrote is kept. A procedure that
commits itself cannot run inside a transaction, and its comment says so. It is all SQL in your
script: take the two lines away, or write your own around the whole script, as you like.

![A function that inserts, its call written below it between BEGIN and ROLLBACK, and what the call returned](media/call.webp)

### Add Test

A call is for now; a test is for every change after it. **Add Test** writes a test at the end of
your script (inside a `BEGIN` and `ROLLBACK` you wrote around it), so each time you apply the function the test runs right after it and fails loudly
if the function no longer returns what you expect. It is a `DO` block that calls the function
and `ASSERT`s on what it returns, shaped by its result:

- **a value** into a variable of its type,
- **rows** into a temp table, counted, and one row found by its key,
- **a record** field by field, a procedure's OUT parameters the same way.

Every value you expect is a `null` to fill in, so the test fails until it says something; the
first one is selected for you to type over, and a second Add Test before you filled it in takes
you back to it instead of writing another. Run runs it after the `CREATE`, the way you would
write it yourself.

![A test added below the function: ARRANGE, ACT with the call, ASSERT with the nulls to fill in, the first one selected](media/add-test.webp)

### Its properties, written into the script

The function's page of Properties, beside its script, has what its DDL tab edits: Volatility,
Parallel, Null input, Cost and Rows, Security, Leakproof and the settings it runs with, with
the same checks (a body that only reads offers **Mark as Stable**), and its comment, owner and
grants. They read what your script says, and a change is written into the script, never
pending and never run: Volatility turns `VOLATILE` into `STABLE` in the `CREATE`, a cost
writes `COST 5` before the body, and the comment, the owner and the grants, which no `CREATE`
says, become `COMMENT ON`, `ALTER ... OWNER TO`, `GRANT` and `REVOKE` right below it. Each
change is one undo in the editor, and your Run applies it all. A field that differs from what
the database has offers the way back to it.

Changes still pending from the function's DDL tab are listed at the top of the page, with
**Take into the Script**, so one property never has two versions waiting in two places. And a
run now also asks when the function's owner, grants or comment were changed in the database
since the script saw it, not only its code.

![A function script with its labels, its comment and its grants in Properties: IMMUTABLE, COST 5 and a setting in the CREATE, the REVOKE, GRANT and COMMENT ON below it](media/function-properties.webp)

### Their language, in the object tree

Every function and procedure in Objects now says what it is written in: `plpgsql`, `sql`,
`plv8`, at the end of its row, where the languages line up in a column. If you would rather read
it first, **Show Language** puts it before the kind: `PLPGSQL FUNCTION cancel_order(bigint,
text)`.

And if the language matters more to you than whether it is a function or a procedure, **Group
Routines by Language** gives each language a folder of its own (`plpgsql routines`, `sql
routines`), functions and procedures together, each row still saying which it is. Both are in
the Objects tab's menu and in a functions or procedures folder's right click.

Some languages you never read in the tree: a database's `c` and `internal` functions, its own
built-in ones and extensions' compiled code, run to thousands, so they are now left out by
default. The **Object filter** window lists the languages, each with how many routines it has:
check one to show it, uncheck one to hide its functions and procedures in every schema. A
routine's right click offers the same under Hide, and **Show all** brings everything back. Only
the tree leaves them out: completion, hover and Go to Definition still know them.

![Functions and procedures with their language at the end of each row, and the same routines grouped into a plpgsql folder and a sql folder](media/routine-language.webp)

## Comments on the diagram

An object's comment says what it is: what a table holds, what a column means. That knowledge
belongs in the database, where people and the tools that read it find it, and the diagram is
where you see the model it describes. Now it is written there too.

### Shown on every card, as Markdown

Each card shows its object's comment by default, as Markdown (headings, bold, lists, code), in
a block of its own above the columns, so formatted words are never mistaken for a column. A
schema's frame can say how many of its objects are documented.

![A schema on a diagram: three tables with their comments as Markdown, the frame saying 3 of 4 documented](media/diagram-comments.webp)

### Edited where you read it

Click a comment to edit it on the card (⌘Enter keeps it, Escape takes it back); an object
without one shows **Add a comment…** in its place. Its corner opens it in the Markdown editor
instead, with the rendered text beside it, and a card's right click has **Edit Comment…**, a
column's row **Edit Comment of** the column. Every edit is a pending change, like any other:
nothing reaches the database until you run it. **Show Comment as Note** puts a comment on the
canvas to rework, and a note on an object has **Save as Comment**.

![A table's comment edited right on its card](media/diagram-comment-inline.webp)

### Long comments, never cut without a word

A card shows four lines of a comment by default; when there is more, it says so (**+9 lines**),
and a click on it shows the whole comment beside the card. Show ▸ **Comment Length** chooses
how much a card shows: Summary (the first paragraph), 4 lines, 8 lines or the whole. Write a
one-line summary first and the details after a blank line, and Summary reads like a docstring.
The canvas's own right click has **Show** for what every card of the diagram shows.

![A long comment cut at four lines, the whole of it beside the card](media/diagram-comment-long.webp)

### Run a small change without opening the script

The pending changes' right click in the status bar has **Run Changes…**: the script that will
run is shown whole in its question, so a change as small as a comment needs no tab opened.

![Run Changes from the status bar: the COMMENT ON statement shown before it runs](media/run-changes.webp)

## Functions in JavaScript and Python

PostgreSQL runs functions written in JavaScript (PL/V8) and in Python (PL/Python), and now the
editor knows them as well as it knows PL/pgSQL. Write `LANGUAGE plv8` or `LANGUAGE plpython3u`,
before the body or after it, and the body is drawn in its own language, with the SQL help
stepping aside inside it.

### The SQL inside, completed from your database

A query a body runs (`plv8.execute('...')`, `plpy.execute("...")`, and their `prepare` and
`cursor`) is SQL again: drawn as SQL inside the JavaScript or Python string, its tables, columns
and functions completed from the connection, its objects hovered with Browse data and Open DDL,
as in any script.

![A PL/V8 function's query, inside a JavaScript string, completing a column of its table](media/plv8-sql-completion.webp)

### Checked as you type, and by the server

- A syntax error, in JavaScript or in Python, is a warning where it stands. Python's indentation
  is read exactly as PostgreSQL's Python reads it: a body indented as a whole is fine, an indent
  no block opens is not.
- A query's syntax is checked by PostgreSQL's own parser as you type; with the dynamic parser on,
  the server checks it too, and a missing table or column is said where it stands, in its words.
- A misspelled `plv8.exeute` is a warning, and so is a variable or a parameter you never read,
  with a Quick Fix that removes it.
- What the body does counts: a declared IMMUTABLE that reads a table, or a STABLE that calls
  `Math.random()` or `datetime.now()`, is a warning, with the word that body is.

![A PL/V8 function declared IMMUTABLE reading a table that does not exist: both said in Problems](media/plv8-checks.webp)

### Help in both languages

- **PL/V8** gets JavaScript's own help: completion of `plv8.execute`, `plv8.prepare`,
  `plv8.elog` and the rest of the API, the parameters typed from their SQL types (`integer` is a
  number, `bigint` a BigInt, `text` a string), a trigger's `NEW`, `OLD` and `TG_*`, hovers and
  signature help, and nothing of a browser's.
- **PL/Python** gets the `plpy` module after `plpy.` with each function's signature, the
  standard library's modules after `import`, a trigger's `TD` keys, the parameters with their
  Python types (`numeric` is a Decimal), and the names the body defines.

![A PL/Python function: plpy's functions listed, execute's signature beside it](media/plpython-plpy.webp)

### Navigate, rename, outline

Go to Definition, Find References and Rename (F2) work on a body's own names, a parameter
renamed in the function's head too. Both languages fold by their own structure, and the Outline
shows such a function as it shows a PL/pgSQL one: its parameters, its inner functions, the
queries it runs by their kind, its messages and its returns. Edit Function, Add Call, Add Test
and the function's Properties work as for any function, and Format Document leaves the body as
you wrote it.

![A PL/Python function run, its Outline beside it: the parameter, the query, the NOTICE, the return](media/plpython-outline.webp)

## DDL, laid out your way

The DDL in the Objects tab is now written to be read. A function's or a procedure's parameters
stand one per line, then `RETURNS`, each label (`IMMUTABLE`, `SECURITY DEFINER`, `SET ...`) on a
line of its own and `LANGUAGE` last. Its body is never touched.

![A function's DDL: its parameters one per line, defaults written as = value, every clause on its own line](media/ddl-routine.webp)

A table's columns line up, the names, the types and the rest each in a column of their own. And
what PostgreSQL writes but would assume anyway is left out: a parameter's `IN`, a default's cast
to its own type (`DEFAULT 'new'`, not `DEFAULT 'new'::text`), `nextval`'s `::regclass`, an
identity column's sequence options while they are the defaults, an index's `USING btree`.

![A table's DDL: its columns lined up, an identity and a default written the short way, an index without USING btree](media/ddl-table.webp)

Every rule is a setting in **Settings ▸ Snapshot**, and each can be set apart for a group of
connections or for one connection in its editor:

| Setting | Default | The other way |
|---|---|---|
| DDL lists | parameters one per line | on one line |
| Routine clauses | each on its own line | after the parameters |
| Short form | on | everything as PostgreSQL writes it |
| Align columns | on | off |
| DDL indent | four spaces | two spaces, or a tab |
| Foreign keys | in the table | after it, as `ALTER TABLE ... ADD CONSTRAINT`, the way `pg_dump` writes them |
| CREATE OR REPLACE | off | views, functions, procedures and aggregates written `CREATE OR REPLACE` |

DDL keyword case, the setting that writes keywords in lower case, now applies to a function's head
too. However you set them, the DDL is the same object: we replay it into an empty database on
PostgreSQL 13 to 18 and check it reads back exactly as it was.

## What changed

### A shorter right click in Objects

An object's menu was long. It now reads in groups: open it, work with it, take it somewhere,
then the tree's own entries.

- **Diagram** holds Add to Diagram… and Reveal in Diagram….
- **Data** holds Copy As, Export and Paste Rows….
- **Copy** holds the scripts to the clipboard too, under its Script.
- **Clicks** holds On Click and On Double-Click, in every tree.
- A table's comment is edited in **Properties**, now on the same menu. A column's row still
  has Edit Comment…, and the DDL view's header the form with every comment of the table.

### A tab's header answers a right click

Right-click the header over a tab, a DDL view's, the Changes tab's, an extension's, a
comparison's, and you get what that header does, the same as its dots menu, instead of the
app's general menu. The strip of a function's script offers Add Call, Add Test, Compare with
Database and Open DDL the same way, and the Changes strip in a script every action of the
pending changes.

### Everything for a statement in its right click

Right-click a statement in the editor and the menu is in parts, each headed by what it acts on:

- **The statement** (`SELECT shop.orders`): Run Statement (Run Selection when text is
  selected), Explain, Select Statement, Copy Statement, Format Statement, Refactorings,
  Extensions and Add to Diagram….
- **The word under the cursor** (`Column data_point_id`, `Table orders`): Go to Definition,
  References, Peek and Rename.
- **The whole script** (`orders.sql`): **Run** (Run All, Run from Here, Run to Here) and
  **Format** (Format Document, Format Document With…).

**Run from Here** runs the script from the statement under the cursor to the end, **Run to
Here** from its start through that statement, each selected first so you see what runs. A
script that stopped at a failed statement goes on from it once you fixed it.

![The editor's right click in three parts, each headed by what it acts on: the statement, the word under the cursor, the whole script](media/editor-menu.webp)

Then the clipboard (with Paste as Table… and Insert Annotation), and **Lens and Gutter**, the
lens's own list of what shows above and beside each statement. The statement's rows do exactly
what its lens items and gutter buttons do, so switching the lens and the gutter off costs you
nothing. The Command Palette left the menu: F1 opens it.

A statement's row in the Outline and in the Explorer has the same rows in the same words:
**Explain** is there now, and in the Outline **Add to Diagram…** too.

### Explain Analyze says what it wraps

Explain Analyze really runs the statement. An `INSERT`, `UPDATE`, `DELETE`, `MERGE` or `CREATE
TABLE AS` runs between `BEGIN` and `ROLLBACK`, so it changes nothing; a `SELECT` always runs as
written. The Explain item's tooltip says which it will be for that statement before you click,
and the Log records what ran, with its SQL.

### A pane closes from its header

Properties, Objects or any pane stacked with another in a sidebar has a **×** in its header: it
leaves the group and stays a tab of the sidebar.

### A query for a diagram is written in a script

A query card's SQL used to be typed on the card itself, with no completion, no checks and no
formatting. A query is now written where the editor helps: a diagram's **Insert ▸ Query…**
and **Add Query Here…** open a new script on the diagram's connection. Write the query, run
it, and **Add to Diagram…** lists that diagram first, so one Enter puts the card there (where
you asked, for Add Query Here).

A card from a script is edited in its script, as before. A card of its own (detached, or made
on the canvas by an earlier version) keeps its SQL as it is and still runs it: a double click
or **Open as Script** opens the SQL in a new script, to be written again and added back.

### A selection on a diagram is a solid outline

A table not created yet is drawn with a dashed blue border, and a selected one was marked by a
dashed blue outline too, its dashes walking. With the motion off they looked the same. Now:

- **A selection is a solid outline** with a square handle at each corner, around a table, a
  note, an area or a schema's frame.
- **A selected line is drawn wider**, with its handles as before.
- **Dashed blue means only one thing:** a table, a column or a foreign key not in the database
  yet. A new table that is selected shows both, its dashed border and the solid outline.

The setting that stopped the walking dashes is gone, with nothing left to move.

## Fixed

- **No Writing Tools button in the editor on macOS 27.** Apple Intelligence's Writing Tools
  showed its button beside selected text again in the desktop app. The editor is code, with
  nothing for it to rewrite: it is switched off again.
- **Extension refactors are no longer stopped for waiting their turn.** The lightbulb, a right
  click and a selection ask an extension's refactors at the same moment, and the extension
  answers them one after another; the last ones in line were stopped with "refactor ran longer
  than 2000 ms" though each took milliseconds. Each question now waits its turn before its time
  starts, and the same question asked twice is asked once.
- **No false syntax error in a SQL function's body.** A function returning `table (type text,
  ...)` whose body wrote `... end as type` was marked with "syntax error at or near "("", although
  it ran fine: the body's check took the column alias for a reference to the result column.
  Aliases and the result's columns are left as written now.
- **Tabs in one row keep their names.** With the editor tabs on one row, many open tabs shrank
  until each showed a single letter of its name. A tab now keeps the width its name needs and
  the row scrolls with its arrows instead, as in VS Code.
- **Types offered after RETURNS.** Writing a CREATE FUNCTION, the completion after `RETURNS`
  (and after a parameter's name) offered functions. It offers types now, `void`, `trigger`,
  `record`, `setof` and `table (...)` among them.

- **Paste on a diagram after a copy elsewhere.** Once you had copied a table that was on the
  diagram already, Paste stayed disabled, even after you copied something else since. Any other
  copy now lets Paste try again.

- **Fit the Diagram takes in every table.** After the diagram changed while zoomed in (a new
  table made, say), Fit the Diagram left out the tables out of sight, and a fit that had waited
  for them could take the view back much later. Every table is fitted now, at once.

- **Pick a column's type from a list.** In the desktop app the type fields of a table's Design
  and of Properties showed no list of types, and took any word as a type. Every such field now
  shows its own list (click it, or start typing to narrow it), and a type neither PostgreSQL nor
  your database knows is marked at once.
- **No lines between a diagram card's rows.** In the desktop app, thin lines in the accent
  color could run between the rows of a card with pending changes (or with changes since the
  diagram recorded it), darker or lighter depending on the zoom. They are gone. A new table's
  rows are no longer marked one by one either: its dashed border and New flag say it is new.
- **What you type stays as you typed it.** In the desktop app on macOS, writing a note's words on
  a diagram offered the system's autocorrect and capitalized the first word. Every field now
  takes plain text, a note's words and the fields a result view draws included: no autocorrect,
  no capitals, no smart quotes or dashes, no text replacement, no spell check.
- **A new column takes its keys with it.** Removing a column that was not created yet left its
  foreign key (or another key on it) behind, and the Changes script failed on a column that was
  gone. They go with the column now.
- **A list opens while a diagram's note is being edited.** In the desktop app, choosing a
  card's connection while a note's words were open for editing showed no list and logged
  "Quick input service needs a focused editor to work." The list opens now.
- **Compact tabs sit on the strip.** With compact tabs, a thin line showed under the active
  tab. It joins the editor below now, as a large tab does.
- **No empty errors in the Log.** A harmless note of the browser ("ResizeObserver loop completed
  with undelivered notifications") showed as an error with "undefined" under it. It no longer
  shows, and no error says "undefined" for want of anything else to say.
- **The problems count in the status bar closes Problems too.** A click on "2 problems, 1
  hint" opened the Problems tab, but nothing closed it there. It is a switch now: pressed while
  Problems is open, and a second click hides it.
- **Drag a note onto any card.** A note dragged onto a table's card attached to it with its
  arrow, but not onto a query card, a script card or another note. Every card takes it now,
  the note drawn over the card rather than hidden under it, and a query or a script card
  dragged onto a table attaches as a note does.
- **Typing in a long script is fast again.** In a script of a few thousand statements (a
  migration, a dump of a few hundred KB), every key you pressed could stall the editor for
  about a second. It answers at once now.

## Tell us what you think

Questions and ideas go to
[Discussions](https://github.com/hercstack/plumesql/discussions), bugs to
[Issues](https://github.com/hercstack/plumesql/issues) or Report a Bug in
the app's menu. The video tour is on
[YouTube](https://www.youtube.com/@plumesql).
