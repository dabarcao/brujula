# Brújula — Documento funcional

*Para incorporación de nuevo colaborador (CTO). Complementa a `docs/spec.md` (documento técnico) — este documento explica el qué y el por qué a nivel de producto; `spec.md` explica el cómo a nivel de implementación.*

## 1. Propósito

En la mayoría de empresas, el feedback entre compañeros es escaso, tardío y top-down: llega una vez al año, en una evaluación de desempeño, y casi siempre en una sola dirección (el jefe evalúa al empleado). Es difícil que sea honesto — quien lo da sabe que se le puede identificar, y eso condiciona lo que dice.

Brújula existe para resolver eso: una herramienta de feedback **anónimo de forma fuerte** entre compañeros, disponible de forma continua (no solo una vez al año), que con el tiempo destila ese feedback disperso en un mapa de competencias personal y en patrones de clima organizacional — sin que nadie, ni siquiera quien administra la base de datos, pueda saber quién dijo qué.

El reto central del producto no es la interfaz, es la **arquitectura de confianza**. Por eso el anonimato no es una promesa de política de privacidad, es una garantía técnica: se sostiene a nivel de base de datos (Postgres + Row-Level Security en Supabase), no a nivel de aplicación.

**Fundamento de diseño:** Brújula es deliberadamente humanista, no técnica — no mide desempeño ni habilidades técnicas. Dos ideas de fondo dan forma al producto, aunque ninguna se menciona nunca de cara al usuario:

- **Los cuadrantes de Ken Wilber**, para situar qué mide cada parte del producto: el feedback individual entre compañeros vive en lo subjetivo/individual — la experiencia de cada persona. Los informes agregados por equipo o empresa permiten leer patrones de cultura compartida — el clima de la organización.
- **Los tres principios de Frederic Laloux** sobre organizaciones "teal" (*Reinventar las organizaciones*) — propósito evolutivo, equipos autoorganizados y plenitud — como los tres dominios en los que se organiza internamente el marco de competencias de la plataforma. No es una etiqueta de marketing: es la estructura real que decide qué se pregunta y cómo se agrupan los resultados.

## 2. Alcance del producto

Brújula es un **producto B2B SaaS multi-empresa**: las empresas lo contratan para sus empleados, no es una app de consumo. El nicho inicial son las pymes, con interfaz en español.

Dentro de alcance:
- Feedback anónimo entre compañeros, por dos vías: un **ciclo estructurado tipo 360** (periódico, organizado por RRHH) y un **flujo ágil espontáneo** (puntual, iniciado por el propio empleado — por ejemplo, tras una reunión).
- Dos formatos de feedback: **texto libre** guiado por preguntas, y **encuesta corta** de escala, cada pregunta de escala ligada a una competencia del marco interno.
- Un **marco de competencias único de la plataforma** (no definido por cada empresa), organizado en los tres dominios teal, que alimenta tanto el mapa de competencias del empleado como, a futuro, el clima agregado de la empresa.
- Aislamiento estricto entre empresas (multi-tenancy) reforzado a nivel de base de datos, no solo de aplicación.

Fuera de alcance por ahora (visión de futuro, no del piloto):
- Comparativas de percentiles entre empresas (benchmarking global) — diseñado, pendiente de construir.
- Motor de análisis por IA que clasifique texto libre y genere insights progresivos — diseñado, pendiente de construir.
- SSO corporativo, integraciones (Slack/Teams/calendario), app móvil nativa.
- Función de "reconocimiento" entre compañeros (validación de skills) — idea anotada, sin diseñar.

## 3. Roles y descripción funcional

Brújula tiene tres niveles de usuario:

**Admin general** (la plataforma, el proveedor). No pertenece a ninguna empresa — es transversal. Da de alta empresas nuevas y a su primer administrador. A futuro (parte del alcance, en construcción progresiva): gestiona los usuarios de cualquier empresa, y es quien crea y mantiene tanto las plantillas de cuestionarios como el marco de competencias — ninguna empresa define las suyas propias, todas comparten el mismo marco, lo que es lo que hace posible comparar clima y competencias entre departamentos y, más adelante, entre empresas.

**Supervisor** (RRHH de la empresa cliente). Dado de alta por el Admin general al crear la empresa. Da de alta a los empleados de su empresa, configura y lanza los ciclos 360 — eligiendo explícitamente quién participa en cada uno —, y ve las métricas agregadas de su empresa. No ve feedback individual, ni siquiera el suyo propio si participa como evaluado. Puede, con la misma cuenta, participar también como empleado normal (pedir su propio feedback, hacer su propia autoevaluación) — no son roles excluyentes.

**Empleado.** Solicita feedback (ágil o dentro de un ciclo 360), responde al feedback que le piden sus compañeros, y ve sus propios resultados — nunca los ajenos. No hay ninguna distinción de rol interno de la organización (por ejemplo, ser jefe de equipo) que condicione qué preguntas se le hacen o qué puede hacer: cualquier empleado, sea cual sea su posición real, participa en igualdad de condiciones.

**Cómo se protege el anonimato, en términos funcionales:** para poder ver cualquier respuesta, primero hace falta reunir un número mínimo de personas invitadas (por defecto 5) y un número mínimo de respuestas recibidas (por defecto 3) — por debajo de ese umbral, la plataforma muestra "esperando más respuestas" en vez de contenido. Ningún cliente puede bajar esos umbrales lo suficiente como para hacer el anonimato reversible.

## 4. El MVP — qué se lanza en el piloto

Lo que un empleado, un Supervisor y un Admin general pueden hacer hoy, de principio a fin, sin intervención técnica:

- El Admin general da de alta una empresa nueva y a su primer Supervisor, desde un panel propio.
- El Supervisor da de alta a sus empleados (invitación por email, alta uno a uno).
- Cualquier empleado puede pedir feedback ágil sobre algo puntual (reunión, colaboración, liderazgo de una iniciativa, o desarrollo profesional general), eligiendo a sus compañeros con un buscador.
- El Supervisor puede lanzar un ciclo 360, eligiendo explícitamente qué empleados participan — un mismo empleado no puede quedar metido en dos ciclos 360 abiertos a la vez, aunque la empresa sí puede tener varios ciclos simultáneos con grupos distintos de gente.
- Cada empleado organiza a sus propios evaluadores dentro del ciclo (jefe/equipo/empresa/otros) y responde tanto el feedback que le piden como su propia autoevaluación — un cuestionario de 28 preguntas de escala construido directamente sobre las 14 competencias del marco (2 preguntas por competencia), más 3 preguntas abiertas para el feedback entre compañeros (la autoevaluación no incluye las abiertas, solo tiene sentido pedirlas sobre otra persona).
- El anonimato fuerte y los umbrales mínimos ya descritos se aplican en ambos flujos.

Lo que queda explícitamente para después del piloto inicial, ya identificado y priorizado (detalle técnico en `spec.md`, sección 17):
- Que el Admin general pueda crear/editar cuestionarios y gestionar el marco de competencias desde un panel (hoy el catálogo de 14 competencias ya existe y está en uso, pero solo se edita entrando directamente en la base de datos).
- Que el Supervisor pueda modificar o dar de baja empleados ya invitados, cambiar la fecha de fin de un ciclo en marcha, y enviar recordatorios.
- Envío de email automático (hoy toda invitación se comparte copiando un enlace a mano).
- El motor de análisis por IA y los informes de clima con percentiles — diseñados, sin construir todavía.

## 5. De aquí en adelante

El plan no es lanzar Brújula "terminada": es llevar este piloto a un puñado de empresas reales, aprender de cómo lo usan de verdad, e iterar el producto con ese aprendizaje antes de invertir en las piezas más pesadas (motor de análisis, informes de clima, benchmarking entre empresas). Solo después de esa fase de validación tiene sentido plantear una expansión más amplia al mercado pyme.

Es el momento en el que se busca incorporar a un CTO que construya el producto junto al fundador (que pasa a Product Owner) — no para heredar algo cerrado, sino para formar parte de las decisiones de qué construir a continuación, con el piloto real como guía.

## 6. Cómo seguir

- `docs/spec.md` — documento técnico vivo, con el detalle de implementación, modelo de datos, y el backlog consolidado (sección 17) de todo lo que ya está decidido pero pendiente de construir.
- El código vive en el repositorio (`brujula-app`), desplegado en Vercel, con Supabase como base de datos. Cada decisión de diseño relevante queda documentada en `spec.md` a medida que se toma.
