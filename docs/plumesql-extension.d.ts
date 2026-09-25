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
  /** Write a line to PlumeSQL's Log, like console.log (which is also captured). */
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
  /** Markup as a STRING (not an element), rendered into the cell; escape any
   * data you put in it. A formula runs in a Worker with no DOM, and its result
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
   * 'character varying(255)'. A RegExp tests the full type text, for a prefix or
   * family match (/^numeric/, /timestamp/). */
  type?: string | RegExp;
  /** A 0-based position, or the first / last column. */
  index?: number | 'first' | 'last';
}

/** Where an added (computed) column goes. */
type ColumnPlacement = 'end' | 'start' | { before: ColumnMatch } | { after: ColumnMatch };

/** One grid rule: a FORMATTER (match + fn, shapes a column in place), a COMPUTED
 * column (add + fn, a new column), or a COMPANION (match + add + companion, a
 * computed column beside each match). */
interface GridRule {
  /** The columns to format (a formatter), or the source columns a companion
   * attaches to. Absent for a plain computed column. */
  match?: ColumnMatch;
  /** The header of the computed column; absent for a formatter. As a companion
   * header, "{col}" stands for the matched column's name. */
  add?: string;
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

/** A per-result INPUT a view asks the user for, so a chart need not GUESS which
 * column is which. The chosen value arrives as ctx.inputs[key]. */
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
   * "text": a free-text field.
   * Every value reaches render as a STRING in ctx.inputs[key]. */
  kind: 'column' | 'multi-column' | 'choice' | 'number' | 'text';
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

/** The data a view's render receives: a bounded window of the result. */
interface RenderData {
  columns: ViewColumn[];
  rows: unknown[][];
}

/** The context a view's render receives. */
interface RenderContext {
  /** The app theme; paint for both (a hard rule). */
  theme: 'dark' | 'light';
  /** The resolved values of the view's inputs, keyed by their key (a picked
   * column's name, a chosen constant, a typed number or text); {} when none.
   * Every value is a STRING. */
  inputs: Record<string, string>;
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
   * take a moment, so render meanwhile and update when it resolves. */
  rows(offset: number, limit: number): Promise<unknown[][]>;
}

/** A button PlumeSQL renders in the view's header (its label and an optional icon
 * name); clicking it runs this action with the view's live ctx, so it can copy,
 * select a row, or anything ctx offers. The run happens in the iframe like
 * render, so it may read the view's own state (a chart instance, the last draw). */
interface PlumeSQLViewAction {
  /** The button's label (also its tooltip). */
  label: string;
  /** An optional icon name (a short generic word); the label shows if absent. */
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

/** A PlumeSQL grid extension's default export: an array of rules, or an object with
 * rules and / or views. Annotate the export with a JSDoc @type PlumeSQLExtension to
 * type the formula and render callbacks. */
type PlumeSQLExtension = GridRule[] | { rules?: GridRule[]; views?: PlumeSQLView[] };
