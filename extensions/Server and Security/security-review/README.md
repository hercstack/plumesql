# Security review

Who could do too much on this server, and which doors are left open? A first security review as a checklist: each finding with how serious it is and what to do.

![Security review of a test server: high findings for a role that can read the server's files, pg_hba.conf lines that let anyone in without a password, a schema where everyone may create objects and a SECURITY DEFINER function without its own search_path; medium ones for the superuser, a role with CREATEROLE and CREATEDB, a password stored as md5 and SSL turned off; low ones for passwords that never expire and databases everyone may connect to](media/security-review-findings.webp)

A test server reviewed. The worst news is at the top: the `etl` role is a member of `pg_read_server_files`, so it can read any file the server can; four lines of `pg_hba.conf` say `trust`, so anyone who reaches the port logs in without a password; and in the `shared` schema every role may create objects. Further down, `legacy_app` still has an md5 password and `ssl` is off. Each row ends with the fix.

## When to use it

- **Before a server goes to production**, or before an audit, to catch the defaults nobody changed.
- **You took over a server** and want to know who holds which powers before you trust it.
- **After adding roles, schemas or functions**, to check nothing was opened wider than meant.

## How to read it

One row per finding, the most serious first (`high`, `medium`, `low`, `info`), then the checks that found nothing as `ok` lines:

| Column | Meaning |
|---|---|
| severity | `high` (fix it), `medium` (plan it), `low` (worth knowing), `info` (a check skipped or a note), or `ok`. |
| check | Which check found it. |
| object | The role, schema, database, function, table, setting or `pg_hba.conf` line. |
| finding | What is wrong, in a few words. |
| what to do | The remedy, as a statement or a setting to change. |

The checks, in plain words:

| Check | Finds |
|---|---|
| superusers | Every superuser. A superuser can do anything, so each one is a key to the whole server: `high` when it can log in, `medium` for the built-in `postgres`, `low` when it cannot log in. |
| powerful attributes | Roles that are not superusers but can create roles or databases, skip row security or replicate (CREATEROLE, CREATEDB, BYPASSRLS, REPLICATION). |
| file and program access | Members of `pg_read_server_files`, `pg_write_server_files` and `pg_execute_server_program`, which reach the server's own files and shell. |
| password expiry | Login roles whose password never expires (no VALID UNTIL). |
| passwords | Login roles whose password is stored as an md5 hash (old and weak), and login roles with no password at all. |
| client authentication | `pg_hba.conf` lines using `trust` (no password at all; `high` over the network), `password` (sent in clear text) or `md5`. |
| public schema | Everyone may create objects in `public`, the default before PostgreSQL 15. |
| schemas | Any other schema where everyone may create objects. Someone could put a function there that runs in place of the one another user meant to call. |
| databases | Databases every role may connect to or make temporary tables in, the default. |
| security definer functions | Functions that run with their owner's rights but take the caller's `search_path`, so the caller can steer what they run; `high` when a superuser owns them. |
| row level security | Tables that have policies but row level security switched off, so the policies do nothing. |
| settings | `ssl` off, `password_encryption` md5, `log_connections` and `log_disconnections` off, `fsync` off. |

A severity is a first sorting, not a verdict: a superuser that can log in is normal on your laptop and a finding on production, and `trust` on the local socket of a single-user container is a choice.

## Try it

Open the **Extensions** side tab, find **Security review** and press its **Run**. Run it connected as a superuser to get every check: without that, the password and `pg_hba.conf` checks answer with an `info` line saying they were skipped, and the rest runs as usual.

Two findings you can make and fix on a **test server**:

```sql
create schema shared;
grant create on schema shared to public;          -- finding: schemas, high
create role etl login;
grant pg_read_server_files to etl;                -- finding: file and program access, high
```

Run it again, then undo both with the fixes it suggests: `REVOKE CREATE ON SCHEMA shared FROM PUBLIC;` and `REVOKE pg_read_server_files FROM etl;` (then `DROP ROLE etl; DROP SCHEMA shared;`).

## Good to know

It only reads: nothing is granted, revoked or changed. The two checks only a superuser may run read `pg_authid` (for how passwords are stored, never the passwords) and `pg_hba_file_rules`; they go through `query_to_xml` only when the privilege is there, which needs a server built with XML support, as every common distribution is. **Role privileges** shows what each role may do in detail, **Row security** spells out every policy, and **Health check** is the companion checklist for the data side.

## Requirements

PostgreSQL 13 or newer. Any role can run it; a superuser sees every check.
