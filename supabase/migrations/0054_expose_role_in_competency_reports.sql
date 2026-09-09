-- Brújula — las tres funciones que alimentan un radar de competencias
-- (mapa propio, mapa de empresa, comparativo del 360) devuelven
-- principle_code/principle_name pero no el rol VACC (migración 0053) —
-- hace falta para poder agrupar y colorear el radar por rol
-- (Visionario/Arquitecto/Catalizador/Coach) y para separar las
-- competencias de Plenitud (role_id nulo) en su propio mini-radar,
-- en vez de mezclarlas en el mismo círculo. Cambia la forma de la
-- tabla devuelta en las tres, así que hay que borrar cada función
-- vieja antes de recrearla.

drop function if exists get_my_competency_summary();

create or replace function get_my_competency_summary()
returns table (
  competency_code text,
  competency_name text,
  principle_code text,
  principle_name text,
  role_code text,
  role_name text,
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
    r.code,
    r.name,
    round(avg(s.val), 2),
    count(*)::integer
  from scores s
  join competency_frameworks cf on cf.code = s.ccode
  left join competency_principles cp on cp.id = cf.principle_id
  left join competency_roles r on r.id = cf.role_id
  group by s.ccode, cf.name, cp.code, cp.name, r.code, r.name
  order by cf.name;
end;
$$;

grant execute on function get_my_competency_summary() to authenticated;

-- ============================================================
drop function if exists get_organization_competency_summary();

create or replace function get_organization_competency_summary()
returns table (
  competency_code text,
  competency_name text,
  principle_code text,
  principle_name text,
  role_code text,
  role_name text,
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

  if caller_member is null or not caller_member.is_supervisor then
    raise exception 'Solo el administrador de la empresa puede ver este informe.';
  end if;

  return query
  with eligible_requests as (
    select fr.id
    from feedback_requests fr
    where fr.organization_id = caller_member.organization_id
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
    r.code,
    r.name,
    round(avg(s.val), 2),
    count(*)::integer
  from scores s
  join competency_frameworks cf on cf.code = s.ccode
  left join competency_principles cp on cp.id = cf.principle_id
  left join competency_roles r on r.id = cf.role_id
  group by s.ccode, cf.name, cp.code, cp.name, r.code, r.name
  order by cf.name;
end;
$$;

grant execute on function get_organization_competency_summary() to authenticated;

-- ============================================================
drop function if exists get_request_competency_comparison(uuid);

create or replace function get_request_competency_comparison(p_request_id uuid)
returns table (
  competency_code text,
  competency_name text,
  principle_code text,
  principle_name text,
  role_code text,
  role_name text,
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
    r.code,
    r.name,
    round(s.val, 2),
    round(p.avgv, 2),
    coalesce(p.cnt, 0)
  from competency_frameworks cf
  left join competency_principles cp on cp.id = cf.principle_id
  left join competency_roles r on r.id = cf.role_id
  left join self_scores s on s.ccode = cf.code
  left join peer_scores p on p.ccode = cf.code
  order by cf.name;
end;
$$;

grant execute on function get_request_competency_comparison(uuid) to authenticated;
