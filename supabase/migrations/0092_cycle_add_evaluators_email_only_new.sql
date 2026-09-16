-- Brújula — mismo bug que 0090 pero en el flujo de ciclos 360 (empresa
-- e individual): mientras no hubiera respuestas todavía, "añadir
-- evaluadores" borraba TODAS las invitaciones y las volvía a crear de
-- cero, regenerando el token de quien ya estaba invitado (y el email
-- nunca llegaba a nadie, ni a los nuevos ni a los de siempre, porque la
-- Server Action tampoco llamaba a sendInvitationEmails aquí).
--
-- Se unifica a un único camino — insertar solo lo que falta, nunca
-- borrar ni tocar una fila existente — igual que ya se hace cuando sí
-- hay respuestas. Efecto secundario asumido: ya no se puede cambiar la
-- categoría de un evaluador ya invitado desde aquí, solo añadir nuevos
-- (mismo criterio que ya se aplicó al flujo ágil en la 0090).

drop function if exists update_cycle_request_evaluators(uuid, uuid[], text[]);

create function update_cycle_request_evaluators(
  p_request_id uuid,
  p_evaluator_member_ids uuid[],
  p_evaluator_categories text[]
)
returns table (invitee_member_id uuid, token uuid)
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

  if req.closes_at is not null and current_date > req.closes_at then
    raise exception 'El proceso ya ha cerrado, no se puede modificar.';
  end if;

  if coalesce(array_length(p_evaluator_member_ids, 1), 0)
      is distinct from coalesce(array_length(p_evaluator_categories, 1), 0) then
    raise exception 'Datos de evaluadores incompletos.';
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

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if coalesce(array_length(p_evaluator_member_ids, 1), 0) < min_invitees then
    raise exception 'Tienes que organizar al menos % evaluadores.', min_invitees;
  end if;

  for i in 1 .. array_length(p_evaluator_member_ids, 1) loop
    category := p_evaluator_categories[i];
    if category not in ('manager', 'team', 'organization', 'other') then
      raise exception 'Categoría de evaluador no válida: %', category;
    end if;
  end loop;

  return query
  insert into feedback_invitations (feedback_request_id, invitee_member_id, evaluator_category)
  select p_request_id, x.id, x.category
  from unnest(p_evaluator_member_ids, p_evaluator_categories) as x(id, category)
  where not exists (
    select 1 from feedback_invitations fi
    where fi.feedback_request_id = p_request_id and fi.invitee_member_id = x.id
  )
  returning invitee_member_id, token;
end;
$$;

grant execute on function update_cycle_request_evaluators(uuid, uuid[], text[]) to authenticated;

drop function if exists update_individual_cycle_request_evaluators(uuid, text[], text[]);

create function update_individual_cycle_request_evaluators(
  p_request_id uuid,
  p_evaluator_emails text[],
  p_evaluator_categories text[]
)
returns table (invitee_email text, token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  caller_org organizations;
  req feedback_requests;
  min_invitees integer;
  i integer;
  category text;
  normalized_emails text[];
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into caller_org from organizations where id = caller_member.organization_id;

  if caller_org.kind <> 'individual' then
    raise exception 'Esta función es solo para cuentas individuales.';
  end if;

  select * into req from feedback_requests where id = p_request_id;

  if req is null or req.requester_member_id <> caller_member.id then
    raise exception 'Solicitud no encontrada.';
  end if;

  if req.request_type <> 'cycle' then
    raise exception 'Solo se pueden modificar solicitudes de un 360.';
  end if;

  if req.status <> 'open' then
    raise exception 'Esta solicitud ya no está abierta.';
  end if;

  if req.closes_at is not null and current_date > req.closes_at then
    raise exception 'El proceso ya ha cerrado, no se puede modificar.';
  end if;

  if coalesce(array_length(p_evaluator_emails, 1), 0)
      is distinct from coalesce(array_length(p_evaluator_categories, 1), 0) then
    raise exception 'Datos de evaluadores incompletos.';
  end if;

  if exists (
    select 1 from unnest(p_evaluator_emails) as e
    where trim(e) = '' or lower(trim(e)) !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
  ) then
    raise exception 'Algún email no es válido.';
  end if;

  select array_agg(lower(trim(e))) into normalized_emails from unnest(p_evaluator_emails) as e;

  if (
    select count(distinct e) from unnest(normalized_emails) as e
  ) <> coalesce(array_length(normalized_emails, 1), 0) then
    raise exception 'Hay un email repetido.';
  end if;

  if exists (
    select 1 from unnest(normalized_emails) as e
    where e = lower(trim(caller_member.email))
  ) then
    raise exception 'No puedes invitarte a ti mismo como evaluador: tu autoevaluación ya está incluida aparte.';
  end if;

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if coalesce(array_length(normalized_emails, 1), 0) < min_invitees then
    raise exception 'Tienes que invitar al menos a % personas.', min_invitees;
  end if;

  for i in 1 .. array_length(p_evaluator_categories, 1) loop
    category := p_evaluator_categories[i];
    if category not in ('manager', 'team', 'organization', 'other') then
      raise exception 'Categoría de evaluador no válida: %', category;
    end if;
  end loop;

  return query
  insert into feedback_invitations (feedback_request_id, invitee_email, evaluator_category)
  select p_request_id, x.email, x.category
  from unnest(normalized_emails, p_evaluator_categories) as x(email, category)
  where not exists (
    select 1 from feedback_invitations fi
    where fi.feedback_request_id = p_request_id and fi.invitee_email = x.email
  )
  returning invitee_email, token;
end;
$$;

grant execute on function update_individual_cycle_request_evaluators(uuid, text[], text[]) to authenticated;
