-- Brújula — el Admin general puede ver los empleados de una empresa
-- concreta (primero elige la empresa, luego ve sus perfiles), sin tener
-- que ser miembro de ninguna. Solo lectura por ahora.

create or replace function list_organization_members(p_org_id uuid)
returns table (
  id uuid,
  email text,
  full_name text,
  status text,
  is_manager boolean,
  is_supervisor boolean,
  department_name text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    m.id,
    m.email,
    m.full_name,
    m.status,
    m.is_manager,
    m.is_supervisor,
    d.name,
    m.created_at
  from members m
  left join departments d on d.id = m.department_id
  where m.organization_id = p_org_id and is_platform_admin()
  order by m.created_at;
$$;

grant execute on function list_organization_members(uuid) to authenticated;
