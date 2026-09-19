-- @description Continuous aggregates and the hypertables they roll up, from TimescaleDB
-- @face result
select ca.view_schema as schema,
       ca.view_name as view,
       ca.hypertable_schema || '.' || ca.hypertable_name as "over hypertable",
       ca.materialized_only as "materialized only",
       ca.compression_enabled as compression
from timescaledb_information.continuous_aggregates ca
order by ca.view_schema, ca.view_name;

-- @open definition
-- @on view
select ca.view_definition as definition
from timescaledb_information.continuous_aggregates ca
where ca.view_schema = $schema
  and ca.view_name = $view
