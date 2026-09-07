-- Brújula — "Tareas pendientes" mostraba "un compañero" en vez del
-- nombre de quien pidió el feedback, cuando esa persona pertenece a otra
-- organización (una cuenta individual invitando a otra, por ejemplo): la
-- política "members see colleagues in same organization" solo deja ver a
-- compañeros de tu propia organización, y ahora una invitación puede
-- cruzar organizaciones. No hay ningún problema de anonimato en dejar ver
-- esto — quien te invita ya sabes quién es, te llegó su nombre en la
-- invitación misma — así que se resuelve con una función específica en
-- vez de abrir la política general de "members" entre organizaciones.

create or replace function get_my_pending_invitation_requesters()
returns table (
  requester_member_id uuid,
  full_name text,
  email text
)
language sql
security definer
set search_path = public
stable
as $$
  select distinct m.id, m.full_name, m.email
  from feedback_invitations fi
  join feedback_requests fr on fr.id = fi.feedback_request_id
  join members m on m.id = fr.requester_member_id
  join members caller on caller.auth_user_id = auth.uid()
  where fi.invitee_member_id = caller.id
    and fi.used_at is null;
$$;

grant execute on function get_my_pending_invitation_requesters() to authenticated;
