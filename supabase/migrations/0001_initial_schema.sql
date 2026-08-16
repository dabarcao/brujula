-- Brújula — esquema inicial
--
-- Nombres de tabla en inglés y genéricos (organizations / members en vez de
-- companies / employees) siguiendo la nota de extensibilidad de la spec:
-- así el vertical pyme no queda hardcodeado en el modelo de datos, aunque
-- la interfaz para el usuario siga hablando de "tu empresa" / "tus compañeros".
--
-- Principio de anonimato (spec, sección 6): la tabla que registra QUIÉN fue
-- invitado a dar feedback (feedback_invitations) y la que guarda EL CONTENIDO
-- de las respuestas (feedback_responses) están desacopladas a propósito.
-- feedback_responses no tiene ninguna columna que identifique al autor.

-- ============================================================
-- Extensiones necesarias
-- ============================================================
create extension if not exists "pgcrypto"; -- para gen_random_uuid()

-- ============================================================
-- organizations (tenants)
-- ============================================================
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- members (usuarios dentro de una organización)
-- ============================================================
create table members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'member' check (role in ('member', 'org_admin')),
  team text, -- equipo/departamento, texto libre en el MVP
  created_at timestamptz not null default now(),
  unique (organization_id, auth_user_id)
);

create index members_organization_id_idx on members(organization_id);

-- ============================================================
-- platform_settings — umbrales de anonimato (sección 6 de la spec)
-- ============================================================
create table platform_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade, -- null = valor global de la plataforma
  min_invitees_per_request integer not null default 5,
  min_responses_to_reveal integer not null default 3,
  created_at timestamptz not null default now()
);

-- Suelo de seguridad no configurable: ninguna fila puede bajar de estos
-- mínimos, ni siquiera una configuración a nivel de organización.
alter table platform_settings
  add constraint min_invitees_floor check (min_invitees_per_request >= 5),
  add constraint min_responses_floor check (min_responses_to_reveal >= 3);

-- ============================================================
-- competency_frameworks (marco por defecto de la plataforma)
-- y org_competencies (competencias propias de cada organización)
-- ============================================================
create table competency_frameworks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- ej. 'communication', 'collaboration'
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table org_competencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create index org_competencies_organization_id_idx on org_competencies(organization_id);

-- ============================================================
-- feedback_cycles (ciclo estructurado 360)
-- ============================================================
create table feedback_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  opens_at date not null,
  closes_at date not null,
  created_at timestamptz not null default now()
);

create index feedback_cycles_organization_id_idx on feedback_cycles(organization_id);

-- ============================================================
-- feedback_requests (una petición de feedback, ágil o dentro de un ciclo)
-- ============================================================
create table feedback_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  requester_member_id uuid not null references members(id) on delete cascade,
  cycle_id uuid references feedback_cycles(id) on delete set null, -- null = flujo ágil
  request_type text not null check (request_type in ('ad_hoc', 'cycle')),
  context_note text, -- ej. "feedback sobre la reunión del martes"
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'closed'))
);

create index feedback_requests_organization_id_idx on feedback_requests(organization_id);
create index feedback_requests_requester_member_id_idx on feedback_requests(requester_member_id);

-- ============================================================
-- feedback_invitations — quién fue invitado (separado del contenido)
-- ============================================================
create table feedback_invitations (
  id uuid primary key default gen_random_uuid(),
  feedback_request_id uuid not null references feedback_requests(id) on delete cascade,
  invitee_member_id uuid references members(id) on delete set null,
  evaluator_category text check (evaluator_category in ('manager', 'team', 'organization', 'other')),
  token uuid not null default gen_random_uuid() unique, -- token de un solo uso
  used_at timestamptz, -- se rellena cuando se envía la respuesta; el token deja de servir
  created_at timestamptz not null default now()
);

create index feedback_invitations_feedback_request_id_idx on feedback_invitations(feedback_request_id);

-- ============================================================
-- feedback_responses — el contenido, SIN columna de autor
-- ============================================================
create table feedback_responses (
  id uuid primary key default gen_random_uuid(),
  feedback_request_id uuid not null references feedback_requests(id) on delete cascade,
  text_content text,
  survey_answers jsonb, -- respuestas de encuesta corta, si aplica
  suggested_competency_tags text[], -- etiquetas aceptadas por quien escribió el feedback (sección 5.1)
  submitted_at timestamptz not null default now()
);

create index feedback_responses_feedback_request_id_idx on feedback_responses(feedback_request_id);

-- ============================================================
-- insights — resultados del motor de análisis (asociados al RECEPTOR, nunca al emisor)
-- ============================================================
create table insights (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  competency_code text not null,
  summary text not null,
  based_on_response_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index insights_member_id_idx on insights(member_id);

-- ============================================================
-- competency_scores — puntuación acumulada por miembro y competencia
-- (base del gráfico de araña, sección 9, y de futuros percentiles, sección 10)
-- ============================================================
create table competency_scores (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  competency_code text not null,
  score numeric(4,2) not null, -- ej. 1.00 a 6.00
  response_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (member_id, competency_code)
);

-- ============================================================
-- Row-Level Security
-- ============================================================
alter table organizations enable row level security;
alter table members enable row level security;
alter table platform_settings enable row level security;
alter table competency_frameworks enable row level security;
alter table org_competencies enable row level security;
alter table feedback_cycles enable row level security;
alter table feedback_requests enable row level security;
alter table feedback_invitations enable row level security;
alter table feedback_responses enable row level security;
alter table insights enable row level security;
alter table competency_scores enable row level security;

-- Función auxiliar: organización(es) a las que pertenece el usuario logueado
create or replace function auth_member_organization_ids()
returns setof uuid
language sql stable
as $$
  select organization_id from members where auth_user_id = auth.uid();
$$;

-- competency_frameworks: lectura pública (catálogo de la plataforma, sin datos sensibles)
create policy "competency_frameworks readable by anyone authenticated"
  on competency_frameworks for select
  using (auth.role() = 'authenticated');

-- organizations: un miembro solo ve su(s) propia(s) organización(es)
create policy "members see their own organization"
  on organizations for select
  using (id in (select auth_member_organization_ids()));

-- members: solo visibles dentro de la misma organización
create policy "members see colleagues in same organization"
  on members for select
  using (organization_id in (select auth_member_organization_ids()));

-- org_competencies: visibles solo dentro de la organización
create policy "org_competencies scoped to organization"
  on org_competencies for select
  using (organization_id in (select auth_member_organization_ids()));

-- feedback_cycles: visibles solo dentro de la organización
create policy "feedback_cycles scoped to organization"
  on feedback_cycles for select
  using (organization_id in (select auth_member_organization_ids()));

-- feedback_requests: visibles solo dentro de la organización
create policy "feedback_requests scoped to organization"
  on feedback_requests for select
  using (organization_id in (select auth_member_organization_ids()));

-- feedback_invitations: NO se exponen directamente a miembros normales.
-- El estado de participación (cuántos invitados/cuántos han respondido) se
-- sirve a través de una función, no de una consulta directa a esta tabla,
-- precisamente para que no sea trivial cruzar invitado <-> respuesta.
-- (sin policy de "select" para miembros: por defecto, RLS deniega todo)

-- feedback_responses: solo visibles para el solicitante del feedback en
-- cuestión, y solo si se alcanzó el umbral mínimo de respuestas.
create policy "feedback_responses visible to requester above threshold"
  on feedback_responses for select
  using (
    feedback_request_id in (
      select fr.id
      from feedback_requests fr
      join members m on m.id = fr.requester_member_id
      where m.auth_user_id = auth.uid()
        and (
          select count(*) from feedback_responses fr2
          where fr2.feedback_request_id = fr.id
        ) >= coalesce(
          (select min_responses_to_reveal from platform_settings where organization_id = fr.organization_id),
          (select min_responses_to_reveal from platform_settings where organization_id is null),
          3
        )
    )
  );

-- insights: solo visibles para el propio miembro
create policy "insights visible to own member only"
  on insights for select
  using (member_id in (select id from members where auth_user_id = auth.uid()));

-- competency_scores: solo visibles para el propio miembro
create policy "competency_scores visible to own member only"
  on competency_scores for select
  using (member_id in (select id from members where auth_user_id = auth.uid()));

-- platform_settings: legible por miembros de la organización (para saber los
-- umbrales vigentes), no editable desde el cliente.
create policy "platform_settings readable by org members"
  on platform_settings for select
  using (
    organization_id is null
    or organization_id in (select auth_member_organization_ids())
  );

-- Nota: las operaciones de escritura (insert/update) sobre feedback_requests,
-- feedback_invitations y feedback_responses se implementarán vía funciones
-- "security definer" (RPC) en la fase de construcción del flujo de feedback
-- (tarea "Construir el flujo ágil de solicitud de feedback"), no con policies
-- de insert abiertas, para poder aplicar la lógica de token de un solo uso y
-- el desacople autor/contenido de forma controlada en el servidor.

-- ============================================================
-- Datos semilla: marco de competencias por defecto de la plataforma
-- ============================================================
insert into competency_frameworks (code, name, description) values
  ('communication', 'Comunicación', 'Claridad y eficacia al transmitir ideas.'),
  ('collaboration', 'Colaboración', 'Trabajo en equipo y apoyo a compañeros.'),
  ('leadership', 'Liderazgo', 'Capacidad de guiar, inspirar y tomar decisiones.'),
  ('time_management', 'Gestión del tiempo', 'Organización y cumplimiento de plazos.'),
  ('problem_solving', 'Resolución de problemas', 'Capacidad de analizar y resolver dificultades.'),
  ('adaptability', 'Adaptabilidad', 'Flexibilidad ante cambios e imprevistos.');
