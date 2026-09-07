-- Brújula — create_individual_account leía el email desde auth.users,
-- que según los permisos del proyecto puede no ser accesible ni siquiera
-- para una función security definer. Se quita esa dependencia: el email
-- ya lo tiene el servidor (auth.getUser(), sección /dashboard) y se pasa
-- como parámetro, igual que ya se hace con el nombre.

drop function if exists create_individual_account(text);

create or replace function create_individual_account(p_full_name text, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
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

  insert into members (organization_id, auth_user_id, email, full_name, is_supervisor, status)
  values (new_org_id, auth.uid(), p_email, nullif(trim(p_full_name), ''), true, 'active');

  return new_org_id;
end;
$$;

grant execute on function create_individual_account(text, text) to authenticated;
