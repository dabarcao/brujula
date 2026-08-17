-- Brújula — ciclo de vida de la solicitud ágil: solo una abierta a la vez,
-- se puede cancelar o modificar mientras no tenga respuestas todavía.
--
-- Ámbito: solo aplica al flujo ágil (request_type = 'ad_hoc'). El ciclo 360
-- ya tiene su propia regla de "una vez por ciclo" (organize_cycle_evaluators).

-- ============================================================
-- create_ad_hoc_feedback_request — ahora exige no tener ya una abierta.
-- ============================================================
create or replace function create_ad_hoc_feedback_request(p_invitee_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  min_invitees integer;
  default_template_id uuid;
  new_request_id uuid;
  invitee_id uuid;
  invitee_count integer;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or caller_member.status <> 'active' then
    raise exception 'Debes iniciar sesión como empleado activo para pedir feedback.';
  end if;

  if exists (
    select 1 from feedback_requests
    where requester_member_id = caller_member.id
      and request_type = 'ad_hoc'
      and status = 'open'
  ) then
    raise exception 'Ya tienes una solicitud de feedback abierta. Ciérrala o modifícala antes de crear otra.';
  end if;

  invitee_count := coalesce(array_length(p_invitee_member_ids, 1), 0);

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if invitee_count < min_invitees then
    raise exception 'Tienes que invitar al menos a % personas.', min_invitees;
  end if;

  if caller_member.id = any(p_invitee_member_ids) then
    raise exception 'No puedes invitarte a ti mismo.';
  end if;

  if exists (
    select 1
    from unnest(p_invitee_member_ids) as invitee(id)
    left join members m on m.id = invitee.id
    where m.id is null
       or m.organization_id <> caller_member.organization_id
       or m.status <> 'active'
  ) then
    raise exception 'Todos los invitados deben ser empleados activos de tu organización.';
  end if;

  select id into default_template_id from survey_templates where code = 'default_open_feedback';

  insert into feedback_requests (organization_id, requester_member_id, request_type, template_id)
  values (caller_member.organization_id, caller_member.id, 'ad_hoc', default_template_id)
  returning id into new_request_id;

  foreach invitee_id in array p_invitee_member_ids loop
    insert into feedback_invitations (feedback_request_id, invitee_member_id)
    values (new_request_id, invitee_id);
  end loop;

  return new_request_id;
end;
$$;

-- ============================================================
-- cancel_ad_hoc_feedback_request — solo si sigue abierta y sin respuestas.
-- ============================================================
create or replace function cancel_ad_hoc_feedback_request(p_request_id uuid)
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

  if req.request_type <> 'ad_hoc' then
    raise exception 'Solo se pueden cancelar solicitudes del flujo ágil.';
  end if;

  if req.status <> 'open' then
    raise exception 'Esta solicitud ya no está abierta.';
  end if;

  if feedback_response_count(p_request_id) > 0 then
    raise exception 'No se puede cancelar: ya hay respuestas.';
  end if;

  update feedback_requests set status = 'closed' where id = p_request_id;
end;
$$;

grant execute on function cancel_ad_hoc_feedback_request(uuid) to authenticated;

-- ============================================================
-- update_ad_hoc_feedback_request_evaluators — reemplaza la lista de
-- invitados mientras la solicitud siga abierta y sin respuestas.
-- ============================================================
create or replace function update_ad_hoc_feedback_request_evaluators(
  p_request_id uuid,
  p_invitee_member_ids uuid[]
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
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into req from feedback_requests where id = p_request_id;

  if req is null or req.requester_member_id <> caller_member.id then
    raise exception 'Solicitud no encontrada.';
  end if;

  if req.request_type <> 'ad_hoc' then
    raise exception 'Solo se pueden modificar solicitudes del flujo ágil.';
  end if;

  if req.status <> 'open' then
    raise exception 'Esta solicitud ya no está abierta.';
  end if;

  if feedback_response_count(p_request_id) > 0 then
    raise exception 'No se puede modificar: ya hay respuestas.';
  end if;

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if coalesce(array_length(p_invitee_member_ids, 1), 0) < min_invitees then
    raise exception 'Tienes que invitar al menos a % personas.', min_invitees;
  end if;

  if caller_member.id = any(p_invitee_member_ids) then
    raise exception 'No puedes invitarte a ti mismo.';
  end if;

  if exists (
    select 1
    from unnest(p_invitee_member_ids) as invitee(id)
    left join members m on m.id = invitee.id
    where m.id is null
       or m.organization_id <> caller_member.organization_id
       or m.status <> 'active'
  ) then
    raise exception 'Todos los invitados deben ser empleados activos de tu organización.';
  end if;

  delete from feedback_invitations where feedback_request_id = p_request_id;

  insert into feedback_invitations (feedback_request_id, invitee_member_id)
  select p_request_id, unnest(p_invitee_member_ids);
end;
$$;

grant execute on function update_ad_hoc_feedback_request_evaluators(uuid, uuid[]) to authenticated;
