-- @description A first security review of this server as a checklist: each finding with a severity and what to do
-- @face result
-- @color red
-- Two checks read what only a superuser may (pg_authid for passwords,
-- pg_hba_file_rules for client authentication). They run through
-- query_to_xml only when the privilege is there, so the rest of the
-- review still answers for anyone, and say so when they were skipped.
with checks (no, name, advice) as (
    values (1, 'superusers', 'Keep superuser to one or two break-glass roles; give applications and people only what they use.'),
           (2, 'powerful attributes', 'Grant CREATEROLE, CREATEDB, BYPASSRLS and REPLICATION only to the roles whose job needs them.'),
           (3, 'file and program access', 'Membership in these roles reads or writes server files or runs programs as the server: revoke it unless that is the role''s job.'),
           (4, 'password expiry', 'Set VALID UNTIL on personal login roles, or accept that their passwords never expire.'),
           (5, 'passwords', 'Set a scram-sha-256 password (password_encryption = scram-sha-256, then ALTER ROLE ... PASSWORD) or use certificate or external authentication.'),
           (6, 'client authentication', 'Replace trust and password lines in pg_hba.conf with scram-sha-256 or cert, then reload.'),
           (7, 'public schema', 'REVOKE CREATE ON SCHEMA public FROM PUBLIC; since PostgreSQL 15 that is the default.'),
           (8, 'schemas', 'REVOKE CREATE ON SCHEMA ... FROM PUBLIC: anyone who can create objects in a schema on the search path can capture other users'' calls.'),
           (9, 'databases', 'REVOKE CONNECT (and TEMPORARY) ON DATABASE ... FROM PUBLIC, then grant CONNECT to the roles that use it.'),
           (10, 'security definer functions', 'ALTER FUNCTION ... SET search_path = pg_catalog, pg_temp (plus the schemas it needs), or the caller''s search_path decides what it runs.'),
           (11, 'row level security', 'ALTER TABLE ... ENABLE ROW LEVEL SECURITY where policies exist; without it they are ignored.'),
           (12, 'settings', 'Change the setting in postgresql.conf or with ALTER SYSTEM, then reload or restart as it requires.')
), authid as (
    select x.rolname, x.pw
    from xmltable('/table/row'
             passing (case when pg_catalog.has_table_privilege('pg_catalog.pg_authid', 'select')
                           then pg_catalog.query_to_xml(
                                  'select a.rolname, case when a.rolpassword is null then ''none''
                                                          when pg_catalog.left(a.rolpassword, 3) = ''md5'' then ''md5''
                                                          else ''scram'' end as pw
                                     from pg_catalog.pg_authid a
                                    where a.rolcanlogin', false, false, '')
                      end)
             columns rolname text path 'rolname', pw text path 'pw') as x
), hba as (
    select x.line_number, x.type, x.database, x.user_name, x.address, x.auth_method
    from xmltable('/table/row'
             passing (case when pg_catalog.has_table_privilege('pg_catalog.pg_hba_file_rules', 'select')
                            and pg_catalog.has_function_privilege('pg_catalog.pg_hba_file_rules()', 'execute')
                           then pg_catalog.query_to_xml(
                                  'select h.line_number, h.type,
                                          pg_catalog.array_to_string(h.database, '','') as database,
                                          pg_catalog.array_to_string(h.user_name, '','') as user_name,
                                          h.address, h.auth_method
                                     from pg_catalog.pg_hba_file_rules h
                                    where h.error is null', false, false, '')
                      end)
             columns line_number int path 'line_number', type text path 'type', database text path 'database',
                     user_name text path 'user_name', address text path 'address', auth_method text path 'auth_method') as x
), findings (no, severity, object, finding) as (
    -- 1. every superuser, and whether it can log in
    select 1, case when not r.rolcanlogin then 'low' when r.oid = 10 then 'medium' else 'high' end, r.rolname::text,
           case when r.rolcanlogin then 'superuser that can log in' else 'superuser (no login)' end
             || case when r.oid = 10 then ', the bootstrap superuser' else '' end
    from pg_catalog.pg_roles r
    where r.rolsuper
    union all
    -- 2. powerful attributes on roles that are not superusers anyway
    select 2, case when r.rolbypassrls or r.rolcreaterole then 'medium' else 'low' end, r.rolname::text,
           pg_catalog.array_to_string(array[case when r.rolcreaterole then 'CREATEROLE' end,
                                            case when r.rolcreatedb then 'CREATEDB' end,
                                            case when r.rolbypassrls then 'BYPASSRLS' end,
                                            case when r.rolreplication then 'REPLICATION' end], ', ')
             || case when r.rolcanlogin then ', can log in' else '' end
    from pg_catalog.pg_roles r
    where not r.rolsuper
      and (r.rolcreaterole or r.rolcreatedb or r.rolbypassrls or r.rolreplication)
      and r.rolname !~ '^pg_'
    union all
    -- 3. members of the roles that reach the file system and the shell
    select 3, 'high', m.rolname::text, 'member of ' || g.rolname
    from pg_catalog.pg_auth_members am
         join pg_catalog.pg_roles g on g.oid = am.roleid
         join pg_catalog.pg_roles m on m.oid = am.member
    where g.rolname in ('pg_read_server_files', 'pg_write_server_files', 'pg_execute_server_program')
      and not m.rolsuper
    union all
    -- 4. login roles whose password never expires
    select 4, 'low', r.rolname::text, 'can log in, no password expiry (VALID UNTIL)'
    from pg_catalog.pg_roles r
    where r.rolcanlogin
      and r.rolvaliduntil is null
      and not r.rolsuper
    union all
    -- 5. passwords: none, or the md5 hash
    select 5, case when a.pw = 'none' then 'info' else 'medium' end, a.rolname,
           case when a.pw = 'none' then 'can log in with no password set; only non-password authentication can admit it'
                else 'password stored as an md5 hash, deprecated since PostgreSQL 18' end
    from authid a
    where a.pw in ('none', 'md5')
    union all
    select 5, 'info', '', 'not checked: reading pg_authid needs superuser'
    where not pg_catalog.has_table_privilege('pg_catalog.pg_authid', 'select')
    union all
    -- 6. pg_hba.conf lines that admit without a real password check
    select 6,
           case when h.auth_method = 'trust' and h.type <> 'local' then 'high'
                when h.auth_method in ('trust', 'password') then 'medium'
                else 'low' end,
           'pg_hba.conf line ' || h.line_number,
           pg_catalog.concat_ws(' ', h.type, h.database, h.user_name, h.address) || ': ' || h.auth_method
    from hba h
    where h.auth_method in ('trust', 'password', 'md5')
    union all
    select 6, 'info', '', 'not checked: reading pg_hba_file_rules needs superuser'
    where not (pg_catalog.has_table_privilege('pg_catalog.pg_hba_file_rules', 'select')
               and pg_catalog.has_function_privilege('pg_catalog.pg_hba_file_rules()', 'execute'))
    union all
    -- 7 and 8. PUBLIC may create objects in a schema
    select case when n.nspname = 'public' then 7 else 8 end, 'high', n.nspname::text, 'PUBLIC has CREATE'
    from pg_catalog.pg_namespace n
         cross join lateral pg_catalog.aclexplode(coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) a
    where a.grantee = 0
      and a.privilege_type = 'CREATE'
    union all
    -- 9. PUBLIC may connect to a database, or create temporary tables in it
    select 9, 'low', d.datname::text,
           'PUBLIC has ' || pg_catalog.string_agg(a.privilege_type, ', ' order by a.privilege_type)
    from pg_catalog.pg_database d
         cross join lateral pg_catalog.aclexplode(coalesce(d.datacl, pg_catalog.acldefault('d', d.datdba))) a
    where a.grantee = 0
      and a.privilege_type in ('CONNECT', 'TEMPORARY')
      and d.datallowconn
    group by d.datname
    union all
    -- 10. SECURITY DEFINER functions without a search_path of their own
    select 10, case when o.rolsuper then 'high' else 'medium' end,
           n.nspname || '.' || p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
           'SECURITY DEFINER owned by ' || o.rolname || case when o.rolsuper then ' (a superuser)' else '' end || ', no search_path set'
    from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         join pg_catalog.pg_roles o on o.oid = p.proowner
    where p.prosecdef
      and n.nspname not in ('pg_catalog', 'information_schema')
      and not exists (select 1 from pg_catalog.unnest(p.proconfig) cfg where cfg like 'search_path=%')
    union all
    -- 11. policies that do nothing
    select 11, 'medium', n.nspname || '.' || c.relname,
           pg_catalog.count(*) || ' polic' || case when pg_catalog.count(*) = 1 then 'y' else 'ies' end || ', row level security disabled'
    from pg_catalog.pg_class c
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         join pg_catalog.pg_policy pol on pol.polrelid = c.oid
    where not c.relrowsecurity
    group by n.nspname, c.relname
    union all
    -- 12. settings a reviewer looks at first
    select 12, s.sev, s.name, s.name || ' = ' || pg_catalog.quote_literal(pg_catalog.current_setting(s.name)) || ': ' || s.why
    -- log_connections is a list of aspects from PostgreSQL 18, empty when off.
    from (values ('ssl', 'medium', array['off'], 'connections travel unencrypted'),
                 ('password_encryption', 'medium', array['md5'], 'new passwords are stored as md5 hashes'),
                 ('log_connections', 'low', array['off', ''], 'who connected is not in the log'),
                 ('log_disconnections', 'info', array['off'], 'session ends are not in the log'),
                 ('fsync', 'high', array['off'], 'a crash can corrupt the cluster')) as s(name, sev, bad, why)
    where pg_catalog.current_setting(s.name) = any (s.bad)
), result as (
    select f.severity, ch.no, ch.name, f.object, f.finding,
           case when f.severity = 'info' and f.finding like 'not checked:%' then 'Run the review as a superuser to include this check.'
                else ch.advice end as advice
    from findings f
         join checks ch on ch.no = f.no
    union all
    select 'ok', ch.no, ch.name, '', 'nothing found', ''
    from checks ch
    where not exists (select 1 from findings f where f.no = ch.no)
)
select r.severity,
       r.name as "check",
       r.object,
       r.finding,
       r.advice as "what to do"
from result r
order by pg_catalog.array_position(array['high', 'medium', 'low', 'info', 'ok'], r.severity), r.no, r.object;
