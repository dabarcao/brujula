-- Brújula — nuevo tipo de pregunta ágil: "competency". Quien responde
-- elige una o varias competencias (hasta el máximo que fije la pregunta,
-- survey_questions.max_selections) y, por cada una, dice un valor de 1 a
-- 5 y un comentario libre — a diferencia de las preguntas de escala
-- (siempre la misma competencia fija) o las abiertas (sin competencia,
-- clasificadas después por IA), aquí es la propia persona quien etiqueta
-- la competencia a mano. Se añade como una opción más del flujo ágil, sin
-- tocar ni sustituir lo que ya existe — se decidirá más adelante cuál de
-- todos los tipos se usa en producción.

alter table survey_questions add column max_selections integer;

alter table survey_questions drop constraint if exists survey_questions_question_type_check;
alter table survey_questions
  add constraint survey_questions_question_type_check
  check (question_type in ('open', 'scale', 'multiple_choice', 'competency'));

alter table feedback_answers
  add column competency_code text references competency_frameworks(code);

alter table feedback_requests drop constraint if exists feedback_requests_subtype_check;
alter table feedback_requests
  add constraint feedback_requests_subtype_check
  check (subtype in ('meeting', 'collaboration', 'leadership_initiative', 'general', 'competencias'));

alter table survey_templates drop constraint if exists survey_templates_subtype_check;
alter table survey_templates
  add constraint survey_templates_subtype_check
  check (subtype in ('meeting', 'collaboration', 'leadership_initiative', 'general', '360_extra', 'competencias'));

-- ============================================================
-- Plantilla nueva de prueba: "Feedback por competencias"
-- ============================================================
insert into survey_templates (code, name, subtype)
values ('ad_hoc_competencias', 'Feedback por competencias', 'competencias');

insert into survey_questions (template_id, position, prompt, question_type, required, max_selections)
select t.id, v.position, v.prompt, 'competency', true, v.max_selections
from survey_templates t
cross join (values
  (1, '¿Qué competencia destacas más de esta persona en su colaboración contigo?', 2),
  (2, '¿Qué competencias crees que son una oportunidad de desarrollo para esta persona?', 2),
  (3, '¿Qué competencia te gustaría ver más presente en esta persona?', 1)
) as v(position, prompt, max_selections)
where t.code = 'ad_hoc_competencias';

-- ============================================================
-- create_ad_hoc_feedback_request — añade 'competencias' a los tipos
-- válidos (misma firma, no hace falta borrar la función).
-- ============================================================
create or replace function create_ad_hoc_feedback_request(
  p_invitee_member_ids uuid[],
  p_subtype text default 'general'
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
  ) then
    raise exception 'Todos los invitados deben ser empleados activos de tu organización.';
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

  insert into feedback_requests (organization_id, requester_member_id, request_type, subtype, template_id)
  values (caller_member.organization_id, caller_member.id, 'ad_hoc', p_subtype, chosen_template_id)
  returning id into new_request_id;

  foreach invitee_id in array p_invitee_member_ids loop
    insert into feedback_invitations (feedback_request_id, invitee_member_id)
    values (new_request_id, invitee_id);
  end loop;

  return new_request_id;
end;
$$;

-- ============================================================
-- submit_feedback_response — guarda competency_code por respuesta y
-- valida competencia real + máximo de selecciones por pregunta.
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
  is_self_response boolean;
  request_template_id uuid;
  new_response_id uuid;
  answer jsonb;
  missing_required integer;
  foreign_answers integer;
  invalid_competency_answers integer;
  q_id uuid;
  q_max integer;
  selected_count integer;
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

  is_self_response := coalesce(invitation.evaluator_category = 'self', false);

  select fr.template_id
    into request_template_id
  from feedback_requests fr
  where fr.id = invitation.feedback_request_id;

  select count(*) into foreign_answers
  from jsonb_array_elements(p_answers) a
  where not exists (
    select 1 from survey_questions sq
    where sq.id = (a->>'question_id')::uuid
      and sq.template_id = request_template_id
  );

  if foreign_answers > 0 then
    raise exception 'Alguna respuesta no corresponde a la plantilla de esta solicitud.';
  end if;

  select count(*) into invalid_competency_answers
  from jsonb_array_elements(p_answers) a
  where (a->>'competency_code') is not null
    and not exists (select 1 from competency_frameworks cf where cf.code = a->>'competency_code');

  if invalid_competency_answers > 0 then
    raise exception 'Alguna respuesta hace referencia a una competencia que no existe.';
  end if;

  for q_id, q_max in
    select sq.id, sq.max_selections
    from survey_questions sq
    where sq.template_id = request_template_id and sq.max_selections is not null
  loop
    select count(distinct a->>'competency_code') into selected_count
    from jsonb_array_elements(p_answers) a
    where (a->>'question_id')::uuid = q_id
      and (a->>'competency_code') is not null;

    if selected_count > q_max then
      raise exception 'Se ha elegido más competencias de las permitidas en alguna pregunta.';
    end if;
  end loop;

  select count(*) into missing_required
  from survey_questions sq
  where sq.template_id = request_template_id
    and sq.required
    and not (is_self_response and sq.question_type = 'open')
    and not exists (
      select 1 from jsonb_array_elements(p_answers) a
      where (a->>'question_id')::uuid = sq.id
        and (
          coalesce(trim(a->>'answer_text'), '') <> ''
          or (a->>'answer_value') is not null
        )
    );

  if missing_required > 0 then
    raise exception 'Faltan respuestas obligatorias.';
  end if;

  insert into feedback_responses (feedback_request_id, is_self)
  values (invitation.feedback_request_id, is_self_response)
  returning id into new_response_id;

  for answer in select * from jsonb_array_elements(p_answers)
  loop
    insert into feedback_answers (feedback_response_id, question_id, answer_text, answer_value, competency_code)
    values (
      new_response_id,
      (answer->>'question_id')::uuid,
      answer->>'answer_text',
      nullif(answer->>'answer_value', '')::integer,
      answer->>'competency_code'
    );
  end loop;

  update feedback_invitations set used_at = now() where id = invitation.id;

  return new_response_id;
end;
$$;
