-- @description Backends waiting on a lock, and the backend holding it
-- @face result
-- @color amber
-- @refresh 5s
-- @toolbar <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Locks
select w.pid as waiter,
       coalesce(w.usename, '') as "waiter user",
       coalesce(pg_catalog.date_trunc('second', pg_catalog.clock_timestamp() - w.query_start)::text, '') as "waiting for",
       b.pid as blocker,
       coalesce(b.usename, '') as "blocker user",
       coalesce(b.state, '') as "blocker state",
       coalesce(w.query, '') as "waiting query",
       coalesce(b.query, '') as "blocking query"
from pg_catalog.pg_stat_activity w
     join lateral pg_catalog.unnest(pg_catalog.pg_blocking_pids(w.pid)) as blocker_pid on true
     join pg_catalog.pg_stat_activity b on b.pid = blocker_pid
order by w.query_start;

-- One blocker usually holds up more than the row in view: its pid opens
-- everything waiting behind it, directly or through another waiter (the
-- second session to want a locked row waits on the first one in line, not
-- on the holder), with the pid each one waits on.
-- @open everything it blocks
-- @on blocker
with recursive waits as materialized (
    select a.pid, b.blocker
    from pg_catalog.pg_stat_activity a
         cross join lateral pg_catalog.unnest(pg_catalog.pg_blocking_pids(a.pid)) as b(blocker)
    where a.wait_event_type = 'Lock'
), tree (pid, waits_on, depth) as (
    select w.pid, w.blocker, 1
    from waits w
    where w.blocker = $blocker
    union
    select w.pid, w.blocker, t.depth + 1
    from tree t
         join waits w on w.blocker = t.pid
    where t.depth < 50
), firsts as (
    select distinct on (t.pid) t.pid, t.waits_on, t.depth
    from tree t
    order by t.pid, t.depth, t.waits_on
)
select a.pid as waiter,
       f.waits_on as "waits on",
       coalesce(a.usename, '') as "user",
       coalesce(a.state, '') as state,
       coalesce(pg_catalog.date_trunc('second', pg_catalog.clock_timestamp() - a.query_start)::text, '') as "waiting for",
       coalesce(a.query, '') as query
from firsts f
     join pg_catalog.pg_stat_activity a on a.pid = f.pid
order by f.depth, a.query_start;

-- @button terminate blocker
-- @confirm Terminate backend $blocker? Any transaction it holds is rolled back, which is what releases the lock.
select pg_catalog.pg_terminate_backend($blocker);
