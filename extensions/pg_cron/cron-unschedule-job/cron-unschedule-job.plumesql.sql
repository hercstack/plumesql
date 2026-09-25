-- @description Remove a pg_cron job by name, asked in a form
-- @face result
-- @var job "Job name", "nightly-vacuum"
-- @confirm "Remove job", "Remove the pg_cron job {job}? Its run history stays."
select j.jobname as job,
       cron.unschedule(j.jobid) as removed
  from cron.job j
 where j.jobname = {job};
