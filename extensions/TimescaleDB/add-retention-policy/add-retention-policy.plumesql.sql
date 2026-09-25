-- @description Add a retention policy to the hypertable this was opened on: chunks older than an age get DROPPED by a background job (TimescaleDB)
-- @for hypertable
-- @face result
-- @var drop_after "Drop chunks older than", "90 days"
-- @confirm "Add retention policy", "Schedule the DROP of every chunk of {object} older than {drop_after}? Dropped chunks are gone with their rows; a continuous aggregate over the hypertable keeps what it materialized. An existing policy is kept as it is."
select add_retention_policy({object}::regclass, drop_after => {drop_after}::interval, if_not_exists => true) as job_id;
