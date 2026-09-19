-- @description Indexes another index on the same table already covers, with sizes and the statement to drop each
-- @face result
-- Every valid index as its key columns in order, each spelled with its
-- expression, operator class, collation and sort options, beside its
-- INCLUDE columns and its predicate. Two indexes of one table and access
-- method with the same predicate are compared on those.
with ix as (
    select i.indexrelid,
           i.indrelid,
           ci.relam,
           n.nspname as schema_name,
           ct.relname as table_name,
           ci.relname as index_name,
           i.indisunique,
           con.conname,
           con.contype,
           coalesce(pg_catalog.pg_get_expr(i.indpred, i.indrelid, true), '') as predicate,
           i.indnatts > i.indnkeyatts as has_include,
           (select pg_catalog.array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, k, true)
                                        || ' ' || i.indclass[k - 1]::text
                                        || ' ' || i.indcollation[k - 1]::text
                                        || ' ' || i.indoption[k - 1]::text
                                        order by k)
            from pg_catalog.generate_series(1, i.indnkeyatts) k) as keys,
           (select pg_catalog.array_agg(pg_catalog.pg_get_indexdef(i.indexrelid, k, true) order by k)
            from pg_catalog.generate_series(i.indnkeyatts + 1, i.indnatts) k) as include_cols,
           -- What must survive: a constraint's index over a unique one,
           -- a unique one over a plain one, and then the older one.
           case when con.oid is not null then 2 when i.indisunique then 1 else 0 end as strength
    from pg_catalog.pg_index i
         join pg_catalog.pg_class ci on ci.oid = i.indexrelid
         join pg_catalog.pg_class ct on ct.oid = i.indrelid
         join pg_catalog.pg_namespace n on n.oid = ct.relnamespace
         left join pg_catalog.pg_constraint con on con.conindid = i.indexrelid
                                               and con.conrelid = i.indrelid
                                               and con.contype in ('p', 'u', 'x')
    where i.indisvalid
      and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
), pairs as (
    -- The same keys, the same INCLUDE columns: one of the two is enough.
    select r.indexrelid as redundant_oid, k.indexrelid as kept_oid, 1 as how
    from ix r
         join ix k on k.indrelid = r.indrelid
                  and k.relam = r.relam
                  and k.indexrelid <> r.indexrelid
                  and k.predicate = r.predicate
                  and k.keys = r.keys
                  and k.include_cols is not distinct from r.include_cols
    where (k.strength, -k.indexrelid::bigint) > (r.strength, -r.indexrelid::bigint)
    union all
    -- A btree whose keys are a left prefix of another's, or the same keys
    -- where the other adds INCLUDE columns: every search it serves, the
    -- other serves too. Not when it enforces uniqueness or carries
    -- INCLUDE columns of its own.
    select r.indexrelid, k.indexrelid,
           case when pg_catalog.array_length(k.keys, 1) > pg_catalog.array_length(r.keys, 1) then 2 else 3 end
    from ix r
         join ix k on k.indrelid = r.indrelid
                  and k.relam = r.relam
                  and k.indexrelid <> r.indexrelid
                  and k.predicate = r.predicate
                  and k.keys[1:pg_catalog.array_length(r.keys, 1)] = r.keys
                  and (pg_catalog.array_length(k.keys, 1) > pg_catalog.array_length(r.keys, 1) or k.has_include)
         join pg_catalog.pg_am am on am.oid = r.relam
    where am.amname = 'btree'
      and not r.indisunique
      and not r.has_include
      and r.conname is null
), picked as (
    select distinct on (p.redundant_oid) p.redundant_oid, p.kept_oid, p.how
    from pairs p
         join ix k on k.indexrelid = p.kept_oid
    order by p.redundant_oid, p.how, k.strength desc, k.indexrelid
)
select r.schema_name as "schema",
       r.table_name as "table",
       r.index_name as "redundant index",
       pg_catalog.pg_size_pretty(pg_catalog.pg_relation_size(r.indexrelid)) as "size",
       case p.how when 1 then 'duplicate of' when 2 then 'left prefix of' else 'covered by' end as "because it is",
       k.index_name as "covering index",
       pg_catalog.pg_get_indexdef(r.indexrelid) as "redundant definition",
       pg_catalog.pg_get_indexdef(k.indexrelid) as "covering definition",
       case when r.conname is not null
            then pg_catalog.format('alter table %I.%I drop constraint %I;', r.schema_name, r.table_name, r.conname)
            else pg_catalog.format('drop index concurrently %I.%I;', r.schema_name, r.index_name)
       end as "drop statement"
from picked p
     join ix r on r.indexrelid = p.redundant_oid
     join ix k on k.indexrelid = p.kept_oid
order by pg_catalog.pg_relation_size(r.indexrelid) desc, r.schema_name, r.table_name, r.index_name;
