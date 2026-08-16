-- Brújula — corrige recursión infinita en RLS
--
-- auth_member_organization_ids() se usa dentro de las políticas de RLS de
-- "members" (y de otras tablas). Al no ser security definer, su propia
-- consulta interna a "members" quedaba sujeta a esa misma política, que
-- vuelve a llamar a la función, que vuelve a consultar "members"... hasta
-- agotar la pila ("stack depth limit exceeded"). La marcamos security
-- definer para que su consulta interna no dispare RLS de nuevo: es segura
-- porque solo devuelve los organization_id del propio auth.uid(), nunca
-- datos de terceros.

create or replace function auth_member_organization_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select organization_id from members where auth_user_id = auth.uid();
$$;
