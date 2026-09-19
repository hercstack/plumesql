-- @description Compress every chunk of the hypertable this was opened on that is not compressed yet (TimescaleDB)
-- @for hypertable
-- @face result
-- @confirm "Compress chunks", "Compress every chunk of {object} that is not compressed yet? Compression needs to be enabled on the hypertable (ALTER TABLE ... SET (timescaledb.compress)); a compressed chunk is read-only until decompressed."
select compress_chunk(c, if_not_compressed => true)::text as compressed_chunk
  from show_chunks({object}::regclass) c;
