# The Comment Annotation Format

**Specification, version 1.0 (draft)**

Status: working draft, maintained alongside its reference implementation
(PlumeSQL). The reference implementation keeps a machine-readable
registry of the annotations and the placeholders, and a test suite holds
it and this document in agreement, so a change to either without the
other fails its build.

---

## 1. Introduction

This document specifies a **comment annotation format**: the way a
plain SQL or command file declares, inside its own comments, how it is
to be presented, guarded and executed. Two things are specified, and
they are separable. The SYNTAX (sections 5 through 7) is a general
carrier for such declarations, tied to no particular purpose. The
VOCABULARY (sections 8 through 11) is the **action** vocabulary: it
packages a file into one executable question together with everything
a program needs to present, refresh, guard and act on its answer: a
description, a refresh policy, buttons on the result's rows, a
confirmation, an icon, a color. Other vocabularies over the same syntax exist
and are expected (14.1).

A file carrying the action vocabulary is an **action file**, and it
comes in two kinds (in PlumeSQL's own words such a file is an EXTENSION, a
query extension `name.plumesql.sql` or a command extension `name.plumesql.run`;
this specification keeps "action" for what the file
declares, the format being independent of any one host):

- a **query action**: SQL statements, asked of a PostgreSQL database,
  answered by a result set;
- a **command action**: one operating system command, executed directly
  (never through a shell), answered by the program's own output.

Everything the file declares about itself is written in
**annotations**. An annotation is a construct of its own: a line whose
first printable text is `@` followed by a keyword (`@description`,
`@refresh`), applying to the code directly below it. The comment is its
**carrier**: an annotation rides inside an ordinary comment of the
file's base format so that it cannot disturb the execution of the code
it describes, and the carrier's form follows that base format (SQL
comments in a query action, `#` lines in a command action). To anything
that is not an implementation of this specification, an action file is
therefore an ordinary SQL file or an ordinary text file: valid input
for every other tool that reads its base format.

The format is designed around three commitments:

1. **No escaping.** An annotation's value is the rest of its line,
   verbatim. Nothing is quoted, so nothing must be escaped, and the whole
   class of quoting mistakes cannot be made. The one structured value
   shape a few annotations accept (the two-parameter form, 6.4) is
   recognized by the value's WHOLE shape and never by escape
   characters, so the commitment holds there too.
2. **No injection, by construction.** Values that come from data (a
   clicked row, a connection's parameters) travel as bound parameters or
   as single argv elements. There is no code path in a conforming
   implementation where data is concatenated into SQL text or into a
   shell command line. The one further road, `@inline` (8.27), exists
   for the statements that cannot bind at all, and it is not
   concatenation either: the value is quoted by the database server's
   own quoting functions before it enters the text.
3. **Nothing in silence.** Anything an implementation cannot read is
   diagnosed with its location. An annotation with a typo that quietly
   does nothing is the worst outcome this format permits.

## 2. Conformance language

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD
NOT, RECOMMENDED, MAY and OPTIONAL in this document are to be interpreted
as described in RFC 2119 and RFC 8174 when, and only when, they appear in
all capitals.

An implementation conforms to this specification when it satisfies every
MUST-level requirement in sections 4 through 11. Section 12 (execution
environment) binds only implementations that execute actions, not those
that merely parse or edit them.

## 3. Terminology

- **Action**: the file as a whole, of either kind.
- **The action's own command**: the first command in the file; the one
  that runs when the action runs.
- **Button command**: in a query action, any command after the first,
  declared with `@button` or `@open`, run against one row of the result.
- **Header**: the run of comments that opens a command's text; the place
  annotations are read from.
- **Annotation**: a declaration of the form `@name value` that opens its
  line and applies to the code below it, carried inside a comment
  (section 6).
- **Scope**: which header an annotation belongs in: the action's own
  (`action` scope) or a button command's (`button` scope).
- **Kind**: which kind of file may carry an annotation: `query`,
  `command`, or both.
- **Row reference** (`$column`): inside a button command or a button's
  `@confirm` text, the clicked row's value of that column.
- **Placeholder** (`{name}`): a value the executing application holds
  before the action runs (connection parameters, the clock).
- **Diagnostic**: a reported problem, carrying the line it is on and the
  text it is about.

## 4. Encoding and file identification

- An action file is UTF-8 text. A leading byte order mark MUST be
  stripped before anything else reads the text, including before SQL is
  sent to a server.
- The file name extension identifies the kind: `.sql` is a query action,
  `.run` is a command action, compared case-insensitively. An unknown
  extension MUST be read as a query action.
- Line endings MAY be LF or CRLF; the grammar below treats `\r` as
  trailing whitespace.

## 5. Document structure

### 5.1 Query actions

A query action is a sequence of SQL statements. Statement boundaries are
top-level `;` characters: a `;` inside a string literal, a comment or a
dollar-quoted body is not a boundary, so an implementation MUST segment
statements with a lexer that understands those forms (single- and
double-quoted strings with doubled-quote escapes, `--` line comments,
nestable `/* */` block comments, `$tag$ ... $tag$` bodies).

- The **first** command is the action's own: everything up to and
  including the first top-level `;`, run whole. It MAY hold more than
  one statement where no top-level `;` separates them.
- **Every command after the first is a button command** and MUST carry
  `@button` or `@open` in its header. A later command without either
  MUST be diagnosed ("says less than it means") and MUST NOT run.

### 5.2 Command actions

A command action is a header of `#` comment lines followed by exactly
ONE command:

```
# @description Back up this database, custom format
# @env PGPASSWORD={password}
# @alert-on-success Wrote {db}-{timestamp}.dump
pg_dump --host={host} --port={port} --username={user} --no-password \
        --format=custom --dbname={db} --file={db}-{timestamp}.dump
```

- The comment marker is `#`. (This kind is not SQL.)
- A command line ending in a trailing `\` continues on the next line;
  the continuation lines are joined into one command.
- A second command in the file MUST be diagnosed, and the file MUST NOT
  half-run.

### 5.3 Headers

A command's header is **the comment run that opens its text**: starting
at the command's first non-whitespace character, consecutive comments
(with only whitespace between them) up to the first non-comment
character. A comment anywhere else (inside a command, after the last
one, in the middle of a statement) is ordinary prose and MUST NOT be
applied. This is what makes a `-- @description` quoted in the middle
of a query harmless. An implementation MAY diagnose annotation lines
found in a comment run AFTER the last command as a header with no
command under it (the reference implementation does, for both kinds:
a `@button` with nothing to run, a `@color` below the command that can
never apply), and
MUST still apply none of them.

Annotations therefore always stand ABOVE the code they configure: a
header's annotations apply to the command directly below them, and to
nothing else in the file.

## 6. Annotation syntax

Conceptually an annotation is the `@name value` text alone; the comment
around it is its **carrier** (section 1). In this version of the format the carrier is
REQUIRED: a line that opens with `@name` outside a comment is not an
annotation, it is the base format's own text. The carrier's form
follows the base format: `--` lines and `/* */` blocks in a query
action, `#` lines in a command action.

### 6.1 Grammar

Within a header, each comment LINE is examined independently. A line
declares an annotation if and only if, after the comment introducer and
leading trivia, its first printable text is `@` followed by a name:

```
annotation-line = introducer *trivia "@" name [ WSP value ]
introducer      = 1*"-" 1*"-" / 1*"#" / "/*" / ""   ; a run of the marker's
                                                ; characters is one introducer
                                                ; (---- or ##); "" on a block
                                                ; comment's continuation lines
trivia          = WSP / "*"                     ; any amount of whitespace, and
                                                ; a block comment's decorative
                                                ; stars
name            = ALPHA *( ALPHA / DIGIT / "_" / "-" )
value           = rest of the line, trimmed     ; may be empty
```

### 6.2 The line-opens rule

The `@name` MUST be the first printable text of its comment line, after
whitespace and (in block comments) decorative `*` characters. Anything
else in front of it (a bullet, a dash, a word) makes the whole line
prose: `- @description` in a comment *documents* the annotation instead
of *being* one. Both comment forms carry annotations: `--` lines and
`/* */` blocks alike, each LINE of a block read independently, including
the block's opening line (`/* @description ...` reads).

### 6.3 Case

Annotation names and their keyword values are case-insensitive:
`@DESC`, `@Refresh 5S` and `at END` all read. Column names in values
follow the SQL identifier convention of the reference implementation:
compared case-insensitively unless written double-quoted.

### 6.4 Values

An annotation's value is **the rest of its line, trimmed**. Nothing is
quoted and nothing is escaped: an apostrophe, a double quote and a `$`
are just text. A value therefore cannot span lines.

**The two-parameter form.** The annotations whose subsections say so
(`@confirm` and the `@alert-on-*` family, which put text in a dialog,
and the three declarations `@file`, `@dir` and `@var`, whose pair is a
prompt and a default, 8.7) additionally accept their whole value as two
quoted parameters, a TITLE and a text:

```
@confirm "Cancel it?", "Cancel the running query on backend $pid?"
```

The reading is decided by the value's WHOLE shape and by nothing else.
A value reads as two parameters if and only if it is, in order: an
opening `"`, a title holding no `"`, a closing `"`, a `,` (surrounding
whitespace allowed), an opening `"`, the text, and a closing `"` as the
value's LAST character. The title is what stands between its quotes;
the text is everything between its opening quote and that final one,
and MAY therefore itself contain `"`. There are no escape characters.
Any value that does not match the whole shape is ONE parameter,
verbatim, exactly as every other value reads, so no pre-existing file
changes meaning; an empty title (`""`) reads as no title, and the
dialog keeps its default name (the action's or the button's own).

### 6.5 Aliases

An annotation MAY have aliases (section 8's table); an alias reads
exactly as its canonical name. Documentation and completion SHOULD teach
the canonical name only.

## 7. Processing model and diagnostics

- **Unknown names.** An `@name` in a header that this specification does
  not define MUST be diagnosed, naming the known annotations. It MUST NOT
  be silently ignored: silent typos are the failure mode this format is
  designed against. (Outside a header the same text is prose; see 5.3.)
- **Wrong scope.** A known annotation in the other scope's header MUST
  be diagnosed, saying which header it wants (see section 9.1). It MUST
  NOT be silently applied to the header it sits in.
- **Wrong kind.** A known annotation in a file of the kind it does not
  belong to MUST be diagnosed, saying which kind carries it.
- **The friendly reading.** A diagnosed line degrades as locally as
  possible: an unreadable `@at` leaves the button at its default place
  rather than removing the button; a `@button` with no label is no button
  at all, because a button without words cannot be shown. Each
  annotation's subsection in section 8 states its own failure behavior.
- **One mistake, one diagnostic.** Repeating runs (a refresh timer) MUST
  NOT repeat an unchanged diagnostic; a diagnostic is repeated when what
  is wrong changes.
- **Repeats.** Where a subsection says "once per header", a repeat MUST
  be diagnosed and the FIRST occurrence kept. Action-scope annotations
  not so marked follow last-wins: the final readable occurrence applies.

## 8. The annotations

The registry, in one table. **Scope** and **Kind** are defined in
section 3; **Default when absent** is normative: an absent annotation
MUST behave exactly as described.

| Annotation | Alias | Syntax | Scope | Kind | Default when absent |
|---|---|---|---|---|---|
| `@description` | `@desc` | `@description <text>` | action | query, command | no description: the tab and the tree row show the file name alone |
| `@refresh` | | `@refresh <interval>` | action | query | no timer: the action runs when opened and on Run again |
| `@hide` | | `@hide <column> [, <column> ...]` | action | query | every column the query selects is shown |
| `@toolbar` | | `@toolbar [place] [icon] [label]` | action | query, command | no button in the title bar |
| `@color` | | `@color <name>` | action | query, command | no color: every mark of the action wears the ordinary chrome |
| `@face` | | `@face result\|source` | action | query, command | `source`: a click on the file's row opens the file, as for any file |
| `@connection` | | `@connection <id or name>` | action | query, command | the action runs on the connection the gesture came with, and the user may pick another |
| `@extension` | | `@extension <id>[:<tab>] [as <title>] [open\|only\|beside] [, ...]` | action | query | this file's results carry only what an implementation's result-shaping extensions scope to them on their own; where the line sits MAY narrow it to one query |
| `@inputs` | | `@inputs <key>=<value> [, <key>=<value> ...]` | action | query | a result view's inputs take the view's own defaults, and the implementation MAY ask for one that has none |
| `@ask` | | `@ask [<key> [, <key> ...]]` | action | query | the implementation asks for inputs only when a required one has no answer |
| `@noask` | | `@noask` | action | query | the implementation asks for inputs when a required one has no answer |
| `@for` | | `@for <object type> [, <object type> ...]` | action | query, command | the action belongs to no object: it is opened from the actions list alone, and the object placeholders (11.1) are undefined |
| `@env` | | `@env <key>=<value>` | action | command | the command inherits the application's own environment and nothing more |
| `@file` | | `@file <name> ["<prompt>", "<default>"]` | action, button | query, command | nothing is asked for: the command runs on what it already knows |
| `@dir` | | `@dir <name> ["<prompt>", "<default>"]` | action, button | query, command | no directory is asked for either |
| `@var` | | `@var <name>=<value> or @var <name> ["<prompt>", "<default>"]` | action, button | query, command | no names open beyond the registry's and the inputs' |
| `@open-on-success` | | `@open-on-success <path>` | action | command | nothing is opened when the command succeeds |
| `@open-on-failure` | | `@open-on-failure <path>` | action | command | nothing is opened when the command fails |
| `@open-on-done` | | `@open-on-done <path>` | action | command | nothing is opened on completion |
| `@alert-on-success` | | `@alert-on-success <text> or "<title>", "<text>"` | action | command | no dialog on success: the terminal is the answer |
| `@alert-on-failure` | | `@alert-on-failure <text> or "<title>", "<text>"` | action | command | no dialog on failure: the exit code and the output already say it |
| `@alert-on-done` | | `@alert-on-done <text> or "<title>", "<text>"` | action | command | no dialog on completion |
| `@format-keywords` | | `@format-keywords lower\|upper\|preserve` | action | query | the implementation's own formatter configuration applies unchanged |
| `@format-commas` | | `@format-commas trailing\|leading` | action | query | as above |
| `@format-indent` | | `@format-indent <spaces>` | action | query | as above |
| `@format-width` | | `@format-width <columns>` | action | query | as above |
| `@readonly` | | `@readonly` | action | query | the run guard follows the implementation's own configuration |
| `@confirm-writes` | | `@confirm-writes` | action | query | as above |
| `@parse` | | `@parse off\|markers\|outline\|both` | action | query | the implementation's own live validation configuration applies unchanged |
| `@button` | `@row-action`, `@action` | `@button <label>` | button | query | the command is not a button, which is why a second command without it is reported |
| `@open` | | `@open <label>` | button | query | the command ACTS (`@button`) rather than navigating |
| `@on` | | `@on <column>` | button | query | the button gets a column of its own, placed by `@at` |
| `@confirm` | | `@confirm <text> or "<title>", "<text>"` | action, button | query, command | no question: the action and its buttons run on the click |
| `@at` | | `@at start\|end\|before <column>\|after <column>` | button | query | `start` |
| `@inline` | | `@inline <name> literal\|identifier` | action, button | query | every value travels bound; a utility statement then refuses to run |
| `@pick` | | `@pick <name> <query>` | action, button | query, command | the field is typed: no list of values is offered |

### 8.1 `@description <text>`

One line about what the action shows. Presentation is the
implementation's (a tab subtitle, a tree row, a tooltip). An empty value
MUST be diagnosed.

### 8.2 `@refresh <interval>`

Re-run the action's own command on a timer. The value is a duration in
PostgreSQL's interval vocabulary: `3s`, `30 seconds`, `5min`, `1h`; a
bare number is seconds. A value that does not parse, or is under one
second (a refresh under a second is a loop on the database, not a
refresh), MUST be diagnosed and MUST leave the action timerless.

An implementation MUST NOT let the timer run while nobody can see the
result (an inactive tab, a hidden window): a refresh nobody reads is
pure load on the database. Timer interactions with `@confirm`
and with run logging are specified in 9.4.

### 8.3 `@hide <column> [, <column> ...]`

Keep the named result columns out of the presented grid while leaving
their values available to row references (`$column`, section 10) and to
`@on`. Names are comma-separated, and several `@hide` lines in one
header ADD UP (like `@for`, `@extension` and `@inputs`; other repeated
lines are last-wins, section 7). Implementations SHOULD diagnose a
hidden column no button reads (9.5).

### 8.4 `@toolbar [place] [icon] [label]`

Ask the application for a button of its own (in the reference
implementation: the title bar, or a side strip), one click from anywhere,
which DOES the action: a query action runs, a command action runs. The
value is written in the order the button is drawn: an icon, a label, or
an icon then a label. The icon is one of three forms: an `<svg ... </svg>`
run (the line's own drawing), `<logo/>` (the action's published logo,
when the presenting application knows one for it; in the reference
implementation the marketplace manifest's icon) or `<kind/>` (the
application's icon for the action's kind, query or command). Whatever
lies outside the icon is the label. **Every button has an icon**: a
line that wrote none gets the kind's icon, exactly as `<kind/>`, and a
`<logo/>` with no logo to draw falls to the kind's icon too, silently.
The label is optional: a line with none shows the icon alone and
carries the file name without its extension as the button's name (its
tooltip), so a bare `@toolbar` is a complete answer, an icon button
named after the file.

An optional PLACE word MAY stand first, one of `start`, `end`, `left`,
`left-top`, `left-below`, `left-bottom`, `right`, `right-top`,
`right-below`, `right-bottom`, `statusbar`, `editor`, `results` (and
`toolbar` for `start`, `status` for `statusbar`, `result` for `results`),
case-insensitive like every keyword. It names where the button stands:
`start` is the implementation's primary button row at its start (the
default), `end` the same row at its end, `left` and `right` a vertical
strip on that side at its top, above the strip's own tabs (`left-top` and
`right-top` say the same), `left-below` and `right-below` that strip
under its tabs, `left-bottom` and `right-bottom` that strip's foot,
`statusbar` the implementation's status line, `editor` the toolbar of the
editor the user is working in (the button then runs on that editor's
connection) and `results` the header of the result on screen. At
`results` an action that also carries `@for` (8.28) is offered for the
relations the result's statement reads whose type it names, the object
placeholders filled from the relation the user picks (one relation
needs no pick); an implementation that cannot tell the statement's
relations offers the button plain. An implementation without a place
MUST fall back to the nearest one it has (a strip's below or bottom to
its top, a strip to the row, a status line or an editor toolbar to the
row) rather than drop the button. A first word that is a place word is
the place and never part of the label; a label that must
begin with such a word is written after an icon. In a strip the button
is the icon alone and the label its tooltip, whatever the line wrote.

**The icon MUST be rebuilt, never passed through.** An action file
travels between people, and markup rendered as received would carry
scripts, event handlers, foreign content and styles. A conforming
implementation MUST reassemble the icon from a recognized-element
whitelist (`svg`, `g`, `path`, `circle`, `ellipse`, `rect`, `line`,
`polyline`, `polygon`) with drawing attributes only, dropping anything
else whole, contents and all. An icon that draws nothing after that MUST
be diagnosed, and the button falls back to the kind's icon. The
implementation sizes the icon; `currentColor` follows the surrounding
chrome's color. The `<logo/>` and `<kind/>` forms carry no markup of the
file's own and need no rebuild.

### 8.5 `@color <name>`

Give the action a color, worn by every mark that stands for the action
in the presenting application (in the reference implementation: the
row's mark in its pane, the title bar button, the tab). The value is
one of ten names, case-insensitive like every keyword value:

`blue`, `cyan`, `teal`, `green`, `olive`, `amber`, `orange`, `red`,
`pink`, `lavender`

The vocabulary is names and never raw color values, deliberately: an
action file is opened under themes its author never saw, and a raw
value could break a theme's contrast. What a name renders as
is the implementation's business: it SHOULD paint each name with a hue
of its own palette that a reader would call by that name, and it MUST
render the same name identically on every surface that wears it. An
empty value, and a name outside the vocabulary, MUST be diagnosed, and
the action keeps its ordinary presentation.

A color is presentation only. It MUST NOT change execution and MUST NOT
stand in for a confirmation: the annotation that guards a destructive
run is `@confirm` (8.21).

### 8.6 `@env <key>=<value>`

Set one environment variable for the command this file runs; one `@env`
line per variable. The value is everything after the first `=`, and MAY
hold placeholders. This is the ONLY place the `{password}` placeholder
may appear (section 11.3). A line without a `=` MUST be diagnosed.

### 8.7 `@file <name> ["<prompt>", "<default>"]`

Declare a FILE INPUT: a value the running user picks when the command
runs, before anything else happens. The first word of the value is the
input's name and MUST follow the placeholder name grammar (a letter,
then letters, digits or `_`, compared case-insensitively); the rest of
the line is the prompt the user is asked with, the name standing in
when there is none.

A declared name opens `{name}` as a placeholder valid in THIS HEADER's
command alone: in the command, in `@env` values, in the completion
hooks and in `@confirm`. It expands exactly as a registry placeholder
does (one argv element, a bound parameter in a query, plain text in
messages, 11.2), with its value filled in on the side that asked the
user. The three declaring annotations (`@file`, `@dir`, `@var`) belong
to both kinds and both scopes: above a query action's own command they
ask before it runs; above a BUTTON's command they ask on the click,
with the clicked row in hand (10); a command action has only its own
scope.

**One form.** Every asked input of ONE command is asked in ONE dialog,
in written order, in the shape of the implementation's row form: a
label per input (its prompt), a control fitted to the parameter's type
as the server describes it (the reference implementation asks the
server to describe the statement before the dialog opens; a type it
cannot learn is text), a Browse button beside a file or directory
field, one gesture to run and one to leave. Dismissing the dialog MUST
run nothing, exactly as a declined `@confirm` (8.21) runs nothing; a
field sends what it holds, an empty one the empty string, and NULL is
an explicit gesture of its own beside the field (a toggle), never
inferred from an empty box. When every asked input is a `@file` or
`@dir` with no default, an
implementation MAY open the pickers directly, in written order, in
place of the dialog (the same question in fewer gestures); a dismissed
picker then runs nothing, as the dialog would have.

**Required, or not, by the default.** The value MAY take the
two-parameter shape of 6.4, `"<prompt>", "<default>"`, on all three
declaring annotations: the default fills the field when the form opens
(a path for `@file` and `@dir`, a value for `@var`; expanded as a
message, 11.2) and the user may change it. A declaration that writes
NO default declares a value that MUST be given: the form MUST NOT run
while such a field is empty, and SHOULD say beside the field that it
holds the run. A written default, the empty one `""` included, makes
the empty answer valid. There is no marker for "required": a name
without a default is asked and has to be answered, a name with one may
be accepted as written. Requirements:

- The name MUST NOT be one the registry already defines (11.1): an
  `@file db` MUST be diagnosed, or the file's reading would depend on
  which build's registry is larger.
- The same name declared twice MUST be diagnosed and the repeat
  ignored; several `@file` lines with distinct names ask in written
  order.
- The implementation asks with a FILE picker over the files the action
  can reach (in the reference implementation: the workspace). A
  dismissed picker MUST run nothing, as above.
- The input's value is data, never code: it travels by the same rules
  as every other value (sections 11.2 and 12.1), and it can never
  become the secret (11.3 names the only channel).

### 8.8 `@dir <name> ["<prompt>", "<default>"]`

Declare a DIRECTORY INPUT: exactly as 8.7, except the picker offers
directories (the workspace root among them), so a command that writes a
tree can ask where it goes. Every rule of 8.7 applies unchanged, and
the declaring annotations (`@file`, `@dir` and `@var`, 8.9) share ONE
name space: a name may be declared once, by any of them.

The picker SHOULD also let the user name a directory that does not
exist yet. One that is named MUST NOT be created in silence: the
implementation asks first, creates it only on the user's own yes, and
a declined creation runs nothing, exactly as a dismissed picker.

### 8.9 `@var <name>=<value>` or `@var <name> ["<prompt>", "<default>"]`

Open one more placeholder name for this file, like `@file` and `@dir`
do, with the value coming from the file itself or from a typed answer.
The name follows 8.7's grammar and rules unchanged (never a registry
name, declared once, one name space with the other two), with one
addition: a query action's positional parameter MAY be declared by its
own spelling (`@var $1 "How many", "10"`), since it has no other name.
The character directly after it decides the form: `=` DECLARES the
value, whitespace or the end of the line ASKS for one. The reading is
decided by the value's shape alone (6.4).

**The declared form** (`@var <name>=<value>`) names a value the file
builds itself: the value is the rest of the line after the first `=`,
trimmed, and MAY hold registry placeholders and this file's asked
inputs. It exists for the value a file says more than once (the path in
the command, in `@confirm` and in an alert): written once, the dialogs
cannot drift from the command. A use of `{name}` reads exactly as if
the value's text stood in its place, expanded by the rules of wherever
it stands (11.2). Requirements:

- An empty value MUST be diagnosed: a name that expands to nothing is
  a mistake this format does not keep quiet about.
- The value MUST NOT reference another `@var` name, its own included:
  substitution is one step deep, so there is no declaration order to
  learn and no cycle to detect.
- `{password}` MUST be refused in the value, by parsers and again by an
  executing implementation: a name that hid the secret would carry it
  wherever the name goes, and the secret has one channel (11.3).
- A declared name that nothing in the file reads SHOULD be diagnosed,
  like a hidden column no button uses (9.5): it declares more than the
  file means.

**The asked form** (`@var <name> [<prompt>]`) is the third input:
exactly as 8.7, except the user TYPES the value instead of picking a
path (a schema name, a job count, a label). Every rule of 8.7 applies
unchanged: asked in the one form with the other inputs, a dismissed
form runs nothing, and the value is data, never code (11.2, 12.1). The
typed value is VISIBLE: it travels where the file's other values travel
(an argument list, a message), and an implementation SHOULD say so
where it asks; it can never become the secret, whose only channel is
11.3.

**A default.** The asked form's value MAY take the two-parameter shape
of 6.4, `"<prompt>", "<default>"`: the default fills the field when the
form opens and the user may change it. The default is a MESSAGE value
(11.2): registry placeholders expand in it as text, and in button scope
`$column` references fill in from the clicked row before the form
opens, so a button that changes a value opens with the row's value in
the field:

```
-- @var rate "New rental rate", "$rental_rate"
```

A one-parameter value is the prompt alone, the field opens empty and
the value is required (8.7).

### 8.10 `@open-on-success <path>`

When the command finishes with exit code 0, open the named file in the
application. The path MAY hold placeholders, and is resolved against the
workspace unless absolute. A file that is not there when this hook fires
SHOULD be reported: the command succeeded and still did not write what
its own file promised. Placeholder expansion for this value MUST happen
where the secret lives (the server side of a split implementation),
never in a client that must not hold secrets; the same holds for every
hook in both families.

### 8.11 `@open-on-failure <path>`

When the command finishes with a nonzero exit code, open the named file
in the application: the log or partial output a tool writes when it
fails, next to the output that shows why. The path reads exactly as in
8.10, and the two MAY stand together, each naming its own file.

### 8.12 `@open-on-done <path>`

When the command finishes, whatever the exit code, open the named file
IF IT EXISTS at that moment. A file that does not exist is silence by
design, not a diagnostic: after a failure the file may legitimately
never have been written. This is the outcome-blind member of its
family and MUST NOT be combined with 8.10 or 8.11 (see 9.6).

### 8.13 `@alert-on-success <text>`

When the command finishes with exit code 0, show the text in an alert
the user acknowledges (one affirmative button, nothing to decide).
Placeholders are filled in, so the text can name the file it wrote.
The alert does not replace the chronological record of the run (9.6).

All three alert annotations accept the two-parameter value form (6.4):
`"<title>", "<text>"` names the dialog's title as well, placeholders
filled into both parts; a one-parameter value is the message alone, and
the dialog is titled with the action's own name.

### 8.14 `@alert-on-failure <text>`

When the command finishes with a nonzero exit code, show the text in
the same kind of alert. The text is the FILE's own message ("The
restore failed, read restore.log"), not the error: the verbatim output
and the exit code stay where the implementation reports failures, and
this alert supplements them. MAY stand together with 8.13, each outcome
with its own text.

### 8.15 `@alert-on-done <text>`

When the command finishes, whatever the exit code, show the text in the
same kind of alert: for a message that does not depend on the outcome.
This is the outcome-blind member of its family and MUST NOT be combined
with 8.13 or 8.14 (see 9.6).

### 8.16 The `@format-*` family

This file's own formatter options, one annotation per option so that
each line is one declaration, like everything else in the format:

- `@format-keywords lower|upper|preserve`: what a formatter does to
  SQL keywords.
- `@format-commas trailing|leading`: where the comma goes when a list
  breaks over lines.
- `@format-indent <spaces>`: spaces per nesting level, a positive
  integer.
- `@format-width <columns>`: the line width the formatter aims for,
  an integer of at least 20.

An option the file does not set MUST fall back to the implementation's
own formatter configuration; the family overrides only what it names,
so a file keeps its own style wherever it is opened. A value outside the
vocabulary MUST NOT apply and SHOULD be diagnosed. Implementations
without a formatter MUST accept and ignore the family.

### 8.17 `@readonly` and `@confirm-writes`

The file's own word on what its runs may do. Both take no value:

- `@readonly`: runs from this file MUST NOT change structure or data.
  Where the executing session offers a server-enforced read-only mode
  (PostgreSQL's `default_transaction_read_only`), implementations MUST
  enforce it there, so the refusal is the server's own statement error
  and covers what static classification cannot see (a function body
  that writes). Where the mode permits it, an already-open transaction
  MUST be hardened too (PostgreSQL allows read-write to read-only at
  any point; the reverse only before the first query, so REMOVING the
  annotation frees an open transaction only when it ends).
  Implementations without such a mode MUST refuse the run client side
  instead.
- `@confirm-writes`: every run from this file that changes structure
  or data MUST ask first, one confirmation per run, by the
  implementation's own classification.

A file may only TIGHTEN what its connection allows, never loosen it: a
read-only connection stays read only whatever the file says, a
stricter guard configuration wins over `@confirm-writes`, so no file
can switch anyone's safety off. Both
present, `@readonly` wins. Implementations that execute nothing MUST
accept and ignore both.

### 8.18 `@button <label>`

Declare the command below as a BUTTON on every row of the action's
result, under this label. The command runs with the clicked row's values
bound for its `$column` references, and the implementation reports what
the server said. With `@on`, the label names the ACT rather than
labelling a visible button: the confirmation's title, the record's
words, the cell's tooltip. An empty label MUST be diagnosed and the
command MUST NOT become a button.

### 8.19 `@open <label>`

Declare the command below as a NAVIGATION on every row: clicking it runs
the command with that row's values, and its answer replaces the grid,
one step deeper in the same view, with a way back. The label names what
it opens: the button's text, the step's name in the trail. Everything
else reads as `@button`: `@on`, `@at` and `@confirm` mean here what
they mean there. An empty label MUST be diagnosed.

A navigation and an act MUST be told apart visibly (the reference
implementation draws a chevron on navigations): one click ends a
stranger's transaction and the other only looks, so the two MUST NOT
look alike.

### 8.20 `@on <column>`

Put this button ON an existing result column instead of a column of its
own: that column's cells become the button and keep their values, so the
value is read and clicked in one place. The value MUST be exactly one
column name. Dependencies and conflicts: section 9.3.

Cell semantics: only the value is the click target; a NULL cell is not
a button (there is no value to act on); the cell remains selectable and
copyable like any other.

### 8.21 `@confirm <text>`

Ask the text as a question before running, wherever the annotation
stands:

- **Button scope**: before the button's command runs. `$column`
  references in the text stay LITERAL in the file and are filled in from
  the clicked row when the question is asked: this value is a message,
  not code. At most once per button header (a repeat is diagnosed).
- **Action scope** (either kind): before the action's own command runs,
  on every user gesture, including the gesture that opens an
  auto-running view. A `@refresh` timer MUST NOT re-ask: the gesture
  that started the timer already answered (9.4).

The two-parameter value form (6.4) applies in both scopes:
`"<title>", "<text>"` names the dialog's title as well, and in button
scope `$column` references fill into the title exactly as into the
question. A one-parameter value is the question alone, and the dialog
is titled with the action's or the button's own name. Placeholders fill
into the question and its title as text (11.2), from the values the
asking side holds, so the question can name the file it is about to
write; the secret is never among them (11.3).

Declining the question MUST leave everything exactly as it was: nothing
runs, nothing changes face.

### 8.22 `@at start|end|before <column>|after <column>`

Where the button's own column sits in the grid. `start` (the default)
and `end` are the grid's edges and stay pinned while the grid scrolls
sideways; `before <column>` and `after <column>` name a result column
and travel with it. Buttons that ask for the same place share one
column. Exact value grammar: one keyword, where `before` and `after`
take exactly one column name and `start`/`end` take nothing; anything
else MUST be diagnosed and the button keeps its default place.
Dependencies and conflicts: section 9.3.

### 8.23 `@parse off|markers|outline|both`

The file's own word on how an implementation's live validation (a
parse of every statement that never executes, where the implementation
offers one) reports its findings for THIS file: `off` reports nothing,
`markers` marks the text alone, `outline` marks the file's structural
view alone, `both` does both. Unset MUST fall back to the
implementation's own configuration; the annotation overrides only this
file, so the choice follows the file. A
value outside the vocabulary MUST NOT apply and SHOULD be diagnosed.
Implementations without live validation MUST accept and ignore it.

### 8.24 `@face result|source`

What a click on the file's row opens in a presenting application that
lists action files among other files: `source`, the file itself,
exactly what a click on any other file opens, and the default; or
`result`, the action's answer (its view, for a command action the
program's run), for an action that is a dashboard and whose file nobody
needs to see. Only the "take me there" gestures read the annotation (a
row click, and whatever an implementation treats as the same gesture);
a door that says what it does (View, Run, a title bar button) does that
regardless. For a command action `result` means the click RUNS a
program, which the file asks for in so many words; a file that does so
SHOULD carry a `@confirm` (8.21). A value outside the vocabulary MUST
be diagnosed and reads as `source`. Implementations that list no files
MUST accept and ignore it.

### 8.25 `@connection <id or name>`

The connection the action runs on, from every door, whatever
connection the gesture came with: a dashboard for one server, a backup
for one database. The value is resolved at the moment the action runs
and never stored in the connection's place, in two steps: a
connection's permanent IDENTIFIER exactly, else a connection's display
NAME compared case-insensitively against the names the implementation
knows. A file usually names a connection the way a person does, by
name; the identifier is for the case names cannot settle.

A name is not an identity and several connections MAY carry one. When
they do, the implementation MUST run the action on the FIRST of them
in an order it documents (the reference implementation: its
connections tree's order, Vault before Shared before Discovered, then
the tree's own listing) and MUST record, where the action's messages
go, that the name was ambiguous and which connection was taken,
offering the identifier as the way to say which for good (the
reference implementation's Log line carries "Use the ID", which
rewrites the line). An implementation SHOULD warn where a connection
is named that another already carries the name, and MUST give the
identifier a place to be read and copied (the reference
implementation: the connection editor's ID field and the tree row's
Copy Connection ID). No match at all MUST be diagnosed when the action
runs, and the action MUST NOT run.

While the annotation is present the implementation MUST NOT offer to
run the action elsewhere (no picker on its readout); the file decides.
An empty value MUST be diagnosed. The word `connection` is also an
annotation in NpgsqlRest's vocabulary (14.1) with a meaning of its own;
the two vocabularies are read in different contexts and do not meet in
one file.

The annotation is also part of the plain-file profile (14.1): a SQL
file that is not an action MAY name the connection its tab runs on,
with the same value and the same resolution. An implementation that
lets a plain file's tab pick a connection MUST make the tab follow the
line while it stands (the line's connection is assigned; a session the
user opened elsewhere is moved only on the user's own run, never by
an edit, a restore or a change on disk) and MUST NOT offer another
connection while the line stands: the way to pick again is to remove
the line. A value that resolves to nothing MUST refuse the run with
the reason.

### 8.26 `@pick <name> <query>`

Offer the values an asked `@var` (8.9) may take: the query's rows are
the choices, shown in the implementation's row picker (the reference
implementation: the rows open as a result document in pick mode, the
row editor's own foreign key picker, the form folded away meanwhile
and brought back with the value and everything typed so far). The first
word of the value is the NAME of an asked `@var` declared in the SAME
header, above or below this line (a header is read whole, 7); the rest
of the line is the query, ONE statement read to the end of the line,
a trailing semicolon ignored. The query is written as it would be run
(6.4: nothing is quoted or escaped).

**The value, and the rest.** The value a chosen row puts in the field
is the column NAMED LIKE THE INPUT (`select rolname as role, ...` for
`@var role`), compared case-insensitively; with no such column, the
FIRST column. Every other column is what the picker shows beside the
value (the reference implementation: the grid, every column of the
rows), so a picker may carry what helps the choice: a count, a size, a
description. The picker MUST let the rows be searched or filtered.

**Help, not a rule.** The field stays typeable, and a typed value is
accepted exactly as one chosen from the picker: the value is data, it
travels by the same rules as every other (11.2, 12.1) and the server
judges it. Leaving the PICKER without a choice MUST bring the form
back with the field as it was; dismissing the FORM runs nothing, as
ever (8.7).

**When the query runs.** On the connection the action runs on, when
the picker is opened from a form, and never before: opening the form
MUST NOT run it, and a form that is dismissed has run nothing. An
implementation MAY page or cap the rows it shows and MUST then say so
(the reference implementation pages, as for every result). A failing
query is reported where the action's failures are, and the field stays
typeable.

**What the query may read.** The query is bound exactly as the
header's own command is (11.2): registry placeholders as bound
parameters, and above a button the clicked row's `$column` references
(10), so a list may narrow itself to the row (`where store_id =
$store_id`). It MUST NOT read the header's own inputs or declared `@var`
values: the list opens before the form is answered, so there is
nothing to fill them with; such a reference MUST be diagnosed and the
pick dropped, the field then plain. The values bound are read at the
moment the picker opens and travel bound, never pasted into the
statement (12.1). `{password}` is refused as in every
statement (11.3); a hand-written `$1` is diagnosed as in a button (10).

Requirements:

- The name MUST be an asked `@var` of the same header. A name nothing
  asks for, a `@file` or `@dir` (which have their own picker) or a
  declared `@var <name>=<value>` MUST be diagnosed and the line ignored.
- One list per input: a second `@pick` for the same name MUST be
  diagnosed and ignored.
- A `@pick` with no query MUST be diagnosed and ignored.
- A command action (3) MAY carry `@pick` in its one scope; the query
  runs on the connection whose values the command spends, and the
  chosen value travels as the command's other inputs do (12.1).

### 8.27 `@inline <name> literal|identifier`

Expand the named value INTO the statement's text instead of binding it
beside the statement. This exists for exactly one reason: PostgreSQL
accepts no bound parameters in utility statements (`ALTER SYSTEM`,
`VACUUM`, `REINDEX`, `GRANT` and their kin), so an action that runs one
with a value from a row or a form has no bound road to travel. The name
is a `$column` (10) or `{placeholder}` (11) the command under this
header references; `literal` expands it as a quoted VALUE, `identifier`
as a quoted NAME. Everything not named by an `@inline` stays bound, and
binding remains the default and the preferred road: a conforming file
inlines only what the statement cannot take as a parameter.

**Quoting is the server's, not the implementation's.** An implementation
MUST NOT quote inlined values itself: it MUST obtain the quoted form
from the database server the statement will run on (PostgreSQL's
`quote_literal`/`quote_nullable` for `literal`, `quote_ident` for
`identifier`, or a mechanism with identical semantics), on the same
connection, before the statement runs. This is what keeps commitment 2:
the quoting is the server's own, done by the parser that reads the
statement. A NULL
value inlines as the keyword `NULL` under `literal`; under `identifier`
a NULL names nothing and the run MUST be refused with a message that
says so.

Requirements:

- The value is two words: a name, then `literal` or `identifier`. Any
  other shape MUST be diagnosed and the line ignored (the ref then stays
  bound, the safe default: the statement fails loudly at the server
  rather than running differently than written).
- The name MUST be one the command under this header actually binds; an
  `@inline` naming nothing there MUST be diagnosed and ignored.
- One name has one kind: the same name inlined again with the OTHER kind
  MUST be diagnosed, and the first reading holds.
- `{password}` never enters SQL (11.3); `@inline` creates no exception,
  and the refusal is the same one.
- The statement's remaining references keep their bound semantics
  unchanged (10, 11.2), and a `$n` inside the author's own string
  literals, quoted identifiers, dollar quotes or comments is text and
  MUST NOT be rewritten.

### 8.28 `@for <object type> [, <object type> ...]`

Attaches the action to every object of the named types: an
implementation that shows database objects (a tree, a header) MUST
offer the action wherever an object of such a type is shown, in the
same words on every such surface, and MUST open it ON that object.
Opened so, the four object placeholders (11.1) are defined: `{schema}`
is the object's schema (empty for a cluster object: an extension, a
role), `{name}` its exact catalog name (a routine's bare name, without
the argument list), `{object}` its qualified name quoted as SQL needs
it (a routine with its argument list, so `{object}::regprocedure`
resolves), and `{type}` its type word. They bind and expand like every
other registry placeholder (11.2): in a query action as parameters, in
a command action as argv text.

The same word attaches the action to the OTHER things an implementation
shows in a menu, each a family with its own reading of the four
placeholders (the implementation's words for where: the reference
implementation offers the action as "Run <name>" in the thing's
right-click menu, a handful directly and more under one Extensions
submenu):

| word | offered on | `{schema}` | `{name}` | `{object}` | `{type}` |
|---|---|---|---|---|---|
| `connection` | every connection the application lists; the action runs ON that connection, whose connection placeholders (11.1) are then its | empty | the connection's display name | the same | `connection` |
| `file` | every file the application lists (a workspace file, a script) | empty | the file's name | its absolute path | `file` |
| `directory` | every folder the application lists | empty | the folder's name | its absolute path | `directory` |
| `column` | every column of a result the application can trace to ONE relation (the case that makes a result editable); `{column}` is the column's name | the relation's schema | the relation's name | the relation, qualified and quoted | `column` |
| `statement` | every statement of a script the application shows apart (an editor's statement, an outline's row); `{statement}` is the statement's text | empty | the statement's first words | the statement's text | `statement` |
| `my extension` | every extension of the user's own (the application's My Extensions) | empty | the extension's id | the same id | `my extension` |

`{column}` and `{statement}` belong to their family alone: an action
that spends one without its word in `@for` MUST be diagnosed (9.10).
An implementation that shows none of these things attaches the word to
nothing.

The value is one or more type words, comma separated, case
insensitive: the dictionary's own words (`table`, `view`, `materialized
view`, `foreign table`, `function`, `procedure`, `aggregate`, `sequence`,
`schema`, `index`, `trigger`, `constraint`, `policy`, `rule`, `type`,
`enum`, `range`, `domain`, `extension`, `role`, `publication`, `server`,
`foreign data wrapper`, `statistics`, `event trigger`), two group
words, `relation` (every kind of relation) and `routine` (function,
procedure, aggregate), the six words of the table above for what the
application shows that is no database object (`connection`, `file`,
`directory`, `column`, `statement`, `my extension`), and four words
naming what an extension manages:
TimescaleDB's `hypertable` (a `table` it manages) and `continuous
aggregate` (a `view` it manages: the query over the materialization
hypertable the extension keeps for it), and Citus's `distributed table`
(a `table` it distributes, by a column into shards or as a single shard,
a table in a distributed schema included) and `reference table` (a
`table` it replicates to every node). The extension words are subsets
of their dictionary type, never types of their own: `@for table` MUST
reach a hypertable and a distributed table as it reaches every table,
`@for hypertable` reaches hypertables alone, and `{type}` stays the
dictionary type word (`table`, `view`). A table an extension merely
lists (Citus's local tables in its metadata) answers to `table` alone.
An implementation that does not read an extension attaches its words to
nothing. A word outside this list MUST be diagnosed and dropped; an
`@for` that keeps no word attaches to nothing. Several `@for` lines add
up.

An action MAY still be opened from the actions list without an object;
then the object placeholders are undefined, and an implementation MUST
NOT invent values for them (the query fails on the server's own terms,
as an unknown reference would). An action that uses an object
placeholder and writes no `@for` MUST be diagnosed (9.10): the value
could never be supplied.

### 8.29 `@extension <id>[:<tab>] [as <title>] [open|only|beside] [, ...]`

Names a result-shaping extension the implementation is to apply to
every result this file produces, whatever scope that extension declares
for itself. The value is the extension's IDENTIFIER, the one name the
implementation knows each of its extensions by (unique among them, so a
reference never needs a path to disambiguate it). Several extensions
are several `@extension` lines, or one comma-separated line, and they
ADD UP (like `@hide` and `@for`); each ADDS to whatever the extension
scopes to on its own, and a reference that resolves to no known
extension SHOULD be reported against the name rather than silently
dropped, but MUST NOT make the file invalid: unlike an unknown
annotation name (section 7) the reference points outside the file, at
something that may be installed later. Query kind only: a command action answers in a
terminal, with no result for an extension to shape. Where an
implementation lets an extension declare, from its own side, the files
it applies to, `@extension` is the same attachment from the consuming
file's side: the file opts IN, so an extension shared between files need
not name each of them. An implementation that has no such extensions
reads the line and applies nothing.

An item MAY carry `as <title>`: the title the implementation gives the
extension's result view for the scope the line has (its tab, where views
are tabs). `:<tab>` before it names one view of an extension that
declares several (the first otherwise); without it every view of the
extension takes the title. The title runs to the end of the item, short
of an opening word below; one holding a comma, or ending in such a word,
is written in double quotes. A line in one query's own header (5.3)
titles that query's views, one in the file's header every result's,
and the query's own header wins over the file's for the same view. An implementation whose
extensions have no views reads `as` and applies nothing.

An item MAY end in ONE word saying how the result OPENS on the
extension's view, where the implementation presents views (as tabs
beside the rows, in the reference implementation): `open` presents the
view first, the rows a gesture away; `only` presents the view first and
hides the rows' own presentation for that result (messages and
problems, if the implementation shows them, stay); `beside` presents
the view BESIDE the rows where the implementation can show two faces at
once (the rows and the view side by side) and as `open` where it cannot.
Without a word the rows show first and the view waits beside them.
`only` and `beside` on one item MUST be diagnosed, since one hides what
the other stands beside. The header the line sits in (5.3) sets the
reach of the word as of the item: a query's own header, that query's
result; the file's header, every result the file produces; a later item
with a word wins over an earlier one for the same scope. A view whose inputs are all answered
(by `@inputs`, 8.30, by the view's own defaults, or by an answer the
implementation kept from before) MUST be presented without asking,
unless `@ask` (8.31) stands; one with an unanswered required input MAY
be asked for it first, unless `@noask` (8.32) stands. The words are
read off the end of the item before `as`, so a title that must end in
one of them is written in double quotes.

### 8.30 `@inputs <key>=<value> [, <key>=<value> ...]`

Answers the INPUTS of this query in the file: a result view's (so a
view opened on this result, by an `@extension` item's opening word,
8.29, or by a gesture, draws
from them with no prompt) and the query's own PARAMETERS (so the run
binds them with no prompt). Each pair names an input by its key, as the
view declares it, or a parameter by its name (`$1` as `1` or `$1`;
`$name`, `{name}` and `:name` as `name` or `$name`), and gives its
value as text; a pair runs to the next `<key>=` that
starts the line or follows a comma outside quotes, so a value that is
itself a comma-separated list needs no quoting, and a value holding a
comma before an `=`, or an `=`, is written in double quotes. Several
lines ADD UP, a later line overriding a key it repeats. The values are
the view's DEFAULTS for that result: an answer the user gives the view
directly MUST still win, and a reset of the view's inputs MUST restore
these, not the view's own defaults. The header the line sits in sets
its reach as for `@extension` (8.29). A key no view opened on the result declares and no
parameter of the query carries is ignored. Query kind only.

### 8.31 `@ask [<key> [, <key> ...]]`

Asks for this query's inputs EVERY time, before the run binds its
parameters and before a result view draws: the implementation MUST
present its input form even when every input has an answer, with the
answers it has (`@inputs`, 8.30, the inputs' own defaults, an answer
kept from before) filled in, so the user confirms or changes them each
time. With keys, only the inputs named are asked; the rest take their
`@inputs` values or defaults, and an input named by no view and no
parameter is ignored (an implementation SHOULD report it as a problem).
The header the line sits in sets its reach as for `@inputs`; a query's
own header wins over the file's. `@ask` and `@noask` (8.32) in one scope
contradict each other: an implementation MUST report it as an error and
MAY follow `@noask`. Query kind only.

### 8.32 `@noask`

Never asks for this query's inputs: the run binds its parameters and a
result view draws from the `@inputs` values (8.30) and the inputs' own
defaults, with no form, even when a required input has no answer. A
result view is presented with the input unanswered, as 8.29 already
allows (a view handles that itself). A query PARAMETER without a value
MUST NOT be bound silently: the implementation refuses the run and
reports which parameter has no value, so a dashboard on `@refresh` or
an unattended script never stops at a form and never runs with a NULL
the author did not write. The header the line sits in sets its reach as
for `@inputs`; a query's own header wins over the file's. Excludes `@ask`
in the same scope (8.31). Query kind only.

## 9. Dependencies between annotations

Several annotations exist only in relation to another, and several
exclude each other. An implementation MUST enforce every relation
below, with the stated diagnostics and outcomes.

### 9.1 The scope and kind matrix

Each annotation belongs to these headers and kinds and nowhere else
(the annotations added after this matrix, `@for`, `@extension`,
`@inputs`, `@ask`, `@noask`, the `@format-*` family, `@readonly`,
`@confirm-writes` and `@parse`, state their scope in their own
sections):

- `@description`, `@toolbar`, `@color`, `@face`, `@connection`,
  `@confirm`: both kinds, action scope (`@confirm` is also legal in the
  button scope; it means the same thing in either, "ask this first").
- `@refresh`, `@hide`: query kind, action scope only.
- `@env` and the completion hooks (the `@open-on-*` and `@alert-on-*`
  families, six annotations): command kind, action scope only (a
  command action has only that scope).
- The declarations (`@file`, `@dir`, `@var`): both kinds, both scopes
  (8.7); a command action has only the action scope.
- `@pick`: both kinds, both scopes (8.26), and only beside an asked
  `@var` of the same header (9.7).
- `@inline`: query kind, both scopes (8.27), and only naming a value the
  same header's command binds (9.9).
- `@button`, `@open`, `@on`, `@at`: query kind, button scope only.

A violation is diagnosed by axis: wrong scope says which header the
annotation wants ("belongs above a BUTTON's own command" / "belongs
above the ACTION's"); wrong kind says which kind carries it. The
annotation is then dropped from the header it sat in; it never leaks
into the other.

### 9.2 A button header requires exactly one of `@button` or `@open`

- Every command after the first MUST carry `@button` or `@open`; one
  without either is diagnosed and does not run (5.1).
- One command is one button: a SECOND `@button` (or second `@open`) in
  the same header MUST be diagnosed ("one is enough") and ignored.
- One command either acts or navigates: `@button` AND `@open` on the
  same header MUST be diagnosed ("it takes @button or @open, not both")
  and the second-read header line ignored.
- `@on`, `@at` and button-scope `@confirm` have meaning ONLY inside a
  header opened by `@button`/`@open`. Standing in the action's own
  header they are a scope violation (9.1). Standing in a later command's
  header that has no `@button`/`@open` at all, the header itself is
  invalid (this section) and the command does not run.

### 9.3 `@on` and `@at` exclude each other

- `@on` names the button's place by identity: the column IS the button.
  A button with `@on` therefore has no own column, and an `@at` on the
  same header says nothing: writing both MUST be diagnosed and the
  column named by `@on` wins.
- A button sits on ONE column: a second `@on` in the same header MUST
  be diagnosed and ignored.
- A column carries ONE button: two buttons declaring `@on` for the same
  column MUST be diagnosed and the second button dropped (one click
  cannot run two commands).
- `@on` naming a column the action does not PRESENT (never selected, or
  removed by `@hide`) has nowhere to be clicked: the button MUST fall
  back to a column of its own (placed by its `@at`, or the default) and
  the fallback MUST be diagnosed once.

### 9.4 `@refresh` interacts with `@confirm` and with run records

- An action-scope `@confirm` guards GESTURES. The `@refresh` timer's
  runs MUST NOT re-ask the question: the gesture that brought the
  answer on screen (and started the timer) already answered it. A timer
  that pops a modal every interval would make the two annotations
  mutually unusable. The same holds for the asked inputs (8.7): the
  timer's runs reuse the answers the gesture gave, and a timer with no
  answers yet waits for a gesture.
- The timer's runs SHOULD be left out of the chronological record
  (9.6): a timer's runs are routine. Gesture runs are always recorded.
- `@refresh` re-asks the step ON SCREEN (after a navigation, that step),
  not the action's root: a timer refreshes what is being read, never
  returns to the root.

### 9.5 `@hide` exists for references

`@hide` interacts with `$column` and `@on`; it has no meaning alone:

- A hidden column's value remains available to `$column` references and
  to `@confirm` text. That is what `@hide` is FOR: a value a button
  needs but nobody wants to read.
- A hidden column cannot host `@on` (9.3: not presented).
- A hidden column that no button command and no confirm text reads
  SHOULD be diagnosed: a column nothing uses is a column the query
  should not select.

### 9.6 The completion hooks, and the record

The completion hooks form two families of three, `@open-on-*` and
`@alert-on-*`, each with a `-on-success`, `-on-failure` and `-on-done`
member:

- Within a family, `-on-success` and `-on-failure` are complementary
  and MAY stand together, each naming its own outcome. `-on-done`
  covers every outcome the other two already name, so combining it with
  EITHER of them in the same family MUST be diagnosed: the specific
  annotations win and the `-on-done` line is ignored, whichever order
  the file wrote them in. The two families are independent of each
  other: an `@alert-on-done` says nothing about which `@open-on-*`
  lines may stand beside it.
- On any given exit, at most one member of each family fires: the one
  naming the outcome, or the family's `-on-done`.
- Action-scope `@confirm` and the completion hooks are independent: a
  hook does not imply a confirmation, and a confirmed command that
  fails still fires only the hooks that name failure or completion.
- The alert hooks supplement, and MUST NOT replace, the
  implementation's chronological record of what ran: an alert is
  transient, the record is not. The failure alert's text is
  the file's own message, never a substitute for the implementation's
  verbatim reporting of the failure itself.

### 9.7 Declarations open placeholders

An `@file`, `@dir` or `@var` line changes what other lines may say: the
name it declares is a placeholder everywhere in ITS OWN HEADER's
command and annotations (the command, `@env` values, `@var` values per
8.9's one-step rule, the completion hooks, `@confirm`), and nowhere
else: a button's declarations are the button's, the action's the
action's, each header read apart (7), so a name may be declared in
both. The dependency runs the whole header's length, not downward
only: a name declared below an
`@env` line (or below the `@var` value that uses it) still legitimizes
that use, because a header is read whole before anything is judged (7).
A `{name}` no registry entry and no declaring line accounts for stays
an unknown placeholder and is diagnosed as one. The three annotations
share one name space (8.8, 8.9); the ASKING lines (`@file`, `@dir`,
bare `@var`) ask in written order whichever annotation declared them,
a declared `@var` value asks for nothing, and every question precedes
`@confirm`, so a confirmation MAY name the very value that was given.
A `@pick` (8.26) depends on such a declaration the other way round: it
names an asked `@var` of its own header, wherever that line stands,
and is diagnosed and dropped when no such `@var` is asked for; its
query reads the row and the registry, never the header's own names.

### 9.8 Buttons and the columns they name

- A `$column` reference or an `@on` names a column of THIS action's
  result. In a file with no `@open`, a button whose named columns the
  action's own command cannot supply can never run, and MUST be
  diagnosed before the button is used (a parser does not know the
  result's columns; the reference implementation says it after the
  first run, when they are known). An `@on` naming a column the same
  header's `@hide` hides is knowable from the file alone and MUST be
  diagnosed at parse time.
- Once a file navigates (`@open` present anywhere), a button belongs
  wherever its named columns exist: it appears on the answers that have
  them and is absent elsewhere. The same absence is then the file
  working as intended, and MUST NOT be diagnosed.
- A button that names no column does not depend on the row and applies
  to every answer.

### 9.9 `@inline` names what its own command binds

An `@inline` exists only in relation to a reference of the command under
the SAME header: a `$column` or `{placeholder}` that command holds. One
naming nothing there is diagnosed and ignored (8.27); the command's
other references are untouched. The kind vocabulary is closed (`literal`,
`identifier`), and a violation is diagnosed with both words offered.

### 9.10 `@for` opens the object placeholders

The four object placeholders (11.1) have a value only in an action an
object opened, and only an `@for` action is opened on an object. A
`{schema}`, `{name}`, `{object}` or `{type}` in a file that writes no
`@for` MUST therefore be diagnosed, wherever it stands (the command, an
`@env` value, a hook, a `@confirm`): the file asks for a value nothing
can supply. A declared input of the same name (9.7) takes the name for
its own header as always, and is not this case. The dependency runs the
whole file's length: an `@for` line below the use legitimizes it.

## 10. Row references: `$column`

Inside a button command's SQL, `$column` is the clicked row's value of
that column. Two forms that look alike are not the same thing: an
annotation's ARGUMENT (`@on pid`) names a column, and needs no mark; a
`$name` inside free text marks the one word that is not prose. (`@on
$pid` is unmistakable, so the `$` is accepted and dropped; it is not the
form to teach.)

Normative requirements:

- A reference MUST be rewritten to a driver-level parameter (`$1..$n`
  for PostgreSQL) and the value MUST travel bound beside the statement.
  It MUST NOT be interpolated into the SQL text. The same column
  referenced twice
  reuses one parameter.
- References are read where CODE is: a `$` inside a string literal, a
  comment or a dollar-quoted body is left alone (PostgreSQL's own
  `$do$ ... $do$` is made of dollars and identifiers).
- A hand-written positional parameter (`$1`) MUST be diagnosed: the only
  values a button sends are the ones its references name.
- A reference naming a column the answer does not carry MUST be
  diagnosed when the button is used, with the name it got wrong.
- In `@confirm` text the reference stays literal in the file and is
  filled in when the question is asked: that value is a message, not
  code (8.21).

## 11. Placeholders: `{name}`

A placeholder is a value the application holds before the action runs.
They work in BOTH kinds, in commands and in the annotation values whose
subsections say so.

### 11.1 The registry

| From the connection | |
|---|---|
| `{host}` `{port}` `{db}` `{user}` | what it dials with |
| `{sslmode}` | its sslmode, empty when it has none |
| `{conn}` | its display name |
| `{server}` | the server's major version number |
| `{password}` | its password; section 11.3 |

| From the clock | |
|---|---|
| `{year}` `{month}` `{day}` | 4 digits, then 2 and 2 |
| `{hour}` `{minute}` `{second}` | 2 digits each, 24-hour clock |
| `{date}` `{time}` `{timestamp}` | `2026-08-07`, `14-05-09`, `2026-08-07_14-05-09` |

| From the application | |
|---|---|
| `{mine}` | the directory of the user's own extensions on this machine (a command that reads or publishes them); empty when the application keeps none |

| From the object (`@for` actions, 8.28) | |
|---|---|
| `{schema}` | the object's schema, empty for a cluster object |
| `{name}` | its exact name; a routine's bare name |
| `{object}` | its qualified name, quoted as SQL needs it; a routine with its argument list |
| `{type}` | its type word (`table`, `view`, `function`, ...); `connection`, `file`, `directory`, `column`, `statement`, `my extension` for the application's own things (8.28) |
| `{column}` | the column's name, for an action opened on a result's column (`@for column`); `{schema}`, `{name}` and `{object}` are then the relation's |
| `{statement}` | the statement's text, for an action opened on a statement (`@for statement`); `{object}` is the same text |

`{time}` and `{timestamp}` use dashes rather than colons deliberately:
they are written into file names. The object placeholders are defined
only when an object opened the action (8.28, 9.10).

Beside the registry, an `@file`, `@dir` or `@var` line (8.7, 8.8, 8.9)
opens one more name for its own file alone; those sections own the
rules.

### 11.2 Expansion

What a placeholder becomes depends on the kind:

- In a **query**, it MUST be rewritten to a bound parameter, exactly as
  a `$column` reference is (10), a declared input's name (8.7 to 8.9)
  included. The same placeholder twice reuses its parameter. A command
  that uses none travels untouched. The one exception is a reference an
  `@inline` of the same header names (8.27): that value enters the text,
  quoted by the server itself, for the statements that bind nothing.
  In the action's OWN command (never a button's, whose `$name` is a row
  reference), an input MAY also be spelled the way a plain query
  carries a parameter: PostgreSQL's positional `$1`, `$name`, psql's
  `:name` and `:'name'` (bound like the rest) and psql's identifier
  `:"name"` (inlined, quoted by the server as an identifier). Such a
  spelling names an INPUT only, declared (8.7 to 8.9) or asked by its
  spelling when no line declared it; it never names a registry
  placeholder (`$db` is an input called db, `{db}` the database). An
  implementation MAY let the user switch these spellings off, in which
  case a hand-written `$1` beside a placeholder is diagnosed as before.
- In a **command**, it MUST expand into ONE argv element (12.1). An argv
  element is not a shell word: a database named `a b; rm -rf /` is one
  argument, and there is nothing to quote.

Braces are read where code is, under the same lexer rule as `$`
references: an array literal (`'{a,b}'`), a JSON body and a regular
expression's `{2,3}` live inside strings, and strings are skipped whole.
A `{name}` nobody knows MUST be diagnosed, on its own line, and left
standing as text.

In a MESSAGE value (a `@confirm` question, an alert's text or title, a
completion hook's path) a placeholder expands as plain text: these are
read by a person or by a file system, not by a parser that could be
injected. Each expands where its asker holds the values: an alert and a
hook where the secret lives (8.10), a `@confirm` on the asking side
BEFORE anything runs, from the values that side already holds, among
which the secret never is (11.3): a `{password}` in a question MUST
never produce the password.

### 11.3 The secret

`{password}` MAY appear in a command action's `@env` value and NOWHERE
else. Not in an argv element (every process on the machine reads argv
through `ps`), not in SQL, not in a path or an alert text, and not
inside a `@var` value (8.9), whose name would smuggle it into all of
the above. A conforming parser MUST refuse it everywhere else, and an
executing implementation MUST refuse it AGAIN at the point of use,
where a client cannot talk around it. In a split implementation the
client never holds the secret: `@env` values are expanded by the server
in the process that starts the
program, and what returns to the client is the command line, secret
absent by construction.

## 12. Execution environment (command actions)

This section binds implementations that EXECUTE command actions.

### 12.1 Direct execution

A quote opened in the command and never closed MUST be diagnosed, as a
shell would refuse the line. Braces are placeholders wherever they
stand in a command, a quoted argument included: the command kind has
no lexer of its own, and `"{db}"` is the database's name in quotes.
A comment line between the continued lines of one command MUST NOT
join the command as arguments; an implementation SHOULD diagnose it.

The command MUST be executed directly, never handed to a shell. The
line is split into argv the way a shell splits words (quotes group and
vanish, `--flag="a b"` is one element) and the program is started with
that argv. Nothing a shell does beyond splitting may happen: no
globbing, no variable expansion, no pipes, no redirection. That is the
trade the format's safety is bought with, and it is why a placeholder
may hold any character a value can hold.

### 12.2 Environment

The process environment is the application's own plus the `@env` pairs,
expanded per 11.2 and 11.3. Secrets reach the program through the
environment and through nothing else.

### 12.3 Tool selection

No PostgreSQL client tool works reliably against a server newer than
itself. An implementation that knows the target server's version SHOULD
resolve a PostgreSQL tool name (`psql`, `pg_dump`, `pg_restore`,
`pg_dumpall`, `pg_isready`) to an installed version that suits it (the
oldest still new enough) and SHOULD refuse, naming the version to
install, when none is; a silent downgrade is not acceptable. Any other
program is looked up on `PATH` as usual.

### 12.4 A connection, or none

A command that uses any connection placeholder needs a connection and
MUST NOT run with empty values substituted; the implementation asks for
one or refuses with a diagnostic. A command that uses none is about the
machine and MUST NOT demand a connection. A file that names its
connection (`@connection`, 8.25) runs there and is never asked.

## 13. Security considerations

The format's security posture is structural rather than filtered:

- Data can never become code: row values and placeholders are bound
  parameters in SQL and single argv elements in commands (10, 11.2,
  12.1). There is no escaping to get wrong because there is no
  concatenation.
- Secrets have exactly one channel: the environment of the child
  process, declared by `@env`, enforced in depth (11.3).
- Markup from the file is never rendered as received: the `@toolbar`
  icon is reassembled from a whitelist (8.4).
- No shell exists in the pipeline (12.1); an action file cannot express
  pipes, redirection or expansion, and a value cannot smuggle them in.

## 14. Extensibility and versioning

### 14.1 Other vocabularies

The syntax of sections 5 through 7 is not tied to the action
vocabulary: it is a general way for a SQL or command file to speak
about itself, and the same construct already lives elsewhere.
NpgsqlRest's comment annotations (HTTP endpoint configuration, read
from `COMMENT ON` routine comments and from `.sql` files) are the same
idea carrying an API vocabulary: a keyword opening its comment line,
case-insensitive, the rest of the line its value. The dialects differ
today: the `@` prefix is optional there and REQUIRED here, and
unrecognized words pass in silence there (annotations share their
comment with documentation prose) while an unknown `@name` is
diagnosed here. The reference implementation itself already carries a
second vocabulary over the lenient dialect: plain SQL files that are
not actions may declare a presentation profile (`@description`,
`@color`, the `@format-*` family, `@readonly`, `@confirm-writes`,
`@parse`, `@extension`, and `@connection` with this specification's
grammar and values) in their first header, where an unknown name is
prose rather than a diagnostic, because such files routinely carry
other tools'
annotations. A future revision of this specification is intended to
host both vocabularies over ONE syntax; a vocabulary carried over this
syntax SHOULD keep the three commitments of section 1.

### 14.2 Versioning

- The `@` name space in headers is reserved by this specification.
  Implementations MUST diagnose unknown names (7) rather than ignore
  them; authors therefore cannot rely on private annotations passing in
  silence, and future revisions can add names without changing the
  meaning of existing files.
- A future revision that changes the meaning of an existing annotation,
  value grammar or default is a new major version of this specification.
  Additions of new annotations, new placeholders and new diagnostics are
  minor revisions.
