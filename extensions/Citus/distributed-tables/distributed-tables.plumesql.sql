-- @description Tables Citus manages: distributed by which column into how many shards, reference and local ones, with their sizes and co-location
-- @face result
select t.table_name::text as "table",
       t.citus_table_type as kind,
       t.distribution_column as "distributed by",
       t.shard_count as shards,
       t.colocation_id as "co-location",
       t.table_size as size,
       t.table_owner as owner,
       t.access_method as "access method"
from citus_tables t
order by t.table_name::text;

-- @open shards
-- @on table
select s.shardid as shard,
       s.shard_name as "shard table",
       s.nodename || ':' || s.nodeport as node,
       pg_catalog.pg_size_pretty(s.shard_size) as size
from pg_catalog.citus_shards s
where s.table_name::text = $table
order by s.shardid
