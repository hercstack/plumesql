-- @description Tables carrying the most dead rows, and when they were last cleaned
-- @face result
-- @toolbar right-below <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Vacuum candidates
select s.schemaname as "schema",
       s.relname as "table",
       s.n_live_tup as "live",
       s.n_dead_tup as "dead",
       case when s.n_live_tup > 0
            then pg_catalog.round(100.0 * s.n_dead_tup / s.n_live_tup, 1)
            end as "dead %",
       coalesce(pg_catalog.to_char(greatest(s.last_vacuum, s.last_autovacuum), 'YYYY-MM-DD HH24:MI'), 'never') as "last vacuum",
       coalesce(pg_catalog.to_char(greatest(s.last_analyze, s.last_autoanalyze), 'YYYY-MM-DD HH24:MI'), 'never') as "last analyze"
from pg_catalog.pg_stat_user_tables s
where s.n_dead_tup > 0
order by s.n_dead_tup desc;

-- @open who is holding it
-- @on table
select a.pid,
       coalesce(a.usename, '') as "user",
       coalesce(a.state, '') as state,
       coalesce(pg_catalog.age(a.backend_xmin)::text, '') as "snapshot age",
       coalesce(pg_catalog.date_trunc('second', pg_catalog.clock_timestamp() - a.xact_start)::text, '') as "in transaction",
       case when exists (select 1
                         from pg_catalog.pg_locks l
                              join pg_catalog.pg_class c on c.oid = l.relation
                              join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                         where l.pid = a.pid and c.relname = $table and n.nspname = $schema)
            then 'yes' else '' end as "on this table",
       coalesce(a.query, '') as query
from pg_catalog.pg_stat_activity a
where a.datname = pg_catalog.current_database()
  and a.backend_xmin is not null
  and a.pid <> pg_catalog.pg_backend_pid()
order by pg_catalog.age(a.backend_xmin) desc, a.xact_start
