-- @description Backends whose statement has run longer than you say
-- @face result
-- @color amber
-- @toolbar <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Long running
-- @var seconds "Running longer than (seconds)", "30"
-- @refresh 5s
select pid,
       coalesce(usename, '') as "user",
       coalesce(datname, '') as database,
       coalesce(state, '') as state,
       coalesce(pg_catalog.date_trunc('second', pg_catalog.clock_timestamp() - query_start)::text, '') as elapsed,
       coalesce(wait_event_type, '') as waiting,
       coalesce(query, '') as query
from pg_catalog.pg_stat_activity
where state = 'active'
  and pid <> pg_catalog.pg_backend_pid()
  and query_start < pg_catalog.clock_timestamp() - pg_catalog.make_interval(secs => {seconds})
order by query_start;

-- @button cancel
-- @confirm "Cancel the query?", "Cancel the statement running on backend $pid ($user on $database)?"
select pg_catalog.pg_cancel_backend($pid);

-- @button terminate
-- @at end
-- @confirm "Terminate the backend?", "Terminate backend $pid ($user on $database)? Its transaction is rolled back."
select pg_catalog.pg_terminate_backend($pid);
