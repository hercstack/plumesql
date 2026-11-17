# PlumeSQL 0.33.0

## Highlights

- **Properties from a right click:** a table, a schema or a file shows its properties from
  its menu.
- **A shorter right click in Objects:** an object's menu in groups, eighteen entries instead of
  twenty-seven.

## Properties

### Properties from a right click

Right-click an object or a schema in Objects, or a file in the Explorer, and choose
**Properties**: PlumeSQL opens it as a click would and shows the Properties tab beside it, even
when you had switched the tab off. A schema's Properties are the schema's own, its comment
ready to edit. From Objects, Properties opens below the tree, so the row you asked about stays
in sight, and the × in its header closes it there. When Properties already shows it, the menu leaves the entry
out, and the same goes for a diagram's Display, Line or Note Properties and for Editor
Properties.

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

## Fixed

- **Drag a note onto any card.** A note dragged onto a table's card attached to it with its
  arrow, but not onto a query card, a script card or another note. Every card takes it now,
  the note drawn over the card rather than hidden under it, and a query or a script card
  dragged onto a table attaches as a note does.

## Tell us what you think

Questions and ideas go to
[Discussions](https://github.com/hercstack/plumesql/discussions), bugs to
[Issues](https://github.com/hercstack/plumesql/issues) or Report a Bug in
the app's menu. The video tour is on
[YouTube](https://www.youtube.com/@plumesql).
