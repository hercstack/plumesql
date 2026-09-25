-- @description What every backend on this database is doing
-- @face result
-- @color blue
-- @refresh 3s
-- @toolbar <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> Activity

-- @extension activity-chart as Chart
select pid,
       coalesce(usename, '') as "user",
       coalesce(state, '') as state,
       coalesce(pg_catalog.date_trunc('second', pg_catalog.clock_timestamp() - query_start)::text, '') as elapsed,
       coalesce(wait_event_type, '') as waiting,
       coalesce(query, '') as query
from pg_catalog.pg_stat_activity
where datname = pg_catalog.current_database()
  and pid <> pg_catalog.pg_backend_pid()
order by state = 'active' desc, query_start;

-- @open locks
-- @on pid
select l.locktype as "lock",
       coalesce(c.relname, '') as relation,
       l.mode,
       l.granted,
       coalesce(l.transactionid::text, '') as "transaction"
from pg_catalog.pg_locks l
     left join pg_catalog.pg_class c on c.oid = l.relation
where l.pid = $pid
order by l.granted, l.locktype;

-- @button cancel query
-- @confirm Cancel the running query on backend $pid?
select pg_catalog.pg_cancel_backend($pid);

-- @button terminate
-- @confirm Terminate backend $pid? Any transaction it holds is rolled back.
-- @at end
select pg_catalog.pg_terminate_backend($pid);
