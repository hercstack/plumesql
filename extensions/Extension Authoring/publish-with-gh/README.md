# Publish with gh

Send one of your own extensions to the PlumeSQL marketplace as a pull request, without leaving PlumeSQL: the GitHub CLI does the fork, the copy, the branch, the push and the pull request in a terminal, every step named as it runs.

## When to use it

- **Your extension is ready**: **Prepare to Publish** said so, and you want it in the marketplace for everyone.
- **A new version**: bump the version in its manifest and run this again; the pull request follows.

## What it does

Sits in the row menu of every extension of yours (`@for my extension`):
right-click one, Run Publish with gh, confirm, and one `bash` line runs
in a terminal tab, on that extension:

1. checks that the extension is there (`{mine}/{name}/manifest.json`,
   `{name}` being the row's id), that `gh` is installed and signed in;
2. reads the category and the version from the manifest;
3. forks `hercstack/plumesql` under your account, once (a second run
   finds the fork);
4. clones the fork, shallow, into a temporary directory and starts a
   branch `ext/<id>` from the marketplace's `main`;
5. copies your extension into `extensions/<Category>/<id>`, leaving
   `PUBLISH.md` behind (it is yours, not the marketplace's);
6. runs the marketplace validator, `node extensions/tools/catalog.mjs
   --check`, and stops on anything it refuses;
7. commits `ext: <id> <version>`, pushes the branch to your fork, and
   opens the pull request against `main`, its body your `PUBLISH.md`.

The terminal shows each step; an alert says when the pull request is
open, or that something stopped it and the terminal has why.

## Inputs

None: the extension it publishes is the row it was opened on.

## Good to know

- The branch on your fork is force-pushed on every run, so publishing
  a new version is running this again with the version bumped in the
  manifest; the pull request follows the branch.
- A pull request already open for the branch makes `gh pr create` stop
  with its address; push it again from the branch to update it.
- The reviewer opens the extension's Discussions thread and fills in the
  manifest's `discussion` number before the merge; leave it at 0.
- Recommended to whoever has extensions of their own (the manifest's
  `recommend: ["my-extensions"]`), shown to nobody else.

## Requirements

- The GitHub CLI, `gh` (https://cli.github.com), signed in (`gh auth
  login`) to the account that will own the fork.
- `git` and `node` on the PATH: the clone, the commit and the
  marketplace validator.
- An extension in My Extensions that Prepare to Publish left ready: a
  complete manifest, a README. The validator runs again here and stops
  the run on a problem before anything is pushed.
- No database connection: the command spends none of the connection's
  placeholders.
