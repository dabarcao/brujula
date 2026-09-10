-- Brújula — Biblioteca: textos reescritos (más largos y completos) para
-- Plenitud, los 4 roles VACC y las 15 competencias, más un nuevo nodo de
-- "marco general" (Organizaciones Teal, Frederic Laloux) que hasta ahora no
-- existía en ningún sitio del modelo — se guarda como una fila más de
-- competency_principles (misma tabla que ya usa Plenitud para su
-- descripción, migración 0067), con su propio código nuevo
-- 'organizacion_teal' en vez de reutilizar la fila 'self_organizing_team'
-- ya existente (esa nunca se expuso al usuario y su `name` no encaja,
-- "Equipo autoorganizado" en vez de "Organizaciones Teal").

insert into competency_principles (code, name, description, position)
values (
  'organizacion_teal',
  'Organizaciones Teal',
  'Las organizaciones tipo naranja se organizan en torno a la jerarquía y el control para perseguir resultados. Un número creciente de organizaciones — las que Frederic Laloux llama organizaciones Teal — están evolucionando hacia equipos autoorganizados: grupos de personas que deciden y actúan sin depender de que alguien desde arriba les indique qué hacer. Un equipo autoorganizado se sostiene sobre tres características: vive en plenitud, tiene un propósito colectivo y se autogestiona. Para sostener la autogestión hacen falta cuatro roles — Visionario, Arquitecto, Catalizador y Coach —, y estos roles no pertenecen a una persona ni a la organización: pertenecen al equipo. Cada equipo tiene que construir y fortalecer estos cuatro roles entre sus miembros, repartidos como mejor funcione, no asignados de forma fija a un cargo.',
  0
);

update competency_principles
set description = 'Plenitud no es un rol más: es la coherencia interna de la persona, la base sobre la que se apoyan los cuatro roles. No depende de qué tarea toque hacer ni de qué rol se esté ejerciendo en cada momento — está siempre presente, o no, debajo de todo lo demás. Una plenitud alta eleva la capacidad de habitar los cuatro roles; una plenitud baja la merma, aunque las competencias de cada rol estén ahí.'
where code = 'wholeness';

update competency_roles set description = 'Da sentido de dirección. Ve más allá de la tarea inmediata, conecta el trabajo del día a día con un propósito mayor y ayuda a que los demás se alineen por convicción propia, no porque se les imponga.' where code = 'visionario';
update competency_roles set description = 'Diseña la estructura. Piensa cómo se organiza el trabajo — roles, reglas, flujos — teniendo en cuenta para quién o para qué existe ese trabajo, y propone rediseñarlo cuando la forma actual ya no sirve.' where code = 'arquitecto';
update competency_roles set description = 'Mueve a la acción, destraba. Nombra lo incómodo, remueve obstáculos y ayuda a que las decisiones se tomen entre varios en vez de que recaigan siempre en la misma persona.' where code = 'catalizador';
update competency_roles set description = 'Desarrolla a las personas y la relación. Ayuda a otros a encontrar sus propias respuestas en vez de dárselas, comparte su experiencia generosamente y lee cómo está el equipo para ajustar cómo se relaciona con cada persona.' where code = 'coach';

update competency_frameworks set description = 'Piensa más allá de la tarea inmediata: tiene una idea clara de hacia dónde conviene ir a medio plazo, no solo de qué toca hacer hoy. Anticipa cambios o riesgos antes de que se conviertan en un problema urgente, en vez de ir siempre reaccionando.' where code = 'vision_estrategica';
update competency_frameworks set description = 'Entiende cómo su trabajo afecta a otras partes del equipo o la empresa, y actúa teniendo eso en cuenta. Antes de decidir, piensa en cómo esa decisión puede repercutir en otros equipos o procesos, no solo en el suyo.' where code = 'vision_colectiva';
update competency_frameworks set description = 'Sabe explicar el para qué de lo que se hace de una forma que a los demás les hace sentido, no solo porque toca. Conecta las tareas del día a día con un propósito más amplio, y ayuda a que los demás también lo vean.' where code = 'proposito_articulacion';
update competency_frameworks set description = 'Cuando organiza cómo se reparte el trabajo, piensa primero en para quién o para qué es ese trabajo — un cliente, un proyecto, la propia comunidad —, no solo en repartir tareas por costumbre. Propone ajustar cómo trabaja el equipo cuando ve que la forma actual ya no sirve.' where code = 'orientacion_valor';
update competency_frameworks set description = 'Procura minimizar el desperdicio de tiempo, materiales o esfuerzo, y su trabajo diario es coherente con el impacto que la organización dice querer generar. Es consciente del impacto de lo que hace en el ecosistema más amplio — no solo en lo cercano o en su propio equipo — y lo tiene en cuenta al actuar. Señala cuando algo se hace de forma poco eficiente o incoherente con lo que se dice valorar, en vez de mirar para otro lado.' where code = 'ecologia';
update competency_frameworks set description = 'Ante una decisión difícil, actúa con criterio propio en vez de esperar a que otro decida. Toma decisiones aunque no tenga toda la información, y asume las consecuencias en vez de buscar a quién echarle la culpa después.' where code = 'toma_decisiones';
update competency_frameworks set description = 'Hace que las cosas avancen y lleguen a buen puerto, no solo que se intenten. Cuando aparecen obstáculos, busca cómo seguir adelante en vez de quedarse parado esperando a que otro lo resuelva.' where code = 'orientacion_resultados';
update competency_frameworks set description = 'Dice lo que piensa aunque no sea cómodo o vaya contra la corriente. Se atreve a actuar o proponer algo distinto aunque suponga un riesgo personal, en vez de quedarse en su zona de confort.' where code = 'valentia';
update competency_frameworks set description = 'Ayuda a que una decisión se tome consultando a quien sabe o a quien le afecta, en vez de que la tome siempre la misma persona. Cuando el equipo tiene que decidir algo entre varios, ayuda a que realmente se llegue a una decisión, en vez de quedarse atascado en la discusión.' where code = 'sentido_colectivo';
update competency_frameworks set description = 'Ayuda a otros a encontrar sus propias respuestas, en vez de simplemente decirles qué hacer. Muestra curiosidad genuina por el otro y hace preguntas que ayudan a pensar, en vez de saltar directamente a la solución.' where code = 'coaching';
update competency_frameworks set description = 'Comparte su experiencia de forma generosa para que otros crezcan más rápido. Dedica tiempo a ayudar a otros a crecer aunque no forme parte de su rol, sin que se lo tengan que pedir.' where code = 'mentoring';
update competency_frameworks set description = 'Sabe leer cómo están los demás y ajusta cómo se relaciona con cada uno. Comparte información y reconocimiento con el resto del equipo, en vez de guardárselo para quedar mejor él solo.' where code = 'inteligencia_relacional';
update competency_frameworks set description = 'Vive de acuerdo a sus valores: lo que dice y lo que hace son coherentes entre sí, incluso cuando le cuesta o le sale caro hacerlo. Necesita autenticidad para mostrarlos tal como son, y la valentía de sostenerlos cuando resulta incómodo.' where code = 'valores';
update competency_frameworks set description = 'Se muestra tal como es, sin fingir ser alguien distinto según con quién esté. Reconoce abiertamente sus errores o dudas, en vez de aparentar que todo lo tiene controlado.' where code = 'autenticidad';
update competency_frameworks set description = 'Mantiene la calma y responde con cabeza incluso en momentos de tensión. Después de un mal momento, no lo paga con los demás ni deja que le afecte más de la cuenta al resto del día.' where code = 'gestion_emocional';
