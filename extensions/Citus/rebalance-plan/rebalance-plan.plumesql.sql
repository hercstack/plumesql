-- @description Shard moves the Citus rebalancer would make now, without making them: which shard from which node to which, and its size
-- @face result
-- The plan's own shard_size reads 0 on current Citus releases: the size
-- comes from citus_shards, the shard's placement on the node it leaves.
select p.table_name::text as "table",
       p.shardid as shard,
       pg_catalog.pg_size_pretty(coalesce((select s.shard_size
                                             from pg_catalog.citus_shards s
                                            where s.shardid = p.shardid
                                              and s.nodename = p.sourcename
                                              and s.nodeport = p.sourceport), p.shard_size)) as size,
       p.sourcename || ':' || p.sourceport as "from",
       p.targetname || ':' || p.targetport as "to"
  from get_rebalance_table_shards_plan() p
 order by p.table_name::text, p.shardid;
