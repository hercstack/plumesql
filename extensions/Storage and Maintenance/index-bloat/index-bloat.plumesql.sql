-- @description Estimated bloat of every btree index from its statistics: wasted space and its share, the most first
-- @face result
-- The estimate: from pg_stats' average widths and null fractions of the
-- indexed columns (an expression's own statistics for an expression
-- index), the leaf pages the entries would need at the index's
-- fillfactor, against the pages it has. No extension, no scan.
with idx as (
    select ci.relname as index_name,
           ci.reltuples,
           ci.relpages,
           i.indrelid as tbloid,
           i.indexrelid as idxoid,
           coalesce(pg_catalog.substring(pg_catalog.array_to_string(ci.reloptions, ' '), 'fillfactor=([0-9]+)')::smallint, 90) as fillfactor,
           i.indnatts,
           pg_catalog.string_to_array(pg_catalog.textin(pg_catalog.int2vectorout(i.indkey)), ' ')::int[] as indkey
    from pg_catalog.pg_index i
         join pg_catalog.pg_class ci on ci.oid = i.indexrelid
         join pg_catalog.pg_am am on am.oid = ci.relam
    where am.amname = 'btree'
      and ci.relpages > 0
      and ci.reltuples >= 0
), cols as (
    select ct.relname as table_name,
           ct.relnamespace,
           ic.index_name, ic.reltuples, ic.relpages, ic.tbloid, ic.idxoid, ic.fillfactor,
           coalesce(a1.attname, a2.attname) as attname,
           coalesce(a1.atttypid, a2.atttypid) as atttypid,
           case when a1.attnum is null then ic.index_name else ct.relname end as attrelname
    from (select idx.*, pg_catalog.generate_series(1, idx.indnatts) as attpos from idx) ic
         join pg_catalog.pg_class ct on ct.oid = ic.tbloid
         left join pg_catalog.pg_attribute a1 on ic.indkey[ic.attpos] <> 0
                                             and a1.attrelid = ic.tbloid
                                             and a1.attnum = ic.indkey[ic.attpos]
         left join pg_catalog.pg_attribute a2 on ic.indkey[ic.attpos] = 0
                                             and a2.attrelid = ic.idxoid
                                             and a2.attnum = ic.attpos
), stats as (
    select n.nspname as schema_name, c.table_name, c.index_name, c.reltuples, c.relpages, c.idxoid, c.fillfactor,
           pg_catalog.current_setting('block_size')::numeric as bs,
           case when pg_catalog.version() ~ 'mingw32|64-bit|x86_64|ppc64|ia64|amd64|aarch64' then 8 else 4 end as maxalign,
           24 as pagehdr,
           16 as pageopqdata,
           case when max(coalesce(s.null_frac, 0)) = 0 then 8 else 8 + ((32 + 8 - 1) / 8) end as index_tuple_hdr_bm,
           sum((1 - coalesce(s.null_frac, 0)) * coalesce(s.avg_width, 1024)) as nulldatawidth,
           bool_or(c.atttypid = 'pg_catalog.name'::pg_catalog.regtype) as is_na
    from cols c
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         join pg_catalog.pg_stats s on s.schemaname = n.nspname
                                   and s.tablename = c.attrelname
                                   and s.attname = c.attname
    where n.nspname not in ('information_schema', 'pg_toast')
    group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
), widths as (
    select s.*,
           (s.index_tuple_hdr_bm
              + s.maxalign - case when s.index_tuple_hdr_bm % s.maxalign = 0 then s.maxalign else s.index_tuple_hdr_bm % s.maxalign end
              + s.nulldatawidth
              + s.maxalign - case when s.nulldatawidth = 0 then 0
                                  when s.nulldatawidth::integer % s.maxalign = 0 then s.maxalign
                                  else s.nulldatawidth::integer % s.maxalign end
           )::numeric as nulldatahdrwidth
    from stats s
    where not s.is_na
), est as (
    select w.*,
           coalesce(1 + pg_catalog.ceil(w.reltuples / pg_catalog.floor((w.bs - w.pageopqdata - w.pagehdr) * w.fillfactor / (100 * (4 + w.nulldatahdrwidth)::float))), 0) as est_pages_ff
    from widths w
)
select e.schema_name as "schema",
       e.table_name as "table",
       e.index_name as "index",
       pg_catalog.pg_size_pretty((e.relpages * e.bs)::bigint) as "size",
       pg_catalog.pg_size_pretty(((e.relpages - e.est_pages_ff) * e.bs)::bigint) as "wasted",
       pg_catalog.round((100 * (e.relpages - e.est_pages_ff) / e.relpages)::numeric, 1) as "bloat %",
       e.fillfactor as "fillfactor",
       e.reltuples::bigint as "entries (est.)",
       pg_catalog.pg_get_indexdef(e.idxoid) as "definition"
from est e
where e.relpages > e.est_pages_ff
order by (e.relpages - e.est_pages_ff) * e.bs desc;
