-- @description Background jobs (policies, refreshes) with their run record, from TimescaleDB
-- @face result
select j.job_id as id,
       j.application_name as job,
       coalesce(j.hypertable_schema || '.' || j.hypertable_name, '') as hypertable,
       j.schedule_interval as "every",
       j.scheduled as enabled,
       coalesce(s.last_run_status, '') as "last run",
       s.last_run_started_at as started,
       s.total_runs as runs,
       s.total_failures as failures,
       s.next_start
from timescaledb_information.jobs j
     left join timescaledb_information.job_stats s using (job_id)
order by j.job_id;

-- @open run history
-- @on job
select h.succeeded,
       h.start_time,
       h.finish_time,
       coalesce(h.sqlerrcode, '') as sqlstate,
       coalesce(h.err_message, '') as error
from timescaledb_information.job_history h
where h.job_id = $id
order by h.start_time desc
limit 200
