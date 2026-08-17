-- Brújula — cuestionarios propios por empresa.
--
-- Dos patrones distintos, según lo hablado:
-- - Flujo ágil: la empresa puede REEMPLAZAR el cuestionario por defecto de
--   un tipo (reunión, colaboración, liderazgo de iniciativa, general) por
--   uno propio.
-- - Ciclo 360: la empresa AÑADE una sección libre de preguntas propias al
--   bloque de preguntas "nuestras" (no lo sustituye). Cada ciclo que se
--   crea copia el bloque base + la sección propia (si existe) a una
--   plantilla propia de ese ciclo, así los cambios posteriores al
--   cuestionario no afectan a ciclos ya creados.
--
-- Por simplicidad, las preguntas propias de empresa son siempre de tipo
-- "open" (abiertas) — "sección libre" encaja de forma natural con texto
-- libre, sin necesitar además definir a qué competencia interna se asigna
-- cada una.

alter table survey_templates
  add column organization_id uuid references organizations(id) on delete cascade;

alter table survey_templates
  add column subtype text check (
    subtype in ('meeting', 'collaboration', 'leadership_initiative', 'general', '360_extra')
  );

update survey_templates set subtype = 'meeting' where code = 'ad_hoc_meeting';
update survey_templates set subtype = 'collaboration' where code = 'ad_hoc_collaboration';
update survey_templates set subtype = 'leadership_initiative' where code = 'ad_hoc_leadership_initiative';
update survey_templates set subtype = 'general' where code = 'default_open_feedback';

-- RLS: hasta ahora cualquier autenticado veía cualquier plantilla; con
-- plantillas propias de empresa hace falta acotarlo a "de la plataforma o
-- de mi propia organización".
drop policy if exists "survey_templates readable by authenticated" on survey_templates;

create policy "survey_templates readable by platform or own org"
  on survey_templates for select
  using (organization_id is null or organization_id in (select auth_member_organization_ids()));

drop policy if exists "survey_questions readable by authenticated" on survey_questions;

create policy "survey_questions readable via template"
  on survey_questions for select
  using (template_id in (select id from survey_templates));

-- ============================================================
-- create_org_ad_hoc_template — la empresa define (o reemplaza) su propio
-- cuestionario para un tipo del flujo ágil.
-- ============================================================
create or replace function create_org_ad_hoc_template(
  p_subtype text,
  p_name text,
  p_questions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  new_template_id uuid;
  q jsonb;
  pos integer := 0;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or caller_member.role <> 'org_admin' then
    raise exception 'Solo un administrador puede crear cuestionarios.';
  end if;

  if p_subtype not in ('meeting', 'collaboration', 'leadership_initiative', 'general') then
    raise exception 'Tipo no válido.';
  end if;

  delete from survey_templates
  where organization_id = caller_member.organization_id
    and subtype = p_subtype;

  insert into survey_templates (code, name, organization_id, subtype)
  values (
    caller_member.organization_id::text || ':' || p_subtype,
    coalesce(nullif(trim(p_name), ''), 'Cuestionario propio'),
    caller_member.organization_id,
    p_subtype
  )
  returning id into new_template_id;

  for q in select * from jsonb_array_elements(p_questions)
  loop
    pos := pos + 1;
    insert into survey_questions (template_id, position, prompt, question_type, required)
    values (
      new_template_id,
      pos,
      q->>'prompt',
      'open',
      coalesce((q->>'required')::boolean, true)
    );
  end loop;

  return new_template_id;
end;
$$;

grant execute on function create_org_ad_hoc_template(text, text, jsonb) to authenticated;

-- ============================================================
-- delete_org_ad_hoc_template — vuelve a usar la plantilla por defecto de
-- la plataforma para ese tipo.
-- ============================================================
create or replace function delete_org_ad_hoc_template(p_subtype text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or caller_member.role <> 'org_admin' then
    raise exception 'Solo un administrador puede editar cuestionarios.';
  end if;

  delete from survey_templates
  where organization_id = caller_member.organization_id
    and subtype = p_subtype;
end;
$$;

grant execute on function delete_org_ad_hoc_template(text) to authenticated;

-- ============================================================
-- set_org_360_extra_questions — sección libre de la empresa para el 360.
-- ============================================================
create or replace function set_org_360_extra_questions(p_questions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  target_template_id uuid;
  q jsonb;
  pos integer := 100;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or caller_member.role <> 'org_admin' then
    raise exception 'Solo un administrador puede editar el cuestionario.';
  end if;

  select id into target_template_id
  from survey_templates
  where organization_id = caller_member.organization_id and subtype = '360_extra';

  if target_template_id is null then
    insert into survey_templates (code, name, organization_id, subtype)
    values (
      caller_member.organization_id::text || ':360_extra',
      'Preguntas propias del ciclo 360',
      caller_member.organization_id,
      '360_extra'
    )
    returning id into target_template_id;
  else
    delete from survey_questions where template_id = target_template_id;
  end if;

  for q in select * from jsonb_array_elements(p_questions)
  loop
    pos := pos + 1;
    insert into survey_questions (template_id, position, prompt, question_type, required)
    values (target_template_id, pos, q->>'prompt', 'open', coalesce((q->>'required')::boolean, true));
  end loop;
end;
$$;

grant execute on function set_org_360_extra_questions(jsonb) to authenticated;

-- ============================================================
-- create_ad_hoc_feedback_request — ahora prefiere la plantilla propia de
-- la empresa para ese tipo si existe, si no usa la de la plataforma.
-- ============================================================
create or replace function create_ad_hoc_feedback_request(
  p_invitee_member_ids uuid[],
  p_subtype text default 'general'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  min_invitees integer;
  chosen_template_id uuid;
  new_request_id uuid;
  invitee_id uuid;
  invitee_count integer;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or caller_member.status <> 'active' then
    raise exception 'Debes iniciar sesión como empleado activo para pedir feedback.';
  end if;

  if p_subtype not in ('meeting', 'collaboration', 'leadership_initiative', 'general') then
    raise exception 'Tipo de solicitud no válido.';
  end if;

  if exists (
    select 1 from feedback_requests
    where requester_member_id = caller_member.id
      and request_type = 'ad_hoc'
      and status = 'open'
  ) then
    raise exception 'Ya tienes una solicitud de feedback abierta. Ciérrala o modifícala antes de crear otra.';
  end if;

  invitee_count := coalesce(array_length(p_invitee_member_ids, 1), 0);

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if invitee_count < min_invitees then
    raise exception 'Tienes que invitar al menos a % personas.', min_invitees;
  end if;

  if caller_member.id = any(p_invitee_member_ids) then
    raise exception 'No puedes invitarte a ti mismo.';
  end if;

  if exists (
    select 1
    from unnest(p_invitee_member_ids) as invitee(id)
    left join members m on m.id = invitee.id
    where m.id is null
       or m.organization_id <> caller_member.organization_id
       or m.status <> 'active'
  ) then
    raise exception 'Todos los invitados deben ser empleados activos de tu organización.';
  end if;

  select id into chosen_template_id
  from survey_templates
  where subtype = p_subtype and organization_id = caller_member.organization_id
  limit 1;

  if chosen_template_id is null then
    select id into chosen_template_id
    from survey_templates
    where subtype = p_subtype and organization_id is null
    limit 1;
  end if;

  insert into feedback_requests (organization_id, requester_member_id, request_type, subtype, template_id)
  values (caller_member.organization_id, caller_member.id, 'ad_hoc', p_subtype, chosen_template_id)
  returning id into new_request_id;

  foreach invitee_id in array p_invitee_member_ids loop
    insert into feedback_invitations (feedback_request_id, invitee_member_id)
    values (new_request_id, invitee_id);
  end loop;

  return new_request_id;
end;
$$;

-- ============================================================
-- create_feedback_cycle — ahora arma una plantilla propia del ciclo,
-- copiando el bloque base de la plataforma + la sección propia de la
-- empresa (si la tiene). Así cambios futuros al cuestionario no afectan a
-- ciclos ya creados.
-- ============================================================
create or replace function create_feedback_cycle(p_name text, p_opens_at date, p_closes_at date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  base_template_id uuid;
  extra_template_id uuid;
  cycle_template_id uuid;
  new_cycle_id uuid;
  q record;
  pos integer := 0;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or caller_member.role <> 'org_admin' then
    raise exception 'Solo un administrador puede crear un ciclo 360.';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'El nombre del ciclo es obligatorio.';
  end if;

  if p_opens_at is null or p_closes_at is null or p_closes_at <= p_opens_at then
    raise exception 'Las fechas del ciclo no son válidas.';
  end if;

  select id into base_template_id from survey_templates where code = 'default_360_cycle';

  select id into extra_template_id
  from survey_templates
  where organization_id = caller_member.organization_id and subtype = '360_extra';

  insert into survey_templates (code, name, organization_id)
  values ('cycle_' || gen_random_uuid()::text, trim(p_name), caller_member.organization_id)
  returning id into cycle_template_id;

  for q in
    select position, prompt, question_type, required, competency_code, applies_to
    from survey_questions
    where template_id = base_template_id
    order by position
  loop
    pos := pos + 1;
    insert into survey_questions (template_id, position, prompt, question_type, required, competency_code, applies_to)
    values (cycle_template_id, pos, q.prompt, q.question_type, q.required, q.competency_code, q.applies_to);
  end loop;

  if extra_template_id is not null then
    for q in
      select prompt, question_type, required
      from survey_questions
      where template_id = extra_template_id
      order by position
    loop
      pos := pos + 1;
      insert into survey_questions (template_id, position, prompt, question_type, required, applies_to)
      values (cycle_template_id, pos, q.prompt, q.question_type, q.required, 'all');
    end loop;
  end if;

  insert into feedback_cycles (organization_id, name, opens_at, closes_at, template_id)
  values (caller_member.organization_id, trim(p_name), p_opens_at, p_closes_at, cycle_template_id)
  returning id into new_cycle_id;

  return new_cycle_id;
end;
$$;
