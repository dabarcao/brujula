-- Brújula — informe ágil "por competencias" en formato narrativo (sección
-- 17 del spec): en vez de una tabla plana que mezcla las 3 preguntas de
-- la plantilla `ad_hoc_competencias` en un solo número por competencia,
-- se agrupa por pregunta (destacas / desafío / te gustaría ver más) y por
-- competencia mencionada dentro de cada una, con los comentarios de texto
-- libre debajo — que hasta ahora se guardaban pero no se mostraban en
-- ningún sitio.
--
-- Sin percentiles (decisión explícita: se quitan del todo, no se calculan
-- ni de puertas para adentro — con el volumen de datos todavía bajo no
-- aportaban nada que la nota media no dijera ya). Sí se devuelve el rol
-- VACC de cada competencia (o null si es de Plenitud), para que el
-- informe pueda pintar cada una con el mismo color que ya usa el radar
-- (GROUP_COLORS en CompetencyRadar.tsx) — refuerza que es el mismo
-- producto en vez de introducir una paleta nueva.
--
-- Mismo umbral de revelado que el resto de informes ágiles (no se añade
-- ningún umbral nuevo por número de menciones): los comentarios de texto
-- libre de las preguntas abiertas ya se muestran uno a uno sin exigir un
-- mínimo aparte, esto sigue el mismo precedente en vez de inventar una
-- regla distinta solo para este tipo de pregunta.

drop function if exists get_request_competency_narrative(uuid);

create or replace function get_request_competency_narrative(p_request_id uuid)
returns table (
  question_position integer,
  question_prompt text,
  competency_code text,
  competency_name text,
  role_code text,
  mention_count integer,
  avg_value numeric,
  comments text[]
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
  select
    sq.position,
    sq.prompt,
    fa.competency_code,
    cf.name,
    cr.code,
    count(*)::integer as mention_count,
    round(avg(fa.answer_value), 2) as avg_value,
    array_remove(array_agg(nullif(trim(fa.answer_text), '')), null) as comments
  from feedback_answers fa
  join feedback_responses fresp on fresp.id = fa.feedback_response_id
  join survey_questions sq on sq.id = fa.question_id
  join competency_frameworks cf on cf.code = fa.competency_code
  left join competency_roles cr on cr.id = cf.role_id
  where fresp.feedback_request_id = p_request_id
    and fresp.is_self = false
    and sq.question_type = 'competency'
    and fa.competency_code is not null
  group by sq.position, sq.prompt, fa.competency_code, cf.name, cr.code
  order by sq.position, count(*) desc;
end;
$$;

grant execute on function get_request_competency_narrative(uuid) to authenticated;
