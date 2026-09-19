# hstore

An `hstore` value is a flat map printed as one line of quoted pairs, `"color"=>"red", "size"=>"XL", "note"=>NULL`: readable for three keys, a wall for thirty. This extension reads that text where you meet it, with no query to the server, and shows the map as a table.

## What it shows

- **Hover** a cell: a card with the key count (`3 keys · 1 NULL`) and the first pairs as a key => value table, every key and value on its own line, a NULL value marked as NULL (an empty string stays empty). The raw tooltip is gone.
- **Peek** a cell (Space): the same count and table above the value as stored.
- **Open Value in Tab**: the facts (how many keys, how many NULL values), the table, and the whole map as pretty printed JSON in the editor, every value a string and NULL a JSON `null`, the way `hstore_to_json` builds it. **Decode as JSON** in the header flips the editor back to the text as stored; **Copy** copies whichever is shown, so the JSON pastes straight into a `jsonb` literal or a script.
- **Edit a row** (F2): under an hstore field, a live verdict on what is typed: `2 keys` while it reads as an hstore, or `not a valid hstore: expected "=>" after the key "a" (character 3)` where it stops reading. Bare words (`a=>1, b=>NULL`) read as the extension's own input does; a duplicated key is said to be dropped. The server stays the judge.

The reading follows the extension's own input grammar: keys and values double quoted (a backslash escapes a quote or a backslash) or bare, a bare `NULL` (in any case) is SQL NULL, a quoted `"NULL"` is the string.

## Where it applies

Every column whose declared type is `hstore` (schema qualified when the extension lives off the `search_path`), in every result, from the install on (a global scope you can change on its page). A text column holding `"a"=>"1"` is text and stays that way.

## Requirements

PostgreSQL 13 or newer with the hstore extension (`create extension hstore`). Nothing runs on the server: the values are read from what the grid already holds.
