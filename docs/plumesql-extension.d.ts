// The ambient types a PlumeSQL grid extension (a .plumesql.js module) is
// written against: the application's extension editors load exactly these
// for completion and checking. Global, not a module: annotate the default
// export and the callbacks light up:
//
//   /** @type {PlumeSQLExtension} */
//   export default { rules: [ { match: { type: "boolean" }, fn: (value, row, prevRow, ctx) => value } ] }
//
// Published from the application source; edit it there, not here.
/** A cell's value before this rule shapes it: a formatter's cell, or undefined
 * for a computed column that has no source cell. Its runtime type follows the
 * column, which the checker cannot know, so it is any: the author works with it
 * as the type they know it is, and the checker still catches the rest. */
type GridValue = any;

/** A result row, addressable by column NAME (row.amount) or POSITION (row[0]).
 * Duplicate names resolve to the last; positions are unambiguous. Null-prototype,
 * so a column named "constructor" is safe. Cell values are any, like GridValue. */
type GridRow = { readonly [name: string]: any; readonly [index: number]: any };

/** The 0-based-indexed context of one formula call. */
interface GridContext {
  /** This row's absolute index in the whole result, from 0 (not the visible window). */
  i: number;
  /** The result's total row count. */
  count: number;
  /** The column this rule runs for. */
  column: { name: string; type: string; index: number };
  /** This column's OWN previous returned value (undefined on the first row):
   * what makes a running total possible. Any, like the cell value. */
  prev: any;
  /** The answers to the module's inputs (declared beside its rules), every one
   * a string: a column name, a threshold, a chosen option. Empty when the
   * module declares none. */
  inputs: Record<string, string>;
  /** Write a line to PlumeSQL's Log, like console.log (which is also captured). */
  log(...args: unknown[]): void;
  /** In a spread rule's column: the key its spread answered for this column.
   * Absent for every other rule. */
  key?: string;
  /** The formatting helpers: ctx.fmt.number(value), ctx.fmt.ago(value) and the
   * rest. A formula written on a script's -- @format or -- @computed line
   * reaches the same helpers as plain fmt. */
  fmt: GridFmt;
}

/** The formatting helpers a formula reaches as ctx.fmt (and as fmt on a
 * script's -- @format and -- @computed lines). Each one leaves a value it
 * cannot read unchanged, NULL above all, so a NULL cell keeps showing NULL. */
interface GridFmt {
  /** The number with the locale's group separators, right aligned. options
   * are Intl.NumberFormat's, such as { maximumFractionDigits: 2 }. */
  number(value: GridValue, options?: Intl.NumberFormatOptions): GridResult;
  /** The number as an amount of money in the currency named by its ISO code
   * (USD by default), right aligned. */
  currency(value: GridValue, currency?: string, options?: Intl.NumberFormatOptions): GridResult;
  /** A fraction as a percentage with this many decimals (0 by default):
   * 0.25 reads 25%. */
  percent(value: GridValue, digits?: number): GridResult;
  /** The day of a date or timestamp, YYYY-MM-DD. */
  date(value: GridValue): GridResult;
  /** How long ago (or how far ahead) a timestamp is, such as 3 hours ago,
   * with the exact value on hover. */
  ago(value: GridValue): GridResult;
  /** A boolean in words (Yes and No by default), green for true and red for
   * false. */
  yesNo(value: GridValue, yes?: string, no?: string): GridResult;
  /** The text in capitals. */
  upper(value: GridValue): GridResult;
  /** The text in small letters. */
  lower(value: GridValue): GridResult;
  /** The value in a rounded tag. */
  tag(value: GridValue): GridResult;
  /** NULL as a dimmed word ((null) by default), so it stands apart from an
   * empty string. */
  dimNull(value: GridValue, text?: string): GridResult;
  /** Text made safe to put into a cell descriptor's html. */
  escape(text: unknown): string;
}

/** The formula on a script's -- @format or -- @computed line, as its editor
 * tab shows it: the cell, the row, the row above, the context and the
 * formatting helpers, returning what the cell shows. */
type PlumeSQLFormula = (value: GridValue, row: GridRow, prevRow: GridRow | null, ctx: GridContext, fmt: GridFmt) => GridResult;

/** The context of a spread rule's spread call. */
interface SpreadContext {
  /** The matched column being spread. */
  column: { name: string; type: string; index: number };
  /** Every column of the result, so a key that would repeat a column's name
   * can be given another header. */
  columns: ViewColumn[];
  /** The answers to the module's inputs, every one a string. */
  inputs: Record<string, string>;
  /** Write a line to PlumeSQL's Log, like console.log. */
  log(...args: unknown[]): void;
}

/** A formatter class: green ok, red bad, amber warn, grey muted, bold strong. */
type GridClass = 'fmt-ok' | 'fmt-bad' | 'fmt-warn' | 'fmt-muted' | 'fmt-strong';

/** A cell descriptor a formula may return to decorate the cell. Only these
 * fields are honoured, strings only for the string ones, so a formula can never
 * return a live object into the page. */
interface GridCellDescriptor {
  /** The cell text (or the value to decorate). */
  value?: unknown;
  /** A formatter class. The five built-ins (GridClass) are the ones PlumeSQL ships
   * CSS for; a custom class name is applied to the cell too, but an extension
   * cannot add the CSS to style it, so use the style field (inline CSS) for a
   * custom look and keep class for the built-ins. */
  class?: GridClass | (string & {});
  /** Inline CSS for anything the classes do not cover. */
  style?: string;
  /** Markup as a STRING (not an element), rendered into the cell. PlumeSQL
   * rebuilds it from the text formatting and SVG drawing elements it knows, so
   * a script, a handler, a link or an image never reaches the page; still
   * escape the data you put in it. A formula runs in a Worker with no DOM, and its result
   * is posted back (which cannot carry a DOM node), so it can neither create nor
   * return an HTMLElement; put the markup here as a string. For hand-built DOM,
   * a result VIEW is the place: its render(root, ...) runs in the iframe with a
   * real element to build into. */
  html?: string;
  /** The cell's hover text. */
  title?: string;
  /** Cell alignment (numbers read best right aligned). */
  align?: 'left' | 'right' | 'center';
}

/** What a formula returns: a plain value shows as text, a descriptor also
 * decorates, anything else shows as its string. It must be SERIALIZABLE (the
 * formula runs in a Worker and the result is posted back), so never an
 * HTMLElement or other live object; custom markup is the descriptor's html
 * string, and hand-built DOM belongs in a result view's render(root, ...). */
type GridResult = GridCellDescriptor | string | number | boolean | bigint | Date | null | undefined;

/** A rule's formula, called once per row in result order. Runs in a Worker (no
 * DOM, bounded by a timeout) and must be self contained. */
type GridFn = (value: GridValue, row: GridRow, prevRow: GridRow | null, ctx: GridContext) => GridResult;

/** Which columns a rule matches. Every field set must hold (AND). */
interface ColumnMatch {
  /** An exact name (string), or a RegExp tested against the name. */
  name?: string | RegExp;
  /** The PostgreSQL type as the header shows it. A STRING matches by the BASE
   * type, ignoring any precision / length modifier: 'numeric' matches 'numeric'
   * and 'numeric(8,2)' and 'numeric(12,4)'; 'character varying' matches
   * 'character varying(255)'. A schema qualification is ignored the same way:
   * 'geometry' matches public.geometry (how format_type names a type whose
   * schema is off the search_path). A RegExp tests the full type text, for a prefix or
   * family match (/^numeric/, /timestamp/). */
  type?: string | RegExp;
  /** A 0-based position, or the first / last column. */
  index?: number | 'first' | 'last';
  /** The key of one of the module's column or multi-column inputs: the rule
   * matches the column(s) the user picked for it, and none while it has no
   * answer. */
  input?: string;
}

/** Where an added (computed) column goes. */
type ColumnPlacement = 'end' | 'start' | { before: ColumnMatch } | { after: ColumnMatch };

/** One grid rule: a FORMATTER (match + fn, shapes a column in place), a COMPUTED
 * column (add + fn, a new column), a COMPANION (match + add + fn, a computed
 * column beside each match), or a SPREAD (match + spread + fn, as many computed
 * columns beside each match as its values call for). */
interface GridRule {
  /** The columns to format (a formatter), or the source columns a companion
   * attaches to or a spread spreads. Absent for a plain computed column. */
  match?: ColumnMatch;
  /** The header of the computed column; absent for a formatter. As a companion
   * header, "{col}" stands for the matched column's name; as a spread's,
   * "{key}" for the column's key too (default "{key}"). */
  add?: string;
  /** A SPREAD: called once per matched column with its values in the first 500
   * rows (the server's text, NULL as null), it answers the keys of the columns
   * to add beside it, in order (strings, at most 50 count). Each column's fn
   * then reads the matched cell as value and its key as ctx.key. */
  spread?: (values: (string | null)[], ctx: SpreadContext) => string[] | Promise<string[]>;
  /** Where a computed column goes (default 'end'). With match AND add (a
   * companion, a computed column beside EACH matched column), 'before' puts it
   * before each match, anything else after. */
  at?: ColumnPlacement;
  /** Optional data guard: the rule applies only where this returns true for the
   * result's columns, and does nothing elsewhere. Write it as an ARROW: it is
   * compiled on its own, and a method shorthand cannot be. */
  when?: (columns: ViewColumn[]) => boolean;
  /** Higher wins when several formatters match one column; equal keeps the later. */
  priority?: number;
  /** The formula, run once per row. */
  fn: GridFn;
}

/** A result column, as when() and render() receive it. */
interface ViewColumn { name: string; type: string; }

/** A per-result INPUT a view (or a module's rules) asks the user for, so a
 * chart need not GUESS which column is which and a highlight knows its
 * threshold. The chosen value arrives as ctx.inputs[key]. */
interface ViewInput {
  /** The key the value arrives under in ctx.inputs. */
  key: string;
  /** What the pick form shows for this input:
   * "column": a pick over the result's columns (narrowed by types);
   * "multi-column": several columns at once, for comparison series; the value is
   *   a COMMA-SEPARATED list of column names (split it, then look each up). It
   *   pre-fills with every column matching the input's types, so a chart shows
   *   them all and the user edits the list to add or remove a series;
   * "choice": a pick over the options constants;
   * "number": a numeric field (the value still arrives as a string, parse it);
   * "text": a free-text field;
   * "color": swatches of the theme's colours and a custom picker; the value is
   *   a theme colour's NAME (accent, red, amber, green, violet), which changes
   *   with the theme, or a #rrggbb. In a rule write var(--name) for a name; in
   *   a view read ctx.palette[name] (a hex passes through as it is).
   * Every value reaches render as a STRING in ctx.inputs[key]. */
  kind: 'column' | 'multi-column' | 'choice' | 'number' | 'text' | 'color';
  /** The field label in the pick form. */
  label: string;
  /** One short sentence on what the input does, for an input its label
   * cannot make plain: shown on the label in the pick form and on the key in
   * a -- @inputs line. Leave it out when the label says it all. */
  description?: string;
  /** choice: the constants to pick from. */
  options?: string[];
  /** column: the type families the pick is narrowed to
   * ('numeric' | 'text' | 'temporal' | 'boolean' | 'json' | 'any'). */
  types?: string[];
  /** Prefills the input and makes it optional; absent means required (the tab
   * prompts for it before it draws). A number/text input with no default is a
   * required field the user fills before the first draw. */
  default?: string;
}

/** The data a view's render receives: a bounded window of the result, or,
 * for a view in a pipeline (`-- @extension pivot | echarts`), of the table
 * the stage before it made, its column types read from the values. */
interface RenderData {
  columns: ViewColumn[];
  rows: unknown[][];
}

/** The active color theme's colors, by role (RenderContext.palette). */
interface ViewPalette {
  /** The theme's id: "dark", "light" or a theme extension's ("nord"). */
  id: string;
  name: string;
  base: 'dark' | 'light';
  /** The window's background and the ground a view paints on. */
  background: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  green: string;
  red: string;
  amber: string;
  violet: string;
  /** The editor's syntax colors, a ready categorical set for series. */
  keyword: string;
  string: string;
  number: string;
  comment: string;
  type: string;
  func: string;
}

/** The context a view's render receives. */
interface RenderContext {
  /** The app theme's BASE; paint for both (a hard rule). A theme extension
   * (Nord, Solarized Light ...) answers its base here and its colors in
   * palette. */
  theme: 'dark' | 'light';
  /** The active color theme's colors by role, concrete hex: paint a chart in
   * them and it follows every theme, not only Dark and Light. surface is
   * the ground the view sits on. */
  palette: ViewPalette;
  /** The resolved values of the view's inputs, keyed by their key (a picked
   * column's name, a chosen constant, a typed number or text); {} when none.
   * Every value is a STRING. */
  inputs: Record<string, string>;
  /** How many rows the result holds, what ctx.rows can page (a pipeline
   * stage: its table's rows). A view that reads past data.rows with a cap
   * says "first N of M rows" with it. */
  rowCount: number;
  /** Write a line to PlumeSQL's Log. */
  log(...args: unknown[]): void;
  /** Copy text to the clipboard through the host (the iframe cannot reach it):
   * a summary, a computed value, the data behind the chart. */
  copy(text: string): void;
  /** Select and reveal the row at this 0-based index in the result grid beside
   * the view, so a click on a bar or a point highlights its row. A no-op when no
   * grid is shown (a view opened in a tab of its own). */
  selectRow(index: number): void;
  /** Fetch a further window of the result, beyond the bounded one in RenderData:
   * ctx.rows(offset, limit) resolves to that block of rows (same shape as
   * data.rows). Use it when a chart or report needs more than the initial window
   * (a lot of points), paging through the result's own stored cap. A big pull can
   * take a moment, so render meanwhile and update when it resolves.
   * { columns } ships only those columns of each row, in the order given,
   * each named by its name (the first column of that name) or its 0-based
   * index; a name or index the result lacks reads as null. Paging ONE column
   * of a wide result this way moves that column alone:
   * ctx.rows(0, 20000, { columns: [ctx.inputs.column] }). */
  rows(offset: number, limit: number, options?: { columns?: (string | number)[] }): Promise<unknown[][]>;
  /** The basemap the user chose for maps (extensions.mapStyle), the URL of a
   * MapLibre style to fetch with fetchMap; '' when maps draw on a plain
   * background. A map view draws on it rather than naming a host of its own. */
  mapStyle: string;
  /** Fetch one file of a map's basemap (its style, a tile, a font, a sprite)
   * through PlumeSQL: the view itself has no network. The URL must be https
   * and its host on the user's allowed map tile hosts (extensions.mapTileHosts);
   * resolves to the file's bytes, from PlumeSQL's map cache when it has them,
   * and rejects otherwise (the Log then offers to allow the host, and the view
   * draws again when it is). A map library's own requests go through it with
   * a custom protocol (MapLibre's addProtocol). */
  fetchMap(url: string): Promise<ArrayBuffer>;
}

/** A button PlumeSQL renders in the view's header (its label and an optional icon
 * name); clicking it runs this action with the view's live ctx, so it can copy,
 * select a row, or anything ctx offers. The run happens in the iframe like
 * render, so it may read the view's own state (a chart instance, the last draw). */
interface PlumeSQLViewAction {
  /** The button's label (also its tooltip). */
  label: string;
  /** An optional icon name, one of the app's own glyphs: `copy` (the copy
   * glyph every pane's Copy all rows has), `refresh`, `reset`, `play`,
   * `search`. The button then shows the glyph with the label as its
   * tooltip; with no icon, or a name not in this list, it shows the label. */
  icon?: string;
  /** What the button does, given the view's render ctx. */
  run(ctx: RenderContext): void | Promise<void>;
}

/** What a TABLE view answers: columns and rows PlumeSQL shows in its own result
 * grid (selection, copy, filter, export and the grid's every service), instead
 * of a drawing. A cell is a value the grid shows as text, as it does a
 * server's, or a GridCellDescriptor to DECORATE it the way a formatter rule
 * does (its value is the text copy and filter read; html, style, class, title
 * and align paint it: a histogram, a bar, a colour). A column's type names its
 * alignment and formatting ('numeric', 'text', 'timestamp', 'boolean'; absent
 * means text). */
interface TableResult {
  columns: { name: string; type?: string }[];
  rows: (unknown | GridCellDescriptor)[][];
  /** Rows kept in view while the rest scroll: indexes into rows, frozen at
   * the top (a heading row) or at the bottom (a totals row), the grid's own
   * Freeze Row at Top / at Bottom. */
  frozenRows?: { top?: number[]; bottom?: number[] };
  /** Columns kept in view while the rest scroll sideways: column names,
   * frozen at the start (a key column) or at the end (a total), the grid's
   * own Freeze Column at Start / at End. */
  frozenColumns?: { start?: string[]; end?: string[] };
}

/** A result VIEW: a tab a matching result grows. It either DRAWS (render, in a
 * sandboxed iframe) or answers a TABLE (table, shown in the app's own grid);
 * one of the two is required. */
interface PlumeSQLView {
  /** The tab's label. */
  tab: string;
  /** Optional guard on the column shape: only offer the tab when it returns
   * true. Write it as an ARROW: it is compiled on its own, and a method
   * shorthand cannot be. */
  when?: (columns: ViewColumn[]) => boolean;
  /** Buttons PlumeSQL shows in the view's header, each running with the live ctx. */
  actions?: PlumeSQLViewAction[];
  /** CLASSIC-script (UMD / IIFE / global) library URLs the view needs, e.g. a
   * charting library's browser build that defines a global (Chart.js's UMD
   * build). Each is fetched from an allowlisted host and injected as a <script>
   * BEFORE the view's module runs, so the global it defines (window.Chart, ...)
   * is there for render to use. This is NOT for ES modules: an ESM dependency is
   * a normal import at the top of the file (a local $store/ helper, or an
   * allowlisted CDN ESM URL), resolved through the module graph, not listed
   * here. Use scripts only for a library that has no ESM build, or whose ESM
   * build you would rather not pull. Loaded only from
   * extensions.remoteScriptHosts hosts; a blocked host is logged with a one-click
   * "Allow host". */
  scripts?: string[];
  /** Inputs to ask the user for (which column is X / Y, the chart kind). */
  inputs?: ViewInput[];
  /** When the form for those inputs opens, the view's own word; a script's
   * -- @ask / -- @noask lines win over it. 'first' (the default): on the first
   * draw of a result, so the user confirms guessed columns; 'missing': only
   * while a required input has no answer, so a view whose defaults are exact
   * (a fixed catalog shape) draws at once; 'never': never, render sees what it
   * has; 'always': on every fresh result. A file of several views sets the
   * word once with a // @ask <word> marker at its top; this wins over it. */
  ask?: 'first' | 'missing' | 'never' | 'always';
  /** Whether a right-click inside the view opens the app's view menu (the
   * default). A view that uses the right mouse button itself (a 3D chart's
   * rotate drag) sets false: the right button is then the view's alone, and
   * the same menu stays one click away on the header's dots button. */
  contextMenu?: boolean;
  /** An entry in the COLUMN menu (a header's menu, a cell's Column submenu)
   * of every column match selects, while the view applies to the result (in
   * scope, its when() passing): choosing it opens the view, focused, with
   * inputs[input] set to that column. input names one of the view's column
   * (or multi-column) inputs; a match on an input is not allowed. A view
   * that reads one column (a sketch of every geometry in it) offers itself
   * where the column is. */
  column?: { input: string; label: string; match: ColumnMatch };
  /** true: the view OPENS by itself on a result it applies to (in scope, and
   * its when() passes), the way an '-- @extension <id> open' line opens it, unless a
   * script line names another view to open on. For a view that is the point
   * of such a result (an EXPLAIN plan), never for one that is a choice among
   * many. */
  open?: boolean;
  /** Draw the view into root (the iframe body). Runs with full DOM, isolated from
   * the app: no database, no network beyond scripts, no navigation. A view
   * declares render or table, not both. */
  render?(root: HTMLElement, data: RenderData, ctx: RenderContext): void | Promise<void>;
  /** Compute a TABLE from the result instead of drawing: a pivot, a profile,
   * a report. Runs in the same sandbox with the same data and ctx (ctx.rows
   * pages the whole result), answers { columns, rows }, and PlumeSQL shows the
   * rows in its own result grid, with selection, copy, filter and export, the
   * same look as the result's. The first 100,000 rows show; a longer table
   * says so. Runs again when the inputs or the result change. */
  table?(data: RenderData, ctx: RenderContext): TableResult | Promise<TableResult>;
  /** Fit the drawing to a new pane size WITHOUT drawing again: called on a
   * settled resize instead of render when present (a WebGL view re-projects
   * its scene in a frame where render would rebuild every point). Throw to
   * have render run instead. The user may still choose Keep Size on Resize
   * (extensions.viewResize), in which case neither runs and the drawing scrolls. */
  resize?(root: HTMLElement, size: { width: number; height: number }, ctx: RenderContext): void | Promise<void>;
}

/** The surface an inspection is asked for: 'hover' the grid's hover card,
 * 'peek' the strip above a peeked value (Space), 'value' the value tab
 * (panel, subtitle, face toggle), 'field' the preview under a row editor's
 * input (called with what is TYPED, a literal being written). */
type InspectSurface = 'hover' | 'peek' | 'value' | 'field';

/** The context of one inspect call. */
interface InspectContext {
  /** The column the value belongs to. */
  column: { name: string; type: string; index: number };
  /** Which surface asks; answer each in its own room. */
  surface: InspectSurface;
  /** The sketch box the surface has room for, in CSS pixels: html beyond it
   * is clipped. */
  width: number;
  height: number;
  /** The app theme's BASE. */
  theme: 'dark' | 'light';
  /** The active theme's colours by role, for a sketch painted in concrete
   * colours (the host's sketch classes follow the theme on their own). */
  palette?: ViewPalette;
  /** Write a line to PlumeSQL's Log, like console.log (also captured). */
  log(...args: unknown[]): void;
}

/** What an inspector answers about one value. Every field is optional and a
 * string (facts an array of strings); anything else is dropped. */
interface Inspection {
  /** One line reading the value: the hover card's text, the peek's strip,
   * and on the value surface the subtitle after the type. */
  line?: string;
  /** A small sketch as markup (SVG or text formatting) within width x height.
   * PlumeSQL rebuilds it from the elements it knows (svg, g, path, polyline,
   * polygon, circle, ellipse, rect, line, text and text formatting), so no
   * script, handler, link or image reaches the page. Shapes with no colour of
   * their own follow the theme: strokes in the accent, class "closed" on a
   * path (or a polygon) fills faintly, class "axis" on a line is a quiet
   * zero line. */
  html?: string;
  /** The value tab's facts, one short span each; the first is the headline. */
  facts?: string[];
  /** One sentence under the facts. */
  note?: string;
  /** The value in another SPELLING (EWKB hex decoded to EWKT). The value tab
   * shows it by default with a "Decode <label>" toggle back to the stored
   * value, and Copy copies the face shown; the card and the peek show it
   * clipped. label names the spelling in the toggle's tooltip, title
   * replaces that tooltip. */
  face?: { text: string; label?: string; title?: string };
}

/** An INSPECTOR: reads one value of the columns it matches and answers what
 * it is, on the grid's hover card, the peek, the value tab and the row
 * editor's field. PlumeSQL owns those surfaces; the inspector only answers.
 * For a column the matching inspectors are tried most specific first, then
 * PlumeSQL's own readings of core types; the first answer wins. */
interface PlumeSQLInspector {
  /** The columns it reads, usually by type ({ type: 'hstore' }). A match on
   * an input is not allowed. */
  match: ColumnMatch;
  /** What the value decodes to, for the value tab's "Decode <label>" toggle;
   * absent, the column's type names it. */
  label?: string;
  /** Read one non-NULL value (the server's text). Runs in a sandboxed Worker
   * kept warm per module version (no DOM, bounded by a timeout). Return null
   * or undefined to DECLINE (not this inspector's value): the next matching
   * inspector, or the plain value, has it. A throw or a timeout declines
   * too, and is logged once per module version. */
  inspect(value: string, ctx: InspectContext): Inspection | null | undefined | Promise<Inspection | null | undefined>;
}

/** What a format is given: the columns being copied or saved, in the order the
 * grid shows them, and their rows, every value the server's text or null. */
interface FormatData {
  columns: { name: string; type: string }[];
  rows: (string | null)[][];
}

/** The context of one format call. */
interface FormatContext {
  /** The table the result was read from, when PlumeSQL knows it (a query on
   * one table) and every copied column is one of its columns (none an
   * expression or computed): its schema, its name and the columns that identify a row
   * (the primary key or a unique index standing in for one; empty when there
   * is none). Absent for a join, an expression or a function's result. */
  source?: { schema: string; table: string; key: string[] };
  /** Whether the text goes to the clipboard or to a file. */
  purpose: 'copy' | 'save';
  /** Write a line to PlumeSQL's Log. */
  log(...args: unknown[]): void;
}

/** A FORMAT: one more shape for the result grid's Copy and Save, beside the
 * built-in tab and comma separated, JSON and Markdown. It is offered on every
 * result once the extension is installed: in Copy As, Copy Format, Save As and
 * Save Format, and the copy shortcut follows the chosen Copy Format. */
interface PlumeSQLFormat {
  /** Its name within the extension: lowercase letters, digits and hyphens.
   * The settings remember it as "<extension id>/<id>". */
  id: string;
  /** What the menus say ("SQL INSERT"). */
  label: string;
  /** The file extension a save takes, without the dot; "txt" when absent. */
  extension?: string;
  /** Turn the rows into one text. Runs in a sandboxed Worker (no DOM, no
   * network), bounded by a timeout. A throw, a timeout or anything but a
   * string fails the copy or the save, and the Log says why. */
  format(data: FormatData, ctx: FormatContext): string | Promise<string>;
}

/** One column of a statement's table, as the connection's dictionary has it. */
interface RefactorColumn {
  name: string;
  /** The declared type as PostgreSQL prints it ('integer', 'vector(3)'). */
  type: string;
  /** Its place in the primary key, 1 for the first column; absent when in none. */
  pk?: number;
  /** True when it can hold no NULL (NOT NULL, or in the primary key); absent otherwise. PlumeSQL 0.26.0 and later. */
  notNull?: boolean;
  /** An identity column's GENERATED ALWAYS or BY DEFAULT; absent for any other. PlumeSQL 0.26.0 and later. */
  identity?: 'always' | 'by default';
  /** A generated column (GENERATED ALWAYS AS (...)), computed from the others: an INSERT cannot set it. PlumeSQL 0.26.0 and later. */
  generated?: 'stored' | 'virtual';
  /** The DEFAULT expression as PostgreSQL prints it (`now()`, `nextval('orders_id_seq'::regclass)`); absent when none. PlumeSQL 0.26.0 and later. */
  default?: string;
  /** The column a foreign key makes this one reference. */
  ref?: { schema: string; table: string; column: string };
}

/** One relation of the statement, resolved in the dictionary. */
interface RefactorTable {
  /** How the statement names it, as written (maybe qualified). */
  ref: string;
  /** Its alias in the statement, when it has one. */
  alias?: string;
  schema: string;
  name: string;
  columns: RefactorColumn[];
  /** TimescaleDB's hypertable facts, when the table is one. */
  timescale?: { timeColumn?: string };
  /** Its indexes, when the dictionary knows their keys (absent otherwise: a snapshot built before PlumeSQL 0.24.0). */
  indexes?: RefactorIndex[];
  /** The statistics' row estimate, once PlumeSQL has read the statistics
   * (when the lightbulb's list is opened); absent before, and for a table
   * never analyzed. */
  rows?: number;
  /** Its constraints' names (keys, foreign keys, checks, exclusions), when it has any. PlumeSQL 0.26.0 and later. */
  constraints?: string[];
}

/** One index of a relation. */
interface RefactorIndex {
  name: string;
  /** The access method: 'btree', 'gin', 'hnsw' ... */
  method: string;
  unique: boolean;
  /** The key columns in order; '' for an expression key. */
  keys: string[];
  /** Each key's operator class ('vector_cosine_ops'), in the same order. */
  ops: string[];
}

/** The statement a refactor reads. Every offset indexes text. */
interface RefactorStatement {
  /** From its first code token to its end, the ';' included. */
  text: string;
  /** Where the caret stands in text. Offer the same rewrites wherever the
   * caret stands; read it only to choose among several of one kind. */
  caret: number;
  /** Its leading keyword in lower case: 'select', 'with', 'insert', ... */
  keyword: string;
  /** The relations it reads or writes at its own level (FROM and JOINs, an
   * UPDATE's or a DELETE's target, an INSERT's table, and from PlumeSQL
   * 0.26.0 an ALTER TABLE's table). */
  tables: RefactorTable[];
  /** A query's main SELECT, read by PlumeSQL so a refactor carries no SQL
   * parser: absent for anything but a SELECT (or a WITH over one) and for
   * a set operation (UNION, INTERSECT, EXCEPT). */
  query?: RefactorQuery;
  /** A CREATE FUNCTION's or CREATE PROCEDURE's facts and what its body
   * does, read by PostgreSQL's own parser: absent for anything else and
   * until the parser has loaded. PlumeSQL 0.26.0 and later. */
  routine?: RefactorRoutine;
}

/** What a CREATE FUNCTION or CREATE PROCEDURE states, and what its body does. */
interface RefactorRoutine {
  kind: 'function' | 'procedure';
  /** Lower case: 'plpgsql', 'sql', 'c' ... */
  language: string;
  /** As declared; absent when the statement declares none (PostgreSQL then takes VOLATILE). */
  volatility?: 'immutable' | 'stable' | 'volatile';
  /** The return type as the parser names it ('int4', 'text', 'void', 'trigger'), 'setof ' before a set; absent for a procedure. */
  returns?: string;
  /** The LANGUAGE clause in text: a word added after it (' stable') goes at its 'to'. */
  languageClause?: { from: number; to: number };
  /** What the body does; absent when it does not parse, and for a C or internal function. */
  body?: RefactorRoutineBody;
}

/** What a routine's body does, read statement by statement. */
interface RefactorRoutineBody {
  /** A statement that is not a query (INSERT, UPDATE, DELETE, MERGE, DDL, SET ...), or a query with a data-modifying WITH. */
  writes: boolean;
  /** SQL built at run time: EXECUTE, FOR ... IN EXECUTE, OPEN ... FOR EXECUTE, RETURN QUERY EXECUTE. */
  dynamic: boolean;
  /** COMMIT or ROLLBACK. */
  transaction: boolean;
  /** A query that locks rows (FOR UPDATE, FOR SHARE ...). */
  locks: boolean;
  /** Every function and procedure it calls, each name once in order, with
   * its volatility from the dictionary (absent for a name the dictionary
   * does not know). */
  calls: { name: string; volatility?: 'immutable' | 'stable' | 'volatile' }[];
}

/** The main SELECT of a query, at the statement's own level (a CTE's body
 * and a subquery are not it). Every offset indexes the statement's text. */
interface RefactorQuery {
  /** The select list; an item appended goes at 'to', after a comma. */
  select: { from: number; to: number };
  /** The list's items, in order. */
  items: RefactorQueryItem[];
  /** Each clause after the list, from its keyword to its last token;
   * absent when the query has none. */
  clauses: {
    into?: { from: number; to: number };
    from?: { from: number; to: number };
    where?: { from: number; to: number };
    groupBy?: { from: number; to: number };
    having?: { from: number; to: number };
    window?: { from: number; to: number };
    orderBy?: { from: number; to: number };
    limit?: { from: number; to: number };
    offset?: { from: number; to: number };
    fetch?: { from: number; to: number };
    for?: { from: number; to: number };
  };
  /** SELECT DISTINCT (or DISTINCT ON). */
  distinct?: boolean;
  /** Where the body ends, before the ';' and any trailing comment: the
   * query as a CTE is text.slice(0, end). */
  end: number;
  /** The FROM's joins in the order written, as PostgreSQL's parser reads
   * them. Absent until the parser has loaded, for a statement that does
   * not parse, and before PlumeSQL 0.26.2. */
  joins?: RefactorJoin[];
  /** The WHERE as an expression tree, as PostgreSQL's parser reads it.
   * Absent when the query has none, until the parser has loaded, for a
   * statement that does not parse, and before PlumeSQL 0.26.2. */
  where?: RefactorExpr;
}

/** One join of a query's FROM. */
interface RefactorJoin {
  /** 'cross' for CROSS JOIN (an inner join with no condition). */
  kind: 'inner' | 'left' | 'right' | 'full' | 'cross';
  /** NATURAL JOIN. */
  natural?: boolean;
  /** The table or view joined (the right side), as the parser reads its
   * name (unquoted; an unquoted name in lower case), and its schema when
   * written. Absent for a subquery or a function. */
  table?: string;
  schema?: string;
  /** The alias of what is joined. */
  alias?: string;
  /** A LATERAL subquery or function. */
  lateral?: boolean;
  /** The join's words, from the first (LEFT, INNER, NATURAL, CROSS) to
   * JOIN: an edit turning a LEFT JOIN into a JOIN replaces them. Absent
   * where the words could not be placed (a join inside parentheses). */
  keyword?: { from: number; to: number };
  /** ON's condition; absent for USING, NATURAL and CROSS. */
  on?: RefactorExpr;
  /** USING's columns. */
  using?: string[];
}

/** An expression as PostgreSQL's parser reads it, where it is written. */
interface RefactorExpr {
  kind:
    | 'and' | 'or' | 'not'
    | 'operator'
    | 'between' | 'not between'
    | 'in' | 'not in'
    | 'like' | 'not like' | 'ilike' | 'not ilike'
    | 'distinct' | 'not distinct'
    | 'is null' | 'is not null'
    | 'column' | 'constant' | 'cast' | 'function' | 'subquery' | 'case' | 'other';
  /** The expression at text[from, to), its own parentheses outside. */
  from: number;
  to: number;
  /** Written inside parentheses of its own: (a and b). */
  parenthesized?: boolean;
  /** 'operator': the operator as PostgreSQL names it ('=', '<>' for both <> and !=, '<=', '||'). */
  op?: string;
  /** The operands in order: an operator's (one for a prefix operator), a
   * BETWEEN's value, low and high bound, an IN's value then its list, a
   * LIKE's value and pattern, a null test's value, AND's and OR's terms,
   * NOT's term, a cast's value, a function's arguments. Absent when the
   * text could not be taken apart the way the parser reads it: offer
   * nothing about such an expression. */
  args?: RefactorExpr[];
  /** 'column': its parts, unquoted ('o.amount': ['o', 'amount']). */
  column?: string[];
  /** 'constant': its value as text, a string without its quotes; absent for NULL. */
  value?: string;
  /** 'constant': what it is. */
  type?: 'string' | 'number' | 'boolean' | 'null';
  /** 'function': its name, unqualified; 'cast': the type as the parser names it ('date', 'timestamptz'). */
  name?: string;
  /** 'function': the * of count(*). */
  star?: { from: number; to: number };
  /** 'function': called with OVER. */
  over?: boolean;
}

/** One item of a select list. */
interface RefactorQueryItem {
  /** The item as written, at text[from, to). */
  text: string;
  from: number;
  to: number;
  /** The column it gives the result: its alias, else the column it names,
   * else the function it calls, else '?column?'. */
  name: string;
  alias?: string;
  /** '*' or 't.*'. */
  star?: boolean;
  /** It is, or holds, an aggregate call no OVER makes a window one. */
  aggregate?: boolean;
  /** A bare column reference's parts, unquoted ('o.amount': ['o', 'amount']). */
  column?: string[];
  /** Its declared type when known: the result's once the statement has run
   * as written, else the dictionary's for a column of its tables. */
  type?: string;
  /** Its expression as PostgreSQL's parser reads it, the alias left out.
   * Absent for a star, until the parser has loaded, and before PlumeSQL 0.26.2. */
  expr?: RefactorExpr;
}

/** What the statement returned the last time it ran as written. */
interface RefactorResult {
  /** The columns, with their declared types as PostgreSQL prints them. */
  columns: { name: string; type: string }[];
  /** The first rows (at most 50), each value the server's text, null for
   * NULL, cut at 4096 characters. */
  rows: (string | null)[][];
}

/** The context of one refactor call. */
interface RefactorContext {
  /** The connected server's major version (17, 18), when known. */
  serverVersion?: number;
  /** The extension's options (its options export), each the user's value
   * from the Refactors settings or its default: a number for a number
   * option, a string otherwise. */
  options: Record<string, string | number>;
  /** Where the user wants a new statement a refactor writes: 'above' the
   * statement, or in a new 'tab' (answer an offer with tab then). */
  queryPlace: 'above' | 'tab';
  /** How the user writes a run parameter (the Refactors settings): '$name' or ':name'. Absent before PlumeSQL 0.26.0, which wrote '$name'. */
  paramStyle?: '$name' | ':name';
  /** What the statement returned the last time it ran AS WRITTEN (its text
   * unchanged since): absent before a run and after an edit. Offer what
   * depends on the data only when it is here. */
  result?: RefactorResult;
  /** Write a line to PlumeSQL's Log. */
  log(...args: unknown[]): void;
}

/** One rewrite offered: what the lightbulb says, and the edits, applied at
 * once as one undo step. Edits replace text[from, to) and must not overlap. */
interface RefactorOffer {
  title: string;
  edits: { from: number; to: number; text: string }[];
  /** A new statement to open in a new tab instead of editing this one;
   * the edits are then ignored and may be empty. */
  tab?: string;
}

/** An OPTION of a refactor extension: a setting its refactors read as
 * ctx.options[key]. The user sets it in the Refactors settings (under the
 * refactor it names, or under the extension) and on the extension's page. */
interface RefactorOption {
  /** Its name: letters, digits and underscores, a letter first. */
  key: string;
  kind: 'choice' | 'number' | 'text';
  /** What the settings say ("Distance in metres"). */
  label: string;
  /** Its value until the user sets one; required (a refactor never asks).
   * A number for a number option, one of options for a choice. */
  default: string | number;
  /** A choice's constants. */
  options?: string[];
  /** One sentence on what it does, under its label. */
  description?: string;
  /** The id of the refactor it shapes; absent, it belongs to the extension. */
  refactor?: string;
}

/** A REFACTOR: a rewrite the SQL editor offers on a statement, beside its own
 * (the lightbulb, Ctrl+. or Cmd+.). Asked in the editors the extension is
 * attached to, on every caret move: answer quickly, from what you are given,
 * and nothing when the statement is not yours. A module with refactors
 * declares nothing else (no rules, views, inspectors or formats). Runs in a sandboxed Worker (no
 * DOM, no network), bounded by a timeout; a throw offers nothing and the Log
 * says why once. */
interface PlumeSQLRefactor {
  /** Its name within the extension: lowercase letters, digits and hyphens. */
  id: string;
  /** What the Refactors settings call it ("Rows near the first row"); its id when absent. */
  label?: string;
  /** One sentence on what it offers, under its label in the Refactors settings. */
  description?: string;
  /** A short piece of the SQL it writes ('limit 100'), shown under the description. */
  example?: string;
  refactor(statement: RefactorStatement, ctx: RefactorContext): RefactorOffer[] | RefactorOffer | null | undefined | Promise<RefactorOffer[] | RefactorOffer | null | undefined>;
}

/** A PlumeSQL grid extension's default export: an array of rules, or an object with
 * rules, views, inspectors, formats and / or refactors. The object's inputs belong to its rules: the host asks
 * for them once per result (a script's -- @inputs line answers them), a match
 * may name one (match: { input: 'column' }), and every formula reads the
 * answers as ctx.inputs. A view declares inputs of its own. Annotate the export
 * with a JSDoc @type PlumeSQLExtension to type the formula and render callbacks. */
type PlumeSQLExtension =
  | GridRule[]
  | { inputs?: ViewInput[]; rules?: GridRule[]; views?: PlumeSQLView[]; inspectors?: PlumeSQLInspector[]; formats?: PlumeSQLFormat[]; refactors?: PlumeSQLRefactor[]; options?: RefactorOption[] };
