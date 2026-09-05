# Brújula — Especificación de producto

*Herramienta de feedback anónimo para empleados. v0.7 — se añaden los primeros informes reales de competencias: por solicitud ágil "por competencias" (con percentil de empresa y percentil global), agregado por empleado ("Mi mapa de competencias", junta todo su feedback ya revelado) y agregado de toda la empresa (solo Supervisor); el ciclo 360 muestra un comparativo autoevaluación vs. media de los demás; se añade un tipo de pregunta experimental "por competencias" (quien responde elige la competencia y da nota + texto); el Supervisor ya no puede ser invitado a dar feedback (ni en el flujo ágil ni en el 360); se puede editar los evaluadores y su categoría de un ciclo 360 ya organizado, igual que ya se podía en una solicitud ágil; nuevo panel para el Supervisor con el estado (no iniciado / en progreso / completado) de cada participante de sus ciclos 360. Ver notas "Implementado" / "Pendiente de implementar" en cada sección, y la sección 17 para el backlog consolidado.*

## 1. Resumen ejecutivo

Producto B2B SaaS que las empresas contratan para sus empleados. Cada empleado puede solicitar feedback de su trabajo o de reuniones concretas, a través de dos vías — un ciclo estructurado tipo 360 y un flujo ágil espontáneo — y recibirlo en dos formatos, texto libre o encuesta corta. El feedback es anónimo de forma fuerte: ni el propio empleado ni la empresa pueden saber quién dio una respuesta concreta. Con el tiempo, un motor de análisis va destilando ese feedback disperso en áreas de mejora recurrentes, visualizadas como un mapa de competencias, que se muestran progresivamente al empleado — incluyendo cómo se sitúa frente a la media de su empresa y frente a la media global de la plataforma. La empresa, por su parte, solo accede a métricas agregadas de clima y competencias por equipo, nunca al detalle individual, y puede usar esas métricas para orientar decisiones como qué formación priorizar.

El reto central del producto no es tanto la interfaz como la arquitectura de confianza: el anonimato tiene que sostenerse incluso frente a quien administra la base de datos.

## 2. Usuarios y roles

- **Admin general** (rol de plataforma, el proveedor — vosotros): no pertenece a ninguna empresa, identificado por email en una lista de administradores de plataforma (`platform_admins`). Tiene alta/baja/modificación (ABM) transversal sobre:
  - Empresas — **implementado**: crear, listar y renombrar desde `/admin`. Falta desactivar/eliminar.
  - Usuarios de cualquier empresa — **parcialmente implementado**: puede elegir una empresa y ver sus empleados (`/admin/empresas/[id]`, solo lectura). Crear/modificar empleados de una empresa elegida es *pendiente de implementar* — reutilizará la misma función que ya usa el Supervisor (`invite_member`), incluida la carga masiva por fichero cuando se construya (ver sección 17).
  - Plantillas de cuestionarios — preguntas abiertas y de escala (secciones 5.1/5.2) — *pendiente de implementar*; hoy nadie puede crear cuestionarios propios (ver nota de la sección 5.1).
  - Competencias del marco interno de la plataforma (sección 7) — el catálogo ya está poblado (3 principios, 14 competencias); el panel de ABM para gestionarlo desde `/admin` (crear/editar/proteger de borrado si tiene preguntas asociadas) es *pendiente de implementar*.
  - **No** crea ni gestiona ciclos 360 — eso es siempre responsabilidad de la empresa (rol Supervisor).
- **Supervisor** (RRHH de la empresa — es el rol antes descrito aquí como "Admin de empresa"): configura y lanza ciclos 360 (seleccionando explícitamente quién participa en cada uno), ve métricas agregadas de su empresa. No ve feedback individual. No define competencias propias ni cuestionarios propios (eso pasa a ser exclusivo del Admin general). **Implementado como una capacidad (`is_supervisor`) sobre un miembro normal, no como un rol excluyente** — así la misma persona puede ser Supervisor y Usuario participante a la vez (pide su propio feedback, hace su propia 360), con una sola cuenta. Un Supervisor por empresa por ahora (impuesto a nivel de base de datos); si se necesita un equipo de varios Supervisores por empresa, queda para más adelante.
  - Usuarios de su empresa: **crear implementado** (invitación uno a uno); **modificar y eliminar (dar de baja) son *pendientes de implementar*** — hoy solo se puede invitar, no editar ni desactivar a alguien ya invitado/activo.
  - Ciclo 360: crear y seleccionar participantes **implementado**; cambiar la fecha de fin de un ciclo ya lanzado y enviar recordatorios (reminders) son *pendientes de implementar* (los reminders además dependen de tener el envío de email automático resuelto, ver sección 13).
- **Empleado**: solicita feedback, responde encuestas/feedback de otros, ve sus propios insights, su gráfico de competencias y sus comparativas. **No existe un rol "Jefe" ni ninguna distinción de rol interno de la organización para pedir o responder feedback** — cualquier empleado puede pedir feedback independientemente de su posición; el antiguo flag `is_manager` y la distinción de preguntas "solo responsable" del ciclo 360 se eliminan, todas las preguntas del 360 se hacen a cualquier persona evaluada por igual (ver sección 4.1 y 17).

**"Grupos" = `departments`, resuelto:** no es un concepto nuevo — son la misma tabla de departamentos que ya existe, usada también para agrupar participantes de cara al ciclo 360. El nombre exacto del campo no importa mientras cumpla esa función.

**Alta de usuarios:** por invitación uno a uno (sección 4.3, ya implementado) o por auto-registro cuando el email coincide con el dominio de la empresa (por ejemplo, `pepe@empresa.com` para la empresa `empresa.com`) — **solo** si ese usuario ya existía previamente como registro `inactivo` en la base de datos, precargado por un Supervisor o el Admin general. El dominio por sí solo nunca da acceso a alguien no precargado. *(Pendiente de implementar.)*

> **Implementado:** el alta de empresa ya no es autoservicio público — `/signup` se retiró. El Admin general (identificado por su email en la tabla `platform_admins`) da de alta empresas nuevas desde `/admin`, que queda como Supervisor invitado de esa empresa hasta que completa su alta. Desde fuera de la app solo quedan dos puertas: iniciar sesión o entrar por invitación.

> **Pendiente de implementar:** ver sección 17 (backlog) para el listado consolidado.

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

**Nota:** "Jefe / responsable directo" aquí es solo una etiqueta de relación que el empleado elige libremente al organizar sus evaluadores — no depende de que esa persona tenga ningún rol especial en el sistema. No existe un rol "Jefe" en el modelo de usuarios (sección 2); cualquier empleado puede ser categorizado así por otro, sea cual sea su posición real.

**Quién puede ser invitado:** para las categorías jefe/equipo/empresa, el evaluador tiene que ser ya un empleado dado de alta en la organización (ver sección "Alta de empleados" más abajo). La categoría "Otros" es la excepción: puede incluir a alguien externo a la organización, que no llega a ser miembro de la plataforma — le basta su email y el token de invitación de esa solicitud concreta para responder, sin necesidad de crear cuenta ni iniciar sesión.

**Un empleado, un ciclo abierto a la vez:** la empresa sí puede tener varios ciclos 360 simultáneos (por ejemplo, uno con un grupo de empleados ahora y otro distinto con otro grupo dentro de un mes, aunque el primero no haya cerrado todavía) — lo que no puede pasar es que un mismo empleado quede metido en dos ciclos abiertos a la vez. Al crear un ciclo, se rechaza si alguno de los participantes elegidos ya está en otro ciclo de la misma empresa que todavía no ha cerrado (implementado, migración 0023).

**El Supervisor no puede ser invitado como evaluador** (implementado, migración 0032): puede seguir siendo *participante* de un ciclo (recibir su propia evaluación 360), pero no aparece como opción al elegir a quién se pide feedback — ni en el ciclo 360 ni en el flujo ágil (sección 4.2). Se refuerza tanto en la interfaz como dentro de las funciones RPC correspondientes, para que no dependa solo de lo que la interfaz permita seleccionar.

**Editar evaluadores de un ciclo ya organizado** (implementado, migración 0034): mientras nadie haya respondido todavía, un participante puede volver a entrar y cambiar tanto a quién eligió como evaluador como su categoría — igual que ya funcionaba para una solicitud ágil (sección 4.2). En cuanto hay alguna respuesta, deja de poder modificarse.

**Panel de estado para el Supervisor** (implementado, migración 0035): desde `/dashboard/cycles`, el Supervisor ve la lista de sus ciclos 360 y, al entrar en uno, el estado de cada participante — *no iniciado* (no ha organizado sus evaluadores todavía), *en progreso* (los organizó, faltan respuestas) o *completado* (respondieron todos, o ya venció el ciclo) — sin ver contenido alguno, solo el estado de avance.

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

**Tipo de pregunta "por competencias" (implementado, migración 0026 — experimental):** un cuarto tipo de pregunta, además de abierta/escala/opción múltiple, pensado para el flujo ágil. Quien responde elige entre 1 y un máximo configurable (por pregunta, `max_selections`) de competencias del marco, y por cada una elegida da un valor de 1 a 5 **y** un comentario libre — a diferencia de la escala (competencia fija por pregunta) o la abierta (sin competencia, clasificada después por IA), aquí es la propia persona quien etiqueta la competencia a mano. Se añadió como una opción más, sin sustituir ninguna de las anteriores — queda pendiente decidir cuál de todos los tipos se usa finalmente en producción. Existe una plantilla ágil de prueba, `ad_hoc_competencias` ("Feedback por competencias"), con 3 preguntas de este tipo.

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

- La plataforma define un **marco de competencias único**, curado y mantenido en exclusiva por el Admin general de plataforma. **Implementado como catálogo de datos** (tablas `competency_principles` y `competency_frameworks`, sección 12); el panel de ABM para editarlo desde `/admin` sigue *pendiente de implementar* (sección 17).
- Una competencia **no se puede eliminar** si tiene preguntas de cuestionario asociadas, para no romper el histórico de feedback ya clasificado contra ella. *(Pendiente de implementar como restricción activa — hoy no hay ABM desde el que intentar borrar una.)*
- El motor de análisis clasifica el feedback recibido (texto y encuesta) contra este marco único. *(Pendiente, sección 8.)*
- Este marco de competencias es **interno de la plataforma**: aunque una plantilla esté asignada a una empresa concreta (sección 5), cada pregunta de escala sigue etiquetada contra este mismo marco compartido. Es lo que hace posibles el mapa de competencias global y los futuros percentiles comparables entre departamentos y entre empresas (sección 10). Las preguntas abiertas quedan fuera de este etiquetado directo — su clasificación por competencia la hace el motor de análisis (sección 8), no una etiqueta fija por pregunta; las preguntas de escala, en cambio, requieren competencia obligatoriamente.

**Arquitectura de tres niveles — implementada** (migración 0021, a partir del documento de trabajo "Mapa Competencias"):

1. **Principio** (tabla `competency_principles`): los tres principios de las organizaciones "teal" de Frederic Laloux (*Reinventar las organizaciones*) — Propósito evolutivo, Equipo autoorganizado, Plenitud. Interno de la plataforma, **no se expone con este lenguaje al usuario final**.
2. **Competencia** (tabla `competency_frameworks`, con `principle_id`): 14 competencias en total.
   - *Propósito evolutivo* (6): visión y propósito, toma de decisiones, orientación a resultados, visión sistémica, ecología, aprendizaje/curiosidad.
   - *Equipo autoorganizado* (4): coaching, mentoring, colaboración, inteligencia interpersonal.
   - *Plenitud* (4): valores, autenticidad, coraje, gestión emocional.
3. **Pregunta**: cada competencia tiene **dos preguntas de escala** que la miden, redactadas como comportamiento observable (ej. "Tiene claro para qué existe su trabajo, más allá de la tarea concreta que hace cada día"). Son las 28 preguntas de escala de la plantilla base del ciclo 360 (`default_360_cycle`), sustituyendo a las 21 anteriores (heredadas del cuestionario original de Zetes, migración 0006). Ciclos ya creados antes de esta migración conservan su propia copia de plantilla, sin verse afectados (sección 5.2).

Nombres y alcance exacto de cada competencia quedan pendientes de afinar más adelante si hace falta — esto ya no es un borrador sin desarrollar, pero tampoco se considera definitivamente cerrado.

**Visión de producto (por qué esta estructura):** Brújula es deliberadamente **humanista, no técnica** — no mide desempeño ni skills técnicos. En términos de los cuadrantes de Ken Wilber: el feedback individual entre compañeros vive en el terreno subjetivo/individual (cuadrante 1) — la experiencia de cada persona. Los informes agregados por departamento/empresa permiten leer patrones de cultura compartida (cuadrante 3) — el clima de la organización. El feedback alimenta el cuadrante 1; los informes, el cuadrante 3.

**Informes y percentiles (conecta con sección 10) — parcialmente implementado:**

- El informe de una solicitud ágil "por competencias" (sección 5.2) muestra, por competencia: nota media, y **dos percentiles** — uno calculado solo contra solicitudes de la misma empresa, otro contra todas las solicitudes de la plataforma (migraciones 0027/0031). No se muestran respuestas individuales ni el texto libre (se reserva para una futura integración con IA). Con el volumen de datos todavía bajo, el percentil es poco fiable a propósito hoy — se prefirió tener el mecanismo ya construido a esperar a tener masa crítica.
- **"Mi mapa de competencias"** (implementado, migración 0028): un radar agregado por empleado, juntando *todo* el feedback ya revelado que ha recibido (flujo ágil + ciclos 360, sin autoevaluación), con nota media por competencia y por dimensión — sin percentil todavía, solo la media.
- **Mapa de competencias de la empresa** (implementado, migración 0030): el mismo radar pero agregando a todos los empleados de la organización, visible solo para el Supervisor.
- **Comparativo del ciclo 360** (implementado, migración 0029): el informe de una solicitud de ciclo muestra un radar con dos series — la autoevaluación del empleado y la media de los demás — pero todavía en **nota** (1-5), no en percentil. Pasarlo a percentil es un cambio identificado pero no construido: haría falta una función que calcule el percentil de la autoevaluación y de la media de los demás (en vez de la nota directa) y generalizar el componente de radar para que acepte una escala 0-100 en vez de 1-5; ningún cambio de esquema de base de datos hace falta.
- El diseño de fondo sigue siendo el original: los percentiles deberían poder calcularse **con los datos de empleados de todas las empresas de la plataforma juntos**, no solo dentro de la propia empresa — un pool de comparación global, no aislado por tenant (lo que hoy existe para el informe "por competencias" ya sigue este principio, calculando el percentil global además del de empresa). Esto requiere el mismo cuidado de anonimato de la sección 10 (umbral mínimo de empresas participantes para que ninguna quede identificable por su posición relativa) — todavía no aplicado, ver sección 10.

## 8. Motor de análisis e insights

El feedback se procesa de forma asíncrona, no en el momento del envío, mediante un modelo de lenguaje (Claude vía API), que:

- Clasifica el contenido contra el marco de competencias vigente (sección 7).
- Detecta patrones recurrentes a lo largo del tiempo y del volumen de feedback recibido, no feedback aislado.
- Genera insights progresivos para el empleado: espera señal suficiente (varias respuestas apuntando en la misma dirección) antes de mostrar una recomendación.
- A nivel agregado de empresa, identifica tendencias por competencia (por ejemplo, "colaboración" puntuando bajo de forma consistente en un departamento), lo que permite a RRHH orientar decisiones como priorizar formación en trabajo en equipo para esa área.

## 9. Visualización de resultados

- **Empleado — implementado**: gráfico de araña (radar chart, SVG hecho a mano, sin librería) con las 14 competencias agrupadas por color según su dimensión (Propósito evolutivo / Equipo autoorganizado / Plenitud), en "Mi mapa de competencias" (sección 7) — agregado de todo el feedback ya revelado, actualizado a medida que llega feedback suficiente para cada competencia (respetando el umbral de la sección 6). En el informe de un ciclo 360 concreto, el mismo radar compara la autoevaluación (en negro) contra la media de los demás (color por dimensión).
- **Empresa — implementado**: el Supervisor ve el mismo tipo de radar pero agregando a todos los empleados de la organización ("Mapa de competencias de la empresa", sección 7). Vistas agregadas por equipo/departamento (no solo por toda la empresa junta) siguen *pendientes de implementar*.

## 10. Métricas comparativas y benchmarking (percentiles)

**Parcialmente implementado** (sección 7): el informe de una solicitud ágil "por competencias" ya muestra, para cada competencia, un percentil de empresa y un percentil global — calculados comparando la nota media de esa solicitud contra la de todas las demás solicitudes (de la misma empresa, o de toda la plataforma) que puntuaron esa competencia. Es una primera versión funcional de la idea de esta sección, no todavía el diseño completo — sigue sin aplicarse ni al mapa agregado por empleado/empresa (solo nota media, sin percentil) ni al comparativo del ciclo 360 (autoevaluación vs. media, también solo en nota).

Esto añade una capa de complejidad que conviene abordar con cuidado antes de construirla del todo:

- Requiere agregar datos **entre empresas** (no solo dentro de una empresa), lo que implica diseñar el pool de benchmarking global de forma que ninguna empresa pequeña sea identificable a partir de su posición relativa en ese agregado (mismo principio de umbral mínimo que en la sección 6, aplicado ahora a nivel de "empresas participantes en el cálculo", no solo de personas). **El percentil global ya implementado (sección 7) todavía no aplica este umbral** — con pocas empresas en la plataforma, es un riesgo real, no solo teórico, y conviene resolverlo antes de tener clientes reales usándolo.
- Hay que decidir si el benchmarking global es opt-in por empresa (algunas organizaciones podrían no querer que sus datos agregados, aunque anonimizados, alimenten comparativas de mercado) o viene incluido por defecto en el servicio.
- Probablemente no forma parte del MVP (ver sección 13), pero el modelo de datos del MVP debería dejar hueco para incorporarlo sin fricción (por ejemplo, guardando resultados de competencia de forma que sea sencillo recalcular percentiles después).

## 11. Qué ve cada rol

> **Nota:** tabla pendiente de ampliar con una columna para Admin general. "Admin de empresa" de esta tabla equivale al rol Supervisor.

| Vista | Empleado | Supervisor (RRHH empresa) |
|---|---|---|
| Feedback recibido (texto/encuesta) | Sí, sin saber quién lo envió, solo si se supera el umbral mínimo | No |
| Gráfico de araña de competencias propio ("Mi mapa de competencias") | Sí | No |
| Percentil de empresa / percentil global (informe "por competencias") | Sí | No |
| Comparativa autoevaluación vs. media de los demás (ciclo 360) | Sí, en nota — percentil pendiente (sección 7/10) | No |
| Mapa de competencias agregado de toda la empresa | No | Sí |
| Métricas agregadas por equipo/departamento | No | *Pendiente de implementar* (hoy solo existe agregado de toda la empresa junta, sección 9) |
| Definición de competencias del marco | No | No — exclusivo del Admin general (sección 7) |
| Estado de ciclos 360 (progreso de participación, sin contenido) | — | Sí, implementado (`/dashboard/cycles`, sección 4.1) |
| Ser invitado a dar feedback (ágil o como evaluador del 360) | — | No, nunca (sección 4.1) |
| Gestión de usuarios (de su empresa) | No | Sí |
| Gestión de empresas y facturación | No | No — exclusivo del Admin general |

## 12. Modelo de datos (entidades principales, alto nivel)

- `organizations` — tenant (empresa cliente). *(Nombre real de la tabla desde el principio — sección 16 explica por qué se evitó "companies".)*
- `members` — pertenece a una organización, rol/capacidades (`is_supervisor`, sección 2), departamento; estado `invited` (solo email, todavía sin cuenta) o `active` (completó su alta). Dado de alta por el Supervisor o el Admin general (sección 4.3), nunca se autorregistra.
- `feedback_cycles` — ciclos estructurados 360 (fechas, configuración, plantilla propia copiada al crear el ciclo).
- `feedback_cycle_participants` — quién fue seleccionado como participante de un ciclo (puede organizar sus propios evaluadores); **implementado** (sección 4.1). Solo el propio participante o el Supervisor (vía función `get_cycle_status`, sección 4.1) pueden verla — no es de lectura libre por RLS.
- `feedback_requests` — una petición de feedback (ágil o de ciclo), hecha por un empleado.
- `feedback_invitations` — a quién se invitó a responder una `feedback_request`, con categoría del evaluador (jefe/equipo/empresa/otros, o `self` para la autoevaluación del ciclo 360) y token de un solo uso; desacoplada de `feedback_responses` a propósito (sección 6). El invitado puede ser un `employee` (`invitee_employee_id`) o, solo en la categoría "otros" del ciclo 360, alguien externo sin cuenta (`invitee_email`, sección 4.1). El propio solicitante sí puede ver a quién invitó (implementado, migración 0033) — lo protegido es quién respondió, no a quién se invitó.
- `feedback_responses` — contenido recibido, desacoplado de `feedback_requests` tras el envío; una respuesta por pregunta de la plantilla (no un único bloque de texto), ver sección 5.
- `survey_templates` / `survey_questions` — plantillas de preguntas, cada pregunta con un tipo (`abierta`, `escala`, `opción múltiple` o, experimental, `por competencias` — sección 5.2, con `max_selections`); la plataforma siembra una plantilla por defecto de preguntas abiertas para el flujo ágil (sección 5.1).
- `competency_principles` — los tres principios (Propósito evolutivo, Equipo autoorganizado, Plenitud); **implementado** (sección 7).
- `competency_frameworks` — las 14 competencias, cada una con `principle_id`; **implementado**. La antigua `org_competencies` (competencias propias por empresa) queda sin usar — las empresas ya no definen las suyas.
- `feedback_answers` — una respuesta por pregunta; para el tipo "por competencias" (sección 5.2) guarda además qué `competency_code` eligió quien respondió, ya que no viene fijado por la pregunta.
- `insights` — resultados del motor de análisis, asociados al empleado receptor, nunca al emisor. *(Pendiente, sección 8.)*
- **No existe una tabla `competency_scores` persistida** — los informes de competencias (sección 7: por solicitud, agregado por empleado, agregado de empresa) se calculan al vuelo con funciones SQL (`security definer`) sobre `feedback_answers`/`feedback_responses`, no sobre una tabla de puntuaciones acumuladas. Funciona bien al volumen actual; si el cálculo se vuelve caro habría que revisar esta decisión.
- `aggregate_metrics` — agregados por equipo/departamento, con umbral de k-anonimity aplicado antes de persistir. *(Pendiente — hoy el único agregado de empresa existente es "toda la empresa junta", sin desglose por equipo, sección 9.)*
- `platform_settings` — umbrales configurables (mínimo de invitados, mínimo de respuestas) y sus suelos de seguridad.
- `platform_admins` — emails con acceso de Admin general de plataforma; **implementado**, sin relación con `members` (el Admin general no pertenece a ninguna empresa).
- "Grupos" — **resuelto**: no es una entidad nueva, es la tabla `departments` ya existente (sección 2).
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
- Marco de competencias único de la plataforma, ya poblado (3 principios, 14 competencias, sección 7); las empresas ya no definen competencias propias. El panel de ABM para editarlo desde `/admin` es *pendiente de implementar* (sección 17) — hoy se edita directamente en la base de datos.
- Motor de análisis básico: clasificación por competencia + insights progresivos simples.
- Gráfico de araña de competencias para el empleado.
- Dashboard de empresa con métricas agregadas mínimas por competencia/equipo.

Fuera del MVP (fases posteriores):
- Benchmarking entre empresas y percentiles globales (sección 10).
- SSO corporativo.
- Integraciones con calendario/Slack/Teams.
- App móvil nativa.
- Desglose de insights por categoría de evaluador (jefe/equipo/empresa/otros) — la categoría en sí ya existe (sección 4.1), lo que queda fuera del MVP es desglosar el análisis por esa categoría.
- Carga masiva de empleados por archivo (CSV) — en el MVP el alta es uno a uno (sección 4.3).
- **Enviar reconocimiento**: función para que un usuario reconozca/valide una skill de otro usuario del sistema (menú de rol Usuario, sección 2). Idea nueva, todavía sin diseñar — queda registrada como futura función, no entra en el piloto actual.

Ver también la sección 17 (backlog) para el listado consolidado de lo que falta construir dentro del alcance ya decidido.

## 15. Preguntas abiertas a validar antes de construir

- ¿El feedback del ciclo 360 debería tener alguna excepción de anonimato para el jefe directo, o se mantiene el anonimato fuerte también ahí?
- El benchmarking global de percentiles (sección 7/10) se calculará con datos de empleados de todas las empresas — ¿alguna empresa podrá excluirse (opt-out) de aportar sus datos a ese pool global, o es obligatorio por diseño para todas?
- ¿Habrá un plan gratuito/trial para las primeras empresas pequeñas, o se cobra desde el primer cliente?
- ¿El feedback ágil/individual debe contribuir algo (aunque sea con menor peso) a las métricas agregadas de empresa, o queda completamente fuera de esas métricas como herramienta puramente personal?

## 16. Extensibilidad a otros verticales (visión a futuro)

El caso de uso de partida es B2B con empresas (pymes), pero el núcleo del producto — pedir feedback entre iguales, mantenerlo anónimo con umbrales seguros, destilarlo en un mapa de competencias — no es exclusivo del mundo laboral. Un ejemplo concreto que vale la pena dejar anotado: universidades, donde un alumno podría pedir feedback de compañeros de clase o de proyecto para crecer, de la misma forma que un empleado lo pide de sus compañeros de trabajo. No es una idea original en sí (el peer feedback en educación existe desde hace tiempo), lo valioso aquí es que la arquitectura de Brújula no tenga que rehacerse para servir a un vertical distinto.

Esto no cambia nada del MVP ni de las decisiones ya tomadas, pero sí conviene tenerlo en mente en un punto muy concreto y barato de aplicar ahora: usar en el modelo de datos y en el código nombres neutros donde no cueste nada hacerlo (por ejemplo, pensar en `organizations` en vez de asumir siempre "empresa", y en `members` en vez de asumir siempre "empleado" en las partes internas del sistema), aunque de cara al usuario pyme la interfaz siga hablando en su idioma natural ("tu empresa", "tus compañeros"). Es una decisión de bajo coste que evita un futuro trabajo de renombrado si en algún momento se decide abrir un vertical educativo u otro distinto, sin que suponga ninguna complejidad añadida para el piloto actual.

## 17. Backlog / Funcionalidades pendientes

Listado consolidado de lo que ya está decidido (dentro del alcance actual, no "fuera del MVP") pero todavía no está construido. Cada punto enlaza a la sección que lo explica con más detalle. Es el sitio para mirar primero antes de preguntar "¿esto ya funciona?".

**Admin general de plataforma** (sección 2):
- ABM de cuestionarios propios y genéricos (5.1/5.2) — hoy nadie puede crear cuestionarios, quedó bloqueado a propósito hasta que exista este panel.
- ABM del marco de competencias desde `/admin` (sección 7) — el catálogo de datos ya existe (14 competencias, 3 principios), pero solo se puede editar entrando directamente en la base de datos, no hay panel.
- Crear/modificar empleados de una empresa elegida, incluida carga masiva por fichero — reutilizará la función que ya tiene el Supervisor (`invite_member`). Hoy `/admin/empresas/[id]` solo permite ver, no gestionar.
- Desactivar o eliminar una empresa ya creada.
- **Percentil global sin umbral mínimo de empresas participantes (sección 10) — pendiente, y es un riesgo real de anonimato, no solo teórico:** ya existe un percentil global (sección 7), pero calculado sin exigir un mínimo de empresas en el pool de comparación. Con pocas empresas en la plataforma, la posición relativa podría llegar a identificar a una empresa pequeña. Conviene resolverlo antes de tener clientes reales usando ese informe.
- Aplicar percentil (en vez de solo nota media) al mapa agregado por empleado, al mapa agregado de empresa, y al comparativo autoevaluación-vs-media del ciclo 360 (sección 7) — hoy el percentil doble (empresa/global) solo existe en el informe de una solicitud ágil "por competencias".
- Motor de análisis y agregación por IA de las respuestas de texto libre del tipo "por competencias" (sección 5.2) — se guardan pero no se muestran todavía.
- Decidir qué tipo de pregunta se usa finalmente en producción — hoy conviven abierta/escala/opción múltiple/"por competencias" (experimental, sección 5.2) sin haberse descartado ninguna.

**Supervisor** (sección 2/4.1):
- Modificar y dar de baja usuarios ya invitados/activos de su empresa — hoy solo se puede invitar.
- Cambiar la fecha de fin de un ciclo 360 ya lanzado.
- Enviar recordatorios (reminders) a quien no ha respondido todavía, incluyéndose a sí mismo — depende de resolver antes el envío de email automático (ver más abajo).
- Informes agregados por equipo/departamento (sección 8/9) — hoy el único agregado de empresa es "toda la empresa junta" (mapa de competencias de empresa, sección 7), sin desglose por equipo todavía.

**Transversal:**
- Auto-registro por dominio de empresa (secciones 2 y 4.3).
- Extender la categorización de evaluador (jefe/equipo/empresa/otros, sección 4.1) al flujo ágil — hoy esa categorización solo existe en el ciclo 360, no en las solicitudes ágiles.
- Envío de email automático (Resend, sección 13) — hoy toda invitación se comparte a mano copiando un link; esto bloquea los reminders del Supervisor y cualquier notificación automática.
- Motor de análisis por IA (sección 8) — clasificación de texto libre por competencia, insights progresivos. Diseñado, no construido.
- Asistente de redacción en el momento de responder feedback (sección 5.1). Diseñado, no construido.
- Carga masiva de empleados por archivo CSV (sección 4.3/14).
- **Enviar reconocimiento** (sección 14) — idea nueva, sin diseñar todavía.
