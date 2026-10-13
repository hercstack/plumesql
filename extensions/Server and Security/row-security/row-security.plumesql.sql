-- @description Row security on this database: tables that enable it, each policy with its rules, and the policies that do nothing
-- @face result
-- @color red
select v.schema, v."table", v.row_security, v.policy, v.command, v.kind, v.roles, v."using", v.with_check, v.note
from (
    -- Tables with row security on, a row per policy (or one saying there is none).
    select n.nspname as schema,
           c.relname as "table",
           case when c.relforcerowsecurity then 'on, forced for the owner too' else 'on' end as row_security,
           coalesce(p.polname::text, '') as policy,
           case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' when '*' then 'ALL' else '' end as command,
           case when p.polname is null then '' when p.polpermissive then 'permissive' else 'restrictive' end as kind,
           coalesce((select pg_catalog.string_agg(case when r.oid = 0 then 'public' else pg_catalog.pg_get_userbyid(r.oid) end, ', ')
                     from pg_catalog.unnest(p.polroles) as r(oid)), '') as roles,
           coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') as "using",
           coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '') as with_check,
           case when p.polname is null and c.relforcerowsecurity then 'no policy: only superusers and BYPASSRLS roles see a row, the owner included'
                when p.polname is null then 'no policy: nobody but the owner, superusers and BYPASSRLS roles sees a row'
                when not p.polpermissive and not exists (select 1 from pg_catalog.pg_policy q where q.polrelid = c.oid and q.polpermissive)
                then 'only restrictive policies: no row passes without a permissive one'
                else '' end as note
    from pg_catalog.pg_class c
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         left join pg_catalog.pg_policy p on p.polrelid = c.oid
    where c.relrowsecurity
    union all
    -- Policies on tables whose row security is off: they are not applied.
    select n.nspname, c.relname, 'OFF', p.polname::text,
           case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end,
           case when p.polpermissive then 'permissive' else 'restrictive' end,
           coalesce((select pg_catalog.string_agg(case when r.oid = 0 then 'public' else pg_catalog.pg_get_userbyid(r.oid) end, ', ')
                     from pg_catalog.unnest(p.polroles) as r(oid)), ''),
           coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), ''),
           coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), ''),
           'has no effect: row security is off on this table (ALTER TABLE ... ENABLE ROW LEVEL SECURITY)'
    from pg_catalog.pg_policy p
         join pg_catalog.pg_class c on c.oid = p.polrelid
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where not c.relrowsecurity
    union all
    select '', '', '', '', '', '', '', '', '', 'No row security here: no table enables it and no policy exists.'
    where not exists (select 1 from pg_catalog.pg_class c where c.relrowsecurity)
      and not exists (select 1 from pg_catalog.pg_policy)
) v
order by v.schema, v."table", v.policy;
