-- @description Partition sets pg_partman maintains: each parent's control column, interval, premake and retention, and the partitions under it
-- @face result
-- @var partman_schema "pg_partman schema", "partman"
-- @inline partman_schema identifier
select c.parent_table as parent,
       c.control,
       c.partition_type as type,
       c.partition_interval as interval,
       c.premake,
       c.retention,
       c.retention_keep_table as "keep on retention",
       c.automatic_maintenance as maintenance,
       c.infinite_time_partitions as infinite,
       c.template_table as template
  from {partman_schema}.part_config c
 order by c.parent_table;

-- @open partitions
-- @on parent
select i.inhrelid::regclass::text as partition,
       pg_catalog.pg_get_expr(c.relpartbound, c.oid) as bounds,
       pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(c.oid)) as size
  from pg_catalog.pg_inherits i
  join pg_catalog.pg_class c on c.oid = i.inhrelid
 where i.inhparent = $parent::regclass
 order by c.relname
