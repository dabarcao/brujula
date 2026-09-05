-- Brújula — el resumen de competencias de una solicitud ad_hoc "por
-- competencias" pasa a devolver DOS percentiles en vez de uno: uno
-- comparando solo contra solicitudes de la misma empresa
-- (percentile_empresa) y otro contra toda la plataforma
-- (percentile_global, el que ya existía). Cambia la forma de la tabla
-- devuelta, así que hay que borrar la función vieja antes de recrearla.

drop function if exists get_request_competency_summary(uuid);

create or replace function get_request_competency_summary(p_request_id uuid)
returns table (
  competency_code text,
  competency_name text,
  avg_value numeric,
  response_count integer,
  percentile_empresa numeric,
  percentile_global numeric
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
      fr.organization_id as org_id,
      coalesce(fa.competency_code, sq.competency_code) as ccode,
      avg(fa.answer_value) as avgv
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    join feedback_requests fr on fr.id = fresp.feedback_request_id
    where fresp.is_self = false
      and fa.answer_value is not null
      and coalesce(fa.competency_code, sq.competency_code) is not null
    group by fresp.feedback_request_id, fr.organization_id, coalesce(fa.competency_code, sq.competency_code)
  )
  select
    t.ccode,
    cf.name,
    round(t.avgv, 2),
    t.cnt,
    round(
      100.0 * (
        select count(*) from all_request_scores a
        where a.ccode = t.ccode and a.org_id = req.organization_id and a.avgv <= t.avgv
      )
      / nullif(
        (select count(*) from all_request_scores a where a.ccode = t.ccode and a.org_id = req.organization_id),
        0
      ),
      0
    ),
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
