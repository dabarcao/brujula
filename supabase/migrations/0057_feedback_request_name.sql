-- Brújula — nombre para cada solicitud de feedback (ágil o 360
-- individual), puesto por quien la crea, para poder distinguir "estoy
-- haciendo muchas pruebas" sin depender solo de la fecha. Los ciclos 360
-- de empresa (feedback_cycles) ya tenían "name" desde el principio — esto
-- cierra el mismo hueco para el resto de flujos.
--
-- Se reutiliza la columna context_note: existía desde el esquema
-- inicial (comentario "feedback sobre la reunión del martes") pero nunca
-- se llegó a usar en ningún sitio — no hay ninguna fila con valor.

alter table feedback_requests rename column context_note to name;

-- ============================================================
-- create_ad_hoc_feedback_request — añade p_name (opcional).
-- ============================================================
drop function if exists create_ad_hoc_feedback_request(uuid[], text);

create or replace function create_ad_hoc_feedback_request(
  p_invitee_member_ids uuid[],
  p_subtype text default 'general',
  p_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  min_invitees integer;
  chosen_template_id uuid;
  new_request_id uuid;
  invitee_id uuid;
  invitee_count integer;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or caller_member.status <> 'active' then
    raise exception 'Debes iniciar sesión como empleado activo para pedir feedback.';
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

  invitee_count := coalesce(array_length(p_invitee_member_ids, 1), 0);

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if invitee_count < min_invitees then
    raise exception 'Tienes que invitar al menos a % personas.', min_invitees;
  end if;

  if caller_member.id = any(p_invitee_member_ids) then
    raise exception 'No puedes invitarte a ti mismo.';
  end if;

  if exists (
    select 1
    from unnest(p_invitee_member_ids) as invitee(id)
    left join members m on m.id = invitee.id
    where m.id is null
       or m.organization_id <> caller_member.organization_id
       or m.status <> 'active'
       or m.is_supervisor
  ) then
    raise exception 'Todos los invitados deben ser empleados activos de tu organización (el Supervisor no puede ser invitado a dar feedback).';
  end if;

  select id into chosen_template_id
  from survey_templates
  where subtype = p_subtype and organization_id = caller_member.organization_id
  limit 1;

  if chosen_template_id is null then
    select id into chosen_template_id
    from survey_templates
    where subtype = p_subtype and organization_id is null
    limit 1;
  end if;

  insert into feedback_requests (organization_id, requester_member_id, request_type, subtype, template_id, name)
  values (caller_member.organization_id, caller_member.id, 'ad_hoc', p_subtype, chosen_template_id, nullif(trim(p_name), ''))
  returning id into new_request_id;

  foreach invitee_id in array p_invitee_member_ids loop
    insert into feedback_invitations (feedback_request_id, invitee_member_id)
    values (new_request_id, invitee_id);
  end loop;

  return new_request_id;
end;
$$;

grant execute on function create_ad_hoc_feedback_request(uuid[], text, text) to authenticated;

-- ============================================================
-- create_ad_hoc_feedback_request_for_individual — añade p_name (opcional).
-- ============================================================
drop function if exists create_ad_hoc_feedback_request_for_individual(text[], text);

create or replace function create_ad_hoc_feedback_request_for_individual(
  p_invitee_emails text[],
  p_subtype text default 'general',
  p_name text default null
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

  insert into feedback_requests (organization_id, requester_member_id, request_type, subtype, template_id, name)
  values (caller_member.organization_id, caller_member.id, 'ad_hoc', p_subtype, chosen_template_id, nullif(trim(p_name), ''))
  returning id into new_request_id;

  foreach invitee_email in array normalized_emails loop
    insert into feedback_invitations (feedback_request_id, invitee_email)
    values (new_request_id, invitee_email);
  end loop;

  return new_request_id;
end;
$$;

grant execute on function create_ad_hoc_feedback_request_for_individual(text[], text, text) to authenticated;

-- ============================================================
-- create_individual_cycle_request — añade p_name (opcional).
-- ============================================================
drop function if exists create_individual_cycle_request(text[], text[], date);

create or replace function create_individual_cycle_request(
  p_evaluator_emails text[],
  p_evaluator_categories text[],
  p_closes_at date,
  p_name text default null
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
  base_template_id uuid;
  new_request_id uuid;
  i integer;
  evaluator_email text;
  category text;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or caller_member.status <> 'active' then
    raise exception 'Debes iniciar sesión como usuario activo para pedir feedback.';
  end if;

  select * into caller_org from organizations where id = caller_member.organization_id;

  if caller_org.kind <> 'individual' then
    raise exception 'Esta función es solo para cuentas individuales.';
  end if;

  if p_closes_at is null or p_closes_at <= current_date then
    raise exception 'La fecha de cierre tiene que ser una fecha futura.';
  end if;

  if exists (
    select 1 from feedback_requests
    where requester_member_id = caller_member.id
      and request_type = 'cycle'
      and status = 'open'
  ) then
    raise exception 'Ya tienes un 360 abierto. Espera a que termine antes de pedir otro.';
  end if;

  if coalesce(array_length(p_evaluator_emails, 1), 0)
      is distinct from coalesce(array_length(p_evaluator_categories, 1), 0) then
    raise exception 'Datos de evaluadores incompletos.';
  end if;

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if coalesce(array_length(p_evaluator_emails, 1), 0) < min_invitees then
    raise exception 'Tienes que invitar al menos a % personas.', min_invitees;
  end if;

  if exists (
    select 1 from unnest(p_evaluator_emails) as e
    where trim(e) = '' or lower(trim(e)) !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
  ) then
    raise exception 'Algún email no es válido.';
  end if;

  if (
    select count(distinct lower(trim(e))) from unnest(p_evaluator_emails) as e
  ) <> array_length(p_evaluator_emails, 1) then
    raise exception 'Hay un email repetido.';
  end if;

  if exists (
    select 1 from unnest(p_evaluator_emails) as e
    where lower(trim(e)) = lower(trim(caller_member.email))
  ) then
    raise exception 'No puedes invitarte a ti mismo.';
  end if;

  select id into base_template_id from survey_templates where code = 'default_360_cycle';

  insert into feedback_requests (organization_id, requester_member_id, cycle_id, request_type, template_id, closes_at, name)
  values (caller_member.organization_id, caller_member.id, null, 'cycle', base_template_id, p_closes_at, nullif(trim(p_name), ''))
  returning id into new_request_id;

  for i in 1 .. array_length(p_evaluator_emails, 1) loop
    evaluator_email := lower(trim(p_evaluator_emails[i]));
    category := p_evaluator_categories[i];

    if category not in ('manager', 'team', 'organization', 'other') then
      raise exception 'Categoría de evaluador no válida: %', category;
    end if;

    insert into feedback_invitations (feedback_request_id, invitee_email, evaluator_category)
    values (new_request_id, evaluator_email, category);
  end loop;

  insert into feedback_invitations (feedback_request_id, invitee_member_id, evaluator_category)
  values (new_request_id, caller_member.id, 'self');

  return new_request_id;
end;
$$;

grant execute on function create_individual_cycle_request(text[], text[], date, text) to authenticated;
