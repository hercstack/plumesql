-- @description Continuous aggregates and the hypertables they roll up, from TimescaleDB
-- @face result
select ca.view_schema as schema,
       ca.view_name as view,
       ca.hypertable_schema || '.' || ca.hypertable_name as "over hypertable",
       ca.materialized_only as "materialized only",
       ca.compression_enabled as compression
from timescaledb_information.continuous_aggregates ca
order by ca.view_schema, ca.view_name;

-- The definition one row per line, so it reads whole: indented with
-- non-breaking spaces where the database is UTF8 (the grid collapses
-- plain ones), plain spaces elsewhere.
-- @open definition
-- @on view
select pg_catalog.repeat(case when pg_catalog.getdatabaseencoding() = 'UTF8'
                              then pg_catalog.convert_from(pg_catalog.decode('c2a0', 'hex'), 'UTF8')
                              else ' ' end,
                         pg_catalog.length(l.text) - pg_catalog.length(pg_catalog.ltrim(l.text, ' ')))
       || pg_catalog.ltrim(l.text, ' ') as definition
from timescaledb_information.continuous_aggregates ca,
     rows from (pg_catalog.regexp_split_to_table(ca.view_definition, pg_catalog.chr(10))) with ordinality as l(text, n)
where ca.view_schema = $schema
  and ca.view_name = $view
order by l.n
