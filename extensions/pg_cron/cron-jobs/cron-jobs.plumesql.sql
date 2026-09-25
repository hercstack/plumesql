-- @description Jobs pg_cron has scheduled: their schedule, command, database and whether they are active, and each one's recent runs
-- @face result
select j.jobid as id,
       j.jobname as job,
       j.schedule,
       j.command,
       j.database,
       j.username as "user",
       j.nodename || ':' || j.nodeport as node,
       j.active
  from cron.job j
 order by j.jobid;

-- @open runs
-- @on id
select r.runid as run,
       r.status,
       r.start_time as started,
       r.end_time as ended,
       r.return_message as message
  from cron.job_run_details r
 where r.jobid = $id
 order by r.start_time desc nulls last
 limit 200
