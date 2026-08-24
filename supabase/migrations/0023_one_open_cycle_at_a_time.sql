-- Brújula — el ciclo 360 nunca tuvo ninguna regla de "abierto a la vez".
-- Una empresa SÍ puede tener varios ciclos simultáneos (por ejemplo, uno
-- con 6 empleados ahora y otro distinto dentro de un mes, aunque el
-- primero no haya terminado) — lo que no puede pasar es que un mismo
-- empleado quede metido en dos ciclos 360 abiertos a la vez. Se detectó
-- con datos de prueba reales: se pudieron crear 3 ciclos simultáneos con
-- los mismos participantes, sin ningún aviso.

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
  -- la vez, aunque la empresa sí pueda tener varios ciclos simultáneos
  -- con participantes distintos.
  select string_agg(distinct coalesce(m.full_name, m.email), ', ')
  into conflicting_names
  from feedback_cycle_participants fcp
  join feedback_cycles fc on fc.id = fcp.cycle_id
  join members m on m.id = fcp.member_id
  where fcp.member_id = any(p_participant_member_ids)
    and fc.organization_id = caller_member.organization_id
    and fc.closes_at >= current_date;

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
