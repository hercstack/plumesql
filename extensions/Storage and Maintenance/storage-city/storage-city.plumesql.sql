-- @description Every table as a building: schemas as districts, size as the footprint, dead rows as the height, sequential scans as the colour
-- @face result
-- @extension city-3d as City open
-- @inputs district=schema, name=table, area=total_mb, areaScale=sqrt, height=dead_pct, color=seq_scan_pct, ramp=alarm
select n.nspname as schema,
       c.relname as "table",
       pg_catalog.round(pg_catalog.pg_total_relation_size(c.oid) / 1048576.0, 2) as total_mb,
       pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(c.oid)) as total,
       s.n_live_tup as live_rows,
       s.n_dead_tup as dead_rows,
       pg_catalog.round(100.0 * s.n_dead_tup / nullif(s.n_live_tup + s.n_dead_tup, 0), 1) as dead_pct,
       pg_catalog.round(100.0 * s.seq_scan / nullif(s.seq_scan + coalesce(s.idx_scan, 0), 0), 1) as seq_scan_pct,
       pg_catalog.round((extract(epoch from pg_catalog.now() - greatest(s.last_vacuum, s.last_autovacuum)) / 86400)::numeric, 1) as vacuum_days,
       greatest(s.last_vacuum, s.last_autovacuum) as last_vacuum,
       s.seq_scan,
       s.idx_scan
from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     left join pg_catalog.pg_stat_user_tables s on s.relid = c.oid
where c.relkind in ('r', 'm')
  and n.nspname !~ '^pg_'
  and n.nspname <> 'information_schema'
order by pg_catalog.pg_total_relation_size(c.oid) desc
