# pgvector

A pgvector value is a wall of floats, often 1536 of them, that says nothing at a glance. This extension reads `vector`, `halfvec` and `sparsevec` values where you meet them, with no query to the server, and answers what the vector is: its dimensions, its range, its length, and the shape of its components.

## What it shows

- **Hover** a cell: a card with one reading line (`1,536 dims · min -0.1127 · max 0.1094 · ‖v‖ 1`) and a sparkline of the components over a zero line. The raw tooltip is gone.
- **Peek** a cell (Space): the same line and sparkline above the value as stored.
- **Open Value in Tab**: the subtitle says `vector · 1,536 dims`, the facts give the column's type and the reading line, and the sparkline sits above the stored value in the editor.

A long vector is downsampled to the width of the sketch (each point the mean of its bucket, which keeps an embedding's shape). A sparse vector reads as its dimensions and its nonzero count, and its sparkline spikes at the true positions of its entries. The range and the norm are over the stored components.

## Where it applies

Every column whose declared type is `vector`, `halfvec` or `sparsevec` (with a dimension such as `vector(1536)`, and schema qualified when the extension lives off the `search_path`), in every result, from the install on (a global scope you can change on its page). A JSON array of numbers in a `json` or text column keeps its own face.

## Requirements

PostgreSQL 13 or newer with the pgvector extension (`create extension vector`). Nothing runs on the server: the values are read from what the grid already holds.
