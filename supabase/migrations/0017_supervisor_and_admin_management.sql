-- Brújula — tres cambios acordados en la misma tanda:
--
-- 1. El Supervisor deja de ser un "role" excluyente ('org_admin') y pasa a
--    ser una capacidad (is_supervisor) sobre un miembro normal, igual que
--    ya funciona is_manager ("Jefe"). Así una persona de RRHH puede ser, a
--    la vez, Supervisor y Usuario participante, con una sola cuenta — sin
--    el problema de tener dos cuentas con el mismo email. Un Supervisor por
--    empresa por ahora (índice único parcial).
--
-- 2. El ciclo 360 deja de abrirse automáticamente para toda la empresa: el
--    Supervisor selecciona explícitamente los participantes al crearlo
--    (feedback_cycle_participants). Los ciclos ya creados antes de esta
--    migración se rellenan con todos los empleados activos de su empresa,
--    para no romper ciclos ya en marcha.
--
-- 3. El Admin general puede listar y editar (renombrar) las empresas ya
--    creadas, no solo dar de alta una nueva (/admin).

-- ============================================================
-- 1. is_supervisor
-- ============================================================
alter table members add column is_supervisor boolean not null default false;

update members set is_supervisor = true where role = 'org_admin';

create unique index members_one_supervisor_per_org_idx
  on members (organization_id)
  where is_supervisor;

-- invite_member — el chequeo de permisos pasa de role a is_supervisor.
create or replace function invite_member(
  p_email text,
  p_full_name text,
  p_department_id uuid,
  p_is_manager boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  new_token uuid;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null then
    raise exception 'Debes iniciar sesión para invitar a un empleado.';
  end if;

  if not caller_member.is_supervisor then
    raise exception 'Solo un administrador puede invitar empleados.';
  end if;

  if p_email is null or trim(p_email) = '' then
    raise exception 'El email es obligatorio.';
  end if;

  if p_department_id is null or not exists (
    select 1 from departments
    where id = p_department_id and organization_id = caller_member.organization_id
  ) then
    raise exception 'Selecciona un departamento válido de tu organización.';
  end if;

  if exists (
    select 1 from members
    where organization_id = caller_member.organization_id
      and lower(email) = lower(trim(p_email))
  ) then
    raise exception 'Ya existe un empleado con ese email en tu organización.';
  end if;

  insert into members (
    organization_id, email, full_name, role, status, invited_by, department_id, is_manager
  )
  values (
    caller_member.organization_id,
    lower(trim(p_email)),
    nullif(trim(coalesce(p_full_name, '')), ''),
    'member',
    'invited',
    caller_member.id,
    p_department_id,
    coalesce(p_is_manager, false)
  )
  returning invite_token into new_token;

  return new_token;
end;
$$;

grant execute on function invite_member(text, text, uuid, boolean) to authenticated;

-- create_department — mismo cambio de chequeo.
create or replace function create_department(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  new_department_id uuid;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or not caller_member.is_supervisor then
    raise exception 'Solo un administrador puede crear departamentos.';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'El nombre del departamento es obligatorio.';
  end if;

  insert into departments (organization_id, name)
  values (caller_member.organization_id, trim(p_name))
  returning id into new_department_id;

  return new_department_id;
end;
$$;

grant execute on function create_department(text) to authenticated;

-- create_organization_as_admin — el primer usuario de una empresa nueva
-- queda como Supervisor (is_supervisor), no con role = 'org_admin'.
create or replace function create_organization_as_admin(
  p_org_name text,
  p_admin_email text,
  p_admin_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  default_department_id uuid;
  new_token uuid;
begin
  if not is_platform_admin() then
    raise exception 'Solo el administrador de la plataforma puede crear empresas.';
  end if;

  if p_org_name is null or trim(p_org_name) = '' then
    raise exception 'El nombre de la empresa es obligatorio.';
  end if;

  if p_admin_email is null or trim(p_admin_email) = '' then
    raise exception 'El email del primer administrador es obligatorio.';
  end if;

  insert into organizations (name) values (trim(p_org_name))
    returning id into new_org_id;

  insert into departments (organization_id, name)
  values (new_org_id, 'General')
  returning id into default_department_id;

  insert into members (
    organization_id, email, full_name, role, status, department_id, is_supervisor
  )
  values (
    new_org_id,
    lower(trim(p_admin_email)),
    nullif(trim(coalesce(p_admin_full_name, '')), ''),
    'member',
    'invited',
    default_department_id,
    true
  )
  returning invite_token into new_token;

  return new_token;
end;
$$;

grant execute on function create_organization_as_admin(text, text, text) to authenticated;

-- ============================================================
-- 2. Selección explícita de participantes en el ciclo 360
-- ============================================================
create table feedback_cycle_participants (
  cycle_id uuid not null references feedback_cycles(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  primary key (cycle_id, member_id)
);

alter table feedback_cycle_participants enable row level security;

create policy "members read their own cycle participation"
  on feedback_cycle_participants for select
  using (member_id in (select id from members where auth_user_id = auth.uid()));

-- Los ciclos ya creados antes de esta migración no tenían selección de
-- participantes: para no dejarlos sin nadie que pueda organizarse, se
-- rellenan con todos los empleados activos de su empresa (comportamiento
-- que ya tenían de hecho).
insert into feedback_cycle_participants (cycle_id, member_id)
select fc.id, m.id
from feedback_cycles fc
join members m on m.organization_id = fc.organization_id and m.status = 'active'
on conflict do nothing;

drop function if exists create_feedback_cycle(text, date, date);

create or replace function create_feedback_cycle(
  p_name text,
  p_opens_at date,
  p_closes_at date,
  p_participant_member_ids uuid[]
)
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

  if caller_member is null or not caller_member.is_supervisor then
    raise exception 'Solo un administrador puede crear un ciclo 360.';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'El nombre del ciclo es obligatorio.';
  end if;

  if p_opens_at is null or p_closes_at is null or p_closes_at <= p_opens_at then
    raise exception 'Las fechas del ciclo no son válidas.';
  end if;

  if coalesce(array_length(p_participant_member_ids, 1), 0) = 0 then
    raise exception 'Selecciona al menos un participante para el ciclo.';
  end if;

  if exists (
    select 1
    from unnest(p_participant_member_ids) as p(id)
    left join members m on m.id = p.id
    where m.id is null
       or m.organization_id <> caller_member.organization_id
       or m.status <> 'active'
  ) then
    raise exception 'Todos los participantes deben ser empleados activos de tu organización.';
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

  insert into feedback_cycle_participants (cycle_id, member_id)
  select new_cycle_id, unnest(p_participant_member_ids);

  return new_cycle_id;
end;
$$;

grant execute on function create_feedback_cycle(text, date, date, uuid[]) to authenticated;

-- organize_cycle_evaluators — solo puede organizarse quien fue seleccionado
-- como participante del ciclo.
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

  if not exists (
    select 1 from feedback_cycle_participants
    where cycle_id = p_cycle_id and member_id = caller_member.id
  ) then
    raise exception 'No has sido seleccionado como participante de este ciclo.';
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

-- ============================================================
-- 3. El Admin general lista y edita empresas ya creadas
-- ============================================================
create or replace function list_organizations()
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  supervisor_email text,
  supervisor_status text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    o.id,
    o.name,
    o.created_at,
    m.email,
    m.status
  from organizations o
  left join members m on m.organization_id = o.id and m.is_supervisor
  where is_platform_admin()
  order by o.created_at desc;
$$;

grant execute on function list_organizations() to authenticated;

create or replace function update_organization_name(p_org_id uuid, p_new_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'Solo el administrador de la plataforma puede editar empresas.';
  end if;

  if p_new_name is null or trim(p_new_name) = '' then
    raise exception 'El nombre de la empresa es obligatorio.';
  end if;

  update organizations set name = trim(p_new_name) where id = p_org_id;

  if not found then
    raise exception 'Empresa no encontrada.';
  end if;
end;
$$;

grant execute on function update_organization_name(uuid, text) to authenticated;
