# The `.plumesql.js` grid extension format, version 1

The `.plumesql.js` format: the shape a file exports and exactly how PlumeSQL
interprets it. The engine and the product documentation both answer to it.

A `.plumesql.js` file is a JavaScript module whose default export declares
rules (section 1) and, optionally, views (a tab that draws the result with
`render`, or one that computes a TABLE of it with `table`, shown in the host's
own grid; their shape is declared in the published types). A rule either
reformats the columns a match selects or adds a computed column, through a
formula, `fn`, run once per row.

The format is **versioned** and **forward compatible**: this is version 1. A
later revision may add fields; a reader ignores object fields it does not know,
and a `version` greater than it understands is read on a best effort basis, not
rejected. Author for version 1 and unknown future fields cost nothing.

The `.plumesql.js` NAME is what makes the file an extension (section 9); beyond the
export it carries leading `//` comment MARKERS the host reads (not part of the
export). `@for` / `@query` SCOPE it to results (a script name, a **glob**, a store
qualifier, a table, or a union, each repeatable), and with
no scope marker the extension is recognized but applies nowhere. An extension
published in the marketplace carries NO scope marker: where it applies is the
user's choice in the application (the extension's page, a script's `@extension`
line), never the file's. The optional
presentation pair `@description` / `@color` describe the file in the UI (its tree
row and tab mark), exactly as an action or a plain script does. These are the
host's, not this format's; this document specifies the export.

## Type specification

These are the exact types a file is written against. They are kept identical to
the engine's own types; a test in the reference implementation fails if the two
drift. The same types, as the ambient declarations the application's editors
type-check against, are published beside this document as
`plumesql-extension.d.ts`; a result VIEW's shape is declared there.

<!-- spec:gridscript.ts -->
```ts
export type GridExtension = GridRule[] | GridExtensionFile | GridRule

// spec: a file of rules. The export carries NO scoping: leading comment
// markers decide where its rules apply, and a file without one applies
// nowhere. `// @for <script>` narrows to
// one script's results, `// @query <query>` to one query; several files may
// target the same script, since the scope is a marker, not the file's name.
export interface GridExtensionFile {
  // Reserved for a future breaking revision; absent means version 1.
  version?: number
  rules?: GridRule[]
  // Result VIEWS, tabs that DRAW a matching result instead of listing it, or
  // compute a TABLE of it the host lists in its own grid. Their shape (tab,
  // render or table, inputs, when, actions, scripts) is the editor's
  // PlumeSQLView, declared in plumesql-extension.d.ts; this spec is the rules'.
  views?: unknown[]
}

// spec: a rule reformats matched columns, adds a computed column, or adds a
// companion column beside each matched column.
export type GridRule = FormatRule | AddRule | CompanionRule

// spec: a rule's optional data guard. `when(columns)` is a self contained
// predicate over the result's columns ({ name, type } each); the rule applies
// only where it returns true, and does NOTHING elsewhere (a computed column it
// adds is not added, a formatter it declares does not run). Like a view's
// `when`, it is compiled in isolation (no module closure), so it must not
// reference anything outside itself. A guard that throws or will not compile is
// treated as false. Absent means the rule applies wherever its scope allows.
export type RuleWhen = (columns: { name: string; type: string }[]) => boolean

// spec: reformat the columns a match selects.
export interface FormatRule {
  match: ColumnMatch
  // Higher wins when several rules format one column; equal keeps the later.
  // Omitted, it derives from the match's specificity.
  priority?: number
  when?: RuleWhen
  fn: GridFn
}

// spec: add a computed column with the given header.
export interface AddRule {
  add: string
  at?: ColumnPlacement // default 'end'
  when?: RuleWhen
  fn: GridFn
}

// spec: add a computed column BESIDE each column the match selects (not in place
// of it), reading that column's value. One rule fans out to one column per
// matched column, so "a `… ago` after every timestamptz" is a single rule. A
// rule with BOTH `match` and `add` is a CompanionRule.
export interface CompanionRule {
  match: ColumnMatch // the source columns to attach a companion to
  add: string // the companion's header; `{col}` becomes the matched column's name
  at?: 'after' | 'before' // which side of the matched column; default 'after'
  when?: RuleWhen
  fn: GridFn // `value` is the matched column's cell, as for a FormatRule
}

// spec: selects columns. Every field given must hold (AND); at least one.
export interface ColumnMatch {
  name?: string | RegExp // string = exact name; RegExp = tests the name
  // The PostgreSQL type as the header shows it. A STRING matches by the BASE
  // type, ignoring any precision / length modifier: 'numeric' matches 'numeric',
  // 'numeric(8,2)', 'numeric(12,4)', and 'character varying' matches
  // 'character varying(255)'. A RegExp tests the full type text, for a prefix or
  // family match (/^numeric/, /timestamp/).
  type?: string | RegExp
  index?: number | 'first' | 'last' // 0-based position, or the first / last
}

// spec: where an added column goes.
export type ColumnPlacement = 'end' | 'start' | { before: ColumnMatch } | { after: ColumnMatch }

// spec: a rule's formula, called once per row in result order. Runs in a
// Worker (no DOM, bounded by a timeout); the module's own scope is in scope,
// per-call state that outlives the call is not.
export type GridFn = (value: unknown, row: GridRow, prevRow: GridRow | null, ctx: GridContext) => GridResult

// spec: a row's values, addressable by column NAME (row.amount) or POSITION
// (row[0]). Duplicate names resolve to the last; positions are unambiguous.
export type GridRow = { readonly [name: string]: unknown; readonly [index: number]: unknown }

// spec: the row and column context of a call.
export interface GridContext {
  i: number // this row's index in the whole result, from 0
  count: number // the result's total row count
  column: { name: string; type: string; index: number }
  prev: unknown // this column's own previous returned value, undefined on the first row
  // A deliberate log line to PlumeSQL's Log, the same channel this formula's
  // console.log / warn / error is captured onto. A no-op when the run does not
  // collect logs (a copy, say). ctx.log(...) reads like console.log(...).
  log: (...args: unknown[]) => void
}

// spec: what a formula returns. A plain value shows as text; a descriptor also
// decorates the cell. Any other value shows as its string. It must be
// SERIALIZABLE (the formula runs in a Worker and the result is posted back), so
// never an HTMLElement or other live object: custom markup is the descriptor's
// `html` string, and hand-built DOM belongs in a result view's render(root, ...).
export type GridResult = GridCellDescriptor | string | number | boolean | bigint | Date | null | undefined

// spec: only these fields are honoured, and only strings for the string ones,
// so a formula can never return a live object into the page.
export interface GridCellDescriptor {
  value?: unknown
  // A formatter class: the five built-ins (GridClass) are the ones PlumeSQL ships
  // CSS for. Any other class name is applied too, but an extension cannot add
  // the CSS to style it, so use `style` (inline CSS) for a custom look.
  class?: GridClass | (string & {})
  style?: string
  html?: string // MARKUP as a string, not an element; escape any data in it
  title?: string
  align?: 'left' | 'right' | 'center'
}

export type GridClass = 'fmt-ok' | 'fmt-bad' | 'fmt-warn' | 'fmt-muted' | 'fmt-strong'
```

## Semantics

The rules below are normative. Where a rule is stated as MUST or NEVER, a file
that violates it is malformed and the offending rule is dropped, never applied
as guessed.

### 1. The default export

The default export is one of: an array of `GridRule`; an object with a `rules`
array (`{ version?, rules }`); or a single `GridRule` on its own (an object that
carries an `fn`), a convenience so a one-rule file needs no array. A file may
hold as many rules as it likes, formatters and computed columns mixed. A default
export that is none of these (a bare object with neither `rules` nor `fn`, a
number, nothing) yields no rules. An empty array or `{ rules: [] }` is valid and
contributes nothing.

### 2. What makes a rule

A rule MUST carry an `fn` function. Then:

- `add` (a string) with a `match` object is a **CompanionRule**: it adds a
  computed column beside each matched column.
- `add` (a string) with no `match` is an **AddRule**: one computed column.
- a `match` object with no `add` is a **FormatRule**: it reformats matched
  columns in place.

A rule with neither `add` nor a usable `match`, or with no `fn`, is dropped.

Any rule MAY also carry a `when(columns)` **data guard**: a self contained
predicate over the result's columns (`{ name, type }` each). The rule applies
only where it returns true and does **nothing** elsewhere: an AddRule's or
CompanionRule's computed column is not added, a FormatRule does not run. The
guard is compiled in isolation (no module closure), exactly like a view's
`when`, so it MUST NOT reference anything outside itself; a guard that throws or
will not compile is treated as false. It is the way to express "add a `name`
column only when both `first_name` and `last_name` are present" that a `match`
(which selects existing columns) cannot. Absent, the rule applies wherever its
scope (section 9) allows.

### 3. Matching (`ColumnMatch`)

A match selects a column when **every field it sets holds** (logical AND). An
empty match (`{}`) sets no field and therefore selects nothing.

- `name` as a string matches the column name **exactly**.
- `name` as a `RegExp` matches when the expression **tests true** against the
  column name. A `RegExp` that cannot be constructed matches nothing (it never
  throws).
- `type` as a **string** matches the column's PostgreSQL type by its **base
  name**, ignoring any precision or length modifier: `'numeric'` matches
  `numeric`, `numeric(8,2)` and `numeric(12,4)`; `'character varying'` matches
  `character varying(255)`. The base is the type text with its first
  parenthesized group removed, so a suffix like `without time zone` is kept
  (`'timestamp without time zone'` still matches its `(3)` form). An exact full
  string (`'numeric(8,2)'`) matches only that. A column whose type is unknown
  matches only `type: ''`.
- `type` as a **RegExp** tests the **full type text** (modifier included), for a
  prefix or family match: `/^numeric/`, or `/^(smallint|integer|bigint|numeric|real|double)/`
  for every number type. A `RegExp` that cannot be constructed matches nothing.
- `index` matches the column's 0 based position. `'first'` is position 0;
  `'last'` is the final column (position `count - 1`).

### 4. Precedence when several formatters match one column

A column wears at most one formatter. When more than one FormatRule matches it,
the winner is the one with the highest **priority**. A rule's priority is its
explicit `priority`, or, when omitted, its match **specificity**:

- an exact `name` (string) is the most specific,
- then `index`,
- then a `name` `RegExp`,
- then `type`;
- a match that sets more fields is more specific than one that sets fewer.

On an exact tie, the rule listed **later** in the file wins. An AddRule and a
CompanionRule never compete for a column; they contribute their own new columns.

### 5. Placement (`at`)

An AddRule's `at` places its computed column in the grid: `'end'` (the default)
appends it, `'start'` puts it first, and `{ before: ColumnMatch }` /
`{ after: ColumnMatch }` put it next to the first real column the match selects.
Several computed columns keep their definition order within the same placement. A
`before` / `after` whose match selects no visible column, or a frozen one (a
computed column never freezes), falls back to the end.

A CompanionRule's `at` is simpler, since it is relative to the column it attaches
to: `'after'` (the default) places the companion just after each matched column,
`'before'` just before it. The header is a template in which `{col}` is replaced
by the matched column's name, so one rule adds distinct headers across several
matches (`{col} ago` becomes `created_at ago`, `updated_at ago`).

### 6. The formula call (`GridFn`)

`fn` is called once per row, **in result order**, with `(value, row, prevRow,
ctx)`:

- `value` is the matched column's cell for a FormatRule, and the SOURCE
  column's cell for a CompanionRule (the column it sits beside); `undefined` for
  an AddRule (a plain computed column has no source cell).
- `row` is the current row, addressable by column **name** (`row.amount`) and by
  **position** (`row[0]`). Duplicate column names resolve to the **last**;
  positions are unambiguous. The backing object has a null prototype, so a
  column named like an `Object` member (`constructor`) does not collide.
- `prevRow` is the row above in result order, or `null` on the first row. It
  **includes the computed columns' values** for that row (a computed column
  writes its value back onto its row, so both later rules on the same row and the
  next row's `prevRow` see it).
- `ctx` carries `i` (this row's **absolute** index in the whole result, not the
  visible window), `count` (the result's total rows), `column` (`{ name, type,
  index }` of the column the rule runs for), `prev` (this column's **own**
  previous returned value; this is what makes a running total possible), and
  `log` (a function that writes a line to the host's log, like `console.log`).
  - `prev` threads over the rows the host computes together. When the result is
    small enough to compute at once, that is the WHOLE result, so a value that
    accumulates down the rows (a running total) is correct end to end. On a large
    result the host computes a block at a time, so `prev` is `undefined` at each
    block's first row and a running total **resets at block boundaries**. A value
    that must accumulate over an arbitrarily large result belongs in SQL (a window
    function), since the host cannot hold every row of a large result at once.

A formula runs as the **live function the module exported**, so it MAY call
helper functions and read top-level bindings (constants, lookup tables) declared
in the same file: the module's own scope is in scope. What it MUST NOT depend on
is per-call mutable state that outlives the call, since the host may run rows in
separate passes and in a fresh Worker each time; a helper and a frozen lookup are
fine, an accumulator at module scope is not (use `prev` / `prevRow` for that).

A rule file MAY `import` from other files, so shared helpers live in one place.
A conforming host resolves a static import specifier to a file it can read and
runs the imported module in the same graph, so an imported binding is in scope
like a local one. PlumeSQL resolves two specifier forms and leaves the rest for the
engine to reject:

- **the extension alias** `$ext/<id>/<path>` (the SvelteKit `$lib`
  convention): a file of the extension with that id, installed or the
  user's own, read from that extension's directory; and
- **relative** `./x.js`, `../lib/x.js`, read from the importing file's own
  extension and folder.

A specifier that names a package (`lodash`), a URL, an unknown `$name`, or a path
that climbs above a store root does not resolve (there is no package tree behind
a grid extension). Imports SHOULD form an acyclic graph; a host MAY refuse a
cycle. Dynamic `import()` is not resolved.

An inline rule authored in the host UI (a formula typed as a string, not a file)
is compiled from its source and is self contained by nature; there, a body with
no `return` is treated as a single returned expression.

A formula MAY write to the host's log through `ctx.log(...)` or the standard
`console` (`log`, `info`, `debug`, `warn`, `error`, and `dir`, `trace`, `group`,
`assert`, `table`), which the host captures while it computes the on-screen
window. A conforming host SHOULD surface that output where it shows its own
messages, fold consecutive identical lines with a count (as a browser console
does), and MAY cap the volume, since a formula runs once per row. Output is
advisory: it never changes a cell, and a host that does not collect it runs the
formula unchanged (`ctx.log` is then a no-op).

### 7. The return value (`GridResult`)

- A plain value (string, number, boolean, bigint, Date, null, undefined) becomes
  the cell's text, and is also what a copy or export writes.
- A **descriptor** object decorates the cell. Only the fields in
  `GridCellDescriptor` are honoured, and only strings are accepted for the string
  fields (`class`, `style`, `html`, `title`), so a formula can **never** return a
  live object or element into the page. An object that sets none of those fields
  is treated as a plain value, not a descriptor.
  - `class` is one of the theme aware formatter classes: `fmt-ok`, `fmt-bad`,
    `fmt-warn`, `fmt-muted`, `fmt-strong`.
  - `style` is inline CSS.
  - `align` is `'left' | 'right' | 'center'`; any other value is ignored.
  - `title` is the cell's hover text.
  - `html` is markup **as a string** (not an element), rendered in place of the
    text, **verbatim and unescaped**. This is a trust boundary: the host inserts
    it as raw markup, on the same trust as the file itself (a `.plumesql.js` is the
    author's own code, like a query extension). The author MUST escape any data it
    interpolates, above all a row value, since a value from the database can carry
    markup; an unescaped `html` is a script-injection vector. A host loading a
    `.plumesql.js` from a source it does not trust (a checked-out repository's file,
    say) inherits that file's trust, exactly as it does for an action; treat an
    untrusted `.plumesql.js` as untrusted code.
- Unknown descriptor fields are **ignored** (forward compatibility); a `value`
  alongside them is still honoured.

### 8. Failure

A formula is the author's own code and a broken one never breaks the grid. If a
formula throws, or will not compile, a **computed** column shows `ERR` and a
**formatter** falls back to the raw value. Either failure is reported **once**
to the Log (not per row, not per window).

### 9. Identity and scope (the `.plumesql.js` name is identity; `@for` / `@query` scope)

Identity and scope are SEPARATE. What makes a file an extension is its NAME; where
it applies is decided by leading `//` comment markers, which the export does not
carry:

```js
// @for <target>
// @query <query>
```

**Identity.** The `.plumesql.js` name is what makes the file an extension. Its name
is a claim no other tool makes, so the host loads, parses and shows it as an
extension whether or not it carries any marker. (The older `.plume.js` spelling
is the same extension under the product's previous name; the older still
`.grid.js` spelling is generic JavaScript a project might hold for its own
reasons, so a `.grid.js` is an extension ONLY when it also carries a `// @for`
marker, the way a query extension (`.plumesql.sql`) is known by its annotations;
this transitional rule is the one place a marker still decides identity.) The
host searches the same three places query and command extensions come from
(the opened workspace, the workspace's own scripts store, the shared scripts
store), skipping `node_modules`, `vendor` and hidden directories.

**Unscoped means nowhere.** A recognized `.plumesql.js` with NO scope marker (no
`@for` and no `@query`) applies to no result: it is a known extension waiting to be
attached. (PlumeSQL's per grid "apply extension" gesture is
what writes a marker to attach an unscoped, or otherwise out of scope, extension.)

**`@for` `<target>`** scopes to a result's SOURCE. It is one of:

- **`global`**: every result, in every workspace. A reserved word, not a script
  name. Keep the file in the global scripts store so it loads everywhere.
- **`workspace`**: every result in the workspace. A reserved word. Keep the file
  in the workspace (its own files, so a team keeps it in source control beside
  its `.plumesql.sql` files, or the workspace scripts store). A workspace rule wins
  a formatter tie over a global one.
- **A script**: the file's rules apply only to results of that script. A bare
  target matches the result's source file by base name (extension
  insensitive), so `// @for report.sql` and `// @for report` both match
  a result run from `report.sql` in any store. A store qualified target,
  `// @for <store>:<name>`, matches only when the result's file lives in that
  store too, telling apart same-named scripts across the stores. The store word
  mirrors the breadth words: `global:` is the shared store (reads the same as the
  breadth `global`), `workspace:` the workspace files, and `scripts:` the
  workspace's own Scripts store (the one realm with no breadth word). The
  spelling `globalscripts:` is also accepted. Because the scope is a marker
  and not the file's name, **several files may target the same script**. (A script
  literally named `global` or `workspace` is reached store qualified, e.g.
  `// @for scripts:workspace`, which is never a bare reserved word.)
- **A store**: a store word with an EMPTY name, `// @for <store>:`, is a store
  wildcard: every result from that store, whatever the script name (`scripts:`,
  `workspace:`, `global:`). A BARE `scripts` (and the `globalscripts` alias) reads
  the same as `scripts:`, not a script named `scripts`; `global` and `workspace`
  are the exception (bare they are the breadth words, so their store forms take
  the colon). It matches a result that came from a file in that store; an ad hoc
  query (no file) is reached only by a breadth word.
- **A union**: several targets apply if ANY of them does, whether comma-separated
  on one line (`// @for scripts:, workspace:` is every result from either local
  store, leaving the shared store out) or written as several `// @for` lines,
  which combine the same way. A breadth word among the targets still widens to
  every result. The per grid "apply extension" gesture attaches an extension to a
  new file or directory by APPENDING another `@for` line, so a union accretes.

The reserved words `global` and `workspace` narrow nothing (every result); the
global/workspace difference is realized by WHERE the file is kept, which decides
when it is loaded at all. Location governs only availability.

**`// @query <query>`** optionally narrows further to one query, matched by its
full text normalized (comments stripped, whitespace collapsed, a trailing
semicolon dropped) on both sides; the query is written in full (not a hash), so
the marker reads plainly, and an inline `--` comment cannot corrupt the one-line
marker. A `@query` whose value is a single identifier (bare or `schema.table`) is
a TABLE scope instead: it matches by the result's own source relation (the
single editable relation the server resolved), so
every form of the table's result matches (`select *`, `select * where …`, a
browse, an FK step), not one query text. A single word is read as a relation
name, not as a query text (a one-word statement has no result to match), so
this does NOT depend on the DDL snapshot being loaded; the dictionary is consulted
only to REJECT a name it positively knows is not a relation (a table, view,
materialized view or foreign table), which then matches as an exact query.
Like `@for`, `@query` may be written several times (a union: any of the queries or
tables matches), and the per grid "apply extension" gesture appends another
`@query` line to bind an extension to the current result's query. `@query` may be
the ONLY scope marker (bind by query alone); when both are present a result must
match `@for` AND one of the `@query` values. Scope is not a security boundary; it
only decides where formatting shows.
