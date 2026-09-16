-- Brújula — texto "antes de dar tu feedback", pantalla previa al
-- cuestionario en /responder/[token] para quien va a evaluar a otra
-- persona (nunca para la propia autoevaluación, ese texto no encaja ahí).
-- Aprobado hace unos días en conversación, pero nunca se llegó a
-- conectar al código — se queda aquí en platform_texts, mismo mecanismo
-- que el resto de textos editables.

insert into platform_texts (key, content) values (
  'responder_intro',
  '**Antes de dar tu feedback**

Alguien te ha elegido, entre las personas que le rodean, para contarle algo que no siempre es fácil de decir en el día a día: qué impacto tiene en ti y en el equipo.

**Tu respuesta es completamente anónima.** Nadie —ni la empresa, ni la persona que te lo pidió— va a saber qué contestaste. Es justamente esa libertad la que te permite responder con honestidad, no con cautela.

Busca un momento tranquilo antes de responder, sin prisa. Piensa en lo que de verdad has visto, no en lo que crees que "toca" decir ni en cómo se lo va a tomar. No le des demasiadas vueltas a cada pregunta — la respuesta genuina suele ser la primera que te viene, no la más elaborada. Tu feedback vale por lo concreto y sincero que sea, no por lo amable que suene.

Antes de escribir, vale la pena preguntarte: ¿qué le diría si supiera que esto le va a ayudar a crecer? Esa es la respuesta que de verdad importa.'
)
on conflict (key) do update set content = excluded.content, updated_at = now();
