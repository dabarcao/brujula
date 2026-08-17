-- Brújula — el Admin general no pertenece a ninguna empresa (sección 2 de
-- la spec). Si alguna de sus cuentas quedó como Supervisor de una empresa
-- de pruebas (de cuando /signup era público), le quita esa etiqueta para
-- que /admin no lo liste como supervisor de esa empresa.
--
-- No se borra la fila de "members" a propósito: podría tener solicitudes o
-- respuestas de feedback ya enganchadas, y borrarla arrastraría ese
-- historial. Si en algún momento se quiere limpiar del todo, es una
-- decisión aparte, deliberada.

update members
set is_supervisor = false
where lower(email) in (select lower(email) from platform_admins);
