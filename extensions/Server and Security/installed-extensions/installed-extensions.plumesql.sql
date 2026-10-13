-- @description Extensions of this database: installed ones with a newer version ready, the rest, and every one the server offers
-- @face result
-- @color lavender
select v.extension, v.installed, v.available, v.status, v.schema, v.description, v.statement
from (
    select case when a.default_version is not null and a.default_version is distinct from e.extversion then 1 else 2 end as ord,
           e.extname::text as extension,
           e.extversion as installed,
           coalesce(a.default_version, '') as available,
           case when a.default_version is null then 'installed, no longer offered'
                when a.default_version is distinct from e.extversion then 'update available'
                else 'installed' end as status,
           n.nspname::text as schema,
           coalesce(a.comment, '') as description,
           case when a.default_version is not null and a.default_version is distinct from e.extversion
                then 'ALTER EXTENSION ' || pg_catalog.quote_ident(e.extname) || ' UPDATE;' else '' end as statement
    from pg_catalog.pg_extension e
         join pg_catalog.pg_namespace n on n.oid = e.extnamespace
         left join pg_catalog.pg_available_extensions a on a.name = e.extname
    union all
    select 3, a.name::text, '', a.default_version, 'not installed', '', coalesce(a.comment, ''),
           'CREATE EXTENSION ' || pg_catalog.quote_ident(a.name) || ';'
    from pg_catalog.pg_available_extensions a
    where a.installed_version is null
) v
order by v.ord, v.extension;
