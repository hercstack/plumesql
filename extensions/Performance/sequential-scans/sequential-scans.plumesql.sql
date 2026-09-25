-- @description Tables read most by sequential scan: where an index might be missing, by rows read
-- @face result
select s.schemaname as "schema",
       s.relname as "table",
       s.seq_scan as "seq scans",
       s.seq_tup_read as "rows read by them",
       coalesce(s.idx_scan, 0) as "index scans",
       s.n_live_tup as "live rows",
       pg_catalog.pg_size_pretty(pg_catalog.pg_table_size(s.relid)) as size
from pg_catalog.pg_stat_user_tables s
where s.seq_scan > 0
order by s.seq_tup_read desc
limit 100;

-- @open its indexes
-- @on table
select i.indexrelname as index,
       i.idx_scan as "used",
       pg_catalog.pg_size_pretty(pg_catalog.pg_relation_size(i.indexrelid)) as size
from pg_catalog.pg_stat_user_indexes i
where i.schemaname = $schema and i.relname = $table
order by i.idx_scan desc;
