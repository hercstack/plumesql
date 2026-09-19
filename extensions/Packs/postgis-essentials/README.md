# PostGIS essentials

Everything PlumeSQL reads PostGIS with: geometry and geography values as EWKT with a sketch of the shape, a whole column sketched at once, and PostGIS's own validity checks on a value and on a column.

## What it installs

- `postgis`: geometry and geography values read on hover, in the peek, the value tab and the row editor, and the Sketch Geometry Column view
- `validate-geometry`: is this one geometry valid, and why not
- `invalid-geometries`: every invalid geometry of a column's table

## How it installs

A pack has no code of its own: it names the extensions above, and Install all installs the ones you do not have yet, each the way its own kind installs. The grid extension installs at once; the two query extensions show their code and ask for your consent first, exactly as they would on their own pages. Skip any of them, or remove one later, and the rest stay.

## Notes

Every member has its own page, requirements and README; the pack's page lists them with where each one stands.
