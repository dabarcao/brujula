-- Brújula — arregla "Gestionar solicitud" del feedback ágil individual:
-- hoy esa sección solo sabe trabajar con invitados que son `member`
-- (invitee_member_id), pero una cuenta individual invita por email suelto
-- (invitee_email) — no existía ninguna función para añadir más una vez
-- creada la solicitud, así que la pantalla mostraba "Ya elegidos (0)" y
-- un buscador de compañeros vacío, sin sentido para una cuenta individual
-- que no tiene compañeros que buscar.
--
-- De paso, simplifica el criterio (decisión del usuario): ya no se puede
-- modificar/quitar a quien ya se invitó, solo añadir más o cancelar la
-- solicitud entera — el propio código de EvaluatorPicker/
-- EmailEvaluatorPicker ya soportaba este modo (`canModifyExisting`),
-- solo hacía falta activarlo.

create or replace function update_ad_hoc_feedback_request_evaluators_for_individual(
  p_request_id uuid,
  p_invitee_emails text[]
)
returns void
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

  delete from feedback_invitations where feedback_request_id = p_request_id;

  insert into feedback_invitations (feedback_request_id, invitee_email)
  select p_request_id, unnest(normalized_emails);
end;
$$;

grant execute on function update_ad_hoc_feedback_request_evaluators_for_individual(uuid, text[]) to authenticated;
