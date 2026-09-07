-- Brújula — 0047 no fue suficiente: la propia consulta de "Tareas
-- pendientes" hace un embed `feedback_requests(requester_member_id)`
-- desde feedback_invitations, y "feedback_requests scoped to
-- organization" bloquea ese campo (vuelve null) en cuanto el
-- solicitante es de otra organización — el caso nuevo de invitar por
-- email entre cuentas individuales. Se reemplaza toda la consulta por
-- una función que ya devuelve, en una sola llamada, el token y quién
-- lo pidió — sin depender de ningún embed sujeto a esa política.

-- Sustituye por completo a get_my_pending_invitation_requesters (0047):
-- esa función arreglaba el nombre pero no el problema de fondo, que
-- estaba un paso antes, en la propia consulta de invitaciones.
drop function if exists get_my_pending_invitation_requesters();

create or replace function get_my_pending_invitations()
returns table (
  token uuid,
  created_at timestamptz,
  evaluator_category text,
  requester_member_id uuid,
  requester_full_name text,
  requester_email text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    fi.token,
    fi.created_at,
    fi.evaluator_category,
    fr.requester_member_id,
    m.full_name,
    m.email
  from feedback_invitations fi
  join feedback_requests fr on fr.id = fi.feedback_request_id
  join members m on m.id = fr.requester_member_id
  join members caller on caller.auth_user_id = auth.uid()
  where fi.invitee_member_id = caller.id
    and fi.used_at is null
  order by fi.created_at;
$$;

grant execute on function get_my_pending_invitations() to authenticated;
