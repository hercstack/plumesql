-- @description Set the retention of a pg_partman partition set: how old a partition may get, and whether it is dropped or only detached, asked in a form
-- @face result
-- @var partman_schema "pg_partman schema", "partman"
-- @inline partman_schema identifier
-- @var parent "Parent table (schema.table)", ""
-- @var retention "Retention (an interval such as '90 days', empty for none)", "90 days"
-- @var keep_table "Keep old partitions as plain tables (true) or drop them (false)", "true"
-- @confirm "Set retention", "Set the retention of {parent} to {retention} (keep old partitions: {keep_table})? The next maintenance run applies it; a retention that drops partitions drops their rows with them."
update {partman_schema}.part_config
   set retention = nullif({retention}, ''),
       retention_keep_table = {keep_table}::boolean
 where parent_table = {parent}
returning parent_table as parent, retention, retention_keep_table as "keep on retention";
