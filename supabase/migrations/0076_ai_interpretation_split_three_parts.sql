-- Brújula — la interpretación IA vuelve a partirse en piezas separadas
-- (competencias, saboteadores, resumen de respuestas abiertas), esta vez
-- 3 en vez de 2 — decisión explícita: guardarlas por separado no implica
-- decidir todavía si se muestran como 1 bloque o como 3, eso se decide
-- más adelante en el frontend. `ai_saboteadores_text` ya existía
-- (migración 0061, dejó de usarse en la fusión a un solo bloque) — se
-- reactiva tal cual. Se añade `ai_open_answers_text` para la tercera.

alter table feedback_requests add column ai_open_answers_text text;

drop function if exists save_ai_interpretation(uuid, text, text);

create or replace function save_ai_interpretation(
  p_request_id uuid,
  p_text text,
  p_saboteadores_text text default null,
  p_open_answers_text text default null
)
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
  set
    ai_interpretation = p_text,
    ai_saboteadores_text = p_saboteadores_text,
    ai_open_answers_text = p_open_answers_text,
    ai_interpretation_generated_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function save_ai_interpretation(uuid, text, text, text) to authenticated;
