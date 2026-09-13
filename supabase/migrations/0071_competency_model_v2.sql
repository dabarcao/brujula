-- Brújula — Modelo de competencias v2, a partir de
-- ~/Downloads/definicion_dimensiones_2.md (no forma parte del repo).
-- Rompe la simetría del modelo anterior (5 dimensiones × 3 competencias
-- fijas = 15): ahora cada dimensión tiene un número distinto de
-- competencias — Plenitud 2, Visión 4, Arquitecto 4, Catalizador 3,
-- Coach 3 — total 16 competencias, 32 preguntas de escala (2 por
-- competencia, sin excepción).
--
-- Requiere haber ejecutado antes scripts/wipe-all-feedback-data.sql: se
-- borran competencias (valores, vision_colectiva, ecologia) que no
-- pueden tener ningún feedback_answers colgando, y se recrean todas las
-- preguntas de default_360_cycle desde cero.
--
-- Las 10 preguntas de saboteadores NO cambian en esta migración (mismo
-- texto, mismo orden) — solo se recolocan para intercalarse en la nueva
-- base de 32 en vez de 30. Su contenido es un cambio aparte, todavía
-- pendiente, a cargo del usuario.

-- ============================================================
-- 1. Roles VACC — "Visionario" pasa a llamarse "Visión" (mismo code,
-- para no romper GROUP_COLORS/GROUP_LABELS/GROUP_ORDER en el frontend,
-- que siguen indexados por 'visionario'). Los 4 ganan una descripción
-- más completa (el párrafo de apertura de su dimensión en el documento).
-- ============================================================

update competency_roles set
  name = 'Visión',
  description = 'Da sentido de dirección. Conecta el presente con un horizonte de futuro, y hace que ese horizonte tenga sentido propio para cada persona del equipo — construido y compartido con quienes lo van a vivir, no impuesto desde arriba. Se promueve pensar más allá de la tarea inmediata; construir la dirección junto con las personas implicadas, incluyendo cómo van a saber que han llegado; que el propósito de lo que se hace tenga sentido genuino para los demás, no solo para quien lo enuncia; y que las cosas avancen hasta completarse, no solo que se intenten.'
where code = 'visionario';

update competency_roles set
  description = 'Diseña la estructura invisible que permite que el equipo trabaje bien: cómo se reparte el trabajo, qué hábitos y cultura sostienen la coordinación, cómo se toman las decisiones — siempre mirando para qué o para quién existe ese trabajo, no por inercia o costumbre. Se promueve construir hábitos que ayuden al equipo a avanzar, y dejar ir las costumbres que ya no representan cómo quiere ser el equipo; pensar primero para quién o para qué es el trabajo antes de organizarlo, cuidando su impacto en el ecosistema más amplio; repartir con claridad roles, reglas y flujos, y rediseñarlos cuando la forma actual ya no funciona; y decidir con la información disponible, sin esperar a tenerlo todo resuelto — la idea de Laloux de sentir y responder en vez de predecir y controlar.'
where code = 'arquitecto';

update competency_roles set
  description = 'Mueve al equipo a la acción y destraba lo que frena el avance: nombra lo incómodo, remueve obstáculos, y ayuda a que las decisiones se tomen entre varios en vez de recaer siempre en la misma persona. Sostiene la seguridad para que cualquiera pueda cuestionar o retar sin miedo. Se promueve atreverse a tener conversaciones valientes en el equipo, y que cuestionar o equivocarse no dé miedo; que una decisión se tome entre quienes saben o les afecta, construyendo hacia el consenso; y estar presente a lo que el equipo dice y no dice, nombrando la tensión que se evita en vez de dejarla enterrada.'
where code = 'catalizador';

update competency_roles set
  description = 'Desarrolla a las personas y el tejido de relaciones del equipo. Ayuda a que otros encuentren sus propias respuestas en vez de dárselas, comparte su experiencia con generosidad, y lee cómo está cada persona y el equipo para ajustar cómo se relaciona con ellos. Sostiene la seguridad para que cualquiera se sienta incluido y pueda aprender sin miedo. Se promueve ayudar a otros a encontrar sus propias respuestas, con curiosidad genuina y preguntas que ayudan a pensar; compartir experiencia y tiempo para que otros crezcan, sin que lo pidan; y leer cómo están los demás, ajustándose a cada persona y compartiendo información y reconocimiento.'
where code = 'coach';

-- ============================================================
-- 2. Plenitud y Organizaciones Teal (competency_principles) — texto
-- ampliado, sustituye al de las migraciones 0067/0068.
-- ============================================================

update competency_principles set
  description = 'La plenitud es la versión más presente y auténtica de nosotros mismos. En nuestra vida personal solemos mostrar mucho más de nosotros que en los entornos profesionales, pero para poder desarrollar todo nuestro potencial profesional necesitamos conectar más con nuestra esencia — y que el entorno profesional facilite que esa versión se exprese. Es además clave para que los cuatro roles que sostienen a los equipos puedan desarrollarse. ¿Qué es vivir en plenitud? Ser coherente con mis valores, conocerme a mí mismo, ser capaz de mostrarme vulnerable — admitiendo, por ejemplo, que cometo errores o que no sé todas las respuestas. Esto, lejos de hacernos menos, nos conecta más con los demás.'
where code = 'wholeness';

update competency_principles set
  description = 'En la mayoría de las organizaciones actuales la estructura se distribuye de forma jerárquica: una jerarquía con delegación en la que, en la mayoría de las ocasiones, lo que se delega son las acciones a realizar, pero no las decisiones. Esto hace que, a la hora de tomar decisiones, los propios equipos deban escalarlas hacia arriba, provocando cuellos de botella y lentitud. Existe una forma diferente de enfrentarnos a un mundo cada vez más ágil y cambiante: delegar también las decisiones. Para ello es necesario transformar la entidad de equipos delegados a equipos autoorganizados — equipos con poder y autoridad, asegurando que las decisiones que toman están alineadas con la visión estratégica y el propósito de la organización. Un equipo autoorganizado no nace de que alguien "le dé" más poder a sus miembros: nace de que cada persona se vuelve consciente del poder que ya tiene — para decidir, para actuar, para cuestionar, para cuidar de sí misma y del equipo — y que la organización jerárquica normalmente mantiene invisible o inhibido. Brújula no reparte competencias ni autoridad: es un espejo que hace visible dónde ya se está ejerciendo ese poder, con más o menos fuerza, en cada una de las cinco dimensiones. Para que un equipo pueda desarrollar todo su potencial hace falta que cada individuo sea la mejor versión de sí mismo (Plenitud), que el equipo tenga una visión clara hacia dónde va (Visión), que gestione de forma colectiva su energía y la use para avanzar (Catalizador), que desarrolle su cultura y procesos internos (Arquitecto), y que se apoyen unos sobre otros (Coach) — los roles no son de una persona, son del equipo.'
where code = 'organizacion_teal';

-- ============================================================
-- 3. Competencias que desaparecen (ninguna debe tener feedback_answers
-- colgando — requiere haber corrido antes wipe-all-feedback-data.sql).
-- ============================================================

delete from competency_frameworks where code in ('valores', 'vision_colectiva', 'ecologia');

-- ============================================================
-- 4. Competencias que se quedan — texto actualizado. orientacion_resultados
-- además cambia de dimensión: de Catalizador a Visión.
-- ============================================================

update competency_frameworks set description = 'Piensa más allá de la tarea inmediata, con una idea clara de hacia dónde conviene ir a medio y largo plazo.' where code = 'vision_estrategica';
update competency_frameworks set name = 'Propósito (articulación con sentido)', description = 'Hace que el propósito de lo que se hace tenga sentido genuino para los demás, no solo para quien lo enuncia.' where code = 'proposito_articulacion';
update competency_frameworks set description = 'Organiza el trabajo pensando primero en para quién o para qué existe, y es consciente de su impacto en el ecosistema más amplio.' where code = 'orientacion_valor';
update competency_frameworks set description = 'Decide con la información disponible, sin esperar a tenerlo todo resuelto o controlado, y revisa cuando aparece algo nuevo.' where code = 'toma_decisiones';
update competency_frameworks set description = 'Se atreve a tener conversaciones valientes en entornos colectivos, y hace que cuestionar o equivocarse no dé miedo en el equipo.' where code = 'valentia';
update competency_frameworks set description = 'Ayuda a que las decisiones se tomen entre quienes saben o les afecta, y construye hacia el consenso cuando decide el equipo.' where code = 'sentido_colectivo';
update competency_frameworks set description = 'Ayuda a otros a encontrar sus propias respuestas, con curiosidad genuina y preguntas que ayudan a pensar.' where code = 'coaching';
update competency_frameworks set description = 'Comparte su experiencia con generosidad para que otros crezcan más rápido.' where code = 'mentoring';
update competency_frameworks set description = 'Lee cómo están los demás, ajusta cómo se relaciona con cada uno, y comparte información y reconocimiento con el equipo.' where code = 'inteligencia_relacional';
update competency_frameworks set description = 'Vive de acuerdo a lo que piensa y valora, y se muestra tal como es sin fingir ser alguien distinto según con quién esté.' where code = 'autenticidad';
update competency_frameworks set description = 'Sostiene el estrés y la presión sin perder el centro, y responde con calma ante lo inesperado.' where code = 'gestion_emocional';

update competency_frameworks
set
  role_id = (select id from competency_roles where code = 'visionario'),
  description = 'Hace que las cosas avancen hasta completarse, y sigue buscando cómo avanzar cuando aparecen obstáculos.'
where code = 'orientacion_resultados';

-- ============================================================
-- 5. Competencias nuevas.
-- ============================================================

insert into competency_frameworks (code, name, description, principle_id, role_id)
select v.code, v.name, v.description, p.id, r.id
from (values
  ('direccion_compartida', 'Dirección compartida', 'Construye el rumbo junto con las personas implicadas, incluyendo cómo se sabrá que se ha llegado.', 'visionario'),
  ('cultura', 'Cultura', 'Promueve los hábitos que ayudan al equipo a construir y avanzar, y ayuda a que las costumbres o formas de trabajar cambien cuando ya no reflejan cómo quiere ser el equipo.', 'arquitecto'),
  ('organizacion_trabajo', 'Organización del trabajo', 'Reparte con claridad roles, reglas y flujos, y los rediseña cuando ya no sirven.', 'arquitecto'),
  ('presencia', 'Presencia', 'Está atento a lo que ocurre en el equipo en el momento presente — lo que se dice y lo que no se dice — y lo nombra en voz alta en vez de dejarlo pasar.', 'catalizador')
) as v(code, name, description, role_code)
join competency_principles p on p.code = 'self_organizing_team'
join competency_roles r on r.code = v.role_code;

-- ============================================================
-- 6. Recrea desde cero las preguntas de default_360_cycle: 32 de escala
-- (16 competencias × 2) intercaladas con las 10 de saboteadores (mismo
-- texto, mismo orden que ya había) y las 3 abiertas al final. Se borra
-- todo el contenido anterior de esta plantilla y se inserta ya
-- reordenado, en vez de desplazar posiciones una a una (mucho más
-- simple con un cambio de esta magnitud).
-- ============================================================

delete from survey_questions
where template_id = (select id from survey_templates where code = 'default_360_cycle');

with tmpl as (
  select id from survey_templates where code = 'default_360_cycle'
),
rows as (
  select * from (values
    (1, 'scale', '¿Conecta las acciones del día a día con la visión a medio y largo plazo?'::text, 'vision_estrategica'::text, null::text),
    (2, 'scale', '¿Comparte la visión a medio y largo plazo y se anticipa al impacto en el equipo?', 'vision_estrategica', null),
    (3, 'scale', 'Necesito sentir que tengo el control de la situación y me cuesta delegar o soltar.', null, 'controlador'),
    (4, 'scale', '¿Antes de proponer un objetivo o un rumbo, lo construye junto con las personas implicadas?', 'direccion_compartida', null),
    (5, 'scale', '¿Ayuda a que el equipo acuerde entre todos cómo van a saber que han logrado un objetivo?', 'direccion_compartida', null),
    (6, 'scale', 'Evito afrontar los conflictos, y a veces eso hace que se agraven.', null, 'evitador'),
    (7, 'scale', '¿Promueve y comparte el propósito de lo que hace, de forma que tiene sentido para los demás?', 'proposito_articulacion', null),
    (8, 'scale', '¿Hace que los demás se sientan parte del propósito que se comparte?', 'proposito_articulacion', null),
    (9, 'scale', 'Confío más en el análisis racional que en la intuición o las emociones a la hora de decidir.', null, 'hiperracional'),
    (10, 'scale', '¿Hace que las cosas avancen hasta completarse?', 'orientacion_resultados', null),
    (11, 'scale', '¿Cuando aparecen obstáculos, busca cómo seguir adelante?', 'orientacion_resultados', null),
    (12, 'scale', 'Me cuesta decir que no y termino anteponiendo las necesidades de los demás a las mías.', null, 'complaciente'),
    (13, 'scale', '¿Promueve hábitos en el equipo para construir y avanzar como equipo?', 'cultura', null),
    (14, 'scale', '¿Ayuda a que las costumbres o formas de trabajo del equipo cambien cuando ya no reflejan cómo quiere ser el equipo?', 'cultura', null),
    (15, 'scale', 'Soy muy exigente conmigo mismo y me cuesta aceptar el error, mío o ajeno.', null, 'perfeccionista'),
    (16, 'scale', '¿Antes de organizar el trabajo, piensa primero para quién o para qué existe ese trabajo?', 'orientacion_valor', null),
    (17, 'scale', '¿Tiene en cuenta el impacto de su trabajo en el ecosistema más amplio, no solo en lo más cercano?', 'orientacion_valor', null),
    (18, 'scale', 'Puedo ser confrontativo y enérgico cuando necesito que las cosas se hagan.', null, 'controlador'),
    (19, 'scale', '¿Ayuda a que los roles, las reglas o los flujos de trabajo del equipo estén repartidos con claridad?', 'organizacion_trabajo', null),
    (20, 'scale', '¿Propone rediseñar cómo trabaja el equipo cuando la forma actual ya no sirve?', 'organizacion_trabajo', null),
    (21, 'scale', 'Procrastino al tratar tareas importantes pero desagradables.', null, 'evitador'),
    (22, 'scale', '¿Toma decisiones con la información disponible, sin esperar a tenerlo todo resuelto o controlado?', 'toma_decisiones', null),
    (23, 'scale', '¿Revisa y ajusta una decisión en cuanto aparece información nueva, sin aferrarse al plan inicial?', 'toma_decisiones', null),
    (24, 'scale', 'Puedo ser percibido como frío y demasiado racional.', null, 'hiperracional'),
    (25, 'scale', 'En entornos colectivos, ¿se atreve a tener conversaciones valientes?', 'valentia', null),
    (26, 'scale', '¿Hace que en el equipo se pueda cuestionar algo, o equivocarse, sin miedo a las consecuencias?', 'valentia', null),
    (27, 'scale', 'Complazco, rescato o adulo más que otros.', null, 'complaciente'),
    (28, 'scale', '¿Ayuda a que una decisión se tome consultando a quien sabe o a quien le afecta?', 'sentido_colectivo', null),
    (29, 'scale', 'Cuando el equipo tiene que decidir algo entre varios, ¿construye para que se llegue a una decisión consensuada?', 'sentido_colectivo', null),
    (30, 'scale', 'Me gusta que las cosas estén muy ordenadas y organizadas.', null, 'perfeccionista'),
    (31, 'scale', '¿Nombra las tensiones que el equipo está evitando en vez de dejarlas pasar?', 'presencia', null),
    (32, 'scale', '¿Ayuda a que un conflicto mueva al equipo hacia adelante en vez de quedar enterrado?', 'presencia', null),
    (33, 'scale', '¿Ayuda a otros a encontrar sus propias respuestas?', 'coaching', null),
    (34, 'scale', '¿Muestra curiosidad genuina por el otro y hace preguntas que ayudan a pensar?', 'coaching', null),
    (35, 'scale', '¿Comparte su experiencia de forma generosa para que otros crezcan más rápido?', 'mentoring', null),
    (36, 'scale', '¿Dedica tiempo a ayudar a otros a crecer, sin que se lo tengan que pedir?', 'mentoring', null),
    (37, 'scale', '¿Sabe leer cómo están los demás y ajusta cómo se relaciona con cada uno?', 'inteligencia_relacional', null),
    (38, 'scale', '¿Comparte información y reconocimiento con el resto del equipo?', 'inteligencia_relacional', null),
    (39, 'scale', '¿Actúa de forma coherente con lo que piensa y valora, incluso cuando le resulta incómodo o costoso?', 'autenticidad', null),
    (40, 'scale', '¿Se muestra tal como es y reconoce abiertamente sus errores o dudas?', 'autenticidad', null),
    (41, 'scale', '¿Gestiona bien las situaciones de estrés o de presión?', 'gestion_emocional', null),
    (42, 'scale', '¿Ante una crítica inesperada, un contratiempo o una discusión, responde con calma?', 'gestion_emocional', null),
    (43, 'open', '¿Qué es lo que destaca de esta persona y cómo le sugerirías que lo utilizara más?', null, null),
    (44, 'open', '¿Qué reto tiene esta persona en el desarrollo de su liderazgo?', null, null),
    (45, 'open', '¿Qué feedback adicional quieres proporcionar a esta persona para ayudarle más a desarrollar su potencial?', null, null)
  ) as t(position, question_type, prompt, competency_code, saboteador_code)
)
insert into survey_questions
  (template_id, position, prompt, question_type, required, competency_code, applies_to, self_only, saboteador_code)
select
  tmpl.id,
  rows.position,
  rows.prompt,
  rows.question_type,
  true,
  rows.competency_code,
  'all',
  rows.saboteador_code is not null,
  rows.saboteador_code
from rows, tmpl
order by rows.position;
