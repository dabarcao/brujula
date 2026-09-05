-- Brújula — resumen agregado por competencia para una solicitud: nota
-- media y percentil, sin listar respuestas individuales ni comentarios de
-- texto (esos se guardan para integrarlos más adelante con un motor de
-- IA, no se muestran todavía). Junta dos orígenes de nota por competencia:
-- las preguntas de escala (competencia fija en la propia pregunta) y las
-- preguntas de tipo "competency" (competencia elegida por quien responde,
-- en feedback_answers.competency_code).
--
-- El percentil se calcula contra las medias de TODAS las solicitudes de
-- la plataforma para esa misma competencia — con pocos datos, hoy es un
-- número poco fiable a propósito (aceptado: se prefiere tener el
-- mecanismo ya construido a esperar a tener masa crítica).
--
-- Respeta el mismo umbral mínimo de respuestas que el resto de la app:
-- si la solicitud no está "revelada" todavía, no devuelve nada.

create or replace function get_request_competency_summary(p_request_id uuid)
returns table (
  competency_code text,
  competency_name text,
  avg_value numeric,
  response_count integer,
  percentile numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  req feedback_requests;
  response_count_val integer;
  threshold_val integer;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  select * into req from feedback_requests where id = p_request_id;

  if req is null or caller_member is null or req.requester_member_id <> caller_member.id then
    raise exception 'No tienes acceso a esta solicitud.';
  end if;

  response_count_val := feedback_response_count(p_request_id);

  select coalesce(
    (select min_responses_to_reveal from platform_settings where organization_id = req.organization_id),
    (select min_responses_to_reveal from platform_settings where organization_id is null),
    3
  ) into threshold_val;

  if response_count_val < threshold_val then
    return;
  end if;

  return query
  with this_request_scores as (
    select
      coalesce(fa.competency_code, sq.competency_code) as ccode,
      avg(fa.answer_value) as avgv,
      count(*)::integer as cnt
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    where fresp.feedback_request_id = p_request_id
      and fresp.is_self = false
      and fa.answer_value is not null
      and coalesce(fa.competency_code, sq.competency_code) is not null
    group by coalesce(fa.competency_code, sq.competency_code)
  ),
  all_request_scores as (
    select
      fresp.feedback_request_id as req_id,
      coalesce(fa.competency_code, sq.competency_code) as ccode,
      avg(fa.answer_value) as avgv
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    where fresp.is_self = false
      and fa.answer_value is not null
      and coalesce(fa.competency_code, sq.competency_code) is not null
    group by fresp.feedback_request_id, coalesce(fa.competency_code, sq.competency_code)
  )
  select
    t.ccode,
    cf.name,
    round(t.avgv, 2),
    t.cnt,
    round(
      100.0 * (
        select count(*) from all_request_scores a
        where a.ccode = t.ccode and a.avgv <= t.avgv
      )
      / nullif((select count(*) from all_request_scores a where a.ccode = t.ccode), 0),
      0
    )
  from this_request_scores t
  left join competency_frameworks cf on cf.code = t.ccode
  order by cf.name;
end;
$$;

grant execute on function get_request_competency_summary(uuid) to authenticated;
