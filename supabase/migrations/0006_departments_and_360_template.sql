-- Brújula — departamentos, distinción empleado/responsable, y plantilla
-- por defecto del ciclo 360, basada en un cuestionario real (ver
-- conversación: "Desarrollo de Competencias - Borrador.xlsx").
--
-- Decisiones tomadas con el usuario antes de escribir esto:
-- - El anonimato fuerte se mantiene también para la evaluación del jefe
--   directo: no hay excepción de identificación para ninguna categoría de
--   evaluador (spec, pregunta abierta de la sección 15, resuelta a favor
--   del anonimato fuerte).
-- - Este marco de 9 competencias pasa a ser la base por defecto de la
--   plataforma (sustituye al placeholder genérico de 0001), sabiendo que
--   se irá ajustando con el tiempo; cada empresa podrá seguir añadiendo
--   las suyas propias (org_competencies).

-- ============================================================
-- departments — para poder agregar estadísticas por departamento más
-- adelante (spec, sección "qué ve cada rol"). Sustituye a members.team,
-- que nunca llegó a usarse.
-- ============================================================
alter table members drop column team;

create table departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table members add column department_id uuid references departments(id);
alter table members add column is_manager boolean not null default false;

-- Toda organización existente (y las nuevas, ver create_organization_and_admin
-- más abajo) tiene al menos un departamento por defecto: si la empresa es
-- pequeña, ese "General" es el único que necesitará.
insert into departments (organization_id, name)
select id, 'General' from organizations
on conflict (organization_id, name) do nothing;

update members m
set department_id = d.id
from departments d
where d.organization_id = m.organization_id
  and d.name = 'General'
  and m.department_id is null;

alter table members alter column department_id set not null;

alter table departments enable row level security;

create policy "departments scoped to organization"
  on departments for select
  using (organization_id in (select auth_member_organization_ids()));

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

  if caller_member is null or caller_member.role <> 'org_admin' then
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

-- ============================================================
-- create_organization_and_admin — ahora crea también el departamento
-- "General" por defecto y coloca en él al primer administrador.
-- ============================================================
create or replace function create_organization_and_admin(org_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  already_member boolean;
  default_department_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para crear una organización.';
  end if;

  select exists(select 1 from members where auth_user_id = auth.uid())
    into already_member;

  if already_member then
    raise exception 'Este usuario ya pertenece a una organización.';
  end if;

  insert into organizations (name) values (org_name)
    returning id into new_org_id;

  insert into departments (organization_id, name)
  values (new_org_id, 'General')
  returning id into default_department_id;

  insert into members (organization_id, auth_user_id, email, role, department_id)
  values (new_org_id, auth.uid(), auth.email(), 'org_admin', default_department_id);

  insert into platform_settings (organization_id, min_invitees_per_request, min_responses_to_reveal)
  values (new_org_id, 5, 3);

  return new_org_id;
end;
$$;

-- ============================================================
-- invite_member — ahora exige departamento y permite marcar si la persona
-- es responsable de equipo (decide qué preguntas del ciclo 360 le aplican).
-- ============================================================
drop function if exists invite_member(text, text);

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

  if caller_member.role <> 'org_admin' then
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

-- ============================================================
-- competency_frameworks / org_competencies — distinción empleado vs
-- responsable, y nuevo marco por defecto de 9 competencias.
-- ============================================================
alter table competency_frameworks
  add column applies_to text not null default 'all' check (applies_to in ('all', 'manager_only'));

alter table org_competencies
  add column applies_to text not null default 'all' check (applies_to in ('all', 'manager_only'));

delete from competency_frameworks;

insert into competency_frameworks (code, name, description, applies_to) values
  ('orientacion_resultados', 'Orientación a resultados', 'Empuje y energía para conseguir resultados, mejora continua y foco en lo importante.', 'all'),
  ('liderazgo_servicio', 'Liderazgo al servicio', 'Actúa con humildad, sin necesidad de reconocimiento, buscando puntos en común.', 'all'),
  ('autenticidad', 'Autenticidad', 'Conducta alineada con los propios valores, valentía en las conversaciones difíciles.', 'all'),
  ('equilibrio_emocional', 'Equilibrio emocional', 'Gestión del estrés y la presión, empatía y comprensión hacia los demás.', 'all'),
  ('trabajo_equipo', 'Trabajo en equipo', 'Relaciones cercanas, fomento del trabajo en equipo y de un ambiente positivo.', 'all'),
  ('toma_decisiones', 'Toma de decisiones', 'Eficiencia y valentía a la hora de tomar decisiones, incluso las difíciles.', 'all'),
  ('vision_estrategica', 'Visión estratégica', 'Visión a largo plazo que ayuda a la organización a prosperar y a mantenerse alineada.', 'manager_only'),
  ('vision_sistemica', 'Visión sistémica', 'Percibe la organización como un todo, equilibrando el corto y el largo plazo.', 'manager_only'),
  ('mentoring_desarrollo', 'Mentoring y desarrollo', 'Promueve el liderazgo de otros y da feedback para su desarrollo profesional.', 'manager_only');

-- ============================================================
-- survey_questions — vínculo a competencia y a quién aplica (empleado vs
-- responsable), necesario para el ciclo 360 y para el futuro gráfico de
-- araña de competencias.
-- ============================================================
alter table survey_questions add column competency_code text;
alter table survey_questions
  add column applies_to text not null default 'all' check (applies_to in ('all', 'manager_only'));

-- ============================================================
-- rating_scale_levels — escala 1-5 con significado, igual para toda la
-- plataforma (preguntas de tipo "scale" del ciclo 360).
-- ============================================================
create table rating_scale_levels (
  level integer primary key,
  label text not null,
  description text not null
);

alter table rating_scale_levels enable row level security;

create policy "rating_scale_levels readable by authenticated"
  on rating_scale_levels for select
  using (auth.role() = 'authenticated');

insert into rating_scale_levels (level, label, description) values
  (1, 'No cumple con la mayoría de las expectativas', 'El desempeño está claramente por debajo de los requisitos básicos de la función.'),
  (2, 'Cumple con pocas expectativas', 'No cumple completamente los requisitos del rol; necesita más desarrollo y compromiso.'),
  (3, 'Cumple con la mayoría de las expectativas', 'Consigue regularmente los resultados esperados, con el conocimiento y la experiencia adecuados.'),
  (4, 'Supera las expectativas', 'Nivel de ejecución que supera con creces lo esperado en varios aspectos del trabajo.'),
  (5, 'Supera las expectativas ampliamente', 'Reservado para quienes logran de forma clara y constante resultados excepcionales.');

-- ============================================================
-- feedback_cycles — vínculo a la plantilla del ciclo (spec 4.1).
-- ============================================================
alter table feedback_cycles add column template_id uuid references survey_templates(id);

-- ============================================================
-- Datos semilla: plantilla por defecto del ciclo 360 (24 preguntas: 15
-- de escala para cualquier empleado, 6 de escala solo para responsables,
-- y 3 abiertas para cualquier evaluado).
-- ============================================================
insert into survey_templates (code, name)
values ('default_360_cycle', 'Ciclo 360 por defecto');

insert into survey_questions (template_id, position, prompt, question_type, required, competency_code, applies_to)
select t.id, v.position, v.prompt, v.question_type, true, v.competency_code, v.applies_to
from survey_templates t
cross join (values
  (1, 'Me oriento a resultados con empuje y energía', 'scale', 'orientacion_resultados', 'all'),
  (2, 'Me esfuerzo en la mejora contínua', 'scale', 'orientacion_resultados', 'all'),
  (3, 'Me enfoco con rapidez en asuntos clave', 'scale', 'orientacion_resultados', 'all'),
  (4, 'Tomo acción sin necesidad de reconocimiento', 'scale', 'liderazgo_servicio', 'all'),
  (5, 'Actúo con humildad', 'scale', 'liderazgo_servicio', 'all'),
  (6, 'Trabajo para encontrar los intereses en común', 'scale', 'liderazgo_servicio', 'all'),
  (7, 'Muestro una conducta personal alineada con mis valores', 'scale', 'autenticidad', 'all'),
  (8, 'Soy valiente en las reuniones', 'scale', 'autenticidad', 'all'),
  (9, 'Gestiono muy bien el estrés y la presión', 'scale', 'equilibrio_emocional', 'all'),
  (10, 'Soy una persona empática y comprensiva', 'scale', 'equilibrio_emocional', 'all'),
  (11, 'Creo relaciones cercanas y afectuosas con las personas', 'scale', 'trabajo_equipo', 'all'),
  (12, 'Promuevo el trabajo en equipo mediante mi estilo de liderazgo', 'scale', 'trabajo_equipo', 'all'),
  (13, 'Creo un ambiente positivo que ayuda al trabajo en equipo', 'scale', 'trabajo_equipo', 'all'),
  (14, 'Soy eficiente en la toma de decisiones', 'scale', 'toma_decisiones', 'all'),
  (15, 'Tomo decisiones difíciles cuando se requiere', 'scale', 'toma_decisiones', 'all'),
  (16, 'Tengo una visión estratégica que ayuda a la organización a prosperar', 'scale', 'vision_estrategica', 'manager_only'),
  (17, 'Promuevo una visión a largo plazo que permite a la organización estar alineada', 'scale', 'vision_estrategica', 'manager_only'),
  (18, 'Percibo la compañía como una organización única', 'scale', 'vision_sistemica', 'manager_only'),
  (19, 'Equilibro los resultados a corto plazo con el bienestar y la salud de la organización a largo plazo', 'scale', 'vision_sistemica', 'manager_only'),
  (20, 'Promuevo el liderazgo de los demás y ayudo a las personas a aprender y desarrollarse', 'scale', 'mentoring_desarrollo', 'manager_only'),
  (21, 'Proporciono feedback a mis colaboradores para su desarrollo profesional', 'scale', 'mentoring_desarrollo', 'manager_only'),
  (22, '¿Qué es lo que destaca de esta persona y cómo le sugerirías que lo utilizara más?', 'open', null, 'all'),
  (23, '¿Qué reto tiene esta persona en el desarrollo de su liderazgo?', 'open', null, 'all'),
  (24, '¿Qué feedback adicional quieres proporcionar a esta persona para ayudarle más a desarrollar su potencial?', 'open', null, 'all')
) as v(position, prompt, question_type, competency_code, applies_to)
where t.code = 'default_360_cycle';
