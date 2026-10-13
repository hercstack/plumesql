-- @description Every partitioned table as a tree: its key, each partition's bounds, kind, size and rows, the default partitions marked
-- @face result
-- @color green
select r.oid::pg_catalog.regclass::text as partitioned_table,
       pg_catalog.repeat('    ', t.level) || t.relid::pg_catalog.regclass::text as partition,
       t.level,
       case when t.level = 0 then 'PARTITION BY ' || pg_catalog.pg_get_partkeydef(t.relid)
            else pg_catalog.pg_get_expr(c.relpartbound, c.oid) end as bounds,
       case c.relkind when 'p' then 'partitioned' when 'r' then 'table' when 'f' then 'foreign table' else c.relkind::text end as kind,
       pg_catalog.pg_size_pretty(case when c.relkind = 'p' then
           (select pg_catalog.sum(pg_catalog.pg_total_relation_size(s.relid)) from pg_catalog.pg_partition_tree(t.relid) s)
           else pg_catalog.pg_total_relation_size(t.relid) end) as size,
       case when c.relkind = 'p' then
           (select pg_catalog.sum(greatest(x.reltuples, 0)) from pg_catalog.pg_partition_tree(t.relid) s join pg_catalog.pg_class x on x.oid = s.relid where s.isleaf)
           else greatest(c.reltuples, 0) end::bigint as rows_estimate,
       case when pg_catalog.pg_get_expr(c.relpartbound, c.oid) = 'DEFAULT' then 'default: takes the rows no other partition does'
            when t.level > 0 and c.relkind = 'p' then 'partitioned again'
            else '' end as note
from pg_catalog.pg_class r
     join pg_catalog.pg_namespace n on n.oid = r.relnamespace
     cross join lateral pg_catalog.pg_partition_tree(r.oid) t
     join pg_catalog.pg_class c on c.oid = t.relid
where r.relkind = 'p'
  and not r.relispartition
  and n.nspname not in ('pg_catalog', 'information_schema')
-- A partition sorts under its parent: by the chain of names from the root.
order by 1, (select pg_catalog.string_agg(a.rel::pg_catalog.regclass::text, '/' order by a.i desc)
             from pg_catalog.pg_partition_ancestors(t.relid) with ordinality as a(rel, i));
