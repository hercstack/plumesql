-- @description Shard moves the Citus rebalancer would make now, without making them: which shard from which node to which, and its size
-- @face result
select p.table_name::text as "table",
       p.shardid as shard,
       pg_catalog.pg_size_pretty(p.shard_size) as size,
       p.sourcename || ':' || p.sourceport as "from",
       p.targetname || ':' || p.targetport as "to"
  from get_rebalance_table_shards_plan() p
 order by p.table_name::text, p.shardid;
