# PlumeSQL 0.24.1

A signed and notarized Mac app, updates you can count on, and tables
and files that read right.

## Highlights

- **macOS:** PlumeSQL is signed and notarized by Apple. It opens on the
  first double click.
- **Updates:** System shows a new release the moment it is out, and an
  update on Windows installs without stopping on a busy file.
- **Results:** formatted columns are as wide as what they show.
- **Files:** a CSV opens as plain text and shows in the Explorer.

## A notarized Mac app

### macOS opens PlumeSQL on the first double click

The Mac app now carries a Developer ID signature and Apple's
notarization. Open the DMG, drag PlumeSQL to Applications and start it:
no right click and Open, no warning about an unidentified developer.
If you cleared the quarantine flag by hand for an earlier release, you
no longer need to.

## Updates you can count on

### The update check reads the releases themselves

**System > System information** asks GitHub for the latest release,
where every PlumeSQL release is published, and only falls back to
plumesql.com when GitHub does not answer. A new release shows up there
as soon as it is out.

### Windows updates install cleanly

An update could stop on **Error opening file for writing** with Abort,
Retry and Ignore: the installer reached PlumeSQL's server while it was
still shutting down. The app now stops its server and waits for it
before the installer starts, and the installer stops a server still
running from its folder, so this very update is covered too.

## Tables and files that read right

### Formatted columns fit what they show

A column dressed by a formatting extension was sized from the server's
raw text: a sparkline's column as wide as its numbers written out,
trend arrows, percentages with their bars and money in long formats cut
at the edge until you dragged it wider. The grid now measures what the
cells show, for the first width and for a double click on the header's
edge.

### CSV files open as text and show in the Explorer

A CSV opened in the editor was coloured as SQL: `AS` and `IN` read as
keywords and an apostrophe turned the rest of the file into a string. A
CSV, a TSV, a log and every other file that is no SQL now opens as
plain text, without lenses or a connection. CSV and TSV files also show
in the Explorer by default, so the file **Export to CSV** just wrote is
right there.

## What changed

### A slow Explorer start leaves a record

Listing the SQL Explorer takes a fraction of a second. When it takes
longer than five seconds, the Log says how long and which part held it
up.

## Fixed

- **A view's rows no longer offer New row, Edit and Delete.** Results
  read from a view such as `pg_stat_activity`, or from a materialized
  view, showed the edit buttons, and every edit failed. Tables,
  partitioned tables and foreign tables stay editable.
- **A word in a comment no longer opens PostgreSQL's card for it.**
  Hovering `xml` in `-- @extension xml` showed the `xml()` function and
  hid the quick fix that installs the extension.
- **No Writing Tools badge beside the caret** in the macOS app.
- **No writing suggestions in the editor**: Edge's text prediction in
  the Windows app and WebKit's inline predictions on macOS stay out of
  SQL.
- **No autofill or "Save password?"** in the Windows app.
- **The release notes list the other versions without GitHub's limit.**
  A network that had spent GitHub's hourly allowance got `HTTP 403` in
  the Log; the list now comes from a file published beside the
  marketplace catalog.
- **Dump objects shows `plumesql`**, not the path it is installed at,
  which on Windows put your user name on screen.

## Tell us what you think

Questions and ideas go to
[Discussions](https://github.com/hercstack/plumesql/discussions), bugs to
[Issues](https://github.com/hercstack/plumesql/issues) or Report a Bug in
the app's menu. The video tour is on
[YouTube](https://www.youtube.com/@plumesql).
