-- Brújula — para poder mostrar, en el radar del 360, una línea por grupo
-- de evaluador (jefe/equipo/empresa/otro) hace falta saber a qué grupo
-- pertenece cada respuesta — hoy feedback_responses no tiene ninguna
-- columna que la relacione con feedback_invitations (es la separación
-- deliberada que protege el anonimato, sección 6 de la spec). Se añade
-- SOLO la categoría (nunca quién invitó, nunca la identidad) y, al
-- exponerla, se aplica el mismo umbral mínimo de siempre (3 respuestas)
-- pero por grupo, no solo para el conjunto: un grupo con menos de 3
-- respuestas no se revela. Nunca se expone la categoría respuesta por
-- respuesta, solo como media agregada ya filtrada por ese umbral.

alter table feedback_responses add column evaluator_category text;

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
      nullif(answer->>'answer_value', '')::integer,
      answer->>'competency_code'
    );
  end loop;

  update feedback_invitations set used_at = now() where id = invitation.id;

  return new_response_id;
end;
$$;

-- ============================================================
-- get_request_competency_by_category — media por competencia y grupo de
-- evaluador (jefe/equipo/empresa/otro), solo para grupos con al menos
-- el mínimo de respuestas configurado (mismo umbral que el resto de la
-- app, aplicado ahora por grupo).
-- ============================================================
create or replace function get_request_competency_by_category(p_request_id uuid)
returns table (
  competency_code text,
  evaluator_category text,
  avg_value numeric,
  response_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  req feedback_requests;
  response_count_val integer;
  threshold_val integer;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  select * into req from feedback_requests where id = p_request_id;

  if req is null or caller_member is null or req.requester_member_id <> caller_member.id then
    raise exception 'No tienes acceso a esta solicitud.';
  end if;

  response_count_val := feedback_response_count(p_request_id);

  select coalesce(
    (select min_responses_to_reveal from platform_settings where organization_id = req.organization_id),
    (select min_responses_to_reveal from platform_settings where organization_id is null),
    3
  ) into threshold_val;

  if response_count_val < threshold_val then
    return;
  end if;

  return query
  with category_response_counts as (
    select fresp.evaluator_category as category, count(distinct fresp.id)::integer as people_cnt
    from feedback_responses fresp
    where fresp.feedback_request_id = p_request_id
      and fresp.is_self = false
      and fresp.evaluator_category is not null
    group by fresp.evaluator_category
  ),
  by_category as (
    select
      sq.competency_code as ccode,
      fresp.evaluator_category as category,
      avg(fa.answer_value) as avgv
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    where fresp.feedback_request_id = p_request_id
      and fresp.is_self = false
      and fresp.evaluator_category is not null
      and fa.answer_value is not null
      and sq.competency_code is not null
    group by sq.competency_code, fresp.evaluator_category
  )
  select bc.ccode, bc.category, round(bc.avgv, 2), crc.people_cnt
  from by_category bc
  join category_response_counts crc on crc.category = bc.category
  where crc.people_cnt >= threshold_val
  order by bc.category, bc.ccode;
end;
$$;

grant execute on function get_request_competency_by_category(uuid) to authenticated;
