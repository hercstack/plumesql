-- @description Ask PostGIS whether this geometry is valid, and why not: the verdict, its type, SRID and point count
-- @for value(geometry, geography)
-- @face result
-- The value travels bound ({value}) and is typed by PostGIS's own input,
-- EWKB hex and (E)WKT alike; a geography reads as its geometry. The
-- PostGIS functions resolve through the search_path by design: the
-- schema PostGIS was installed into is not knowable from here.
select case when st_isvalid(g) then 'valid' else 'invalid: ' || st_isvalidreason(g) end as verdict,
       geometrytype(g) as type,
       st_srid(g) as srid,
       st_npoints(g) as points
from (select ({value}::pg_catalog.text)::geometry as g) as v;
