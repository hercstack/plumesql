-- @description Backends sitting idle inside an open transaction, oldest first; they hold locks and block vacuum until they finish
-- @face result
-- @color lavender
-- @toolbar <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg> Idle in transaction
-- @refresh 10s
select pid,
       coalesce(usename, '') as "user",
       coalesce(application_name, '') as application,
       coalesce(pg_catalog.date_trunc('second', pg_catalog.clock_timestamp() - xact_start)::text, '') as "in transaction for",
       coalesce(pg_catalog.date_trunc('second', pg_catalog.clock_timestamp() - state_change)::text, '') as "idle for",
       coalesce(query, '') as "last statement"
from pg_catalog.pg_stat_activity
where state in ('idle in transaction', 'idle in transaction (aborted)')
  and pid <> pg_catalog.pg_backend_pid()
order by xact_start;

-- @button terminate
-- @confirm Terminate backend $pid? Its open transaction is rolled back.
select pg_catalog.pg_terminate_backend($pid);
