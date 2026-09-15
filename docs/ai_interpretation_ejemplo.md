# Interpretación IA del 360 — prompt real actual (migrado1)

Referencia para trabajar el prompt en otro chat. Todo lo de aquí abajo sale de
código real (`src/lib/aiInterpretation.ts`, función `generateAiInterpretation`)
y de un perfil real de prueba (migrado1@kairos.es, "Migrado Uno") — regenerado
tras el modelo de competencias v2, los umbrales, la 3ª pregunta de Presencia y
el reordenado de preguntas. No está inventado ni simplificado — se reconstruyó
llamando a las mismas RPCs que usa el código, sin invocar de verdad a la IA
(no hay `ANTHROPIC_API_KEY` configurada a propósito).

## La llamada a la API

- Endpoint: `https://api.anthropic.com/v1/messages`
- Modelo: `claude-haiku-4-5-20251001`
- `max_tokens`: 1536
- Un único mensaje de rol `user` con el texto de abajo — no hay `system`
  aparte, todo el rol/tono/instrucciones van dentro del mismo prompt.
- Se llama una única vez, al pulsar "Finalizar informe" (nunca se regenera
  después) — y solo si hay `ANTHROPIC_API_KEY` configurada.
- La respuesta se parte en 3 partes (competencias / saboteadores / resumen de
  respuestas abiertas) buscando dos marcadores literales en el texto — ver
  más abajo.

## De dónde sale cada dato

El prompt se construye leyendo, siempre del mismo `request_id`:

1. `get_request_competency_comparison` — una fila por competencia: nombre,
   rol/dimensión, autoevaluación, media de compañeros.
2. `get_request_competency_by_category` — una fila por competencia ×
   categoría de evaluador (jefe, equipo, empresa, otros) que ya tenga su
   mínimo de respuestas cumplido.
3. `get_request_saboteadores` — una fila por saboteador (de los 5), con su
   media de autoevaluación y si supera el umbral (`is_high`). Solo los que
   superan el umbral entran en el prompt.
4. `feedback_answers` (preguntas `open`, solo respuestas de compañeros, nunca
   la autoevaluación) — el texto libre tal cual, sin resumir por el propio
   código; es la IA quien sintetiza.
5. `competency_frameworks` (nuevo, migración 0078) — `threshold_high` /
   `threshold_low` de las 16 competencias, como bloque de referencia para
   calibrar el tono, siempre las 16 aunque no todas se acaben citando.

Con eso arma el texto tal cual se lo manda al modelo — no hay ningún resumen
previo ni preprocesado del código más allá de montar las líneas.

## El prompt exacto que se envía (ejemplo real, migrado1)

```text
Eres un asistente que ayuda a interpretar el perfil de un informe de feedback 360 en Brújula, una herramienta de feedback anónimo humanista (no de evaluación de desempeño).

Datos de competencias (escala 1-5, "sin dato" cuando no aplica):
- Autenticidad (Plenitud) · autoevaluación: 4 · media de compañeros: 4 · jefe/responsable directo: 4, compañeros de la empresa: 4, otros: 4, compañeros de equipo: 4
- Coaching (Coach) · autoevaluación: 4.5 · media de compañeros: 4.5 · jefe/responsable directo: 4.5, compañeros de la empresa: 4.5, otros: 4.5, compañeros de equipo: 4.5
- Cultura (Arquitecto) · autoevaluación: 4 · media de compañeros: 4 · jefe/responsable directo: 4, compañeros de la empresa: 4, otros: 4, compañeros de equipo: 4
- Dirección compartida (Visión) · autoevaluación: 3.25 · media de compañeros: 3.04 · jefe/responsable directo: 3.42, compañeros de la empresa: 3.33, otros: 2.33, compañeros de equipo: 3.08
- Gestión emocional (Plenitud) · autoevaluación: 1 · media de compañeros: 2 · jefe/responsable directo: 2, compañeros de la empresa: 2, otros: 2, compañeros de equipo: 2
- Inteligencia relacional (Coach) · autoevaluación: 2 · media de compañeros: 4 · jefe/responsable directo: 4, compañeros de la empresa: 4, otros: 4, compañeros de equipo: 4
- Mentoring (Coach) · autoevaluación: 1.5 · media de compañeros: 3.5 · jefe/responsable directo: 3.5, compañeros de la empresa: 3.5, otros: 3.5, compañeros de equipo: 3.5
- Organización del trabajo (Arquitecto) · autoevaluación: 3 · media de compañeros: 3.5 · jefe/responsable directo: 3.5, compañeros de la empresa: 3.5, otros: 3.5, compañeros de equipo: 3.5
- Orientación a resultados (Visión) · autoevaluación: 2.5 · media de compañeros: 3.5 · jefe/responsable directo: 3.5, compañeros de la empresa: 3.5, otros: 3.5, compañeros de equipo: 3.5
- Orientación al valor (Arquitecto) · autoevaluación: 3 · media de compañeros: 4 · jefe/responsable directo: 4, compañeros de la empresa: 4, otros: 4, compañeros de equipo: 4
- Presencia (Catalizador) · autoevaluación: 3.5 · media de compañeros: 3 · jefe/responsable directo: 3, compañeros de la empresa: 3, otros: 3, compañeros de equipo: 3
- Propósito (Visión) · autoevaluación: 1.5 · media de compañeros: 3 · jefe/responsable directo: 3, compañeros de la empresa: 3, otros: 3, compañeros de equipo: 3
- Sentido colectivo (Catalizador) · autoevaluación: 3 · media de compañeros: 2.83 · jefe/responsable directo: 2.75, compañeros de la empresa: 3.25, otros: 2.92, compañeros de equipo: 2.42
- Toma de decisiones (Arquitecto) · autoevaluación: 1 · media de compañeros: 2 · jefe/responsable directo: 2, compañeros de la empresa: 2, otros: 2, compañeros de equipo: 2
- Valentía (Catalizador) · autoevaluación: 4 · media de compañeros: 3.5 · jefe/responsable directo: 3.5, compañeros de la empresa: 3.5, otros: 3.5, compañeros de equipo: 3.5
- Visión estratégica (Visión) · autoevaluación: 2.5 · media de compañeros: 3.5 · jefe/responsable directo: 3.5, compañeros de la empresa: 3.5, otros: 3.5, compañeros de equipo: 3.5

Para referencia (qué indica un valor alto o bajo en cada competencia — úsalo para calibrar el tono de la interpretación, no lo copies literalmente ni lo cites como lista):
- Propósito: valor alto = Comparte el propósito de una forma que cala en los demás, y logra que se sientan parte de él — el equipo trabaja conectado con un sentido propio, no solo con una tarea.; valor bajo = El propósito se queda más como algo propio, sin transmitirse de forma que tenga sentido para otros — y el equipo, con menos de ese sentido compartido, vive el trabajo más como tarea.
- Visión estratégica: valor alto = Conecta el trabajo del día a día con un rumbo de medio y largo plazo, y lo comparte anticipando su impacto — dando al equipo esa misma perspectiva amplia.; valor bajo = El foco está más anclado en la tarea inmediata, sin conectarla de forma visible con un horizonte más amplio — y el equipo dispone de menos esa perspectiva compartida.
  [... las 16 competencias, una línea cada una — omitidas aquí por espacio, ver el prompt completo devuelto por el script]

Escribe una interpretación en español, en 2ª persona ("tú"), en 3-4 párrafos cortos, con este contenido:
1. Qué destaca según la media de compañeros (2-3 competencias con nota más alta).
2. Los mayores gaps entre autoevaluación y media de compañeros, en ambos sentidos (te ves mejor o peor de lo que te ven) — como pregunta reflexiva, nunca como veredicto.
3. Si hay una divergencia notable entre categorías de evaluador (jefe vs equipo, etc.) en alguna competencia, coméntala.
4. Cierra con la competencia con más recorrido según la media general, sin alarmismo.

Esta persona se autoevaluó alto en los siguientes saboteadores (patrones de pensamiento limitantes, en el sentido de Shirzad Chamine/Positive Intelligence — no son competencias, no los relaciones con ninguna de la lista de arriba de forma fija ni causal): Complaciente: 4/5. Estos datos de saboteadores son SOLO de autoevaluación — nadie más los puntúa, así que no hables de "cómo te ven" para ellos.

Cuando termines la interpretación de competencias de arriba, añade en una línea aparte exactamente el texto "---SABOTEADORES---" y, a continuación, un párrafo (o uno por saboteador si hay varios) sobre qué creencia o patrón puede haber detrás de cada saboteador alto — siempre en tono de hipótesis ("puede estar relacionado con...", "vale la pena explorar si..."), nunca de veredicto ("esto te está limitando"). Si algún gap o divergencia de los datos de competencias de arriba parece conectar con ese saboteador, puedes mencionarlo como refuerzo, pero no fuerces la conexión si no la hay. Esta parte va aparte, no la mezcles con la interpretación de competencias.

Comentarios de texto libre que sus compañeros le han escrito (anonimizados, sin indicar quién escribió cada uno):
Pregunta: "¿Quieres proporcionar a tu compañer@ un reconocimiento? Completa la frase: "Lo que veo en ti es..." o "Lo que destaca de ti es...""
- Escucha de verdad y siempre encuentra un terreno común para llegar a acuerdos.
  [... 12 respuestas por pregunta, 3 preguntas abiertas en total]

Cuando termines todo lo anterior, si en esos comentarios hay como máximo 1-2 temas que se repitan en varios comentarios de personas distintas (nunca a partir de un solo comentario aislado), añade en una línea aparte exactamente el texto "---RESPUESTAS_ABIERTAS---" y, a continuación, un párrafo corto con ese resumen. No cites ningún comentario literalmente. Dilo explícitamente como una síntesis de las respuestas abiertas de sus compañeros (por ejemplo, "en las respuestas abiertas de tus compañeros se repite..."), para que quede claro que es un resumen de esas preguntas abiertas y no una competencia ni un saboteador más. Esta parte va aparte, no la mezcles con las anteriores. Si no hay ningún tema que se repita, no escribas ni el marcador ni esta parte.

Tono humanista, cercano, nunca de evaluación de desempeño, en las tres partes por igual. No uses listas ni encabezados en ninguna de ellas, solo párrafos de texto corrido separados por una línea en blanco.
```

El texto completo, sin recortar (las 16 líneas de umbrales y las 3 preguntas
abiertas con sus 12 respuestas cada una), está en
`migrado1_prompt.txt` que te mandé junto a este documento.

## Qué cambió respecto a la versión anterior de este documento

- **Bloque de umbrales nuevo** ("Para referencia..."), con las 16
  competencias siempre completas — antes no existía.
- **Presencia solo tiene 2 respuestas de dato**, no 3: migrado1 se sembró
  antes de que existiera la 3ª pregunta ("da espacio a una voz distinta o
  minoritaria"), así que su media de Presencia sigue calculándose solo con
  las 2 preguntas originales. Cualquier respuesta *nueva* sí contaría la
  pregunta 3ª — no hace falta re-sembrar nada, es solo que este perfil en
  concreto no tiene esa respuesta todavía.
- **"Propósito"** aparece ya con el nombre corto (antes: "Propósito
  (articulación con sentido)").
- **3 marcadores/salidas** (`---SABOTEADORES---`,
  `---RESPUESTAS_ABIERTAS---`) en vez de un único bloque — la versión
  anterior de este documento era de antes del cambio a 3 partes separadas.

## Notas que siguen aplicando

- Los nombres de categoría (`jefe/responsable directo`, `compañeros de
  equipo`, `compañeros de la empresa`, `otros`) son fijos, vienen de
  `CATEGORY_LABELS` en el propio código.
- Una competencia solo lleva desglose por categoría si esa categoría ya
  alcanzó su mínimo de respuestas para revelarse.
- El bloque de saboteadores solo se añade si hay al menos uno por encima del
  umbral (hoy ≥4/5) — si no hay ninguno alto, el prompt termina en el punto 4
  y nunca menciona saboteadores ni añade ese marcador.
- El resumen de respuestas abiertas solo se añade si hay al menos 1-2 temas
  repetidos entre varios comentarios — si no, ese marcador tampoco aparece.
- Los 5 saboteadores posibles son: Controlador, Evitador, Hiperracional,
  Complaciente, Perfeccionista.
