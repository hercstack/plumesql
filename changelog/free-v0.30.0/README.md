# PlumeSQL 0.30.0

Edit a table's rows right in the results grid, as in a spreadsheet. A
LEFT JOIN that quietly turns into a JOIN is caught, the row editor shows
the SQL it runs, and PlumeSQL now opens in your theme from the very first
frame.

## Highlights

- **Inline editing:** change cells, add and delete rows in the grid,
  then save it all in one transaction. Or keep the form: you choose the
  default.
- **A LEFT JOIN its WHERE undoes:** a warning on the condition, and one
  click moves it where it keeps the rows you meant.
- **The SQL of a row edit:** the form shows the UPDATE or INSERT it will
  run, to read, copy or open as a script.
- **No more flash on start:** the window opens in the theme you chose,
  not in the default one for a moment first.

## Edit rows right in the grid

The rows of a table can now be edited where they stand, in the results
grid, as in a spreadsheet. The row form stays, and you decide which of the
two you want.

![The results of select * from public.tour_film in Inline mode: a new row at the top with its language_id reading required in red, a changed title and rental_rate in amber, row 6 struck through for deletion, and the bar above the grid reading 4 changes not saved, 1 value required, with SQL, Revert and Save](media/inline-edit.webp)

**One click to switch.** Above the rows of a table you can edit, the edit
buttons start with the mode: **Form** or **Inline**. A click switches to
the other. Its arrow holds the Edit Mode menu.

![The arrow beside Inline opened: In the Form, Inline ticked, Save Each Change at Once, and Editing Settings](media/edit-mode-menu.webp)

**Edit as in a spreadsheet:**

- Type over a cell, or press Enter, F2 or double-click to edit it in place.
- Enter commits and moves down, Tab moves right, Escape cancels.
- ⌘Z or Ctrl+Z takes back the last change.
- The cell's menu has Set NULL, Set DEFAULT and Revert Cell.
- An enum's labels, a date's picker and a foreign key's table are one
  Alt+Down away, as in the form.

**Nothing is written until Save.** A changed cell turns amber and the bar
above the grid counts it. **New row** opens a row at the top, a value it
still needs in red. **Delete** strikes a row through. **Save** (or ⌘Enter,
Ctrl+Enter in the grid) writes it all in one transaction, all or nothing,
and **Revert** takes it back. **SQL** shows the script Save runs, to copy
or open as a script.

**Safe when someone else edits too.** Every row is checked from the moment
you start editing. A Save that meets a row someone changed meanwhile
writes nothing, and the row is marked.

**A value the column refuses never gets in.** A word in a number, a month
13, an enum label with the wrong case: the cell stays open and says why.

![The rental_rate cell of row 9 open with cheap typed in it, and under it in red: rental_rate: not a number. Correct it, or press Escape](media/inline-refused.webp)

**Or save each change at once.** With **Save Each Change at Once** in the
Edit Mode menu, a cell is written as you finish it, a new row when you
leave it, a deleted row once you confirm. On a connection whose production
guard asks before data changes, everything still waits for Save.

**From the form too.** **Edit inline** in the row form switches the tab to
Inline and brings what you typed there along.

Inline editing needs the table's primary key or a unique key among the
result's columns. Without one, the form edits the rows as before.

### Choose your default

The Edit Mode menu changes one tab. These settings decide how every tab
starts: in the form or inline, and when inline changes are written. To set
them for one workspace only, use **Editing Settings** in the same menu.

```setting
results.editMode
results.inlineSave
```

## A LEFT JOIN its WHERE undoes

One of the most common mistakes in SQL, and it gives no error:

```sql
select c.customer_id, c.last_name, p.amount
from customer c
left join payment p on p.customer_id = c.customer_id
where p.amount > 5;
```

The LEFT JOIN keeps every customer, a customer without such a payment
with every `p` column NULL. Then the WHERE runs, `NULL > 5` is never true,
and those customers are gone again: the query returns exactly what a plain
JOIN would.

The editor now marks such a condition with a warning, also in Problems,
and the lightbulb (⌘. or Ctrl+.) offers the fix:

- **Move p.amount > 5 into the LEFT JOIN's ON:** `left join payment p on
  p.customer_id = c.customer_id and p.amount > 5` keeps every customer,
  with their payments over 5 when they have any. Most often what was
  meant.
- **Change LEFT JOIN p to JOIN:** the same rows it returns now, but the
  query says so.
- **Write ... IS DISTINCT FROM ...**, for a `<>`: `d.name is distinct
  from 'HR'` keeps the rows without a match too.

What lets a NULL through on purpose is left alone: `where p.payment_id is
null` (the customers without a payment), `is distinct from`, `coalesce`,
a condition inside OR. It reads your query with PostgreSQL's own parser
and sends nothing to the server.

```setting
editor.flagLeftJoinUndone
```

## The SQL of a row edit

In the form that edits or inserts a row, **SQL** at the bottom shows the
statement **Update** or **Insert** will run, and it follows as you type.
**Copy** puts it on the clipboard. **Open as Script** opens it in a new
script on the same connection, where it runs only when you run it.

![The Edit row form for public.bookings with two fields changed and SQL open: a comment saying it changes nothing if the row changed since it was read, then update public.bookings set guest and details where id = 1 and xmin::text = 2909, with Concurrency check ticked beside Copy and Open as Script](media/row-edit-sql.webp)

An update keeps the check PlumeSQL makes on every edit:
`xmin::text = '...'` makes it change nothing if someone changed the row
after the form read it, so a copied statement is as safe as the button.
Untick **Concurrency check** to leave it out of the SQL. **Update** itself
always checks, and the Log records each edit the same way, check included.

## Your theme from the first frame

With a theme other than the default, every start used to show the default
theme for a moment, the desktop app's splash in dark, before your own
theme took over. A short but jarring flash.

PlumeSQL now keeps the look of the theme it showed last and paints it
before anything else: the desktop app's splash while the app starts, then
the window itself. Your settings still decide, so a theme you change takes
effect as before, and the next start opens in it.

This works for the built-in Dark and Light and for every theme extension
from the Marketplace.

## What changed

### Quick fixes say what they write

The rewrite of a SQL function's string body now reads **Rewrite the body
as SQL-standard RETURN a + b** and **Rewrite the body as SQL-standard
BEGIN ATOMIC ... END**: `RETURN a + b` is the SQL-standard body of a
`LANGUAGE sql` function, not PL/pgSQL's RETURN, and the title now says so.
Concatenate the selected columns names each form and what it does with a
NULL (`concat_ws` skips it, `||` gives NULL), and the LEFT JOIN fixes say
which rows each one keeps.

### A refused edit leaves its line in the Log

When the server refuses a row edit, a duplicate key for example, the form
shows its error where you are looking and stays open for you to fix it.
The Log now records it as well, with the statement that was tried, so a
failed write leaves a trace like a successful one. The entry arrives
already dismissed: you read it in the form, so the Log does not open for
it.

### New row, Edit and Delete beside the other actions

Above the rows of a table you can edit, **New row**, **Edit** and
**Delete** were an outlined group in the middle of the bar, the only
control with a border there. They are now flat like the copy and save
buttons and stand on the right beside them, after the edit mode: the left
of the bar tells what ran, the right holds what you can do. In a narrow
pane they keep their icons.

![The bar above the rows of public.tour_film: SELECT public.tour_film and its run time on the left; Form with its arrow, New row, Edit and Delete on the right, flat, beside the copy, open in tab and more buttons](media/row-actions-right.webp)

### Only a query that reads one table edits its rows

A result used to be editable whenever its columns came from one table,
even from a join: `select f.* from film f join film_actor fa ...` shows a
film once for each of its actors. Editing one copy left the others showing
the old value.

Now a result is editable, in the form and inline alike, only when its
query reads one table alone: no join, no UNION, DISTINCT or GROUP BY, no
set-returning function such as `unnest` in the select list, no subquery or
CTE in FROM. Where it is not, the bar says **Not editable** where the edit
buttons stand, and its tooltip says why. To edit the films of that join,
read the table alone and filter with a subquery, which stays free:

```sql
select f.*
from film f
where exists (select 1 from film_actor fa where fa.film_id = f.film_id and fa.actor_id = 1);
```

### A foreign key field has a pick button

In the row form, a foreign key's box now has a pick button beside it, like
an action form's pick. It opens the table the key references to pick the
value from.

### The Objects tree follows a result grid too

With Follow the editor on, clicking into a script's result grid lights
the table its rows come from in the Objects tab, the way the editor's
cursor lights the object it stands on. Back in the editor, the tree
follows the cursor again.

### The editor's settings in four categories

The Editor settings had grown to 74 in one list. They are now four
categories:

- **Editor:** text, display, running and comparing.
- **Assistance:** completion, hovers and inlay hints.
- **Toolbar and Lenses:** the lenses, the gutter buttons, the lightbulb
  and the toolbar.
- **Checks:** every check the Problems tab shows, the parser's included.
  It takes over Parser, also in the connection and group editors.

Every link into these settings opens where the setting now lives, and the
keys are the same, so nothing you set is lost.

### A calmer Search pane

The Search pane's results read more easily, above all in a narrow pane:

- **No indentation in front of a match:** the line starts with its code,
  so the match and what follows it stay in sight.
- **No workspace name on every file:** a file of the workspace shows only
  its folder, and nothing at the top level. Scripts, Workspace Scripts and
  Objects keep their names.
- **Quieter counts:** a file's number of matches is a plain number, the
  way the trees count, not a colored badge.
- **References counted as what they are:** "in 20 scripts and 14
  objects", where the objects' DDL used to count as scripts.

## Fixed

- **A range from a frozen row selects what you dragged over.** A selection
  dragged from a row frozen at the top into the rows below took every row
  whose number fell between the two ends, often far more than you saw. It
  now takes the rows between them as shown, and Copy keeps that order.
- **The row form checks a domain as its type.** A column of a domain over
  a number, a `year` for example, took a word in the form, and only the
  server refused it on Update. The form now marks it at once, as it does
  for a plain number.
- **Search matches wear the editor's find colors.** The Search pane, the
  Log's filter and a page's find marked their matches in a color of their
  own. They now use the editor's find colors, your theme's included, and
  the file a search result opens shows its matches in them while the
  Search pane is open, the one you clicked as the current match.

## Tell us what you think

Questions and ideas go to
[Discussions](https://github.com/hercstack/plumesql/discussions), bugs to
[Issues](https://github.com/hercstack/plumesql/issues) or Report a Bug in
the app's menu. The video tour is on
[YouTube](https://www.youtube.com/@plumesql).
