-- Brújula — feedback_invitations solo tenía política de SELECT para "el
-- propio invitado ve su invitación" (0005). Nunca se añadió una para que
-- el SOLICITANTE vea la lista de a quién invitó él mismo — por eso la
-- página de gestionar una solicitud (currentInviteeIds) siempre le
-- devolvía vacío aunque las invitaciones sí existieran: RLS las filtraba
-- en silencio. No compromete el anonimato (sección 6): lo protegido es
-- quién RESPONDIÓ (feedback_responses no tiene columna de autor), no a
-- quién se invitó — eso ya lo decidió el propio solicitante.

create policy "feedback_invitations visible to requester"
  on feedback_invitations for select
  using (
    feedback_request_id in (
      select fr.id
      from feedback_requests fr
      join members m on m.id = fr.requester_member_id
      where m.auth_user_id = auth.uid()
    )
  );
