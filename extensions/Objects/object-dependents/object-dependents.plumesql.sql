-- @description What depends on the object this was opened on: views, foreign keys, functions, triggers, and what a DROP would do
-- @for table, view, materialized view
-- @face result
-- @color amber
with target as (
    select c.oid
    from pg_catalog.pg_class c
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = {schema} and c.relname = {name}
),
deps as (
    -- Everything pg_depend records on the object; a view or a materialized
    -- view depends through its rewrite rule, so the rule stands for it.
    select distinct
           case when d.classid = 'pg_catalog.pg_rewrite'::pg_catalog.regclass then 'pg_catalog.pg_class'::pg_catalog.regclass else d.classid end as classid,
           case when d.classid = 'pg_catalog.pg_rewrite'::pg_catalog.regclass then rw.ev_class else d.objid end as objid,
           case when d.classid = 'pg_catalog.pg_rewrite'::pg_catalog.regclass then 0 else d.objsubid end as objsubid,
           d.deptype
    from pg_catalog.pg_depend d
         join target t on d.refobjid = t.oid
         left join pg_catalog.pg_rewrite rw on d.classid = 'pg_catalog.pg_rewrite'::pg_catalog.regclass and rw.oid = d.objid
    where d.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
      and d.deptype in ('n', 'a')
      and not (d.classid = 'pg_catalog.pg_rewrite'::pg_catalog.regclass and rw.ev_class = t.oid)
      and not (d.classid = 'pg_catalog.pg_type'::pg_catalog.regclass)
)
select o.type as kind,
       o.identity as object,
       case dp.deptype when 'n' then 'normal' else 'automatic' end as dependency,
       case dp.deptype
            when 'n' then 'DROP refuses; DROP ... CASCADE drops it too'
            else 'dropped with it' end as on_drop
from deps dp
     cross join lateral pg_catalog.pg_identify_object(dp.classid, dp.objid, dp.objsubid) o
where o.identity is not null
order by dp.deptype desc, o.type, o.identity;
