-- Brújula — el texto del email de invitación sonaba seco ("te pide que
-- le des tu feedback... es anónimo... unos minutos"); se cambia por uno
-- más cálido, en la línea del texto "antes de dar tu feedback"
-- (responder_intro) pero mucho más breve, ya que esto es un email, no
-- la pantalla previa al cuestionario.

insert into platform_texts (key, content) values (
  'invitation_email_body',
  '**{nombre}** te pide que le des tu feedback en Brújula — le va a ser muy valioso para seguir creciendo.

Es completamente anónimo: nadie, ni siquiera {nombre}, sabrá qué respondiste. Solo te llevará unos minutos, y cuanto más sincero seas, más le vas a ayudar.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();
