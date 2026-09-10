-- Brújula — Saboteadores (spec.md sección 15, a partir del brainstorming
-- en ~/Downloads/saboteadores_resumen_completo.md): 5 saboteadores de
-- Positive Intelligence (Controlador, Evitador, Hiperracional,
-- Complaciente, Perfeccionista), 2 preguntas cada uno, deliberadamente
-- SIN vincular a ninguna competencia (competency_code se queda null en
-- estas 10 filas) ni a ningún rol VACC.
--
-- Autoevaluación pura: nunca se le piden al grupo evaluador. Columna
-- nueva `self_only` en vez de un tipo de pregunta nuevo — siguen siendo
-- 'scale' normales (mismo ScaleSlider, cero cambios de interfaz para
-- responderlas), la única diferencia es a quién se le muestran.
--
-- El texto de las preguntas puede no ser el definitivo, pero la
-- estructura (2 por saboteador, autoevaluación, sin vínculo a
-- competencia) ya lo es.

alter table survey_questions add column self_only boolean not null default false;
alter table survey_questions add column saboteador_code text;

alter table platform_settings add column saboteador_threshold numeric not null default 4;

-- ============================================================
-- Intercalar las 10 preguntas nuevas entre las 30 de escala ya
-- existentes (no al final, para no delatar un bloque de "saboteadores"
-- fácil de identificar) — dos fases para no chocar con la restricción
-- unique(template_id, position): primero se desplazan todas las
-- posiciones actuales fuera de rango, luego se fijan las definitivas.
-- ============================================================

update survey_questions
set position = position + 1000
where template_id = (select id from survey_templates where code = 'default_360_cycle');

-- Las 30 preguntas de escala existentes, renumeradas para dejar hueco
-- cada 3 preguntas (posiciones 3, 6, 9 ... 30 libres para los
-- saboteadores). Los 3 abiertas se mueven de 39-41 a 41-43.
update survey_questions set position = 1 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1001;
update survey_questions set position = 2 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1002;
update survey_questions set position = 4 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1003;
update survey_questions set position = 5 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1004;
update survey_questions set position = 7 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1005;
update survey_questions set position = 8 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1006;
update survey_questions set position = 10 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1007;
update survey_questions set position = 11 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1008;
update survey_questions set position = 13 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1009;
update survey_questions set position = 14 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1010;
update survey_questions set position = 16 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1011;
update survey_questions set position = 17 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1012;
update survey_questions set position = 19 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1013;
update survey_questions set position = 20 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1014;
update survey_questions set position = 22 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1015;
update survey_questions set position = 23 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1016;
update survey_questions set position = 25 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1017;
update survey_questions set position = 26 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1018;
update survey_questions set position = 28 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1019;
update survey_questions set position = 29 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1020;
update survey_questions set position = 31 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1021;
update survey_questions set position = 32 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1022;
update survey_questions set position = 33 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1023;
update survey_questions set position = 34 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1024;
update survey_questions set position = 35 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1025;
update survey_questions set position = 36 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1026;
update survey_questions set position = 37 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1027;
update survey_questions set position = 38 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1028;
update survey_questions set position = 39 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1029;
update survey_questions set position = 40 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1030;
update survey_questions set position = 41 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1039;
update survey_questions set position = 42 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1040;
update survey_questions set position = 43 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1041;

insert into survey_questions (template_id, position, prompt, question_type, required, self_only, saboteador_code)
select t.id, v.position, v.prompt, 'scale', true, true, v.saboteador_code
from survey_templates t
cross join (values
  (3, 'Necesito sentir que tengo el control de la situación y me cuesta delegar o soltar.', 'controlador'),
  (6, 'Evito afrontar los conflictos, y a veces eso hace que se agraven.', 'evitador'),
  (9, 'Confío más en el análisis racional que en la intuición o las emociones a la hora de decidir.', 'hiperracional'),
  (12, 'Me cuesta decir que no y termino anteponiendo las necesidades de los demás a las mías.', 'complaciente'),
  (15, 'Soy muy exigente conmigo mismo y me cuesta aceptar el error, mío o ajeno.', 'perfeccionista'),
  (18, 'Puedo ser confrontativo y enérgico cuando necesito que las cosas se hagan.', 'controlador'),
  (21, 'Procrastino al tratar tareas importantes pero desagradables.', 'evitador'),
  (24, 'Puedo ser percibido como frío y demasiado racional.', 'hiperracional'),
  (27, 'Complazco, rescato o adulo más que otros.', 'complaciente'),
  (30, 'Me gusta que las cosas estén muy ordenadas y organizadas.', 'perfeccionista')
) as v(position, prompt, saboteador_code)
where t.code = 'default_360_cycle';

-- ============================================================
-- get_responder_context — nunca muestra preguntas self_only a un
-- evaluador de pares (inverso de la exclusión de preguntas abiertas en
-- la autoevaluación, que ya existía).
-- ============================================================
create or replace function get_responder_context(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation feedback_invitations;
  invitee members;
  req feedback_requests;
  is_self_flag boolean;
begin
  select * into invitation from feedback_invitations where token = p_token;

  if invitation is null then
    return jsonb_build_object('valid', false);
  end if;

  if invitation.invitee_member_id is not null then
    select * into invitee from members where id = invitation.invitee_member_id;
    if invitee.auth_user_id is distinct from auth.uid() then
      return jsonb_build_object('valid', false, 'requires_login', true);
    end if;
  end if;

  if invitation.used_at is not null then
    return jsonb_build_object('valid', true, 'used', true);
  end if;

  is_self_flag := coalesce(invitation.evaluator_category = 'self', false);

  select * into req from feedback_requests where id = invitation.feedback_request_id;

  return jsonb_build_object(
    'valid', true,
    'used', false,
    'is_self', is_self_flag,
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', sq.id,
        'prompt', sq.prompt,
        'required', sq.required,
        'question_type', sq.question_type,
        'max_selections', sq.max_selections
      ) order by sq.position), '[]'::jsonb)
      from survey_questions sq
      where sq.template_id = req.template_id
        and not (is_self_flag and sq.question_type = 'open')
        and not (not is_self_flag and sq.self_only)
    ),
    'scale_levels', (
      select coalesce(jsonb_agg(jsonb_build_object('level', level, 'label', label) order by level), '[]'::jsonb)
      from rating_scale_levels
    ),
    'competencies', (
      select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name) order by name), '[]'::jsonb)
      from competency_frameworks
    )
  );
end;
$$;

-- ============================================================
-- submit_feedback_response — la comprobación de "faltan respuestas
-- obligatorias" tiene que ignorar las preguntas self_only cuando quien
-- responde no es la propia persona (nunca se le mostraron, así que
-- nunca las va a contestar).
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

  return new_response_id;
end;
$$;

-- ============================================================
-- get_request_saboteadores — media de autoevaluación por saboteador (2
-- ítems cada uno), con el umbral configurable ya aplicado. Solo mira
-- respuestas propias (is_self) — los saboteadores nunca se le piden al
-- grupo evaluador.
-- ============================================================
create or replace function get_request_saboteadores(p_request_id uuid)
returns table (saboteador_code text, avg_value numeric, is_high boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  req feedback_requests;
  threshold_val numeric;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  select * into req from feedback_requests where id = p_request_id;

  if req is null or caller_member is null or req.requester_member_id <> caller_member.id then
    raise exception 'No tienes acceso a esta solicitud.';
  end if;

  select coalesce(
    (select saboteador_threshold from platform_settings where organization_id = req.organization_id),
    (select saboteador_threshold from platform_settings where organization_id is null),
    4
  ) into threshold_val;

  return query
  select
    sq.saboteador_code,
    round(avg(fa.answer_value), 2) as avgv,
    round(avg(fa.answer_value), 2) >= threshold_val
  from feedback_answers fa
  join feedback_responses fresp on fresp.id = fa.feedback_response_id
  join survey_questions sq on sq.id = fa.question_id
  where fresp.feedback_request_id = p_request_id
    and fresp.is_self = true
    and sq.self_only = true
    and sq.saboteador_code is not null
  group by sq.saboteador_code
  order by avgv desc;
end;
$$;

grant execute on function get_request_saboteadores(uuid) to authenticated;

-- ============================================================
-- ai_saboteadores_text — el párrafo (o párrafos) sobre los saboteadores
-- altos vive en su propio campo, para poder pintarlo como su propio
-- bloque en el informe ("Frenos y su posible impacto en tu desarrollo"),
-- separado de la interpretación general.
-- ============================================================
alter table feedback_requests add column ai_saboteadores_text text;

drop function if exists save_ai_interpretation(uuid, text);

create or replace function save_ai_interpretation(
  p_request_id uuid,
  p_text text,
  p_saboteadores_text text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  req feedback_requests;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into req from feedback_requests where id = p_request_id;

  if req is null or req.requester_member_id <> caller_member.id then
    raise exception 'Solicitud no encontrada.';
  end if;

  if req.status <> 'closed' then
    raise exception 'Solo se puede guardar una interpretación de un informe ya cerrado.';
  end if;

  update feedback_requests
  set
    ai_interpretation = p_text,
    ai_saboteadores_text = p_saboteadores_text,
    ai_interpretation_generated_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function save_ai_interpretation(uuid, text, text) to authenticated;
