-- Brújula — reordena el cuestionario de default_360_cycle: las preguntas
-- de saboteadores dejan de estar intercaladas entre las de competencias
-- (como quedaron en 0071) y pasan a un bloque propio, después de todas
-- las competencias y antes de las 3 preguntas abiertas. De paso, Presencia
-- gana una tercera pregunta ("democracia profunda": dar espacio a una voz
-- distinta o minoritaria), pasando de 2 a 3 preguntas — no hace falta
-- tocar ningún código de medias/radar/IA para esto, todo promedia con
-- `avg(...) group by competency_code` en SQL, agnóstico al número de
-- preguntas por competencia.
--
-- A diferencia de 0071 (que podía borrar y reinsertar porque se aplicó
-- justo después de un wipe total de datos), aquí ya hay feedback_answers
-- reales apuntando a estas filas — borrarlas rompe
-- feedback_answers_question_id_fkey. Se reordena SOLO con UPDATE de
-- `position` sobre las filas existentes (conservando su id), más un único
-- INSERT para la pregunta de Presencia que sí es nueva de verdad. Mismo
-- patrón de desplazamiento en dos fases que ya usó 0061 para no chocar
-- con unique(template_id, position): primero se sacan todas las
-- posiciones actuales fuera de rango (+1000), luego se fijan una a una
-- las definitivas.

update survey_questions
set position = position + 1000
where template_id = (select id from survey_templates where code = 'default_360_cycle');

-- La pregunta nueva de Presencia se inserta ya aquí, en una posición
-- temporal claramente fuera de rango (9999, nada más la usa nunca) — así
-- su asignación final a la posición 23 (más abajo, después de las 45
-- reubicaciones) es una simple reubicación más entre muchas, exactamente
-- igual que las demás, no un caso especial.
insert into survey_questions
  (template_id, position, prompt, question_type, required, competency_code, applies_to, self_only, saboteador_code)
select
  id, 9999,
  '¿Da espacio a una voz distinta o minoritaria, incluso cuando el equipo no la termina adoptando?',
  'scale', true, 'presencia', 'all', false, null
from survey_templates
where code = 'default_360_cycle';

-- Competencias (1-33): mismo orden de aparición que ya tenían, solo sin
-- los huecos que dejaban las preguntas de saboteadores intercaladas.
update survey_questions set position = 1  where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1001; -- vision_estrategica Q1
update survey_questions set position = 2  where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1002; -- vision_estrategica Q2
update survey_questions set position = 3  where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1004; -- direccion_compartida Q1
update survey_questions set position = 4  where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1005; -- direccion_compartida Q2
update survey_questions set position = 5  where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1007; -- proposito_articulacion Q1
update survey_questions set position = 6  where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1008; -- proposito_articulacion Q2
update survey_questions set position = 7  where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1010; -- orientacion_resultados Q1
update survey_questions set position = 8  where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1011; -- orientacion_resultados Q2
update survey_questions set position = 9  where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1013; -- cultura Q1
update survey_questions set position = 10 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1014; -- cultura Q2
update survey_questions set position = 11 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1016; -- orientacion_valor Q1
update survey_questions set position = 12 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1017; -- orientacion_valor Q2
update survey_questions set position = 13 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1019; -- organizacion_trabajo Q1
update survey_questions set position = 14 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1020; -- organizacion_trabajo Q2
update survey_questions set position = 15 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1022; -- toma_decisiones Q1
update survey_questions set position = 16 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1023; -- toma_decisiones Q2
update survey_questions set position = 17 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1025; -- valentia Q1
update survey_questions set position = 18 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1026; -- valentia Q2
update survey_questions set position = 19 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1028; -- sentido_colectivo Q1
update survey_questions set position = 20 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1029; -- sentido_colectivo Q2
update survey_questions set position = 21 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1031; -- presencia Q1
update survey_questions set position = 22 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1032; -- presencia Q2
update survey_questions set position = 23 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 9999; -- presencia Q3 (nueva, insertada arriba)
update survey_questions set position = 24 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1033; -- coaching Q1
update survey_questions set position = 25 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1034; -- coaching Q2
update survey_questions set position = 26 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1035; -- mentoring Q1
update survey_questions set position = 27 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1036; -- mentoring Q2
update survey_questions set position = 28 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1037; -- inteligencia_relacional Q1
update survey_questions set position = 29 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1038; -- inteligencia_relacional Q2
update survey_questions set position = 30 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1039; -- autenticidad Q1
update survey_questions set position = 31 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1040; -- autenticidad Q2
update survey_questions set position = 32 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1041; -- gestion_emocional Q1
update survey_questions set position = 33 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1042; -- gestion_emocional Q2

-- Saboteadores (34-43): agrupados, cada saboteador con sus 2 preguntas
-- seguidas (antes estaban a 15 posiciones de distancia una de otra, para
-- poder intercalarlas).
update survey_questions set position = 34 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1003; -- controlador Q1
update survey_questions set position = 35 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1018; -- controlador Q2
update survey_questions set position = 36 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1006; -- evitador Q1
update survey_questions set position = 37 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1021; -- evitador Q2
update survey_questions set position = 38 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1009; -- hiperracional Q1
update survey_questions set position = 39 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1024; -- hiperracional Q2
update survey_questions set position = 40 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1012; -- complaciente Q1
update survey_questions set position = 41 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1027; -- complaciente Q2
update survey_questions set position = 42 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1015; -- perfeccionista Q1
update survey_questions set position = 43 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1030; -- perfeccionista Q2

-- Abiertas (44-46): mismo orden, solo desplazadas al final.
update survey_questions set position = 44 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1043; -- reconocimiento
update survey_questions set position = 45 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1044; -- desafío
update survey_questions set position = 46 where template_id = (select id from survey_templates where code = 'default_360_cycle') and position = 1045; -- consejo
