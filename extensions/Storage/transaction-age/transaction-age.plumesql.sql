-- @description How far each database is from transaction ID wraparound, and the tables aging this one
-- @face result
-- @toolbar statusbar <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20a8 8 0 1 0-8-8"/><path d="M12 12l4-4"/><path d="M4 12h2"/></svg> Wraparound
select d.datname as database,
       pg_catalog.age(d.datfrozenxid) as "xid age",
       pg_catalog.round(100.0 * pg_catalog.age(d.datfrozenxid)
             / pg_catalog.current_setting('autovacuum_freeze_max_age')::bigint, 1) || '%' as "toward forced autovacuum",
       pg_catalog.round(100.0 * pg_catalog.age(d.datfrozenxid) / 2000000000.0, 1) || '%' as "toward wraparound"
from pg_catalog.pg_database d
order by pg_catalog.age(d.datfrozenxid) desc;

-- @open its oldest tables
-- @on database
select n.nspname as "schema",
       c.relname as "table",
       pg_catalog.age(c.relfrozenxid) as "xid age",
       pg_catalog.pg_size_pretty(pg_catalog.pg_table_size(c.oid)) as size
from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p', 'm', 't')
  and c.relfrozenxid <> '0'
  and $database = pg_catalog.current_database()
order by pg_catalog.age(c.relfrozenxid) desc
limit 100;
