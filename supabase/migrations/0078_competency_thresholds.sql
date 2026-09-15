-- Brújula — "umbrales" de competencia: qué indica un valor alto o bajo en
-- cada una de las 16 competencias, derivado de sus dos (o tres, Presencia)
-- preguntas de escala, con foco en el efecto de ejemplaridad sobre el
-- equipo. Se guarda como dos columnas nuevas en vez de meterlo dentro de
-- `description` porque son datos de naturaleza distinta (una definición
-- fija vs. una interpretación por extremo de la escala) que la Biblioteca
-- necesita poder mostrar por separado, y que el prompt de interpretación
-- por IA (aiInterpretation.ts) referencia como bloque propio.
--
-- De paso, se actualiza `description` con la redacción revisada del mismo
-- documento de origen (docs/... no versionado, aportado por el usuario).

alter table competency_frameworks add column threshold_high text;
alter table competency_frameworks add column threshold_low text;

-- Plenitud
update competency_frameworks set
  description = 'Vive de acuerdo a lo que piensa y valora, y se muestra tal como es sin fingir ser alguien distinto según con quién esté.',
  threshold_high = 'Sostiene lo que piensa y valora incluso cuando eso le supone un coste — de relación, de reputación, de comodidad — y con ese ejemplo invita a que el equipo también se muestre tal como es.',
  threshold_low = 'Esa coherencia varía según la situación o el coste de sostenerla en ese momento — y por el mismo efecto de ejemplaridad, el equipo tiende a mostrarse con esa misma medida de apertura.'
where code = 'autenticidad';

update competency_frameworks set
  description = 'Sostiene el estrés y la presión sin perder el centro, y responde con calma ante lo inesperado.',
  threshold_high = 'Sostiene un estado de calma incluso en momentos de tensión o ante lo inesperado, y esa estabilidad se transmite al equipo como un punto de apoyo.',
  threshold_low = 'Sostener esa calma le cuesta más en esos mismos momentos — y el equipo, por el mismo efecto, también vive esos momentos con mayor tensión.'
where code = 'gestion_emocional';

-- Visión
update competency_frameworks set
  description = 'Piensa más allá de la tarea inmediata, con una idea clara de hacia dónde conviene ir a medio y largo plazo.',
  threshold_high = 'Conecta el trabajo del día a día con un rumbo de medio y largo plazo, y lo comparte anticipando su impacto — dando al equipo esa misma perspectiva amplia.',
  threshold_low = 'El foco está más anclado en la tarea inmediata, sin conectarla de forma visible con un horizonte más amplio — y el equipo dispone de menos esa perspectiva compartida.'
where code = 'vision_estrategica';

update competency_frameworks set
  description = 'Construye el rumbo junto con las personas implicadas, incluyendo cómo se sabrá que se ha llegado.',
  threshold_high = 'Construye el rumbo junto con quienes lo van a vivir, y eso invita al equipo a implicarse en dar forma a los objetivos, no solo en ejecutarlos.',
  threshold_low = 'El rumbo tiende a llegar ya definido, sin ese proceso compartido — y el equipo tiene menos espacio para implicarse antes de perseguir el objetivo.'
where code = 'direccion_compartida';

update competency_frameworks set
  description = 'Hace que el propósito de lo que se hace tenga sentido genuino para los demás, no solo para quien lo enuncia.',
  threshold_high = 'Comparte el propósito de una forma que cala en los demás, y logra que se sientan parte de él — el equipo trabaja conectado con un sentido propio, no solo con una tarea.',
  threshold_low = 'El propósito se queda más como algo propio, sin transmitirse de forma que tenga sentido para otros — y el equipo, con menos de ese sentido compartido, vive el trabajo más como tarea.'
where code = 'proposito_articulacion';

update competency_frameworks set
  description = 'Hace que las cosas avancen hasta completarse, y sigue buscando cómo avanzar cuando aparecen obstáculos.',
  threshold_high = 'Sostiene el avance hasta completar lo que se propone, y ante un obstáculo sigue buscando cómo seguir — un empuje que el equipo también nota y que le ayuda a no quedarse atascado.',
  threshold_low = 'Sostener ese avance hasta el final, o encontrar salida ante un obstáculo, le cuesta más — y el equipo, con menos de ese empuje modelado, tiene más probabilidad de quedarse parado en el mismo punto.'
where code = 'orientacion_resultados';

-- Arquitecto
update competency_frameworks set
  description = 'Promueve los hábitos que ayudan al equipo a construir y avanzar, y ayuda a que las costumbres cambien cuando ya no reflejan cómo quiere ser el equipo.',
  threshold_high = 'Promueve hábitos que ayudan al equipo a construir, y ayuda a soltar las costumbres que ya no lo representan — dejando ver que la forma de trabajar se puede revisar.',
  threshold_low = 'Participa menos en dar forma a esos hábitos o en soltar costumbres que ya no sirven — y el equipo, sin ese ejemplo, tiende a sostener sus formas de trabajar tal como están.'
where code = 'cultura';

update competency_frameworks set
  description = 'Organiza el trabajo pensando primero en para quién o para qué existe, y es consciente de su impacto en el ecosistema más amplio.',
  threshold_high = 'Organiza el trabajo teniendo claro para quién o para qué existe, mirando más allá de lo inmediato — una mirada que ayuda a que el equipo también organice el suyo con ese mismo para qué presente.',
  threshold_low = 'Organiza el trabajo más desde la tarea en sí, con la mirada puesta en lo más cercano — y el equipo, sin ese para qué modelado, tiende también a organizarse desde la tarea.'
where code = 'orientacion_valor';

update competency_frameworks set
  description = 'Reparte con claridad roles, reglas y flujos, y los rediseña cuando ya no sirven.',
  threshold_high = 'Ayuda a que roles, reglas y flujos queden claros, y propone rediseñarlos cuando ya no funcionan — dando al equipo un marco claro y a la vez abierto a revisión.',
  threshold_low = 'Participa menos en aclarar cómo se reparte el trabajo o en proponer cambios cuando ya no sirve — y el equipo tiene más probabilidad de convivir con roles o flujos ambiguos durante más tiempo.'
where code = 'organizacion_trabajo';

update competency_frameworks set
  description = 'Decide con la información disponible, sin esperar a tenerlo todo resuelto o controlado, y revisa cuando aparece algo nuevo.',
  threshold_high = 'Decide con lo que tiene disponible, sin necesitar tenerlo todo cerrado, y ajusta en cuanto aparece algo nuevo — un ritmo que ayuda a que el equipo también avance sin esperar certeza total.',
  threshold_low = 'Tiende a esperar a tener más resuelto antes de decidir, o a sostener el plan inicial aun con información nueva — y el equipo, con ese ritmo modelado, tiende también a esperar más antes de avanzar.'
where code = 'toma_decisiones';

-- Catalizador
update competency_frameworks set
  description = 'Se atreve a tener conversaciones valientes en entornos colectivos, y hace que cuestionar o equivocarse no dé miedo en el equipo.',
  threshold_high = 'Se atreve a poner sobre la mesa lo que hace falta decir, aunque sea incómodo, y con ese ejemplo hace que en el equipo cuestionar o equivocarse deje de dar miedo.',
  threshold_low = 'Sostener esas conversaciones incómodas en el momento le cuesta más — y el equipo, sin ese ejemplo, tiende también a evitar cuestionar o a temer más el equivocarse.'
where code = 'valentia';

update competency_frameworks set
  description = 'Ayuda a que las decisiones se tomen entre quienes saben o les afecta, y construye hacia el consenso cuando decide el equipo.',
  threshold_high = 'Ayuda a que una decisión pase por quien sabe o le afecta antes de cerrarse, y construye hacia el consenso — dando a cada persona un lugar real en cómo se decide.',
  threshold_low = 'Participa menos en llevar la decisión hacia quien sabe o le afecta, o en construir hacia un acuerdo compartido — y el equipo tiende también a decidir con menos personas implicadas.'
where code = 'sentido_colectivo';

update competency_frameworks set
  description = 'Está atento a lo que ocurre en el equipo en el momento presente — lo que se dice y lo que no se dice —, lo nombra en voz alta en vez de dejarlo pasar, y da espacio a las voces que no siguen a la mayoría.',
  threshold_high = 'Nombra en voz alta la tensión que el equipo está evitando, ayuda a que un conflicto se convierta en movimiento hacia adelante, y da espacio a la voz que piensa distinto aunque no se imponga — dando permiso al equipo para hacer lo mismo con la tensión, el conflicto y la disidencia.',
  threshold_low = 'La tensión que el equipo evita tiende a quedarse sin nombrar, el conflicto a quedar enterrado, y la voz distinta a quedar fuera de la conversación — y sin ese permiso modelado, el equipo tiende también a dejarlo todo pasar.'
where code = 'presencia';

-- Coach
update competency_frameworks set
  description = 'Ayuda a otros a encontrar sus propias respuestas, con curiosidad genuina y preguntas que ayudan a pensar.',
  threshold_high = 'Ayuda a otros a llegar a sus propias respuestas en vez de dárselas, con curiosidad genuina — lo que ayuda a que el equipo desarrolle su propia capacidad de pensar, no solo de ejecutar.',
  threshold_low = 'Tiende más a dar la respuesta que a acompañar a que la otra persona la encuentre — y el equipo desarrolla menos esa misma capacidad de pensar por sí mismo.'
where code = 'coaching';

update competency_frameworks set
  description = 'Comparte su experiencia con generosidad para que otros crezcan más rápido.',
  threshold_high = 'Comparte su experiencia con generosidad y dedica tiempo a que otros crezcan sin que se lo pidan — lo que acelera el desarrollo de quienes le rodean.',
  threshold_low = 'Comparte esa experiencia con menos frecuencia, o espera a que se la pidan antes de dedicar tiempo a otros — y el equipo crece más despacio en esa misma dimensión.'
where code = 'mentoring';

update competency_frameworks set
  description = 'Lee cómo están los demás, ajusta cómo se relaciona con cada uno, y comparte información y reconocimiento con el equipo.',
  threshold_high = 'Lee cómo está cada persona y ajusta cómo se relaciona con ella, y comparte información y reconocimiento — cada persona se siente vista y el equipo está mejor informado.',
  threshold_low = 'Ajustar cómo se relaciona a cómo está cada persona le cuesta más, o comparte con menos frecuencia información y reconocimiento — y el equipo tiende a sentirse menos visto y menos informado.'
where code = 'inteligencia_relacional';
