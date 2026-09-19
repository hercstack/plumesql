-- @description Estimated bloat of every table from its statistics: wasted space and its share, the most first
-- @face result
-- The estimate: from pg_stats' average column widths and null fractions,
-- the pages the live rows would need at the table's fillfactor, against
-- the pages it has. No extension, no scan; as good as the last ANALYZE.
with t as (
    select tbl.oid as tblid,
           ns.nspname as schema_name,
           tbl.relname as table_name,
           tbl.reltuples,
           tbl.relpages as heappages,
           coalesce(toast.relpages, 0) as toastpages,
           coalesce(toast.reltuples, 0) as toasttuples,
           coalesce(pg_catalog.substring(pg_catalog.array_to_string(tbl.reloptions, ' '), 'fillfactor=([0-9]+)')::smallint, 100) as fillfactor,
           pg_catalog.current_setting('block_size')::numeric as bs,
           case when pg_catalog.version() ~ 'mingw32|64-bit|x86_64|ppc64|ia64|amd64|aarch64' then 8 else 4 end as ma,
           24 as page_hdr,
           23 + case when max(coalesce(s.null_frac, 0)) > 0 then (7 + count(s.attname)) / 8 else 0 end as tpl_hdr_size,
           sum((1 - coalesce(s.null_frac, 0)) * coalesce(s.avg_width, 0)) as tpl_data_size,
           bool_or(att.atttypid = 'pg_catalog.name'::pg_catalog.regtype)
             or sum(case when att.attnum > 0 then 1 else 0 end) <> count(s.attname) as is_na
    from pg_catalog.pg_attribute att
         join pg_catalog.pg_class tbl on tbl.oid = att.attrelid
         join pg_catalog.pg_namespace ns on ns.oid = tbl.relnamespace
         left join pg_catalog.pg_stats s on s.schemaname = ns.nspname
                                        and s.tablename = tbl.relname
                                        and not s.inherited
                                        and s.attname = att.attname
         left join pg_catalog.pg_class toast on toast.oid = tbl.reltoastrelid
    where not att.attisdropped
      and att.attnum > 0
      and tbl.relkind in ('r', 'm')
      and tbl.relpages > 0
      and tbl.reltuples >= 0
      and ns.nspname <> 'information_schema'
    group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
), sized as (
    select t.*,
           (4 + t.tpl_hdr_size + t.tpl_data_size + (2 * t.ma)
              - case when t.tpl_hdr_size % t.ma = 0 then t.ma else t.tpl_hdr_size % t.ma end
              - case when pg_catalog.ceil(t.tpl_data_size)::int % t.ma = 0 then t.ma else pg_catalog.ceil(t.tpl_data_size)::int % t.ma end
           ) as tpl_size
    from t
    where not t.is_na
), est as (
    select z.*,
           z.heappages + z.toastpages as tblpages,
           pg_catalog.ceil(z.reltuples / ((z.bs - z.page_hdr) * z.fillfactor / (z.tpl_size * 100)))
             + pg_catalog.ceil(z.toasttuples / 4) as est_pages_ff
    from sized z
)
select e.schema_name as "schema",
       e.table_name as "table",
       pg_catalog.pg_size_pretty((e.tblpages * e.bs)::bigint) as "size",
       pg_catalog.pg_size_pretty(((e.tblpages - e.est_pages_ff) * e.bs)::bigint) as "wasted",
       pg_catalog.round((100 * (e.tblpages - e.est_pages_ff) / e.tblpages)::numeric, 1) as "bloat %",
       e.fillfactor as "fillfactor",
       e.reltuples::bigint as "rows (est.)",
       coalesce(pg_catalog.to_char(greatest(st.last_vacuum, st.last_autovacuum), 'YYYY-MM-DD HH24:MI'), 'never') as "last vacuum"
from est e
     left join pg_catalog.pg_stat_all_tables st on st.relid = e.tblid
where e.tblpages > e.est_pages_ff
order by (e.tblpages - e.est_pages_ff) * e.bs desc;

-- The inputs of the estimate, one row per column: a wide column the
-- statistics have wrong, or none at all, is where an odd figure comes from.
-- @open columns
-- @on table
select a.attname as "column",
       pg_catalog.format_type(a.atttypid, a.atttypmod) as "type",
       coalesce(s.avg_width::text, 'no statistics') as "avg width",
       coalesce(pg_catalog.round(s.null_frac::numeric * 100, 1)::text, '') as "null %",
       case a.attstorage when 'p' then 'plain' when 'm' then 'main' when 'e' then 'external' when 'x' then 'extended' end as "storage"
from pg_catalog.pg_attribute a
     join pg_catalog.pg_class c on c.oid = a.attrelid
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     left join pg_catalog.pg_stats s on s.schemaname = n.nspname
                                    and s.tablename = c.relname
                                    and s.attname = a.attname
                                    and not s.inherited
where n.nspname = $schema
  and c.relname = $table
  and a.attnum > 0
  and not a.attisdropped
order by a.attnum;
