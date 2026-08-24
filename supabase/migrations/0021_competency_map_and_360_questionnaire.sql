-- Brújula — estructura real de competencias (Principio → Competencia) a
-- partir del documento "Mapa Competencias" (docs/spec.md v0.5, sección 7),
-- y reconstrucción de la plantilla base del ciclo 360 con las preguntas de
-- escala derivadas de él (dos por competencia, texto tal cual el
-- documento de origen). Sustituye el marco de 9 competencias antiguo
-- (basado en el cuestionario original de Zetes, migración 0006).

-- ============================================================
-- 1. Principios (nivel más alto, interno — no se expone al usuario)
-- ============================================================
create table competency_principles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  position integer not null
);

insert into competency_principles (code, name, position) values
  ('evolutionary_purpose', 'Propósito evolutivo', 1),
  ('self_organizing_team', 'Equipo autoorganizado', 2),
  ('wholeness', 'Plenitud', 3);

-- ============================================================
-- 2. Competencias — cuelgan de un principio. Se retira la distinción
--    manager_only (ya eliminada del resto del sistema, ver 0020).
-- ============================================================
alter table competency_frameworks add column principle_id uuid references competency_principles(id);
alter table competency_frameworks drop column applies_to;

delete from competency_frameworks;

insert into competency_frameworks (code, name, description, principle_id)
select v.code, v.name, v.description, p.id
from (values
  ('vision_proposito', 'Visión y propósito', 'Tiene claro para qué existe su trabajo, más allá de la tarea concreta que hace cada día.', 'evolutionary_purpose'),
  ('toma_decisiones', 'Toma de decisiones', 'Ante una decisión difícil, actúa con criterio propio en vez de esperar a que otro decida.', 'evolutionary_purpose'),
  ('orientacion_resultados', 'Orientación a resultados', 'Hace que las cosas avancen y lleguen a buen puerto, no solo que se intenten.', 'evolutionary_purpose'),
  ('vision_sistemica', 'Visión sistémica', 'Entiende cómo su trabajo afecta a otras partes del equipo o la empresa, y actúa teniendo eso en cuenta.', 'evolutionary_purpose'),
  ('ecologia', 'Ecología', 'Procura minimizar el desperdicio de tiempo, materiales o esfuerzo, y su trabajo diario es coherente con el impacto que la organización dice querer generar.', 'evolutionary_purpose'),
  ('aprendizaje_curiosidad', 'Aprendizaje / curiosidad', 'Muestra curiosidad genuina y está dispuesta a cambiar de opinión cuando aparece información nueva.', 'evolutionary_purpose'),
  ('coaching', 'Coaching', 'Ayuda a otros a encontrar sus propias respuestas, en vez de simplemente decirles qué hacer.', 'self_organizing_team'),
  ('mentoring', 'Mentoring', 'Comparte su experiencia de forma generosa para que otros crezcan más rápido.', 'self_organizing_team'),
  ('colaboracion', 'Colaboración', 'Suma cuando trabaja con otros y antepone el resultado compartido a quedar bien individualmente.', 'self_organizing_team'),
  ('inteligencia_interpersonal', 'Inteligencia interpersonal', 'Sabe leer cómo están los demás y ajusta cómo se relaciona con cada uno.', 'self_organizing_team'),
  ('valores', 'Valores', 'Lo que dice y lo que hace son coherentes entre sí.', 'wholeness'),
  ('autenticidad', 'Autenticidad', 'Se muestra tal como es, sin fingir ser alguien distinto según con quién esté.', 'wholeness'),
  ('coraje', 'Coraje', 'Dice lo que piensa aunque no sea cómodo o vaya contra la corriente.', 'wholeness'),
  ('gestion_emocional', 'Gestión emocional', 'Mantiene la calma y responde con cabeza incluso en momentos de tensión.', 'wholeness')
) as v(code, name, description, principle_code)
join competency_principles p on p.code = v.principle_code;

-- ============================================================
-- 3. Plantilla base del 360 — se sustituyen las 21 preguntas de escala
--    antiguas por las 28 nuevas (dos por competencia). Las 3 abiertas se
--    mantienen, solo se renumeran para ir después. No toca ciclos ya
--    creados (cada uno tiene su propia copia de plantilla, sección 5.2).
-- ============================================================

-- Mueve las abiertas fuera del rango 1-28 antes de tocar las de escala,
-- para no chocar con el índice único (template_id, position).
update survey_questions
set position = position + 7
where template_id = (select id from survey_templates where code = 'default_360_cycle')
  and question_type = 'open';

delete from survey_questions
where template_id = (select id from survey_templates where code = 'default_360_cycle')
  and question_type = 'scale';

insert into survey_questions (template_id, position, prompt, question_type, required, competency_code, applies_to)
select t.id, v.position, v.prompt, 'scale', true, v.competency_code, 'all'
from survey_templates t
cross join (values
  (1, 'Tiene claro para qué existe su trabajo, más allá de la tarea concreta que hace cada día.', 'vision_proposito'),
  (2, 'Cuando cambian las prioridades, no pierde de vista para qué se está haciendo el trabajo, y ayuda a que los demás tampoco lo pierdan.', 'vision_proposito'),
  (3, 'Ante una decisión difícil, actúa con criterio propio en vez de esperar a que otro decida.', 'toma_decisiones'),
  (4, 'Toma decisiones aunque no tenga toda la información, y asume las consecuencias en vez de buscar a quién echarle la culpa después.', 'toma_decisiones'),
  (5, 'Hace que las cosas avancen y lleguen a buen puerto, no solo que se intenten.', 'orientacion_resultados'),
  (6, 'Cuando aparecen obstáculos, busca cómo seguir adelante en vez de quedarse parada esperando a que otro lo resuelva.', 'orientacion_resultados'),
  (7, 'Entiende cómo su trabajo afecta a otras partes del equipo o la empresa, y actúa teniendo eso en cuenta.', 'vision_sistemica'),
  (8, 'Antes de actuar, piensa en cómo su decisión puede afectar a otros equipos o procesos, no solo al suyo.', 'vision_sistemica'),
  (9, 'Procura minimizar el desperdicio de tiempo, materiales o esfuerzo, y su trabajo diario es coherente con el impacto que la organización dice querer generar.', 'ecologia'),
  (10, 'Señala cuando algo se hace de forma poco eficiente o incoherente con lo que la organización dice valorar, en vez de mirar para otro lado.', 'ecologia'),
  (11, 'Muestra curiosidad genuina y está dispuesta a cambiar de opinión cuando aparece información nueva.', 'aprendizaje_curiosidad'),
  (12, 'Pregunta y busca aprender de forma activa, incluso sobre temas que no domina, en vez de aparentar que ya lo sabe todo.', 'aprendizaje_curiosidad'),
  (13, 'Ayuda a otros a encontrar sus propias respuestas, en vez de simplemente decirles qué hacer.', 'coaching'),
  (14, 'Cuando alguien le plantea un problema, hace preguntas que ayudan a pensar, en vez de saltar directamente a la solución.', 'coaching'),
  (15, 'Comparte su experiencia de forma generosa para que otros crezcan más rápido.', 'mentoring'),
  (16, 'Dedica tiempo a ayudar a otros a crecer aunque no forme parte de su rol, sin que se lo tengan que pedir.', 'mentoring'),
  (17, 'Suma cuando trabaja con otros y antepone el resultado compartido a quedar bien individualmente.', 'colaboracion'),
  (18, 'Comparte información y reconocimiento con el resto del equipo, en vez de guardárselo para quedar mejor él solo.', 'colaboracion'),
  (19, 'Sabe leer cómo están los demás y ajusta cómo se relaciona con cada uno.', 'inteligencia_interpersonal'),
  (20, 'Sabe adaptar cómo se comunica según la persona que tiene delante, sin perder autenticidad.', 'inteligencia_interpersonal'),
  (21, 'Lo que dice y lo que hace son coherentes entre sí.', 'valores'),
  (22, 'Mantiene sus principios incluso cuando le cuesta o le sale caro hacerlo, no solo cuando es fácil.', 'valores'),
  (23, 'Se muestra tal como es, sin fingir ser alguien distinto según con quién esté.', 'autenticidad'),
  (24, 'Reconoce abiertamente sus errores o dudas, en vez de aparentar que todo lo tiene controlado.', 'autenticidad'),
  (25, 'Dice lo que piensa aunque no sea cómodo o vaya contra la corriente.', 'coraje'),
  (26, 'Se atreve a actuar o proponer algo distinto aunque suponga un riesgo personal, en vez de quedarse en su zona de confort.', 'coraje'),
  (27, 'Mantiene la calma y responde con cabeza incluso en momentos de tensión.', 'gestion_emocional'),
  (28, 'Después de un mal momento, no lo paga con los demás ni deja que le afecte más de la cuenta al resto del día.', 'gestion_emocional')
) as v(position, prompt, competency_code)
where t.code = 'default_360_cycle';
