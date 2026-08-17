# Brújula — Especificación de producto

*Herramienta de feedback anónimo para empleados. v0.4 — modelo de roles ampliado (Admin general de plataforma, Supervisor, Jefe, Empleado), cuestionarios y marco de competencias centralizados en el Admin general, auto-registro por dominio de empresa, y primer borrador de agrupación de competencias inspirado en los tres principios de las organizaciones teal (Laloux). Ver notas "Pendiente de implementar" en las secciones afectadas: son decisiones de diseño acordadas, el código todavía implementa el modelo anterior (2 roles).*

## 1. Resumen ejecutivo

Producto B2B SaaS que las empresas contratan para sus empleados. Cada empleado puede solicitar feedback de su trabajo o de reuniones concretas, a través de dos vías — un ciclo estructurado tipo 360 y un flujo ágil espontáneo — y recibirlo en dos formatos, texto libre o encuesta corta. El feedback es anónimo de forma fuerte: ni el propio empleado ni la empresa pueden saber quién dio una respuesta concreta. Con el tiempo, un motor de análisis va destilando ese feedback disperso en áreas de mejora recurrentes, visualizadas como un mapa de competencias, que se muestran progresivamente al empleado — incluyendo cómo se sitúa frente a la media de su empresa y frente a la media global de la plataforma. La empresa, por su parte, solo accede a métricas agregadas de clima y competencias por equipo, nunca al detalle individual, y puede usar esas métricas para orientar decisiones como qué formación priorizar.

El reto central del producto no es tanto la interfaz como la arquitectura de confianza: el anonimato tiene que sostenerse incluso frente a quien administra la base de datos.

## 2. Usuarios y roles

- **Admin general** (rol de plataforma, el proveedor — vosotros): no pertenece a ninguna empresa, identificado por email en una lista de administradores de plataforma. Tiene alta/baja/modificación (ABM) transversal sobre:
  - Empresas — **implementado**: crear, listar y renombrar desde `/admin`. Falta desactivar/eliminar.
  - Usuarios de cualquier empresa (alta individual y masiva) — *pendiente de implementar*, hoy el Admin general solo da de alta al primer Supervisor de una empresa nueva, no gestiona el resto de usuarios.
  - Grupos — *pendiente de implementar*.
  - Plantillas de cuestionarios — preguntas abiertas y de escala (secciones 5.1/5.2) — *pendiente de implementar*; hoy nadie puede crear cuestionarios propios (ver nota de la sección 5.1).
  - Competencias del marco interno de la plataforma (sección 7) — una competencia no se puede eliminar si tiene preguntas de cuestionario asociadas — *pendiente de implementar*.
  - **No** crea ni gestiona ciclos 360 — eso es siempre responsabilidad de la empresa (rol Supervisor).
- **Supervisor** (RRHH de la empresa — es el rol antes descrito aquí como "Admin de empresa"): ABM de usuarios dentro de su propia empresa, configura y lanza ciclos 360 (seleccionando explícitamente quién participa en cada uno), ve métricas agregadas de su empresa. No ve feedback individual. No define competencias propias ni cuestionarios propios (eso pasa a ser exclusivo del Admin general). **Implementado como una capacidad (`is_supervisor`) sobre un miembro normal, no como un rol excluyente** — así la misma persona puede ser Supervisor y Usuario participante a la vez (pide su propio feedback, hace su propia 360), con una sola cuenta; el mismo patrón que ya usaba `is_manager` ("Jefe"). Un Supervisor por empresa por ahora (impuesto a nivel de base de datos); si se necesita un equipo de varios Supervisores por empresa, queda para más adelante. Grupos dentro de la empresa: *pendiente de implementar*.
- **Jefe**: rol intermedio dentro de la empresa — recibe/responde las preguntas del ciclo 360 marcadas como "solo responsable" (sección 5.2), sin privilegios de administración. Es el flag `is_manager` ya existente, con el mismo patrón de "capacidad sobre un miembro" que Supervisor.
- **Empleado**: solicita feedback, responde encuestas/feedback de otros, ve sus propios insights, su gráfico de competencias y sus comparativas.

**Alta de usuarios:** por invitación uno a uno (sección 4.3, ya implementado) o por auto-registro cuando el email coincide con el dominio de la empresa (por ejemplo, `pepe@empresa.com` para la empresa `empresa.com`) — **solo** si ese usuario ya existía previamente como registro `inactivo` en la base de datos, precargado por un Supervisor o el Admin general. El dominio por sí solo nunca da acceso a alguien no precargado. *(Pendiente de implementar.)*

> **Implementado:** el alta de empresa ya no es autoservicio público — `/signup` se retiró. El Admin general (identificado por su email en la tabla `platform_admins`) da de alta empresas nuevas desde `/admin`, que queda como Supervisor invitado de esa empresa hasta que completa su alta. Desde fuera de la app solo quedan dos puertas: iniciar sesión o entrar por invitación.

> **Pendiente de implementar:** ABM de usuarios/grupos por parte del Admin general (hoy solo crea la empresa y su primer Supervisor), ABM de cuestionarios y de competencias, grupos dentro de una empresa, y el auto-registro por dominio.

## 3. Multi-tenancy

Desde el primer día, la aplicación es multi-empresa: cada empresa cliente es un *tenant* aislado. Todo dato relevante cuelga de un `company_id`, y el aislamiento entre tenants se refuerza a nivel de base de datos (Row-Level Security), no solo a nivel de aplicación.

## 4. Los dos flujos de solicitud de feedback

### 4.1 Ciclo estructurado (tipo 360)

Pensado para evaluaciones periódicas (semestrales, por ejemplo). El Supervisor configura el ciclo: fechas de apertura/cierre, el cuestionario asociado, y **selecciona explícitamente quién participa** — el ciclo ya no se abre automáticamente para toda la empresa, solo las personas elegidas pueden organizar a sus evaluadores. Los evaluadores potenciales están categorizados por su relación con el empleado:

- Jefe / responsable directo
- Compañeros de equipo
- Compañeros de la empresa (otros equipos/departamentos)
- Otros (por ejemplo, alguien externo al organigrama habitual pero relevante para el ciclo)

El empleado, dentro del ciclo, puede agrupar y organizar a sus evaluadores según estas categorías y su propio criterio (por ejemplo, para pedir feedback equilibrado entre categorías). Esta categorización se usa también para poder, en el futuro, segmentar insights por tipo de relación (aunque en el MVP el análisis puede tratarse de forma agregada, sin desglose por categoría, para no debilitar el anonimato en categorías con pocas personas).

**Quién puede ser invitado:** para las categorías jefe/equipo/empresa, el evaluador tiene que ser ya un empleado dado de alta en la organización (ver sección "Alta de empleados" más abajo). La categoría "Otros" es la excepción: puede incluir a alguien externo a la organización, que no llega a ser miembro de la plataforma — le basta su email y el token de invitación de esa solicitud concreta para responder, sin necesidad de crear cuenta ni iniciar sesión.

### 4.2 Flujo ágil / espontáneo

El empleado elige personas concretas (mínimo parametrizable, ver sección 6) y solicita feedback puntual y contextual — por ejemplo, sobre una presentación reciente. Este flujo es, ante todo, una herramienta de progresión individual: alimenta el perfil de competencias del empleado, pero por su naturaleza puntual y de bajo volumen pesa menos (o nada, según se decida) en las métricas agregadas de empresa, que se nutren principalmente del ciclo estructurado. En el flujo ágil, el empleado elige entre compañeros ya dados de alta en la organización (no hay categoría "Otros" aquí, esa es propia del ciclo 360).

**Tipo de solicitud:** cada solicitud ágil tiene un tipo — reunión/presentación, colaboración, liderazgo de una iniciativa, o general/desarrollo profesional — y cada tipo tiene su propia plantilla guiada de preguntas (ver sección 5.1). Las plantillas de cada tipo las crea y mantiene el Admin general de plataforma (sección 2), no la propia empresa: puede definir plantillas **genéricas** (visibles por defecto para todas las empresas) o plantillas **asignadas a una o varias empresas concretas**, a medida de su cultura y vocabulario. *(Pendiente de implementar — sustituye al modelo anterior, donde cada empresa sustituía directamente la plantilla de su propio tipo.)*

**Una solicitud abierta a la vez:** un empleado no puede tener más de una solicitud ágil abierta simultáneamente. Mientras esté abierta y nadie haya respondido todavía, puede modificar a quién invitó o cancelarla; en cuanto hay alguna respuesta, ninguna de las dos acciones está disponible.

### 4.3 Alta de empleados

Los empleados no se dan de alta a sí mismos: los da de alta el Supervisor (RRHH de la empresa) o el Admin general, uno a uno, con nombre y email — la persona invitada recibe un correo para completar su registro (contraseña) y queda vinculada a esa organización. La carga masiva por archivo (CSV) queda fuera del MVP, como mejora de roadmap futuro (ver sección 14) — aunque el modelo de roles de la sección 2 ya contempla alta masiva entre las capacidades del Admin general, pendiente de decidir si entra en el alcance del piloto.

**Alta por dominio de empresa (pendiente de implementar, ver sección 2):** además de la invitación uno a uno, se añade una segunda vía de alta — auto-registro cuando el email del usuario coincide con el dominio de la empresa, y solo si ese usuario ya existía como registro `inactivo` precargado por un Supervisor o el Admin general.

Ambos flujos alimentan el mismo motor de análisis y el mismo mapa de competencias del empleado.

## 5. Tipos de feedback

Los tipos 5.1 y 5.2 comparten el mismo modelo subyacente: una **plantilla de preguntas**, donde cada pregunta tiene un tipo (`abierta`, `escala` u `opción múltiple`). Lo que distingue un "texto libre" de una "encuesta corta" no es la infraestructura, sino qué tipos de pregunta contiene la plantilla.

### 5.1 Texto libre (plantilla guiada por tipo de solicitud)

En vez de una única caja de texto en blanco, el feedback libre usa una plantilla fija de preguntas abiertas. Cada solicitud ágil tiene un **tipo**, y cada tipo su propia plantilla por defecto de la plataforma:

- **General / desarrollo profesional** (tipo por defecto):
  1. ¿Qué habilidad destacarías de esta persona en su desarrollo profesional?
  2. ¿Cuál crees que es un área de mejora para profundizar en su desarrollo profesional?
  3. ¿Qué es aquello que le invitarías a seguir haciendo?
  4. ¿Qué crees que podría ayudarle en su desarrollo profesional dejar de hacer?
  5. ¿Algo más que quieras añadir? (opcional)
- **Reunión / presentación**, **Colaboración**, **Liderazgo de una iniciativa**: mismo patrón (4 preguntas guiadas + 1 opcional), adaptadas a cada contexto.

**Cuestionarios por empresa (modelo centralizado):** las plantillas — abiertas o de escala — las crea y mantiene el Admin general de plataforma, no cada empresa por separado (sección 2). Cada plantilla es **genérica** (visible por defecto para todas las empresas) o queda **asignada a una o varias empresas concretas** (a medida de su cultura, sustituyendo a la genérica de ese tipo solo para esas empresas). *(Pendiente de implementar. Estado actual: se retiró la posibilidad de que la empresa cree su propio cuestionario — todas las solicitudes ágiles usan siempre la plantilla por defecto de la plataforma hasta que exista el panel de cuestionarios del Admin general.)*

Las preguntas son genéricas, no ligadas a una competencia concreta (por ejemplo, no se formulan específicamente sobre "liderazgo"): el motor de análisis clasifica cada respuesta contra el marco de competencias vigente (sección 7), igual que haría con un texto libre sin estructurar.

**Autoevaluación (ciclo 360):** cuando quien responde es la propia persona evaluada, no se le piden las preguntas abiertas — solo tiene sentido pedirlas sobre otra persona. Su autoevaluación se limita a las preguntas de escala (sección 5.2).

Al responder cada pregunta, un asistente de IA ligero ayuda a quien escribe a construir una respuesta más precisa y útil para quien la solicita, en el momento (no confundir con el motor de análisis asíncrono de la sección 8, que procesa el feedback ya enviado):

- Sugerencias de redacción para que el feedback sea más claro, concreto y accionable (evitando comentarios vagos o puramente valorativos sin ejemplos).
- Sugerencia de competencias relacionadas con el texto, a modo de etiquetas (por ejemplo, `#comunicación`, `#gestión_del_tiempo`), que la persona que da el feedback puede aceptar, editar o descartar antes de enviar.

Esta asistencia ayuda además al motor de análisis, porque las etiquetas aceptadas por quien da el feedback son una señal adicional (y consentida) para la clasificación por competencias, complementando la clasificación automática por IA sobre el texto.

### 5.2 Encuesta corta

Preguntas cerradas (escala, opción múltiple), definidas por la plataforma o configurables por RRHH en el ciclo estructurado. A diferencia de las preguntas abiertas, cada pregunta cerrada va etiquetada con una competencia del marco interno de la plataforma (sección 7) — es lo que permite construir el mapa de competencias y, más adelante, percentiles por departamento o por empresa.

**Cuestionario propio del ciclo 360:** aquí el patrón es distinto al del flujo ágil (sección 5.1): las preguntas de escala específicas de una empresa **se añaden** después del bloque base de preguntas por defecto de la plataforma, no lo sustituyen. Esa sección propia la crea el Admin general de plataforma y la asigna a la empresa concreta (sección 2) — no es la empresa quien la redacta directamente. Cada ciclo nuevo que se crea copia ese bloque base más la sección asignada a la empresa (si existe) a su propia plantilla, así los cambios posteriores al cuestionario no afectan a ciclos ya en marcha. *(Pendiente de implementar — cambia "quién" crea la sección propia; el patrón aditivo en sí se mantiene.)*

### 5.3 Pregunta con imagen (fuera del MVP, roadmap futuro)

Un tercer formato a futuro: el evaluador elige una imagen de un conjunto predefinido (por ejemplo, representando estilos de trabajo o actitudes) y añade un comentario corto justificando la elección. Es un formato más lúdico y rápido de responder que el texto libre, útil para aumentar la tasa de respuesta en según qué contextos. No entra en el MVP, pero queda registrado como tercer tipo de pregunta a evaluar en una fase posterior, junto a texto libre y encuesta.

## 6. Umbrales de anonimato y agregación (parametrizables)

Este es el núcleo crítico del sistema: la identidad de quien da el feedback y el contenido de ese feedback nunca deben poder unirse en una misma consulta, ni siquiera con acceso administrativo total a la base de datos.

Dos parámetros configurables gobiernan cuándo se puede ver algo:

- **Mínimo de personas invitadas por solicitud**: incluso en el flujo ágil individual, hay que invitar a un mínimo de personas (por defecto, 5) antes de poder enviar la solicitud. Esto evita que alguien pida feedback a una sola persona y el anonimato se vuelva trivial por descarte.
- **Mínimo de respuestas para desbloquear la visualización**: el feedback (agregado o en conjunto) no se muestra a quien lo solicitó hasta que se alcanza un mínimo de respuestas recibidas (por defecto, 3). Por debajo de ese umbral, la plataforma muestra "esperando más respuestas" en lugar del contenido.

Ambos valores son parametrizables (por la plataforma como configuración global, y potencialmente ajustables por empresa dentro de un rango). Es importante fijar un **suelo de seguridad no configurable** (por ejemplo, nunca menos de 3 respuestas) para que ninguna empresa pueda debilitar el anonimato bajando el parámetro a un nivel que lo haga reversible, incluso si lo pidiera un cliente.

Además, a nivel técnico:

- Las tablas de "quién fue invitado a dar feedback" y "qué feedback se recibió" están desacopladas mediante un token de un solo uso que se invalida tras el envío.
- No se almacenan metadatos que permitan re-identificar a alguien indirectamente (IP, user-agent, timestamps exactos y correlacionables).
- Las métricas agregadas de empresa aplican su propio umbral de agregación mínima (k-anonimity) antes de mostrarse — si un equipo es demasiado pequeño, se oculta esa vista.

## 7. Marco de competencias

- La plataforma define un **marco de competencias único**, curado y mantenido en exclusiva por el Admin general de plataforma (ABM completo, sección 2). *(Pendiente de implementar — sustituye a la idea anterior de que cada empresa definía sus propias "competencias clave"; las empresas ya no lo hacen, usan siempre el marco único de la plataforma. Revisar también secciones 11 y 14, que todavía reflejan el modelo antiguo.)*
- Una competencia **no se puede eliminar** si tiene preguntas de cuestionario asociadas, para no romper el histórico de feedback ya clasificado contra ella.
- El motor de análisis clasifica el feedback recibido (texto y encuesta) contra este marco único.
- Este marco de competencias es **interno de la plataforma**: aunque una plantilla esté asignada a una empresa concreta (sección 5), cada pregunta de escala sigue etiquetada contra este mismo marco compartido. Es lo que hace posibles el mapa de competencias global y los futuros percentiles comparables entre departamentos y entre empresas (sección 10). Las preguntas abiertas quedan fuera de este etiquetado directo — su clasificación por competencia la hace el motor de análisis (sección 8), no una etiqueta fija por pregunta; las preguntas de escala, en cambio, requieren competencia obligatoriamente.

**Agrupación interna de competencias — borrador de trabajo, no cerrado:** internamente, las competencias del marco se organizan en tres dominios inspirados en los tres principios de las organizaciones "teal" de Frederic Laloux (*Reinventar las organizaciones*). Es una estructura de análisis, **no se expone con este lenguaje al usuario final** — la empresa/empleado ve las preguntas y resultados sin referencias a "teal" ni a Laloux.

- **Propósito evolutivo**: visión y propósito, toma de decisiones, estrategia, orientación a resultados, visión sistémica, ecología. *Ecología* se entiende como dos ideas relacionadas: uso responsable de recursos (minimizar desperdicio de tiempo/materiales/esfuerzo) y coherencia entre el trabajo diario de la persona y el impacto que la organización dice querer generar.
- **Equipos autoorganizados**: coaching, mentoring, colaboración, trabajo en equipo, inteligencia interpersonal.
- **Autenticidad / plenitud**: valores, autenticidad, coraje (valentía), gestión emocional.

Nombres y alcance exacto de cada competencia quedan pendientes de afinar — esto es un borrador para poder construir algo tangible, no una lista cerrada.

**Visión de producto (por qué esta estructura):** Brújula es deliberadamente **humanista, no técnica** — no mide desempeño ni skills técnicos. En términos de los cuadrantes de Ken Wilber: el feedback individual entre compañeros vive en el terreno subjetivo/individual (cuadrante 1) — la experiencia de cada persona. Los informes agregados por departamento/empresa permiten leer patrones de cultura compartida (cuadrante 3) — el clima de la organización. El feedback alimenta el cuadrante 1; los informes, el cuadrante 3.

## 8. Motor de análisis e insights

El feedback se procesa de forma asíncrona, no en el momento del envío, mediante un modelo de lenguaje (Claude vía API), que:

- Clasifica el contenido contra el marco de competencias vigente (sección 7).
- Detecta patrones recurrentes a lo largo del tiempo y del volumen de feedback recibido, no feedback aislado.
- Genera insights progresivos para el empleado: espera señal suficiente (varias respuestas apuntando en la misma dirección) antes de mostrar una recomendación.
- A nivel agregado de empresa, identifica tendencias por competencia (por ejemplo, "colaboración" puntuando bajo de forma consistente en un departamento), lo que permite a RRHH orientar decisiones como priorizar formación en trabajo en equipo para esa área.

## 9. Visualización de resultados

- **Empleado**: gráfico de araña (radar chart) con sus competencias evaluadas, mostrando visualmente fortalezas y áreas de mejora de un vistazo, actualizado a medida que llega feedback suficiente para cada competencia (respetando el umbral de la sección 6).
- **Empresa**: vistas agregadas por equipo/departamento sobre las mismas competencias, para detectar patrones de clima o necesidades de desarrollo colectivas.

## 10. Métricas comparativas y benchmarking (percentiles)

Idea marcada explícitamente para desarrollar con más detalle en una fase posterior, pero que queremos dejar recogida desde ya porque es una oportunidad de valor diferencial: que el empleado pueda ver, para cada competencia, cómo se sitúa respecto a la media de su empresa y respecto a la media global de todas las empresas que usan la plataforma (percentiles).

Esto añade una capa de complejidad que conviene abordar con cuidado antes de construirla:

- Requiere agregar datos **entre empresas** (no solo dentro de una empresa), lo que implica diseñar el pool de benchmarking global de forma que ninguna empresa pequeña sea identificable a partir de su posición relativa en ese agregado (mismo principio de umbral mínimo que en la sección 6, aplicado ahora a nivel de "empresas participantes en el cálculo", no solo de personas).
- Hay que decidir si el benchmarking global es opt-in por empresa (algunas organizaciones podrían no querer que sus datos agregados, aunque anonimizados, alimenten comparativas de mercado) o viene incluido por defecto en el servicio.
- Probablemente no forma parte del MVP (ver sección 13), pero el modelo de datos del MVP debería dejar hueco para incorporarlo sin fricción (por ejemplo, guardando resultados de competencia de forma que sea sencillo recalcular percentiles después).

## 11. Qué ve cada rol

> **Nota:** tabla pendiente de ampliar con columnas para Admin general y Jefe cuando se implemente el modelo de 4 roles de la sección 2. "Admin de empresa" de esta tabla equivale al rol Supervisor.

| Vista | Empleado | Supervisor (RRHH empresa) |
|---|---|---|
| Feedback recibido (texto/encuesta) | Sí, sin saber quién lo envió, solo si se supera el umbral mínimo | No |
| Gráfico de araña de competencias propio | Sí | No |
| Comparativa vs. media de empresa / media global | Sí (fase posterior) | No |
| Métricas agregadas por equipo/departamento | No | Sí, con umbral mínimo aplicado |
| Definición de competencias del marco | No | No — exclusivo del Admin general (sección 7) |
| Estado de ciclos 360 (progreso de participación, sin contenido) | — | Sí |
| Gestión de usuarios (de su empresa) | No | Sí |
| Gestión de empresas y facturación | No | No — exclusivo del Admin general |

## 12. Modelo de datos (entidades principales, alto nivel)

- `companies` — tenant, plan, estado de facturación.
- `employees` — pertenece a una company, rol, equipo/departamento; estado `invitado` (solo email, todavía sin cuenta) o `activo` (completó su alta). Dado de alta por RRHH (sección 4.3), nunca se autorregistra.
- `feedback_cycles` — ciclos estructurados 360 (fechas, configuración).
- `feedback_requests` — una petición de feedback (ágil o de ciclo), hecha por un empleado.
- `feedback_invitations` — a quién se invitó a responder una `feedback_request`, con categoría del evaluador (jefe/equipo/empresa/otros) y token de un solo uso; desacoplada de `feedback_responses` a propósito (sección 6). El invitado puede ser un `employee` (`invitee_employee_id`) o, solo en la categoría "otros" del ciclo 360, alguien externo sin cuenta (`invitee_email`, sección 4.1).
- `feedback_responses` — contenido recibido, desacoplado de `feedback_requests` tras el envío; una respuesta por pregunta de la plantilla (no un único bloque de texto), ver sección 5.
- `survey_templates` / `survey_questions` — plantillas de preguntas, cada pregunta con un tipo (`abierta`, `escala` u `opción múltiple`); la plataforma siembra una plantilla por defecto de preguntas abiertas para el flujo ágil (sección 5.1).
- `competency_frameworks` — marco por defecto de la plataforma.
- `company_competencies` — competencias propias definidas por cada empresa.
- `insights` — resultados del motor de análisis, asociados al empleado receptor, nunca al emisor.
- `competency_scores` — puntuación acumulada por empleado y competencia, base del gráfico de araña y de futuros percentiles.
- `aggregate_metrics` — agregados por equipo/departamento, con umbral de k-anonimity aplicado antes de persistir.
- `platform_settings` — umbrales configurables (mínimo de invitados, mínimo de respuestas) y sus suelos de seguridad.
- `groups` (pendiente, sección 2) — agrupaciones de usuarios dentro de una empresa, gestionadas por el Supervisor o el Admin general; alcance exacto por definir.
- Alta de `employees` también podrá darse por coincidencia de dominio de email con la empresa, si el registro ya existe como `inactivo` precargado (secciones 2 y 4.3) — pendiente de implementar.

## 13. Arquitectura técnica propuesta (piloto en infraestructura gratuita/muy bajo coste)

Para el piloto priorizamos velocidad de construcción y coste cero o casi cero, pero eligiendo piezas que no obliguen a reescribir nada cuando haya que escalar de verdad:

- **Frontend + backend**: Next.js (React), desplegable en infraestructura serverless.
- **Base de datos**: PostgreSQL gestionado vía **Supabase**, no MySQL. El motivo es directo: el requisito de anonimato fuerte (sección 6) se apoya en Row-Level Security a nivel de base de datos, algo que Postgres soporta de forma nativa y MySQL no ofrece de forma equivalente. Usar Postgres desde el piloto evita tener que migrar el modelo de seguridad más adelante. El plan gratuito de Supabase da 500 MB de base de datos y hasta 2 proyectos activos — de sobra para un piloto con un puñado de pymes. Ojo: un proyecto gratuito se pausa tras una semana de inactividad, así que conviene tenerlo presente si el pilotaje tiene periodos muertos (se reactiva fácilmente, pero conviene saberlo).
- **Envío de invitaciones por email**: Resend, plan gratuito (3.000 emails/mes, 100/día), más que suficiente para el volumen de un piloto.
- **Procesamiento asíncrono**: cola de trabajos ligera para el análisis vía LLM, separada del asistente de redacción (que necesita respuesta más inmediata mientras el usuario escribe).
- **Autenticación**: email + contraseña o magic link.
- **Hosting**: Vercel, decisión final. Empezamos en el plan gratuito (Hobby) mientras el desarrollo es interno — nadie ajeno usando la app todavía. En el momento en que una empresa piloto real (aunque sea la primera, aunque sea gratis para ellos) empiece a usarla, pasamos a Vercel Pro (20 $/mes), porque el plan Hobby restringe su uso a proyectos no comerciales y ese salto de "interno" a "primer usuario externo" es justo la línea que lo activa, no el éxito o volumen del piloto. Vercel se elige con confianza: acaba de cerrar una ronda Serie F de 300M$ (más 300M$ adicionales en recompra de acciones) con una valoración de 9.300M$, respaldada por Accel y GIC, y Next.js superó los 500 millones de descargas en el último año — perfil de empresa en crecimiento sólido, no de plataforma en riesgo de desaparecer a corto/medio plazo. Como salvaguarda adicional, Next.js es open source y el código no queda atrapado en Vercel: una migración a otra plataforma, si hiciera falta algún día, sería cuestión de días, no una reconstrucción.
- **Observabilidad desde el día 1**: logging y métricas de uso por tenant, aunque sea básico en el piloto.

## 14. Alcance del MVP (v1)

Nicho inicial: pymes. Idioma de la interfaz: español únicamente en esta fase (inglés queda para más adelante, cuando haya demanda).

Una consecuencia directa de apuntar a pymes que conviene tener presente: los umbrales de anonimato de la sección 6 (mínimo 5 invitados, mínimo 3 respuestas para ver algo) pueden ser más difíciles de alcanzar en equipos pequeños, que es justo el tipo de equipo habitual en una pyme. No se trata de bajar el umbral — bajarlo compromete el anonimato — sino de diseñar la experiencia para que el empleado de una empresa pequeña entienda desde el principio que necesita reunir un grupo mínimo de compañeros (puede incluir a gente de fuera de su equipo directo, gracias a la categoría "compañeros de empresa") antes de poder ver resultados, en vez de encontrarse con un muro sin explicación.

Incluido:
- Alta de empresa y empleados (alta de empleados uno a uno por RRHH, con invitación por email; ver sección 4.3).
- Flujo ágil de solicitud de feedback (texto libre con asistente de redacción básico + encuesta corta).
- Un ciclo estructurado 360 simple, con categorización de evaluadores (jefe/equipo/empresa/otros).
- Umbrales parametrizables de invitados mínimos y respuestas mínimas (secc. 6), con valores por defecto 5 y 3.
- Marco de competencias único de la plataforma, con ABM completo exclusivo del Admin general (sección 7); las empresas ya no definen competencias propias.
- Motor de análisis básico: clasificación por competencia + insights progresivos simples.
- Gráfico de araña de competencias para el empleado.
- Dashboard de empresa con métricas agregadas mínimas por competencia/equipo.

Fuera del MVP (fases posteriores):
- Benchmarking entre empresas y percentiles globales (sección 10).
- SSO corporativo.
- Integraciones con calendario/Slack/Teams.
- App móvil nativa.
- Rol de manager con visibilidad intermedia — pasa a llamarse "Jefe" en el modelo de roles de la sección 2; alcance y visibilidad exactos todavía por definir en detalle.
- Desglose de insights por categoría de evaluador (jefe/equipo/empresa/otros).
- Carga masiva de empleados por archivo (CSV) — en el MVP el alta es uno a uno (sección 4.3). *(Nota: el modelo de roles de la sección 2 ya contempla alta masiva entre las capacidades del Admin general — pendiente decidir si entra en el alcance del piloto o se relega a fase posterior.)*
- Grupos de usuarios y Admin general de plataforma como panel construido (sección 2) — de momento son decisiones de diseño, no código.
- **Enviar reconocimiento**: función para que un usuario reconozca/valide una skill de otro usuario del sistema (menú de rol Usuario, sección 2). Idea nueva, todavía sin diseñar — queda registrada como futura función, no entra en el piloto actual.

## 15. Preguntas abiertas a validar antes de construir

- ¿El feedback del ciclo 360 debería tener alguna excepción de anonimato para el jefe directo, o se mantiene el anonimato fuerte también ahí?
- ¿El benchmarking global (sección 10) es algo que ofreceremos como opt-in por empresa, o vendrá incluido por defecto?
- ¿Habrá un plan gratuito/trial para las primeras empresas pequeñas, o se cobra desde el primer cliente?
- ¿El feedback ágil/individual debe contribuir algo (aunque sea con menor peso) a las métricas agregadas de empresa, o queda completamente fuera de esas métricas como herramienta puramente personal?
- ¿El rol "Jefe" pasa a ser un rol propio en el modelo de datos, o se mantiene como el atributo `is_manager` ya existente?
- ¿Qué son exactamente los "grupos" del Admin general/Supervisor — equivalen a los `departments` ya existentes, o es un concepto nuevo y distinto que convive con ellos?
- ¿La agrupación de competencias en los tres dominios inspirados en Laloux (sección 7) es solo una estructura interna de análisis, o en algún momento se expone al usuario (por ejemplo, en los informes agregados de empresa)?
- ¿La alta masiva de usuarios (sección 2/4.3) entra en el alcance del piloto actual o se relega a fase posterior?

## 16. Extensibilidad a otros verticales (visión a futuro)

El caso de uso de partida es B2B con empresas (pymes), pero el núcleo del producto — pedir feedback entre iguales, mantenerlo anónimo con umbrales seguros, destilarlo en un mapa de competencias — no es exclusivo del mundo laboral. Un ejemplo concreto que vale la pena dejar anotado: universidades, donde un alumno podría pedir feedback de compañeros de clase o de proyecto para crecer, de la misma forma que un empleado lo pide de sus compañeros de trabajo. No es una idea original en sí (el peer feedback en educación existe desde hace tiempo), lo valioso aquí es que la arquitectura de Brújula no tenga que rehacerse para servir a un vertical distinto.

Esto no cambia nada del MVP ni de las decisiones ya tomadas, pero sí conviene tenerlo en mente en un punto muy concreto y barato de aplicar ahora: usar en el modelo de datos y en el código nombres neutros donde no cueste nada hacerlo (por ejemplo, pensar en `organizations` en vez de asumir siempre "empresa", y en `members` en vez de asumir siempre "empleado" en las partes internas del sistema), aunque de cara al usuario pyme la interfaz siga hablando en su idioma natural ("tu empresa", "tus compañeros"). Es una decisión de bajo coste que evita un futuro trabajo de renombrado si en algún momento se decide abrir un vertical educativo u otro distinto, sin que suponga ninguna complejidad añadida para el piloto actual.
