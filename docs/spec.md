# Brújula — Especificación de producto

*Herramienta de feedback anónimo para empleados. v0.3 — nombre del proyecto añadido, decisión final de hosting (Vercel).*

## 1. Resumen ejecutivo

Producto B2B SaaS que las empresas contratan para sus empleados. Cada empleado puede solicitar feedback de su trabajo o de reuniones concretas, a través de dos vías — un ciclo estructurado tipo 360 y un flujo ágil espontáneo — y recibirlo en dos formatos, texto libre o encuesta corta. El feedback es anónimo de forma fuerte: ni el propio empleado ni la empresa pueden saber quién dio una respuesta concreta. Con el tiempo, un motor de análisis va destilando ese feedback disperso en áreas de mejora recurrentes, visualizadas como un mapa de competencias, que se muestran progresivamente al empleado — incluyendo cómo se sitúa frente a la media de su empresa y frente a la media global de la plataforma. La empresa, por su parte, solo accede a métricas agregadas de clima y competencias por equipo, nunca al detalle individual, y puede usar esas métricas para orientar decisiones como qué formación priorizar.

El reto central del producto no es tanto la interfaz como la arquitectura de confianza: el anonimato tiene que sostenerse incluso frente a quien administra la base de datos.

## 2. Usuarios y roles

- **Empleado**: solicita feedback, responde encuestas/feedback de otros, ve sus propios insights, su gráfico de competencias y sus comparativas.
- **Admin de empresa (RRHH)**: gestiona altas/bajas de empleados, configura ciclos estructurados, define las competencias clave de la organización, ve métricas agregadas. No ve feedback individual.
- **Manager de equipo** (fase futura, no MVP): posible rol intermedio con visibilidad agregada solo de su equipo.
- **Super-admin de plataforma** (vosotros, el proveedor): gestiona altas de empresas clientes, facturación, soporte, y el marco de competencias por defecto de la plataforma.

## 3. Multi-tenancy

Desde el primer día, la aplicación es multi-empresa: cada empresa cliente es un *tenant* aislado. Todo dato relevante cuelga de un `company_id`, y el aislamiento entre tenants se refuerza a nivel de base de datos (Row-Level Security), no solo a nivel de aplicación.

## 4. Los dos flujos de solicitud de feedback

### 4.1 Ciclo estructurado (tipo 360)

Pensado para evaluaciones periódicas (semestrales, por ejemplo). RRHH configura el ciclo: fechas de apertura/cierre, y el cuestionario asociado. Los evaluadores potenciales están categorizados por su relación con el empleado:

- Jefe / responsable directo
- Compañeros de equipo
- Compañeros de la empresa (otros equipos/departamentos)
- Otros (por ejemplo, alguien externo al organigrama habitual pero relevante para el ciclo)

El empleado, dentro del ciclo, puede agrupar y organizar a sus evaluadores según estas categorías y su propio criterio (por ejemplo, para pedir feedback equilibrado entre categorías). Esta categorización se usa también para poder, en el futuro, segmentar insights por tipo de relación (aunque en el MVP el análisis puede tratarse de forma agregada, sin desglose por categoría, para no debilitar el anonimato en categorías con pocas personas).

### 4.2 Flujo ágil / espontáneo

El empleado elige personas concretas (mínimo parametrizable, ver sección 6) y solicita feedback puntual y contextual — por ejemplo, sobre una presentación reciente. Este flujo es, ante todo, una herramienta de progresión individual: alimenta el perfil de competencias del empleado, pero por su naturaleza puntual y de bajo volumen pesa menos (o nada, según se decida) en las métricas agregadas de empresa, que se nutren principalmente del ciclo estructurado.

Ambos flujos alimentan el mismo motor de análisis y el mismo mapa de competencias del empleado.

## 5. Tipos de feedback

### 5.1 Texto libre

Respuesta abierta, con o sin prompt orientativo. Para mejorar la calidad y utilidad del feedback recibido, la plataforma ofrece asistencia a quien lo escribe:

- Sugerencias de redacción para que el feedback sea más claro, concreto y accionable (evitando comentarios vagos o puramente valorativos sin ejemplos).
- Sugerencia de competencias relacionadas con el texto, a modo de etiquetas (por ejemplo, `#comunicación`, `#gestión_del_tiempo`), que la persona que da el feedback puede aceptar, editar o descartar antes de enviar.

Esta asistencia ayuda además al motor de análisis, porque las etiquetas aceptadas por quien da el feedback son una señal adicional (y consentida) para la clasificación por competencias, complementando la clasificación automática por IA sobre el texto.

### 5.2 Encuesta corta

Preguntas cerradas (escala, opción múltiple), definidas por la plataforma o configurables por RRHH en el ciclo estructurado.

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

- La plataforma define un **marco de competencias por defecto** (comunicación, liderazgo, colaboración, gestión del tiempo, etc.), curado inicialmente y ampliable con el tiempo.
- Cada empresa puede definir sus propias **competencias clave**, alineadas con su cultura y propósito colectivo (por ejemplo, una empresa muy orientada a innovación podría añadir "pensamiento creativo" como competencia prioritaria). Estas conviven con el marco por defecto: la empresa puede priorizar o destacar ciertas competencias sin eliminar la base común, lo que permite comparabilidad (ver sección 10) mientras cada organización vela por lo que le importa a nivel colectivo.
- El motor de análisis clasifica el feedback recibido (texto y encuesta) contra este marco combinado (base de la plataforma + competencias propias de la empresa).

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

| Vista | Empleado | Admin de empresa |
|---|---|---|
| Feedback recibido (texto/encuesta) | Sí, sin saber quién lo envió, solo si se supera el umbral mínimo | No |
| Gráfico de araña de competencias propio | Sí | No |
| Comparativa vs. media de empresa / media global | Sí (fase posterior) | No |
| Métricas agregadas por equipo/departamento | No | Sí, con umbral mínimo aplicado |
| Definición de competencias clave de la empresa | No | Sí |
| Estado de ciclos 360 (progreso de participación, sin contenido) | — | Sí |
| Gestión de usuarios y facturación | No | Sí |

## 12. Modelo de datos (entidades principales, alto nivel)

- `companies` — tenant, plan, estado de facturación.
- `employees` — pertenece a una company, rol, equipo/departamento.
- `feedback_cycles` — ciclos estructurados 360 (fechas, configuración).
- `feedback_requests` — invitaciones a dar feedback (ágil o de ciclo), con categoría del evaluador (jefe/equipo/empresa/otros) y token de un solo uso.
- `feedback_responses` — contenido recibido, desacoplado de `feedback_requests` tras el envío.
- `survey_templates` / `survey_questions` — plantillas de encuesta.
- `competency_frameworks` — marco por defecto de la plataforma.
- `company_competencies` — competencias propias definidas por cada empresa.
- `insights` — resultados del motor de análisis, asociados al empleado receptor, nunca al emisor.
- `competency_scores` — puntuación acumulada por empleado y competencia, base del gráfico de araña y de futuros percentiles.
- `aggregate_metrics` — agregados por equipo/departamento, con umbral de k-anonimity aplicado antes de persistir.
- `platform_settings` — umbrales configurables (mínimo de invitados, mínimo de respuestas) y sus suelos de seguridad.

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
- Alta de empresa y empleados.
- Flujo ágil de solicitud de feedback (texto libre con asistente de redacción básico + encuesta corta).
- Un ciclo estructurado 360 simple, con categorización de evaluadores (jefe/equipo/empresa/otros).
- Umbrales parametrizables de invitados mínimos y respuestas mínimas (secc. 6), con valores por defecto 5 y 3.
- Marco de competencias por defecto de la plataforma + posibilidad de que la empresa marque sus competencias clave.
- Motor de análisis básico: clasificación por competencia + insights progresivos simples.
- Gráfico de araña de competencias para el empleado.
- Dashboard de empresa con métricas agregadas mínimas por competencia/equipo.

Fuera del MVP (fases posteriores):
- Benchmarking entre empresas y percentiles globales (sección 10).
- SSO corporativo.
- Integraciones con calendario/Slack/Teams.
- App móvil nativa.
- Rol de manager con visibilidad intermedia.
- Desglose de insights por categoría de evaluador (jefe/equipo/empresa/otros).

## 15. Preguntas abiertas a validar antes de construir

- ¿El feedback del ciclo 360 debería tener alguna excepción de anonimato para el jefe directo, o se mantiene el anonimato fuerte también ahí?
- ¿El benchmarking global (sección 10) es algo que ofreceremos como opt-in por empresa, o vendrá incluido por defecto?
- ¿Habrá un plan gratuito/trial para las primeras empresas pequeñas, o se cobra desde el primer cliente?
- ¿El feedback ágil/individual debe contribuir algo (aunque sea con menor peso) a las métricas agregadas de empresa, o queda completamente fuera de esas métricas como herramienta puramente personal?

## 16. Extensibilidad a otros verticales (visión a futuro)

El caso de uso de partida es B2B con empresas (pymes), pero el núcleo del producto — pedir feedback entre iguales, mantenerlo anónimo con umbrales seguros, destilarlo en un mapa de competencias — no es exclusivo del mundo laboral. Un ejemplo concreto que vale la pena dejar anotado: universidades, donde un alumno podría pedir feedback de compañeros de clase o de proyecto para crecer, de la misma forma que un empleado lo pide de sus compañeros de trabajo. No es una idea original en sí (el peer feedback en educación existe desde hace tiempo), lo valioso aquí es que la arquitectura de Brújula no tenga que rehacerse para servir a un vertical distinto.

Esto no cambia nada del MVP ni de las decisiones ya tomadas, pero sí conviene tenerlo en mente en un punto muy concreto y barato de aplicar ahora: usar en el modelo de datos y en el código nombres neutros donde no cueste nada hacerlo (por ejemplo, pensar en `organizations` en vez de asumir siempre "empresa", y en `members` en vez de asumir siempre "empleado" en las partes internas del sistema), aunque de cara al usuario pyme la interfaz siga hablando en su idioma natural ("tu empresa", "tus compañeros"). Es una decisión de bajo coste que evita un futuro trabajo de renombrado si en algún momento se decide abrir un vertical educativo u otro distinto, sin que suponga ninguna complejidad añadida para el piloto actual.
