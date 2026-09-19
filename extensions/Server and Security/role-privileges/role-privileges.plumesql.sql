-- @description Every role with what it may do, its members and everything granted to it; grants and memberships are managed where they show
-- @face result
-- @hide schema, relation, for_role, of_role
select r.rolname as role,
       case when r.rolsuper then 'yes' else '' end as superuser,
       case when r.rolcanlogin then 'yes' else '' end as "can log in",
       case when r.rolcreatedb then 'yes' else '' end as "create db",
       case when r.rolcreaterole then 'yes' else '' end as "create role",
       case when r.rolreplication then 'yes' else '' end as replication,
       case when r.rolbypassrls then 'yes' else '' end as "bypass rls",
       case when r.rolconnlimit < 0 then '' else r.rolconnlimit::text end as "conn limit",
       coalesce(r.rolvaliduntil::text, '') as "valid until",
       coalesce((select pg_catalog.string_agg(g.rolname, ', ' order by g.rolname)
                   from pg_catalog.pg_auth_members m
                        join pg_catalog.pg_roles g on g.oid = m.roleid
                  where m.member = r.oid), '') as "member of"
from pg_catalog.pg_roles r
order by r.rolname;

-- @open privileges
-- @on role
with acl as (
    select 'database' as kind, d.datname::text as object,
           a.privilege_type as privilege, a.is_grantable as grantable,
           pg_catalog.pg_get_userbyid(a.grantor) as granted_by,
           null::text as schema, null::text as relation, r.rolname as for_role
    from pg_catalog.pg_database d
         cross join lateral pg_catalog.aclexplode(d.datacl) a
         join pg_catalog.pg_roles r on r.oid = a.grantee
    where r.rolname = $role
    union all
    select 'schema', n.nspname::text,
           a.privilege_type, a.is_grantable, pg_catalog.pg_get_userbyid(a.grantor),
           null, null, r.rolname
    from pg_catalog.pg_namespace n
         cross join lateral pg_catalog.aclexplode(n.nspacl) a
         join pg_catalog.pg_roles r on r.oid = a.grantee
    where r.rolname = $role
    union all
    select case c.relkind
             when 'v' then 'view'
             when 'm' then 'materialized view'
             when 'S' then 'sequence'
             when 'f' then 'foreign table'
             else 'table'
           end,
           n.nspname || '.' || c.relname,
           a.privilege_type, a.is_grantable, pg_catalog.pg_get_userbyid(a.grantor),
           case when c.relkind in ('r', 'p', 'v', 'm', 'f') then n.nspname end,
           case when c.relkind in ('r', 'p', 'v', 'm', 'f') then c.relname end,
           r.rolname
    from pg_catalog.pg_class c
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         cross join lateral pg_catalog.aclexplode(c.relacl) a
         join pg_catalog.pg_roles r on r.oid = a.grantee
    where r.rolname = $role
    union all
    select 'column', n.nspname || '.' || c.relname || '.' || at.attname,
           a.privilege_type, a.is_grantable, pg_catalog.pg_get_userbyid(a.grantor),
           null, null, r.rolname
    from pg_catalog.pg_attribute at
         join pg_catalog.pg_class c on c.oid = at.attrelid
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         cross join lateral pg_catalog.aclexplode(at.attacl) a
         join pg_catalog.pg_roles r on r.oid = a.grantee
    where r.rolname = $role and at.attnum > 0 and not at.attisdropped
    union all
    select case when pr.prokind = 'p' then 'procedure' else 'function' end,
           n.nspname || '.' || pr.proname || '(' || pg_catalog.pg_get_function_identity_arguments(pr.oid) || ')',
           a.privilege_type, a.is_grantable, pg_catalog.pg_get_userbyid(a.grantor),
           null, null, r.rolname
    from pg_catalog.pg_proc pr
         join pg_catalog.pg_namespace n on n.oid = pr.pronamespace
         cross join lateral pg_catalog.aclexplode(pr.proacl) a
         join pg_catalog.pg_roles r on r.oid = a.grantee
    where r.rolname = $role
)
select p.kind,
       p.object,
       pg_catalog.string_agg(p.privilege, ', ' order by p.privilege) as privileges,
       case when pg_catalog.bool_or(p.grantable) then 'yes' else '' end as "with grant option",
       pg_catalog.string_agg(distinct p.granted_by, ', ' order by p.granted_by) as "granted by",
       case when p.relation is not null then 'revoke all' end as revoke,
       p.schema, p.relation, p.for_role
from acl p
group by p.kind, p.object, p.schema, p.relation, p.for_role
union all
select '', 'No explicit grant to this role anywhere. It may still act through PUBLIC, through roles it is a member of, and on what it owns.',
       '', '', '', null, null, null, $role::text
where not exists (select 1 from acl)
order by 1, 2;

-- @button revoke all
-- @on revoke
-- @inline for_role identifier
-- @inline schema identifier
-- @inline relation identifier
-- @confirm "Revoke all", "Revoke every privilege on $schema.$relation from $for_role?"
revoke all privileges on table $schema.$relation from $for_role;

-- @button grant select
-- @at end
-- @var in_schema "Schema", "public"
-- @pick in_schema select n.nspname as in_schema from pg_catalog.pg_namespace n where n.nspname !~ '^pg_' and n.nspname <> 'information_schema' order by 1
-- @var on_relation "Table or view", ""
-- @pick on_relation select c.relname as on_relation, n.nspname as schema, case c.relkind when 'v' then 'view' when 'm' then 'materialized view' when 'f' then 'foreign table' else 'table' end as kind from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r', 'p', 'v', 'm', 'f') and n.nspname !~ '^pg_' and n.nspname <> 'information_schema' order by n.nspname, c.relname
-- @inline for_role identifier
-- @inline in_schema identifier
-- @inline on_relation identifier
-- @confirm "Grant SELECT", "Grant SELECT on {in_schema}.{on_relation} to $for_role?"
grant select on table {in_schema}.{on_relation} to $for_role;

-- @button grant all
-- @at end
-- @var in_schema "Schema", "public"
-- @pick in_schema select n.nspname as in_schema from pg_catalog.pg_namespace n where n.nspname !~ '^pg_' and n.nspname <> 'information_schema' order by 1
-- @var on_relation "Table or view", ""
-- @pick on_relation select c.relname as on_relation, n.nspname as schema, case c.relkind when 'v' then 'view' when 'm' then 'materialized view' when 'f' then 'foreign table' else 'table' end as kind from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where c.relkind in ('r', 'p', 'v', 'm', 'f') and n.nspname !~ '^pg_' and n.nspname <> 'information_schema' order by n.nspname, c.relname
-- @inline for_role identifier
-- @inline in_schema identifier
-- @inline on_relation identifier
-- @confirm "Grant ALL", "Grant ALL PRIVILEGES on {in_schema}.{on_relation} to $for_role?"
grant all privileges on table {in_schema}.{on_relation} to $for_role;

-- @open members
-- @at end
select m.rolname as member,
       case when am.admin_option then 'yes' else '' end as "admin option",
       case when m.rolcanlogin then 'yes' else '' end as "can log in",
       pg_catalog.pg_get_userbyid(am.grantor) as "granted by",
       g.rolname as of_role
from pg_catalog.pg_auth_members am
     join pg_catalog.pg_roles g on g.oid = am.roleid
     join pg_catalog.pg_roles m on m.oid = am.member
where g.rolname = $role
order by m.rolname;

-- @button revoke membership
-- @inline member identifier
-- @inline of_role identifier
-- @confirm "Revoke membership", "Remove $member from $of_role? What the membership granted goes with it."
revoke $of_role from $member;

-- @button grant membership
-- @at end
-- @var new_member "Role to add as a member", ""
-- @pick new_member select r.rolname as new_member, case when r.rolcanlogin then 'yes' else '' end as "can log in" from pg_catalog.pg_roles r order by 1
-- @inline role identifier
-- @inline new_member identifier
-- @confirm "Grant membership", "Add {new_member} as a member of $role?"
grant $role to {new_member};
