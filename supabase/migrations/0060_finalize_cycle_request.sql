-- Brújula — "el usuario es el dueño de su proceso, no las condiciones"
-- (spec.md sección 4.1): un 360 deja de poder cerrarse solo por fecha o
-- por llegar al 100% de respuestas — la única forma de cerrarlo sigue
-- siendo close_cycle_request (ya existía, migración 0051), pero ahora:
--
-- 1. Exige que el informe ya esté revelado (80% + autoevaluación,
--    get_feedback_request_progress) antes de poder cerrarse — finalizar
--    un informe vacío no tiene sentido.
-- 2. Sobreescribe closes_at con la fecha real de cierre — deja de ser una
--    fecha límite (nunca se hizo cumplir sola) y pasa a ser un hecho: a
--    partir de aquí el mismo campo se lee como "cerrado el...".

create or replace function close_cycle_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  req feedback_requests;
  is_revealed boolean;
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

  select revealed into is_revealed from get_feedback_request_progress(p_request_id);
  if not is_revealed then
    raise exception 'Todavía no se puede finalizar: hace falta llegar al mínimo de respuestas y tu propia autoevaluación.';
  end if;

  update feedback_requests
  set status = 'closed', closes_at = current_date
  where id = p_request_id;
end;
$$;

-- ============================================================
-- save_ai_interpretation — guarda la interpretación del perfil 360 por
-- IA (spec.md sección 17), generada una única vez al finalizar. Solo
-- sobre un informe ya cerrado — evita guardar una interpretación sobre
-- datos que todavía pueden cambiar.
-- ============================================================
create or replace function save_ai_interpretation(p_request_id uuid, p_text text)
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

  if req.status <> 'closed' then
    raise exception 'Solo se puede guardar una interpretación de un informe ya cerrado.';
  end if;

  update feedback_requests
  set ai_interpretation = p_text, ai_interpretation_generated_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function save_ai_interpretation(uuid, text) to authenticated;
