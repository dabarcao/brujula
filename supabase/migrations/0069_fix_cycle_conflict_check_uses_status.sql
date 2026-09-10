-- Brújula — create_feedback_cycle (migración 0023) comprobaba si un
-- empleado ya estaba "en un ciclo abierto" mirando feedback_cycles.closes_at
-- >= hoy — una fecha de calendario, no un hecho. Desde la migración 0060
-- ("el usuario es el dueño de su proceso, no las condiciones") cerrar un
-- 360 es siempre una acción explícita (feedback_requests.status = 'closed'
-- al pulsar "Finalizar informe"), pero este guard nunca se actualizó: si
-- alguien finalizaba su informe antes de la fecha programada del ciclo,
-- seguía bloqueado para entrar en uno nuevo hasta que esa fecha pasara.
--
-- Se sustituye la comprobación por el único hecho real: ¿tiene esa persona
-- una feedback_requests de tipo 'cycle' todavía con status = 'open'? Si su
-- informe ya está cerrado (o nunca organizó evaluadores), no bloquea nada.

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

  -- Un mismo empleado no puede quedar metido en dos ciclos 360 abiertos a
  -- la vez — "abierto" es feedback_requests.status = 'open', el hecho real
  -- de que esa persona no ha finalizado su informe, no una fecha de
  -- calendario del ciclo al que perteneció.
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
    select position, prompt, question_type, required, competency_code, applies_to
    from survey_questions
    where template_id = base_template_id
    order by position
  loop
    pos := pos + 1;
    insert into survey_questions (template_id, position, prompt, question_type, required, competency_code, applies_to)
    values (cycle_template_id, pos, q.prompt, q.question_type, q.required, q.competency_code, q.applies_to);
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
