-- Brújula — dos ajustes al umbral de revelado de un ciclo 360:
--
-- 1. El conteo hacia el mínimo de respuestas nunca debe incluir tu
--    propia autoevaluación — solo cuenta gente distinta a ti. Antes sí
--    la contaba (feedback_response_count no distingue is_self), así que
--    en teoría 2 compañeros + tu autoevaluación ya cruzaban el umbral de
--    3, cuando en realidad solo 2 personas ajenas habían opinado.
-- 2. Además, en un ciclo 360 no se revela nada hasta que TÚ también
--    hayas hecho tu autoevaluación — no tiene sentido ver cómo te ven
--    los demás sin haberte visto tú primero a ti mismo.
--
-- Cambia la forma de la tabla devuelta (se añade self_responded), así
-- que hay que borrar la función vieja antes de recrearla.

drop function if exists get_feedback_request_progress(uuid);

create or replace function get_feedback_request_progress(p_request_id uuid)
returns table (response_count integer, threshold integer, revealed boolean, self_responded boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  req feedback_requests;
  peer_count_val integer;
  self_responded_val boolean;
  threshold_val integer;
begin
  select * into req from feedback_requests where id = p_request_id;

  if req is null then
    raise exception 'Solicitud no encontrada.';
  end if;

  if not exists (
    select 1 from members where id = req.requester_member_id and auth_user_id = auth.uid()
  ) then
    raise exception 'No tienes acceso a esta solicitud.';
  end if;

  select count(*)::integer into peer_count_val
  from feedback_responses
  where feedback_request_id = p_request_id and is_self = false;

  select exists(
    select 1 from feedback_responses
    where feedback_request_id = p_request_id and is_self = true
  ) into self_responded_val;

  select coalesce(
    (select min_responses_to_reveal from platform_settings where organization_id = req.organization_id),
    (select min_responses_to_reveal from platform_settings where organization_id is null),
    3
  ) into threshold_val;

  return query select
    peer_count_val,
    threshold_val,
    peer_count_val >= threshold_val and (req.request_type <> 'cycle' or self_responded_val),
    self_responded_val;
end;
$$;

grant execute on function get_feedback_request_progress(uuid) to authenticated;
