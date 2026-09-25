-- @description Schedule a job with pg_cron: a name, a cron schedule and the command it runs, asked in a form
-- @face result
-- @var job "Job name", "nightly-vacuum"
-- @var schedule "Schedule (cron syntax, or an interval such as '30 seconds')", "0 3 * * *"
-- @var command "Command", "VACUUM ANALYZE"
-- @confirm "Schedule job", "Schedule {job} to run {command} on {schedule}, in this database, as the current user? A job of that name is replaced."
select cron.schedule({job}, {schedule}, {command}) as jobid;
