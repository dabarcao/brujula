-- Brújula — cuarto email del sistema: cuando el Admin de plataforma da
-- de alta una empresa nueva (create_organization_as_admin), hasta ahora
-- solo se mostraba el enlace de invitación en pantalla — el propio
-- Admin tenía que reenviarlo a mano al supervisor real. Se manda por
-- email, mismo mecanismo que el resto (Resend + platform_texts).

insert into platform_texts (key, content) values (
  'org_admin_invite_email_subject',
  'Te han dado de alta en Brújula'
)
on conflict (key) do update set content = excluded.content, updated_at = now();

insert into platform_texts (key, content) values (
  'org_admin_invite_email_body',
  'Te han dado de alta como administrador/a de **{empresa}** en Brújula.

Completa tu alta para empezar a organizar el feedback de tu equipo.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();
