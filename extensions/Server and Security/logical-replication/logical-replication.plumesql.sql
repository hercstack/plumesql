-- @description Logical replication on this database: publications with the tables they publish, and subscriptions with their state
-- @face result
-- @color cyan
-- @refresh 10s
select v.kind, v.name, v.detail, v.state
from (
  select * from (
    select 1 as ord,
           'publication' as kind,
           p.pubname::text as name,
           case when p.puballtables then 'all tables'
                else (select pg_catalog.count(*) || case when pg_catalog.count(*) = 1 then ' table' else ' tables' end
                      from pg_catalog.pg_publication_tables t where t.pubname = p.pubname)
           end || ', publishes ' ||
           pg_catalog.concat_ws(', ', case when p.pubinsert then 'insert' end, case when p.pubupdate then 'update' end,
                                      case when p.pubdelete then 'delete' end, case when p.pubtruncate then 'truncate' end) as detail,
           case when p.pubviaroot then 'as the partition root' else '' end as state
    from pg_catalog.pg_publication p
    union all
    select 2,
           'published table',
           t.pubname || ': ' || t.schemaname || '.' || t.tablename,
           -- A partitioned table holds nothing itself: its size is its partitions'.
           coalesce((select pg_catalog.pg_size_pretty(coalesce(
                               (select pg_catalog.sum(pg_catalog.pg_total_relation_size(pt.relid)) from pg_catalog.pg_partition_tree(c.oid) pt),
                               pg_catalog.pg_total_relation_size(c.oid)))
                     from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = t.schemaname and c.relname = t.tablename), ''),
           case when exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                             where n.nspname = t.schemaname and c.relname = t.tablename and c.relreplident = 'n')
                then 'REPLICA IDENTITY NOTHING: updates and deletes fail' else '' end
    from pg_catalog.pg_publication_tables t
    union all
    select 3,
           'subscription',
           s.subname::text,
           'to ' || pg_catalog.array_to_string(s.subpublications, ', ') || ', slot ' || coalesce(s.subslotname::text, 'none'),
           case when not s.subenabled then 'DISABLED'
                when st.pid is null then 'not running'
                else 'running, last message ' ||
                     coalesce(pg_catalog.round(extract(epoch from pg_catalog.now() - st.last_msg_receipt_time)::numeric, 1) || ' s ago', 'not yet')
           end
    from pg_catalog.pg_subscription s
         left join pg_catalog.pg_stat_subscription st on st.subid = s.oid and st.relid is null
    where s.subdbid = (select d.oid from pg_catalog.pg_database d where d.datname = pg_catalog.current_database())
    union all
    select 9, '', 'No logical replication here: this database has no publication and no subscription.', '', ''
    where not exists (select 1 from pg_catalog.pg_publication)
      and not exists (select 1 from pg_catalog.pg_subscription s
                      where s.subdbid = (select d.oid from pg_catalog.pg_database d where d.datname = pg_catalog.current_database()))
  ) u
) v
order by v.ord, v.name;
