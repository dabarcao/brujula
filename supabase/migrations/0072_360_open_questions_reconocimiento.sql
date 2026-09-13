-- Brújula — nuevo texto para las 3 preguntas abiertas del 360 (posiciones
-- 43-45 de default_360_cycle, sin tocar las de escala ni las de
-- saboteadores). Formato "completa la frase" en vez de pregunta directa,
-- para invitar a un reconocimiento más cercano. La primera sigue siendo
-- una sola pregunta con dos frases de inspiración (no dos preguntas
-- separadas) — una única caja de texto libre.

update survey_questions
set prompt = '¿Quieres proporcionar a tu compañer@ un reconocimiento? Completa la frase: "Lo que veo en ti es..." o "Lo que destaca de ti es..."'
where template_id = (select id from survey_templates where code = 'default_360_cycle')
  and position = 43;

update survey_questions
set prompt = '¿Qué sería un desafío para tu compañer@? Completa la frase: "Mi desafío para ti es..."'
where template_id = (select id from survey_templates where code = 'default_360_cycle')
  and position = 44;

update survey_questions
set prompt = 'Si pudieras dar un pequeño consejo a tu compañero, ¿cuál sería? Completa la frase: "Mi consejo para ti es..."'
where template_id = (select id from survey_templates where code = 'default_360_cycle')
  and position = 45;
