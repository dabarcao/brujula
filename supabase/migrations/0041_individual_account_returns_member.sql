-- Brújula — create_individual_account solo devolvía el id de la
-- organización creada; el dashboard hacía una relectura de "members"
-- justo después, en la misma petición, para pintar la página — y esa
-- relectura a veces no veía todavía la fila recién creada (visto en
-- pruebas reales: el primer intento fallaba en silencio sin ningún
-- error, el segundo ya funcionaba). Se quita esa dependencia devolviendo
-- ya los datos que hacen falta, sin volver a leer nada.

drop function if exists create_individual_account(text, text);

create or replace function create_individual_account(p_full_name text, p_email text)
returns table (
  member_id uuid,
  organization_id uuid,
  organization_name text,
  organization_kind text,
  is_supervisor boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  new_org_name text;
  default_department_id uuid;
  new_member_id uuid;
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

  new_org_name := coalesce(nullif(trim(p_full_name), ''), p_email);

  insert into organizations (name, kind)
  values (new_org_name, 'individual')
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
  )
  returning id into new_member_id;

  return query select new_member_id, new_org_id, new_org_name, 'individual'::text, true;
end;
$$;

grant execute on function create_individual_account(text, text) to authenticated;
