-- Brújula — el flujo ágil nunca pone evaluator_category en las
-- invitaciones que crea (a diferencia del ciclo 360, que sí lo hace:
-- manager/team/organization/other/self). submit_feedback_response
-- calculaba is_self_response comparando esa columna directamente contra
-- 'self' sin protegerse del caso NULL — en SQL, "null = 'self'" es
-- indeterminado (null), no false, y al guardarlo rompía el insert en
-- feedback_responses ("null value in column is_self violates not-null
-- constraint") para cualquier respuesta del flujo ágil.

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
    insert into feedback_answers (feedback_response_id, question_id, answer_text, answer_value)
    values (
      new_response_id,
      (answer->>'question_id')::uuid,
      answer->>'answer_text',
      nullif(answer->>'answer_value', '')::integer
    );
  end loop;

  update feedback_invitations set used_at = now() where id = invitation.id;

  return new_response_id;
end;
$$;
