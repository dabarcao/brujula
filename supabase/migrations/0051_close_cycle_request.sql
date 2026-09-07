-- Brújula — permitir cerrar manualmente un 360 (ciclo) ya lanzado, igual
-- que ya existe para una solicitud ágil (close_ad_hoc_feedback_request,
-- migración 0014). Sin esto, la fila de un 360 nunca pasa a
-- status = 'closed' salvo llegando a su fecha de cierre o al 100% de
-- respuestas — y eso se calcula al vuelo al leer el informe, nunca se
-- escribe en la fila, así que "un 360 abierto a la vez"
-- (create_individual_cycle_request, migración 0042) lo sigue viendo
-- abierto para siempre. Sirve tanto para un 360 de empresa como
-- individual — la comprobación de propiedad es la misma en los dos
-- casos.

create or replace function close_cycle_request(p_request_id uuid)
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

  if req.request_type <> 'cycle' then
    raise exception 'Esta función es solo para ciclos 360.';
  end if;

  if req.status <> 'open' then
    raise exception 'Esta solicitud ya no está abierta.';
  end if;

  update feedback_requests set status = 'closed' where id = p_request_id;
end;
$$;

grant execute on function close_cycle_request(uuid) to authenticated;
