# Invalid geometries

The rows of a table whose geometry PostGIS finds invalid, with the reason for each. Where Validate geometry checks one value, this checks a whole column.

## Using it

Right click the header of a `geometry` or `geography` column in a result that comes from a table and choose **Run Invalid geometries**. It opens beside the result with one row per invalid geometry of that column's table, in physical order:

| Column | Meaning |
|---|---|
| row_id | The row's `ctid`, its physical address in the table. |
| reason | PostGIS's reason (`ST_IsValidReason`), such as `Self-intersection[0.5 0.5]`. |
| type | The geometry type (`GeometryType`). |
| points | Its number of points (`ST_NPoints`). |

An empty answer means every geometry in the column is valid. NULLs are left out.

## Requirements

PostgreSQL 13 or newer with the `postgis` extension; without it the run answers with the server's own error.

## Notes

Reads only, one statement on the tab's connection. It scans the WHOLE table, not the rows the result shows, which on a big table takes the time a full scan takes. The table and the column are names a statement cannot bind, so they are inlined, quoted by the server as identifiers (`@inline ... identifier`). The PostGIS functions resolve through the `search_path` by design.
