-- Brújula — el Admin general puede corregir el nombre y el email de un
-- empleado concreto desde /admin/empresas/[id] (hasta ahora no existía
-- ninguna forma de arreglar estos datos tras el alta -- p.ej. las cuentas
-- creadas por migración masiva con emails provisionales tipo
-- migrado1@kairos.es).
--
-- Cambiar el email de verdad exige tocar DOS sitios en sincronía:
-- auth.users (identidad real de Supabase Auth -- solo se puede tocar desde
-- Node vía la Admin API con la service_role key, no desde SQL) y
-- members.email (la copia que usa el resto de la app). Este archivo cubre
-- solo el lado de Postgres:
--   - admin_get_member: lee auth_user_id + estado actual para que el
--     servidor pueda llamar primero a la Admin API.
--   - admin_update_member: aplica el cambio en `members` una vez la Admin
--     API ya ha actualizado auth.users (o si el email no cambió, o el
--     empleado todavía está "invited" y no tiene auth_user_id).
-- Ambas gateadas por is_platform_admin(), igual que list_organization_members
-- (0019/0020) y el resto del panel de Admin general.

create or replace function admin_get_member(p_member_id uuid)
returns table (
  id uuid,
  organization_id uuid,
  auth_user_id uuid,
  email text,
  full_name text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_platform_admin() then
    raise exception 'Solo el Admin general puede editar empleados.';
  end if;

  return query
    select m.id, m.organization_id, m.auth_user_id, m.email, m.full_name
    from members m
    where m.id = p_member_id;
end;
$$;

grant execute on function admin_get_member(uuid) to authenticated;

create or replace function admin_update_member(
  p_member_id uuid,
  p_full_name text,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target members;
begin
  if not is_platform_admin() then
    raise exception 'Solo el Admin general puede editar empleados.';
  end if;

  select * into target from members where id = p_member_id;

  if target is null then
    raise exception 'Empleado no encontrado.';
  end if;

  if p_full_name is null or trim(p_full_name) = '' then
    raise exception 'El nombre es obligatorio.';
  end if;

  if p_email is null or trim(p_email) = '' then
    raise exception 'El email es obligatorio.';
  end if;

  if exists (
    select 1 from members
    where organization_id = target.organization_id
      and id <> p_member_id
      and lower(email) = lower(trim(p_email))
  ) then
    raise exception 'Ya existe otro empleado con ese email en la misma empresa.';
  end if;

  update members
  set full_name = trim(p_full_name),
      email = lower(trim(p_email))
  where id = p_member_id;
end;
$$;

grant execute on function admin_update_member(uuid, text, text) to authenticated;
