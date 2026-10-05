# PlumeSQL 0.22.2

The `plumesql` command sets itself up, PlumeSQL finds the tools your
terminal finds, and you can work with your global scripts alone, no
folder needed.

## The plumesql command, ready to go

PlumeSQL adds the `plumesql` command for you, with no password and no
terminal: it did so on this start, unless you already had it. Open a
new terminal and type `plumesql .` in any directory to open it as a
workspace.

- **macOS and Linux:** the command is linked into `~/.local/bin`. If
  your shell did not look there yet, PlumeSQL added one line to your
  shell profile (`~/.zprofile` for zsh on macOS), marked
  `# Added by PlumeSQL`. Delete that line to undo it.
- **Windows:** PlumeSQL's folder is added to your user PATH. No
  administrator needed.

The Log says exactly what was changed, and it is never done twice. To
check or redo it, open **System > Command line**: it shows what it
would change before changing anything.

## Your tools are found on macOS and Linux

Started from the Dock or a launcher, PlumeSQL now uses the same PATH as
your terminal. So **System > Client tools** finds Homebrew, and command
extensions find pg_dump, psql and the rest wherever your shell does.

## Work without a folder

PlumeSQL no longer needs a folder. Without one, the Explorer shows your
**global scripts** and nothing else, while connections, the object
browser, the terminal and the Log work as usual. The window keeps its
tabs and layout, and the next start comes back to it, just like a
folder.

To try it, choose **File > Close Folder**. To open a folder again, click
**Open Folder** in the status bar: one list with **Open Folder…** on top
and your recent workspaces below. The Explorer's **···** menu has the
same, and **File > Open Folder…** opens a folder in the current window.

A first start with nothing to reopen now opens without a folder too.

## Also in this release

- **No more piles of empty scripts.** New Script in the Explorer opens
  an empty script that is already there instead of making another, like
  the **+** on the tab strip does.
- **The script count includes your global scripts.**

## Fixed

- Moving the terminal into a tab no longer leaves an empty terminal
  panel behind. The panel closes, as in VS Code, and opens a fresh shell
  the next time you open it.

## Tell us what you think

Questions and ideas go to
[Discussions](https://github.com/hercstack/plumesql/discussions), bugs to
[Issues](https://github.com/hercstack/plumesql/issues) or Report a Bug in
the app's menu. The video tour is on
[YouTube](https://www.youtube.com/@plumesql).
