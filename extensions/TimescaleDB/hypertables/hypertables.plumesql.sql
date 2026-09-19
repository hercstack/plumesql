-- @description Hypertables with their chunks, sizes and compression, from TimescaleDB
-- @face result
select h.hypertable_schema as schema,
       h.hypertable_name as hypertable,
       h.owner,
       h.num_chunks as chunks,
       h.compression_enabled as compression,
       h.primary_dimension as "partitioned by",
       pg_catalog.pg_size_pretty(hypertable_size(pg_catalog.format('%I.%I', h.hypertable_schema, h.hypertable_name)::regclass)) as size
from timescaledb_information.hypertables h
order by h.hypertable_schema, h.hypertable_name;

-- @open chunks
-- @on hypertable
select c.chunk_schema || '.' || c.chunk_name as chunk,
       c.range_start,
       c.range_end,
       c.is_compressed as compressed,
       c.chunk_creation_time as created
from timescaledb_information.chunks c
where c.hypertable_schema = $schema
  and c.hypertable_name = $hypertable
order by c.range_start desc
