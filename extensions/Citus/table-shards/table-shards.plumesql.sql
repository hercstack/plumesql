-- @description Shards of the table this was opened on: the shard table each one is, the node it lives on and its size, from Citus
-- @for distributed table, reference table
-- @face result
select s.shardid as shard,
       s.shard_name as "shard table",
       s.nodename || ':' || s.nodeport as node,
       pg_catalog.pg_size_pretty(s.shard_size) as size
  from pg_catalog.citus_shards s
 where s.table_name = {object}::regclass
 order by s.shardid;
