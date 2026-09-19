-- @description A health check of this database as a checklist: each finding with a severity and what to do
-- @face result
-- @color green
-- Every check reads statistics and catalogs only. The thresholds are
-- written next to each check; the README lists them.
with checks (no, name, advice) as (
    values (1, 'transaction wraparound', 'VACUUM (FREEZE) the oldest tables, or find what keeps autovacuum from freezing them: long transactions, abandoned replication slots, prepared transactions.'),
           (2, 'integer overflow', 'Move the column to bigint (ALTER TABLE ... ALTER COLUMN ... TYPE bigint) and the sequence too (ALTER SEQUENCE ... AS bigint). Integer overflow risk lists every key in detail.'),
           (3, 'invalid indexes', 'DROP INDEX CONCURRENTLY the invalid index and create it again; it is maintained on every write but never used.'),
           (4, 'long transactions', 'End or fix the session holding it open: it keeps vacuum from cleaning up and may hold locks.'),
           (5, 'idle in transaction', 'Commit or roll back in the application, or set idle_in_transaction_session_timeout.'),
           (6, 'replication slots', 'Drop the slot if nothing will consume it again (pg_drop_replication_slot); an inactive slot keeps WAL and old row versions forever.'),
           (7, 'connections', 'Use a connection pooler, or raise max_connections with care: every connection costs memory.'),
           (8, 'cache hit ratio', 'Raise shared_buffers if the server has memory to spare, or look at the queries that read the most (Top queries).'),
           (9, 'primary keys', 'Add a primary key: logical replication, row editing and most tools need one to tell rows apart.'),
           (10, 'foreign keys without an index', 'CREATE INDEX CONCURRENTLY on the referencing columns: deletes and updates of the referenced table scan this one otherwise.'),
           (11, 'dead rows', 'VACUUM the table, then check why autovacuum falls behind (its thresholds for big tables, long transactions).'),
           (12, 'stale statistics', 'ANALYZE the table; the planner guesses its plans from these numbers.'),
           (13, 'unused indexes', 'DROP INDEX CONCURRENTLY an index nothing reads, once you are sure: statistics count since their last reset, and a standby''s reads are not counted here.')
), seq_use as (
    -- A sequence's use against the largest value its column can hold: an
    -- integer column fed by a bigint sequence overflows at the column's
    -- limit, not the sequence's.
    select s.schemaname || '.' || s.sequencename as seq,
           s.last_value,
           coalesce(case col.atttypid when 'pg_catalog.int2'::pg_catalog.regtype then 32767
                                      when 'pg_catalog.int4'::pg_catalog.regtype then 2147483647 end,
                    s.max_value) as top,
           case when col.attname is not null then cn.nspname || '.' || ct.relname || '.' || col.attname end as owner
    from pg_catalog.pg_sequences s
         join pg_catalog.pg_class sc on sc.relname = s.sequencename
         join pg_catalog.pg_namespace sn on sn.oid = sc.relnamespace and sn.nspname = s.schemaname
         left join pg_catalog.pg_depend d on d.objid = sc.oid and d.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
                                         and d.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass and d.deptype in ('a', 'i')
         left join pg_catalog.pg_class ct on ct.oid = d.refobjid
         left join pg_catalog.pg_namespace cn on cn.oid = ct.relnamespace
         left join pg_catalog.pg_attribute col on col.attrelid = d.refobjid and col.attnum = d.refobjsubid
    where s.last_value is not null
      and s.increment_by > 0
), findings (no, severity, object, finding) as (
    -- 1. transaction ID age, against the 2 billion that stop the server
    select 1, case when pg_catalog.age(d.datfrozenxid) > 1500000000 then 'high' else 'medium' end, d.datname::text,
           'oldest unfrozen transaction ID is ' || pg_catalog.age(d.datfrozenxid) || ' old, '
             || pg_catalog.round(100.0 * pg_catalog.age(d.datfrozenxid) / 2147483647) || '% of the way to wraparound'
    from pg_catalog.pg_database d
    where d.datallowconn
      and pg_catalog.age(d.datfrozenxid) > 1000000000
    union all
    select 1, 'low', d.datname::text,
           'oldest unfrozen transaction ID is ' || pg_catalog.age(d.datfrozenxid) || ' old, past autovacuum_freeze_max_age; autovacuum should be freezing it'
    from pg_catalog.pg_database d
    where d.datallowconn
      and pg_catalog.age(d.datfrozenxid) between pg_catalog.current_setting('autovacuum_freeze_max_age')::bigint * 1.2 and 1000000000
    union all
    -- 2. sequences, and the integer columns they feed, past half their range
    select 2, case when u.last_value >= u.top * 0.75 then 'high' else 'medium' end, coalesce(u.owner, u.seq),
           pg_catalog.round(100.0 * u.last_value / u.top, 1) || '% used: at ' || u.last_value || ' of ' || u.top
             || case when u.owner is not null then ' (sequence ' || u.seq || ')' else '' end
    from seq_use u
    where u.last_value >= u.top * 0.5
    union all
    -- 3. indexes left invalid, typically by a failed CREATE INDEX CONCURRENTLY
    select 3, 'high', n.nspname || '.' || c.relname, 'invalid index on ' || t.relname
    from pg_catalog.pg_index i
         join pg_catalog.pg_class c on c.oid = i.indexrelid
         join pg_catalog.pg_class t on t.oid = i.indrelid
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where not i.indisvalid
    union all
    -- 4. transactions open for more than an hour (5 minutes is idle's own check)
    select 4, case when pg_catalog.now() - a.xact_start > interval '6 hours' then 'high' else 'medium' end,
           'pid ' || a.pid,
           pg_catalog.concat_ws(' ', a.usename, coalesce(nullif(a.application_name, ''), a.client_addr::text))
             || ', transaction open for ' || pg_catalog.date_trunc('minute', pg_catalog.now() - a.xact_start)
             || coalesce(', ' || a.state, '')
    from pg_catalog.pg_stat_activity a
    where a.xact_start < pg_catalog.now() - interval '1 hour'
      and a.backend_type = 'client backend'
      and a.pid <> pg_catalog.pg_backend_pid()
    union all
    -- 5. sessions sitting in an open transaction doing nothing
    select 5, case when pg_catalog.now() - a.state_change > interval '1 hour' then 'high' else 'medium' end,
           'pid ' || a.pid,
           pg_catalog.concat_ws(' ', a.usename, coalesce(nullif(a.application_name, ''), a.client_addr::text))
             || ', idle in transaction for ' || pg_catalog.date_trunc('second', pg_catalog.now() - a.state_change)
    from pg_catalog.pg_stat_activity a
    where a.state in ('idle in transaction', 'idle in transaction (aborted)')
      and a.state_change < pg_catalog.now() - interval '5 minutes'
    union all
    -- 6. replication slots nothing reads
    select 6, 'medium', s.slot_name::text,
           s.slot_type || ' slot, inactive'
             || coalesce(', keeping ' || pg_catalog.pg_size_pretty(pg_catalog.pg_wal_lsn_diff(
                    case when pg_catalog.pg_is_in_recovery() then pg_catalog.pg_last_wal_replay_lsn() else pg_catalog.pg_current_wal_lsn() end,
                    s.restart_lsn)) || ' of WAL', '')
    from pg_catalog.pg_replication_slots s
    where not s.active
    union all
    -- 7. connections against max_connections
    select 7, case when x.used >= 0.9 * x.max then 'high' else 'medium' end, '',
           x.used || ' of ' || x.max || ' connections in use (' || pg_catalog.round(100.0 * x.used / x.max) || '%)'
    from (select pg_catalog.count(*) as used, pg_catalog.current_setting('max_connections')::int as max
          from pg_catalog.pg_stat_activity
          where backend_type = 'client backend') x
    where x.used >= 0.8 * x.max
    union all
    -- 8. this database's buffer cache hit ratio, once it has read enough to say
    select 8, case when x.ratio < 0.9 then 'medium' else 'low' end, pg_catalog.current_database()::text,
           pg_catalog.round(100 * x.ratio, 2) || '% of block reads came from the cache'
    from (select d.blks_hit::numeric / nullif(d.blks_hit + d.blks_read, 0) as ratio, d.blks_hit + d.blks_read as total
          from pg_catalog.pg_stat_database d
          where d.datname = pg_catalog.current_database()) x
    where x.total > 100000
      and x.ratio < 0.99
    union all
    -- 9. user tables with no primary key (partitions inherit their parent's)
    select 9, case when c.reltuples > 10000 then 'medium' else 'low' end, n.nspname || '.' || c.relname,
           'no primary key' || case when c.reltuples > 0 then ', about ' || c.reltuples::bigint || ' rows' else '' end
    from pg_catalog.pg_class c
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and not c.relispartition
      and n.nspname not in ('pg_catalog', 'information_schema')
      and n.nspname !~ '^pg_'
      and not exists (select 1 from pg_catalog.pg_extension e
                      join pg_catalog.pg_depend dep on dep.refobjid = e.oid and dep.objid = c.oid and dep.deptype = 'e')
      and not exists (select 1 from pg_catalog.pg_index i where i.indrelid = c.oid and i.indisprimary)
    union all
    -- 10. foreign keys whose referencing columns no index leads with
    select 10, case when c.reltuples > 10000 then 'medium' else 'low' end, n.nspname || '.' || c.relname,
           'foreign key ' || k.conname || ' (' ||
             (select pg_catalog.string_agg(a.attname, ', ' order by u.ord)
              from pg_catalog.unnest(k.conkey) with ordinality u(attnum, ord)
                   join pg_catalog.pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.attnum) || ') has no index'
    from pg_catalog.pg_constraint k
         join pg_catalog.pg_class c on c.oid = k.conrelid
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where k.contype = 'f'
      and not c.relispartition
      and not exists (select 1 from pg_catalog.pg_index i
                      where i.indrelid = k.conrelid
                        and (i.indkey::int2[])[0:pg_catalog.array_length(k.conkey, 1) - 1] operator(pg_catalog.@>) k.conkey
                        and (i.indkey::int2[])[0:pg_catalog.array_length(k.conkey, 1) - 1] operator(pg_catalog.<@) k.conkey)
    union all
    -- 11. tables carrying many dead rows
    select 11, case when s.n_dead_tup > s.n_live_tup then 'high' else 'medium' end, s.schemaname || '.' || s.relname,
           s.n_dead_tup || ' dead rows against ' || s.n_live_tup || ' live ('
             || pg_catalog.round(100.0 * s.n_dead_tup / (s.n_live_tup + s.n_dead_tup)) || '%), last vacuumed '
             || coalesce(pg_catalog.date_trunc('second', greatest(s.last_vacuum, s.last_autovacuum))::text, 'never')
    from pg_catalog.pg_stat_user_tables s
    where s.n_dead_tup > 10000
      and s.n_dead_tup > 0.2 * (s.n_live_tup + s.n_dead_tup)
    union all
    -- 12. statistics the planner works from that are missing or old
    select 12, 'low', s.schemaname || '.' || s.relname,
           case when s.last_analyze is null and s.last_autoanalyze is null
                then 'never analyzed, about ' || s.n_live_tup || ' rows'
                else s.n_mod_since_analyze || ' rows changed since the last analyze, of ' || s.n_live_tup end
    from pg_catalog.pg_stat_user_tables s
    where s.n_live_tup > 10000
      and ((s.last_analyze is null and s.last_autoanalyze is null)
           or s.n_mod_since_analyze > 0.2 * s.n_live_tup)
    union all
    -- 13. indexes never read since the statistics were reset, 1 MB and up
    select 13, case when pg_catalog.pg_relation_size(s.indexrelid) >= 100 * 1024 * 1024 then 'medium' else 'low' end,
           s.schemaname || '.' || s.indexrelname,
           'never read, ' || pg_catalog.pg_size_pretty(pg_catalog.pg_relation_size(s.indexrelid)) || ' on ' || s.relname
    from pg_catalog.pg_stat_user_indexes s
         join pg_catalog.pg_index i on i.indexrelid = s.indexrelid
    where s.idx_scan = 0
      and not i.indisunique
      and not i.indisprimary
      and not exists (select 1 from pg_catalog.pg_constraint k where k.conindid = s.indexrelid)
      and pg_catalog.pg_relation_size(s.indexrelid) >= 1024 * 1024
), result as (
    select f.severity, ch.no, ch.name, f.object, f.finding, ch.advice
    from findings f
         join checks ch on ch.no = f.no
    union all
    select 'ok', ch.no, ch.name, '', 'nothing found', ''
    from checks ch
    where not exists (select 1 from findings f where f.no = ch.no)
)
select r.severity,
       r.name as "check",
       r.object,
       r.finding,
       r.advice as "what to do"
from result r
order by pg_catalog.array_position(array['high', 'medium', 'low', 'info', 'ok'], r.severity), r.no, r.object;
