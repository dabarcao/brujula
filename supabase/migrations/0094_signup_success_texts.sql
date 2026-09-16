-- Brújula — el mensaje tras registrarse decía "te hemos enviado un
-- correo para confirmar tu cuenta", pero mientras estamos en pruebas no
-- se manda ningún email de confirmación (la cuenta queda ya confirmada,
-- se puede entrar directamente) — el texto mentía sobre algo que nunca
-- pasaba. Se cambia a avisar que ya puede iniciar sesión, y se deja en
-- platform_texts para poder volver a la versión "te hemos enviado un
-- email" el día que se active la confirmación real, sin tocar código.

insert into platform_texts (key, content) values (
  'signup_success_invite',
  'Ya puedes iniciar sesión con tu email y tu contraseña para completar tu alta.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();

insert into platform_texts (key, content) values (
  'signup_success_individual',
  'Ya puedes iniciar sesión con tu email y tu contraseña para empezar.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();
