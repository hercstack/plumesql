-- @description Set the server up for speed, a view of what it does, a stop to runaway sessions and security; every change on its own button
-- @face result
-- @color teal
-- @var speed "Goal: speed", "true"
-- @help speed Memory, WAL and checkpoints, the planner's costs, the parallel workers and autovacuum, sized from the memory, vCPUs and storage below and from what this server measured: checkpoints forced by WAL, temporary files written.
-- @var insight "Goal: see what the server does", "true"
-- @help insight Loads pg_stat_statements, times every read and write, and has the log name slow statements, lock waits and large temporary files: what Top queries and the other Performance extensions read.
-- @var safety "Goal: stop runaway sessions", "true"
-- @help safety Ends sessions left idle in an open transaction, which hold their locks and keep VACUUM from cleaning up. With an application role named below, that role also gets its own statement and lock timeouts; backups and migrations, which run as other roles, are not limited.
-- @var security "Goal: security", "true"
-- @help security SCRAM instead of MD5 for passwords, encryption once a certificate is in place, connections and schema changes in the log, and the pg_hba.conf lines that let anyone in without a password or with an MD5 one.
-- @var workload "Workload", "oltp"
-- @help workload What most of the work on this server is. It sets PostgreSQL's share of the memory, how much one sort or hash may take, how many connections the server is sized for, how eagerly autovacuum works, whether large queries split across cores and JIT compilation pays, and how soon a slow statement is logged.
-- @choices workload oltp = many short transactions: a web or business application, mixed = short transactions and reports on one server, analytics = few large queries over much data: reporting or a warehouse, timeseries = a steady stream of inserts read by time range, vector = similarity search over embeddings (pgvector), replica = a read-only standby streaming from a primary, desktop = a developer machine shared with other programs
-- @var ram_gb "Memory for PostgreSQL, GB (0: not known)", "0"
-- @help ram_gb The memory PostgreSQL may count on: the machine's, or the container's limit when it runs in Docker or Kubernetes, since a limit below the machine's is the one that counts. It sizes shared_buffers, effective_cache_size, work_mem, maintenance_work_mem and the WAL. 0 leaves those out, unless the server's own files may be read (below).
-- @var vcpus "vCPUs for PostgreSQL (0: not known)", "0"
-- @help vcpus The cores PostgreSQL may use, or the container's CPU limit. They size the parallel worker pools and max_worker_processes, which TimescaleDB, pg_cron and logical replication share with parallel queries. 0 leaves those out, unless the server's own files may be read (below).
-- @var read_host "Read memory and vCPUs from the server when they are 0 (a superuser on Linux)", "false"
-- @help read_host For memory and vCPUs left at 0, reads the server's /proc/meminfo, /proc/cpuinfo and its container limits (cgroups) through pg_read_file. It takes a superuser and a Linux server; elsewhere the two stay unknown. Off, the run reads nothing but the catalog and the statistics.
-- @var storage "Storage", "nvme"
-- @help storage The disk the data directory is on. It sets random_page_cost (on NVMe a random read costs about what a sequential one does, on an SSD or a cloud volume a little more), how many reads run ahead at once, and how hard autovacuum may work.
-- @choices storage nvme = local NVMe, ssd = a SATA or SAS SSD, network = "a cloud volume: EBS, Persistent Disk or Azure Disk", hdd = spinning disks
-- @var app_role "Application role, for its own timeouts (empty: none)", ""
-- @help app_role The role your application connects as. It gets its own statement_timeout and lock_timeout, so the application's runaway queries are stopped while backups, migrations and maintenance, run as other roles, are not. Leave it empty for no role timeouts.
-- @pick app_role select r.rolname as app_role, case when r.rolcanlogin then 'logs in' else 'a group' end as kind from pg_catalog.pg_roles r where r.rolname !~ '^pg_' and not r.rolsuper order by 1
-- @var output "Output", "grid"
-- @help output grid lists the suggestions with buttons that apply them on this server. Any other output writes the same suggestions as a script for wherever the configuration lives: ALTER SYSTEM statements, postgresql.conf, Patroni, a Kubernetes operator, Docker Compose or a cloud's command line.
-- @choices output grid = the suggestions with their buttons: apply and reset, sql = ALTER SYSTEM statements and a block that puts back what was there before, conf = lines for postgresql.conf, patroni = Patroni: the parameters for patronictl edit-config, patroni-bootstrap = Patroni: bootstrap.dcs in patroni.yml for a new cluster, cloudnativepg = Kubernetes: a CloudNativePG Cluster, zalando = Kubernetes: a Zalando postgres-operator cluster, crunchy-pgo = Kubernetes: a Crunchy PGO PostgresCluster, compose = Docker Compose: the command of a postgres service, aws = AWS RDS and Aurora: aws rds modify-db-parameter-group, azure = Azure: az postgres flexible-server parameter set, gcloud = Google Cloud SQL: gcloud sql instances patch
-- @hide role_name
-- Everything the server is asked here is read: the catalog, the
-- statistics views and, only when the form allows it and the role may,
-- the memory and CPU files under /proc and /sys/fs/cgroup. What only some
-- servers have (pg_stat_checkpointer, pg_authid, pg_hba_file_rules) is
-- read through query_to_xml, so a server without it, or a role that may
-- not read it, skips that evidence instead of failing the whole run.
-- A suggestion is shown only when the server would accept it (its range
-- and allowed values in pg_settings) and it differs from the value now.
-- With an Output other than grid, the same suggestions come back as a
-- script: the whole of it in one cell (a single cell copies exactly its
-- value), then line by line.
with input as (
    select pg_catalog.lower(pg_catalog.btrim({workload}::text)) as workload,
           case when {ram_gb}::numeric > 0 then {ram_gb}::numeric end as ram_gb,
           case when {vcpus}::int > 0 then {vcpus}::int end as cpus_given,
           pg_catalog.lower(pg_catalog.btrim({storage}::text)) as storage,
           coalesce({read_host}::boolean, false) as read_host,
           coalesce({speed}::boolean, false) as speed,
           coalesce({insight}::boolean, false) as insight,
           coalesce({safety}::boolean, false) as safety,
           coalesce({security}::boolean, false) as security,
           nullif(pg_catalog.btrim({app_role}::text), '') as app_role,
           pg_catalog.lower(pg_catalog.btrim({output}::text)) as output
), srv as (
    select pg_catalog.current_setting('server_version_num')::int as v,
           pg_catalog.current_setting('is_superuser') = 'on' as su,
           pg_catalog.version() ~* '(darwin|apple)' as mac,
           pg_catalog.version() ~* '(windows|mingw|msvc|visual c)' as windows,
           case when exists (select 1 from pg_catalog.pg_settings where name like 'rds.%') then 'Amazon RDS or Aurora'
                when exists (select 1 from pg_catalog.pg_settings where name like 'azure.%') then 'Azure Database for PostgreSQL'
                when exists (select 1 from pg_catalog.pg_settings where name like 'alloydb.%') then 'Google AlloyDB'
                when exists (select 1 from pg_catalog.pg_settings where name like 'cloudsql.%') then 'Google Cloud SQL'
           end as managed,
           pg_catalog.current_setting('max_connections')::int as max_conn,
           pg_catalog.current_setting('shared_preload_libraries') as preload,
           exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_stat_statements') as pgss_available,
           coalesce(nullif(pg_catalog.current_setting('timescaledb.max_background_workers', true), '')::int, 0) as ts_workers,
           case when pg_catalog.current_setting('cron.database_name', true) is not null then 1 else 0 end as cron_workers,
           case when exists (select 1 from pg_catalog.pg_stat_subscription)
                then pg_catalog.current_setting('max_logical_replication_workers')::int + 1 else 0 end as sub_workers,
           (select ps.setting::numeric * 1048576 from pg_catalog.pg_settings ps where ps.name = 'max_wal_size') as max_wal_now
), host as (
    select case when i.read_host and (i.ram_gb is null or i.cpus_given is null)
                 and pg_catalog.has_function_privilege('pg_catalog.pg_read_file(text, bigint, bigint, boolean)', 'execute')
                then pg_catalog.query_to_xml($q$select substring(pg_catalog.pg_read_file('/proc/meminfo', 0, 65536, true) from 'MemTotal:\s+([0-9]+) kB') as mem_kb, pg_catalog.btrim(pg_catalog.pg_read_file('/sys/fs/cgroup/memory.max', 0, 64, true), E' \n') as cg2_mem, pg_catalog.btrim(pg_catalog.pg_read_file('/sys/fs/cgroup/memory/memory.limit_in_bytes', 0, 64, true), E' \n') as cg1_mem, pg_catalog.btrim(pg_catalog.pg_read_file('/sys/fs/cgroup/cpu.max', 0, 64, true), E' \n') as cg2_cpu, pg_catalog.btrim(pg_catalog.pg_read_file('/sys/fs/cgroup/cpu/cpu.cfs_quota_us', 0, 64, true), E' \n') as cg1_quota, pg_catalog.btrim(pg_catalog.pg_read_file('/sys/fs/cgroup/cpu/cpu.cfs_period_us', 0, 64, true), E' \n') as cg1_period, (select pg_catalog.count(*) from pg_catalog.regexp_matches(coalesce(pg_catalog.pg_read_file('/proc/cpuinfo', 0, 4194304, true), ''), '^processor', 'gn') as m) as cpus$q$, true, false, '')
           end as x
    from input i
), hw as (
    select (pg_catalog.xpath('/table/row/mem_kb/text()', h.x))[1]::text::numeric * 1024 as mem_bytes,
           (pg_catalog.xpath('/table/row/cg2_mem/text()', h.x))[1]::text as cg2_mem,
           (pg_catalog.xpath('/table/row/cg1_mem/text()', h.x))[1]::text as cg1_mem,
           (pg_catalog.xpath('/table/row/cg2_cpu/text()', h.x))[1]::text as cg2_cpu,
           (pg_catalog.xpath('/table/row/cg1_quota/text()', h.x))[1]::text as cg1_quota,
           (pg_catalog.xpath('/table/row/cg1_period/text()', h.x))[1]::text as cg1_period,
           nullif((pg_catalog.xpath('/table/row/cpus/text()', h.x))[1]::text::int, 0) as cpus
    from host h
), hwv as (
    select w.mem_bytes,
           case when w.cg2_mem ~ '^[0-9]+$' then w.cg2_mem::numeric
                when w.cg1_mem ~ '^[0-9]+$' and w.cg1_mem::numeric < 1152921504606846976 then w.cg1_mem::numeric end as cg_bytes,
           w.cpus,
           case when w.cg2_cpu ~ '^[0-9]+ [0-9]+$'
                then pg_catalog.ceil(pg_catalog.split_part(w.cg2_cpu, ' ', 1)::numeric / nullif(pg_catalog.split_part(w.cg2_cpu, ' ', 2)::numeric, 0))
                when w.cg1_quota ~ '^[0-9]+$' and w.cg1_period ~ '^[0-9]+$'
                then pg_catalog.ceil(w.cg1_quota::numeric / nullif(w.cg1_period::numeric, 0)) end::int as cg_cpus
    from hw w
), res as (
    select case when i.ram_gb > 0 then i.ram_gb * 1073741824 else least(w.mem_bytes, w.cg_bytes) end as ram,
           case when i.ram_gb > 0 then 'as given'
                when w.cg_bytes < w.mem_bytes then 'the container''s limit, read from the server'
                when w.mem_bytes is not null then 'read from the server' end as ram_from,
           case when i.cpus_given > 0 then i.cpus_given else least(w.cpus, w.cg_cpus) end as cpus,
           case when i.cpus_given > 0 then 'as given'
                when w.cg_cpus < w.cpus then 'the container''s limit, read from the server'
                when w.cpus is not null then 'read from the server' end as cpus_from
    from input i cross join hwv w
), ckpt as (
    select (pg_catalog.xpath('/table/row/t/text()', q.x))[1]::text::numeric as timed,
           (pg_catalog.xpath('/table/row/r/text()', q.x))[1]::text::numeric as requested,
           (pg_catalog.xpath('/table/row/since/text()', q.x))[1]::text as since
    from (select case when s.v >= 170000
                      then pg_catalog.query_to_xml($q$select num_timed as t, num_requested as r, pg_catalog.to_char(stats_reset, 'YYYY-MM-DD') as since from pg_catalog.pg_stat_checkpointer$q$, true, false, '')
                      else pg_catalog.query_to_xml($q$select checkpoints_timed as t, checkpoints_req as r, pg_catalog.to_char(stats_reset, 'YYYY-MM-DD') as since from pg_catalog.pg_stat_bgwriter$q$, true, false, '')
                 end as x
          from srv s) q
), tmp as (
    select pg_catalog.sum(d.temp_files) as files,
           pg_catalog.sum(d.temp_bytes) as bytes,
           pg_catalog.to_char(pg_catalog.min(d.stats_reset), 'YYYY-MM-DD') as since
    from pg_catalog.pg_stat_database d
), idle as (
    select pg_catalog.count(*) as n,
           pg_catalog.max(pg_catalog.now() - a.state_change) as oldest
    from pg_catalog.pg_stat_activity a
    where a.state like 'idle in transaction%'
      and a.state_change < pg_catalog.now() - interval '1 minute'
), priv as (
    select (pg_catalog.xpath('/table/row/md5/text()', p.x))[1]::text::int as md5_roles,
           (pg_catalog.xpath('/table/row/cert/text()', p.x))[1]::text::boolean as cert_ok,
           (pg_catalog.xpath('/table/row/key/text()', p.x))[1]::text::boolean as key_ok
    from (select case when s.su
                      then pg_catalog.query_to_xml($q$select (select pg_catalog.count(*) from pg_catalog.pg_authid where rolpassword like 'md5%') as md5, (pg_catalog.pg_stat_file(pg_catalog.current_setting('ssl_cert_file'), true)).size is not null as cert, (pg_catalog.pg_stat_file(pg_catalog.current_setting('ssl_key_file'), true)).size is not null as key$q$, true, false, '')
                 end as x
          from srv s) p
), hba as (
    select (pg_catalog.xpath('/row/line/text()', r.x))[1]::text::int as line,
           (pg_catalog.xpath('/row/type/text()', r.x))[1]::text as type,
           coalesce((pg_catalog.xpath('/row/db/text()', r.x))[1]::text, '') as db,
           coalesce((pg_catalog.xpath('/row/usr/text()', r.x))[1]::text, '') as usr,
           coalesce((pg_catalog.xpath('/row/addr/text()', r.x))[1]::text, '') as addr,
           (pg_catalog.xpath('/row/method/text()', r.x))[1]::text as method
    from srv s,
         pg_catalog.unnest(case when s.su then pg_catalog.xpath('/table/row', pg_catalog.query_to_xml($q$select line_number as line, type, pg_catalog.array_to_string(database, ',') as db, pg_catalog.array_to_string(user_name, ',') as usr, coalesce(address, '') || case when netmask is null or netmask in ('255.255.255.255', 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff') then '' else '/' || netmask end as addr, auth_method as method from pg_catalog.pg_hba_file_rules where error is null and type <> 'local' and auth_method in ('trust', 'password', 'md5') order by line_number$q$, true, false, '')) end) as r(x)
), granted as (
    select case when not s.su and s.v >= 150000
                then pg_catalog.xpath('/table/row/n/text()', pg_catalog.query_to_xml($q$select name as n from pg_catalog.pg_settings where pg_catalog.has_parameter_privilege(name, 'ALTER SYSTEM')$q$, true, false, ''))::text[]
           end as names
    from srv s
), role as (
    select i.app_role,
           r.oid as role_oid,
           (pg_catalog.current_setting('is_superuser') = 'on'
            or r.rolname = current_user
            or (not r.rolsuper and exists (select 1 from pg_catalog.pg_roles m where m.rolname = current_user and m.rolcreaterole))) as may_alter,
           (select pg_catalog.array_to_string(d.setconfig, pg_catalog.chr(10))
              from pg_catalog.pg_db_role_setting d
             where d.setrole = r.oid and d.setdatabase = 0) as config
    from input i
         left join pg_catalog.pg_roles r on r.rolname = i.app_role
    where i.app_role is not null
), c as (
    select i.speed, i.insight, i.safety, i.security, i.app_role,
           case when i.output in ('sql', 'conf', 'patroni', 'patroni-bootstrap', 'cloudnativepg', 'zalando', 'crunchy-pgo', 'compose', 'aws', 'azure', 'gcloud') then i.output else 'grid' end as output,
           x.wl,
           case when i.storage in ('nvme', 'ssd', 'network', 'hdd') then i.storage else 'nvme' end as st,
           s.*, r.ram, r.ram_from, r.cpus, r.cpus_from,
           pg_catalog.trim_scale(pg_catalog.round(r.ram / 1073741824, 1)) || ' GB' as ram_text,
           -- The share of the memory PostgreSQL's own cache takes: more for
           -- the workloads that read big ranges, less on a shared desktop.
           case x.wl when 'analytics' then 35 when 'timeseries' then 35 when 'desktop' then 15 else 25 end as sb_pct,
           case when r.ram is not null
                then greatest(134217728::numeric, least(34359738368::numeric, pg_catalog.floor(r.ram * (case x.wl when 'analytics' then 35 when 'timeseries' then 35 when 'desktop' then 15 else 25 end) / 100 / 134217728) * 134217728))
           end as sb,
           -- The connections a server of this workload is usually sized for,
           -- and one sort's or hash's memory at that count.
           case x.wl when 'analytics' then 40 when 'desktop' then 20 when 'oltp' then 200 when 'mixed' then 200 else 100 end as ref_conn,
           case x.wl when 'oltp' then 'a transaction server' when 'mixed' then 'a mixed server' when 'analytics' then 'an analytics server'
                     when 'timeseries' then 'a time series server' when 'vector' then 'a vector search server' when 'replica' then 'a read replica'
                     else 'a desktop' end as wl_name,
           case x.wl when 'analytics' then 64 when 'timeseries' then 48 when 'vector' then 48 when 'mixed' then 32 when 'replica' then 32 else 16 end as wm_base,
           k.timed, k.requested, coalesce(k.since, 'the statistics began') as ckpt_since,
           t.files as tmp_files, t.bytes as tmp_bytes, coalesce(t.since, 'the statistics began') as tmp_since,
           d.n as idle_n, d.oldest as idle_oldest,
           p.md5_roles, p.cert_ok, p.key_ok, g.names as granted
    from input i
         cross join lateral (select case when i.workload in ('oltp', 'mixed', 'analytics', 'timeseries', 'vector', 'replica', 'desktop') then i.workload else 'mixed' end as wl) x
         cross join srv s cross join res r cross join ckpt k cross join tmp t cross join idle d cross join priv p cross join granted g
), rules (goal, ord, area, name, scope, kind, target, target_text, up, why) as (
    select 'platform', 0, 'Platform', 'managed service', 'server', 'info', null::numeric, c.managed, false,
           'A managed service sets its parameters in its own console or CLI, not with ALTER SYSTEM: the aws, azure and gcloud Outputs write the command. Some it keeps for itself.'
    from c where c.managed is not null
    union all
    -- Speed: what the memory, the CPUs and the disks allow.
    select 'speed', 100, 'Memory', 'memory and vCPUs', 'server', 'info', null,
           case when c.ram is null and c.cpus is null then 'not known'
                when c.ram is null then 'memory not known'
                else 'vCPUs not known' end,
           false,
           'Give them in the form (or let the server be read, as a superuser on Linux): the memory sizes shared_buffers, effective_cache_size, maintenance_work_mem and the WAL; the vCPUs size the parallel worker pools.'
    from c where c.speed and (c.ram is null or c.cpus is null)
    union all
    select 'speed', 110, 'Memory', 'shared_buffers', 'server', 'mem', c.sb, null, false,
           pg_catalog.format('%s%% of %s of memory (%s): PostgreSQL''s own cache. ', c.sb_pct, c.ram_text, c.ram_from)
           || case c.sb_pct when 35 then 'Analytics and time series read big ranges and get a larger share. '
                            when 15 then 'A desktop shares the machine with other programs and gets less. '
                            else '' end
           || 'The operating system caches the rest, and past 32 GB more rarely helps.'
    from c where c.speed and c.ram is not null
    union all
    select 'speed', 120, 'Memory', 'effective_cache_size', 'server', 'mem',
           pg_catalog.floor(c.ram * 0.75 / 1048576) * 1048576, null, false,
           pg_catalog.format('A hint for the planner, not an allocation: about three quarters of the %s is cache, PostgreSQL''s and the operating system''s together, so index scans on warm tables are costed as the cheap reads they are.', c.ram_text)
    from c where c.speed and c.ram is not null
    union all
    select 'speed', 130, 'Memory', 'maintenance_work_mem', 'server', 'mem',
           greatest(67108864::numeric,
                    least(pg_catalog.floor(c.ram / (case when c.wl in ('analytics', 'timeseries') then 8 else 16 end) / 1048576) * 1048576,
                          case when c.wl in ('analytics', 'timeseries') and c.v < 170000 then 2147483648 else 4294967296 end)), null, true,
           pg_catalog.format('A %s of the memory, up to %s: VACUUM, CREATE INDEX and adding a foreign key work in it, and autovacuum takes it once per worker unless autovacuum_work_mem says otherwise.',
                             case when c.wl in ('analytics', 'timeseries') then 'eighth' else 'sixteenth' end,
                             case when c.wl in ('analytics', 'timeseries') and c.v < 170000 then '2 GB (VACUUM itself uses at most 1 GB of it before PostgreSQL 17)' else '4 GB' end)
    from c where c.speed and c.ram is not null
    union all
    select 'speed', 140, 'Memory', 'work_mem', 'server', 'mem', w.target, null, false,
           case when c.max_conn > c.ref_conn
                then pg_catalog.format('%s MB for one sort or hash is the measure for %s with %s connections; this one allows %s, so each gets %s.',
                                       c.wm_base, c.wl_name, c.ref_conn, c.max_conn, pg_catalog.pg_size_pretty(w.target::bigint))
                else pg_catalog.format('%s MB for one sort or hash: the measure for %s with %s connections.', c.wm_base, c.wl_name, c.ref_conn) end
           || ' One query may take it several times over, once for each sort and hash.'
           || case when c.ram < 4294967296 then ' Halved: the machine has under 4 GB.' else '' end
           || case when c.tmp_files > 0
                   then pg_catalog.format(' Since %s the server wrote %s temporary files averaging %s.', c.tmp_since, c.tmp_files, pg_catalog.pg_size_pretty((c.tmp_bytes / c.tmp_files)::bigint))
                        || case when c.tmp_bytes / c.tmp_files > w.target * 4
                                then ' Spills that large are single queries: give those more for themselves (SET LOCAL work_mem, or ALTER ROLE ... SET) rather than every connection.'
                                else '' end
                   else '' end
    from c
         cross join lateral (
             select greatest(4194304::numeric,
                             pg_catalog.floor(c.wm_base::numeric * 1048576 * c.ref_conn / greatest(c.max_conn, c.ref_conn)
                                              / (case when c.ram < 4294967296 then 2 else 1 end) / 4194304) * 4194304) as target
         ) w
    where c.speed
    union all
    select 'speed', 150, 'WAL', 'wal_buffers', 'server', 'mem',
           greatest(16777216::numeric, least(134217728::numeric, pg_catalog.floor(c.sb / 32 / 16777216) * 16777216)), null, true,
           'A thirty-second of shared_buffers, up to 128 MB. The automatic size stops at 16 MB, too little when many transactions commit at once.'
    from c where c.speed and c.sb is not null
    union all
    select 'speed', 160, 'WAL', 'max_wal_size', 'server', 'mem', x.target, null, true,
           case when x.forced
                then pg_catalog.format('%s of %s checkpoints since %s were forced by the amount of WAL, not by the timer: each one writes every changed page at once.', c.requested, c.timed + c.requested, c.ckpt_since)
                else pg_catalog.format('%s shared_buffers, up to 16 GB: fewer checkpoints, fewer full-page images written after each.',
                                       case c.wl when 'analytics' then 'Once' when 'timeseries' then 'Three times' else 'Twice' end) end
           || ' Crash recovery replays up to this much WAL.'
    from c
         cross join lateral (
             select (c.timed + c.requested) >= 10 and c.requested > 0.25 * (c.timed + c.requested) as forced
         ) f
         cross join lateral (
             select case when g.target is not null then least(68719476736::numeric, g.target) end as target, f.forced
             from (select greatest(case when c.sb is not null
                                        then greatest(1073741824::numeric, least(17179869184::numeric,
                                                 pg_catalog.floor(c.sb * (case c.wl when 'analytics' then 1 when 'timeseries' then 3 else 2 end) / 536870912) * 536870912)) end,
                                   case when f.forced then c.max_wal_now * 2 end) as target) g
         ) x
    where c.speed and x.target is not null
    union all
    select 'speed', 165, 'WAL', 'min_wal_size', 'server', 'mem',
           greatest(1073741824::numeric, least(4294967296::numeric, pg_catalog.floor(c.sb / 2 / 268435456) * 268435456)), null, true,
           'Half of shared_buffers, from 1 GB to 4 GB: WAL segments kept for reuse, so a steady write load does not create and remove files all the time.'
    from c where c.speed and c.sb is not null
    union all
    select 'speed', 170, 'WAL', 'checkpoint_timeout', 'server', 'time',
           case when c.wl = 'analytics' then 1800000 else 900000 end, null, true,
           pg_catalog.format('A checkpoint every %s minutes instead of 5 writes fewer full-page images into the WAL. Crash recovery may take up to that long to replay.',
                             case when c.wl = 'analytics' then 30 else 15 end)
    from c where c.speed and c.wl <> 'desktop'
    union all
    select 'speed', 180, 'WAL', 'checkpoint_completion_target', 'server', 'num', 0.9, null, false,
           'Spreads a checkpoint''s writes over 90% of the interval instead of half of it; the default from PostgreSQL 14 on.'
    from c where c.speed and c.v < 140000
    union all
    select 'speed', 190, 'WAL', 'wal_compression', 'server', 'text', null,
           case when c.v < 150000 then 'on'
                when 'lz4' = any (s.enumvals) then 'lz4'
                when 'zstd' = any (s.enumvals) then 'zstd'
                else 'pglz' end,
           false,
           'Compresses the full-page images in the WAL: less to write, archive and replicate, for a little CPU.'
    from c cross join pg_catalog.pg_settings s
    where c.speed and c.wl <> 'desktop' and s.name = 'wal_compression' and s.setting in ('off', 'false')
    union all
    select 'speed', 195, 'WAL', 'synchronous_commit', 'server', 'text', null, 'off', false,
           'A desktop: a commit returns before its WAL reaches the disk, so many small writes run much faster. A crash of the machine can lose the last fraction of a second of commits, never the consistency of the data; never for a server whose data matters.'
    from c where c.speed and c.wl = 'desktop'
    union all
    select 'speed', 200, 'Planner', 'random_page_cost', 'server', 'num',
           case c.st when 'nvme' then 1.1 when 'hdd' then 4 else 1.5 end, null, false,
           case c.st when 'hdd' then 'The default, made for spinning disks: a random read costs four sequential ones.'
                     when 'nvme' then 'On NVMe a random read costs about what a sequential one does; at the default 4 the planner shuns index scans it should take.'
                     else 'On an SSD or a cloud volume a random read costs a little more than a sequential one, far less than the default 4 assumes.' end
    from c where c.speed
    union all
    select 'speed', 210, 'Planner', 'effective_io_concurrency', 'server', 'num',
           case c.st when 'ssd' then 100 when 'hdd' then 2 else 200 end, null, false,
           'How many reads a scan keeps in flight ahead of itself (bitmap heap scans, and more kinds from PostgreSQL 17 on). Flash and cloud volumes answer many at once.'
    from c where c.speed and not c.mac and not c.windows
    union all
    select 'speed', 230, 'Planner', 'jit', 'server', 'text', null, 'off', false,
           'Compiling a query''s expressions pays off on long analytic queries; for short transactions the compile time is all cost.'
    from c where c.speed and c.wl in ('oltp', 'mixed', 'replica', 'desktop')
    union all
    select 'speed', 240, 'Planner', 'default_statistics_target', 'server', 'num',
           case when c.wl in ('analytics', 'timeseries') then 500 else 200 end, null, false,
           'More sampled values per column, so the planner estimates big and skewed tables better; ANALYZE takes a little longer.'
    from c where c.speed and c.wl in ('analytics', 'timeseries', 'mixed', 'vector')
    union all
    select 'speed', 250, 'Memory', 'huge_pages', 'server', 'text', null, 'off', false,
           'A desktop has no huge pages reserved and a small shared_buffers that gains nothing from them; off, PostgreSQL does not try.'
    from c where c.speed and c.wl = 'desktop' and not c.mac and not c.windows
    union all
    select 'speed', 300, 'Parallelism', 'max_worker_processes', 'server', 'num', x.target, null, true,
           pg_catalog.format('One slot per vCPU (%s, %s), from 4 to 32', c.cpus, c.cpus_from)
           || case when c.ts_workers > 0 then pg_catalog.format(', and TimescaleDB''s %s background workers', c.ts_workers) else '' end
           || case when c.cron_workers > 0 then ', and pg_cron''s' else '' end
           || case when c.sub_workers > 0 then pg_catalog.format(', and %s for logical replication', c.sub_workers) else '' end
           || ': parallel queries and every extension''s background workers share these slots.'
    from c cross join lateral (select least(32, greatest(4, c.cpus)) + c.ts_workers + c.cron_workers + c.sub_workers as target) x
    where c.speed and c.cpus is not null
    union all
    select 'speed', 310, 'Parallelism', 'max_parallel_workers', 'server', 'num', least(32, greatest(4, c.cpus)), null, false,
           pg_catalog.format('One parallel worker per vCPU (%s, %s), from 4 to 32: parallel queries never queue more work than the machine has cores.', c.cpus, c.cpus_from)
    from c where c.speed and c.cpus is not null
    union all
    select 'speed', 320, 'Parallelism', 'max_parallel_workers_per_gather', 'server', 'num',
           case when c.wl in ('oltp', 'desktop') then 2
                when c.wl in ('mixed', 'replica') then least(4, greatest(2, c.cpus / 2))
                when c.wl = 'vector' then least(6, greatest(2, c.cpus / 2))
                else least(8, greatest(2, c.cpus / 2)) end, null, false,
           case when c.wl in ('oltp', 'desktop') then 'Two workers for one query: short transactions gain little from more, and the cores serve the other sessions.'
                else 'A large query may take half of the vCPUs.' end
    from c where c.speed and c.cpus is not null
    union all
    select 'speed', 330, 'Parallelism', 'max_parallel_maintenance_workers', 'server', 'num', least(4, greatest(2, c.cpus / 2)), null, true,
           'CREATE INDEX (and VACUUM''s index passes from PostgreSQL 13 on) may use this many workers.'
    from c where c.speed and c.cpus is not null
    union all
    select 'speed', 400, 'Autovacuum', 'autovacuum_max_workers', 'server', 'num',
           case c.wl when 'oltp' then 6 when 'mixed' then 6 when 'timeseries' then 8 when 'analytics' then 3 else 4 end, null, true,
           'More tables vacuumed at once: busy tables wait less for their turn.'
    from c where c.speed
    union all
    select 'speed', 410, 'Autovacuum', 'autovacuum_vacuum_scale_factor', 'server', 'num',
           case c.wl when 'oltp' then 0.05 when 'timeseries' then 0.05 when 'mixed' then 0.1 else 0.2 end, null, false,
           'A table is vacuumed once this share of its rows has changed. Lower on busy tables, so dead rows are cleared before they pile up.'
    from c where c.speed
    union all
    select 'speed', 415, 'Autovacuum', 'autovacuum_analyze_scale_factor', 'server', 'num',
           case c.wl when 'oltp' then 0.02 when 'timeseries' then 0.02 when 'mixed' then 0.05 else 0.1 end, null, false,
           'A table''s statistics are refreshed once this share of its rows has changed, so the planner sees the data as it is.'
    from c where c.speed
    union all
    select 'speed', 420, 'Autovacuum', 'autovacuum_vacuum_cost_limit', 'server', 'num',
           case when c.st = 'hdd' then 400 else 1000 end, null, true,
           'The default (-1, which means vacuum_cost_limit, 200) paces autovacuum for the disks of long ago. '
           || case when c.st = 'hdd' then 'Spinning disks keep up with twice as much.' else 'Flash keeps up with five times as much.' end
    from c where c.speed
    union all
    select 'speed', 500, 'Connections', 'max_connections', 'server', 'num', c.ref_conn, null, true,
           pg_catalog.format('Room for %s connections, what %s is usually sized for. Past a few hundred, a pooler such as PgBouncer serves better than more backends. Only ever raised here: a server that already allows more keeps them.', c.ref_conn, c.wl_name)
    from c where c.speed
    union all
    -- Insight: what the server tells about itself.
    select 'insight', 1000, 'Statistics', 'shared_preload_libraries', 'server', 'list', null,
           case when pg_catalog.btrim(c.preload) = '' then 'pg_stat_statements' else c.preload || ', pg_stat_statements' end, false,
           'Loads pg_stat_statements, which counts every statement: the slowest, the most frequent, the ones that read the most. After the restart, run CREATE EXTENSION pg_stat_statements in the databases you read it from.'
    from c where c.insight and c.pgss_available and not ('pg_stat_statements' = any (pg_catalog.regexp_split_to_array(pg_catalog.btrim(c.preload), '\s*,\s*')))
    union all
    select 'insight', 1010, 'Statistics', 'track_io_timing', 'server', 'text', null, 'on', false,
           'Times every read and write, so EXPLAIN (BUFFERS), pg_stat_statements and pg_stat_database say how long the disk took. It costs one clock read per I/O; pg_test_timing on the server shows what that is there.'
    from c where c.insight
    union all
    select 'insight', 1020, 'Statistics', 'track_functions', 'server', 'text', null, 'pl', false,
           'Counts calls and time of the functions written in PL/pgSQL and the other procedural languages (pg_stat_user_functions).'
    from c where c.insight
    union all
    select 'insight', 1100, 'Logging', 'log_min_duration_statement', 'server', 'time',
           case c.wl when 'analytics' then 5000 when 'desktop' then 100 else 1000 end, null, false,
           'Logs every statement that runs longer than this, with its duration: the slow ones are named in the log.'
    from c cross join pg_catalog.pg_settings s
    where c.insight and s.name = 'log_min_duration_statement' and s.setting = '-1'
    union all
    select 'insight', 1110, 'Logging', 'log_line_prefix', 'server', 'text', null, '%m [%p] %q%u@%d ', false,
           'Puts the user and the database on every log line (a background process has neither, and %q leaves them out there).'
    from c cross join pg_catalog.pg_settings s
    where c.insight and s.name = 'log_line_prefix' and s.setting = '%m [%p] '
    union all
    select 'insight', 1120, 'Logging', 'log_lock_waits', 'server', 'text', null, 'on', false,
           'Logs a session that waits longer than deadlock_timeout (1 s) for a lock, with who holds it.'
    from c where c.insight
    union all
    select 'insight', 1130, 'Logging', 'log_checkpoints', 'server', 'text', null, 'on', false,
           'One line per checkpoint: how much it wrote and how long it took. On by default from PostgreSQL 15.'
    from c where c.insight
    union all
    select 'insight', 1140, 'Logging', 'log_temp_files', 'server', 'mem', 10485760, null, false,
           'Logs a temporary file larger than 10 MB with the statement that wrote it: the queries work_mem does not fit.'
    from c cross join pg_catalog.pg_settings s
    where c.insight and s.name = 'log_temp_files' and s.setting = '-1'
    union all
    select 'insight', 1150, 'Logging', 'log_autovacuum_min_duration', 'server', 'time', 600000, null, false,
           'Logs an autovacuum run that takes longer than 10 minutes, with what it found; the default from PostgreSQL 15 on.'
    from c cross join pg_catalog.pg_settings s
    where c.insight and s.name = 'log_autovacuum_min_duration' and s.setting = '-1'
    union all
    -- Safety: what stops one session from hurting the others.
    select 'safety', 2000, 'Sessions', 'idle_in_transaction_session_timeout', 'server', 'time',
           600000, null, false,
           'Ends a session that opened a transaction and stopped answering: it holds its locks and keeps VACUUM from cleaning up behind it.'
           || case when c.idle_n > 0
                   then case when c.idle_n = 1 then pg_catalog.format(' Now one session is idle in a transaction, for %s.', pg_catalog.date_trunc('second', c.idle_oldest))
                             else pg_catalog.format(' Now %s sessions are idle in a transaction, the oldest for %s.', c.idle_n, pg_catalog.date_trunc('second', c.idle_oldest)) end
                   else '' end
    from c cross join pg_catalog.pg_settings s
    where c.safety and s.name = 'idle_in_transaction_session_timeout' and s.setting = '0' and c.wl not in ('analytics', 'vector')
    union all
    select 'safety', 2100, 'Sessions', 'statement_timeout', 'role', 'info', null, 'for the application role', false,
           'Name the application role in the form to give it its own statement_timeout and lock_timeout. A server-wide limit would stop backups, migrations and maintenance too.'
    from c where c.safety and c.app_role is null
    union all
    select 'safety', 2100, 'Sessions', 'application role', 'role', 'info', null, 'a role that exists', false,
           pg_catalog.format('There is no role %s on this server.', pg_catalog.quote_ident(c.app_role))
    from c where c.safety and c.app_role is not null and not exists (select 1 from role r where r.role_oid is not null)
    union all
    select 'safety', 2110, 'Sessions', 'statement_timeout', 'role', 'time',
           case c.wl when 'oltp' then 30000 when 'mixed' then 120000 when 'vector' then 60000 else 1800000 end, null, false,
           'Cancels a statement of this role that runs longer than this: a runaway query cannot hold a connection and its locks for good. Backups and migrations run as other roles and are not limited.'
    from c where c.safety and exists (select 1 from role r where r.role_oid is not null)
    union all
    select 'safety', 2120, 'Sessions', 'lock_timeout', 'role', 'time',
           case when c.wl in ('analytics', 'timeseries') then 30000 else 5000 end, null, false,
           'A statement of this role gives up waiting for a lock after this long, instead of queueing behind a migration and blocking everything that queues behind it.'
    from c where c.safety and exists (select 1 from role r where r.role_oid is not null)
    union all
    -- Security: who gets in, how, and what is written down.
    select 'security', 3000, 'Passwords', 'password_encryption', 'server', 'text', null, 'scram-sha-256', false,
           'New and changed passwords are stored as SCRAM, not MD5, which PostgreSQL 18 deprecates.'
           || case when c.md5_roles = 1 then ' One role keeps an MD5 password until it is set again.'
                   when c.md5_roles > 1 then pg_catalog.format(' %s roles keep an MD5 password until it is set again.', c.md5_roles) else '' end
    from c cross join pg_catalog.pg_settings s
    where c.security and s.name = 'password_encryption' and s.setting = 'md5'
    union all
    select 'security', 3010, 'Passwords', 'role passwords', 'server', 'info', null, pg_catalog.format('%s in MD5', c.md5_roles), false,
           case when c.md5_roles = 1 then 'One role keeps' else pg_catalog.format('%s roles keep', c.md5_roles) end
           || ' an MD5 password. It is converted to SCRAM only when it is set again (ALTER ROLE ... PASSWORD, or \password in psql).'
    from c cross join pg_catalog.pg_settings s
    where c.security and c.md5_roles > 0 and s.name = 'password_encryption' and s.setting <> 'md5'
    union all
    select 'security', 3100, 'Encryption', 'ssl', 'server', 'text', null, 'on', false,
           'Encrypts connections that ask for it; the certificate and the key are in place. Clients still choose: sslmode=require (or hostssl lines in pg_hba.conf) makes it a must.'
    from c cross join pg_catalog.pg_settings s
    where c.security and s.name = 'ssl' and s.setting = 'off' and c.cert_ok and c.key_ok
    union all
    select 'security', 3100, 'Encryption', 'ssl', 'server', 'info', null, 'on, after a certificate', false,
           case when c.su
                then pg_catalog.format('Connections travel unencrypted. Put a certificate and its key where ssl_cert_file (%s) and ssl_key_file (%s) point first: switched on without them, the server does not start again.', pg_catalog.current_setting('ssl_cert_file'), pg_catalog.current_setting('ssl_key_file'))
                else 'Connections travel unencrypted. Switch it on once a certificate and its key are in place; only a superuser can see whether they are.' end
    from c cross join pg_catalog.pg_settings s
    where c.security and s.name = 'ssl' and s.setting = 'off' and not (coalesce(c.cert_ok, false) and coalesce(c.key_ok, false))
    union all
    select 'security', 3200, 'Logging', 'log_connections', 'server', 'text', null, 'on', false,
           'Every connection in the log: who came in, from where, and how they were authenticated.'
    from c cross join pg_catalog.pg_settings s
    where c.security and s.name = 'log_connections' and s.setting in ('off', '')
    union all
    select 'security', 3210, 'Logging', 'log_statement', 'server', 'text', null, 'ddl', false,
           'Every CREATE, ALTER and DROP in the log, with who ran it: the record of how the database changed.'
    from c cross join pg_catalog.pg_settings s
    where c.security and s.name = 'log_statement' and s.setting = 'none'
    union all
    select 'security', 3300 + h.line, 'Authentication', pg_catalog.format('pg_hba.conf line %s', h.line), 'server', 'info', null,
           case h.method when 'trust' then 'scram-sha-256, or a narrower address' else 'scram-sha-256' end, false,
           pg_catalog.format('%s %s %s %s %s: ', h.type, h.db, h.usr, h.addr, h.method)
           || case h.method
                   when 'trust' then case when h.addr in ('127.0.0.1', '::1', 'localhost') then 'anyone with a login on the server''s machine connects as any of these users with no password.'
                                          else 'anyone who reaches this address connects as any of these users with no password.' end
                   when 'password' then 'the password travels as clear text unless the connection is encrypted.'
                   else 'MD5 authentication; SCRAM is stronger, and a scram-sha-256 line still accepts the passwords stored as SCRAM.' end
           || ' Edit the line in pg_hba.conf, then Reload.'
    from c cross join hba h
    where c.security
), rec as (
    select r.*, s.setting, s.unit, s.vartype, s.context, s.min_val, s.max_val, s.enumvals, s.source, s.sourcefile,
           case s.unit when 'B' then 1 when 'kB' then 1024 when '8kB' then 8192 when 'MB' then 1048576 when 'GB' then 1073741824 when 'TB' then 1099511627776 end::numeric as ub,
           case s.unit when 'ms' then 1 when 's' then 1000 when 'min' then 60000 when 'h' then 3600000 when 'd' then 86400000 end::numeric as um,
           (select substring(x.config from '(?:^|\n)' || r.name || '=([^\n]*)') from role x limit 1) as role_value,
           (select x.app_role from role x where x.role_oid is not null limit 1) as role_name,
           (select x.may_alter from role x where x.role_oid is not null limit 1) as role_writable,
           s.sourcefile like '%postgresql.auto.conf' as from_auto
    from rules r
         left join pg_catalog.pg_settings s on s.name = r.name
), fin as (
    select x.*,
           case x.kind when 'mem' then pg_catalog.floor(x.target / x.ub)
                       when 'time' then pg_catalog.floor(x.target / x.um)
                       when 'num' then x.target end as base,
           case when x.vartype in ('integer', 'real') then x.setting::numeric end as now_base
    from rec x
), shown as (
    select f.*,
           case f.kind
                when 'mem' then case when f.base * f.ub >= 1073741824 and (f.base * f.ub) % 1073741824 = 0 then ((f.base * f.ub) / 1073741824)::bigint || 'GB'
                                     when (f.base * f.ub) % 1048576 = 0 then ((f.base * f.ub) / 1048576)::bigint || 'MB'
                                     else ((f.base * f.ub) / 1024)::bigint || 'kB' end
                when 'time' then case when (f.base * f.um) % 3600000 = 0 then ((f.base * f.um) / 3600000)::bigint || 'h'
                                      when (f.base * f.um) % 60000 = 0 then ((f.base * f.um) / 60000)::bigint || 'min'
                                      when (f.base * f.um) % 1000 = 0 then ((f.base * f.um) / 1000)::bigint || 's'
                                      else (f.base * f.um)::bigint || 'ms' end
                when 'num' then pg_catalog.trim_scale(f.base)::text
                else f.target_text end as suggested
    from fin f
)
, grid as (
select v.goal,
       v.area,
       v.name as setting,
       case v.scope when 'role' then 'role ' || coalesce(v.role_name, 'of the application') else 'server' end as "applies to",
       case when v.kind = 'info' then ''
            when v.scope = 'role' then coalesce(v.role_value, pg_catalog.current_setting(v.name))
            else pg_catalog.current_setting(v.name) end as now,
       case when v.kind = 'info' then ''
            when v.scope = 'role' then case when v.role_value is not null then 'the role' else 'the server' end
            when v.sourcefile like '%postgresql.auto.conf' then 'postgresql.auto.conf'
            when v.source = 'configuration file' then coalesce(substring(v.sourcefile from '[^/\\]+$'), 'a configuration file')
            else coalesce(v.source, '') end as "set by",
       v.suggested,
       case when v.kind = 'info' and v.name like 'pg_hba.conf%' then 'reload'
            when v.kind = 'info' then ''
            when v.scope = 'role' then 'new sessions'
            when v.context = 'postmaster' then 'restart'
            else 'reload' end as takes,
       case when v.scope = 'server' and v.kind in ('mem', 'time', 'num', 'text', 'list') and c.managed is null and v.writable then 'apply' end as apply,
       case when v.scope = 'role' and v.kind <> 'info' and v.role_name is not null and v.role_writable then 'apply' end as "apply to role",
       case when v.scope = 'server' and v.kind in ('mem', 'time', 'num', 'text', 'list') and c.managed is null and v.writable then 'reset' end as reset,
       case when c.managed is not null and v.kind <> 'info'
            then pg_catalog.format('%s Set it in the %s parameter settings; the Output for the service writes the command.', v.why, c.managed)
            when v.scope = 'server' and v.kind <> 'info' and not v.writable
            then v.why || ' Writing it takes a superuser, or a role granted ALTER SYSTEM on it.'
            else v.why end as why,
       v.role_name,
       v.kind,
       v.scope,
       v.base,
       case v.goal when 'platform' then 0 when 'speed' then 1 when 'insight' then 2 when 'safety' then 3 else 4 end as gorder,
       v.ord as rord
from (select x.*, coalesce(c0.su or x.name = any (c0.granted), false) as writable from shown x cross join c c0) v
     cross join c
where v.kind = 'info'
   or (v.setting is not null
       and v.context <> 'internal'
       and case when v.kind in ('mem', 'time', 'num')
                then v.base is not null
                     and v.base >= coalesce(v.min_val::numeric, v.base)
                     and v.base <= coalesce(v.max_val::numeric, v.base)
                when v.vartype = 'bool' then pg_catalog.lower(v.suggested) in ('on', 'off', 'true', 'false')
                when v.vartype = 'enum' then v.suggested = any (v.enumvals)
                else true end
       and case when v.scope = 'role'
                then v.role_value is distinct from v.suggested
                when v.kind in ('mem', 'time', 'num')
                then v.now_base is null
                     or (v.up and v.base > v.now_base)
                     or (not v.up and pg_catalog.abs(v.base - v.now_base) > 0.1 * pg_catalog.abs(v.now_base))
                when v.vartype = 'string'
                then v.setting is distinct from v.suggested
                else pg_catalog.lower(v.setting) is distinct from pg_catalog.lower(v.suggested) end)
)

, ex as (
    select g.*,
           pg_catalog.row_number() over (order by g.gorder, g.rord, g.setting) as n,
           pg_catalog.row_number() over (partition by g.scope order by g.gorder, g.rord, g.setting) as ns,
           pg_catalog.count(*) over (partition by g.scope) as nscope,
           case when g.kind = 'list' then pg_catalog.regexp_replace(g.suggested, '\s*,\s*', ',', 'g') else g.suggested end as val
    from grid g
    where g.kind <> 'info'
), exv as (
    select e.*,
           '''' || pg_catalog.replace(e.val, '''', '''''') || '''' as qval,
           case when e.kind = 'list'
                then (select pg_catalog.string_agg(pg_catalog.quote_literal(t.lib), ', ' order by t.i)
                        from pg_catalog.unnest(pg_catalog.string_to_array(e.val, ',')) with ordinality as t(lib, i))
                else pg_catalog.quote_literal(e.suggested) end as sqlval,
           case when e.kind = 'list'
                then coalesce((select pg_catalog.string_agg(pg_catalog.quote_literal(t.lib), ', ' order by t.i)
                                 from pg_catalog.unnest(pg_catalog.string_to_array(pg_catalog.regexp_replace(pg_catalog.btrim(e.now), '\s*,\s*', ',', 'g'), ',')) with ordinality as t(lib, i)
                                where t.lib <> ''), '''''')
                else pg_catalog.quote_literal(e.now) end as sqlnow,
           case when e.kind in ('mem', 'time', 'num') then pg_catalog.trim_scale(e.base)::text else e.val end as cloudval
    from ex e
), sv as (
    select x.* from exv x where x.scope = 'server'
), rv as (
    select x.* from exv x where x.scope = 'role'
), lines (o1, o2, line, ref, ref_scope) as (
    -- ALTER SYSTEM, with the way back
    select 0, 1, '-- Server setup: review, then run statement by statement', null::text, null::text from c where c.output = 'sql'
    union all select 0, 2, '-- (ALTER SYSTEM cannot run inside a transaction block).', null, null from c where c.output = 'sql'
    union all select 1, x.n::int, 'ALTER SYSTEM SET ' || x.setting || ' = ' || x.sqlval || ';  -- ' || x.takes, x.setting, 'server' from sv x cross join c where c.output = 'sql'
    union all select 2, x.n::int, 'ALTER ROLE ' || pg_catalog.quote_ident(x.role_name) || ' SET ' || x.setting || ' = ' || x.sqlval || ';', x.setting, 'role' from rv x cross join c where c.output = 'sql'
    union all select 3, 1, '', null, null from c where c.output = 'sql' and exists (select 1 from sv)
    union all select 3, 2, 'SELECT pg_catalog.pg_reload_conf();', null, null from c where c.output = 'sql' and exists (select 1 from sv)
    union all select 3, 3, '-- Waiting for a restart: ' || pg_catalog.string_agg(x.setting, ', ' order by x.n) || '.', null, null from sv x cross join c where c.output = 'sql' and x.takes = 'restart' group by c.output
    union all select 4, 1, '', null, null from c where c.output = 'sql'
    union all select 4, 2, '-- To put back what was there before:', null, null from c where c.output = 'sql'
    union all select 5, x.n::int, case when x."set by" = 'postgresql.auto.conf' then '-- ALTER SYSTEM SET ' || x.setting || ' = ' || x.sqlnow || ';' else '-- ALTER SYSTEM RESET ' || x.setting || ';' end, null, null from sv x cross join c where c.output = 'sql'
    union all select 6, x.n::int, case when x."set by" = 'the role' then '-- ALTER ROLE ' || pg_catalog.quote_ident(x.role_name) || ' SET ' || x.setting || ' = ' || pg_catalog.quote_literal(x.now) || ';' else '-- ALTER ROLE ' || pg_catalog.quote_ident(x.role_name) || ' RESET ' || x.setting || ';' end, null, null from rv x cross join c where c.output = 'sql'
    union all select 7, 1, '-- SELECT pg_catalog.pg_reload_conf();', null, null from c where c.output = 'sql' and exists (select 1 from sv)
    -- postgresql.conf
    union all select 0, 1, '# Server setup: add these lines at the end of postgresql.conf (a later line wins),', null, null from c where c.output = 'conf'
    union all select 0, 2, '# then reload; the ones marked restart need a restart.', null, null from c where c.output = 'conf'
    union all select 1, x.n::int, pg_catalog.rpad(x.setting, 36) || '= ' || x.qval || '  # ' || x.takes, x.setting, 'server' from sv x cross join c where c.output = 'conf'
    -- Patroni
    union all select 0, 1, '# patronictl -c /etc/patroni.yml edit-config: merge into the cluster configuration.', null, null from c where c.output = 'patroni'
    union all select 0, 2, '# Patroni applies it to every member; patronictl restart for the ones marked restart.', null, null from c where c.output = 'patroni'
    union all select 0, 3, 'postgresql:', null, null from c where c.output = 'patroni'
    union all select 0, 4, '  parameters:', null, null from c where c.output = 'patroni'
    union all select 1, x.n::int, '    ' || x.setting || ': ' || x.qval || '  # ' || x.takes, x.setting, 'server' from sv x cross join c where c.output = 'patroni'
    union all select 0, 1, '# patroni.yml: read only when the cluster is first created; for a running cluster', null, null from c where c.output = 'patroni-bootstrap'
    union all select 0, 2, '# use patronictl edit-config instead.', null, null from c where c.output = 'patroni-bootstrap'
    union all select 0, 3, 'bootstrap:', null, null from c where c.output = 'patroni-bootstrap'
    union all select 0, 4, '  dcs:', null, null from c where c.output = 'patroni-bootstrap'
    union all select 0, 5, '    postgresql:', null, null from c where c.output = 'patroni-bootstrap'
    union all select 0, 6, '      parameters:', null, null from c where c.output = 'patroni-bootstrap'
    union all select 1, x.n::int, '        ' || x.setting || ': ' || x.qval || '  # ' || x.takes, x.setting, 'server' from sv x cross join c where c.output = 'patroni-bootstrap'
    -- Kubernetes operators
    union all select 0, 1, '# CloudNativePG: merge into the Cluster resource. The operator refuses the parameters', null, null from c where c.output = 'cloudnativepg'
    union all select 0, 2, '# it manages itself and says which; it runs TLS on its own.', null, null from c where c.output = 'cloudnativepg'
    union all select 0, 3, 'spec:', null, null from c where c.output = 'cloudnativepg'
    union all select 0, 4, '  postgresql:', null, null from c where c.output = 'cloudnativepg'
    union all select 0, 5, '    shared_preload_libraries:', null, null from c where c.output = 'cloudnativepg' and exists (select 1 from sv where setting = 'shared_preload_libraries')
    union all select 0, 5 + t.i::int, '      - ''' || t.lib || '''', 'shared_preload_libraries', 'server' from sv x cross join c cross join pg_catalog.unnest(pg_catalog.string_to_array(x.val, ',')) with ordinality as t(lib, i) where c.output = 'cloudnativepg' and x.setting = 'shared_preload_libraries'
    union all select 0, 900, '    parameters:', null, null from c where c.output = 'cloudnativepg'
    union all select 1, x.n::int, '      ' || x.setting || ': ' || x.qval, x.setting, 'server' from sv x cross join c where c.output = 'cloudnativepg' and x.setting not in ('shared_preload_libraries', 'ssl')
    union all select 0, 1, '# Zalando postgres-operator: merge into the postgresql resource. Spilo keeps its own', null, null from c where c.output = 'zalando'
    union all select 0, 2, '# shared_preload_libraries (pg_stat_statements is in it) and runs TLS itself.', null, null from c where c.output = 'zalando'
    union all select 0, 3, 'spec:', null, null from c where c.output = 'zalando'
    union all select 0, 4, '  postgresql:', null, null from c where c.output = 'zalando'
    union all select 0, 5, '    parameters:', null, null from c where c.output = 'zalando'
    union all select 1, x.n::int, '      ' || x.setting || ': ' || x.qval, x.setting, 'server' from sv x cross join c where c.output = 'zalando' and x.setting not in ('shared_preload_libraries', 'ssl')
    union all select 0, 1, '# Crunchy PGO (v5): merge into the PostgresCluster resource. The operator runs TLS itself.', null, null from c where c.output = 'crunchy-pgo'
    union all select 0, 2, 'spec:', null, null from c where c.output = 'crunchy-pgo'
    union all select 0, 3, '  patroni:', null, null from c where c.output = 'crunchy-pgo'
    union all select 0, 4, '    dynamicConfiguration:', null, null from c where c.output = 'crunchy-pgo'
    union all select 0, 5, '      postgresql:', null, null from c where c.output = 'crunchy-pgo'
    union all select 0, 6, '        parameters:', null, null from c where c.output = 'crunchy-pgo'
    union all select 1, x.n::int, '          ' || x.setting || ': ' || x.qval, x.setting, 'server' from sv x cross join c where c.output = 'crunchy-pgo' and x.setting <> 'ssl'
    -- Docker Compose
    union all select 0, 1, '# docker-compose.yml: the server takes these on its command line; recreate the', null, null from c where c.output = 'compose'
    union all select 0, 2, '# container to apply them (docker compose up -d).', null, null from c where c.output = 'compose'
    union all select 0, 3, 'services:', null, null from c where c.output = 'compose'
    union all select 0, 4, '  postgres:', null, null from c where c.output = 'compose'
    union all select 0, 5, '    command:', null, null from c where c.output = 'compose'
    union all select 0, 6, '      - postgres', null, null from c where c.output = 'compose'
    union all select 1, (x.n * 2)::int, '      - -c', x.setting, 'server' from sv x cross join c where c.output = 'compose'
    union all select 1, (x.n * 2 + 1)::int, '      - ''' || pg_catalog.replace(x.setting || '=' || x.val, '''', '''''') || '''', null, null from sv x cross join c where c.output = 'compose'
    -- The cloud command lines: each value in the parameter's own unit
    union all select 0, 1, '# AWS: values in each parameter''s own unit, as a parameter group takes them. The group must', null, null from c where c.output = 'aws'
    union all select 0, 2, '# be a custom one attached to the instance; AWS refuses the parameters it keeps for itself.', null, null from c where c.output = 'aws'
    union all select 0, 3, '# For Aurora some belong to the cluster parameter group (modify-db-cluster-parameter-group).', null, null from c where c.output = 'aws'
    union all select 0, 4, 'aws rds modify-db-parameter-group \', null, null from c where c.output = 'aws'
    union all select 0, 5, '  --db-parameter-group-name <your-parameter-group> \', null, null from c where c.output = 'aws'
    union all select 0, 6, '  --parameters ''[', null, null from c where c.output = 'aws'
    union all select 1, x.n::int, '    ' || pg_catalog.replace(pg_catalog.json_build_object('ParameterName', x.setting, 'ParameterValue', x.cloudval, 'ApplyMethod', case when x.takes = 'restart' then 'pending-reboot' else 'immediate' end)::text, '''', '''\''''') || case when x.ns < x.nscope then ',' else '' end, x.setting, 'server' from sv x cross join c where c.output = 'aws'
    union all select 2, 1, '  ]''', null, null from c where c.output = 'aws'
    union all select 0, 1, '# Azure Database for PostgreSQL flexible server: one command per parameter, the value in the', null, null from c where c.output = 'azure'
    union all select 0, 2, '# parameter''s own unit. The ones marked restart apply after az postgres flexible-server restart.', null, null from c where c.output = 'azure'
    union all select 1, x.n::int, 'az postgres flexible-server parameter set --resource-group <resource-group> --server-name <server> --name ' || x.setting || ' --value ''' || pg_catalog.replace(x.cloudval, '''', '''\''''') || '''' || case when x.takes = 'restart' then '  # restart' else '' end, x.setting, 'server' from sv x cross join c where c.output = 'azure'
    union all select 0, 1, '# Google Cloud SQL: --database-flags REPLACES every flag the instance has, so add the ones', null, null from c where c.output = 'gcloud'
    union all select 0, 2, '# it already sets to this list. Cloud SQL refuses flags it does not support; some changes', null, null from c where c.output = 'gcloud'
    union all select 0, 3, '# restart the instance.', null, null from c where c.output = 'gcloud'
    union all select 1, 1, 'gcloud sql instances patch <instance> --database-flags=''' || case when pg_catalog.bool_or(pg_catalog.strpos(x.cloudval, ',') > 0) then '^:^' else '' end
                           || pg_catalog.string_agg(pg_catalog.replace(x.setting || '=' || x.cloudval, '''', '''\'''''), case when (select pg_catalog.bool_or(pg_catalog.strpos(y.cloudval, ',') > 0) from sv y) then ':' else ',' end order by x.n) || '''', null, null
      from sv x cross join c where c.output = 'gcloud' group by c.output
    -- Role settings, for every output but sql
    union all select 8, 1, '', null, null from c where c.output not in ('grid', 'sql') and exists (select 1 from rv)
    union all select 8, 2, '# Role settings are not server parameters; run them as SQL:', null, null from c where c.output not in ('grid', 'sql') and exists (select 1 from rv)
    union all select 9, x.n::int, '#   ALTER ROLE ' || pg_catalog.quote_ident(x.role_name) || ' SET ' || x.setting || ' = ' || x.sqlval || ';', x.setting, 'role' from rv x cross join c where c.output not in ('grid', 'sql')
)
select q.goal, q.area, q.setting, q."applies to", q.now, q."set by", q.suggested, q.takes, q.apply, q."apply to role", q.reset, q.why, q.role_name
from (
    select g.goal, g.area, g.setting, g."applies to", g.now, g."set by", g.suggested, g.takes, g.apply, g."apply to role", g.reset, g.why, g.role_name,
           0 as k1, g.gorder as k2, g.rord as k3, g.setting as k4
    from grid g cross join c
    where c.output = 'grid'
    union all
    -- The whole script in one cell: a single cell copies exactly its value.
    select '', 'script', 'the whole script', '', '', '',
           pg_catalog.string_agg(l.line, E'\n' order by l.o1, l.o2),
           case when exists (select 1 from sv where takes = 'restart') then 'restart' when exists (select 1 from sv) then 'reload' when exists (select 1 from rv) then 'new sessions' else '' end,
           null, null, null,
           case when exists (select 1 from exv)
                then 'Copy this cell: a single cell copies exactly its value. Right-click it and Open Value in Tab to read or edit it as a document. The rows below show the same script line by line.'
                else 'Nothing to write out: every row of this run is a note to read, not a setting.' end,
           null,
           1, 0, 0, ''
    from lines l cross join c
    where c.output <> 'grid'
    group by c.output
    union all
    select coalesce(e.goal, ''), coalesce(e.area, ''), coalesce(e.setting, ''), coalesce(e."applies to", ''), coalesce(e.now, ''), coalesce(e."set by", ''),
           l.line, coalesce(e.takes, ''), null, null, null, coalesce(e.why, ''), null,
           2, l.o1, l.o2, ''
    from lines l
         left join exv e on e.setting = l.ref and e.scope = l.ref_scope
)
q
order by q.k1, q.k2, q.k3, q.k4;

-- @open what it is
-- @on setting
select q.field, q.value
from (select v.n, v.field, v.value
from pg_catalog.pg_settings s
     cross join lateral (values
       (1, 'what it does', coalesce(s.short_desc, '') || coalesce(' ' || s.extra_desc, '')),
       (2, 'type', s.vartype || coalesce(', in ' || s.unit, '')),
       (3, 'allowed', case when s.enumvals is not null then pg_catalog.array_to_string(s.enumvals, ', ')
                           else coalesce('from ' || s.min_val || ' to ' || s.max_val, '') end),
       (4, 'value now', pg_catalog.current_setting(s.name)),
       (5, 'shipped default', coalesce(s.boot_val, '')),
       (6, 'set by', s.source),
       (7, 'file', coalesce(s.sourcefile, '')),
       (8, 'line', coalesce(s.sourceline::text, '')),
       (9, 'when it can change', s.context),
       (10, 'restart pending', case when s.pending_restart then 'yes' else 'no' end)
     ) as v(n, field, value)
where s.name = $setting
union all
select 1, 'what it is', 'Not a server setting: the row says what it is about, and its why column what to do.'
where not exists (select 1 from pg_catalog.pg_settings s where s.name = $setting)) q
order by q.n;

-- @button apply
-- @on apply
-- @inline setting identifier
-- @inline suggested list
-- @confirm "Apply $setting", "Write $setting = $suggested into postgresql.auto.conf? It is $now now. It takes effect after a $takes; Reset takes it out again."
alter system set $setting = $suggested;

-- @button apply to role
-- @on "apply to role"
-- @inline role_name identifier
-- @inline setting identifier
-- @inline suggested literal
-- @confirm "Apply $setting to $role_name", "Set $setting = $suggested for every new session of $role_name? It is $now now."
alter role $role_name set $setting = $suggested;

-- @button reset
-- @on reset
-- @inline setting identifier
-- @confirm "Reset $setting", "Remove $setting from postgresql.auto.conf? What postgresql.conf and the shipped default say returns on the next Reload (or restart). It is $now now."
alter system reset $setting;

-- @button reload
-- @confirm Ask the server to re-read its configuration files now? Every setting a reload can apply takes its new value at once; the ones that need a restart keep waiting for it.
-- @at end
select pg_catalog.pg_reload_conf() as reloaded, $setting as asked_from;
