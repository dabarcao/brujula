-- Brújula — datos de prueba para kairos-experience: 4 solicitudes ad_hoc
-- "por competencias" y un ciclo 360 con 4 solicitudes propias, todas
-- completamente respondidas. Alberto queda fuera como SOLICITANTE en
-- ambos casos (ya tiene su propia solicitud de antes), pero sí puede
-- aparecer como evaluador de los demás.
--
-- Reutiliza las funciones RPC reales de la app
-- (create_ad_hoc_feedback_request, submit_feedback_response,
-- create_feedback_cycle, organize_cycle_evaluators) simulando auth.uid()
-- vía request.jwt.claims, en vez de reimplementar a mano toda su
-- validación de negocio (mínimo de invitados, plantilla correcta,
-- competencias válidas, etc.).
--
-- Pensado para ejecutarse UNA vez, como usuario postgres, en el SQL
-- Editor de Supabase. Las lecturas directas de este script no pasan por
-- RLS (postgres la salta); solo las funciones RPC llamadas dentro
-- respetan el auth.uid() simulado, igual que si lo hiciera cada usuario
-- real desde la app. Es transaccional: si algo falla a mitad, no queda
-- nada a medias — se puede corregir y volver a ejecutar entero.

do $$
declare
  v_org_id uuid;
  v_alberto_id uuid;
  v_all_ids uuid[];
  v_pool_ids uuid[];
  v_requesters uuid[];
  v_min_invitees integer;
  v_requester_id uuid;
  v_requester_auth uuid;
  v_invitee_ids uuid[];
  v_invitee_id uuid;
  v_invitee_auth uuid;
  v_categories text[];
  v_request_id uuid;
  v_cycle_id uuid;
  v_supervisor_auth uuid;
  v_template_id uuid;
  v_token uuid;
  v_answers jsonb;
  v_question record;
  v_competency_codes text[] := array[
    'vision_proposito', 'toma_decisiones', 'orientacion_resultados', 'vision_sistemica',
    'ecologia', 'aprendizaje_curiosidad', 'coaching', 'mentoring', 'colaboracion',
    'inteligencia_interpersonal', 'valores', 'autenticidad', 'coraje', 'gestion_emocional'
  ];
  v_open_texts text[] := array[
    'Se nota que se prepara bien antes de tomar decisiones importantes.',
    'Últimamente está aportando mucha claridad en las reuniones de equipo.',
    'Podría comunicar antes cuando algo se le complica, para pedir ayuda a tiempo.',
    'Ha ganado mucha soltura relacionándose con otros equipos este trimestre.',
    'Sería bueno que delegara algo más en vez de asumirlo todo.'
  ];
  picked_codes text[];
  pick_code text;
begin
  select id into v_org_id from organizations where name = 'kairos-experience';
  if v_org_id is null then
    raise exception 'No existe la organización kairos-experience.';
  end if;

  select id into v_alberto_id from members
  where organization_id = v_org_id and email = 'alberto.gonzalez@kairosexperience.es';

  select array_agg(id order by email) into v_all_ids
  from members where organization_id = v_org_id and status = 'active';

  -- Candidatos a solicitante: activos, que no sean Alberto, y que no
  -- tengan ya una solicitud ad_hoc abierta (create_ad_hoc_feedback_request
  -- solo permite una a la vez por persona).
  select array_agg(id order by email) into v_pool_ids
  from members m
  where m.organization_id = v_org_id
    and m.status = 'active'
    and m.id is distinct from v_alberto_id
    and not exists (
      select 1 from feedback_requests fr
      where fr.requester_member_id = m.id
        and fr.request_type = 'ad_hoc'
        and fr.status = 'open'
    );

  if coalesce(array_length(v_pool_ids, 1), 0) < 4 then
    raise exception 'Hacen falta al menos 4 empleados activos (sin contar a Alberto, y sin una solicitud ad_hoc ya abierta).';
  end if;

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = v_org_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into v_min_invitees;

  if coalesce(array_length(v_all_ids, 1), 0) < v_min_invitees + 1 then
    raise exception 'Hacen falta al menos % empleados activos en total en kairos-experience.', v_min_invitees + 1;
  end if;

  v_requesters := v_pool_ids[1:4];

  select array_agg(
    case (ord - 1) % 4
      when 0 then 'team'
      when 1 then 'organization'
      when 2 then 'other'
      else 'manager'
    end order by ord
  ) into v_categories
  from generate_series(1, v_min_invitees) as ord;

  -- ============================================================
  -- 1. Ad-hoc "por competencias" — 4 solicitudes completas
  -- ============================================================
  foreach v_requester_id in array v_requesters loop
    select auth_user_id into v_requester_auth from members where id = v_requester_id;

    select array_agg(id) into v_invitee_ids
    from (
      select id
      from unnest(v_all_ids) with ordinality as t(id, ord)
      where id <> v_requester_id
      order by ord
      limit v_min_invitees
    ) s;

    perform set_config('request.jwt.claims', json_build_object('sub', v_requester_auth)::text, true);

    select create_ad_hoc_feedback_request(v_invitee_ids, 'competencias') into v_request_id;

    select template_id into v_template_id from feedback_requests where id = v_request_id;

    foreach v_invitee_id in array v_invitee_ids loop
      select auth_user_id into v_invitee_auth from members where id = v_invitee_id;
      select token into v_token from feedback_invitations
      where feedback_request_id = v_request_id and invitee_member_id = v_invitee_id;

      v_answers := '[]'::jsonb;
      for v_question in
        select id, max_selections from survey_questions
        where template_id = v_template_id and question_type = 'competency'
        order by position
      loop
        select array_agg(code) into picked_codes
        from (
          select code from unnest(v_competency_codes) as c(code)
          order by random()
          limit v_question.max_selections
        ) s;

        foreach pick_code in array picked_codes loop
          v_answers := v_answers || jsonb_build_array(jsonb_build_object(
            'question_id', v_question.id,
            'competency_code', pick_code,
            'answer_value', (1 + floor(random() * 5))::int,
            'answer_text', v_open_texts[1 + floor(random() * array_length(v_open_texts, 1))::int]
          ));
        end loop;
      end loop;

      perform set_config('request.jwt.claims', json_build_object('sub', v_invitee_auth)::text, true);
      perform submit_feedback_response(v_token, v_answers);
    end loop;
  end loop;

  -- ============================================================
  -- 2. Ciclo 360 — 4 solicitudes propias completas
  -- ============================================================
  select auth_user_id into v_supervisor_auth
  from members where organization_id = v_org_id and is_supervisor limit 1;

  if v_supervisor_auth is null then
    raise exception 'No hay ningún Supervisor en kairos-experience.';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_supervisor_auth)::text, true);

  select create_feedback_cycle(
    'Ciclo 360 piloto',
    current_date - 10,
    current_date + 30,
    v_requesters
  ) into v_cycle_id;

  foreach v_requester_id in array v_requesters loop
    select auth_user_id into v_requester_auth from members where id = v_requester_id;

    select array_agg(id) into v_invitee_ids
    from (
      select id
      from unnest(v_all_ids) with ordinality as t(id, ord)
      where id <> v_requester_id
      order by ord
      limit v_min_invitees
    ) s;

    perform set_config('request.jwt.claims', json_build_object('sub', v_requester_auth)::text, true);

    select organize_cycle_evaluators(v_cycle_id, v_invitee_ids, v_categories) into v_request_id;

    select template_id into v_template_id from feedback_requests where id = v_request_id;

    -- Autoevaluación: solo preguntas de escala (las abiertas no son
    -- obligatorias para uno mismo, se dejan sin responder).
    v_answers := '[]'::jsonb;
    for v_question in
      select id from survey_questions
      where template_id = v_template_id and question_type = 'scale'
      order by position
    loop
      v_answers := v_answers || jsonb_build_array(jsonb_build_object(
        'question_id', v_question.id,
        'answer_value', (1 + floor(random() * 5))::int
      ));
    end loop;

    select token into v_token from feedback_invitations
    where feedback_request_id = v_request_id
      and invitee_member_id = v_requester_id
      and evaluator_category = 'self';

    perform set_config('request.jwt.claims', json_build_object('sub', v_requester_auth)::text, true);
    perform submit_feedback_response(v_token, v_answers);

    -- Respuestas de los evaluadores (escala + abiertas, sí obligatorias)
    foreach v_invitee_id in array v_invitee_ids loop
      select auth_user_id into v_invitee_auth from members where id = v_invitee_id;
      select token into v_token from feedback_invitations
      where feedback_request_id = v_request_id and invitee_member_id = v_invitee_id;

      v_answers := '[]'::jsonb;
      for v_question in
        select id, question_type from survey_questions
        where template_id = v_template_id
        order by position
      loop
        if v_question.question_type = 'scale' then
          v_answers := v_answers || jsonb_build_array(jsonb_build_object(
            'question_id', v_question.id,
            'answer_value', (1 + floor(random() * 5))::int
          ));
        elsif v_question.question_type = 'open' then
          v_answers := v_answers || jsonb_build_array(jsonb_build_object(
            'question_id', v_question.id,
            'answer_text', v_open_texts[1 + floor(random() * array_length(v_open_texts, 1))::int]
          ));
        end if;
      end loop;

      perform set_config('request.jwt.claims', json_build_object('sub', v_invitee_auth)::text, true);
      perform submit_feedback_response(v_token, v_answers);
    end loop;
  end loop;
end $$;

-- Verificación rápida: qué se creó y cuántas respuestas tiene cada cosa.
select
  fr.request_type,
  fr.subtype,
  m.full_name,
  m.email,
  fr.status,
  (select count(*) from feedback_responses where feedback_request_id = fr.id) as respuestas
from feedback_requests fr
join members m on m.id = fr.requester_member_id
where fr.organization_id = (select id from organizations where name = 'kairos-experience')
order by fr.created_at desc
limit 20;
