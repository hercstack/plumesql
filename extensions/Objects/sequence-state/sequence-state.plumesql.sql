-- @description Where the sequence this was opened on stands, and how much of its range is left
-- @for sequence
-- @face result
select s.last_value,
       s.start_value,
       s.increment_by,
       s.min_value,
       s.max_value,
       -- A sequence counting down runs out at its minimum.
       case when s.last_value is null then null
            when s.increment_by < 0
            then round(100.0 * (s.last_value - s.min_value) / nullif(s.start_value - s.min_value + 1, 0), 2)
            else round(100.0 * (s.max_value - s.last_value) / nullif(s.max_value - s.start_value + 1, 0), 2)
       end as percent_left,
       s.cycle,
       s.data_type::text as type
from pg_catalog.pg_sequences s
where s.schemaname = {schema} and s.sequencename = {name};
