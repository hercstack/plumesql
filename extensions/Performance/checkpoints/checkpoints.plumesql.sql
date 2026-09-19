-- @description Checkpoint and background writer statistics: timed against requested, write and sync time, and who writes the buffers
-- @face result
-- PostgreSQL 17 moved the checkpoint counters out of pg_stat_bgwriter
-- into pg_stat_checkpointer, a view older servers do not have. Both are
-- read as JSON: pg_stat_bgwriter directly, pg_stat_checkpointer through
-- query_to_xml only where it exists, so one query answers on 13 to 18.
with src as (
    select pg_catalog.to_jsonb(b) as bg,
           case when pg_catalog.to_regclass('pg_catalog.pg_stat_checkpointer') is not null
                then (select x.j::jsonb
                      from xmltable('/table/row'
                               passing pg_catalog.query_to_xml('select pg_catalog.to_jsonb(c)::text as j from pg_catalog.pg_stat_checkpointer c', false, false, '')
                               columns j text path 'j') as x)
                else pg_catalog.to_jsonb(b)
           end as ck
    from pg_catalog.pg_stat_bgwriter b
), v as (
    select coalesce(ck ->> 'num_timed', ck ->> 'checkpoints_timed')::numeric as timed,
           coalesce(ck ->> 'num_requested', ck ->> 'checkpoints_req')::numeric as requested,
           coalesce(ck ->> 'write_time', ck ->> 'checkpoint_write_time')::numeric as write_ms,
           coalesce(ck ->> 'sync_time', ck ->> 'checkpoint_sync_time')::numeric as sync_ms,
           coalesce(ck ->> 'buffers_written', ck ->> 'buffers_checkpoint')::numeric as by_checkpoint,
           (bg ->> 'buffers_clean')::numeric as by_bgwriter,
           (bg ->> 'buffers_backend')::numeric as by_backend,
           (bg ->> 'maxwritten_clean')::numeric as maxwritten,
           (bg ->> 'buffers_alloc')::numeric as allocated,
           (ck ->> 'stats_reset')::timestamptz as ck_reset,
           (bg ->> 'stats_reset')::timestamptz as bg_reset
    from src
), m (n, metric, value, note) as (
    select 1, 'timed checkpoints', v.timed::text,
           'started by checkpoint_timeout (' || pg_catalog.current_setting('checkpoint_timeout') || ')'
    from v
    union all
    select 2, 'requested checkpoints', v.requested::text,
           'forced: max_wal_size (' || pg_catalog.current_setting('max_wal_size') || ') reached, or CHECKPOINT, a base backup, a restart'
    from v
    union all
    select 3, 'requested share',
           case when v.timed + v.requested > 0 then pg_catalog.round(100 * v.requested / (v.timed + v.requested), 1) || ' %' else '' end,
           case when v.timed + v.requested = 0 then ''
                when v.requested > v.timed then 'most checkpoints are forced; unless it was by hand, raise max_wal_size'
                else 'most checkpoints come on time, as they should'
           end
    from v
    union all
    select 4, 'write time', pg_catalog.round(v.write_ms / 1000, 1) || ' s',
           case when v.timed + v.requested > 0
                then pg_catalog.round(v.write_ms / 1000 / (v.timed + v.requested), 1) || ' s per checkpoint, spread by checkpoint_completion_target ('
                     || pg_catalog.current_setting('checkpoint_completion_target') || ')'
                else ''
           end
    from v
    union all
    select 5, 'sync time', pg_catalog.round(v.sync_ms / 1000, 1) || ' s',
           case when v.timed + v.requested > 0
                then pg_catalog.round(v.sync_ms / 1000 / (v.timed + v.requested), 2) || ' s per checkpoint; long syncs mean the storage cannot absorb the writes'
                else ''
           end
    from v
    union all
    select 6, 'buffers written by checkpoints', v.by_checkpoint::text,
           pg_catalog.pg_size_pretty(v.by_checkpoint * pg_catalog.current_setting('block_size')::numeric)
    from v
    union all
    select 7, 'buffers written by the background writer', v.by_bgwriter::text,
           pg_catalog.pg_size_pretty(v.by_bgwriter * pg_catalog.current_setting('block_size')::numeric)
    from v
    union all
    select 8, 'buffers written by backends', v.by_backend::text,
           pg_catalog.pg_size_pretty(v.by_backend * pg_catalog.current_setting('block_size')::numeric)
             || '; a backend writing its own buffers waits for it'
    from v
    where v.by_backend is not null
    union all
    select 9, 'background writer stopped at its limit', v.maxwritten::text,
           'rounds that hit bgwriter_lru_maxpages (' || pg_catalog.current_setting('bgwriter_lru_maxpages') || '); a steady climb says raise it'
    from v
    union all
    select 10, 'buffers allocated', v.allocated::text,
           pg_catalog.pg_size_pretty(v.allocated * pg_catalog.current_setting('block_size')::numeric)
    from v
    union all
    select 11, 'counting since', coalesce(pg_catalog.to_char(v.ck_reset, 'YYYY-MM-DD HH24:MI:SS'), ''),
           case when v.ck_reset is distinct from v.bg_reset
                then 'the background writer counters since ' || coalesce(pg_catalog.to_char(v.bg_reset, 'YYYY-MM-DD HH24:MI:SS'), '')
                else ''
           end
    from v
)
select m.metric, m.value, m.note
from m
order by m.n;
