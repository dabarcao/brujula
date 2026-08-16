-- Brújula — flujo ágil de feedback: plantilla guiada, solicitudes,
-- invitaciones y respuestas.
--
-- Incluye también un arreglo de RLS: la política original de
-- "feedback_responses visible to requester above threshold" (migración
-- 0001) contaba las respuestas con una subconsulta sobre la propia tabla
-- feedback_responses, lo que dispara la misma política otra vez para cada
-- fila candidata — la misma recursión infinita que ya arreglamos en
-- 0004_fix_rls_recursion.sql, pero aquí en la tabla de respuestas. Nunca se
-- había probado hasta ahora porque hasta esta migración no existía ningún
-- flujo que insertara respuestas reales. Se arregla con una función
-- security definer que cuenta al margen de RLS.

-- ============================================================
-- Arreglo: conteo de respuestas sin recursión de RLS
-- ============================================================
create or replace function feedback_response_count(p_request_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer from feedback_responses where feedback_request_id = p_request_id;
$$;

drop policy if exists "feedback_responses visible to requester above threshold" on feedback_responses;

create policy "feedback_responses visible to requester above threshold"
  on feedback_responses for select
  using (
    feedback_request_id in (
      select fr.id
      from feedback_requests fr
      join members m on m.id = fr.requester_member_id
      where m.auth_user_id = auth.uid()
        and feedback_response_count(fr.id) >= coalesce(
          (select min_responses_to_reveal from platform_settings where organization_id = fr.organization_id),
          (select min_responses_to_reveal from platform_settings where organization_id is null),
          3
        )
    )
  );

-- ============================================================
-- survey_templates / survey_questions — plantillas de preguntas (spec 5)
-- ============================================================
create table survey_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table survey_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references survey_templates(id) on delete cascade,
  position integer not null,
  prompt text not null,
  question_type text not null default 'open' check (question_type in ('open', 'scale', 'multiple_choice')),
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (template_id, position)
);

alter table feedback_requests
  add column template_id uuid references survey_templates(id);

-- ============================================================
-- feedback_answers — una respuesta por pregunta (spec 5.1), sin columna de
-- autor, igual que feedback_responses.
-- ============================================================
create table feedback_answers (
  id uuid primary key default gen_random_uuid(),
  feedback_response_id uuid not null references feedback_responses(id) on delete cascade,
  question_id uuid not null references survey_questions(id),
  answer_text text,
  created_at timestamptz not null default now()
);

create index feedback_answers_feedback_response_id_idx on feedback_answers(feedback_response_id);

-- ============================================================
-- Row-Level Security
-- ============================================================
alter table survey_templates enable row level security;
alter table survey_questions enable row level security;
alter table feedback_answers enable row level security;

create policy "survey_templates readable by authenticated"
  on survey_templates for select
  using (auth.role() = 'authenticated');

create policy "survey_questions readable by authenticated"
  on survey_questions for select
  using (auth.role() = 'authenticated');

-- feedback_invitations no tenía policy de select para miembros normales
-- (a propósito, sección 6). Un invitado sí necesita ver SUS PROPIAS
-- invitaciones para tener una bandeja de tareas pendientes.
create policy "feedback_invitations visible to own invitee"
  on feedback_invitations for select
  using (invitee_member_id in (select id from members where auth_user_id = auth.uid()));

-- feedback_answers hereda el mismo umbral que feedback_responses: al
-- consultar feedback_responses desde aquí, RLS ya filtra por esa política.
create policy "feedback_answers visible with same threshold as feedback_responses"
  on feedback_answers for select
  using (feedback_response_id in (select id from feedback_responses));

-- ============================================================
-- create_ad_hoc_feedback_request — un empleado activo pide feedback a
-- compañeros ya activos de su organización (spec 4.2).
-- ============================================================
create or replace function create_ad_hoc_feedback_request(p_invitee_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  min_invitees integer;
  default_template_id uuid;
  new_request_id uuid;
  invitee_id uuid;
  invitee_count integer;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or caller_member.status <> 'active' then
    raise exception 'Debes iniciar sesión como empleado activo para pedir feedback.';
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
  ) then
    raise exception 'Todos los invitados deben ser empleados activos de tu organización.';
  end if;

  select id into default_template_id from survey_templates where code = 'default_open_feedback';

  insert into feedback_requests (organization_id, requester_member_id, request_type, template_id)
  values (caller_member.organization_id, caller_member.id, 'ad_hoc', default_template_id)
  returning id into new_request_id;

  foreach invitee_id in array p_invitee_member_ids loop
    insert into feedback_invitations (feedback_request_id, invitee_member_id)
    values (new_request_id, invitee_id);
  end loop;

  return new_request_id;
end;
$$;

grant execute on function create_ad_hoc_feedback_request(uuid[]) to authenticated;

-- ============================================================
-- submit_feedback_response — el invitado responde vía su token de un solo
-- uso; el contenido queda desacoplado de feedback_invitations (spec 6).
-- ============================================================
create or replace function submit_feedback_response(p_token uuid, p_answers jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation feedback_invitations;
  invitee members;
  new_response_id uuid;
  answer jsonb;
  missing_required integer;
begin
  select * into invitation from feedback_invitations where token = p_token and used_at is null;

  if invitation is null then
    raise exception 'Invitación no válida o ya utilizada.';
  end if;

  if invitation.invitee_member_id is not null then
    select * into invitee from members where id = invitation.invitee_member_id;
    if invitee.auth_user_id is distinct from auth.uid() then
      raise exception 'Esta invitación no corresponde a tu usuario.';
    end if;
  end if;

  select count(*) into missing_required
  from survey_questions sq
  where sq.template_id = (select template_id from feedback_requests where id = invitation.feedback_request_id)
    and sq.required
    and not exists (
      select 1 from jsonb_array_elements(p_answers) a
      where (a->>'question_id')::uuid = sq.id
        and coalesce(trim(a->>'answer_text'), '') <> ''
    );

  if missing_required > 0 then
    raise exception 'Faltan respuestas obligatorias.';
  end if;

  insert into feedback_responses (feedback_request_id)
  values (invitation.feedback_request_id)
  returning id into new_response_id;

  for answer in select * from jsonb_array_elements(p_answers)
  loop
    insert into feedback_answers (feedback_response_id, question_id, answer_text)
    values (
      new_response_id,
      (answer->>'question_id')::uuid,
      answer->>'answer_text'
    );
  end loop;

  update feedback_invitations set used_at = now() where id = invitation.id;

  return new_response_id;
end;
$$;

grant execute on function submit_feedback_response(uuid, jsonb) to authenticated;

-- ============================================================
-- get_feedback_request_progress — el solicitante ve cuántas respuestas
-- lleva SIN ver el contenido antes de alcanzar el umbral (spec 6).
-- ============================================================
create or replace function get_feedback_request_progress(p_request_id uuid)
returns table (response_count integer, threshold integer, revealed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  req feedback_requests;
  count_val integer;
  threshold_val integer;
begin
  select * into req from feedback_requests where id = p_request_id;

  if req is null then
    raise exception 'Solicitud no encontrada.';
  end if;

  if not exists (
    select 1 from members where id = req.requester_member_id and auth_user_id = auth.uid()
  ) then
    raise exception 'No tienes acceso a esta solicitud.';
  end if;

  count_val := feedback_response_count(p_request_id);

  select coalesce(
    (select min_responses_to_reveal from platform_settings where organization_id = req.organization_id),
    (select min_responses_to_reveal from platform_settings where organization_id is null),
    3
  ) into threshold_val;

  return query select count_val, threshold_val, count_val >= threshold_val;
end;
$$;

grant execute on function get_feedback_request_progress(uuid) to authenticated;

-- ============================================================
-- Datos semilla: plantilla por defecto del flujo ágil (spec 5.1)
-- ============================================================
insert into survey_templates (code, name)
values ('default_open_feedback', 'Feedback abierto guiado');

insert into survey_questions (template_id, position, prompt, question_type, required)
select id, 1, '¿Qué habilidad destacarías de esta persona en su desarrollo profesional?', 'open', true
from survey_templates where code = 'default_open_feedback'
union all
select id, 2, '¿Cuál crees que es un área de mejora para profundizar en su desarrollo profesional?', 'open', true
from survey_templates where code = 'default_open_feedback'
union all
select id, 3, '¿Qué es aquello que le invitarías a seguir haciendo?', 'open', true
from survey_templates where code = 'default_open_feedback'
union all
select id, 4, '¿Qué crees que podría ayudarle en su desarrollo profesional dejar de hacer?', 'open', true
from survey_templates where code = 'default_open_feedback'
union all
select id, 5, '¿Algo más que quieras añadir?', 'open', false
from survey_templates where code = 'default_open_feedback';
