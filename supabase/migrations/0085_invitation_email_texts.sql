-- Brújula — texto del email de invitación a dar feedback (mismo mecanismo
-- que el resto de textos editables, platform_texts) en vez de vivir
-- escrito en src/lib/invitationEmails.ts — así se puede cambiar sin
-- desplegar, igual que el wizard y la Biblioteca.
--
-- {nombre} es el único marcador que se sustituye (por el nombre de quien
-- pidió el feedback) — hay que conservarlo tal cual si se edita el texto.
-- El cuerpo admite **negrita** como el resto de textos editables; los
-- párrafos se separan con una línea en blanco.

insert into platform_texts (key, content) values (
  'invitation_email_subject',
  '{nombre} te pide tu feedback'
)
on conflict (key) do update set content = excluded.content, updated_at = now();

insert into platform_texts (key, content) values (
  'invitation_email_body',
  '**{nombre}** te pide que le des tu feedback en Brújula.

Es completamente anónimo — nadie sabrá qué respondiste, ni siquiera {nombre}. Te llevará solo unos minutos.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();
