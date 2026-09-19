-- Brújula — el informe de grupo hoy solo agrega datos de competencias
-- (número + interpretación IA de esos números); nunca toca las respuestas
-- de texto abierto de sus miembros, ni en bruto ni resumidas -- a
-- diferencia del informe individual, que sí sintetiza patrones repetidos
-- (ai_open_answers_text). Esto añade el mismo tipo de síntesis a nivel de
-- grupo: 2-3 patrones claros (fortalezas + 1-2 desafíos comunes) para que
-- el grupo tenga un punto de partida para conversar -- nunca atribuidos a
-- una persona concreta (mismo criterio que ya usa la interpretación de
-- competencias de grupo: "nunca de evaluación de desempeño ni de ranking
-- entre personas").
--
-- La fuente es el texto abierto EN BRUTO de todos los miembros aceptados
-- (su último 360 cerrado, igual que get_report_group_competency_summary),
-- no un resumen-de-resúmenes: el resumen individual (ai_open_answers_text)
-- ya está muy comprimido (máx. 1-2 temas, solo si se repiten DENTRO de los
-- comentarios de esa misma persona) -- encadenar un segundo resumen sobre
-- eso perdería justo los patrones que solo se repiten ENTRE personas
-- distintas, que es lo que se busca aquí.

alter table report_groups add column if not exists ai_open_patterns_text text;

-- ============================================================
-- get_report_group_open_answers — texto abierto en bruto (is_self=false)
-- del último 360 cerrado de cada miembro aceptado. Mismos permisos y
-- mismo CTE member_last_cycle que get_report_group_competency_summary.
-- ============================================================
create or replace function get_report_group_open_answers(p_group_id uuid)
returns table (
  question_prompt text,
  question_position int,
  answer_text text
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
  )
  select sq.prompt, sq.position, fa.answer_text
  from member_last_cycle mlc
  join feedback_responses fresp on fresp.feedback_request_id = mlc.request_id and fresp.is_self = false
  join feedback_answers fa on fa.feedback_response_id = fresp.id
  join survey_questions sq on sq.id = fa.question_id
  where sq.question_type = 'open' and fa.answer_text is not null and trim(fa.answer_text) <> ''
  order by sq.position;
end;
$$;

grant execute on function get_report_group_open_answers(uuid) to authenticated;

-- get_report_group: añade ai_open_patterns_text, mismo criterio de
-- visibilidad (solo creador o ya aceptado) que ai_interpretation. Mismo
-- tipo de retorno (jsonb), no hace falta drop function.
create or replace function get_report_group(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  grp report_groups;
  is_creator boolean;
  is_member boolean;
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
    'ai_open_patterns_text', case when is_creator or is_accepted then grp.ai_open_patterns_text else null end,
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

-- save_report_group_interpretation: nuevo parámetro opcional
-- p_open_patterns_text (default null, así que la llamada de 2 argumentos
-- que ya existe sigue funcionando igual). Mismo tipo de retorno (void).
create or replace function save_report_group_interpretation(
  p_group_id uuid,
  p_text text,
  p_open_patterns_text text default null
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
  set ai_interpretation = p_text,
      ai_open_patterns_text = coalesce(p_open_patterns_text, ai_open_patterns_text),
      ai_interpretation_generated_at = now()
  where id = p_group_id;
end;
$$;
