-- @description Tables by size, and the indexes of any one of them
-- @face result
-- @toolbar right-below <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> Table sizes
select n.nspname as "schema",
       c.relname as "table",
       pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(c.oid)) as "total",
       pg_catalog.pg_size_pretty(pg_catalog.pg_relation_size(c.oid)) as "heap"
from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and n.nspname not in ('pg_catalog', 'information_schema')
order by pg_catalog.pg_total_relation_size(c.oid) desc;

-- @open indexes
-- @on table
select i.relname as "index",
       pg_catalog.pg_size_pretty(pg_catalog.pg_relation_size(i.oid)) as "size",
       coalesce(s.idx_scan, 0) as "scans",
       pg_catalog.pg_get_indexdef(i.oid) as "definition"
from pg_catalog.pg_index x
     join pg_catalog.pg_class i on i.oid = x.indexrelid
     join pg_catalog.pg_class t on t.oid = x.indrelid
     join pg_catalog.pg_namespace n on n.oid = t.relnamespace
     left join pg_catalog.pg_stat_user_indexes s on s.indexrelid = i.oid
where t.relname = $table
  and n.nspname = $schema
order by pg_catalog.pg_relation_size(i.oid) desc
