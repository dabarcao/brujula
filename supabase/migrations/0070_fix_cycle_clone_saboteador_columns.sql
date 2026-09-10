-- Brújula — create_feedback_cycle clona las preguntas de default_360_cycle
-- en una plantilla propia de cada ciclo de empresa (para poder añadir
-- luego preguntas extra de la organización sin tocar la plantilla base).
-- Esa clonación nunca se actualizó cuando la migración 0061 añadió
-- self_only y saboteador_code a survey_questions: las 10 preguntas de
-- saboteadores se clonaban como si fueran de escala normales, sin ninguna
-- de las dos columnas — con dos efectos, verificados en vivo con un ciclo
-- de empresa real:
--   1. get_request_saboteadores no encontraba nada que agrupar (todas con
--      saboteador_code nulo) — el bloque "Tus saboteadores" nunca aparecía.
--   2. Peor: al perder self_only = true, submit_feedback_response dejaba
--      de excluirlas de la evaluación de pares — los compañeros evaluadores
--      respondían también esas 10 preguntas (43 respuestas en vez de 33),
--      justo lo que la 0061 dice explícitamente que nunca debe pasar.
--
-- El flujo individual (create_individual_cycle_request) no clona plantilla
-- — usa default_360_cycle directamente — así que nunca tuvo este problema.
--
-- Único cambio sobre la 0069: la clonación copia también self_only y
-- saboteador_code, en vez de perderlas.

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
  ) then
    raise exception 'Todos los participantes deben ser empleados activos de tu organización.';
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

grant execute on function create_feedback_cycle(text, date, date, uuid[]) to authenticated;
