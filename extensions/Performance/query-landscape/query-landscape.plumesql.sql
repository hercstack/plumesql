-- @description Every statement on this server in 3D: calls, mean time and cache hit, sized by total time, from pg_stat_statements
-- @face result
-- @extension scatter-3d as Landscape open
-- @inputs x=calls, y=mean_ms, z=cache_pct, size=total_ms, color=kind, label=query, xScale=log, yScale=log
-- pg_stat_statements lives in whichever schema it was created in, which
-- the client cannot know: it is read through the search path on purpose.
select calls,
       pg_catalog.round(mean_exec_time::numeric, 3) as mean_ms,
       pg_catalog.round(total_exec_time::numeric, 1) as total_ms,
       case when shared_blks_hit + shared_blks_read > 0
            then pg_catalog.round(100.0 * shared_blks_hit / (shared_blks_hit + shared_blks_read), 1)
       end as cache_pct,
       pg_catalog.round(rows::numeric / calls, 1) as rows_per_call,
       -- The kind is the statement's first word, read past the comments
       -- and the parentheses in front of it.
       coalesce(pg_catalog.lower(pg_catalog.substring(pg_catalog.regexp_replace(query, '^(\s|--[^\n]*|/\*([^*]|\*+[^*/])*\*+/|\()*', ''), '^[A-Za-z]+')), 'other') as kind,
       query
from pg_stat_statements
where dbid = (select oid from pg_catalog.pg_database where datname = pg_catalog.current_database())
  and calls > 0
order by total_exec_time desc
limit 5000
