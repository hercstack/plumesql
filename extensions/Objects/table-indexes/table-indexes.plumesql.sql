-- @description Indexes of the table this was opened on: definition, size, how often each is read, and the ones never read
-- @for table, materialized view
-- @face result
-- @toolbar results <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/></svg> Table indexes
select i.relname as index,
       pg_catalog.pg_get_indexdef(ix.indexrelid) as definition,
       pg_catalog.pg_size_pretty(pg_catalog.pg_relation_size(ix.indexrelid)) as size,
       coalesce(s.idx_scan, 0) as scans,
       coalesce(s.idx_tup_read, 0) as tuples_read,
       coalesce(s.idx_tup_fetch, 0) as tuples_fetched,
       ix.indisprimary as "primary",
       ix.indisunique as "unique",
       ix.indisvalid as valid,
       case when coalesce(s.idx_scan, 0) = 0 and not ix.indisunique and not ix.indisprimary then 'never read' else '' end as note
from pg_catalog.pg_index ix
     join pg_catalog.pg_class i on i.oid = ix.indexrelid
     join pg_catalog.pg_class t on t.oid = ix.indrelid
     join pg_catalog.pg_namespace n on n.oid = t.relnamespace
     left join pg_catalog.pg_stat_all_indexes s on s.indexrelid = ix.indexrelid
where n.nspname = {schema} and t.relname = {name}
order by ix.indisprimary desc, ix.indisunique desc, coalesce(s.idx_scan, 0) desc, i.relname;
