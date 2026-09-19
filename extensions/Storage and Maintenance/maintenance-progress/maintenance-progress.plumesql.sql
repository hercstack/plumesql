-- @description What VACUUM, ANALYZE, CREATE INDEX and CLUSTER are doing right now, with how far along each is
-- @face result
-- @color green
-- @refresh 3s
with p as (
    select 'VACUUM' as command, v.pid, v.datid, v.datname, v.relid, v.phase,
           case when v.heap_blks_total > 0
                then pg_catalog.round(100.0 * case when v.phase = 'vacuuming heap' then v.heap_blks_vacuumed else v.heap_blks_scanned end / v.heap_blks_total, 1)
           end as pct,
           pg_catalog.format('%s of %s heap blocks scanned, %s vacuumed, %s index passes',
                             v.heap_blks_scanned, v.heap_blks_total, v.heap_blks_vacuumed, v.index_vacuum_count) as detail,
           null::bigint as tuples_scanned
    from pg_catalog.pg_stat_progress_vacuum v
    union all
    select 'ANALYZE', a.pid, a.datid, a.datname, a.relid, a.phase,
           case when a.sample_blks_total > 0
                then pg_catalog.round(100.0 * a.sample_blks_scanned / a.sample_blks_total, 1)
           end,
           pg_catalog.format('%s of %s sample blocks, %s of %s child tables',
                             a.sample_blks_scanned, a.sample_blks_total, a.child_tables_done, a.child_tables_total),
           null
    from pg_catalog.pg_stat_progress_analyze a
    union all
    select c.command, c.pid, c.datid, c.datname, c.relid, c.phase,
           case when c.tuples_total > 0 then pg_catalog.round(100.0 * c.tuples_done / c.tuples_total, 1)
                when c.blocks_total > 0 then pg_catalog.round(100.0 * c.blocks_done / c.blocks_total, 1)
           end,
           pg_catalog.format('%s of %s blocks, %s of %s tuples, %s of %s partitions',
                             c.blocks_done, c.blocks_total, c.tuples_done, c.tuples_total, c.partitions_done, c.partitions_total),
           null
    from pg_catalog.pg_stat_progress_create_index c
    union all
    select k.command, k.pid, k.datid, k.datname, k.relid, k.phase,
           case when k.heap_blks_total > 0 then pg_catalog.round(100.0 * k.heap_blks_scanned / k.heap_blks_total, 1) end,
           case when k.heap_blks_total > 0
                then pg_catalog.format('%s of %s heap blocks, %s tuples scanned, %s written',
                                       k.heap_blks_scanned, k.heap_blks_total, k.heap_tuples_scanned, k.heap_tuples_written)
                else pg_catalog.format('%s tuples scanned, %s written, %s indexes rebuilt',
                                       k.heap_tuples_scanned, k.heap_tuples_written, k.index_rebuild_count)
           end,
           k.heap_tuples_scanned
    from pg_catalog.pg_stat_progress_cluster k
)
select p.pid,
       p.command,
       coalesce(p.datname::text, '') as "database",
       case when c.oid is not null then n.nspname || '.' || c.relname
            when p.relid <> 0 then 'oid ' || p.relid
            else ''
       end as "relation",
       p.phase,
       -- CLUSTER through an index reports tuples, not blocks: against the
       -- table's row estimate, and never 100 before it is done.
       coalesce(p.pct,
                case when p.tuples_scanned is not null and c.reltuples > 0
                     then least(99.9, pg_catalog.round((100 * p.tuples_scanned / c.reltuples)::numeric, 1))
                end) as "done %",
       p.detail,
       coalesce(pg_catalog.date_trunc('second', pg_catalog.clock_timestamp() - a.query_start)::text, '') as "running for",
       case when a.backend_type = 'autovacuum worker' then 'autovacuum' else coalesce(a.usename::text, '') end as "started by",
       coalesce(a.query, '') as query
from p
     left join pg_catalog.pg_stat_activity a on a.pid = p.pid
     left join pg_catalog.pg_class c on c.oid = p.relid
                                    and p.datid = (select d.oid from pg_catalog.pg_database d where d.datname = pg_catalog.current_database())
     left join pg_catalog.pg_namespace n on n.oid = c.relnamespace
order by a.query_start nulls last, p.pid;

-- @button cancel
-- @at end
-- @confirm "Cancel the operation?", "Cancel the $command running on backend $pid? It stops where it is; a cancelled CREATE INDEX CONCURRENTLY leaves an invalid index behind to drop."
select pg_catalog.pg_cancel_backend($pid);
