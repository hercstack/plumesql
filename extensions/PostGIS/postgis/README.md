# PostGIS

PostGIS streams a `geometry` or `geography` value as EWKB hex: exact, and unreadable. This extension reads that hex where you meet it, with no query to the server, and shows the value as EWKT (the text `ST_AsEWKT` prints) beside a sketch of the shape.

## What it shows

- **Hover** a cell: a card with the EWKT and a small sketch of the shape. The raw hex tooltip is gone.
- **Peek** a cell (Space): the same EWKT and sketch in a strip above the value as stored.
- **Open Value in Tab**: the facts (the kind, with Z and M when present, the SRID, the number of points and the bounding box), the sketch, and the EWKT in the editor. **Decode geometry** in the header flips the editor back to the hex as stored; **Copy** copies whichever is shown, so a copied EWKT pastes straight back into a query.
- **Edit a row** (F2): the geometry field sketches the stored value, and the sketch follows as you type EWKT or WKT (`SRID=4326;POLYGON((0 0,4 0,4 4,0 0))`, `POINT Z (1 2 3)`, `MULTIPOINT((1 1),(2 2))`). A half typed literal shows nothing; the server stays the judge of what a literal means.

- **Sketch Geometry Column**, in the menu of a geometry or geography column's header: a **Geometry Sketch** tab beside the grid draws every geometry of that column together, points as dots, lines as lines, polygons filled with their holes, all in one shared box. The line above it counts the geometries and their points and names the SRID and the NULLs. The view reads the one column page by page, and stops at 20,000 geometries or 300,000 points, saying how far it read (`first 20,000 of 25,000 rows`). It resizes with the pane.

Every geometry kind reads: points, lines, polygons with their holes, the multis and geometry collections, 2D, Z, M and ZM, with or without an SRID, in PostGIS's EWKB and in ISO WKB of either byte order. Empty geometries read as `EMPTY`.

A sketch is a shape, not a map: the coordinates are drawn as they are, one scale for both axes, latitude up, with no basemap and no projection. A very large geometry is drawn coarser in the small sketches.

## Where it applies

Every column whose declared type is `geometry` or `geography` (with a type modifier such as `geometry(Point,4326)`, and schema qualified when PostGIS lives off the `search_path`), in every result, from the install on (a global scope you can change on its page). A text column holding hex is text and stays that way. The Geometry Sketch tab shows only on a result that has such a column.

## Requirements

PostgreSQL 13 or newer with the PostGIS extension. Nothing runs on the server: the values are decoded from what the grid already holds.
