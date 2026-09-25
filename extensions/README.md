# PlumeSQL extensions

This directory is the PlumeSQL Extensions Marketplace: every extension the
app's Extensions side tab can install, one directory each, described by a
`manifest.json` and a `README.md`. The directories and their manifests are
the source of truth. After every merge to `main` a workflow builds the
INDEX the app reads and publishes it to the `catalog` branch: a slim
`catalog.json` for search and the list, and one `locks/<id>.json` per
extension with the hashed file list and everything else an install needs.
No pull request ever touches the index. The app fetches the catalog from
that branch and the files from the commit the lock names, verifies every
hash, and keeps what it installed in its own store. Nothing here is
compiled or bundled: an extension is the text file PlumeSQL reads.

Three kinds of extension exist, named by their double extension:

- a **query extension**, `<id>.plumesql.sql`: a saved query with its
  annotations, answered by a live grid (and its buttons, timers, views);
- a **command extension**, `<id>.plumesql.run`: a saved command line with
  its annotations, answered by a terminal;
- a **grid extension**, `<id>.plumesql.js`: a JavaScript module that
  formats result columns, adds computed columns or draws a result view.

The annotation format is specified in PlumeSQL's `docs/ACTIONSPEC.md`, the
grid module format in `docs/GRIDJSSPEC.md`, and the marketplace itself in
`docs/MARKETPLACE.md`. The Annotations Reference inside the app (command
palette, "Annotations Reference") is generated from the same registry.

## Layout

```
extensions/
  README.md                        this file
  tools/catalog.mjs                the validator, and the index generator CI runs
  tools/execute.mjs                runs every query extension on a PostgreSQL matrix
  <Category>/<id>/manifest.json    the extension's metadata
  <Category>/<id>/<id>.plumesql.*  the extension itself (a grid extension may add helper .js files)
  <Category>/<id>/README.md        the page the app shows in the extension's details
  <Category>/<id>/media/           screenshots and clips the README references

the `catalog` branch (published by CI, never edited):
  catalog.json                     the slim search index (JSON with a comment header saying what generated it): id, kind, version, name, description, categories, tags, requires, path, featured, lockSha256
  locks/<id>.json                  per extension: the hashed file list, dependencies, permissions, discussion, author, license, the commit
```

`<Category>` is the extension's primary category, and a category IS a
directory under `extensions/`: nothing is listed anywhere. The directory name IS the extension id: lowercase letters,
digits and single hyphens, 3 to 48 characters, unique across the whole
marketplace whatever the category, permanent.

A new category is a new directory in the pull request that adds its
first extension, and the review decides whether it deserves one. The
validator asks only that the name reads as a category (words of letters,
digits and underscores separated by single spaces, at most 40
characters, shown in the app exactly as spelled), that no two
directories differ only in case, spacing or underscores, and that no
category directory stands empty.

## Contributing an extension

The marketplace is curated: anyone may propose an extension in a pull
request, a maintainer reviews it, and the merge is what the app trusts.
The review is real. It checks that the extension does what its README
says and nothing else, that no statement changes or deletes anything
without a `@confirm`, that nothing leaves the database or the machine
except through what the README declares, that every reference is
schema-qualified (`pg_catalog.pg_class`, never a bare name), and that the
documentation lets a reader use it without opening the code.

The checklist, every item of which the validator or the reviewer checks:

1. **The directory**: `extensions/<Category>/<id>/`, the id following the
   rules above, no other extension with that id anywhere (the validator
   refuses a duplicate and a retired id).
2. **The main file**: `<id>.plumesql.sql`, `<id>.plumesql.run` or
   `<id>.plumesql.js`, starting with its `@description` line. Comments in
   the code say WHY, briefly, never what; the README carries the prose.
3. **`manifest.json`** (schema below), `format: 1`, every field the
   validator wants, a bumped `version` on every change to the files.
4. **`README.md`** following the template below, with at least one
   screenshot in `media/`. A logo is welcome too: a square `icon.svg`
   or `icon.png` beside the main file (at most 64 KB, listed in `files`,
   named by the manifest's `icon`).
5. **A discussion thread**: category "Extensions" in this repository's
   Discussions, titled exactly the id; its number goes into the manifest's
   `discussion`.
6. **The validator is green**: `node extensions/tools/catalog.mjs --check`
   passes locally; the `validate` workflow runs the same on the PR. Do not
   add a catalog file: the index is built after the merge.
7. **It executes**: a query extension runs on PostgreSQL 13 to 18 (the
   `execute` workflow), or skips with a reason where a PostgreSQL extension
   it needs is missing; locally, point `tools/execute.mjs --pg
   host:port:db:user:password` at a server.
8. **The review**: a maintainer reads the code and the README against the
   rubric above.

## `manifest.json`

```json
{
  "format": 1,
  "id": "blocking-locks",
  "kind": "query",
  "version": "1.0.0",
  "plumesql": ">=0.21.0",
  "name": "Blocking locks",
  "description": "Backends waiting on a lock, and the backend holding it.",
  "categories": ["Activity"],
  "tags": ["locks", "activity", "pg_stat_activity"],
  "requires": { "pgExtensions": [], "pgVersion": ">=13" },
  "files": ["blocking-locks.plumesql.sql"],
  "dependencies": [],
  "permissions": { "fork": true },
  "discussion": 0,
  "author": { "name": "PlumeSQL", "url": "https://plume.hercstack.com" },
  "license": "MIT",
  "featured": false
}
```

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Always `1` for now. |
| `id` | yes | The directory name. |
| `kind` | yes | `query`, `command` or `grid`, matching the main file. |
| `version` | yes | Semantic version of this extension; bump it on every change to any file except README and media. |
| `plumesql` | yes | The minimum PlumeSQL version, `">=X.Y.Z"`. |
| `name` | yes | Display name, at most 40 characters, no trailing period. |
| `description` | yes | One sentence, at most 140 characters. |
| `categories` | yes | The directory's category first, others after. |
| `tags` | no | Up to 12 lowercase words for search and recommendation. |
| `requires` | no | `pgExtensions` the database must have (drives recommendation), `pgVersion` the minimum server. |
| `files` | yes | Every installed file, the main file first; not manifest, README or media. |
| `dependencies` | no | Ids of marketplace extensions this one references (`@extension <id>`, `import '$ext/<id>/...'`). The validator checks the list against the code both ways. A command extension has none and is none. |
| `permissions` | no | `{ "fork": true }`: whether the app offers copying the extension into the user's Scripts as a file. Default true. |
| `discussion` | yes | The number of the extension's Discussions thread (category Extensions, title the id). |
| `author` | yes | `name`, optional `url`. |
| `license` | yes | An SPDX identifier. |
| `featured` | no | Maintainers only: shown first under Recommended. |
| `recommend` | no | App-side signals that put the extension under Recommended, a list of known words: `my-extensions` (the user has extensions of their own). An unknown word fails validation. |
| `forkedFrom` | no | The id the extension was copied from in the app, informational. |
| `icon` | no | The logo: a square PNG or SVG in the directory (not under `media/`), at most 64 KB, listed in `files` so it installs and is hashed like the rest. Without one the app draws the kind's glyph. |
| `externals` | when the code loads any | Every external library the extension loads at run time, as https URLs: a view's `scripts: [...]`, an `import` from a CDN. The validator checks the list against the code both ways. The app shows them, with their hosts, under Dependencies, and offers to allow the hosts. |

Unknown fields fail validation.

## `README.md` template

```markdown
# <Name>

<The description sentence, then one or two more: what question it
answers, when a DBA reaches for it.>

![<Name>](media/<id>.png)

## What it shows

<The columns or the chart, in words. What a row means. What the colours
or the buttons do.>

## Inputs

| Input | Default | Meaning |
|---|---|---|
| <name> | <default> | <what it changes> |

## Requirements

<PostgreSQL version, extensions the database needs, privileges the user
needs (for example pg_read_all_stats), what the command needs installed
locally for a command extension.>

## Notes

<Limits, caveats, what it does NOT do. A `@refresh` timer, a `@toolbar`
pin, what the buttons write and how they ask first.>
```

Screenshots are taken in the app at the default dark theme, 1440x900,
cropped to the result. A short clip (gif or webm) is welcome where motion
says more than a picture (a refreshing dashboard, a form, a chart).

## The tools

```
node extensions/tools/catalog.mjs --check       validate every manifest and file
node extensions/tools/catalog.mjs --write       validate, then build the index locally (extensions/catalog.json
                                                and extensions/locks/, both gitignored) for a PlumeSQL dev build
                                                pinned at this directory
node extensions/tools/execute.mjs --pg host:port:db:user:password[,...] [--only <id>]
```

The validator's rules are listed in PlumeSQL's `docs/MARKETPLACE.md`,
section 12. A checkout that is not yet published may pass
`--allow-missing-discussion` while its threads are being opened; the
workflows never do.

The `publish catalog` workflow builds the index after every push to
`main`, pinned to that push's commit, and force-pushes it as the single
commit of the `catalog` branch. Nobody edits that branch.
