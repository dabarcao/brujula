-- Brújula — get_my_pending_invitations (migración 0073) distinguía 360 de
-- ágil, pero el ágil en sí tiene varios subtipos reales (feedback.subtype:
-- 'competencias' es el único construido hoy; 'general', 'meeting',
-- 'collaboration', 'leadership_initiative' son legado ya retirado de la
-- pantalla de creación) — "ágil" a secas era una etiqueta inventada, no
-- algo sacado de ningún dato. Se añade subtype para que el panel muestre
-- la etiqueta real en vez de adivinarla.

drop function if exists get_my_pending_invitations();

create or replace function get_my_pending_invitations()
returns table (
  token uuid,
  created_at timestamptz,
  evaluator_category text,
  requester_member_id uuid,
  requester_full_name text,
  requester_email text,
  request_type text,
  subtype text
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
    fr.request_type,
    fr.subtype
  from feedback_invitations fi
  join feedback_requests fr on fr.id = fi.feedback_request_id
  join members m on m.id = fr.requester_member_id
  join members caller on caller.auth_user_id = auth.uid()
  where fi.invitee_member_id = caller.id
    and fi.used_at is null
  order by fi.created_at;
$$;

grant execute on function get_my_pending_invitations() to authenticated;
