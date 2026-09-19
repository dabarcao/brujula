-- Brújula — /responder/[token] no decía en ningún sitio para quién era el
-- feedback (solo el aviso de anonimato). Añade el nombre del solicitante
-- (a quien va dirigido el feedback -- "requester" en el resto del código,
-- p.ej. src/server/db/responder.ts's getInvitationEmailContext, nunca "a
-- quién se pide", sino "quién pide que le den feedback sobre sí mismo") a
-- get_responder_context, para que la pantalla pueda mostrar "Feedback para
-- {nombre}". Mismo tipo de retorno (jsonb), no hace falta drop function.

create or replace function get_responder_context(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation feedback_invitations;
  invitee members;
  req feedback_requests;
  is_self_flag boolean;
begin
  select * into invitation from feedback_invitations where token = p_token;

  if invitation is null then
    return jsonb_build_object('valid', false);
  end if;

  if invitation.invitee_member_id is not null then
    select * into invitee from members where id = invitation.invitee_member_id;
    if invitee.auth_user_id is distinct from auth.uid() then
      return jsonb_build_object('valid', false, 'requires_login', true);
    end if;
  end if;

  if invitation.used_at is not null then
    return jsonb_build_object('valid', true, 'used', true);
  end if;

  is_self_flag := coalesce(invitation.evaluator_category = 'self', false);

  select * into req from feedback_requests where id = invitation.feedback_request_id;

  return jsonb_build_object(
    'valid', true,
    'used', false,
    'is_self', is_self_flag,
    'requester_full_name', (
      select coalesce(full_name, email) from members where id = req.requester_member_id
    ),
    'questions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', sq.id,
        'prompt', sq.prompt,
        'required', sq.required,
        'question_type', sq.question_type,
        'max_selections', sq.max_selections
      ) order by sq.position), '[]'::jsonb)
      from survey_questions sq
      where sq.template_id = req.template_id
        and sq.active
        and not (is_self_flag and sq.question_type = 'open')
        and not (not is_self_flag and sq.self_only)
    ),
    'scale_levels', (
      select coalesce(jsonb_agg(jsonb_build_object('level', level, 'label', label) order by level), '[]'::jsonb)
      from rating_scale_levels
    ),
    'competencies', (
      select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name) order by name), '[]'::jsonb)
      from competency_frameworks
    )
  );
end;
$$;
