# PostGIS refactors

PostGIS sends a geometry as EWKB hex: exact, and unreadable. On a `SELECT` that lists a geometry or geography column, or a `*` that brings one, the editor's lightbulb (Ctrl+. or ⌘.) turns the column into text a person can read, under its own name:

```sql
select id, name, ST_AsText(geom) as geom from places;
```

## What it offers

**Readable geometry**, as WKT (`ST_AsText`) or as GeoJSON (`ST_AsGeoJSON`), one offer each. A named column is wrapped where it stands; a `*` or a `t.*` is expanded into the table's columns with the geometry ones wrapped, so the rest of the query stays as it was.

## Where it applies

In the SQL editor, wherever the extension is attached (everywhere from the install on; change it on its page). It reads only the statement and its tables' columns from PlumeSQL's dictionary. Reading geometry values in a result, with a sketch of the shape, is the **PostGIS** extension's: install that one too, and attach each where you want it (the refactors everywhere, the sketches only where a script asks for them, for example).

## Requirements

PostgreSQL 13 or newer with PostGIS (`create extension postgis`), and PlumeSQL 0.23.0 or newer.
