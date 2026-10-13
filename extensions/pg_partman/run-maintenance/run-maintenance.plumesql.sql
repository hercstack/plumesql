-- @description Run pg_partman's maintenance now: create the partitions that are due and apply retention, on every set it maintains
-- @face result
-- @var partman_schema "pg_partman schema", "partman"
-- @inline partman_schema identifier
-- @confirm "Run maintenance", "Run pg_partman's maintenance now? It creates the partitions that are due and drops or detaches the ones past retention, on every partition set the extension maintains, exactly as its scheduled run would."
-- One statement (an action's own command ends at its first semicolon):
-- the maintenance runs in the CTE, and the answer is every set it looked
-- after as it stands now. The partitions are read through
-- pg_partition_tree and pg_identify_object, which see what the run just
-- made inside this same statement; a plain catalog scan (or pg_partman's
-- STABLE show_partitions) would still see the partitions from before it.
-- Each set's partitions are taken in the select list, after the CTE ran;
-- its default partition is not counted.
with maintenance as materialized (
    select {partman_schema}.run_maintenance()
)
select pc.parent_table as "partition set",
       pc.partition_interval as "interval",
       pc.premake as "made ahead",
       coalesce(pc.retention, '') as "retention",
       (select pg_catalog.count(*)
        from pg_catalog.pg_partition_tree(pc.parent_table::pg_catalog.regclass) t
        where t.level = 1 and t.relid::pg_catalog.regclass::text !~ '_default$') as "partitions",
       coalesce((select (pg_catalog.pg_identify_object('pg_catalog.pg_class'::pg_catalog.regclass, t.relid, 0)).identity
                 from pg_catalog.pg_partition_tree(pc.parent_table::pg_catalog.regclass) t
                 where t.level = 1 and t.relid::pg_catalog.regclass::text !~ '_default$'
                 order by pg_catalog.length(t.relid::pg_catalog.regclass::text), t.relid::pg_catalog.regclass::text
                 limit 1), '') as "oldest",
       coalesce((select (pg_catalog.pg_identify_object('pg_catalog.pg_class'::pg_catalog.regclass, t.relid, 0)).identity
                 from pg_catalog.pg_partition_tree(pc.parent_table::pg_catalog.regclass) t
                 where t.level = 1 and t.relid::pg_catalog.regclass::text !~ '_default$'
                 order by pg_catalog.length(t.relid::pg_catalog.regclass::text) desc, t.relid::pg_catalog.regclass::text desc
                 limit 1), '') as "newest"
from maintenance m, {partman_schema}.part_config pc
where pc.automatic_maintenance = 'on'
order by pc.parent_table;
