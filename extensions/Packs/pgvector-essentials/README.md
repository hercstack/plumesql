# pgvector essentials

Everything PlumeSQL offers for embeddings stored with pgvector: read one vector, find its neighbours, and see a whole column of them in space.

## What is in it

- **pgvector**: a `vector`, `halfvec` or `sparsevec` value reads as its dimensions, range and length with a sparkline of its numbers, so an empty or wrongly sized embedding stands out (hover a cell).
- **pgvector refactors**: the nearest neighbour query written for you from the editor's lightbulb, to a vector you paste or to a row you have, and the HNSW index that makes it fast.
- **Vector Space 3D**: a whole column of embeddings drawn as points in 3D, coloured by a category, so clusters, outliers and broken embeddings show at a glance; click a point for its nearest neighbours.

## Where to start

1. Run a query that returns a vector column and hover a value: dimensions, range and length, with nothing to set up.
2. In the editor, open the lightbulb (Ctrl+. or ⌘.) on a query over a table with a vector column for the nearest neighbour query and the index it needs.
3. Put `-- @extension vector-space-3d` above a query that returns a vector column and a category (or right-click its result, **Extensions…**, **Vector Space 3D**).

The pack's members are named in `pgvector-essentials.plumesql-pack.json`; the pack's page lists them with where each one stands.
