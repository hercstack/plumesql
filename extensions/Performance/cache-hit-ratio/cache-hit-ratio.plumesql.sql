-- @description Buffer cache hit ratio of every database, then of this database's tables and indexes, lowest first
-- @face result
-- A hit is a block found in shared buffers; a read is one asked of the
-- operating system (its own cache or the disk). Counted since the last
-- statistics reset.
with r as (
    select 1 as ord,
           'database' as kind,
           d.datname::text as name,
           d.blks_hit as hits,
           d.blks_read as reads
    from pg_catalog.pg_stat_database d
    where d.datname is not null
    union all
    select 2, 'table', t.schemaname || '.' || t.relname,
           coalesce(t.heap_blks_hit, 0) + coalesce(t.toast_blks_hit, 0),
           coalesce(t.heap_blks_read, 0) + coalesce(t.toast_blks_read, 0)
    from pg_catalog.pg_statio_user_tables t
    union all
    select 3, 'index', i.schemaname || '.' || i.indexrelname || ' on ' || i.relname,
           coalesce(i.idx_blks_hit, 0),
           coalesce(i.idx_blks_read, 0)
    from pg_catalog.pg_statio_user_indexes i
)
select r.kind,
       r.name,
       case when r.hits + r.reads > 0
            then pg_catalog.round(100.0 * r.hits / (r.hits + r.reads), 2)
       end as "hit %",
       r.hits,
       r.reads,
       pg_catalog.pg_size_pretty(r.reads * pg_catalog.current_setting('block_size')::bigint) as "read from outside"
from r
where r.hits + r.reads > 0
order by r.ord, 100.0 * r.hits / (r.hits + r.reads), r.reads desc;
