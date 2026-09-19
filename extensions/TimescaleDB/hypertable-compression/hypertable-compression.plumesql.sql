-- @description Compression of the hypertable this was opened on: chunks compressed, bytes before and after, from TimescaleDB
-- @for hypertable
-- @face result
select s.total_chunks as chunks,
       s.number_compressed_chunks as compressed_chunks,
       pg_catalog.pg_size_pretty(s.before_compression_total_bytes) as "before",
       pg_catalog.pg_size_pretty(s.after_compression_total_bytes) as "after",
       case when s.after_compression_total_bytes > 0
            then round(s.before_compression_total_bytes::numeric / s.after_compression_total_bytes, 1)
       end as ratio,
       pg_catalog.pg_size_pretty(s.before_compression_table_bytes) as heap_before,
       pg_catalog.pg_size_pretty(s.after_compression_table_bytes) as heap_after,
       pg_catalog.pg_size_pretty(s.before_compression_index_bytes) as indexes_before,
       pg_catalog.pg_size_pretty(s.after_compression_index_bytes) as indexes_after
  from hypertable_compression_stats({object}::regclass) s;
