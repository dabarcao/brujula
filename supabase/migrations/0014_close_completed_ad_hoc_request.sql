-- Brújula — permite dar por completada una solicitud ágil que ya tiene
-- respuestas (distinto de cancelar, que solo vale sin respuestas). Sin
-- esto, una solicitud con respuestas se queda "abierta" para siempre y
-- bloquea crear una nueva (regla de 0011: una sola abierta a la vez) —
-- detectado probando el flujo en el navegador.

create or replace function close_ad_hoc_feedback_request(p_request_id uuid)
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
    raise exception 'Solo se pueden cerrar solicitudes del flujo ágil.';
  end if;

  if req.status <> 'open' then
    raise exception 'Esta solicitud ya no está abierta.';
  end if;

  update feedback_requests set status = 'closed' where id = p_request_id;
end;
$$;

grant execute on function close_ad_hoc_feedback_request(uuid) to authenticated;
