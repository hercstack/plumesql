-- @description I/O by backend type, object and context from pg_stat_io: reads, writes, hits and the time they took
-- @face result
-- pg_stat_io reports bytes as op_bytes per operation on PostgreSQL 16
-- and 17 and as read_bytes, write_bytes and extend_bytes from 18: the
-- row is read as JSON so one query answers on both shapes.
with io as (
    select s.backend_type,
           s.object,
           s.context,
           coalesce(s.reads, 0) as reads,
           coalesce(s.writes, 0) as writes,
           coalesce(s.extends, 0) as extends,
           coalesce(s.hits, 0) as hits,
           coalesce(s.evictions, 0) as evictions,
           coalesce(s.reuses, 0) as reuses,
           coalesce(s.writebacks, 0) as writebacks,
           coalesce(s.fsyncs, 0) as fsyncs,
           coalesce(s.read_time, 0) as read_time,
           coalesce(s.write_time, 0) as write_time,
           coalesce(s.fsync_time, 0) as fsync_time,
           coalesce((pg_catalog.to_jsonb(s) ->> 'read_bytes')::numeric,
                    s.reads * (pg_catalog.to_jsonb(s) ->> 'op_bytes')::numeric) as read_bytes,
           coalesce((pg_catalog.to_jsonb(s) ->> 'write_bytes')::numeric,
                    s.writes * (pg_catalog.to_jsonb(s) ->> 'op_bytes')::numeric) as write_bytes,
           s.stats_reset
    from pg_catalog.pg_stat_io s
)
select io.backend_type as "backend type",
       io.object,
       io.context,
       io.reads,
       pg_catalog.pg_size_pretty(io.read_bytes) as "read",
       pg_catalog.round(io.read_time::numeric, 1) as "read ms",
       io.hits,
       case when io.hits + io.reads > 0
            then pg_catalog.round(100.0 * io.hits / (io.hits + io.reads), 2)
       end as "hit %",
       io.writes,
       pg_catalog.pg_size_pretty(io.write_bytes) as "written",
       pg_catalog.round(io.write_time::numeric, 1) as "write ms",
       io.extends,
       io.evictions,
       io.reuses,
       io.writebacks,
       io.fsyncs,
       pg_catalog.round(io.fsync_time::numeric, 1) as "fsync ms",
       coalesce(pg_catalog.to_char(io.stats_reset, 'YYYY-MM-DD HH24:MI:SS'), '') as "since"
from io
where io.reads + io.writes + io.extends + io.hits + io.evictions + io.reuses + io.writebacks + io.fsyncs > 0
order by io.read_time + io.write_time + io.fsync_time desc, io.reads + io.writes desc;
