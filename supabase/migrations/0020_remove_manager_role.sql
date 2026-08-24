-- Brújula — se elimina el concepto de "Jefe" (is_manager) del modelo de
-- usuarios (docs/spec.md v0.5, sección 2): no hay distinción de rol
-- interno para pedir o responder feedback, todas las preguntas del
-- ciclo 360 se hacen a cualquier empleado por igual.

-- Las preguntas que antes eran "solo responsable" pasan a aplicarse a
-- todo el mundo. Afecta tanto a la plantilla base como a cualquier ciclo
-- ya creado que copió esas preguntas de ella.
update survey_questions set applies_to = 'all' where applies_to = 'manager_only';

-- invite_member — deja de aceptar/guardar is_manager.
drop function if exists invite_member(text, text, uuid, boolean);

create or replace function invite_member(
  p_email text,
  p_full_name text,
  p_department_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  new_token uuid;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null then
    raise exception 'Debes iniciar sesión para invitar a un empleado.';
  end if;

  if not caller_member.is_supervisor then
    raise exception 'Solo un administrador puede invitar empleados.';
  end if;

  if p_email is null or trim(p_email) = '' then
    raise exception 'El email es obligatorio.';
  end if;

  if p_department_id is null or not exists (
    select 1 from departments
    where id = p_department_id and organization_id = caller_member.organization_id
  ) then
    raise exception 'Selecciona un departamento válido de tu organización.';
  end if;

  if exists (
    select 1 from members
    where organization_id = caller_member.organization_id
      and lower(email) = lower(trim(p_email))
  ) then
    raise exception 'Ya existe un empleado con ese email en tu organización.';
  end if;

  insert into members (
    organization_id, email, full_name, role, status, invited_by, department_id
  )
  values (
    caller_member.organization_id,
    lower(trim(p_email)),
    nullif(trim(coalesce(p_full_name, '')), ''),
    'member',
    'invited',
    caller_member.id,
    p_department_id
  )
  returning invite_token into new_token;

  return new_token;
end;
$$;

grant execute on function invite_member(text, text, uuid) to authenticated;

-- list_organization_members — quita is_manager del resultado (cambia la
-- forma de la tabla devuelta, hay que borrar antes de recrear).
drop function if exists list_organization_members(uuid);

create or replace function list_organization_members(p_org_id uuid)
returns table (
  id uuid,
  email text,
  full_name text,
  status text,
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
    m.is_supervisor,
    d.name,
    m.created_at
  from members m
  left join departments d on d.id = m.department_id
  where m.organization_id = p_org_id and is_platform_admin()
  order by m.created_at;
$$;

grant execute on function list_organization_members(uuid) to authenticated;

-- La columna queda sin usar en el código a partir de aquí: se elimina.
alter table members drop column is_manager;
