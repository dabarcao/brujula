-- Story 6.1 (_bmad-output/implementation-artifacts/
-- spec-6-1-paginate-admin-organizations-list.md): extends
-- list_organizations() (supabase/migrations/0017_supervisor_and_admin_
-- management.sql) with optional p_limit/p_offset plus a total_count column
-- (count(*) over()), so /admin can paginate instead of rendering every
-- organization at once. p_limit defaults to null -- Postgres treats
-- `LIMIT NULL` as "no limit" -- and p_offset defaults to 0, so a
-- zero-argument call (admin/empresas/[id]/page.tsx, db/admin.ts's
-- listOrganizations()) is byte-identical to today's unpaginated behavior.
-- `where is_platform_admin()` stays verbatim, in its original position,
-- filtering rows before count(*) over() runs -- a non-admin caller still
-- gets zero rows, never an error, never a fabricated total_count.
--
-- The old zero-argument list_organizations() (0017) must be dropped first:
-- `create or replace function` only replaces a function with the exact same
-- argument list. Since the new signature has two (defaulted) parameters, a
-- bare `create or replace` here would instead ADD a second, overloaded
-- function -- and a zero-argument call would then be ambiguous between "the
-- 0-arg function" and "the 2-arg function called via its defaults"
-- (verified locally: Postgres raises `function list_organizations() is not
-- unique`). That would break both remaining zero-arg call sites
-- (admin/empresas/[id]/page.tsx, db/admin.ts's listOrganizations()) --
-- exactly the backward compatibility this migration must preserve.
drop function if exists list_organizations();

create or replace function list_organizations(
  p_limit integer default null,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  supervisor_email text,
  supervisor_status text,
  total_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    o.id,
    o.name,
    o.created_at,
    m.email,
    m.status,
    count(*) over() as total_count
  from organizations o
  left join members m on m.organization_id = o.id and m.is_supervisor
  where is_platform_admin()
  order by o.created_at desc, o.id desc
  -- Clamp both to non-negative: a negative p_offset/p_limit would otherwise
  -- reach Postgres's raw "LIMIT/OFFSET must not be negative" error over
  -- REST. coalesce(p_limit, 2147483647) preserves "p_limit default null" ==
  -- "no limit" (an int4-max row count is effectively unbounded for this
  -- table) for the two zero-arg backward-compatible call sites.
  limit greatest(coalesce(p_limit, 2147483647), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function list_organizations(integer, integer) to authenticated;
