-- @description Add a compression policy to the hypertable this was opened on: chunks older than an age get compressed by a background job (TimescaleDB)
-- @for hypertable
-- @face result
-- @var compress_after "Compress chunks older than", "7 days"
-- @confirm "Add compression policy", "Schedule the compression of every chunk of {object} older than {compress_after}? Compression needs to be enabled on the hypertable (ALTER TABLE ... SET (timescaledb.compress)). An existing policy is kept as it is."
select add_compression_policy({object}::regclass, compress_after => {compress_after}::interval, if_not_exists => true) as job_id;
