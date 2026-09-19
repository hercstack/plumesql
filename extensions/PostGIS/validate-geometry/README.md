# Validate geometry

Ask PostGIS whether one geometry is valid, and why not. A shape can look right in a sketch and still be invalid (a polygon whose boundary crosses itself, a ring that does not close); whether it is valid is PostGIS's judgment, so this asks PostGIS itself.

## Using it

Right click a cell of a `geometry` or `geography` column and choose **Run Validate geometry**, or choose it from the **More actions** menu of the cell's value tab. It opens beside the result, titled with the column, and answers one row:

| Column | Meaning |
|---|---|
| verdict | `valid`, or `invalid:` followed by PostGIS's reason (`ST_IsValidReason`), such as `Self-intersection[0.5 0.5]`. |
| type | The geometry type (`GeometryType`). |
| srid | Its SRID. |
| points | Its number of points (`ST_NPoints`). |

Each value you validate opens its own answer, so two shapes can be compared side by side. A NULL has nothing to validate and offers nothing.

## Requirements

PostgreSQL 13 or newer with the `postgis` extension; without it the run answers with the server's own error.

## Notes

Reads only, one statement on the tab's connection. The value is bound as a parameter (`{value}`) and read by PostGIS's own input, so EWKB hex and EWKT alike work; a geography is checked as its geometry. The PostGIS functions resolve through the `search_path` by design, since the schema PostGIS was installed into cannot be known in advance.
