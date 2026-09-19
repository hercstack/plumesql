-- @description Client connections grouped by user, application and address, with their states, against max_connections
-- @face result
-- @color cyan
with c as (
    select coalesce(a.usename::text, '') as usr,
           coalesce(a.application_name, '') as app,
           coalesce(pg_catalog.host(a.client_addr), 'local socket') as client,
           a.state,
           a.backend_start
    from pg_catalog.pg_stat_activity a
    where a.backend_type = 'client backend'
), lim as (
    select pg_catalog.current_setting('max_connections')::int as max_conn,
           pg_catalog.current_setting('superuser_reserved_connections')::int as reserved
)
select g.usr as "user",
       g.app as "application",
       g.client,
       g.total as "connections",
       pg_catalog.round(100.0 * g.total / lim.max_conn, 1) as "% of max",
       g.active,
       g.idle,
       g.idle_in_tx as "idle in transaction",
       g.other,
       coalesce(pg_catalog.to_char(g.oldest, 'YYYY-MM-DD HH24:MI:SS'), '') as "oldest connected"
from (
    select c.usr, c.app, c.client,
           pg_catalog.count(*) as total,
           pg_catalog.count(*) filter (where c.state = 'active') as active,
           pg_catalog.count(*) filter (where c.state = 'idle') as idle,
           pg_catalog.count(*) filter (where c.state in ('idle in transaction', 'idle in transaction (aborted)')) as idle_in_tx,
           pg_catalog.count(*) filter (where c.state is null or c.state not in ('active', 'idle', 'idle in transaction', 'idle in transaction (aborted)')) as other,
           pg_catalog.min(c.backend_start) as oldest,
           1 as ord
    from c
    group by c.usr, c.app, c.client
    union all
    select 'all clients', '', pg_catalog.format('max_connections %s, %s reserved for superusers', lim.max_conn, lim.reserved),
           pg_catalog.count(c.*),
           pg_catalog.count(*) filter (where c.state = 'active'),
           pg_catalog.count(*) filter (where c.state = 'idle'),
           pg_catalog.count(*) filter (where c.state in ('idle in transaction', 'idle in transaction (aborted)')),
           pg_catalog.count(*) filter (where c.usr is not null and (c.state is null or c.state not in ('active', 'idle', 'idle in transaction', 'idle in transaction (aborted)'))),
           pg_catalog.min(c.backend_start),
           0
    from lim
         left join c on true
    group by lim.max_conn, lim.reserved
) g
     cross join lim
order by g.ord, g.total desc, g.usr, g.app, g.client;

-- @open sessions
-- @on connections
select a.pid,
       coalesce(a.datname::text, '') as database,
       coalesce(a.state, '') as state,
       coalesce(pg_catalog.to_char(a.backend_start, 'YYYY-MM-DD HH24:MI:SS'), '') as connected,
       coalesce(pg_catalog.date_trunc('second', pg_catalog.clock_timestamp() - a.state_change)::text, '') as "in state",
       coalesce(a.query, '') as "last query"
from pg_catalog.pg_stat_activity a
where a.backend_type = 'client backend'
  and ($user = 'all clients'
       or (coalesce(a.usename::text, '') = $user
           and coalesce(a.application_name, '') = $application
           and coalesce(pg_catalog.host(a.client_addr), 'local socket') = $client))
order by a.backend_start;
