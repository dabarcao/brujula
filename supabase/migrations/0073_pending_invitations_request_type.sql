-- Brújula — get_my_pending_invitations no traía request_type, así que
-- "Tareas pendientes" en el panel mostraba "Feedback para Fulano" igual
-- para un 360 y para un ágil — si a la misma persona le tocan los dos a
-- la vez, no había forma de distinguirlos de un vistazo. Se añade
-- request_type para poder pintar "Feedback 360 Fulano" / "Feedback ágil
-- Fulano".

drop function if exists get_my_pending_invitations();

create or replace function get_my_pending_invitations()
returns table (
  token uuid,
  created_at timestamptz,
  evaluator_category text,
  requester_member_id uuid,
  requester_full_name text,
  requester_email text,
  request_type text
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
    m.email,
    fr.request_type
  from feedback_invitations fi
  join feedback_requests fr on fr.id = fi.feedback_request_id
  join members m on m.id = fr.requester_member_id
  join members caller on caller.auth_user_id = auth.uid()
  where fi.invitee_member_id = caller.id
    and fi.used_at is null
  order by fi.created_at;
$$;

grant execute on function get_my_pending_invitations() to authenticated;
