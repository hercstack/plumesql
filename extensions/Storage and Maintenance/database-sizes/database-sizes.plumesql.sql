-- @description Every database on this server by size, with its backends now
-- @face result
-- @toolbar right-below <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> Database sizes
select d.datname as database,
       case when pg_catalog.has_database_privilege(d.oid, 'CONNECT')
            then pg_catalog.pg_size_pretty(pg_catalog.pg_database_size(d.oid)) else '' end as size,
       coalesce(s.numbackends, 0) as backends,
       pg_catalog.pg_get_userbyid(d.datdba) as owner,
       case when d.datistemplate then 'yes' else '' end as template
from pg_catalog.pg_database d
     left join pg_catalog.pg_stat_database s on s.datid = d.oid
order by case when pg_catalog.has_database_privilege(d.oid, 'CONNECT')
              then pg_catalog.pg_database_size(d.oid) else 0 end desc;
