-- Brújula — simplifica cuándo se revela un 360: se quita la condición
-- del 80% de respuestas totales (decisión del usuario) — se revela con
-- autoevaluación hecha + el mínimo configurado (min_responses_to_reveal,
-- el mismo que ya usa el flujo ágil), sin más. El informe sigue
-- distinguiendo preliminar/definitivo exactamente igual que hoy (eso no
-- se toca) — lo único que cambia es CUÁNDO empieza a verse el
-- preliminar, ya no hace falta esperar al 80%.
--
-- Mismo tipo de retorno (table), no hace falta drop function.
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
  revealed_val boolean;
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

  if req.request_type = 'cycle' then
    revealed_val := peer_count_val >= threshold_val and self_responded_val;
  else
    revealed_val := peer_count_val >= threshold_val;
  end if;

  return query select peer_count_val, threshold_val, revealed_val, self_responded_val;
end;
$$;

-- Texto de progreso ("Han respondido X de Y...") y de la advertencia al
-- finalizar, movidos a platform_texts. {respondidas} y {necesarias} en el
-- primero; {pendientes} en el segundo — únicos marcadores que se
-- sustituyen, hay que conservarlos tal cual si se editan.
insert into platform_texts (key, content) values (
  'progress_pending_message',
  'Han respondido {respondidas} de {necesarias} necesarias para poder ver algo. Nadie sabe quién ha respondido ya.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();

insert into platform_texts (key, content) values (
  'progress_pending_self_reminder',
  'Además, hasta que no hagas tu propia autoevaluación tampoco podrás ver cómo te ven los demás.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();

insert into platform_texts (key, content) values (
  'finalize_confirm_message',
  'Si finalizas tu informe ahora, {pendientes} personas que todavía no han respondido no tendrán opción de hacerlo. ¿Seguro que quieres finalizarlo?'
)
on conflict (key) do update set content = excluded.content, updated_at = now();
