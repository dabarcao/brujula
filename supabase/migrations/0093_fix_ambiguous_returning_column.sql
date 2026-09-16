-- Brújula — las 4 funciones de "añadir evaluadores" (ágil empresa/
-- individual en la 0090, ciclo 360 empresa/individual en la 0092)
-- declaran `returns table (invitee_email text, token uuid)` (o
-- invitee_member_id en vez de invitee_email) y luego hacen
-- `returning invitee_email, token` sin cualificar — en PL/pgSQL eso es
-- ambiguo, porque el nombre de columna de la tabla coincide exactamente
-- con el nombre del parámetro de salida de la función, que también está
-- en scope. Postgres no sabe a cuál de los dos te refieres.
--
-- Arreglo: cualificar el RETURNING con el nombre de la tabla
-- (feedback_invitations.invitee_email en vez de solo invitee_email) —
-- así se refiere sin ambigüedad a la columna de la tabla. El tipo de
-- retorno de las 4 funciones no cambia, así que basta con
-- create or replace, sin necesidad de dropearlas primero.

create or replace function update_ad_hoc_feedback_request_evaluators(
  p_request_id uuid,
  p_invitee_member_ids uuid[]
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

  return query
  insert into feedback_invitations (feedback_request_id, invitee_member_id)
  select p_request_id, x
  from unnest(p_invitee_member_ids) as x
  where not exists (
    select 1 from feedback_invitations fi
    where fi.feedback_request_id = p_request_id and fi.invitee_member_id = x
  )
  returning feedback_invitations.invitee_member_id, feedback_invitations.token;
end;
$$;

create or replace function update_ad_hoc_feedback_request_evaluators_for_individual(
  p_request_id uuid,
  p_invitee_emails text[]
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
  normalized_emails text[];
  invitee_count integer;
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

  if req.request_type <> 'ad_hoc' then
    raise exception 'Solo se pueden modificar solicitudes del flujo ágil.';
  end if;

  if req.status <> 'open' then
    raise exception 'Esta solicitud ya no está abierta.';
  end if;

  if feedback_response_count(p_request_id) > 0 then
    raise exception 'No se puede modificar: ya hay respuestas.';
  end if;

  select array_agg(distinct lower(trim(e))) into normalized_emails
  from unnest(p_invitee_emails) as e
  where trim(e) <> '';

  invitee_count := coalesce(array_length(normalized_emails, 1), 0);

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if invitee_count < min_invitees then
    raise exception 'Tienes que invitar al menos a % personas.', min_invitees;
  end if;

  if exists (
    select 1 from unnest(normalized_emails) as e
    where e !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
  ) then
    raise exception 'Algún email no es válido.';
  end if;

  if lower(trim(caller_member.email)) = any(normalized_emails) then
    raise exception 'No puedes invitarte a ti mismo.';
  end if;

  return query
  insert into feedback_invitations (feedback_request_id, invitee_email)
  select p_request_id, e
  from unnest(normalized_emails) as e
  where not exists (
    select 1 from feedback_invitations fi
    where fi.feedback_request_id = p_request_id and fi.invitee_email = e
  )
  returning feedback_invitations.invitee_email, feedback_invitations.token;
end;
$$;

create or replace function update_cycle_request_evaluators(
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
  returning feedback_invitations.invitee_member_id, feedback_invitations.token;
end;
$$;

create or replace function update_individual_cycle_request_evaluators(
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
  returning feedback_invitations.invitee_email, feedback_invitations.token;
end;
$$;
