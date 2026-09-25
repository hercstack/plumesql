-- @description Nodes of the Citus cluster: the coordinator and every worker, their group, role, whether active and whether they hold shards
-- @face result
select n.nodeid as id,
       n.nodename || ':' || n.nodeport as node,
       n.groupid as "group",
       n.noderole as role,
       n.nodecluster as cluster,
       n.isactive as active,
       n.shouldhaveshards as "holds shards",
       n.hasmetadata as "has metadata",
       n.metadatasynced as "metadata synced"
  from pg_catalog.pg_dist_node n
 order by n.groupid, n.nodeid;
