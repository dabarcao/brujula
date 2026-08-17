-- Brújula — la creación de cuestionarios deja de ser una capacidad del
-- Supervisor (org_admin) de cada empresa. Pasa a ser exclusiva del futuro
-- Admin general de plataforma (ver docs/spec.md sección 2), que todavía no
-- existe como rol en el sistema — así que, de momento, nadie puede crear ni
-- editar cuestionarios propios de empresa desde la app.
--
-- No se tocan las plantillas propias de empresa que ya existieran (por
-- ejemplo, de pruebas anteriores): las solicitudes que ya las usan siguen
-- funcionando igual, solo se bloquea crear/editar/borrar nuevas.

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
begin
  raise exception 'Los cuestionarios los gestiona el administrador de la plataforma, no cada empresa.';
end;
$$;

create or replace function delete_org_ad_hoc_template(p_subtype text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Los cuestionarios los gestiona el administrador de la plataforma, no cada empresa.';
end;
$$;

create or replace function set_org_360_extra_questions(p_questions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Los cuestionarios los gestiona el administrador de la plataforma, no cada empresa.';
end;
$$;
