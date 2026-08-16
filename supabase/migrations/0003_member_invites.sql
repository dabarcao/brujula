-- Brújula — alta de empleados por invitación
--
-- Los empleados no se autorregistran (spec, sección 4.3): RRHH (org_admin)
-- los invita por email, y quedan en estado "invited" (sin cuenta de
-- Supabase Auth todavía) hasta que completan su alta y pasan a "active".
--
-- Sigue el mismo patrón que 0002_auth_bootstrap.sql: signUp guarda un dato
-- pendiente en la metadata del usuario (aquí, el token de invitación), y una
-- función security definer lo resuelve la primera vez que el usuario, ya
-- confirmado y logueado, entra en /dashboard.

alter table members
  alter column auth_user_id drop not null;

alter table members
  add column status text not null default 'active' check (status in ('invited', 'active')),
  add column invite_token uuid not null default gen_random_uuid() unique,
  add column invited_by uuid references members(id) on delete set null,
  add column accepted_at timestamptz;

-- Un mismo email no puede estar invitado/activo dos veces en la misma organización.
create unique index members_organization_email_unique_idx
  on members (organization_id, lower(email));

-- Los miembros ya existentes (creados vía create_organization_and_admin) están activos.
update members set status = 'active', accepted_at = created_at where auth_user_id is not null;

-- ============================================================
-- invite_member — un org_admin invita a un nuevo empleado
-- ============================================================
create or replace function invite_member(p_email text, p_full_name text)
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

  if caller_member.role <> 'org_admin' then
    raise exception 'Solo un administrador puede invitar empleados.';
  end if;

  if p_email is null or trim(p_email) = '' then
    raise exception 'El email es obligatorio.';
  end if;

  if exists (
    select 1 from members
    where organization_id = caller_member.organization_id
      and lower(email) = lower(trim(p_email))
  ) then
    raise exception 'Ya existe un empleado con ese email en tu organización.';
  end if;

  insert into members (organization_id, email, full_name, role, status, invited_by)
  values (
    caller_member.organization_id,
    lower(trim(p_email)),
    nullif(trim(coalesce(p_full_name, '')), ''),
    'member',
    'invited',
    caller_member.id
  )
  returning invite_token into new_token;

  return new_token;
end;
$$;

grant execute on function invite_member(text, text) to authenticated;

-- ============================================================
-- get_invite_details — lectura pública y mínima para /invitacion/[token],
-- antes de que la persona invitada tenga cuenta ni sesión.
-- ============================================================
create or replace function get_invite_details(p_token uuid)
returns table (organization_name text, email text, full_name text, valid boolean)
language sql
security definer
set search_path = public
stable
as $$
  select o.name, m.email, m.full_name, (m.status = 'invited')
  from members m
  join organizations o on o.id = m.organization_id
  where m.invite_token = p_token
  limit 1;
$$;

grant execute on function get_invite_details(uuid) to anon, authenticated;

-- ============================================================
-- accept_member_invite — el invitado, ya confirmado y logueado, vincula su
-- cuenta de Supabase Auth al registro de "members" que RRHH creó para él.
-- ============================================================
create or replace function accept_member_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target members;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para aceptar la invitación.';
  end if;

  select * into target from members where invite_token = p_token and status = 'invited';

  if target is null then
    raise exception 'Invitación no válida o ya utilizada.';
  end if;

  if lower(target.email) <> lower(auth.email()) then
    raise exception 'Esta invitación fue enviada a otro email.';
  end if;

  update members
    set auth_user_id = auth.uid(), status = 'active', accepted_at = now()
    where id = target.id;

  return target.organization_id;
end;
$$;

grant execute on function accept_member_invite(uuid) to authenticated;
