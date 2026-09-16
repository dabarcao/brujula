-- Brújula — arregla "añadir evaluadores" a una solicitud ágil ya
-- creada: hasta ahora la función borraba TODAS las invitaciones y las
-- volvía a crear de cero, lo que regeneraba el token de la gente que ya
-- había recibido su email (dejando su enlace roto en silencio, sin que
-- nadie se enterase) y, encima, la Server Action nunca mandaba ningún
-- email nuevo — ni a los recién añadidos ni a nadie.
--
-- Ahora la función solo INSERTA los que todavía no estaban invitados
-- (nunca borra ni toca una fila existente, así que su token no cambia)
-- y devuelve justo esas filas nuevas, para que la Server Action sepa a
-- quién mandarle el email de invitación sin tener que volver a
-- consultar nada ni arriesgarse a reenviar a quien ya lo tenía.

-- El tipo de retorno cambia (antes void), así que hace falta borrarla
-- primero: un create or replace no puede cambiar el tipo de retorno.
drop function if exists update_ad_hoc_feedback_request_evaluators(uuid, uuid[]);

create function update_ad_hoc_feedback_request_evaluators(
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
  returning invitee_member_id, token;
end;
$$;

grant execute on function update_ad_hoc_feedback_request_evaluators(uuid, uuid[]) to authenticated;

drop function if exists update_ad_hoc_feedback_request_evaluators_for_individual(uuid, text[]);

create function update_ad_hoc_feedback_request_evaluators_for_individual(
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
  returning invitee_email, token;
end;
$$;

grant execute on function update_ad_hoc_feedback_request_evaluators_for_individual(uuid, text[]) to authenticated;
