-- @description The rows of this column's table whose geometry PostGIS finds invalid, with the reason for each
-- @for column(geometry, geography)
-- @face result
-- @inline schema identifier
-- @inline name identifier
-- @inline column identifier
-- The table and the column are names a statement cannot bind, so they
-- are inlined, quoted by the server as identifiers. The PostGIS
-- functions resolve through the search_path by design.
select t.ctid as row_id,
       st_isvalidreason(t.{column}::geometry) as reason,
       geometrytype(t.{column}::geometry) as type,
       st_npoints(t.{column}::geometry) as points
from {schema}.{name} as t
where t.{column} is not null
  and not st_isvalid(t.{column}::geometry)
order by t.ctid;
