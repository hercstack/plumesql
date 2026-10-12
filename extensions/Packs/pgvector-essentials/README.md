# pgvector essentials

Everything PlumeSQL reads embeddings with: `vector`, `halfvec` and `sparsevec` values you can read, the nearest neighbour query and its index a lightbulb away in the editor, and the whole vector space of a result in 3D, where clusters, outliers and broken embeddings show at a glance.

## Where to start

Run a query that returns a vector column: its values read as dimensions, range and norm (hover one), with nothing to set up. In the editor, the lightbulb on a query over a vector column offers the nearest neighbour query and the index that makes it fast.

**Vector Space 3D** draws a whole column of embeddings at once: right-click the result, **Extensions…**, **Vector Space 3D**, or put `-- @extension vector-space-3d` above the query. Click a point for its nearest neighbours.

The pack's members are named in `pgvector-essentials.plumesql-pack.json`, and PlumeSQL lists them on the pack's page with where each one stands.
