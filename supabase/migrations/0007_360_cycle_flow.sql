-- Brújula — ciclo 360: RRHH crea el ciclo, cada empleado organiza a sus
-- evaluadores por categoría (jefe/equipo/empresa/otros) y su autoevaluación
-- se añade automáticamente.
--
-- La autoevaluación es un caso especial de anonimato: a diferencia del
-- feedback de compañeros, no tiene sentido ocultarle a alguien su propia
-- respuesta ni contarla contra el umbral de revelación (spec, sección 6) —
-- quién la escribió ya se sabe siempre, por diseño. Se modela con una
-- categoría de evaluador "self" y una columna is_self en feedback_responses
-- (no compromete el anonimato de nadie más: solo identifica lo que ya era
-- público, que el propio evaluado se autoevaluó).

-- ============================================================
-- feedback_invitations — nueva categoría "self".
-- ============================================================
alter table feedback_invitations drop constraint if exists feedback_invitations_evaluator_category_check;
alter table feedback_invitations
  add constraint feedback_invitations_evaluator_category_check
  check (evaluator_category in ('self', 'manager', 'team', 'organization', 'other'));

-- ============================================================
-- feedback_responses / feedback_answers — soporte para autoevaluación y
-- para preguntas de escala (además de las abiertas).
-- ============================================================
alter table feedback_responses add column is_self boolean not null default false;
alter table feedback_answers add column answer_value integer check (answer_value between 1 and 5);

-- ============================================================
-- feedback_response_count — ahora excluye la autoevaluación: no cuenta
-- para el umbral de anonimato de las respuestas de compañeros.
-- ============================================================
create or replace function feedback_response_count(p_request_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from feedback_responses
  where feedback_request_id = p_request_id and not is_self;
$$;

-- ============================================================
-- feedback_responses — la autoevaluación se ve siempre; el resto sigue
-- gobernado por el umbral.
-- ============================================================
drop policy if exists "feedback_responses visible to requester above threshold" on feedback_responses;

create policy "feedback_responses visible to requester"
  on feedback_responses for select
  using (
    exists (
      select 1
      from feedback_requests fr
      join members m on m.id = fr.requester_member_id
      where fr.id = feedback_responses.feedback_request_id
        and m.auth_user_id = auth.uid()
        and (
          feedback_responses.is_self
          or feedback_response_count(fr.id) >= coalesce(
            (select min_responses_to_reveal from platform_settings where organization_id = fr.organization_id),
            (select min_responses_to_reveal from platform_settings where organization_id is null),
            3
          )
        )
    )
  );

-- ============================================================
-- submit_feedback_response — ahora acepta respuestas de escala
-- (answer_value) además de abiertas (answer_text), y marca is_self.
-- ============================================================
create or replace function submit_feedback_response(p_token uuid, p_answers jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation feedback_invitations;
  invitee members;
  is_self_response boolean;
  new_response_id uuid;
  answer jsonb;
  missing_required integer;
begin
  select * into invitation from feedback_invitations where token = p_token and used_at is null;

  if invitation is null then
    raise exception 'Invitación no válida o ya utilizada.';
  end if;

  if invitation.invitee_member_id is not null then
    select * into invitee from members where id = invitation.invitee_member_id;
    if invitee.auth_user_id is distinct from auth.uid() then
      raise exception 'Esta invitación no corresponde a tu usuario.';
    end if;
  end if;

  is_self_response := invitation.evaluator_category = 'self';

  select count(*) into missing_required
  from survey_questions sq
  where sq.template_id = (select template_id from feedback_requests where id = invitation.feedback_request_id)
    and sq.required
    and not exists (
      select 1 from jsonb_array_elements(p_answers) a
      where (a->>'question_id')::uuid = sq.id
        and (
          coalesce(trim(a->>'answer_text'), '') <> ''
          or (a->>'answer_value') is not null
        )
    );

  if missing_required > 0 then
    raise exception 'Faltan respuestas obligatorias.';
  end if;

  insert into feedback_responses (feedback_request_id, is_self)
  values (invitation.feedback_request_id, is_self_response)
  returning id into new_response_id;

  for answer in select * from jsonb_array_elements(p_answers)
  loop
    insert into feedback_answers (feedback_response_id, question_id, answer_text, answer_value)
    values (
      new_response_id,
      (answer->>'question_id')::uuid,
      answer->>'answer_text',
      nullif(answer->>'answer_value', '')::integer
    );
  end loop;

  update feedback_invitations set used_at = now() where id = invitation.id;

  return new_response_id;
end;
$$;

-- ============================================================
-- create_feedback_cycle — RRHH abre un ciclo 360 para toda la organización.
-- ============================================================
create or replace function create_feedback_cycle(p_name text, p_opens_at date, p_closes_at date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  default_template_id uuid;
  new_cycle_id uuid;
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

  select id into default_template_id from survey_templates where code = 'default_360_cycle';

  insert into feedback_cycles (organization_id, name, opens_at, closes_at, template_id)
  values (caller_member.organization_id, trim(p_name), p_opens_at, p_closes_at, default_template_id)
  returning id into new_cycle_id;

  return new_cycle_id;
end;
$$;

grant execute on function create_feedback_cycle(text, date, date) to authenticated;

-- ============================================================
-- organize_cycle_evaluators — el empleado, dentro de un ciclo abierto,
-- categoriza a sus evaluadores (spec 4.1); la autoevaluación se añade sola.
-- ============================================================
create or replace function organize_cycle_evaluators(
  p_cycle_id uuid,
  p_evaluator_member_ids uuid[],
  p_evaluator_categories text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  cycle feedback_cycles;
  min_invitees integer;
  new_request_id uuid;
  i integer;
  evaluator_id uuid;
  category text;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or caller_member.status <> 'active' then
    raise exception 'Debes iniciar sesión como empleado activo.';
  end if;

  select * into cycle from feedback_cycles
  where id = p_cycle_id and organization_id = caller_member.organization_id;

  if cycle is null then
    raise exception 'Ciclo no encontrado.';
  end if;

  if current_date < cycle.opens_at or current_date > cycle.closes_at then
    raise exception 'El ciclo no está abierto actualmente.';
  end if;

  if exists (
    select 1 from feedback_requests
    where cycle_id = p_cycle_id and requester_member_id = caller_member.id
  ) then
    raise exception 'Ya has organizado tus evaluadores para este ciclo.';
  end if;

  if coalesce(array_length(p_evaluator_member_ids, 1), 0)
      is distinct from coalesce(array_length(p_evaluator_categories, 1), 0) then
    raise exception 'Datos de evaluadores incompletos.';
  end if;

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if coalesce(array_length(p_evaluator_member_ids, 1), 0) < min_invitees then
    raise exception 'Tienes que organizar al menos % evaluadores.', min_invitees;
  end if;

  if caller_member.id = any(p_evaluator_member_ids) then
    raise exception 'No puedes incluirte a ti mismo como evaluador: tu autoevaluación se añade automáticamente.';
  end if;

  if exists (
    select 1
    from unnest(p_evaluator_member_ids) as e(id)
    left join members m on m.id = e.id
    where m.id is null
       or m.organization_id <> caller_member.organization_id
       or m.status <> 'active'
  ) then
    raise exception 'Todos los evaluadores deben ser empleados activos de tu organización.';
  end if;

  insert into feedback_requests (organization_id, requester_member_id, cycle_id, request_type, template_id)
  values (caller_member.organization_id, caller_member.id, p_cycle_id, 'cycle', cycle.template_id)
  returning id into new_request_id;

  for i in 1 .. array_length(p_evaluator_member_ids, 1) loop
    evaluator_id := p_evaluator_member_ids[i];
    category := p_evaluator_categories[i];

    if category not in ('manager', 'team', 'organization', 'other') then
      raise exception 'Categoría de evaluador no válida: %', category;
    end if;

    insert into feedback_invitations (feedback_request_id, invitee_member_id, evaluator_category)
    values (new_request_id, evaluator_id, category);
  end loop;

  insert into feedback_invitations (feedback_request_id, invitee_member_id, evaluator_category)
  values (new_request_id, caller_member.id, 'self');

  return new_request_id;
end;
$$;

grant execute on function organize_cycle_evaluators(uuid, uuid[], text[]) to authenticated;
