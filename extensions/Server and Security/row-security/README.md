# Row security

Row level security on the connected database: every table that turns it on, each of its policies spelled out (the command, permissive or restrictive, the roles, the `USING` and `WITH CHECK` expressions), and the two mistakes that are easy to make and hard to see: a table with row security on and no policy (nobody but the owner sees a row), and a policy on a table whose row security is off (it does nothing).

## What it shows

One row per policy, grouped by table:

| Column | Meaning |
|---|---|
| schema, table | The table. |
| row_security | `on`, `on, forced for the owner too` (`FORCE ROW LEVEL SECURITY`), or `OFF` for a table that has policies but does not apply them. |
| policy | The policy's name. |
| command | `SELECT`, `INSERT`, `UPDATE`, `DELETE` or `ALL`. |
| kind | `permissive` (any one of them lets a row through) or `restrictive` (every one of them must). |
| roles | Whom it applies to; `public` is everyone. |
| using | Which existing rows are visible or may be changed. |
| with_check | What new or changed rows must satisfy. |
| note | Only on a problem: no policy at all, only restrictive policies (no row passes without a permissive one), or a policy that has no effect. |

## Examples

Run it from the Extensions side tab (**Run**). On a multi-tenant database it reads like this:

| table | row_security | policy | command | kind | roles | using | note |
|---|---|---|---|---|---|---|---|
| accounts | on | own_rows | SELECT | permissive | public | (owner = CURRENT_USER) | |
| accounts | on | own_updates | UPDATE | permissive | public | (owner = CURRENT_USER) | |
| drafts | OFF | nobody | ALL | permissive | public | false | has no effect: row security is off on this table |
| notes | on, forced for the owner too | | | | | | no policy: nobody but the owner and superusers sees a row |

The fixes are one statement each: `ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;` makes the policy count, and `CREATE POLICY ... ON notes ...` lets someone read `notes`. To check what a role really sees, run a query as that role in a transaction: `BEGIN; SET LOCAL ROLE app_user; SELECT count(*) FROM accounts; ROLLBACK;`.

## Requirements

PostgreSQL 13 or newer. The policies are read from `pg_policy`, which every role can read.

## Notes

Superusers and roles with `BYPASSRLS` skip row security entirely, and a table's owner does too unless it is forced; a policy that seems to do nothing for you may simply not apply to the role you are connected as. The Security review extension checks the server as a whole.
