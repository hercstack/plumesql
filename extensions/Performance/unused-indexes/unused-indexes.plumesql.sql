-- @description Indexes nothing has read since the statistics were reset
-- @face result
select s.schemaname as "schema",
       s.relname as "table",
       s.indexrelname as "index",
       pg_catalog.pg_size_pretty(pg_catalog.pg_relation_size(s.indexrelid)) as "size",
       s.idx_scan as "scans"
from pg_catalog.pg_stat_user_indexes s
     join pg_catalog.pg_index i on i.indexrelid = s.indexrelid
where s.idx_scan = 0
  and not i.indisunique
  and not i.indisprimary
  and not i.indisreplident
  and not exists (select 1
                  from pg_catalog.pg_constraint con
                  where con.conindid = i.indexrelid)
order by pg_catalog.pg_relation_size(s.indexrelid) desc;

-- @open write traffic
-- @on table
select v.metric, v.count::text as count
from pg_catalog.pg_stat_user_tables s
     cross join lateral (values
       (1, 'rows inserted', s.n_tup_ins),
       (2, 'rows updated', s.n_tup_upd),
       (3, 'of those, HOT (no index write)', s.n_tup_hot_upd),
       (4, 'rows deleted', s.n_tup_del),
       (5, 'sequential scans', s.seq_scan),
       (6, 'index scans', coalesce(s.idx_scan, 0))
     ) as v(n, metric, count)
where s.relname = $table
  and s.schemaname = $schema
order by v.n
