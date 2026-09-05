-- Brújula — un ciclo 360 ya organizado (organize_cycle_evaluators) no se
-- podía volver a editar: ni la lista de evaluadores ni su categoría. El
-- flujo ágil sí permite esto (update_ad_hoc_feedback_request_evaluators)
-- mientras nadie haya respondido — se añade el mismo permiso aquí. La
-- autoevaluación (evaluator_category = 'self') nunca se toca: no se borra
-- ni se puede volver a añadir a uno mismo como evaluador.

create or replace function update_cycle_request_evaluators(
  p_request_id uuid,
  p_evaluator_member_ids uuid[],
  p_evaluator_categories text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  req feedback_requests;
  min_invitees integer;
  i integer;
  evaluator_id uuid;
  category text;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into req from feedback_requests where id = p_request_id;

  if req is null or req.requester_member_id <> caller_member.id then
    raise exception 'Solicitud no encontrada.';
  end if;

  if req.request_type <> 'cycle' then
    raise exception 'Solo se pueden modificar solicitudes de un ciclo 360.';
  end if;

  if req.status <> 'open' then
    raise exception 'Esta solicitud ya no está abierta.';
  end if;

  if feedback_response_count(p_request_id) > 0 then
    raise exception 'No se puede modificar: ya hay respuestas.';
  end if;

  if coalesce(array_length(p_evaluator_member_ids, 1), 0)
      is distinct from coalesce(array_length(p_evaluator_categories, 1), 0) then
    raise exception 'Datos de evaluadores incompletos.';
  end if;

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if coalesce(array_length(p_evaluator_member_ids, 1), 0) < min_invitees then
    raise exception 'Tienes que organizar al menos % evaluadores.', min_invitees;
  end if;

  if caller_member.id = any(p_evaluator_member_ids) then
    raise exception 'No puedes incluirte a ti mismo como evaluador: tu autoevaluación ya está incluida aparte.';
  end if;

  if exists (
    select 1
    from unnest(p_evaluator_member_ids) as e(id)
    left join members m on m.id = e.id
    where m.id is null
       or m.organization_id <> caller_member.organization_id
       or m.status <> 'active'
       or m.is_supervisor
  ) then
    raise exception 'Todos los evaluadores deben ser empleados activos de tu organización (el Supervisor no puede ser invitado a dar feedback).';
  end if;

  delete from feedback_invitations
  where feedback_request_id = p_request_id
    and evaluator_category <> 'self';

  for i in 1 .. array_length(p_evaluator_member_ids, 1) loop
    evaluator_id := p_evaluator_member_ids[i];
    category := p_evaluator_categories[i];

    if category not in ('manager', 'team', 'organization', 'other') then
      raise exception 'Categoría de evaluador no válida: %', category;
    end if;

    insert into feedback_invitations (feedback_request_id, invitee_member_id, evaluator_category)
    values (p_request_id, evaluator_id, category);
  end loop;
end;
$$;

grant execute on function update_cycle_request_evaluators(uuid, uuid[], text[]) to authenticated;
