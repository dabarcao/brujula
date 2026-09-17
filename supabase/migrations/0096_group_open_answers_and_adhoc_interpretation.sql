-- Brújula — dos huecos de interpretación por IA que faltaban:
--
-- 1) "Feedback ágil" nunca generaba ninguna interpretación (solo el
--    ciclo 360 lo hacía, al finalizar). Reutiliza las mismas columnas
--    de feedback_requests (ai_interpretation, ai_open_answers_text) y
--    la misma función save_ai_interpretation — no hace falta ningún
--    cambio de esquema para esto, solo código (src/lib/aiInterpretation.ts,
--    src/app/actions/feedback.ts).
--
-- 2) El informe de grupo tenía interpretación de competencias pero
--    nunca miraba las respuestas abiertas. Se añade get_report_group_open_answers
--    (mismos comentarios en bruto de todos los miembros, sin resumir
--    antes por persona — ver el porqué en aiInterpretation.ts) y una
--    columna nueva para guardar ese resumen aparte.

alter table report_groups add column ai_open_answers_text text;

create or replace function get_report_group_open_answers(p_group_id uuid)
returns table (answer_text text)
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
  )
  select fa.answer_text
  from member_last_cycle mlc
  join feedback_responses fresp on fresp.feedback_request_id = mlc.request_id and fresp.is_self = false
  join feedback_answers fa on fa.feedback_response_id = fresp.id
  join survey_questions sq on sq.id = fa.question_id
  where sq.question_type = 'open'
    and coalesce(trim(fa.answer_text), '') <> '';
end;
$$;

grant execute on function get_report_group_open_answers(uuid) to authenticated;

create or replace function save_report_group_interpretation(
  p_group_id uuid,
  p_text text,
  p_open_answers_text text default null
)
returns void
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
    raise exception 'No tienes acceso a este grupo.';
  end if;

  if grp.status <> 'closed' then
    raise exception 'El grupo todavía no está cerrado.';
  end if;

  update report_groups
  set
    ai_interpretation = p_text,
    ai_open_answers_text = p_open_answers_text,
    ai_interpretation_generated_at = now()
  where id = p_group_id;
end;
$$;

grant execute on function save_report_group_interpretation(uuid, text, text) to authenticated;

create or replace function get_report_group(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  grp report_groups;
  is_member boolean;
  is_creator boolean;
  my_status text;
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
    select 1 from report_group_members where group_id = p_group_id and member_id = caller_member.id
  ) into is_member;

  is_creator := grp.created_by_member_id = caller_member.id;

  if not is_creator and not is_member then
    raise exception 'No tienes acceso a este grupo.';
  end if;

  select status into my_status
  from report_group_members
  where group_id = p_group_id and member_id = caller_member.id;

  is_accepted := coalesce(my_status = 'accepted', false);

  return jsonb_build_object(
    'id', grp.id,
    'name', grp.name,
    'status', grp.status,
    'is_creator', is_creator,
    'my_status', my_status,
    'ai_interpretation', case when is_creator or is_accepted then grp.ai_interpretation else null end,
    'ai_open_answers_text', case when is_creator or is_accepted then grp.ai_open_answers_text else null end,
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'member_id', m.id,
        'full_name', m.full_name,
        'email', m.email,
        'status', rgm.status
      ) order by m.email), '[]'::jsonb)
      from report_group_members rgm
      join members m on m.id = rgm.member_id
      where rgm.group_id = p_group_id
    )
  );
end;
$$;

grant execute on function get_report_group(uuid) to authenticated;
