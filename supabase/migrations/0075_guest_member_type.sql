-- Brújula — nuevo tipo de miembro de empresa: Invitado. Un empleado
-- "activo" sigue pudiendo hacer todo lo de siempre (pedir feedback, dar
-- feedback, ver su mapa de competencias y la Biblioteca). Un Invitado
-- solo puede: iniciar sesión, responder feedback cuando se lo pidan (es
-- decir, ser evaluador — nunca deja de poder serlo) y ver la Biblioteca.
-- No puede pedir feedback (ni ágil ni, si algún día aplicara, 360) ni
-- puede ser él mismo el sujeto de un ciclo 360 de la empresa — decisión
-- explícita: nunca es evaluado, solo evalúa, así que tampoco tiene mapa
-- de competencias propio (se oculta en el frontend, sección dashboard).
--
-- Se modela como un booleano más (mismo patrón que is_supervisor, no un
-- `type`/enum) — decisión explícita del usuario tras valorar ambas
-- opciones: un enum es más robusto a futuro (un member solo puede tener
-- un valor, sin combinaciones inválidas) pero toca de una vez las ~15
-- funciones que hoy comprueban is_supervisor; el booleano es el cambio
-- mínimo hoy.

alter table members add column is_guest boolean not null default false;

alter table members add constraint members_not_supervisor_and_guest
  check (not (is_supervisor and is_guest));

-- ============================================================
-- invite_member — gana p_is_guest (default false, no rompe llamadas
-- existentes).
-- ============================================================
drop function if exists invite_member(text, text, uuid);

create or replace function invite_member(
  p_email text,
  p_full_name text,
  p_department_id uuid,
  p_is_guest boolean default false
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
    organization_id, email, full_name, role, status, invited_by, department_id, is_guest
  )
  values (
    caller_member.organization_id,
    lower(trim(p_email)),
    nullif(trim(coalesce(p_full_name, '')), ''),
    'member',
    'invited',
    caller_member.id,
    p_department_id,
    coalesce(p_is_guest, false)
  )
  returning invite_token into new_token;

  return new_token;
end;
$$;

grant execute on function invite_member(text, text, uuid, boolean) to authenticated;

-- ============================================================
-- create_ad_hoc_feedback_request — un Invitado no puede iniciar una
-- solicitud de feedback (solo responder cuando se lo piden).
-- ============================================================
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

  if caller_member.is_guest then
    raise exception 'Como invitado, solo puedes responder feedback cuando te lo pidan — no puedes pedirlo tú.';
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

-- ============================================================
-- create_feedback_cycle — un Invitado nunca puede ser participante de un
-- ciclo 360 (nunca es evaluado, solo evalúa). Mismo cuerpo que la 0070,
-- solo se añade "or m.is_guest" a la validación de participantes.
-- ============================================================
create or replace function create_feedback_cycle(
  p_name text,
  p_opens_at date,
  p_closes_at date,
  p_participant_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  base_template_id uuid;
  extra_template_id uuid;
  cycle_template_id uuid;
  new_cycle_id uuid;
  q record;
  pos integer := 0;
  conflicting_names text;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or not caller_member.is_supervisor then
    raise exception 'Solo un administrador puede crear un ciclo 360.';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'El nombre del ciclo es obligatorio.';
  end if;

  if p_opens_at is null or p_closes_at is null or p_closes_at <= p_opens_at then
    raise exception 'Las fechas del ciclo no son válidas.';
  end if;

  if coalesce(array_length(p_participant_member_ids, 1), 0) = 0 then
    raise exception 'Selecciona al menos un participante para el ciclo.';
  end if;

  if exists (
    select 1
    from unnest(p_participant_member_ids) as p(id)
    left join members m on m.id = p.id
    where m.id is null
       or m.organization_id <> caller_member.organization_id
       or m.status <> 'active'
       or m.is_guest
  ) then
    raise exception 'Todos los participantes deben ser empleados activos de tu organización (un Invitado nunca puede ser evaluado).';
  end if;

  select string_agg(distinct coalesce(m.full_name, m.email), ', ')
  into conflicting_names
  from unnest(p_participant_member_ids) as p(id)
  join members m on m.id = p.id
  where exists (
    select 1
    from feedback_requests fr
    where fr.requester_member_id = p.id
      and fr.request_type = 'cycle'
      and fr.status = 'open'
  );

  if conflicting_names is not null then
    raise exception 'Ya tienen un ciclo 360 abierto, no se les puede incluir en otro hasta que termine: %', conflicting_names;
  end if;

  select id into base_template_id from survey_templates where code = 'default_360_cycle';

  select id into extra_template_id
  from survey_templates
  where organization_id = caller_member.organization_id and subtype = '360_extra';

  insert into survey_templates (code, name, organization_id)
  values ('cycle_' || gen_random_uuid()::text, trim(p_name), caller_member.organization_id)
  returning id into cycle_template_id;

  for q in
    select position, prompt, question_type, required, competency_code, applies_to, self_only, saboteador_code
    from survey_questions
    where template_id = base_template_id
    order by position
  loop
    pos := pos + 1;
    insert into survey_questions
      (template_id, position, prompt, question_type, required, competency_code, applies_to, self_only, saboteador_code)
    values
      (cycle_template_id, pos, q.prompt, q.question_type, q.required, q.competency_code, q.applies_to, q.self_only, q.saboteador_code);
  end loop;

  if extra_template_id is not null then
    for q in
      select prompt, question_type, required
      from survey_questions
      where template_id = extra_template_id
      order by position
    loop
      pos := pos + 1;
      insert into survey_questions (template_id, position, prompt, question_type, required, applies_to)
      values (cycle_template_id, pos, q.prompt, q.question_type, q.required, 'all');
    end loop;
  end if;

  insert into feedback_cycles (organization_id, name, opens_at, closes_at, template_id)
  values (caller_member.organization_id, trim(p_name), p_opens_at, p_closes_at, cycle_template_id)
  returning id into new_cycle_id;

  insert into feedback_cycle_participants (cycle_id, member_id)
  select new_cycle_id, unnest(p_participant_member_ids);

  return new_cycle_id;
end;
$$;
