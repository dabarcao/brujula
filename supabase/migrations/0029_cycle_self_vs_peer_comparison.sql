-- Brújula — comparativa autoevaluación vs. media de los demás, por
-- competencia, para UNA solicitud de ciclo 360 concreta (no agregado).
-- Solo tiene sentido para el flujo de ciclo: es el único que genera una
-- autoevaluación (is_self = true). El ad_hoc "por competencias" sigue
-- usando get_request_competency_summary sin cambios.
--
-- La autoevaluación es del propio empleado, no dato anónimo de terceros,
-- así que se devuelve siempre que exista. La media de los demás respeta
-- el mismo umbral mínimo de revelado que el resto de la app.

create or replace function get_request_competency_comparison(p_request_id uuid)
returns table (
  competency_code text,
  competency_name text,
  principle_code text,
  principle_name text,
  self_value numeric,
  peer_avg_value numeric,
  peer_response_count integer
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
  with self_scores as (
    select sq.competency_code as ccode, avg(fa.answer_value) as val
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    where fresp.feedback_request_id = p_request_id
      and fresp.is_self = true
      and fa.answer_value is not null
      and sq.competency_code is not null
    group by sq.competency_code
  ),
  peer_scores as (
    select
      sq.competency_code as ccode,
      avg(fa.answer_value) as avgv,
      count(*)::integer as cnt
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    where fresp.feedback_request_id = p_request_id
      and fresp.is_self = false
      and fa.answer_value is not null
      and sq.competency_code is not null
    group by sq.competency_code
  )
  select
    cf.code,
    cf.name,
    cp.code,
    cp.name,
    round(s.val, 2),
    round(p.avgv, 2),
    coalesce(p.cnt, 0)
  from competency_frameworks cf
  left join competency_principles cp on cp.id = cf.principle_id
  left join self_scores s on s.ccode = cf.code
  left join peer_scores p on p.ccode = cf.code
  order by cf.name;
end;
$$;

grant execute on function get_request_competency_comparison(uuid) to authenticated;
