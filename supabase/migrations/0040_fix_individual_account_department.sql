-- Brújula — members.department_id es NOT NULL (migración 0006), pero
-- create_individual_account no lo rellenaba: fallaba con "null value in
-- column department_id violates not-null constraint" al registrarse.
-- Se sigue el mismo patrón que create_organization_as_admin (0016):
-- crear un departamento "General" propio de la organización nueva antes
-- de insertar el member. Para una cuenta individual, ese departamento
-- nunca se muestra ni se usa para nada — es solo para satisfacer la
-- restricción de la columna.

drop function if exists create_individual_account(text, text);

create or replace function create_individual_account(p_full_name text, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  default_department_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if exists (select 1 from members where auth_user_id = auth.uid()) then
    raise exception 'Ya tienes una cuenta asociada.';
  end if;

  if p_email is null or trim(p_email) = '' then
    raise exception 'No se pudo determinar tu email.';
  end if;

  insert into organizations (name, kind)
  values (coalesce(nullif(trim(p_full_name), ''), p_email), 'individual')
  returning id into new_org_id;

  insert into departments (organization_id, name)
  values (new_org_id, 'General')
  returning id into default_department_id;

  insert into members (
    organization_id, auth_user_id, email, full_name, is_supervisor, status, department_id
  )
  values (
    new_org_id,
    auth.uid(),
    p_email,
    nullif(trim(p_full_name), ''),
    true,
    'active',
    default_department_id
  );

  return new_org_id;
end;
$$;

grant execute on function create_individual_account(text, text) to authenticated;
