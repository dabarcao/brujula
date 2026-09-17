-- Brújula Core — Story 7.1 (schema port): restores the Supervisor-exclusion
-- guard on update_ad_hoc_feedback_request_evaluators, dropped somewhere
-- across upstream's rewrites of this function for the "email only new
-- evaluators" feature (renumbered 0091_add_evaluators_email_only_new.sql,
-- 0094_fix_ambiguous_returning_column.sql). The sibling function for
-- 360-cycle requests, update_cycle_request_evaluators
-- (0034_update_cycle_request_evaluators.sql), still carries this same
-- guard unchanged — this looks like an unintentional regression in the
-- ad-hoc path specifically, not a deliberate decision (the rule itself
-- dates to 0032_supervisor_cannot_be_evaluator.sql, "el Supervisor no
-- puede ser invitado a dar feedback").
--
-- This is a brujula-core-owned migration, not a renumbered upstream one —
-- 0090-0095 stay byte-identical to what upstream actually shipped (for
-- traceability), and this fix layers on top via a further create or
-- replace, exactly as any other bugfix in this repo's own migration
-- history already does against an earlier migration.
--
-- Body is byte-identical to update_ad_hoc_feedback_request_evaluators's
-- current definition (0094_fix_ambiguous_returning_column.sql), with only
-- the invitee-validation guard changed: adds `or m.is_supervisor` back to
-- the exclusion check, and restores the original, more specific error
-- message (0032's own text) that update_cycle_request_evaluators's
-- sibling guard still uses today.

create or replace function update_ad_hoc_feedback_request_evaluators(
  p_request_id uuid,
  p_invitee_member_ids uuid[]
)
returns table (invitee_member_id uuid, token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_member members;
  req feedback_requests;
  min_invitees integer;
begin
  select * into caller_member from members where auth_user_id = auth.uid();
  if caller_member is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into req from feedback_requests where id = p_request_id;

  if req is null or req.requester_member_id <> caller_member.id then
    raise exception 'Solicitud no encontrada.';
  end if;

  if req.request_type <> 'ad_hoc' then
    raise exception 'Solo se pueden modificar solicitudes del flujo ágil.';
  end if;

  if req.status <> 'open' then
    raise exception 'Esta solicitud ya no está abierta.';
  end if;

  if feedback_response_count(p_request_id) > 0 then
    raise exception 'No se puede modificar: ya hay respuestas.';
  end if;

  select coalesce(
    (select min_invitees_per_request from platform_settings where organization_id = caller_member.organization_id),
    (select min_invitees_per_request from platform_settings where organization_id is null),
    5
  ) into min_invitees;

  if coalesce(array_length(p_invitee_member_ids, 1), 0) < min_invitees then
    raise exception 'Tienes que invitar al menos a % personas.', min_invitees;
  end if;

  if caller_member.id = any(p_invitee_member_ids) then
    raise exception 'No puedes invitarte a ti mismo.';
  end if;

  if exists (
    select 1
    from unnest(p_invitee_member_ids) as invitee(id)
    left join members m on m.id = invitee.id
    where m.id is null
       or m.organization_id <> caller_member.organization_id
       or m.status <> 'active'
       or m.is_supervisor
  ) then
    raise exception 'Todos los invitados deben ser empleados activos de tu organización (el Supervisor no puede ser invitado a dar feedback).';
  end if;

  return query
  insert into feedback_invitations (feedback_request_id, invitee_member_id)
  select p_request_id, x
  from unnest(p_invitee_member_ids) as x
  where not exists (
    select 1 from feedback_invitations fi
    where fi.feedback_request_id = p_request_id and fi.invitee_member_id = x
  )
  returning feedback_invitations.invitee_member_id, feedback_invitations.token;
end;
$$;
