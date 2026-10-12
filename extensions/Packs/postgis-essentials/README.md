# PostGIS essentials

Everything PlumeSQL reads PostGIS with: geometry and geography values as EWKT with a sketch of the shape, a whole column sketched at once, a result's rows on a real map, readable geometry a lightbulb away in the editor, and PostGIS's own validity checks on a value and on a column.

## Where to start

Run a query that returns a geometry column: its values read as EWKT with a sketch of the shape, with nothing to set up, and the lightbulb on the query offers readable WKT or GeoJSON and the move to WGS 84. A geometry cell's menu has **Validate geometry**, the column header's menu **Invalid geometries**.

**Map** puts the rows on a real map: right-click the result, **Extensions…**, **Map**, or put `-- @extension postgis-map` above the query. The first time, the Log asks you to allow the map's tile host.

The pack's members are named in `postgis-essentials.plumesql-pack.json`, and PlumeSQL lists them on the pack's page with where each one stands.
