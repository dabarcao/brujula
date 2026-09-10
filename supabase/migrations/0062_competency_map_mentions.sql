-- Brújula — "Mi mapa de competencias" cambia de base (spec.md sección
-- 15, "señal de progreso a partir de menciones repetidas"): en vez de
-- agregar todo el feedback ágil + 360 junto, la foto base pasa a ser el
-- último 360 cerrado (uno solo, el más reciente), y encima se muestra un
-- contador de menciones del feedback ágil narrativo recibido DESPUÉS de
-- ese cierre — +1 si te destacan en una competencia, -1 si te la señalan
-- como desafío o área a desarrollar. Nunca se mezcla con la nota: se
-- pintan por separado (CompetencyRadar ya lo soporta con `mentionDelta`).
--
-- El "reset a cero al cerrar un 360 nuevo" no necesita ningún mecanismo
-- aparte — como el contador solo cuenta menciones POSTERIORES al último
-- 360 cerrado, en cuanto se cierra uno nuevo el corte de fecha avanza
-- solo y las menciones antiguas dejan de contar por construcción.

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

  -- Todavía no ha cerrado ningún 360: no hay foto base, no se devuelve
  -- ninguna fila (la pantalla lo interpreta como "aún sin mapa").
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
      and fr.created_at::date > last_closed_at
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

grant execute on function get_my_competency_map() to authenticated;
