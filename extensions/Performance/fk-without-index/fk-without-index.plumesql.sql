-- @description Foreign keys with no index on their referencing columns, largest table first, with the statement to add one
-- @face result
-- A foreign key is covered when some valid, non-partial index on the
-- referencing table leads with exactly its columns, in any order.
with fk as (
    select con.oid,
           con.conname,
           con.conrelid,
           con.confrelid,
           con.conkey,
           con.confdeltype,
           con.confupdtype,
           pg_catalog.array_length(con.conkey, 1) as nkeys
    from pg_catalog.pg_constraint con
    where con.contype = 'f'
      and con.conparentid = 0
)
select n.nspname as "schema",
       c.relname as "table",
       fk.conname as "foreign key",
       (select pg_catalog.string_agg(a.attname, ', ' order by k.ord)
        from pg_catalog.unnest(fk.conkey) with ordinality as k(attnum, ord)
             join pg_catalog.pg_attribute a on a.attrelid = fk.conrelid and a.attnum = k.attnum) as "columns",
       rn.nspname || '.' || rc.relname as "references",
       case fk.confdeltype when 'a' then 'no action' when 'r' then 'restrict' when 'c' then 'cascade'
                           when 'n' then 'set null' when 'd' then 'set default' end as "on delete",
       pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(c.oid)) as "table size",
       case when c.reltuples >= 0 then c.reltuples::bigint end as "rows (est.)",
       pg_catalog.format('create index%s on %I.%I (%s);',
                         case when c.relkind = 'p' then '' else ' concurrently' end,
                         n.nspname, c.relname,
                         (select pg_catalog.string_agg(pg_catalog.quote_ident(a.attname), ', ' order by k.ord)
                          from pg_catalog.unnest(fk.conkey) with ordinality as k(attnum, ord)
                               join pg_catalog.pg_attribute a on a.attrelid = fk.conrelid and a.attnum = k.attnum)) as "create statement"
from fk
     join pg_catalog.pg_class c on c.oid = fk.conrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     join pg_catalog.pg_class rc on rc.oid = fk.confrelid
     join pg_catalog.pg_namespace rn on rn.oid = rc.relnamespace
where n.nspname not in ('pg_catalog', 'information_schema')
  and not exists (
        select 1
        from pg_catalog.pg_index i
        where i.indrelid = fk.conrelid
          and i.indisvalid
          and i.indpred is null
          and i.indnkeyatts >= fk.nkeys
          and (select pg_catalog.array_agg(i.indkey[k]::smallint)
               from pg_catalog.generate_series(0, fk.nkeys - 1) as k) @> fk.conkey
      )
order by pg_catalog.pg_total_relation_size(c.oid) desc, n.nspname, c.relname, fk.conname;
