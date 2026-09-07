-- Brújula — el reclamo de invitaciones pendientes por email (0045) solo
-- pasaba en el momento exacto de activar la cuenta. Dos casos se quedaban
-- sin cubrir: una cuenta creada ANTES de existir esa migración, y alguien
-- invitado por email DESPUÉS de ya tener cuenta (el orden inverso). Se
-- añade una función que se llama en cada visita al panel — barata (un
-- solo UPDATE, normalmente sin filas que tocar) e idempotente.

create or replace function claim_pending_email_invitations()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
begin
  select * into caller_member from members where auth_user_id = auth.uid();

  if caller_member is null then
    return;
  end if;

  update feedback_invitations
  set invitee_member_id = caller_member.id
  where lower(invitee_email) = lower(caller_member.email)
    and invitee_member_id is null
    and used_at is null;
end;
$$;

grant execute on function claim_pending_email_invitations() to authenticated;
