-- @description Where a value appears in the data: every text column of every table that holds it, with a count and a sample
-- @face result
-- @color lavender
-- @var term "Search for"
-- @var in_schema "Schema (* for every schema)", "*"
-- @pick in_schema select '*' as in_schema, 'every schema you can read' as holds union all select n.nspname::text, pg_catalog.count(c.oid)::text || ' tables' from pg_catalog.pg_namespace n left join pg_catalog.pg_class c on c.relnamespace = n.oid and c.relkind in ('r', 'p', 'm') where n.nspname !~ '^pg_' and n.nspname <> 'information_schema' group by n.nspname order by 1
-- @var mode "Match", "contains"
-- @pick mode select v.mode, v.means from (values ('contains', 'the value holds the term anywhere'), ('starts with', 'the value begins with the term'), ('exact', 'the whole value is the term')) as v(mode, means)
-- @var max_rows "Count up to (rows per column)", "1000"
-- @var max_mb "Skip tables larger than (MB)", "1024"
-- @hide pattern, cap, numeric, number
-- Every column is searched by its own statement, run through query_to_xml,
-- so the search stays one read-only SELECT with nothing created. The term
-- reaches those statements only through format()'s %L, quoted by the
-- server; table and column names only through %I. Matching ignores case
-- and treats % and _ in the term as plain characters; a number column is
-- compared as a number, so 42 does not find 142.
with params as (
    select {term}::text as term,
           nullif(pg_catalog.btrim({in_schema}::text), '*') as only_schema,
           pg_catalog.lower(pg_catalog.btrim({mode}::text)) as mode,
           greatest(coalesce(nullif(pg_catalog.btrim({max_rows}::text), '')::int, 1000), 1) as cap,
           greatest(coalesce(nullif(pg_catalog.btrim({max_mb}::text), '')::bigint, 1024), 0) as max_mb
), pat as (
    select p.*,
           case p.mode when 'exact' then x.e
                       when 'starts with' then x.e || '%'
                       else '%' || x.e || '%' end as pattern,
           p.term ~ '^\s*[-+]?[0-9]+([.][0-9]+)?\s*$' as numeric_term
    from params p,
         lateral (select pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(p.term, '\', '\\'), '%', '\%'), '_', '\_') as e) as x
), cols as (
    select n.nspname::text as schema, c.relname::text as "table", a.attname::text as "column",
           pg_catalog.format_type(a.atttypid, a.atttypmod) as type, s.bytes,
           t.typname in ('int2', 'int4', 'int8', 'numeric', 'float4', 'float8') as numeric,
           s.bytes > pat.max_mb * 1024 * 1024 as big
    from pat
         join pg_catalog.pg_class c on c.relkind in ('r', 'p', 'm') and not c.relispartition
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
         join pg_catalog.pg_type t on t.oid = a.atttypid
         -- a partitioned table holds nothing itself: its size is its partitions'
         cross join lateral (
             select case when c.relkind = 'p'
                         then (select coalesce(sum(pg_catalog.pg_relation_size(pt.relid)), 0)::bigint
                                 from pg_catalog.pg_partition_tree(c.oid) pt)
                         else pg_catalog.pg_relation_size(c.oid) end as bytes
         ) as s
    where pat.term <> ''
      and n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
      and (pat.only_schema is null or n.nspname = pat.only_schema)
      and pg_catalog.has_column_privilege(c.oid, a.attnum, 'select')
      and (t.typcategory in ('S', 'E')
           or t.typname in ('uuid', 'json', 'jsonb')
           or (pat.numeric_term and t.typname in ('int2', 'int4', 'int8', 'numeric', 'float4', 'float8')))
), hits as (
    select k.schema, k."table", k."column", k.type, k.numeric, w.predicate, x.n, x.sample
    from cols k
         cross join pat
         cross join lateral (
             select case when k.numeric
                         then pg_catalog.format('%I::numeric = %L::numeric', k."column", pg_catalog.btrim(pat.term))
                         else pg_catalog.format('%I::text ilike %L', k."column", pat.pattern) end as predicate
         ) as w
         cross join lateral xmltable('/table/row'
             -- never run for a table above the limit
             passing case when not k.big then pg_catalog.query_to_xml(
                 pg_catalog.format('select pg_catalog.count(*) as n, pg_catalog.min(s.v) as sample
                                      from (select pg_catalog.left(%I::text, 200) as v
                                              from %I.%I
                                             where %s
                                             limit %s) as s',
                                   k."column", k.schema, k."table", w.predicate, pat.cap),
                 false, false, '') end
             columns n bigint path 'n', sample text path 'sample') as x
    where not k.big
)
select h.schema, h."table", h."column", h.type,
       h.n as matches,
       case when h.n >= pat.cap then 'counted up to ' || pat.cap else '' end as note,
       coalesce(h.sample, '') as sample,
       pg_catalog.format('select * from %I.%I where %s;', h.schema, h."table", h.predicate) as query,
       pat.pattern, pat.cap, h.numeric,
       case when pat.numeric_term then pg_catalog.btrim(pat.term) end as number
from hits h cross join pat
where h.n > 0
union all
select distinct k.schema, k."table", '', '', null::bigint,
       'not searched: ' || pg_catalog.pg_size_pretty(k.bytes) || ', above the size limit',
       '', '', pat.pattern, pat.cap, false, null
from cols k cross join pat
where k.big
order by 5 desc nulls last, 1, 2, 3;

-- The rows of that table whose column holds the term (equals it, for a
-- number column), as many as were counted.
-- @open matching rows
-- @on matches
-- @inline schema identifier
-- @inline table identifier
-- @inline column identifier
select * from $schema.$table
where case when $numeric then $column::text::numeric = $number::numeric
           else $column::text ilike $pattern end
limit $cap;
