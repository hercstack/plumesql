-- @description Server settings this installation changed from the shipped default
-- @face result
select name,
       coalesce(setting, '') as setting,
       coalesce(unit, '') as unit,
       source,
       coalesce(sourcefile, '') as "from file"
from pg_catalog.pg_settings
where source not in ('default', 'override', 'client', 'session')
  and setting is distinct from boot_val
order by name;

-- @open where it comes from
-- @on name
select v.field, v.value
from pg_catalog.pg_settings s
     cross join lateral (values
       (1, 'what it does', coalesce(s.short_desc, '')),
       (2, 'value now', coalesce(s.setting, '') || coalesce(' ' || s.unit, '')),
       (3, 'shipped default', coalesce(s.boot_val, '')),
       (4, 'value on reset', coalesce(s.reset_val, '')),
       (5, 'set by', s.source),
       (6, 'file', coalesce(s.sourcefile, '')),
       (7, 'line', coalesce(s.sourceline::text, '')),
       (8, 'when it can change', s.context)
     ) as v(n, field, value)
where s.name = $name
order by v.n
