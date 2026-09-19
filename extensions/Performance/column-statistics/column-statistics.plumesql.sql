-- @description What the planner knows about each column of the table this was opened on: nulls, distinct values, order, common values
-- @for table, materialized view
-- @face result
-- @toolbar results <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="20" x2="20" y2="20"/><rect x="5" y="11" width="3" height="9"/><rect x="10.5" y="5" width="3" height="15"/><rect x="16" y="14" width="3" height="6"/></svg> Column statistics
select a.attname as "column",
       pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
       pg_catalog.round((st.null_frac * 100)::numeric, 1) as null_pct,
       -- A negative n_distinct is a fraction of the rows, so it grows with the
       -- table; zero means ANALYZE could not tell.
       case when st.n_distinct is null then null
            when st.n_distinct = 0 then 'unknown'
            else pg_catalog.to_char(d.estimate, 'FM999,999,999,999,990')
                 || case when c.reltuples > 0 then ' (' || pg_catalog.round((least(d.estimate / c.reltuples, 1) * 100)::numeric, 1) || '% of rows)' else '' end
       end as "distinct",
       pg_catalog.round(st.correlation::numeric, 3) as correlation,
       st.avg_width,
       mcv.list as most_common,
       h.bounds[1] as histogram_min,
       h.bounds[(pg_catalog.cardinality(h.bounds) + 1) / 2] as histogram_median,
       h.bounds[pg_catalog.cardinality(h.bounds)] as histogram_max,
       greatest(t.last_analyze, t.last_autoanalyze) as analyzed,
       case when st.attname is not null then ''
            when greatest(t.last_analyze, t.last_autoanalyze) is null then 'never analyzed: no statistics yet (ANALYZE collects them)'
            else 'no statistics for this column'
       end as note
from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
     left join pg_catalog.pg_stat_all_tables t on t.relid = c.oid
     -- A partitioned or inheritance parent keeps a row over its whole tree
     -- too; its own rows come first, the tree's when it has only that.
     left join lateral (
         select s.*
         from pg_catalog.pg_stats s
         where s.schemaname = n.nspname and s.tablename = c.relname and s.attname = a.attname
         order by s.inherited
         limit 1
     ) st on true
     left join lateral (
         select case when st.n_distinct >= 0 then st.n_distinct::numeric
                     else (-st.n_distinct * greatest(c.reltuples, 0))::numeric end as estimate
     ) d on true
     -- anyarray has no element type to read it with; its text form parses as text[].
     left join lateral (
         select pg_catalog.string_agg(pg_catalog.left(coalesce(m.v, 'NULL'), 40) || ' ' || pg_catalog.round((m.f * 100)::numeric, 2) || '%', ', ' order by m.o) as list
         from rows from (pg_catalog.unnest(st.most_common_vals::text::text[]), pg_catalog.unnest(st.most_common_freqs)) with ordinality as m(v, f, o)
         where m.o <= 5
     ) mcv on true
     left join lateral (
         select st.histogram_bounds::text::text[] as bounds
     ) h on true
where n.nspname = {schema} and c.relname = {name}
order by a.attnum;
