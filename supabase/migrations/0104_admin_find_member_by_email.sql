-- Brújula — buscador por email en /admin (Admin general).
--
-- La lista "Empresas" de /admin solo muestra organizaciones kind='company'
-- (0102_list_organizations_excludes_individual_accounts.sql), así que una
-- cuenta individual (kind='individual', p.ej. la de un empleado migrado
-- como migrado1@kairos.es) no aparece ahí y no había ninguna forma de
-- llegar a su ficha desde la UI para editarla (0103_admin_update_member.sql)
-- -- solo pegando la URL /admin/empresas/{org_id} a mano si ya sabías el id.
--
-- admin_find_member_by_email resuelve cualquier email (de una empresa o de
-- una cuenta individual) a su organization_id, para que /admin pueda
-- redirigir directo a /admin/empresas/{organization_id}.

create or replace function admin_find_member_by_email(p_email text)
returns table (
  member_id uuid,
  organization_id uuid
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_platform_admin() then
    raise exception 'Solo el Admin general puede buscar empleados.';
  end if;

  return query
    select m.id, m.organization_id
    from members m
    where lower(m.email) = lower(trim(p_email))
    limit 1;
end;
$$;

grant execute on function admin_find_member_by_email(text) to authenticated;
