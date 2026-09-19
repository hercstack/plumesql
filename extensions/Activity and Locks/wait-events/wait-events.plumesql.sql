-- @description What the busy backends are waiting on right now, grouped by wait event, with counts and an example query
-- @face result
-- @color amber
-- @refresh 5s
-- Idle sessions waiting for their client and background processes
-- waiting for work (wait type Activity) are left out: they wait by
-- design. An active backend with no wait event is running on the CPU.
with w as (
    select a.pid,
           coalesce(a.wait_event_type, 'CPU') as wait_type,
           coalesce(a.wait_event, 'running') as wait_event,
           a.backend_type,
           a.state,
           a.query,
           coalesce(a.state_change, a.backend_start) as since
    from pg_catalog.pg_stat_activity a
    where a.pid <> pg_catalog.pg_backend_pid()
      and (a.state is null or a.state <> 'idle')
      and a.wait_event_type is distinct from 'Activity'
      and (a.wait_event_type is not null or a.state = 'active')
)
select w.wait_type as "type",
       w.wait_event as "event",
       pg_catalog.count(*) as backends,
       pg_catalog.string_agg(w.pid::text, ', ' order by w.since) as pids,
       pg_catalog.string_agg(distinct w.backend_type, ', ') as "backend types",
       coalesce(pg_catalog.date_trunc('second', pg_catalog.clock_timestamp() - pg_catalog.min(w.since))::text, '') as "longest in state",
       coalesce((pg_catalog.array_agg(w.query order by w.since) filter (where w.query <> ''))[1], '') as "example query"
from w
group by w.wait_type, w.wait_event
order by pg_catalog.count(*) desc, pg_catalog.min(w.since);

-- @open backends
-- @on event
select a.pid,
       coalesce(a.usename::text, '') as "user",
       coalesce(a.datname::text, '') as database,
       a.backend_type as "backend type",
       coalesce(a.state, '') as state,
       coalesce(pg_catalog.date_trunc('second', pg_catalog.clock_timestamp() - coalesce(a.state_change, a.backend_start))::text, '') as "in state",
       coalesce(pg_catalog.array_to_string(pg_catalog.pg_blocking_pids(a.pid), ', '), '') as "blocked by",
       coalesce(a.query, '') as query
from pg_catalog.pg_stat_activity a
where a.pid <> pg_catalog.pg_backend_pid()
  and coalesce(a.wait_event_type, 'CPU') = $type
  and coalesce(a.wait_event, 'running') = $event
  and (a.state is null or a.state <> 'idle')
order by coalesce(a.state_change, a.backend_start);
