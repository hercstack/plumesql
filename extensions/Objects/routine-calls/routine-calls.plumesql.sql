-- @description Calls and time of the routine this was opened on, every overload of its name
-- @for routine
-- @face result
select p.oid::regprocedure::text as routine,
       l.lanname as language,
       case p.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end as volatility,
       case when p.prosecdef then 'definer' else 'invoker' end as security,
       s.calls,
       round(s.total_time::numeric, 2) as total_ms,
       round(s.self_time::numeric, 2) as self_ms
from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     join pg_catalog.pg_language l on l.oid = p.prolang
     left join pg_catalog.pg_stat_user_functions s on s.funcid = p.oid
where n.nspname = {schema} and p.proname = {name}
order by p.oid;
