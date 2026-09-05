-- Brújula — el Supervisor necesita ver, por cada participante de un
-- ciclo 360 que él mismo abrió, en qué estado está: no_iniciado (no ha
-- organizado sus evaluadores todavía), en_progreso (los organizó, pero
-- aún faltan respuestas) o completado (respondieron todos, o ya cerró el
-- ciclo). feedback_cycle_participants y feedback_invitations no son
-- legibles directamente por el Supervisor vía RLS (solo por el propio
-- participante), así que hace falta una función security definer que
-- calcule todo de una vez.

create or replace function get_cycle_status(p_cycle_id uuid)
returns table (
  member_id uuid,
  full_name text,
  email text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  cycle feedback_cycles;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null or not caller_member.is_supervisor then
    raise exception 'Solo el administrador de la empresa puede ver el estado de un ciclo.';
  end if;

  select * into cycle from feedback_cycles where id = p_cycle_id;

  if cycle is null or cycle.organization_id <> caller_member.organization_id then
    raise exception 'Ciclo no encontrado.';
  end if;

  return query
  select
    m.id,
    m.full_name,
    m.email,
    case
      when fr.id is null then 'no_iniciado'
      when (
        fr.status = 'closed'
        or feedback_response_count(fr.id) >= (
          select count(*) from feedback_invitations where feedback_request_id = fr.id
        )
        or cycle.closes_at < current_date
      ) then 'completado'
      else 'en_progreso'
    end
  from feedback_cycle_participants fcp
  join members m on m.id = fcp.member_id
  left join feedback_requests fr
    on fr.cycle_id = fcp.cycle_id and fr.requester_member_id = fcp.member_id
  where fcp.cycle_id = p_cycle_id
  order by m.email;
end;
$$;

grant execute on function get_cycle_status(uuid) to authenticated;
