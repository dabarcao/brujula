-- Brújula — al responder feedback, si quien respondió no tiene cuenta
-- (invitación por email suelto, sin invitee_member_id — el mismo caso
-- que ya usa el flujo individual) se le manda un email de agradecimiento
-- con una sugerencia a registrarse. Nunca a quien ya es member (empresa)
-- ni a la propia autoevaluación (evaluator_category = 'self').
--
-- submit_feedback_response cambia de "returns uuid" a "returns table" —
-- necesita drop function porque cambia el tipo de retorno, no solo el
-- cuerpo (mismo motivo que ya vimos con get_my_pending_invitations).
-- response_id se mantiene con el mismo significado de siempre;
-- invitee_email es nuevo, solo viene relleno cuando corresponde mandar
-- el email de agradecimiento — la Server Action que envuelve esta
-- función no necesita saber la regla, solo mirar si ese campo trae algo.

drop function if exists submit_feedback_response(uuid, jsonb);

create or replace function submit_feedback_response(p_token uuid, p_answers jsonb)
returns table (response_id uuid, invitee_email text)
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
  thank_you_email text;
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
    and sq.active
    and not (is_self_response and sq.question_type = 'open')
    and not (not is_self_response and sq.self_only)
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

  if invitation.invitee_member_id is null and not is_self_response then
    thank_you_email := invitation.invitee_email;
  end if;

  return query select new_response_id, thank_you_email;
end;
$$;

grant execute on function submit_feedback_response(uuid, jsonb) to authenticated, anon;

-- platform_texts solo era legible con sesión iniciada — quien responde
-- feedback sin cuenta (token de email, sin login) no la tenía, así que
-- getPlatformText siempre habría caído al texto de repaldo del código
-- para el email de agradecimiento, ignorando en silencio lo que hubiera
-- en la BBDD. No es contenido sensible (es texto que ya se manda por
-- email a quien no tiene cuenta), así que se abre a anónimos también.
drop policy "platform_texts readable by authenticated" on platform_texts;
create policy "platform_texts readable by anyone"
  on platform_texts for select
  using (true);

-- Texto del email de agradecimiento, mismo mecanismo que el resto
-- (platform_texts, **negrita**, {enlace} como único marcador especial —
-- se sustituye por el enlace a /registro, no lleva su propio botón fijo
-- en el HTML como el de invitación, así el texto controla dónde va).
insert into platform_texts (key, content) values (
  'thank_you_email_subject',
  'Gracias por tu feedback'
)
on conflict (key) do update set content = excluded.content, updated_at = now();

insert into platform_texts (key, content) values (
  'thank_you_email_body',
  'Gracias por dedicar unos minutos a dar tu feedback — es justo esa disposición la que hace que este tipo de herramientas funcionen de verdad.

Por cierto, **tú también puedes pedir feedback a tu alrededor**, de la misma forma anónima — no hace falta que tu empresa esté involucrada, y es gratis empezar.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();
