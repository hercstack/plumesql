-- @description Run pg_partman's maintenance now: create the partitions that are due and apply retention, on every set it maintains
-- @face result
-- @var partman_schema "pg_partman schema", "partman"
-- @inline partman_schema identifier
-- @confirm "Run maintenance", "Run pg_partman's maintenance now? It creates the partitions that are due and drops or detaches the ones past retention, on every partition set the extension maintains, exactly as its scheduled run would."
select {partman_schema}.run_maintenance() as done;
