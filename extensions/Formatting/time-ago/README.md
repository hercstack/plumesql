# Time ago

![Time ago: A timestamp column named *_at reads as relative time, exact value on hover](media/time-ago.webp)

A timestamp column named *_at reads as relative time ("3 hours ago"), the exact value on hover.

## What it shows

A formatting rule that matches a TIMESTAMP column (with or without time zone) whose name ends in `_at`; the match ANDs the name and the type. A naive timestamp reads as local time, a timestamptz keeps its zone; the exact server text is in the tooltip. What the server sent stays the value: copying, exporting and the console never see the formatted text.

## Requirements

PostgreSQL 13 or newer. The rule works on the result in the grid; the server is never asked.

## Notes

A script attaches it with `-- @extension time-ago` above the query, or once in the header for the whole file; a result's menu can attach it too. The extension's page lists the exact lines. To match other columns or say it differently, fork it from the row menu and edit the pattern and the words in the file.
