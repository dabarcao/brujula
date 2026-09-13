# Interpretación IA del 360 — datos reales enviados hoy

Referencia para trabajar el prompt/contexto en otro chat. Todo lo de aquí abajo
sale de código real (`src/lib/aiInterpretation.ts`, función
`generateAiInterpretation`) y de un perfil real de prueba (360 de "Verifica
Modelo V2", modelo de competencias v2, con saboteadores altos) — no está
inventado ni simplificado.

## La llamada a la API

- Endpoint: `https://api.anthropic.com/v1/messages`
- Modelo: `claude-haiku-4-5-20251001`
- `max_tokens`: 1536
- Un único mensaje de rol `user` con el texto de abajo — no hay `system` aparte,
  todo el rol/tono/instrucciones van dentro del mismo prompt de usuario.
- Se llama una única vez, en el momento de pulsar "Finalizar informe" (nunca
  se regenera después) — y solo si hay `ANTHROPIC_API_KEY` configurada.

## De dónde sale cada dato

El prompt se construye leyendo tres RPCs, siempre del mismo `request_id`:

1. `get_request_competency_comparison` — una fila por competencia: nombre,
   rol/dimensión, autoevaluación, media de compañeros.
2. `get_request_competency_by_category` — una fila por competencia ×
   categoría de evaluador (jefe, equipo, empresa, otros) que ya tenga su
   mínimo de respuestas cumplido.
3. `get_request_saboteadores` — una fila por saboteador (de los 5), con su
   media de autoevaluación y si supera el umbral (`is_high`). Solo los que
   superan el umbral entran en el prompt.

Con eso arma el texto tal cual se lo manda al modelo — no hay ningún resumen
previo ni preprocesado por el propio código, es la tabla completa en crudo.

## El prompt exacto que se envía (ejemplo real)

```text
Eres un asistente que ayuda a interpretar el perfil de un informe de feedback 360 en Brújula, una herramienta de feedback anónimo humanista (no de evaluación de desempeño).

Datos de competencias (escala 1-5, "sin dato" cuando no aplica):
- Autenticidad (Plenitud) · autoevaluación: 3.25 · media de compañeros: 2.92 · jefe/responsable directo: 2.58, compañeros de la empresa: 3.25, otros: 3.42, compañeros de equipo: 2.42
- Coaching (Coach) · autoevaluación: 2.75 · media de compañeros: 2.83 · jefe/responsable directo: 3.25, compañeros de la empresa: 3.08, otros: 2.08, compañeros de equipo: 2.92
- Cultura (Arquitecto) · autoevaluación: 4.5 · media de compañeros: 2.65 · jefe/responsable directo: 3, compañeros de la empresa: 2.5, otros: 3, compañeros de equipo: 2.08
- Dirección compartida (Visión) · autoevaluación: 3 · media de compañeros: 3.1 · jefe/responsable directo: 2.83, compañeros de la empresa: 3, otros: 3.08, compañeros de equipo: 3.5
- Gestión emocional (Plenitud) · autoevaluación: 3.25 · media de compañeros: 2.48 · jefe/responsable directo: 3.33, compañeros de la empresa: 2, otros: 2.75, compañeros de equipo: 1.83
- Inteligencia relacional (Coach) · autoevaluación: 1.75 · media de compañeros: 2.63 · jefe/responsable directo: 2.58, compañeros de la empresa: 2.33, otros: 2.08, compañeros de equipo: 3.5
- Mentoring (Coach) · autoevaluación: 4.5 · media de compañeros: 3.04 · jefe/responsable directo: 3.25, compañeros de la empresa: 2.83, otros: 3.25, compañeros de equipo: 2.83
- Organización del trabajo (Arquitecto) · autoevaluación: 3.75 · media de compañeros: 3 · jefe/responsable directo: 2.75, compañeros de la empresa: 3.33, otros: 2.67, compañeros de equipo: 3.25
- Orientación a resultados (Visión) · autoevaluación: 3 · media de compañeros: 2.94 · jefe/responsable directo: 3.58, compañeros de la empresa: 3, otros: 2.92, compañeros de equipo: 2.25
- Orientación al valor (Arquitecto) · autoevaluación: 1.75 · media de compañeros: 3.27 · jefe/responsable directo: 3.25, compañeros de la empresa: 3.25, otros: 3.5, compañeros de equipo: 3.08
- Presencia (Catalizador) · autoevaluación: 3.25 · media de compañeros: 2.9 · jefe/responsable directo: 3.75, compañeros de la empresa: 2.17, otros: 3.75, compañeros de equipo: 1.92
- Propósito (articulación con sentido) (Visión) · autoevaluación: 3 · media de compañeros: 3.06 · jefe/responsable directo: 3.25, compañeros de la empresa: 2.83, otros: 2.5, compañeros de equipo: 3.67
- Sentido colectivo (Catalizador) · autoevaluación: 3.75 · media de compañeros: 3.54 · jefe/responsable directo: 3.42, compañeros de la empresa: 3.67, otros: 3.67, compañeros de equipo: 3.42
- Toma de decisiones (Arquitecto) · autoevaluación: 1.25 · media de compañeros: 3.13 · jefe/responsable directo: 2.5, compañeros de la empresa: 3.75, otros: 3.67, compañeros de equipo: 2.58
- Valentía (Catalizador) · autoevaluación: 3 · media de compañeros: 3 · jefe/responsable directo: 3.08, compañeros de la empresa: 3.33, otros: 2.83, compañeros de equipo: 2.75
- Visión estratégica (Visión) · autoevaluación: 4 · media de compañeros: 3.29 · jefe/responsable directo: 4.08, compañeros de la empresa: 3.42, otros: 2.92, compañeros de equipo: 2.75

Escribe una interpretación en español, en 2ª persona ("tú"), en 3-4 párrafos cortos, con este contenido:
1. Qué destaca según la media de compañeros (2-3 competencias con nota más alta).
2. Los mayores gaps entre autoevaluación y media de compañeros, en ambos sentidos (te ves mejor o peor de lo que te ven) — como pregunta reflexiva, nunca como veredicto.
3. Si hay una divergencia notable entre categorías de evaluador (jefe vs equipo, etc.) en alguna competencia, coméntala.
4. Cierra con la competencia con más recorrido según la media general, sin alarmismo.

Además, esta persona se autoevaluó alto en los siguientes saboteadores (patrones de pensamiento limitantes, en el sentido de Shirzad Chamine/Positive Intelligence — no son competencias, no los relaciones con ninguna de la lista de arriba de forma fija ni causal): Evitador: 4.25/5, Complaciente: 4/5, Perfeccionista: 4/5. Estos datos de saboteadores son SOLO de autoevaluación — nadie más los puntúa, así que no hables de "cómo te ven" para ellos.

5. Añade un párrafo más, tejido con naturalidad en la misma interpretación (no como una sección aparte ni con un encabezado propio), sobre qué creencia o patrón puede haber detrás de cada saboteador alto — siempre en tono de hipótesis ("puede estar relacionado con...", "vale la pena explorar si..."), nunca de veredicto ("esto te está limitando"). Si algún gap o divergencia de los datos de competencias de arriba parece conectar con ese saboteador, puedes mencionarlo como refuerzo, pero no fuerces la conexión si no la hay.

Todo el texto debe leerse como UNA única interpretación conjunta del perfil (competencias y saboteadores entrelazados), nunca como dos bloques o informes separados.

Tono humanista, cercano, nunca de evaluación de desempeño. No uses listas ni encabezados, solo párrafos de texto corrido separados por una línea en blanco.
```

## Notas para cuando trabajes el prompt en el otro chat

- Los nombres de categoría (`jefe/responsable directo`, `compañeros de equipo`,
  `compañeros de la empresa`, `otros`) son fijos, vienen de
  `CATEGORY_LABELS` en el propio código.
- Una competencia solo lleva desglose por categoría si esa categoría ya
  alcanzó su mínimo de respuestas para revelarse (si no, simplemente no
  aparece esa parte de la línea) — por eso alguna competencia podría salir
  sin ningún desglose de categoría si nadie llegó al mínimo.
- El bloque de saboteadores (el "Además, esta persona...") solo se añade si
  hay al menos uno por encima del umbral (hoy ≥4/5) — si no hay ninguno alto,
  el prompt termina en el punto 4 y nunca menciona saboteadores.
- Los 5 saboteadores posibles son: Controlador, Evitador, Hiperracional,
  Complaciente, Perfeccionista.
