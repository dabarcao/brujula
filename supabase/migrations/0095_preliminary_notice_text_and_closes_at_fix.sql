-- Brújula — dos cosas:
--
-- 1) El aviso de "Es preliminar..." del informe 360 (con la fecha límite
--    sugerida) estaba escrito directamente en el código de la página, se
--    pasa a platform_texts como el resto. {fecha} es el único marcador,
--    sustituido por closes_at de la solicitud.
--
-- 2) Corrección puntual de datos: la solicitud "Piloto Usuarios reales"
--    de david.abarca@gmail.com tenía una fecha de cierre ya vencida (o a
--    punto) — se actualiza a un mes desde hoy. Nota aparte, no
--    relacionada con esta migración: closes_at hoy solo es informativa
--    (bloquea editar evaluadores pasada la fecha) y no cierra el ciclo
--    ni bloquea respuestas por sí sola — eso queda para más adelante si
--    hace falta.

insert into platform_texts (key, content) values (
  'cycle_preliminary_notice',
  'Es preliminar: de momento solo ves los datos agregados. Fecha límite sugerida: {fecha}. Los comentarios de texto y la interpretación de tu perfil se desbloquean cuando tú decidas finalizarlo — no antes, y no automáticamente.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();

update feedback_requests fr
set closes_at = (current_date + interval '1 month')::date
from members m
where m.id = fr.requester_member_id
  and m.email = 'david.abarca@gmail.com'
  and fr.name = 'Piloto Usuarios reales'
  and fr.request_type = 'cycle';
