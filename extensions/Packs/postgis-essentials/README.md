# PostGIS essentials

Everything PlumeSQL offers for PostGIS data: shapes you can read, a result on a real map, readable geometry written for you, and PostGIS's own checks for broken shapes.

## What is in it

- **PostGIS**: geometry and geography values read as text (EWKT) with a sketch of the shape on hover, and a whole column sketched at once.
- **Map**: a result's points, lines and polygons on a real map, coloured, sized and raised by columns.
- **PostGIS refactors**: from the editor's lightbulb, geometry as readable WKT or GeoJSON, moved to longitude and latitude (WGS 84), the rows near the first one, and the bounding box.
- **Validate geometry**: asks PostGIS whether one shape is valid and why not, from the cell's menu.
- **Invalid geometries**: every row of a table whose shape PostGIS finds invalid, with the reason, from the column header's menu.

## Where to start

1. Run a query that returns a geometry column and hover a value: its sketch, with nothing to set up.
2. Put `-- @extension postgis-map` above the query (or right-click the result, **Extensions…**, **Map**) to see the rows on a map. The first time, the Log asks you to allow the map's tile host.
3. After importing shapes, right-click the geometry column's header and run **Invalid geometries** before you compute areas or unions.

The pack's members are named in `postgis-essentials.plumesql-pack.json`; the pack's page lists them with where each one stands.
