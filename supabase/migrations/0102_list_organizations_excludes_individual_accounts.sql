-- Brújula — /admin ("Empresas") contaba y listaba TAMBIÉN las cuentas
-- individuales (organizations.kind = 'individual', 0037_individual_accounts.sql)
-- como si fueran empresas de verdad -- list_organizations() nunca filtró
-- por kind, ni en su versión original (0017_supervisor_and_admin_
-- management.sql) ni en la paginada (0100_list_organizations_pagination.sql,
-- que solo añadió paginación conservando ese mismo comportamiento). Con
-- pocas cuentas no se notaba; con el volumen acumulado de pruebas se ve
-- claro: "33 empresas" incluía cuentas individuales de una sola persona.
--
-- Firma y forma de la tabla sin cambios -- solo una condición añadida al
-- where, create or replace de toda la vida, sin necesidad de drop.

create or replace function list_organizations(
  p_limit integer default null,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  supervisor_email text,
  supervisor_status text,
  total_count bigint
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
    m.status,
    count(*) over() as total_count
  from organizations o
  left join members m on m.organization_id = o.id and m.is_supervisor
  where is_platform_admin()
    and o.kind = 'company'
  order by o.created_at desc, o.id desc
  limit greatest(coalesce(p_limit, 2147483647), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function list_organizations(integer, integer) to authenticated;
