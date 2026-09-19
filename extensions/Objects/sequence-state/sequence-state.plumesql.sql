-- @description Where the sequence this was opened on stands, and how much of its range is left
-- @for sequence
-- @face result
select s.last_value,
       s.start_value,
       s.increment_by,
       s.min_value,
       s.max_value,
       case when s.last_value is null then null
            else round(100.0 * (s.max_value - s.last_value) / nullif(s.max_value - s.start_value + 1, 0), 2)
       end as percent_left,
       s.cycle,
       s.data_type::text as type
from pg_catalog.pg_sequences s
where s.schemaname = {schema} and s.sequencename = {name};
