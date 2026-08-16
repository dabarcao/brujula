-- Brújula — alta de organización y primer administrador
--
-- Un usuario recién registrado en Supabase Auth todavía no tiene fila en
-- "members", así que las policies basadas en auth_member_organization_ids()
-- no le dejarían insertar nada (por diseño: RLS deniega por defecto). Esta
-- función, con SECURITY DEFINER, es la única puerta de entrada para crear
-- una organización nueva y convertir a quien la crea en su org_admin.

create or replace function create_organization_and_admin(org_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  already_member boolean;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para crear una organización.';
  end if;

  -- Evita que un usuario que ya pertenece a una organización cree otra
  -- por error desde esta misma función (alta múltiple se gestionará
  -- más adelante como caso explícito, no accidental).
  select exists(select 1 from members where auth_user_id = auth.uid())
    into already_member;

  if already_member then
    raise exception 'Este usuario ya pertenece a una organización.';
  end if;

  insert into organizations (name) values (org_name)
    returning id into new_org_id;

  insert into members (organization_id, auth_user_id, email, role)
  values (new_org_id, auth.uid(), auth.email(), 'org_admin');

  -- Umbrales de anonimato por defecto para la organización (sección 6 de
  -- la spec): se crean explícitos aquí para que quede un registro propio,
  -- aunque coincidan con el suelo de seguridad global.
  insert into platform_settings (organization_id, min_invitees_per_request, min_responses_to_reveal)
  values (new_org_id, 5, 3);

  return new_org_id;
end;
$$;

-- Cualquier usuario autenticado puede llamar a esta función (la lógica de
-- "solo si no pertenece ya a una organización" vive dentro de la función).
grant execute on function create_organization_and_admin(text) to authenticated;
