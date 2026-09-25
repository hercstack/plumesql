-- @description Recent runs of every pg_cron job, newest first: which job, how it ended and what it said
-- @face result
-- @refresh 30s
select r.runid as run,
       r.jobid as job,
       j.jobname as name,
       r.status,
       r.start_time as started,
       r.end_time as ended,
       r.return_message as message,
       r.command
  from cron.job_run_details r
  left join cron.job j on j.jobid = r.jobid
 order by r.start_time desc nulls last
 limit 200;
