-- @description Size, rows and maintenance state of the table this was opened on
-- @for table, materialized view
-- @face result
-- @toolbar results <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg> Table details
select pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(c.oid)) as total_size,
       pg_catalog.pg_size_pretty(pg_catalog.pg_relation_size(c.oid)) as heap_size,
       pg_catalog.pg_size_pretty(pg_catalog.pg_indexes_size(c.oid)) as indexes_size,
       c.reltuples::bigint as estimated_rows,
       s.n_live_tup as live_rows,
       s.n_dead_tup as dead_rows,
       s.seq_scan as sequential_scans,
       s.idx_scan as index_scans,
       s.last_vacuum,
       s.last_autovacuum,
       s.last_analyze,
       s.last_autoanalyze
from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     left join pg_catalog.pg_stat_all_tables s on s.relid = c.oid
where n.nspname = {schema} and c.relname = {name};
