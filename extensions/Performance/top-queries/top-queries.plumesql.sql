-- @description The heaviest statements on this server, from pg_stat_statements
-- @face result
select calls,
       pg_catalog.round(total_exec_time::numeric, 1) as "total ms",
       pg_catalog.round(mean_exec_time::numeric, 2) as "mean ms",
       rows,
       case when shared_blks_hit + shared_blks_read > 0
            then pg_catalog.round(100.0 * shared_blks_hit / (shared_blks_hit + shared_blks_read), 1)
       end as "cache %",
       query
from pg_stat_statements
where dbid = (select oid from pg_catalog.pg_database where datname = pg_catalog.current_database())
order by total_exec_time desc nulls last
limit 50
