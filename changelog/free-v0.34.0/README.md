# PlumeSQL 0.34.0

## Highlights

## What changed

### A menu bar that fits beside the camera

The menu bar had grown to ten titles, and on a MacBook Air with a camera notch the last ones
moved to the right of the camera. It has eight now: **File, Edit, View, Go, Run, Database,
Window, Help**.

- **Database** holds what Connection, Diagram and Dictionary held: your connections first (New
  Connection…, Switch Connection for This Tab, Disconnect, Check Connections), then **Add to
  Diagram…** with a **Diagram** submenu for the diagram in front, and **Add to Dictionary…**
  with a **Dictionary** submenu for the dictionary in front.
- **Selection** is a submenu at the end of **Edit**, with the same items and shortcuts, and
  **Select All** stands in Edit itself, after Paste.

Every item is in the Command Palette too, and on Windows the menu bar no longer folds into one
button in a window of ordinary width.

### Every layout from the View menu

**View ▸ Layout** lays the window out every way PlumeSQL can, without hunting for the right
button or command:

- each sidebar, the bottom panel, Properties and the extensions toolbar, on and off;
- the arrangements: **Everything Left**, **Everything Right**, **Split** (files left, database
  right), **Write** (the editor takes the room) and **Inspect** (the results take the room);
- **Tab Layout**: a single row, multiple rows, vertical on either side, and small tabs;
- **Hide Sidebars and Panel**, **Zen Mode**, and **Reset Layout** to start over.

## Fixed

- **Release notes keep every section.** A line that began with a code span of backticks made
  the notes' contents stop there and showed everything after it as code: 0.33.0's notes listed
  Highlights and Diagrams alone. Markdown is read the way GitHub reads it now, in the release
  notes, an extension's README, a Database Dictionary and the Markdown editor's colors.

## Tell us what you think

Questions and ideas go to
[Discussions](https://github.com/hercstack/plumesql/discussions), bugs to
[Issues](https://github.com/hercstack/plumesql/issues) or Report a Bug in
the app's menu. The video tour is on
[YouTube](https://www.youtube.com/@plumesql).
