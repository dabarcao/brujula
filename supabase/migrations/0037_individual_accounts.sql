-- Brújula — cuentas individuales (personas que usan la app sin
-- pertenecer a ninguna empresa cliente). Se modelan como una
-- organización más, de un solo miembro — reutiliza sin tocar todo el
-- aislamiento por organization_id ya existente (RLS, umbrales,
-- percentiles...). La única diferencia es una columna `kind` para no
-- confundir una organización real con una cuenta individual en /admin,
-- informes, etc.

alter table organizations add column kind text not null default 'company'
  check (kind in ('company', 'individual'));

-- ============================================================
-- create_individual_account — el propio usuario, tras confirmar su
-- correo (ver acceptIndividualSignUp en actions/auth.ts), se crea su
-- propia organización de un solo miembro. Análogo a accept_member_invite,
-- pero aquí no hay nadie que le invite: se da de alta a sí mismo.
-- ============================================================
create or replace function create_individual_account(p_full_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  new_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if exists (select 1 from members where auth_user_id = auth.uid()) then
    raise exception 'Ya tienes una cuenta asociada.';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  if v_email is null then
    raise exception 'No se pudo determinar tu email.';
  end if;

  insert into organizations (name, kind)
  values (coalesce(nullif(trim(p_full_name), ''), v_email), 'individual')
  returning id into new_org_id;

  insert into members (organization_id, auth_user_id, email, full_name, is_supervisor, status)
  values (new_org_id, auth.uid(), v_email, nullif(trim(p_full_name), ''), true, 'active');

  return new_org_id;
end;
$$;

grant execute on function create_individual_account(text) to authenticated;

-- ============================================================
-- Invitar por email (cuentas individuales): quien invitas no está dado
-- de alta como member en ninguna organización. invitee_member_id ya era
-- opcional — se añaden las columnas que faltan.
-- ============================================================
alter table feedback_invitations add column invitee_email text;
alter table feedback_invitations add column invitee_name text;

-- ============================================================
-- create_ad_hoc_feedback_request_for_individual — mismo flujo ágil que
-- create_ad_hoc_feedback_request, pero invitando por email en vez de
-- elegir entre compañeros ya dados de alta (no aplica: una cuenta
-- individual no tiene compañeros). Solo lo puede usar una organización
-- kind = 'individual'.
-- ============================================================
create or replace function create_ad_hoc_feedback_request_for_individual(
  p_invitee_emails text[],
  p_subtype text default 'general'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  caller_org organizations;
  min_invitees integer;
  chosen_template_id uuid;
  new_request_id uuid;
  normalized_emails text[];
  invitee_email text;
  invitee_count integer;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or caller_member.status <> 'active' then
    raise exception 'Debes iniciar sesión como usuario activo para pedir feedback.';
  end if;

  select * into caller_org from organizations where id = caller_member.organization_id;

  if caller_org.kind <> 'individual' then
    raise exception 'Esta función es solo para cuentas individuales.';
  end if;

  if p_subtype not in ('meeting', 'collaboration', 'leadership_initiative', 'general', 'competencias') then
    raise exception 'Tipo de solicitud no válido.';
  end if;

  if exists (
    select 1 from feedback_requests
    where requester_member_id = caller_member.id
      and request_type = 'ad_hoc'
      and status = 'open'
  ) then
    raise exception 'Ya tienes una solicitud de feedback abierta. Ciérrala o modifícala antes de crear otra.';
  end if;

  select array_agg(distinct lower(trim(e))) into normalized_emails
  from unnest(p_invitee_emails) as e
  where trim(e) <> '';

  invitee_count := coalesce(array_length(normalized_emails, 1), 0);

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if invitee_count < min_invitees then
    raise exception 'Tienes que invitar al menos a % personas.', min_invitees;
  end if;

  if exists (
    select 1 from unnest(normalized_emails) as e
    where e !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
  ) then
    raise exception 'Algún email no es válido.';
  end if;

  if lower(trim(caller_member.email)) = any(normalized_emails) then
    raise exception 'No puedes invitarte a ti mismo.';
  end if;

  select id into chosen_template_id
  from survey_templates
  where subtype = p_subtype and organization_id is null
  limit 1;

  insert into feedback_requests (organization_id, requester_member_id, request_type, subtype, template_id)
  values (caller_member.organization_id, caller_member.id, 'ad_hoc', p_subtype, chosen_template_id)
  returning id into new_request_id;

  foreach invitee_email in array normalized_emails loop
    insert into feedback_invitations (feedback_request_id, invitee_email)
    values (new_request_id, invitee_email);
  end loop;

  return new_request_id;
end;
$$;

grant execute on function create_ad_hoc_feedback_request_for_individual(text[], text) to authenticated;
