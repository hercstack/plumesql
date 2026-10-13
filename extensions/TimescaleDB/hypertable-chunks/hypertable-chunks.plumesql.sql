-- @description Chunks of the hypertable this was opened on: their time range, size and compression state, from TimescaleDB
-- @for hypertable
-- @face result
-- The size comes from chunks_detailed_size: a compressed chunk keeps its
-- rows in a companion table, which the chunk's own relation size leaves out.
select c.chunk_name as chunk,
       c.range_start as "from",
       c.range_end as "to",
       pg_catalog.pg_size_pretty(s.total_bytes) as size,
       c.is_compressed as compressed,
       c.chunk_tablespace as tablespace
  from timescaledb_information.chunks c
  left join chunks_detailed_size(pg_catalog.format('%I.%I', {schema}::text, {name}::text)::regclass) s
         on s.chunk_schema = c.chunk_schema and s.chunk_name = c.chunk_name
 where c.hypertable_schema = {schema} and c.hypertable_name = {name}
 order by c.range_start desc;
