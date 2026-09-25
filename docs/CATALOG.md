# The PlumeSQL Extensions Marketplace: the public repository

What an extension author or a reviewer needs of the marketplace
specification: the repository's layout, `manifest.json`, the index the
application reads and what the validator and the public CI enforce.
These are sections 3, 4, 5 and 12 of the full specification, kept in
PlumeSQL's own repository, and they keep their numbers so a reference
from the contributor guide or a review reads the same in both.

## 3. The public repository layout

```
main branch:
extensions/
  README.md                       how to contribute: the checklist, the schemas, the review rubric
  tools/catalog.mjs               the validator (every PR) and the index generator (CI, after a merge)
  tools/execute.mjs               every .plumesql.sql executes on a PostgreSQL matrix
  <Category>/<id>/manifest.json   section 4
  <Category>/<id>/<id>.plumesql.sql | <id>.plumesql.run | <id>.plumesql.js
  <Category>/<id>/*.js            helper modules a grid extension imports (optional)
  <Category>/<id>/README.md       the page the app renders in the detail view
  <Category>/<id>/media/*         screenshots, gifs, clips the README references
.github/workflows/validate.yml    manifests, ids, files, versions, discussions (every PR and push)
.github/workflows/execute.yml     every .plumesql.sql executes on the PostgreSQL matrix (every PR and push)
.github/workflows/publish.yml     builds the index after every push to main and publishes it

catalog branch (orphan, one commit, written only by publish.yml):
  catalog.json                    the slim catalog, section 5
  locks/<id>.json                 one lock per extension, section 5
```

The directories and their manifests are the source of truth. No pull
request adds or edits an index file (a local `catalog.mjs --write` builds
one for a dev build pinned at the checkout, gitignored on main), so two
contributors adding extensions never collide, and the index cannot
disagree with the manifests it was built from.

`<Category>` is the extension's PRIMARY category, and a category IS a
directory under `extensions/` (section 4.2). An extension lives in
exactly one category directory; further categories are listed in its
manifest.

Paths inside the repository are referenced with forward slashes and
are case sensitive.
## 4. `manifest.json`

One JSON object per extension, UTF-8, no comments. Fields:

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | The manifest format version, the integer `1`. A reader refuses a manifest whose `format` it does not know. |
| `id` | yes | The extension id (4.1). MUST equal the directory name. |
| `kind` | yes | `query`, `command` or `grid`. MUST match the main file's double extension. |
| `version` | yes | Semantic version `MAJOR.MINOR.PATCH` of this extension. Bumped on every change to any file in the directory except `README.md` and `media/` (the validator enforces the bump against the previous catalog). |
| `plumesql` | yes | The minimum PlumeSQL version this extension needs, `">=X.Y.Z"`. The app hides an extension whose requirement it does not meet and says why in the detail view when reached by search. |
| `name` | yes | The display name, at most 40 characters. Title case, no trailing period. |
| `description` | yes | One sentence, at most 140 characters, what the extension answers or does. The row's second line. |
| `categories` | yes | Non-empty list; the first entry MUST be the directory's category. Every entry MUST be a category directory of the repository (4.2). |
| `tags` | no | Free words for search and recommendation (4.3), lowercase, at most 12. Searchable and visibly so: the page lists them as links that search for them, and a row the search kept by a tag alone shows that tag as a chip with the hit marked. The kind and the categories are not tags; they have their own filters. |
| `requires` | no | `{ "pgExtensions": ["timescaledb"], "pgVersion": ">=14" }`: PostgreSQL extensions the target database must have and the minimum server version. Both optional. Drives recommendations and the "needs" line of the detail view; nothing is blocked by it. |
| `files` | yes | The list of every file in the directory the app installs, paths relative to the directory, the main file first, `manifest.json`, `README.md` and `media/` excluded. |
| `dependencies` | no | Ids of other marketplace extensions this one references (4.4). |
| `permissions` | no | `{ "fork": true }` (4.5). Defaults apply when absent. |
| `discussion` | yes | The number of this extension's thread in the public repository's Discussions, category "Extensions". |
| `author` | yes | `{ "name": "...", "url": "..." }`, `url` optional. |
| `license` | yes | An SPDX identifier. The repository's own license applies to what is contributed; the field makes it explicit per extension. |
| `featured` | no | `true` for the curated few the panel shows first under Recommended when nothing else recommends them. Maintainers set it. |
| `recommend` | no | App-side signals that put the extension under Recommended (4.3), a list of known words: `my-extensions` (the user has extensions of their own). The validator refuses an unknown word. |
| `forkedFrom` | no | The id the extension was copied from in the app, informational; the validator accepts an id. |
| `externals` | when the code loads any | Every external library the extension loads at run time, as https URLs: a grid view's `scripts: [...]`, an `import` from a CDN. The validator checks the list against the code both ways (rule 8b of section 12), so a manifest never hides what the code fetches. The app shows them under Dependencies with their hosts, says which hosts the allowlist (`extensions.remoteScriptHosts`) has, and offers to allow the rest. |
| `icon` | no | The extension's logo: the path of a PNG or SVG (JPEG, WebP and GIF are accepted too) inside the directory, square, at most 64 KB, and listed in `files`, so it is hashed, installed and served like every other file. The panel's row and the detail view's header show it; without one they draw the default icon, the kind's glyph in the kind's colour (the same glyph a logo wears as its corner mark). A logo is a branded mark in colour and separate from the `@toolbar` line's icon, which is a single-colour glyph on the button that follows its colour. |
| `demo` | no | A recording of the extension in USE (never its install): the path of a GIF, WebP, PNG or JPEG directly under `media/`, at most 4 MB. It rides the lock and the README cache, never the install, and the detail view shows it as the second face of its "What it adds" section behind a Map / Demo switch, loading it only when picked; the README's own copy of the same picture is not drawn there twice. |

Unknown fields are refused by the validator and ignored by the app (a
newer manifest read by an older app still installs; the validator keeps
the repository at the format the apps know).

### 4.1 Ids

An id is 3 to 48 characters of `a-z`, `0-9` and `-`, starting with a
letter, no double or trailing hyphen: `blocking-locks`, `table-sizes`,
`plot-heatmap`. It is UNIQUE across the whole marketplace, whatever the
category, because references, the installed store and the on-disk
directory key on it alone. An id is permanent: renaming an extension is
removing one id and adding another, and the validator refuses a PR that
reuses a removed id for a different extension (the catalog keeps a
`retired` list). The main file is named `<id>.<double extension>`.

### 4.2 Categories

The categories are the directories under `extensions/` (`tools/` and
`locks/` aside), nothing more: no list is kept anywhere, in the
validator or in this document. A new category is a new directory in the
pull request that adds its first extension, and the pull request review
is what decides whether the marketplace wants that rubric. The
validator enforces only what keeps the set readable (rule 4): a
directory name MUST read as a category, words of letters, digits and
underscores separated by single spaces, at most 40 characters, because
the app shows it exactly as spelled (`Backup and Restore`, `pg_cron`,
`TimescaleDB`); two directories MUST NOT differ only in case, spacing or
underscores (`Backup`, `backup` and `Back_up` would split one rubric
three ways); and a category directory MUST NOT stand empty. The catalog's
`categories` lists them sorted case-insensitively, which is the order
the panel offers them in. The initial set mirrors the feature folders
the starters shipped in.

### 4.3 Tags and recommendation

`tags` are matched, case insensitively, against the PostgreSQL
extensions the app's object dictionary found on any connection (the
managed families TimescaleDB and Citus included) and against
`requires.pgExtensions`. An extension whose
`requires.pgExtensions` names an extension installed on one of the
user's databases, or whose tags include its name, is Recommended in
the app's Extensions tab. Nothing is installed by a recommendation.

A manifest may also name APP-SIDE signals in `recommend`, words the app
knows and the validator checks: `my-extensions`, on when the user has at
least one extension of their own, so an extension that helps
authors (Publish with gh) is recommended only to people with something
to publish. New signals are new words in
both places; an unknown word fails validation.

### 4.4 Dependencies

A query extension that hands its result to a grid extension
(`@extension <id>`) or a grid extension that imports
another one (`import '$ext/<id>/...'`) lists that id in
`dependencies`. Rules:

- Installing an extension installs its dependencies first, in one
  operation, each with its own row in the Log; if any dependency fails
  to install, nothing is written.
- A dependency is removed only when no installed extension lists it,
  and the removal dialog says which ones still do.
- Dependency chains are resolved from the catalog; a dependency that
  is not in the catalog fails validation.
- A command extension is never a dependency and never has one: it is
  installed only by an explicit gesture on itself.

### 4.5 Permissions

`permissions` is an object with one key today:

- `fork` (boolean, default `true`): whether the app offers "Fork to
  Scripts" and any other gesture that copies the extension's files out
  of the marketplace store as a user file. `false` removes the gesture;
  it does not hide the source, which the viewer still shows.

The object exists so team policy (private marketplaces, who may
install, approval) has a place later
without a format change. `fork: false` is POLICY, not protection: the
files are on the user's disk. The validator refuses unknown permission
keys.
## 5. The index: `catalog.json` and `locks/<id>.json`

Built by `tools/catalog.mjs --write` from every manifest and every file,
by the `publish catalog` workflow after each push to `main`, pinned to
that push's commit, and force-pushed as the single commit of the orphan
branch `catalog`. Nobody edits that branch.

The catalog holds only what search and the list need. It is JSON with a
comment header (JSONC): the first lines, all opening with `//`, say what
generated the file, from what and when, so nobody edits it by hand; the
app strips them before parsing. The locks are plain JSON, since their
bytes are what the catalog hashes.

```
// The PlumeSQL Extensions Marketplace catalog: the search index of every extension.
// GENERATED by `node extensions/tools/catalog.mjs --write` ... Never edit by hand.
// Built from commit <sha> at <RFC 3339>.
{
  "format": 1,
  "commit": "<40-hex commit of main the index was built from>",
  "generatedAt": "<RFC 3339>",
  "categories": ["Activity", ...],
  "retired": ["<id>", ...],
  "extensions": [
    {
      "id": "blocking-locks",
      "kind": "query",
      "version": "1.0.0",
      "plumesql": ">=0.21.0",
      "name": "Blocking locks",
      "description": "...",
      "categories": ["Activity"],
      "tags": ["locks", "activity"],
      "requires": { "pgExtensions": [], "pgVersion": ">=13" },
      "path": "Activity/blocking-locks",
      "featured": false,
      "recommend": ["my-extensions"],
      "icon": "icon.png",
      "author": "Jane Doe",
      "hosts": ["cdn.jsdelivr.net"],
      "lockSha256": "<hex, the hash of locks/blocking-locks.json>"
    }
  ]
}
```

`icon` (the manifest's, absent when none), `author` (the manifest
author's name alone), `recommend` (the manifest's signals, absent when
none) and `hosts` (the distinct hosts of the manifest's `externals`,
absent when none) ride the catalog because the row shows them without a
lock in hand; the author's URL, the externals themselves
and the rest stay in the lock.

A few hundred bytes per extension; a thousand extensions are a few tens of
kilobytes compressed, fetched once an hour with `If-None-Match`, so an
unchanged catalog moves no bytes at all.

One lock per extension holds everything an install or the detail view
needs, canonical JSON (stable key order, two-space indent, a trailing
newline) so the same content always hashes the same:

```
{
  "format": 1,
  "id": "blocking-locks",
  "kind": "query",
  "version": "1.0.0",
  "plumesql": ">=0.21.0",
  "commit": "<40-hex commit of main the files are served from>",
  "path": "Activity/blocking-locks",
  "files": [{ "path": "blocking-locks.plumesql.sql", "sha256": "<hex>", "bytes": 1234 }],
  "dependencies": [],
  "externals": ["https://cdn.jsdelivr.net/npm/vega@6/build/vega.min.js"],
  "demo": "media/blocking-locks.webp",
  "permissions": { "fork": true },
  "discussion": 42,
  "author": { "name": "...", "url": "..." },
  "license": "MIT"
}
```

The chain of trust: the catalog names each lock's hash, the lock names
each file's hash, and the files are fetched from the immutable commit
the lock names. The app refuses a lock whose bytes do not hash to the
catalog's value, or whose id, kind, version or path disagree with the
catalog entry, and a file whose bytes do not hash to the lock's value.
`retired` lists ids that once existed and may never come back.
## 12. What the validator and the public CI enforce

`tools/catalog.mjs --check` runs locally and in `validate.yml` on every
PR and push; `--write` builds the index (locally for a dev build pinned
at the checkout, in `publish.yml` for the `catalog` branch). It fails
when:

1. a manifest is missing, not valid JSON, has unknown fields or an
   unknown `format`;
2. an `id` breaks 4.1, differs from its directory name, duplicates
   another id or reuses a retired id;
3. `kind` does not match the main file, or the main file is not
   `<id>.<double extension>`, or `files` omits a file present in the
   directory (other than manifest, README and media) or lists one absent;
4. a category directory's name does not read as a category, two differ
   only in case, spacing or underscores, a category directory is empty,
   a manifest names a category that is not a directory, or the first
   category is not the directory's;
5. a dependency is not a catalog id, is a command extension, or forms a
   cycle;
6. `version` is not semver, or a file changed against the previous
   catalog without a version bump, or a version went backwards;
7. `plumesql` is not a `>=X.Y.Z` range;
8. `discussion` is missing, the thread does not exist or its title is
   not the id (GITHUB_TOKEN in the Action; skipped locally with a
   warning);
8a. `icon` names a file that is absent, is not listed in `files`, is
   not a PNG, SVG, JPEG, WebP or GIF by extension, or is larger than
   64 KB;
8b. `externals` disagrees with the code: an https URL the extension's
   files name (a view's `scripts`, an import) is not listed, a listed
   one is not in the code, or an entry is not an https URL;
8c. `dependencies` disagrees with the code: an id the code references
   (`@extension <id>`, an import from `$ext/<id>/`) is not
   listed, or a listed one is not referenced;
8d. `demo` is not a file directly under `media/`, is not a GIF, WebP, PNG
   or JPEG by extension, or is larger than 4 MB;
9. `permissions` has an unknown key;
10. reserved;
11. a `.plumesql.sql` or `.plumesql.run` does not parse under the action
    parser's rules (the same parser PlumeSQL uses, vendored as a module
    the validator imports);
12. a `.plumesql.js` is not `@ts-check` clean against the PlumeSQL
    extension types.

`execute.yml` runs every `.plumesql.sql` against PostgreSQL 13 to 18,
TimescaleDB and Citus containers (the private repository's schema
matrix recipe, duplicated), with the inputs' defaults bound, and fails
the PR on any error. It is the one live proof of the published queries.

The contributor checklist in `extensions/README.md` restates 1 to 12 in
prose, adds the review rubric and the README template.

The validator is plain Node and structural on purpose, so a contributor
runs it with nothing installed. The DEEP check lives with the
application and reads a checkout with the app's own parsers: every annotation VALUE
under the real action parser, a grid module evaluated and read as the
app reads it, `@ts-check` against the extension types the editors use
(the app's own TypeScript target), `@inputs` keys against the referenced
views, and 8b and 8c again. It runs before content is published and in
the private CI; a finding there is fixed in the extension, never waived.
