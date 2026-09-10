-- Brújula — corrige get_report_group_competency_summary (migración
-- 0064): la media del grupo pasa de "todas las respuestas individuales
-- juntas en un montón" (pesaba más a quien tuvo más evaluadores) a
-- "media de la media de cada persona" — si Alberto tiene 3,8 y María
-- 4,2 en una competencia, la media del grupo es 4,0, cada persona pesa
-- igual sin importar cuántos evaluadores tuvo.
--
-- Además, ahora calcula DOS series, no una: la media de las evaluaciones
-- de compañeros (peer) de cada persona, y la media de su propia
-- autoevaluación — dos gráficas separadas en el informe, igual que el
-- comparativo individual pero a nivel de grupo.

drop function if exists get_report_group_competency_summary(uuid);

create or replace function get_report_group_competency_summary(p_group_id uuid)
returns table (
  competency_code text,
  competency_name text,
  role_code text,
  role_name text,
  peer_avg_value numeric,
  self_avg_value numeric,
  member_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  grp report_groups;
  is_accepted boolean;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into grp from report_groups where id = p_group_id;
  if grp is null then
    raise exception 'Grupo no encontrado.';
  end if;

  select exists(
    select 1 from report_group_members
    where group_id = p_group_id and member_id = caller_member.id and status = 'accepted'
  ) into is_accepted;

  if grp.created_by_member_id <> caller_member.id and not is_accepted then
    raise exception 'No tienes acceso al informe de este grupo.';
  end if;

  if grp.status <> 'closed' then
    raise exception 'El informe de grupo todavía no está cerrado.';
  end if;

  return query
  with member_last_cycle as (
    select distinct on (rgm.member_id)
      rgm.member_id,
      fr.id as request_id
    from report_group_members rgm
    join feedback_requests fr
      on fr.requester_member_id = rgm.member_id
     and fr.request_type = 'cycle'
     and fr.status = 'closed'
    where rgm.group_id = p_group_id and rgm.status = 'accepted'
    order by rgm.member_id, fr.closes_at desc nulls last, fr.created_at desc
  ),
  per_member_peer as (
    select
      mlc.member_id,
      coalesce(fa.competency_code, sq.competency_code) as ccode,
      avg(fa.answer_value) as avgv
    from member_last_cycle mlc
    join feedback_responses fresp on fresp.feedback_request_id = mlc.request_id and fresp.is_self = false
    join feedback_answers fa on fa.feedback_response_id = fresp.id
    join survey_questions sq on sq.id = fa.question_id
    where fa.answer_value is not null
      and coalesce(fa.competency_code, sq.competency_code) is not null
    group by mlc.member_id, coalesce(fa.competency_code, sq.competency_code)
  ),
  per_member_self as (
    select
      mlc.member_id,
      coalesce(fa.competency_code, sq.competency_code) as ccode,
      avg(fa.answer_value) as avgv
    from member_last_cycle mlc
    join feedback_responses fresp on fresp.feedback_request_id = mlc.request_id and fresp.is_self = true
    join feedback_answers fa on fa.feedback_response_id = fresp.id
    join survey_questions sq on sq.id = fa.question_id
    where fa.answer_value is not null
      and coalesce(fa.competency_code, sq.competency_code) is not null
    group by mlc.member_id, coalesce(fa.competency_code, sq.competency_code)
  )
  select
    cf.code,
    cf.name,
    r.code,
    r.name,
    round(avg(pmp.avgv), 2),
    round(avg(pms.avgv), 2),
    count(distinct pmp.member_id)::integer
  from competency_frameworks cf
  left join competency_roles r on r.id = cf.role_id
  left join per_member_peer pmp on pmp.ccode = cf.code
  left join per_member_self pms on pms.ccode = cf.code
  group by cf.code, cf.name, r.code, r.name
  order by cf.name;
end;
$$;

grant execute on function get_report_group_competency_summary(uuid) to authenticated;
