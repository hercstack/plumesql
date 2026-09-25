-- @description Chunks of the hypertable this was opened on: their time range, size and compression state, from TimescaleDB
-- @for hypertable
-- @face result
select c.chunk_name as chunk,
       c.range_start as "from",
       c.range_end as "to",
       pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(pg_catalog.format('%I.%I', c.chunk_schema, c.chunk_name)::regclass)) as size,
       c.is_compressed as compressed,
       c.chunk_tablespace as tablespace
  from timescaledb_information.chunks c
 where c.hypertable_schema = {schema} and c.hypertable_name = {name}
 order by c.range_start desc;
