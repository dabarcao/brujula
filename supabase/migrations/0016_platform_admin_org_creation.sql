-- Brújula — el alta de empresas deja de ser autoservicio público (/signup).
-- Pasa a ser una acción del Admin general de plataforma (docs/spec.md
-- sección 2), identificado por estar en la tabla platform_admins. Desde
-- fuera de la app solo quedan dos puertas: iniciar sesión o entrar por
-- invitación (/invitacion/[token]).

create table platform_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;
-- A propósito, sin políticas: nadie lee ni escribe esta tabla directamente
-- vía PostgREST (ni anon ni authenticated). Solo la consultan las
-- funciones security definer de abajo.

insert into platform_admins (email) values ('david.abarca@gmail.com');

-- ============================================================
-- is_platform_admin — para que la UI sepa si mostrar el panel de admin.
-- ============================================================
create or replace function is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from platform_admins where lower(email) = lower(auth.email())
  );
$$;

grant execute on function is_platform_admin() to authenticated;

-- ============================================================
-- create_organization_as_admin — el Admin general da de alta una empresa
-- nueva y a su primer administrador (Supervisor), que queda "invited"
-- igual que un invite_member normal, hasta que complete su alta.
-- ============================================================
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
    organization_id, email, full_name, role, status, department_id
  )
  values (
    new_org_id,
    lower(trim(p_admin_email)),
    nullif(trim(coalesce(p_admin_full_name, '')), ''),
    'org_admin',
    'invited',
    default_department_id
  )
  returning invite_token into new_token;

  return new_token;
end;
$$;

grant execute on function create_organization_as_admin(text, text, text) to authenticated;

-- ============================================================
-- create_organization_and_admin — el alta pública de empresa (/signup) se
-- retira. Se mantiene la función (mismo patrón que 0015 con los
-- cuestionarios) pero deja de aceptar llamadas.
-- ============================================================
create or replace function create_organization_and_admin(org_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'El alta de empresas ya no es autoservicio. Solo el administrador de la plataforma puede crear empresas nuevas.';
end;
$$;
