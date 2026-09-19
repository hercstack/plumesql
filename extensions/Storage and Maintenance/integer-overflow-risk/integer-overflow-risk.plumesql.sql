-- @description Integer keys and sequences by how much of their range is used, with the statement that moves them to bigint
-- @face result
-- @color amber
-- @var min_percent "Show from (percent used)", "0"
-- A column fed by a sequence is read through the sequence, which costs
-- nothing. Any other integer key is read with max(column) through
-- query_to_xml, only when an index leads with the column, so the answer
-- comes from the index and never from a table scan.
with cols as (
    select c.oid as relid, n.nspname, c.relname, a.attname, a.attnum, a.atttypid,
           case a.atttypid when 'pg_catalog.int2'::pg_catalog.regtype then 32767 else 2147483647 end as top,
           a.attidentity <> '' as is_identity,
           exists (select 1 from pg_catalog.pg_constraint k
                   where k.conrelid = c.oid and k.contype in ('p', 'f') and a.attnum = any (k.conkey)) as is_key
    from pg_catalog.pg_attribute a
         join pg_catalog.pg_class c on c.oid = a.attrelid
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and not c.relispartition
      and a.attnum > 0
      and not a.attisdropped
      and a.atttypid in ('pg_catalog.int2'::pg_catalog.regtype, 'pg_catalog.int4'::pg_catalog.regtype)
      and n.nspname not in ('pg_catalog', 'information_schema')
      and n.nspname !~ '^pg_'
), owned as (
    -- The sequence a column owns: an identity's (deptype i) or a serial's (a).
    select d.refobjid as relid, d.refobjsubid as attnum, s.schemaname, s.sequencename, s.last_value, s.max_value
    from pg_catalog.pg_depend d
         join pg_catalog.pg_class sc on sc.oid = d.objid and sc.relkind = 'S'
         join pg_catalog.pg_namespace sn on sn.oid = sc.relnamespace
         join pg_catalog.pg_sequences s on s.schemaname = sn.nspname and s.sequencename = sc.relname
    where d.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
      and d.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
      and d.deptype in ('a', 'i')
), columns_read as (
    select c.nspname, c.relname, c.attname, c.atttypid, c.top,
           case when c.is_identity then 'identity' when o.sequencename is not null then 'serial' else 'key' end as fed_by,
           o.schemaname || '.' || o.sequencename as seq,
           coalesce(o.last_value,
                    case when o.sequencename is null
                          and pg_catalog.has_column_privilege(c.relid, c.attnum, 'select')
                          and exists (select 1 from pg_catalog.pg_index i where i.indrelid = c.relid and i.indkey[0] = c.attnum)
                         then (pg_catalog.xpath('/row/m/text()',
                                   pg_catalog.query_to_xml(pg_catalog.format('select pg_catalog.max(%I) as m from %I.%I',
                                                                             c.attname, c.nspname, c.relname),
                                                           false, true, '')))[1]::text::bigint
                    end) as current
    from cols c
         left join owned o on o.relid = c.relid and o.attnum = c.attnum
    where c.is_identity or c.is_key or o.sequencename is not null
), rows_out as (
    select c.nspname || '.' || c.relname || '.' || c.attname as object,
           pg_catalog.format_type(c.atttypid, null) as type,
           c.fed_by,
           c.current,
           c.top as maximum,
           pg_catalog.format('ALTER TABLE %I.%I ALTER COLUMN %I TYPE bigint;', c.nspname, c.relname, c.attname)
             -- An identity's sequence follows its column's type; a serial's does not.
             || case when c.fed_by = 'serial' then ' ALTER SEQUENCE ' || c.seq || ' AS bigint;' else '' end as fix
    from columns_read c
    union all
    -- Sequences no integer column owns: their own type is the limit.
    select s.schemaname || '.' || s.sequencename, pg_catalog.format_type(s.data_type, null), 'sequence',
           s.last_value, s.max_value,
           pg_catalog.format('ALTER SEQUENCE %I.%I AS bigint;', s.schemaname, s.sequencename)
    from pg_catalog.pg_sequences s
    where s.data_type in ('pg_catalog.int2'::pg_catalog.regtype, 'pg_catalog.int4'::pg_catalog.regtype)
      and s.increment_by > 0
      and not exists (select 1 from owned o
                      join cols c on c.relid = o.relid and c.attnum = o.attnum
                      where o.schemaname = s.schemaname and o.sequencename = s.sequencename)
)
select r.object,
       r.type,
       r.fed_by as "fed by",
       r.current,
       r.maximum,
       case when r.current is null then null
            else pg_catalog.round(100.0 * r.current / r.maximum, 2) end as "% used",
       case when r.current is null then null else r.maximum - r.current end as "room left",
       case when r.current is null and r.fed_by = 'key' then 'not read: no index leads with the column'
            when r.current is null then 'not used yet'
            else '' end as note,
       r.fix as "move to bigint"
from rows_out r
where coalesce(100.0 * r.current / r.maximum, 0) >= {min_percent}::numeric
order by 100.0 * r.current / r.maximum desc nulls last, r.object;
