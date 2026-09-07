-- Brújula — el desglose por categoría de evaluador (migración 0036)
-- exigía el mismo mínimo de 3 respuestas para las 4 categorías por
-- igual. Pero "jefe / responsable directo" no es un grupo como los
-- demás: por diseño casi siempre hay exactamente una persona en esa
-- categoría (sección 4.1), así que exigirle 3 respuestas la deja sin
-- mostrarse nunca. No hay problema de anonimato en bajar ese mínimo a 1
-- para "manager": quién es el jefe de alguien ya es una información
-- pública dentro de la organización, no algo que el umbral de la
-- sección 6 esté protegiendo — el resto de categorías (equipo, empresa,
-- otro) sí pueden agrupar a varias personas distintas y mantienen el
-- mínimo de 3 sin cambios.

create or replace function get_request_competency_by_category(p_request_id uuid)
returns table (
  competency_code text,
  evaluator_category text,
  avg_value numeric,
  response_count integer
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
  with category_response_counts as (
    select fresp.evaluator_category as category, count(distinct fresp.id)::integer as people_cnt
    from feedback_responses fresp
    where fresp.feedback_request_id = p_request_id
      and fresp.is_self = false
      and fresp.evaluator_category is not null
    group by fresp.evaluator_category
  ),
  by_category as (
    select
      sq.competency_code as ccode,
      fresp.evaluator_category as category,
      avg(fa.answer_value) as avgv
    from feedback_answers fa
    join feedback_responses fresp on fresp.id = fa.feedback_response_id
    join survey_questions sq on sq.id = fa.question_id
    where fresp.feedback_request_id = p_request_id
      and fresp.is_self = false
      and fresp.evaluator_category is not null
      and fa.answer_value is not null
      and sq.competency_code is not null
    group by sq.competency_code, fresp.evaluator_category
  )
  select bc.ccode, bc.category, round(bc.avgv, 2), crc.people_cnt
  from by_category bc
  join category_response_counts crc on crc.category = bc.category
  where crc.people_cnt >= (case when bc.category = 'manager' then 1 else threshold_val end)
  order by bc.category, bc.ccode;
end;
$$;

grant execute on function get_request_competency_by_category(uuid) to authenticated;
