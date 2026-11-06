# PlumeSQL 0.31.0

The buttons beside a statement now stand on its code, and they work with what
you selected.

## Highlights

- **Buttons on your code:** the lightbulb and Format start on a statement's first
  line of code, not on the comment above it.
- **Run, Format and Explain follow your selection:** mark part of a statement, or
  several statements, and that is what they act on.
- **Line numbers that match PostgreSQL:** a statement's own numbers now count from
  its code, as `LINE n` in an error does.

## The buttons beside a statement

### They stand on your code

A comment above a statement pushed the lightbulb and Format up onto the comment,
away from the code they work on. A long comment could push them out of sight. They
now start on the statement's first line of code, right under Run and Explain.

![A statement with two comment lines above it: the lens sits right above select, the lightbulb beside select on line 3, Format beside from on line 4, and the comment lines carry no statement number](media/gutter-code-line.webp)

A one-line statement has room for one button, now with or without a comment above
it.

### They act on what you selected

While a selection touches a statement, its buttons and the row of commands above it
work with the selection:

- **Run** runs what is selected, as ⌘Enter does, and the selection stays.
- **Format** formats every statement the selection touches.
- **Explain** explains the selection when it is one statement, such as a subquery
  you marked. For a word, or for several statements, it explains its own statement:
  EXPLAIN covers one statement, and whatever came after it would really run.
- **The lightbulb** lists what the selection offers, as it already did.

Select and Copy still take the whole statement. A button's tooltip says which you
get.

### A selection across statements keeps them close

Select across statements and the buttons move to the first line of your selection.
Before, they ended up on the last statement, far from where you started. You get the
three that can work on all of it: the lightbulb, Run and Format.

![Two update statements selected: the lightbulb with its blue dot beside the first selected line and Format beside the second](media/gutter-across.webp)

## Fixed

- **A statement's line numbers match PostgreSQL's.** The second number in `3·1`
  counted from the comment above a statement. It now counts from the first line of
  code, which is what runs, so it matches `LINE n` in PostgreSQL's errors. The
  comment's lines have no statement number.

## Tell us what you think

Questions and ideas go to
[Discussions](https://github.com/hercstack/plumesql/discussions), bugs to
[Issues](https://github.com/hercstack/plumesql/issues) or Report a Bug in
the app's menu. The video tour is on
[YouTube](https://www.youtube.com/@plumesql).
