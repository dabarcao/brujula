-- Brújula — mapa de competencias agregado por empleado (no por
-- solicitud): junta feedback ágil y de ciclo 360 (autoevaluación
-- excluida, como siempre), y solo cuenta datos de solicitudes que ya
-- hayan cruzado su propio umbral de revelado — así el agregado nunca
-- expone antes de tiempo lo que una solicitud concreta todavía protege.

create or replace function get_my_competency_summary()
returns table (
  competency_code text,
  competency_name text,
  principle_code text,
  principle_name text,
  avg_value numeric,
  response_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  return query
  with eligible_requests as (
    select fr.id
    from feedback_requests fr
    where fr.requester_member_id = caller_member.id
      and feedback_response_count(fr.id) >= coalesce(
        (select min_responses_to_reveal from platform_settings where organization_id = fr.organization_id),
        (select min_responses_to_reveal from platform_settings where organization_id is null),
        3
      )
  ),
  scores as (
    select
      coalesce(fa.competency_code, sq.competency_code) as ccode,
      fa.answer_value as val
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    where fresp.feedback_request_id in (select id from eligible_requests)
      and fresp.is_self = false
      and fa.answer_value is not null
      and coalesce(fa.competency_code, sq.competency_code) is not null
  )
  select
    s.ccode,
    cf.name,
    cp.code,
    cp.name,
    round(avg(s.val), 2),
    count(*)::integer
  from scores s
  join competency_frameworks cf on cf.code = s.ccode
  left join competency_principles cp on cp.id = cf.principle_id
  group by s.ccode, cf.name, cp.code, cp.name
  order by cf.name;
end;
$$;

grant execute on function get_my_competency_summary() to authenticated;
