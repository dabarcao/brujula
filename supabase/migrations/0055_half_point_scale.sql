-- Brújula — las preguntas de escala (360 y "por competencias" del flujo
-- ágil) pasan de solo enteros (1-5) a pasos de 0,5 (1, 1.5, 2 ... 5) —
-- más matiz al valorar sin cambiar el rango. rating_scale_levels no
-- cambia: sigue dando la descripción de las 5 anclas enteras, los pasos
-- intermedios no llevan descripción propia, solo el número.

alter table feedback_answers drop constraint if exists feedback_answers_answer_value_check;

alter table feedback_answers
  alter column answer_value type numeric(2, 1) using answer_value::numeric(2, 1);

alter table feedback_answers
  add constraint feedback_answers_answer_value_check
  check (
    answer_value is null
    or (answer_value >= 1 and answer_value <= 5 and (answer_value * 2) = round(answer_value * 2))
  );

-- submit_feedback_response casteaba el valor entrante a ::integer —
-- con un valor tipo "3.5" eso da un error de casteo. Se cambia a
-- ::numeric, sin ningún otro cambio en la función (mismo shape de
-- retorno, no hace falta borrar antes de recrear).
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

  insert into feedback_responses (feedback_request_id, is_self, evaluator_category)
  values (invitation.feedback_request_id, is_self_response, invitation.evaluator_category)
  returning id into new_response_id;

  for answer in select * from jsonb_array_elements(p_answers)
  loop
    insert into feedback_answers (feedback_response_id, question_id, answer_text, answer_value, competency_code)
    values (
      new_response_id,
      (answer->>'question_id')::uuid,
      answer->>'answer_text',
      nullif(answer->>'answer_value', '')::numeric,
      answer->>'competency_code'
    );
  end loop;

  update feedback_invitations set used_at = now() where id = invitation.id;

  return new_response_id;
end;
$$;
