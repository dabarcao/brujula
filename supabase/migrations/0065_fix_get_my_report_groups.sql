-- Brújula — arreglo de get_my_report_groups (migración 0064): el nombre
-- de columna de salida `status` (declarado en RETURNS TABLE) queda
-- accesible como variable en toda la función PL/pgSQL, incluidas las
-- subconsultas — el `status = 'accepted'` sin cualificar dentro de las
-- subconsultas de conteo era ambiguo (¿la columna de salida, o
-- report_group_members.status?). Se cualifica con el alias de la tabla.

create or replace function get_my_report_groups()
returns table (
  id uuid,
  name text,
  status text,
  created_by_member_id uuid,
  is_creator boolean,
  my_status text,
  accepted_count integer,
  total_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  return query
  select
    g.id,
    g.name,
    g.status,
    g.created_by_member_id,
    g.created_by_member_id = caller_member.id,
    rgm_self.status,
    (select count(*)::integer from report_group_members rgm where rgm.group_id = g.id and rgm.status = 'accepted'),
    (select count(*)::integer from report_group_members rgm where rgm.group_id = g.id)
  from report_groups g
  left join report_group_members rgm_self
    on rgm_self.group_id = g.id and rgm_self.member_id = caller_member.id
  where g.created_by_member_id = caller_member.id
     or rgm_self.member_id = caller_member.id
  order by g.created_at desc;
end;
$$;
