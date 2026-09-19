-- @description Policies and other background jobs on the hypertable or continuous aggregate this was opened on, with their run record, from TimescaleDB
-- @for hypertable, continuous aggregate
-- @face result
select j.job_id as id,
       j.application_name as job,
       j.proc_name as "procedure",
       j.schedule_interval as "every",
       j.config,
       j.scheduled as enabled,
       coalesce(s.last_run_status, '') as "last run",
       s.last_run_started_at as started,
       s.next_start as "next",
       s.total_runs as runs,
       s.total_failures as failures
  from timescaledb_information.jobs j
  left join timescaledb_information.job_stats s on s.job_id = j.job_id
 where (j.hypertable_schema, j.hypertable_name) in (
         select {schema}::name, {name}::name
         union all
         select ca.materialization_hypertable_schema, ca.materialization_hypertable_name
           from timescaledb_information.continuous_aggregates ca
          where ca.view_schema = {schema} and ca.view_name = {name})
 order by j.job_id;
