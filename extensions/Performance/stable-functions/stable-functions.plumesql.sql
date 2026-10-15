-- @description PL/pgSQL functions left VOLATILE that only read: declared STABLE, PostgreSQL calls one once per query instead of once per row, and an index can serve it
-- @face result
-- @hide schema, name
-- A conservative list: a function whose source names anything that writes,
-- runs dynamic SQL or calls a VOLATILE function stays out, so a row here
-- reads only. The editor's lightbulb on the CREATE FUNCTION itself (Declare
-- the function STABLE, from the Performance refactors extension) checks the
-- body with PostgreSQL's own parser.
with fn as (
    select p.oid, n.nspname as schema_name, p.proname, pg_catalog.lower(p.prosrc) as src
    from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
         join pg_catalog.pg_language l on l.oid = p.prolang
    where l.lanname = 'plpgsql'
      and p.provolatile = 'v'
      and p.prokind = 'f'
      and p.prorettype not in ('pg_catalog.void'::pg_catalog.regtype,
                               'pg_catalog.trigger'::pg_catalog.regtype,
                               'pg_catalog.event_trigger'::pg_catalog.regtype)
      and n.nspname <> 'information_schema'
      and n.nspname !~ '^pg_'
      and not exists (select 1
                      from pg_catalog.pg_depend d
                      where d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
                        and d.objid = p.oid
                        and d.deptype = 'e')
), quiet as (
    -- Nothing that writes, runs dynamic SQL, locks or reads a sequence or
    -- the clock, even in a comment or a string: the safe side.
    select f.*
    from fn f
    where f.src !~ '\m(insert|update|delete|merge|truncate|create|drop|alter|grant|revoke|copy|execute|call|lock|notify|listen|vacuum|analyze|analyse|refresh|cluster|reindex|comment|security|commit|rollback|savepoint|set_config|nextval|setval|currval|lastval|random|gen_random_uuid|clock_timestamp|timeofday|pg_sleep\w*|dblink\w*|txid_current\w*|pg_current_xact_id\w*|pg_advisory\w*|pg_try_advisory\w*)\M'
      and f.src !~ '\mfor\s+(no\s+key\s+update|key\s+share|update|share)\M'
), volatile_names as (
    -- Every name a VOLATILE function has, in any schema, the system's too.
    select distinct pg_catalog.lower(p.proname::text) as name
    from pg_catalog.pg_proc p
    where p.provolatile = 'v'
), calls as (
    select q.oid, m[1] as name
    from quiet q
         cross join lateral pg_catalog.regexp_matches(q.src, '([a-z_][a-z0-9_$]*)\s*\(', 'g') as m
    union
    select q.oid, m[1]
    from quiet q
         cross join lateral pg_catalog.regexp_matches(q.src, '"([^"]+)"\s*\(', 'g') as m
), candidate as (
    select q.*
    from quiet q
    where not exists (select 1
                      from calls c
                           join volatile_names v on v.name = c.name
                      where c.oid = q.oid)
), reads as (
    select c.oid, pg_catalog.string_agg(distinct r.relname::text, ', ' order by r.relname::text) as names
    from candidate c
         cross join lateral (select distinct w[1] as word
                             from pg_catalog.regexp_matches(c.src, '[a-z_][a-z0-9_$]*', 'g') as w) ws
         join pg_catalog.pg_class r on r.relname = ws.word and r.relkind in ('r', 'p', 'v', 'm', 'f')
         join pg_catalog.pg_namespace rn on rn.oid = r.relnamespace
    where rn.nspname <> 'information_schema'
      and rn.nspname !~ '^pg_'
    group by c.oid
)
select c.oid::pg_catalog.regprocedure::text as function,
       case when p.proretset then 'setof ' else '' end || pg_catalog.format_type(p.prorettype, null) as returns,
       'plpgsql' as language,
       case when r.names is not null then 'reads tables, writes nothing' else 'computes from its arguments' end
       || case when o.overloads > 1 then ', overloaded' else '' end as why,
       coalesce(r.names, '') as reads,
       case when o.overloads = 1 then 'declare stable' end as stable,
       c.schema_name as schema,
       c.proname::text as name
from candidate c
     join pg_catalog.pg_proc p on p.oid = c.oid
     left join reads r on r.oid = c.oid
     cross join lateral (select pg_catalog.count(*) as overloads
                         from pg_catalog.pg_proc s
                         where s.pronamespace = p.pronamespace
                           and s.proname = p.proname) o
order by c.schema_name, c.proname, 1;

-- @open definition
-- @on function
select pg_catalog.repeat(case when pg_catalog.getdatabaseencoding() = 'UTF8'
                              then pg_catalog.convert_from(pg_catalog.decode('c2a0', 'hex'), 'UTF8')
                              else ' ' end,
                         pg_catalog.length(l.text) - pg_catalog.length(pg_catalog.ltrim(l.text, ' ')))
       || pg_catalog.ltrim(l.text, ' ') as definition
from rows from (pg_catalog.regexp_split_to_table(pg_catalog.rtrim(pg_catalog.pg_get_functiondef($function::pg_catalog.regprocedure), pg_catalog.chr(10)), pg_catalog.chr(10))) with ordinality as l(text, n)
order by l.n;

-- @button declare stable
-- @on stable
-- @inline schema identifier
-- @inline name identifier
-- @confirm "Declare $function STABLE", "Run alter function $schema.$name stable? PostgreSQL then calls it once per query instead of once per row, and an index can serve a condition on it. Only for a function that writes nothing and calls nothing VOLATILE: a STABLE function that writes fails when it runs. Declaring it VOLATILE again (alter function $schema.$name volatile) undoes it."
alter function $schema.$name stable;
