# Color themes

PlumeSQL ships two color themes, Dark and Light, built in. Every other
theme is a THEME EXTENSION: a fourth kind of marketplace extension, next
to the query, command and grid extensions, whose one file is a JSON
document of colors. A theme is data and nothing else. It names hex
colors for the application's design tokens; it cannot load a file, reach
a URL, run code or change a font, which is why it installs on one click
with no consent, like a grid extension.

This document specifies the theme file (sections 1 to 3), says how the
application applies a theme (section 4) and how it reads a VS Code theme
into one (section 5). It is published from PlumeSQL's own repository;
the application and the marketplace's validator both answer to it.

The key words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119.

## 1. The file

A theme extension's main file is `<id>.plumesql-theme.json`, where `<id>`
is the extension id. It is UTF-8 JSON (no comments) holding one object:

```json
{
  "themes": [
    {
      "id": "nord",
      "name": "Nord",
      "base": "dark",
      "colors": { "bg": "#2e3440", "panel": "#272c36", "text": "#d8dee9", "accent": "#88c0d0" },
      "syntax": { "keyword": "#81a1c1", "string": "#a3be8c", "comment": "#6d7a96" },
      "terminal": { "red": "#bf616a", "green": "#a3be8c" }
    }
  ]
}
```

- `themes` (required): a non-empty list. One file MAY carry several
  themes, the faces of one family (Solarized Dark and Solarized Light,
  the four Catppuccin flavors).
- `format` (optional): the integer `1`. No other top-level field is
  allowed.

Each theme is an object with exactly these fields:

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Lowercase letters and digits in words joined by single hyphens, starting with a letter, at most 48 characters, unique within the file. |
| `name` | yes | What the picker shows, 1 to 40 characters. |
| `base` | yes | `dark` or `light`: the built-in theme this one is laid over (section 3). |
| `highContrast` | no | `true` draws the editor on its high contrast base, which outlines focused and hovered widgets. |
| `colors` | yes | The surface and state tokens (section 2.1). `bg`, `panel`, `text` and `accent` are required. |
| `syntax` | no | The editor's syntax colors (section 2.2). |
| `terminal` | no | The terminal's sixteen ANSI colors (section 2.3). |

Every color value MUST be a hex literal: `#rgb`, `#rgba`, `#rrggbb` or
`#rrggbbaa`. Nothing else is a color here: no `rgb()`, no names, no
`var()`, no `url()`. An unknown field or an unknown token is an error. A
file whose theme has an error loses THAT theme; its other themes load.

### 1.1 The id a setting stores

The application's `theme` setting stores `dark`, `light`, or a theme's
id qualified by its extension: `<extension id>/<theme id>`
(`solarized/light`). A theme whose id equals its extension's id is
stored as the extension id alone (`nord`), so a file of one theme reads
naturally. The ids `dark` and `light` are reserved for the built-in
themes, and `system` is reserved for following the operating system:
the setting's default, which shows the theme `theme.preferredDark`
names while the system prefers dark and the one `theme.preferredLight`
names while it prefers light (`dark` and `light` unless set), switching
the moment the system does.

## 2. The tokens

### 2.1 `colors`

| Token | What it paints |
|---|---|
| `bg` | The deepest surface: the editor, the result grid, the documents. |
| `panel` | The side bars, the tab strip, the toolbars, the menus. |
| `panel-2` | Inputs, buttons, hovered and pressed controls, grid headers. |
| `editor-gutter` | The editor's line number margin. |
| `border` | Every divider and control edge. |
| `text` | Body text everywhere. |
| `muted` | Secondary text: descriptions, counts, hints, line numbers. |
| `accent` | Focus, links, the active tab's mark, primary buttons, the cursor. |
| `accent-dim` | Selection: the selected row, the editor selection, the focused suggestion. Text sits on it and MUST stay readable. |
| `green` | Success, a live connection, an added line. |
| `red` | Failure, a broken connection, an error squiggle, a removed line. |
| `amber` | Warnings, an open transaction. |
| `violet` | Grid extension marks, and the default color of annotations and types. |
| `row-hover` | A hovered row in trees and grids; the editor's current line. |
| `grid-line` | The result grid's cell lines. |
| `grid-null` | NULL in the result grid. |
| `grid-hl` | The result grid's crosshair and highlighted row. |
| `find-match`, `find-match-hl` | The current find match and the other matches, in the editor and in the trees. Usually translucent. |
| `float-border` | The edge of floating windows (find bars, filters), a step brighter than `border`. |
| `footer-bg`, `footer-text`, `footer-muted` | The status bar. |
| `footer-conn`, `footer-conn-hover` | The status bar's connection segment. |

### 2.2 `syntax`

`keyword`, `string`, `number`, `comment`, `operator`, `type`, `func` and
`annotation` (an extension's `@` annotations inside comments). Every
Monaco surface colors by them: SQL, the DDL viewer, JSON, the extension
editors.

### 2.3 `terminal`

`black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white` and
their `bright` forms (`brightBlack` ... `brightWhite`). Each one left out
falls back to the palette (red to `red`, blue to `accent`, and so on).

## 3. Completion: a dozen colors paint the whole window

A theme names what it cares about; the application derives the rest, in
the same proportions the built-in themes follow. With `mix(a, b, t)` for
CSS `color-mix(in srgb, a t, b)`:

| Token | When absent |
|---|---|
| `panel-2` | `mix(text, panel, 8%)` on a dark base, 5% on a light one |
| `editor-gutter` | `mix(text, bg, 2.5%)` |
| `border` | `mix(text, panel, 16%)` dark, 14% light |
| `muted` | `mix(text, bg, 62%)` |
| `accent-dim` | `mix(accent, bg, 32%)` dark, 24% light |
| `green`, `red`, `amber`, `violet` | the base theme's |
| `row-hover` | `mix(text, bg, 7%)` dark, 5% light |
| `grid-line` | `mix(text, bg, 45%)` dark, 30% light |
| `grid-null` | `mix(amber, text, 50%)` dark, `amber` light |
| `grid-hl` | `mix(accent, bg, 16%)` dark, 14% light |
| `find-match` | `mix(accent, bg, 50%)` at 75% opacity |
| `float-border` | `mix(text, panel, 30%)` dark, 32% light |
| `footer-bg` | `mix(accent, bg, 18%)` |
| `footer-text`, `footer-muted` | `text`, `mix(text, bg, 80%)` |
| `footer-conn`, `footer-conn-hover` | `green`, `mix(green, text, 82%)` |
| `syntax.keyword`, `func` | `accent` |
| `syntax.string`, `number`, `comment` | `green`, `amber`, `muted` |
| `syntax.operator`, `type`, `annotation` | `text`, `violet`, `violet` |

Two tokens are always derived, never named: the text color ON an
accent fill and ON a red fill (a primary button, a checked box, a
danger badge), white or near-black `#111418`, whichever reads better on
the fill; a light accent would swallow white text.

What a theme cannot name at all (the shadows, the fonts, the spacing)
stays its base's. A theme's `text` SHOULD read at 4.5:1 or better on its
`bg` (WCAG AA); the validator warns under that, it does not refuse.

## 4. In the application

- **Picking.** Select Color Theme (the cog menu, the command palette, its
  shortcut; VS Code's command) lists Dark and Light and every installed
  theme, light themes first, then dark, each with its extension's name.
  The window repaints as the highlight moves; Enter keeps the theme,
  Escape puts the previous one back. The Settings page lists the same
  themes under Appearance.
- **Applying.** The page keeps the base's `data-theme` (so everything
  written for "both themes" still holds) and lays the theme's tokens
  over it as custom properties on the document root. The editor, the
  terminal, the result grid, the trees and every floating window read
  the same tokens, so one switch repaints all of them.
- **Result views.** A view's `ctx.theme` stays the base (`'dark'` or
  `'light'`), so every view keeps working; `ctx.palette` hands it the
  active theme's colors by role (`background`, `surface`, `text`,
  `muted`, `border`, `accent`, `green`, `red`, `amber`, `violet` and the
  syntax colors), so a chart can paint in the theme.
- **Installing.** A theme extension installs and updates on one click,
  like a grid extension, and updates automatically when the
  `marketplace.autoUpdate` setting says so. An install opens the picker
  on the extension's themes at once, led by a Keep row for the theme
  showing, which holds the first highlight: nothing repaints until the
  highlight moves to one of the new themes, which previews it, and
  Enter on Keep or Escape keeps the window as it was. An install offers
  its themes; it never switches to one. Its page draws every theme it
  carries as a small window in its own colors, each with two buttons,
  the same on every page that draws themes (an Open VSX or a VS Code
  package's too): **Preview** paints the whole window in the theme for a
  look (never saved; the status bar says "Previewing <name>" with Use and
  Cancel beside it, so the choice can be made wherever you went to look:
  it stays while you move between tabs, to see a script, a grid or the
  trees in the theme; its Use keeps the theme exactly like a card's Use,
  and Cancel, Escape, the card's Stop or quitting ends it), and **Use** switches the window to it, installing the
  extension first when it is not installed (that install opens no
  picker, and one that does not land changes nothing). The theme in use
  says "in use" instead of the buttons. The row's menu has Preview… too
  before an install, opening the page on its first theme. Installed, the
  row's button in the Extensions tab is Use, and its menu's Use Theme…,
  which open the picker narrowed to that extension's themes.
- **A missing theme.** When the setting names a theme nothing installed
  answers (the extension was removed, the settings file names something
  else), the window shows Dark and the Log says so once, with Select
  Color Theme as its button. Startup opens nothing for it.
- **Your own.** New Theme from Current Colors writes a theme extension
  into My Extensions holding the colors on screen, opens its file and
  makes it the theme showing (the window looks the same), so every save
  repaints the window.
  The editor helps with the file: a swatch and the color picker on
  every hex value, the tokens a group still lacks as completions, and
  what each token paints on hover.
  Prepare to Publish checks it with the same parser the application
  loads it with.

## 5. Importing a VS Code theme

Import VS Code Theme reads a VS Code color theme, as its `.json` file or
as the `.vsix` package it ships in, and writes a theme extension of the
user's with every theme the package contributes. VS Code themes are data
too, so nothing of VS Code runs. The source of a `.vsix` is the user's
choice; Open VSX (open-vsx.org) serves them openly. The Visual Studio
Marketplace's terms limit its use to Microsoft's products, so PlumeSQL
never fetches from it.

The conversion reads the workbench colors that mean the same thing and
leaves the rest to section 3:

| PlumeSQL | VS Code (the first present wins) |
|---|---|
| `bg` | `editor.background` |
| `panel` | `sideBar.background`, `activityBar.background`, `editorGroupHeader.tabsBackground`, `panel.background` |
| `panel-2` | `input.background`, `dropdown.background`, `editorWidget.background` |
| `editor-gutter` | `editorGutter.background` |
| `border` | the first NEUTRAL one (chroma under 22%) of `sideBar.border`, `editorGroup.border`, `panel.border`, `tab.border`, `editorGroupHeader.tabsBorder`, `input.border`, `contrastBorder`: it draws every divider, so an accent a theme puts on one edge stays out |
| `text` | `editor.foreground`, `foreground` |
| `muted` | `descriptionForeground`, `editorLineNumber.foreground`, `tab.inactiveForeground` |
| `accent` | the first of `textLink.foreground`, `focusBorder`, `button.background`, `activityBarBadge.background`, `progressBar.background`, `editorCursor.foreground` that reads at 2.6:1 on `bg` |
| `accent-dim` | `list.activeSelectionBackground`, `editor.selectionBackground` (dropped when `text` would read under 3:1 on it) |
| `green` | `terminal.ansiGreen`, `gitDecoration.addedResourceForeground` |
| `red` | `errorForeground`, `editorError.foreground`, `terminal.ansiRed` |
| `amber` | `editorWarning.foreground`, `terminal.ansiYellow` |
| `violet` | `terminal.ansiMagenta` |
| `row-hover` | `list.hoverBackground` |
| `find-match`, `find-match-hl` | `editor.findMatchBackground`, `editor.findMatchHighlightBackground` |
| `float-border` | `editorWidget.border`, `widget.border` |
| `terminal.*` | `terminal.ansi*` |

A translucent color is laid over `bg` for every token that must be a
solid surface. The syntax colors come from the TextMate `tokenColors`:
for each token, a list of scopes is tried in order, and the LAST rule
naming the scope exactly wins, then the last naming a narrower scope of
the same family (`keyword.control` for `keyword`):

| Token | Scopes |
|---|---|
| `keyword` | `keyword.other.DML.sql`, `keyword.other.sql`, `keyword`, `storage.modifier`, `storage` |
| `string` | `string.quoted.single.sql`, `string.quoted`, `string` |
| `number` | `constant.numeric`, `constant.language`, `constant` |
| `comment` | `comment.line`, `comment`, `punctuation.definition.comment` |
| `operator` | `keyword.operator`, `punctuation.separator`, `punctuation` |
| `type` | `storage.type`, `support.type`, `entity.name.type`, `support.class` |
| `func` | `entity.name.function`, `support.function`, `meta.function-call` |
| `annotation` | `storage.type.annotation`, `meta.decorator`, `entity.name.decorator`, `variable.parameter`, `entity.other.attribute-name` |

The base is the package's `uiTheme` (`vs` and `hc-light` light, `vs-dark`
and `hc-black` dark, the `hc-` ones high contrast), else the theme's own
`type`, else the lightness of its background. A theme that `include`s
another (inside the package) is read with the included one underneath.
The import is a reading, not a promise: the file it writes is there to
adjust, and redistributing an imported theme is for its license to say.

The picker's **Search Open VSX…** row finds theme packages in the open
registry on request, shows each package's license before its download
and imports the downloaded package the same way.

