-- @description Every standby this server streams to and every replication slot it holds, with lag and retained WAL
-- @face result
-- @color cyan
-- @toolbar statusbar <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg> Replication
-- @refresh 10s
select v.kind, v.name, v.detail, v.behind, v.client
from (
    select 'standby' as kind,
           coalesce(s.application_name, '') as name,
           coalesce(s.state, '') || coalesce(', sync ' || s.sync_state, '') as detail,
           coalesce(s.replay_lag::text, '') as behind,
           coalesce(s.client_addr::text, '') as client
    from pg_catalog.pg_stat_replication s
    union all
    select 'slot',
           sl.slot_name::text,
           sl.slot_type || case when sl.active then ', active' else ', INACTIVE' end,
           case when pg_catalog.pg_is_in_recovery() or sl.restart_lsn is null then ''
                else pg_catalog.pg_size_pretty(pg_catalog.pg_wal_lsn_diff(pg_catalog.pg_current_wal_lsn(), sl.restart_lsn)) || ' retained'
           end,
           coalesce(sl.database::text, '')
    from pg_catalog.pg_replication_slots sl
) v
union all
select '', 'No replication here: no standby is connected and no slot exists.', '', '', ''
where not exists (select 1 from pg_catalog.pg_stat_replication)
  and not exists (select 1 from pg_catalog.pg_replication_slots)
order by 1, 2;
