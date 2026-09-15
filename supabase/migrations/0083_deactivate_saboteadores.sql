-- Brújula — retira los saboteadores del cuestionario 360 (decisión del
-- usuario: dejan de tener sentido como parte fija de la encuesta; en el
-- futuro serán una herramienta propia dentro de una "caja de
-- herramientas" — ver docs/spec.md sección 17, backlog).
--
-- No se borran las preguntas (hay feedback_answers reales que las
-- referencian — mismo problema de FK que ya tuvimos al reordenar en
-- 0079). En vez de eso, columna `active` nueva: las 10 preguntas de
-- saboteadores pasan a active=false en TODAS las plantillas (la base
-- default_360_cycle y cualquier ciclo de empresa ya clonado) — así deja
-- de pedírsele a cualquiera que todavía no las haya respondido, tanto en
-- solicitudes nuevas como en las que ya estaban en curso.
--
-- get_request_saboteadores, el informe (SaboteadoresReport) y el prompt
-- de IA no necesitan tocarse: ya manejan con normalidad el caso de "cero
-- filas" (sin datos que mostrar/enviar), simplemente dejarán de tener
-- nada que reportar para las solicitudes nuevas.

alter table survey_questions add column active boolean not null default true;

update survey_questions
set active = false
where saboteador_code is not null;

-- get_responder_context: añade el filtro `active` a las preguntas que se
-- le muestran a quien responde. Mismo tipo de retorno (jsonb), no hace
-- falta drop function.
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
        and sq.active
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

-- create_feedback_cycle: el bucle que clona las preguntas de
-- default_360_cycle a la plantilla propia del ciclo deja fuera las
-- inactivas — así un ciclo de empresa creado a partir de ahora no
-- arrastra las de saboteadores. Mismo tipo de retorno (uuid), no hace
-- falta drop function.
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
      and active
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
