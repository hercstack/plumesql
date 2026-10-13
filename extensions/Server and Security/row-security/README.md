# Row security

Who sees which rows? Every table that limits rows per user, each rule spelled out, and the two mistakes that are easy to make and hard to notice.

![Row security on a test database: accounts has row security on with three policies (own_rows and own_updates limited to the rows the user owns, auditors a restrictive policy for pg_read_all_data); drafts has a policy but row security OFF; notes has row security forced on and no policy at all](media/row-security-policies.webp)

Three tables, three stories. On `accounts` every user sees and updates only the rows they own, and an update may not leave a negative balance. On `drafts` someone wrote a policy but never switched row security on, so it does nothing and everyone sees everything. On `notes` row security is on, even for the table's owner, but there is no policy at all, so nobody sees a single row except superusers and roles allowed to bypass row security. Two more columns sit to the right of the picture: the check an update must pass (`balance >= 0`), and a note in words on each table where a policy does nothing.

## When to use it

- **One database for many customers** (multi-tenant), where each customer must see only their own rows: check every table that should be protected is.
- **"I can't see any rows" or "they can see rows they shouldn't"**: read the rules that decide it.
- **A security review**, to find policies that are switched off and tables locked shut by mistake.

## How to read it

One row per policy, grouped by table:

| Column | Meaning |
|---|---|
| schema, table | The table. |
| row_security | `on`; `on, forced for the owner too` (the owner obeys the policies as well); or `OFF` for a table that has policies but does not apply them. |
| policy | The policy's name. |
| command | What it governs: `SELECT`, `INSERT`, `UPDATE`, `DELETE` or `ALL`. |
| kind | `permissive`: any one of them is enough to let a row through; `restrictive`: every one of them must agree. |
| roles | Whom it applies to; `public` is everyone. |
| using | Which existing rows are visible, or may be changed. |
| with_check | What new or changed rows must satisfy. |
| note | Only on a problem: no policy at all, only restrictive policies (no row gets through without a permissive one), or a policy that has no effect. |

The two fixes are one statement each: `ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;` makes its policy count, and a `CREATE POLICY ... ON notes ...` lets someone read `notes`.

## Try it

Open the **Extensions** side tab, find **Row security** and press its **Run**. On a **test database**, make a table each user sees only their part of:

```sql
create table accounts (id int primary key, owner text, balance numeric);
alter table accounts enable row level security;
create policy own_rows on accounts for select using (owner = current_user);
```

Run it again: `accounts` and `own_rows` appear. To check what a role really sees, ask as that role inside a transaction (`app_user` stands for the role you want to check):

```sql
begin;
set local role app_user;
select count(*) from accounts;
rollback;
```

## Good to know

Superusers and roles with `BYPASSRLS` skip row security entirely, and so does a table's owner unless it is forced: a policy that seems to do nothing for you may simply not apply to the role you are connected as. The policies are read from `pg_policy`, which every role can read; it only reads. **Security review** flags the switched-off policies as part of its checklist.

## Requirements

PostgreSQL 13 or newer.
