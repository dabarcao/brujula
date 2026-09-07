-- Brújula — alguien invitado solo por email (cuenta individual, sección
-- 4.2) no tiene cuenta en la plataforma: el token de la invitación es su
-- única credencial, sin pedirle iniciar sesión (decisión explícita: se
-- prioriza cero fricción sobre verificar que ese email es realmente
-- suyo). Para una invitación normal (invitee_member_id no nulo, empresa o
-- cuenta individual invitando a alguien ya registrado) se sigue exigiendo
-- sesión y que sea esa misma persona, exactamente igual que hasta ahora.
--
-- get_responder_context reemplaza las lecturas directas que hacía
-- /responder/[token] (feedback_invitations, survey_questions,
-- rating_scale_levels, competency_frameworks) — todas esas tablas exigen
-- auth.role() = 'authenticated' por RLS, lo que bloquearía a un visitante
-- anónimo. Es security definer: se le da solo lo mínimo para renderizar
-- el formulario, nunca contenido de otras respuestas.

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
        and not (is_self_flag and sq.question_type = 'open')
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

grant execute on function get_responder_context(uuid) to anon, authenticated;

-- submit_feedback_response ya trata correctamente el caso
-- invitee_member_id nulo (no comprueba propietario, el token basta) — solo
-- faltaba poder llamarla sin sesión iniciada.
grant execute on function submit_feedback_response(uuid, jsonb) to anon;
