-- @description Every server configuration parameter with its value and what changing it takes; Set value writes it through ALTER SYSTEM, Reload applies what a reload can
-- @face result
-- @color orange
select s.name,
       coalesce(s.setting, '') as value,
       coalesce(s.unit, '') as unit,
       s.vartype as type,
       s.context as "when it can change",
       s.source,
       case when s.pending_restart then 'yes' else '' end as "restart pending",
       s.category
from pg_catalog.pg_settings s
order by s.category, s.name;

-- @open what it is
-- @on name
select v.field, v.value
from pg_catalog.pg_settings s
     cross join lateral (values
       (1, 'what it does', coalesce(s.short_desc, '') || coalesce(' ' || s.extra_desc, '')),
       (2, 'type', s.vartype || coalesce(', in ' || s.unit, '')),
       (3, 'allowed', case when s.enumvals is not null then pg_catalog.array_to_string(s.enumvals, ', ')
                           else coalesce('from ' || s.min_val || ' to ' || s.max_val, '') end),
       (4, 'value now', coalesce(s.setting, '')),
       (5, 'shipped default', coalesce(s.boot_val, '')),
       (6, 'value on reset', coalesce(s.reset_val, '')),
       (7, 'set by', s.source),
       (8, 'file', coalesce(s.sourcefile, '')),
       (9, 'line', coalesce(s.sourceline::text, '')),
       (10, 'when it can change', s.context),
       (11, 'restart pending', case when s.pending_restart then 'yes' else 'no' end)
     ) as v(n, field, value)
where s.name = $name
order by v.n;

-- @button set value
-- @var new_value "New value", ""
-- @inline name identifier
-- @inline new_value literal
-- @confirm "Set $name", "Write $name = {new_value} into postgresql.auto.conf? It takes effect after Reload (or a restart where required); Reset undoes it."
-- @at end
alter system set $name = {new_value};

-- @button reset
-- @inline name identifier
-- @confirm Remove $name from postgresql.auto.conf? What postgresql.conf and the shipped default say returns on the next Reload.
-- @at end
alter system reset $name;

-- @button reload
-- @confirm Ask the server to re-read its configuration files now? Every parameter a reload can apply takes its new value at once; the postmaster ones keep waiting for a restart ("restart pending" shows them).
-- @at end
select pg_catalog.pg_reload_conf() as reloaded, $name as asked_from;
