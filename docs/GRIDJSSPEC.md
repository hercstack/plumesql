# The `.plumesql.js` grid extension format, version 1

The `.plumesql.js` format: the shape a file exports and exactly how PlumeSQL
interprets it. The engine and the product documentation both answer to it.

A `.plumesql.js` file is a JavaScript module whose default export declares
rules (section 1), optionally views (a tab that draws the result with
`render`, or one that computes a TABLE of it with `table`, shown in the host's
own grid; their shape is declared in the published types), and optionally
inspectors (readers of one value, section 11). A rule either
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
  // The rules' INPUTS (a threshold, a colour, the column to watch), asked
  // once per result like a view's and answered by a script's `-- @inputs`.
  // Their shape is a view input's (ViewInput, in plumesql-extension.d.ts): a match may
  // name a column input (`match: { input }`), every formula reads the answers
  // as ctx.inputs. A view declares inputs of its own.
  inputs?: unknown[]
  rules?: GridRule[]
  // Result VIEWS, tabs that DRAW a matching result instead of listing it, or
  // compute a TABLE of it the host lists in its own grid. Their shape (tab,
  // render or table, inputs, when, actions, scripts, and column, an entry
  // in a column's menu that opens the view on that column) is the editor's
  // PlumeSQLView, declared in plumesql-extension.d.ts; this spec is the rules'.
  views?: unknown[]
  // INSPECTORS: readers of ONE value of a matched column, answering what it
  // is (a reading line, facts, a sketch, a decoded face) on the grid's hover
  // card, the peek, the value tab and the row editor's field. The host owns
  // those surfaces; an inspector only answers. See GridInspector below and
  // docs/GRIDJSSPEC.md, Inspectors.
  inspectors?: GridInspector[]
  // FORMATS: more shapes for the result grid's Copy and Save, beside the
  // built-in tab and comma separated, JSON and Markdown. See GridFormat
  // below and docs/GRIDJSSPEC.md, Formats.
  formats?: GridFormat[]
  // REFACTORS: rewrites the SQL editor offers on a statement, beside its
  // own (the lightbulb, Ctrl+. or Cmd+.). A module with refactors declares
  // nothing else: the editor's rewrites and a result's dressing are
  // attached apart. See GridRefactor below and docs/GRIDJSSPEC.md,
  // Refactors.
  refactors?: GridRefactor[]
}

// spec: a refactor. `id` names it within its extension (lowercase letters,
// digits and hyphens). `refactor` reads ONE statement of the SQL editor
// and answers the rewrites it offers there, or nothing, in the sandboxed
// worker (no DOM, no network, bounded by extensions.runTimeoutMs). It is
// asked whenever the editor asks its own refactors (the caret settling on
// a statement, Ctrl+. or Cmd+.), so it must be quick and must answer from
// what it is given. A throw or a timeout offers nothing, logged once per
// module version.
export interface GridRefactor {
  id: string
  refactor: (
    statement: RefactorStatement,
    ctx: RefactorContext
  ) => RefactorOffer[] | RefactorOffer | null | undefined | Promise<RefactorOffer[] | RefactorOffer | null | undefined>
}

// spec: the statement a refactor reads. `text` runs from its first code
// token to its end, the ';' included; every offset (caret, an edit's from
// and to) is an index into it. `keyword` is its leading keyword in lower
// case ('select', 'with', 'insert', ...). `tables` are the relations it
// reads or writes at its own level (its FROM and JOINs, an UPDATE's or a
// DELETE's target, an INSERT's table), resolved in the connection's
// dictionary; a name the dictionary does not know is left out.
export interface RefactorStatement {
  text: string
  caret: number
  keyword: string
  tables: RefactorTable[]
}

// spec: one relation of the statement. `ref` is how the statement names it
// (as written, maybe qualified), `alias` its alias when it has one;
// `schema` and `name` are the catalog's exact names.
export interface RefactorTable {
  ref: string
  alias?: string
  schema: string
  name: string
  columns: RefactorColumn[]
  // TimescaleDB's hypertable facts, when the table is one.
  timescale?: { timeColumn?: string }
}

// spec: one column. `type` is the declared type as PostgreSQL prints it
// ('integer', 'vector(3)', 'geometry(Point,4326)'); `pk` its place in the
// primary key (1 for the first column), absent when it is in none; `ref`
// the column a foreign key makes it reference.
export interface RefactorColumn {
  name: string
  type: string
  pk?: number
  ref?: { schema: string; table: string; column: string }
}

// spec: the context of one refactor call.
export interface RefactorContext {
  // The connected server's major version (17, 18), when PlumeSQL knows it.
  serverVersion?: number
  log: (...args: unknown[]) => void
}

// spec: one rewrite offered. `title` is what the lightbulb's list says;
// `edits` replace text[from, to) with `text`, all of them at once as ONE
// undo step. Edits must not overlap and must stay inside the statement;
// an offer that breaks either is dropped.
export interface RefactorOffer {
  title: string
  edits: { from: number; to: number; text: string }[]
}

// spec: a copy and save format. `id` names it within its extension
// (lowercase letters, digits and hyphens); `label` is what the Copy Format
// and Save Format menus say ("SQL INSERT"); `extension` is the file
// extension a save in it takes (default "txt"). `format` turns the rows
// being copied or saved into ONE text, in the sandboxed worker (no DOM,
// bounded by extensions.runTimeoutMs). A throw or a timeout fails the copy
// or the save, which the Log says, and nothing reaches the clipboard or
// the file.
export interface GridFormat {
  id: string
  label: string
  extension?: string
  format: (data: FormatData, ctx: FormatContext) => string | Promise<string>
}

// spec: what a format is given: the columns being copied, in the order the
// grid shows them, and their rows, every value the server's TEXT or null.
export interface FormatData {
  columns: { name: string; type: string }[]
  rows: (string | null)[][]
}

// spec: the context of one format call. `source` is the table the result
// was read from, when PlumeSQL knows it (a query on one table) and every
// copied column is one of its columns: its
// schema, its name and the columns that identify a row (the primary key,
// or a unique index standing in for one; empty when there is none).
// `purpose` says whether the text goes to the clipboard or to a file.
export interface FormatContext {
  source?: { schema: string; table: string; key: string[] }
  purpose: 'copy' | 'save'
  log: (...args: unknown[]) => void
}

// spec: an inspector. `match` selects the columns whose values it reads
// (a ColumnMatch, usually by type); `label` names what it decodes to in
// the value tab's face toggle ("Decode <label>"), defaulting to the
// column's type. `inspect` is called with one NON-NULL value as the
// server's text and the surface asking, in the sandboxed worker (no DOM,
// bounded by extensions.runTimeoutMs). It answers an Inspection, or
// null / undefined to DECLINE (not this inspector's value), which lets
// the next matching inspector, or the value's plain face, have it. A
// throw or a timeout is a decline too, logged once per module version.
export interface GridInspector {
  match: ColumnMatch
  label?: string
  inspect: (value: string, ctx: InspectContext) => Inspection | null | undefined | Promise<Inspection | null | undefined>
}

// spec: the surfaces an inspection is shown on, each with its own room:
// 'hover' the grid's hover card, 'peek' the strip above the peeked value
// (Space), 'value' the value tab's panel and subtitle, 'field' the
// preview under a row editor's field (called with what is typed, which
// need not be a stored value: a literal being written).
export type InspectSurface = 'hover' | 'peek' | 'value' | 'field'

// spec: the context of one inspect call.
export interface InspectContext {
  column: { name: string; type: string; index: number }
  surface: InspectSurface
  // The sketch box the surface has room for, in CSS pixels: html wider or
  // taller than this is clipped.
  width: number
  height: number
  // The app theme's base, and the active theme's colours by role (the
  // palette a result view's ctx.palette carries), for a sketch painted in
  // concrete colours; the host's sketch classes follow the theme alone.
  theme: 'dark' | 'light'
  palette?: Record<string, string>
  log: (...args: unknown[]) => void
}

// spec: what an inspector answers. Every field is optional and a STRING
// (facts an array of strings); anything else is dropped, so an inspector
// can never hand a live object to the page.
export interface Inspection {
  // One line reading the value ("3 dims · min 0.5 · max 2.25"): the card's
  // text, the peek's strip, and on the 'value' surface the subtitle.
  line?: string
  // A small sketch as MARKUP (SVG, text formatting), rebuilt by the host
  // from the elements it knows (cleanCellHtml), within width x height.
  html?: string
  // The value tab's facts, one short span each, the first one the
  // headline ("Polygon", "SRID 4326", "10 points").
  facts?: string[]
  // A sentence under the facts (what the sketch is and is not).
  note?: string
  // The value in another SPELLING (EWKB hex decoded to EWKT): the value
  // tab shows it in its editor by default, a "Decode <label>" toggle flips
  // back to the value as stored, and Copy copies the face shown. On the
  // card and the peek the text is shown clipped. label names the spelling
  // in the toggle's tooltip ("EWKT"), title replaces that tooltip whole.
  face?: { label?: string; title?: string; text: string }
}

// spec: a rule reformats matched columns, adds a computed column, adds a
// companion column beside each matched column, or spreads each matched column
// into as many columns as its values call for.
export type GridRule = FormatRule | AddRule | CompanionRule | SpreadRule

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

// spec: add SEVERAL computed columns beside each column the match selects, how
// many and which decided at run time from that column's values. `spread` reads
// a sample of the matched column's values (the first SPREAD_SAMPLE rows of the
// result) and answers the KEYS of the columns to add, in order; `fn` then fills
// each of them row by row, reading the matched column's cell as `value` and the
// column's key as `ctx.key`. "Every key of a json column as a column of its
// own" is one rule. A rule with `match` and `spread` is a SpreadRule.
export interface SpreadRule {
  match: ColumnMatch // the source columns to spread
  spread: (values: unknown[], ctx: SpreadContext) => string[] | Promise<string[]>
  // The added columns' header: `{key}` becomes the key, `{col}` the matched
  // column's name. Default '{key}'.
  add?: string
  at?: 'after' | 'before' // which side of the matched column; default 'after'
  when?: RuleWhen
  fn: GridFn // `value` is the matched column's cell, `ctx.key` the column's key
}

// spec: the context of a spread call.
export interface SpreadContext {
  column: { name: string; type: string; index: number }
  // Every column of the result, so a key that would repeat one's name can be
  // given another header.
  columns: { name: string; type: string }[]
  inputs: Record<string, string>
  log: (...args: unknown[]) => void
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
  // The column(s) the user named for the module's INPUT of this key (a
  // `column` or `multi-column` input, docs/GRIDJSSPEC.md): the rule formats
  // whatever the user picked, and nothing while the input has no answer.
  input?: string
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
  // The answers to the module's inputs (a threshold, a colour, a column
  // name), every one a string, empty when the module declares none.
  inputs: Record<string, string>
  // A deliberate log line to PlumeSQL's Log, the same channel this formula's
  // console.log / warn / error is captured onto. A no-op when the run does not
  // collect logs (a copy, say). ctx.log(...) reads like console.log(...).
  log: (...args: unknown[]) => void
  // For a SpreadRule's column: the key its spread answered for it. Absent
  // for every other rule.
  key?: string
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
array (`{ version?, inputs?, rules, views?, inspectors?, formats?, refactors? }`, section 10 for `inputs`, section 11 for `inspectors`, section 13 for `formats`, section 14 for `refactors`); or a single `GridRule` on its own (an object that
carries an `fn`), a convenience so a one-rule file needs no array. An object
that carries only `views`, only `inspectors`, only `formats` or only `refactors` is valid too. A file may
hold as many rules as it likes, formatters and computed columns mixed. A default
export that is none of these (a bare object with neither `rules` nor `fn`, a
number, nothing) yields no rules. An empty array or `{ rules: [] }` is valid and
contributes nothing.

### 2. What makes a rule

A rule MUST carry an `fn` function. Then:

- a `spread` function with a `match` object is a **SpreadRule**: it adds
  several computed columns beside each matched column, decided from its
  values (section 12). Its `add`, when given, is the header template.
- `add` (a string) with a `match` object is a **CompanionRule**: it adds a
  computed column beside each matched column.
- `add` (a string) with no `match` is an **AddRule**: one computed column.
- a `match` object with no `add` is a **FormatRule**: it reformats matched
  columns in place.

A rule with neither `add` nor a usable `match`, or with no `fn`, is dropped.

Any rule MAY also carry a `when(columns)` **data guard**: a self contained
predicate over the result's columns (`{ name, type }` each). The rule applies
only where it returns true and does **nothing** elsewhere: an AddRule's,
CompanionRule's or SpreadRule's computed columns are not added, a FormatRule
does not run. The
guard is compiled in isolation (no module closure), exactly like a view's
`when`, so it MUST NOT reference anything outside itself; a guard that throws or
will not compile is treated as false. PlumeSQL runs it where the formulas
run (section 6: no network, no host interface), asynchronously and bounded
in time, once per guard and column set; until its answer arrives the rule
does not apply. It is the way to express "add a `name`
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
  (`'timestamp without time zone'` still matches its `(3)` form). A **schema
  qualification** is ignored the same way: PostgreSQL's `format_type` names a
  type `public.geometry` when its schema is off the `search_path`, and
  `'geometry'` still matches it (a string that names the schema,
  `'public.geometry'`, matches only the qualified form). An exact full
  string (`'numeric(8,2)'`) matches only that. A column whose type is unknown
  matches only `type: ''`.
- `type` as a **RegExp** tests the **full type text** (modifier included), for a
  prefix or family match: `/^numeric/`, or `/^(smallint|integer|bigint|numeric|real|double)/`
  for every number type. A `RegExp` that cannot be constructed matches nothing.
- `index` matches the column's 0 based position. `'first'` is position 0;
  `'last'` is the final column (position `count - 1`).
- `input` names one of the module's `column` or `multi-column` inputs (section
  10) and matches the column, or each of the columns, its answer names. An input
  with no answer matches nothing, so the rule formats no column until the user
  picks one; a key that is not a column input of the module matches nothing
  either, and a host SHOULD warn about it.

### 4. Precedence when several formatters match one column

A column wears at most one formatter. When more than one FormatRule matches it,
the winner is the one with the highest **priority**. A rule's priority is its
explicit `priority`, or, when omitted, its match **specificity**:

- an exact `name` (string), or an `input`, is the most specific,
- then `index`,
- then a `name` `RegExp`,
- then `type`;
- a match that sets more fields is more specific than one that sets fewer.

On an exact tie, the rule listed **later** in the file wins. An AddRule and a
CompanionRule never compete for a column; they contribute their own new columns.

A computed column (an AddRule's, or each of a CompanionRule's) MAY wear a
formatter too, by the same precedence, chosen among the FormatRules in scope
from every module, its own included. It has no PostgreSQL type and no
position among the result's columns, so only a match by its **header** selects
it: `name` (a string or a `RegExp`) or an `input` whose answer names the header;
a match that also sets `type` or `index` never selects a computed column. The
formatter runs right after the computed value on the same row, with that value
as its `value` and its own `ctx.prev` and `ctx.inputs`; the cell shows the
formatter's return, while the ROW keeps the raw computed value (later rules, the
next row's `prevRow` and the computed column's own `ctx.prev` see the number,
not the formatted text). A formatter that throws on a row leaves that computed
cell undressed. A host SHOULD count computed columns as columns wherever a
column input is answered or checked.

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
  previous returned value; this is what makes a running total possible),
  `inputs` (the answers to the module's inputs, section 10, every one a string;
  an empty object when the module declares none), and
  `log` (a function that writes a line to the host's log, like `console.log`).
  - `prev` threads over the rows the host computes together. When the result is
    small enough to compute at once, that is the WHOLE result, so a value that
    accumulates down the rows (a running total) is correct end to end. On a large
    result the host computes a block at a time, so `prev` is `undefined` at each
    block's first row and a running total **resets at block boundaries**. A value
    that must accumulate over an arbitrarily large result belongs in SQL (a window
    function), since the host cannot hold every row of a large result at once.

A formula (and the module's top level when its rules are read) runs where it
can reach neither the network nor the host's own interface: PlumeSQL starts
the worker from a blob inside a sandboxed, opaque-origin frame whose policy
allows no connection at all, so `fetch`, `XMLHttpRequest`, `WebSocket` and a
dynamic `import()` of a URL all fail. A remote library the file imports
statically is fetched by the host, on its allowlist, and handed over as a
module, and only from a host on the user's allowlist.

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
  - `style` is inline CSS. A host MUST drop a style that could make the
    browser fetch or run something (`url(`, `image-set(`, `@import`,
    `expression(`, a `javascript:` or `data:` value, a backslash escape).
    PlumeSQL drops the whole style.
  - `align` is `'left' | 'right' | 'center'`; any other value is ignored.
  - `title` is the cell's hover text.
  - `html` is markup **as a string** (not an element), rendered in place of the
    text. A host MUST NOT insert it as received: the file is extension code and
    the values it wraps come from the database. PlumeSQL READS the markup and
    REBUILDS the cell from what it recognises, text formatting (`span`, `div`,
    `b`, `strong`, `i`, `em`, `u`, `s`, `small`, `sub`, `sup`, `mark`, `code`,
    `br`) and drawing (`svg`, `g`, `path`, `circle`, `ellipse`, `rect`, `line`,
    `polyline`, `polygon`, `text`, `tspan`, `title`), each with its
    presentational attributes (`class`, `style`, `title`, the SVG geometry and
    paint attributes). Everything else is gone: scripts and their content, event
    handlers, links, images, frames, any value that could fetch. An unknown
    element's text stays as text. The author SHOULD still escape interpolated
    values, so a value that happens to look like markup reads as itself.
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

### 10. Inputs

A module MAY declare `inputs` beside its rules, in the object export
(`{ inputs, rules }`). An input has the shape of a view's input
(`ViewInput`, declared in plumesql-extension.d.ts): a `key`, a `kind` (`column`, `multi-column`,
`choice`, `number`, `text` or `color`), a `label`, and optionally `options` (a choice's
constants), `types` (the type families a column input offers), `default` and
`description`. A malformed entry is dropped, as a view's is. The list belongs to
the module's rules together, not to one rule, and it is separate from any
view's inputs in the same file.

The host resolves one answer per input for each result the module applies to,
in this order: the user's own pick for that result's query, then a script's
`-- @inputs` line above the query or in the file's header (docs/ACTIONSPEC.md
8.30; a prefix `-- @inputs <id>: ...` answers this module alone), then the
input's `default`, then nothing (an empty string). A host MUST NOT guess a
column for a column input that has no answer: an unanswered `match: { input }`
selects no column, so a rule is never pointed at a column the user did not name.

An input without a `default` is REQUIRED. When the module is applied to a fresh
result and a required input has no answer, a conforming host SHOULD ask for it
once, in the form it uses for a view's inputs; it MUST NOT ask on its own for a
result it restored (startup opens nothing), and it SHOULD keep a way to change
the answers at any time. Every formula receives the answers as `ctx.inputs`,
and a new answer recomputes the module's cells like an edited formula does.

### 11. Inspectors

A module MAY declare `inspectors` beside its rules and views, in the object
export (`{ rules?, views?, inspectors }`). An inspector READS ONE VALUE of a
column it matches and answers what the value is: a reading line, a few facts,
a small sketch, the value decoded into another spelling. It never shapes the
grid; the host owns every surface its answer shows on and draws them the same
way for every inspector (the grid's hover card, the peek strip, the value
tab's panel, subtitle and face toggle, the row editor's field preview). It is
the extension point for types whose text a person cannot read at a glance:
the types a PostgreSQL extension brings (PostGIS geometry, pgvector), which
the host never reads itself, and core types alike (hstore, ranges, ltree,
inet, tsvector, an image in a bytea).

An inspector is `{ match, label?, inspect }` (`GridInspector` in the type
block):

- `match` is a `ColumnMatch` (section 3) and MUST name a column by `name`,
  `type` or `index`; a match on an `input` is refused (an inspector reads
  single values where no input form is asked) and the entry dropped, like an
  entry with no `inspect` function. A type match is the usual one.
- `label` names what the value decodes to on the value tab's face toggle,
  "Decode <label>"; absent, the column's type (without schema and modifier)
  names it.
- `inspect(value, ctx)` is called with ONE non-NULL value, as the server's
  text, and the `InspectContext`: the column, the `surface` asking, the sketch
  box that surface has room for (`width` x `height`, CSS pixels), the theme's
  base and colours, and `log`. It runs where the formulas run (section 6: a
  sandboxed worker, no DOM, no network, bounded by the host's timeout), in a
  worker the host keeps WARM for the module's current version, so the module
  is imported once, not per value; module-level state MAY persist between
  calls of one version and MUST NOT be relied on across versions. It MAY
  return a Promise.

What `inspect` returns (`Inspection`), every field optional and a string
(`facts` an array of strings; anything else is dropped, and each field is cut
to the host's limits):

- `line`: one line reading the value. The hover card's text, the peek's
  strip, and on the `value` surface the part of the subtitle after the type.
- `html`: a small sketch as markup, within the surface's box. The host
  rebuilds it from the elements it knows (text formatting, and SVG: `svg`,
  `g`, `path`, `polyline`, `polygon`, `circle`, `ellipse`, `rect`, `line`,
  `text`) with their drawing attributes only, exactly as it does a cell
  descriptor's `html` (section 7): no script, handler, link or image survives.
  The host paints SVG in the theme's colours BY CLASS wherever the markup
  names no colour of its own: shapes stroke in the accent, a `path.closed` or
  a `polygon` fills faintly, a `circle` fills, a `line.axis` is a quiet zero
  line. An explicit `fill` / `stroke` attribute or inline style wins.
- `facts`: the value tab's facts, one short span each; the first is the
  headline (the kind of thing the value is).
- `note`: one sentence under the facts (what the sketch is and is not).
- `face`: `{ text, label?, title? }`, the value in another SPELLING (EWKB hex
  decoded to EWKT). The value tab shows the face by default in its editor,
  with a "Decode <label>" toggle back to the value as stored; its Copy copies
  the face shown. The card and the peek show the face text clipped. `label`
  names the spelling in the toggle's tooltip, `title` replaces the tooltip.

Returning `null` or `undefined` (or an object carrying none of the fields)
DECLINES: the value is not this inspector's to read. A throw, a timeout and a
module that will not load are declines too, and the host logs the failure once
per module version (not once per value). The `surface` lets one inspector
answer each surface in its own room: `'hover'` (a card of about 430 x 120),
`'peek'`, `'value'` (the full reading: facts, note and face) and `'field'` (a
row editor's input, called with what is TYPED, which may be a literal being
written rather than a stored value; debounced by the host, so typing asks
once per pause). Answering only the fields a surface shows is the norm.

**Order.** For a column, the candidates are every in-scope inspector whose
match selects it (scope as a rule's, section 9), the more specific match
first (section 4's specificity) and the later declared first on a tie, and
after them the host's own readings of core types. The first that answers
wins; a decline hands the value to the next. So an extension's inspector for a
type always wins over the host's own reading of that type. A host MUST gate
its own readings on the column's DECLARED type, never on what a value looks
like (a text column holding hex is text); the one heuristic it MAY keep is
reading a text value that parses as JSON as JSON in its value tab, and only
after every inspector that claims the column declined.

**Tooltips.** A column some inspector reads (on the hover surface) carries no
native tooltip: the raw dump is the noise the card replaces.

### 12. Spread rules

A SpreadRule (`match` and a `spread` function) adds several computed
columns beside each column its match selects, as many and with the keys
its `spread` answers for that column. It is a CompanionRule whose number
of columns is decided at run time: "every key of a json column as a
column of its own" is one rule.

**The spread call.** For each matched column, PlumeSQL calls
`spread(values, ctx)` once with that column's values in the first 500
rows of the result (fewer when the result is shorter), as the server's
text, NULL as `null`. `ctx` carries the matched `column` (`name`, `type`,
`index`), every `columns` of the result (so a key that would repeat a
column's name can be given another header), the module's `inputs` and
`log`. It runs where the formulas run (section 6: in the sandbox, no
network, no host interface), with the module's closure, bounded by the
same time limit; it MAY return a promise. It answers the KEYS of the
columns to add, in order: an array of strings. Only non-empty strings of
at most 200 characters count, a repeated key counts once, and at most 50
keys become columns beside one matched column; the rest are left out and
the Log says how many.

**When it runs.** The spread runs once those rows are in: when the
result's first 500 rows have arrived, or when a shorter result is
complete. Until then, and until its answer arrives, the matched column
gets no spread columns (a spread, like a guard, grants nothing by
default). The answer holds for that result: keys that first appear past
row 500 add no column. Running the query again, changing the module's
input answers or editing the module asks again.

**The columns.** Each key becomes one computed column on the rule's side
of the matched column (`at`: `'after'`, the default, or `'before'`), in
the answered order, under the header the `add` template makes: `{key}`
becomes the key and `{col}` the matched column's name; without `add`
the header is the key itself. Like a companion's, each column's `fn` is
called per row with the matched column's cell as `value`, and its key as
`ctx.key`. The columns are computed columns like any other: a formatter
may dress them by header, a column input may name them, and they copy and
export with the rest.

**Failure.** A spread that throws, rejects, runs out of time or answers
something other than an array adds no columns for that column; the
reason goes to the Log once per rule. A `fn` that throws marks its cell
as for any computed column (section 8).


### 13. Formats

A file's `formats` (an array of `GridFormat`) adds shapes to the result
grid's Copy and Save, beside the host's built-in ones (tab and comma
separated, a JSON array, JSON objects, a Markdown table). An entry is
dropped, and the editor's inline check says why, when it has no `format`
function, when its `id` is not 1 to 48 lowercase letters, digits and
hyphens starting with a letter or a digit, when its `id` repeats an earlier
entry's in the same file, when its `label` is not a non-empty string, or
when `extension` is given and is not a short file extension (1 to 10
letters and digits, a leading dot allowed and ignored). `extension`
defaults to `txt`.

**Which shapes are built in.** The host keeps the formats for exchanging
data built in, because they must work at any size: tab and comma
separated text and the two JSON shapes are written by the host itself,
and a Save or a table's Export Data in one of them streams every row,
millions included, with no row limit. The Markdown table is built in too,
since the host's own surfaces (the Log's console line) print one. A
format an extension adds is made on the page, in its sandbox, from at
most the copy row limit; it suits the shapes that generate code or serve
one purpose (SQL statements, an HTML or a LaTeX table, a shape a team
agreed on), which is where extensions belong.

**Identity.** A format is named `<extension id>/<format id>` (the
extension's marketplace id, the directory its file lives in). That name is
what the host's copy and save format settings hold, so a choice survives a
restart and, while the extension is not installed, still names it: the host
then copies and saves in its default shape and shows the stored name as
chosen but absent, and never rewrites the setting.

**Where it is offered.** On EVERY result, once the extension is installed
and extensions are on: in the menus that copy or save once in a shape of
the user's choosing, and in the ones that choose the shape the copy
shortcut and the save use. Unlike a rule, a view or an inspector, a format
has no scope (section 9): a copy and a save are gestures the user makes
on purpose and in a shape they picked by name, so a scope could only hide
a choice they already made. Two extensions never collide, since the name
carries the extension id. The host MAY also offer them where it reads a
relation's rows directly rather than a result's (a table's or a view's
copy or export of its data); there `ctx.source` names that relation
exactly (below) and the rows are its first rows up to the copy row limit.

**The call.** `format(data, ctx)` runs in a sandboxed worker (no DOM, no
network, no host interface), once per copy or save, with:

- `data.columns`: the columns being copied, `{ name, type }` each, in the
  order the grid shows them, hidden ones left out;
- `data.rows`: their rows, each value the server's text or `null`; a
  column a rule formats or computes carries what the grid SHOWS, as a copy
  in a built-in shape does;
- `ctx.source`: `{ schema, table, key }` when the host knows the table the
  result was read from (a query on one table) AND every copied column is a
  column of that table (none an expression, none computed by a rule),
  `key` the columns that identify a row (the primary key, or a NOT NULL
  unique index standing in for one; empty when there is none); absent
  otherwise. When the rows are a relation's own, read directly, it is
  always present: `table` names the relation (a view included) and `key`
  is its primary key, empty for a relation without one;
- `ctx.purpose`: `'copy'` or `'save'`;
- `ctx.log`: a line to the host's Log, like a formula's.

It returns ONE string, or a promise of one: the clipboard's text or the
file's content. The rows are what a copy takes: the selection, or every row
when nothing is selected or the gesture was Copy All / Save All, at most the
host's copy row limit. A save in an extension's format is made on the page
from those rows, so the copy row limit applies to it too; the host says so
in its Log when it cut the rows. The host's header switch (column names on
a first line) means nothing to a format and is not offered with one.

**Failure.** A format that throws, rejects, returns anything but a string,
cannot load or runs longer than the host's limit (at least ten seconds, more
when the host's extension time limit is larger) fails the copy or the save
as a whole: nothing reaches the clipboard or the file, and the reason goes
to the host's Log.

### 14. Refactors

A module MAY declare `refactors`: rewrites the SQL editor offers on a
statement beside its own (the lightbulb, Ctrl+. or Cmd+.). A refactor is an
object with an `id` (lowercase letters, digits and hyphens, unique within the
module; a repeated id keeps the first) and a `refactor(statement, ctx)`
function. An entry without either is dropped and the editor's check of the
file says why. The host keys a refactor `<extension id>/<id>`.

**Alone in its module.** A module that declares refactors MUST declare
nothing else: no rules, views, inspectors or formats (empty lists are
nothing). In the Marketplace such a module is a REFACTOR extension
(`"kind": "refactor"` in its manifest, the same `.plumesql.js` file), and
a grid extension's module declares no refactors (the Marketplace's kinds). The editor's rewrites and a result's dressing are wanted in
different places (a refactor everywhere, a sketch only where a script asks
for it), and the scope belongs to the whole extension, so they live in
extensions of their own. A module that mixes them keeps its rules, views,
inspectors and formats and its refactors are not read; the editor's check of
the file says so.

**Where.** A refactor is scoped like a rule (section 9), read against the
EDITOR: `@for` against the script the statement is in, `@query` against the
statement's text and, for a table target, the statement's one table. A
`-- @extension` naming the extension in the script's header or above the
statement applies it there whatever its scope, as it does a rule to a result;
unscoped, it applies nowhere. Within its scope a refactor decides for itself
whether it has anything to offer, from what it is given, and answers nothing
otherwise. Turning extensions off (`extensions.enabled`) turns them off.

**The call.** The host calls `refactor(statement, ctx)` whenever it asks its
own refactors for a statement: when the caret settles in one, and on Ctrl+. or
Cmd+.. It runs in the same sandbox as an inspector (no DOM, no network, no host
interface), with the module's closure, bounded by `extensions.runTimeoutMs`,
and MAY return a promise. Being asked on every caret move, a refactor MUST be
quick and MUST answer from what it is given; it cannot ask the server.

`statement` carries:

- `text`: the statement from its first code token to its end, the `;`
  included. Every offset (`caret`, an edit's `from` and `to`) indexes it.
- `caret`: where the caret stands in `text`. A host offers the same
  refactors wherever the caret stands in one statement, so a refactor SHOULD
  read the caret only to choose among several candidates of one kind (two
  `*`, two subqueries), and offer a single candidate from anywhere.
- `keyword`: the leading keyword in lower case (`select`, `with`, `insert`,
  `update`, `delete`, ...).
- `tables`: the relations the statement reads or writes at its own level (its
  FROM and JOINs, an UPDATE's or a DELETE's target, an INSERT's table),
  resolved in the connection's dictionary; one the dictionary does not know
  is left out, a subquery's own tables are not listed. Each carries `ref`
  (how the statement names it), `alias`, the exact `schema` and `name`, its
  `columns` (`name`, the declared `type` as PostgreSQL prints it, `pk` its
  place in the primary key, `ref` the column a foreign key makes it
  reference), and `timescale.timeColumn` when it is a TimescaleDB hypertable.

`ctx` carries `serverVersion` (the connected server's major version, when
known) and `log` (a line to PlumeSQL's Log, as for a formula).

**The answer.** A refactor answers an offer (`{ title, edits }`), an array of
them, or `null` / `undefined` for nothing. `title` is what the lightbulb's
list says (trimmed, at most 120 characters). `edits` replace
`text[from, to)` with `text`, all at once, as ONE undo step; offsets are
integers inside the statement and edits MUST NOT overlap. An offer that
breaks any of this is dropped whole, and at most 20 offers of one call are
read. The host lists the offers after its own refactors, every extension's in
the order the extensions load.

**Failure.** A refactor that throws, rejects or runs out of time offers
nothing, and the host logs the failure once per module version, with the
module one click away. Its `ctx.log` lines go to the Log as a formula's do.
