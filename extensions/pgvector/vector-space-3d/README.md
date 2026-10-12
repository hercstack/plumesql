# Vector Space 3D

![Vector Space 3D: Embeddings in 3D: a vector column on its three principal axes, coloured by a category; click a point for its nearest neighbours](media/vector-space-3d.webp)

Embeddings in 3D: a vector column projected on its three principal axes, a point per row, coloured by a category. Click a point to see its nearest neighbours, measured in the full vectors. Orbit, zoom, pan and spin with the mouse (three.js, through the Three core extension, which installs with it).

## What it shows

A **Vector Space** tab beside the grid. The vectors of the result (pgvector's `vector`, `halfvec` and `sparsevec`, or a plain array of numbers) are centred and projected on their three principal axes (PCA): the three directions along which they differ most, so what is near in the picture tends to be near in meaning. The axis names say how much of the variance each axis keeps, and the corner how much the three keep together: a low share means the picture flattens a lot, and only the neighbours can be trusted.

What it answers at a glance:

- whether the chunks of one document, or the rows of one category, stay together, and whether the model separates the categories you care about;
- the outliers: a vector far from all the others, often a parse that went wrong or a text in another language;
- a broken embedding: all zeros, or the same vector over and over, sits alone in one spot.

**Colour by** a category gives each of the twelve most frequent values a colour (the legend hides and shows them with a click); a number paints along the theme's ramp. Hover a point for its label. **Click** a point for its nearest neighbours by cosine similarity, computed in the full vectors rather than in the picture: lines to each, and a list in the corner with their similarity, where a click selects the row in the grid. Escape or ✕ clears them. **Spin** turns the cloud slowly.

The projection runs off the app's thread, so a few thousand vectors of 1536 dimensions take a moment without freezing anything.

## Inputs

| Input | `@inputs` key | Default | Meaning |
|---|---|---|---|
| Vector | `vector` | asked | The embeddings column |
| Colour by | `color` | none | A category (a colour each) or a number (a ramp) |
| Label | `label` | none | What a point is called in the tooltip and among the neighbours |
| Neighbours | `neighbours` | 5 | How many nearest neighbours a click shows |
| Top rows | `top` | 3000 | How many rows the view reads from the result, from the first one |

## Example

```sql
-- @extension vector-space-3d open
-- @inputs vector=embedding, color=category, label=title
select title, category, embedding from documents limit 3000;
```

### Try it without a model

Six topics as clusters of 64-dimensional vectors, with a few zero vectors among them, on any database with pgvector:

```sql
create extension if not exists vector;
create table vs_demo as
with topics as (
  -- 0 * t makes the subquery run once per topic, a centre each
  select t, name, array(select random() * 2 - 1 + 0 * t from generate_series(1, 64)) as c
  from unnest(array['billing', 'shipping', 'returns', 'accounts', 'security', 'product']) with ordinality as x(name, t)
)
select g as id, name as topic, initcap(name) || ' note ' || g as title,
       (select array_agg(c[d] + (random() * 2 - 1) * 0.45) from generate_series(1, 64) d)::vector(64) as embedding
from topics, generate_series(1, 250) g
union all
select 1000 + g, 'broken', 'Empty embedding ' || g, array_fill(0, array[64])::vector(64) from generate_series(1, 5) g;

-- @extension vector-space-3d open
-- @inputs vector=embedding, color=topic, label=title
select title, topic, embedding from vs_demo;
```

## Requirements

PostgreSQL 13 or newer, with the `vector` extension (pgvector) for its column types; a plain `real[]` or `float8[]` column reads too. Nothing runs on the server beyond your query: the projection runs in the result's sandbox. three.js comes from `cdn.jsdelivr.net`, which has to be an allowed remote script host (the Log offers Allow host when it is not).

## Notes

Rows with no vector, or with one of another dimension than most, are left out, and the Log says how many. The neighbours are searched among the rows the view read (Top rows), not the whole table: for the table's own nearest neighbours, the pgvector refactors write the query with the `<=>` operator. Labels are drawn over the canvas, so Copy as Image gives the points without their labels.
