-- Brújula — la pantalla de creación de un ciclo 360 (el supervisor
-- eligiendo a QUÉ EMPLEADOS se les abre su 360) reutilizaba las mismas
-- claves de platform_texts que la pantalla de "pide tu propio 360"
-- (onboarding_360_intro/_seleccion/_confirmacion), que están escritas en
-- segunda persona para quien va a SER evaluado ("vas a pedirle a las
-- personas que te rodean que te cuenten qué impacto tienes en ELLAS").
-- Un supervisor creando un ciclo para otros nunca debería ver ese texto.
-- Se añaden claves propias para esta pantalla; onboarding_360_* se deja
-- intacto para la pantalla individual, que sigue siendo la correcta ahí.

insert into platform_texts (key, content) values (
  'onboarding_cycle_intro',
  'Vas a poner en marcha un proceso de Feedback 360 para las personas que elijas — no para ti. Cada participante recibirá el mismo proceso anónimo y confidencial que ya conoces, y luego organizará a sus propios evaluadores.

Como supervisor, tú decides quién participa y cuándo. Eso te permite dosificar la carga: cada evaluador solo puede dar tanto feedback de calidad al mismo tiempo, y no queremos que responder 360s le reste tiempo al día a día del negocio.

Por eso te recomendamos escalonar los ciclos: evita meter en un mismo ciclo a personas que previsiblemente comparten muchos evaluadores — por ejemplo, no es buena idea lanzar el 360 de todo un equipo a la vez, porque sus propios compañeros de equipo acabarán siendo evaluadores de varios procesos en paralelo.

¿Empezamos?'
)
on conflict (key) do update set content = excluded.content, updated_at = now();

insert into platform_texts (key, content) values (
  'onboarding_cycle_seleccion',
  'Elige a las personas que van a hacer su 360 en este ciclo. Cada una, al organizar a sus propios evaluadores, verá las mismas categorías que ya conoces (jefe, equipo, empresa, otros) — esa elección la hace cada participante, no tú.

Recuerda escalonar: si varias de las personas que eliges comparten muchos compañeros de equipo, esos compañeros en común se van a encontrar respondiendo a varios 360 a la vez.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();

insert into platform_texts (key, content) values (
  'onboarding_cycle_confirmacion',
  'Ciclo creado. Cada participante lo verá reflejado en su panel la próxima vez que inicie sesión, y desde ahí podrá organizar a sus propios evaluadores cuando le venga bien — no se envía ningún email automático todavía.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();
