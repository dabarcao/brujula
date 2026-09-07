-- Brújula — cómo se entrega el link (Resend, más adelante) es
-- independiente de si, una vez alguien tiene cuenta con ese email, puede
-- ver y responder desde su panel las invitaciones que ya le habían
-- llegado por email antes de registrarse. Al activarse un member (ya sea
-- aceptando una invitación de empresa o dándose de alta como cuenta
-- individual), se reclaman automáticamente las feedback_invitations
-- pendientes (invitee_member_id todavía nulo, sin responder) cuyo
-- invitee_email coincida con el suyo — pasan a salir en "Tareas
-- pendientes" igual que cualquier otra. El link por token sigue
-- funcionando también, no se invalida nada.
--
-- Nota de seguridad para cuando se revise más adelante: esto asume que
-- el email de quien se registra es realmente suyo. Hoy la confirmación
-- por email está desactivada en este proyecto (fase de pruebas) — en
-- cuanto se active de verdad (con Resend o la config de Supabase), este
-- "reclamo automático" queda protegido por esa misma confirmación, sin
-- que haga falta tocar nada aquí.

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

  update feedback_invitations
    set invitee_member_id = target.id
    where lower(invitee_email) = lower(target.email)
      and invitee_member_id is null
      and used_at is null;

  return target.organization_id;
end;
$$;

create or replace function create_individual_account(p_full_name text, p_email text)
returns table (
  member_id uuid,
  organization_id uuid,
  organization_name text,
  organization_kind text,
  is_supervisor boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  new_org_name text;
  default_department_id uuid;
  new_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if exists (select 1 from members where auth_user_id = auth.uid()) then
    raise exception 'Ya tienes una cuenta asociada.';
  end if;

  if p_email is null or trim(p_email) = '' then
    raise exception 'No se pudo determinar tu email.';
  end if;

  new_org_name := coalesce(nullif(trim(p_full_name), ''), p_email);

  insert into organizations (name, kind)
  values (new_org_name, 'individual')
  returning id into new_org_id;

  insert into departments (organization_id, name)
  values (new_org_id, 'General')
  returning id into default_department_id;

  insert into members (
    organization_id, auth_user_id, email, full_name, is_supervisor, status, department_id
  )
  values (
    new_org_id,
    auth.uid(),
    p_email,
    nullif(trim(p_full_name), ''),
    true,
    'active',
    default_department_id
  )
  returning id into new_member_id;

  update feedback_invitations
    set invitee_member_id = new_member_id
    where lower(invitee_email) = lower(p_email)
      and invitee_member_id is null
      and used_at is null;

  return query select new_member_id, new_org_id, new_org_name, 'individual'::text, true;
end;
$$;

grant execute on function create_individual_account(text, text) to authenticated;
