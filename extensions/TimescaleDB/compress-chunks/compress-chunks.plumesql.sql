-- @description Compress every chunk of the hypertable this was opened on that is not compressed yet (TimescaleDB)
-- @for hypertable
-- @face result
-- @confirm "Compress chunks", "Compress every chunk of {object} that is not compressed yet? Compression needs to be enabled on the hypertable (ALTER TABLE ... SET (timescaledb.compress)); a compressed chunk still answers queries and takes writes, more slowly, until decompressed."
-- Only the chunks not compressed yet are passed on, oldest first, so every
-- row of the answer is a chunk this run compressed.
select compress_chunk(pg_catalog.format('%I.%I', c.chunk_schema, c.chunk_name)::regclass, if_not_compressed => true)::text as compressed_chunk
  from timescaledb_information.chunks c
 where c.hypertable_schema = {schema} and c.hypertable_name = {name}
   and not c.is_compressed
 order by c.range_start;
