-- Brújula — arreglo de get_my_competency_map (migración 0062): `closes_at`
-- es una fecha (sin hora), así que un 360 cerrado hoy y un feedback ágil
-- pedido más tarde ese mismo día comparaban como fechas IGUALES, nunca
-- "posterior" — el filtro `>` dejaba fuera cualquier mención del mismo
-- día del cierre, aunque en la práctica hubiera pasado después. Se
-- cambia a `>=`: el día del cierre ya cuenta, con la única imprecisión
-- aceptada de que una mención de ese mismo día, minutos antes de
-- cerrarse el 360, también contaría — mejor eso que perder
-- sistemáticamente todo el primer día.

create or replace function get_my_competency_map()
returns table (
  competency_code text,
  base_value numeric,
  mention_delta integer,
  last_cycle_closed_at date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  last_cycle_id uuid;
  last_closed_at date;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select fr.id, fr.closes_at
    into last_cycle_id, last_closed_at
  from feedback_requests fr
  where fr.requester_member_id = caller_member.id
    and fr.request_type = 'cycle'
    and fr.status = 'closed'
  order by fr.closes_at desc nulls last, fr.created_at desc
  limit 1;

  if last_cycle_id is null then
    return;
  end if;

  return query
  with base as (
    select
      coalesce(fa.competency_code, sq.competency_code) as ccode,
      avg(fa.answer_value) as avgv
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    where fresp.feedback_request_id = last_cycle_id
      and fresp.is_self = false
      and fa.answer_value is not null
      and coalesce(fa.competency_code, sq.competency_code) is not null
    group by coalesce(fa.competency_code, sq.competency_code)
  ),
  mentions as (
    select
      fa.competency_code as ccode,
      sum(case
        when sq.position = 1 then 1
        when sq.position in (2, 3) then -1
        else 0
      end) as delta
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    join feedback_requests fr on fr.id = fresp.feedback_request_id
    where fr.requester_member_id = caller_member.id
      and fr.request_type = 'ad_hoc'
      and sq.question_type = 'competency'
      and fa.competency_code is not null
      and fr.created_at::date >= last_closed_at
      and feedback_response_count(fr.id) >= coalesce(
        (select min_responses_to_reveal from platform_settings where organization_id = fr.organization_id),
        (select min_responses_to_reveal from platform_settings where organization_id is null),
        3
      )
    group by fa.competency_code
  )
  select
    cf.code,
    round(base.avgv, 2),
    coalesce(mentions.delta, 0)::integer,
    last_closed_at
  from competency_frameworks cf
  left join base on base.ccode = cf.code
  left join mentions on mentions.ccode = cf.code;
end;
$$;
