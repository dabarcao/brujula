-- Brújula — modelo de competencias VACC (docs/modelo_roles_vacc.md):
-- sustituye la agrupación plana por principio que tenían las 14
-- competencias originales (marco_competencias_laloux.md) por 4 roles
-- conductuales (Visionario/Arquitecto/Catalizador/Coach), con 3
-- competencias cada uno. Plenitud se queda igual que estaba — 3
-- competencias colgando directamente de su principio, sin rol, porque
-- no vive dentro de ningún rol (es el círculo central del mapa, sección
-- 9, no un sector más). Propósito evolutivo se queda sin ninguna
-- competencia individual colgando — pasa a medirse solo con una futura
-- encuesta de clima de organización, fuera de esta migración —
-- evolutionary_purpose sigue existiendo como principio, simplemente sin
-- competencias por ahora.
--
-- Los roles VACC no pertenecen a la persona sino al equipo
-- autoorganizado (una persona puede ejercer varios roles, o repartirse
-- entre varias personas distintas) — por eso cuelgan del principio
-- self_organizing_team, no son un principio nuevo.
--
-- Son datos de prueba (ningún cliente real usándolos todavía): se
-- sustituye el catálogo entero en vez de migrar celda a celda, igual
-- que ya hizo la migración 0021 con el marco anterior. Las respuestas
-- ya guardadas con los códigos antiguos (vision_proposito, coraje,
-- colaboracion, aprendizaje_curiosidad...) se quedan en la base tal
-- cual — simplemente dejan de aparecer en los informes agregados al no
-- encontrar ya su competencia en el catálogo vigente.

-- ============================================================
-- 1. Roles VACC — nivel nuevo, solo bajo el principio
--    self_organizing_team. Mismo patrón de RLS que competency_frameworks:
--    catálogo de la plataforma, sin datos sensibles, lectura pública
--    para cualquier usuario autenticado.
-- ============================================================
create table competency_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  principle_id uuid references competency_principles(id),
  position integer not null
);

alter table competency_roles enable row level security;

create policy "competency_roles readable by anyone authenticated"
  on competency_roles for select
  using (auth.role() = 'authenticated');

insert into competency_roles (code, name, description, principle_id, position)
select v.code, v.name, v.description, p.id, v.position
from (values
  ('visionario', 'Visionario', 'Da sentido de dirección', 1, 'self_organizing_team'),
  ('arquitecto', 'Arquitecto', 'Diseña la estructura', 2, 'self_organizing_team'),
  ('catalizador', 'Catalizador', 'Mueve a la acción, destraba', 3, 'self_organizing_team'),
  ('coach', 'Coach', 'Desarrolla a las personas y la relación', 4, 'self_organizing_team')
) as v(code, name, description, position, principle_code)
join competency_principles p on p.code = v.principle_code;

-- ============================================================
-- 2. competency_frameworks gana role_id (nulo para Plenitud, que no
--    vive dentro de ningún rol) y se sustituye el catálogo entero:
--    15 competencias (12 VACC + 3 Plenitud) en vez de las 14 antiguas.
-- ============================================================
alter table competency_frameworks add column role_id uuid references competency_roles(id);

-- feedback_answers.competency_code tiene una foreign key real hacia
-- competency_frameworks(code) (a diferencia de lo que se pensaba al
-- escribir esto). El DELETE de más abajo borra TODAS las filas viejas
-- antes de insertar las nuevas — así que incluso un código que
-- sobrevive tal cual (p. ej. toma_decisiones) rompe la FK en el
-- instante del borrado, porque la fila vieja con ese código todavía
-- tiene respuestas apuntándola cuando se borra, aunque medio segundo
-- después se vaya a insertar una fila nueva con el mismo texto. Se
-- desenganchan TODAS las respuestas de prueba (quedan con
-- competency_code en null, el resto de la fila intacto) antes de poder
-- tocar el catálogo — aceptable porque son datos fake, ningún cliente
-- real depende de ellos.
update feedback_answers
set competency_code = null
where competency_code is not null;

delete from competency_frameworks;

insert into competency_frameworks (code, name, description, principle_id, role_id)
select v.code, v.name, v.description, p.id, r.id
from (values
  ('vision_estrategica', 'Visión estratégica', 'Piensa más allá de la tarea inmediata: tiene una idea clara de hacia dónde conviene ir a medio plazo, no solo de qué toca hacer hoy.', 'self_organizing_team', 'visionario'),
  ('vision_colectiva', 'Visión colectiva', 'Entiende cómo su trabajo afecta a otras partes del equipo o la empresa, y actúa teniendo eso en cuenta.', 'self_organizing_team', 'visionario'),
  ('proposito_articulacion', 'Propósito (articulación con sentido)', 'Sabe explicar el para qué de lo que se hace de una forma que a los demás les hace sentido, no solo porque toca.', 'self_organizing_team', 'visionario'),
  ('orientacion_valor', 'Orientación al valor', 'Cuando organiza cómo se reparte el trabajo, piensa primero en para quién o para qué es ese trabajo, no solo en repartir tareas por costumbre.', 'self_organizing_team', 'arquitecto'),
  ('ecologia', 'Ecología', 'Procura minimizar el desperdicio de tiempo, materiales o esfuerzo, y su trabajo diario es coherente con el impacto que la organización dice querer generar.', 'self_organizing_team', 'arquitecto'),
  ('toma_decisiones', 'Toma de decisiones', 'Ante una decisión difícil, actúa con criterio propio en vez de esperar a que otro decida.', 'self_organizing_team', 'arquitecto'),
  ('orientacion_resultados', 'Orientación a resultados', 'Hace que las cosas avancen y lleguen a buen puerto, no solo que se intenten.', 'self_organizing_team', 'catalizador'),
  ('valentia', 'Valentía', 'Dice lo que piensa aunque no sea cómodo o vaya contra la corriente.', 'self_organizing_team', 'catalizador'),
  ('sentido_colectivo', 'Sentido colectivo', 'Ayuda a que una decisión se tome consultando a quien sabe o a quien le afecta, en vez de que la tome siempre la misma persona.', 'self_organizing_team', 'catalizador'),
  ('coaching', 'Coaching', 'Ayuda a otros a encontrar sus propias respuestas, en vez de simplemente decirles qué hacer.', 'self_organizing_team', 'coach'),
  ('mentoring', 'Mentoring', 'Comparte su experiencia de forma generosa para que otros crezcan más rápido.', 'self_organizing_team', 'coach'),
  ('inteligencia_relacional', 'Inteligencia relacional', 'Sabe leer cómo están los demás y ajusta cómo se relaciona con cada uno.', 'self_organizing_team', 'coach'),
  ('valores', 'Valores', 'Lo que dice y lo que hace son coherentes entre sí.', 'wholeness', null),
  ('autenticidad', 'Autenticidad', 'Se muestra tal como es, sin fingir ser alguien distinto según con quién esté.', 'wholeness', null),
  ('gestion_emocional', 'Gestión emocional', 'Mantiene la calma y responde con cabeza incluso en momentos de tensión.', 'wholeness', null)
) as v(code, name, description, principle_code, role_code)
join competency_principles p on p.code = v.principle_code
left join competency_roles r on r.code = v.role_code;

-- ============================================================
-- 3. Plantilla base del 360 — se sustituyen las 28 preguntas de escala
--    antiguas por las 30 nuevas (dos por competencia, 15 competencias).
--    Las 3 abiertas se mantienen, solo se renumeran para ir después
--    (mismo truco que la migración 0021 con las suyas).
--
--    feedback_answers.question_id también es una foreign key real hacia
--    survey_questions(id) — con datos de prueba ya guardados contra las
--    28 preguntas de escala antiguas, borrarlas la viola igual que pasó
--    con competency_code. Se borran directamente esas respuestas
--    (y sus feedback_responses, en cascada) antes de tocar el
--    cuestionario — son datos fake de 360 antiguos, no hace falta
--    conservarlos.
-- ============================================================
delete from feedback_responses
where feedback_request_id in (select id from feedback_requests where request_type = 'cycle');

update survey_questions
set position = position + 10
where template_id = (select id from survey_templates where code = 'default_360_cycle')
  and question_type = 'open';

delete from survey_questions
where template_id = (select id from survey_templates where code = 'default_360_cycle')
  and question_type = 'scale';

insert into survey_questions (template_id, position, prompt, question_type, required, competency_code, applies_to)
select t.id, v.position, v.prompt, 'scale', true, v.competency_code, 'all'
from survey_templates t
cross join (values
  (1, 'Piensa más allá de la tarea inmediata: tiene una idea clara de hacia dónde conviene ir a medio plazo, no solo de qué toca hacer hoy.', 'vision_estrategica'),
  (2, 'Anticipa cambios o riesgos antes de que se conviertan en un problema urgente, en vez de ir siempre reaccionando.', 'vision_estrategica'),
  (3, 'Entiende cómo su trabajo afecta a otras partes del equipo o la empresa, y actúa teniendo eso en cuenta.', 'vision_colectiva'),
  (4, 'Antes de actuar, piensa en cómo su decisión puede afectar a otros equipos o procesos, no solo al suyo.', 'vision_colectiva'),
  (5, 'Sabe explicar el para qué de lo que se hace de una forma que a los demás les hace sentido, no solo porque toca.', 'proposito_articulacion'),
  (6, 'Conecta las tareas del día a día con un propósito más amplio, y ayuda a que los demás también lo vean.', 'proposito_articulacion'),
  (7, 'Cuando organiza cómo se reparte el trabajo, piensa primero en para quién o para qué es ese trabajo, no solo en repartir tareas por costumbre.', 'orientacion_valor'),
  (8, 'Propone o ajusta cómo trabaja el equipo (roles, reglas, flujos) cuando ve que la forma actual ya no sirve, en vez de mantenerla porque siempre se ha hecho así.', 'orientacion_valor'),
  (9, 'Procura minimizar el desperdicio de tiempo, materiales o esfuerzo, y su trabajo diario es coherente con el impacto que la organización dice querer generar.', 'ecologia'),
  (10, 'Señala cuando algo se hace de forma poco eficiente o incoherente con lo que la organización dice valorar, en vez de mirar para otro lado.', 'ecologia'),
  (11, 'Ante una decisión difícil, actúa con criterio propio en vez de esperar a que otro decida.', 'toma_decisiones'),
  (12, 'Toma decisiones aunque no tenga toda la información, y asume las consecuencias en vez de buscar a quién echarle la culpa después.', 'toma_decisiones'),
  (13, 'Hace que las cosas avancen y lleguen a buen puerto, no solo que se intenten.', 'orientacion_resultados'),
  (14, 'Cuando aparecen obstáculos, busca cómo seguir adelante en vez de quedarse parada esperando a que otro lo resuelva.', 'orientacion_resultados'),
  (15, 'Dice lo que piensa aunque no sea cómodo o vaya contra la corriente.', 'valentia'),
  (16, 'Se atreve a actuar o proponer algo distinto aunque suponga un riesgo personal, en vez de quedarse en su zona de confort.', 'valentia'),
  (17, 'Ayuda a que una decisión se tome consultando a quien sabe o a quien le afecta, en vez de que la tome siempre la misma persona.', 'sentido_colectivo'),
  (18, 'Cuando el equipo tiene que decidir algo entre varios, ayuda a que realmente se llegue a una decisión, en vez de quedarse atascado en la discusión o esperando a que otro decida.', 'sentido_colectivo'),
  (19, 'Ayuda a otros a encontrar sus propias respuestas, en vez de simplemente decirles qué hacer.', 'coaching'),
  (20, 'Muestra curiosidad genuina por el otro y hace preguntas que ayudan a pensar, en vez de saltar directamente a la solución.', 'coaching'),
  (21, 'Comparte su experiencia de forma generosa para que otros crezcan más rápido.', 'mentoring'),
  (22, 'Dedica tiempo a ayudar a otros a crecer aunque no forme parte de su rol, sin que se lo tengan que pedir.', 'mentoring'),
  (23, 'Sabe leer cómo están los demás y ajusta cómo se relaciona con cada uno.', 'inteligencia_relacional'),
  (24, 'Comparte información y reconocimiento con el resto del equipo, en vez de guardárselo para quedar mejor él solo.', 'inteligencia_relacional'),
  (25, 'Lo que dice y lo que hace son coherentes entre sí.', 'valores'),
  (26, 'Mantiene sus principios incluso cuando le cuesta o le sale caro hacerlo, no solo cuando es fácil.', 'valores'),
  (27, 'Se muestra tal como es, sin fingir ser alguien distinto según con quién esté.', 'autenticidad'),
  (28, 'Reconoce abiertamente sus errores o dudas, en vez de aparentar que todo lo tiene controlado.', 'autenticidad'),
  (29, 'Mantiene la calma y responde con cabeza incluso en momentos de tensión.', 'gestion_emocional'),
  (30, 'Después de un mal momento, no lo paga con los demás ni deja que le afecte más de la cuenta al resto del día.', 'gestion_emocional')
) as v(position, prompt, competency_code)
where t.code = 'default_360_cycle';
