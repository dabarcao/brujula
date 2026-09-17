# Notas de la revisión con Claude (David + Claude, sept. 2026)

Este archivo lo escribió Claude (Anthropic), no Oscar. Es el resumen de una
sesión larga probando esta reingeniería en local contra la MISMA base de
datos de producción que usa `dabarcao/brujula` (la app original), con
David como usuario. El objetivo: que la próxima sesión de IA que trabaje
aquí (con esta misma skill cargada) no tenga que redescubrir esto desde
cero. No sustituye a SKILL.md — son notas de campo, no reglas.

## Bugs reales encontrados y corregidos

Por cada uno: qué pasaba, por qué pasaba (lo importante), y dónde se tocó.

- **Radar de competencias se veía sólido, no en escala.** `@keyframes
  brujula-axis-in` (globals.css) tenía `to { opacity: 1 }` con
  `animation-fill-mode: both` — eso pisa CUALQUIER `opacity` inline propio
  del elemento en cuanto la animación termina, aunque ese elemento nunca
  pidió opacidad 1. `CompetencyComparisonChart.tsx` (el componente que de
  verdad se renderiza en el informe — no `CompetencyRadar.tsx`, que es
  parecido pero no es el que está montado) aplicaba esa animación a los
  fondos de cuadrante. Arreglado con un fallback de custom property:
  `to { opacity: var(--brujula-target-opacity, 1); }`, y cada caller fija
  su propio `--brujula-target-opacity` inline. Si en el futuro otro
  componente comparte una `@keyframes` con un `to` fijo, mismo patrón.

- **Menú del dashboard en 2+2 en vez de 4 seguidos.** Contenedor con
  `max-w-2xl` demasiado estrecho para los botones que hay hoy — se amplió
  a `max-w-4xl` en `dashboard/page.tsx`.

- **`**negrita**` se veía literal (con los asteriscos) en la Biblioteca.**
  No había ningún parser de ese markdown-lite ahí. Se portó
  `FormattedText.tsx` (con `FormattedInline`/`FormattedParagraphs`) desde
  el repo original y se aplicó donde el texto viene de `platform_texts` o
  de las tablas de competencias.

- **Un clic de más ("revelar") antes de ver el informe.** `RevealGate.tsx`
  envolvía el informe exigiendo un clic extra en
  `dashboard/feedback/[id]/page.tsx` que la versión de producción no tiene
  — se abre directo. Se quitó el wrapper y se borró el archivo (quedó sin
  ningún otro uso).

- **"No hay ciclos abiertos" parecía un fallo de permisos del
  supervisor.** No lo era — era la sección "Tareas pendientes" con una
  redacción confusa para cuando no hay nada pendiente. Se simplificó el
  texto (`member.isGuest ? "..." : "..."`), sin tocar ninguna comprobación
  de rol.

- **Claves de `platform_texts` compartidas entre dos pantallas con
  público distinto (encontrado hoy, 2026-09-17).** `cycles/nueva/page.tsx`
  (el supervisor creando un ciclo PARA OTROS) leía las mismas claves
  `onboarding_360_intro/_seleccion/_confirmacion` que
  `feedback/nueva-360/page.tsx` (una cuenta individual pidiendo SU PROPIO
  360). El contenido real en la BBDD está escrito en segunda persona para
  quien va a ser evaluado ("vas a pedirle a las personas que te rodean que
  te cuenten qué impacto tienes en **ellas**") — sin sentido para un
  supervisor que no es el sujeto. Se le dieron claves propias
  (`onboarding_cycle_intro/_seleccion/_confirmacion`,
  `supabase/migrations/0098_...sql` en el repo principal, no en este).
  **Patrón a vigilar**: `getPlatformText(key, fallback)` no sabe nada de
  quién lo llama — si dos pantallas con audiencias distintas comparten una
  clave "porque el texto se parece", en cuanto alguien edite el contenido
  real en la BBDD para un contexto, rompe el otro en silencio (nunca lanza
  error, solo se lee raro).

## Cosas que parecían bug y NO lo eran (falsos positivos, verificados en vivo)

- **"El supervisor no tiene mapa de competencias de la empresa"** — sí lo
  tiene. `informe-empresa/page.tsx` + el enlace en `dashboard/page.tsx` ya
  estaban bien implementados y correctamente protegidos
  (`member.isSupervisor`, con `PermissionDenied` si no). Verificado
  entrando de verdad con la cuenta supervisor de la empresa demo — antes
  de tocar código, mejor loguearse y mirar que asumir por lectura de
  código.
- **"No llegan los emails de invitación"** — la config de Resend
  (`RESEND_API_KEY`, dominio `notificaciones@brujula.kairos-experience.es`)
  funciona perfecto (probado con una llamada directa a la API de Resend,
  sin pasar por la app). El código de `cyclesManager`/`responderManager`
  también está bien encadenado (`organizeEvaluators` →
  `sendInvitationEmails` → `infra/email.ts`). Era que se estaba mirando
  mal la bandeja de Gmail. Antes de rediseñar nada, comprobar lo tonto
  primero.

## Gaps conocidos, todavía sin tocar

- **Guarda "el supervisor no puede ser su propio evaluador" en el flujo
  ad-hoc del repo PRINCIPAL** (`dabarcao/brujula`, no este). Esta
  reingeniería sí la tiene
  (`0096_restore_ad_hoc_evaluators_supervisor_guard.sql`, con un comentario
  que atribuye el hueco a "la reescritura de upstream" — no es así:
  revisando las migraciones originales (0011/0005) esa guarda nunca
  existió ahí, es un hueco de siempre, no una regresión de esta
  reingeniería). No se ha portado el arreglo de vuelta al repo principal
  todavía.
- **Hallazgo de seguridad de bajo riesgo, solo documentado**: dentro de
  una misma llamada a una función PL/pgSQL, `now()` devuelve el mismo
  valor en todas sus invocaciones (garantía de Postgres dentro de una
  transacción) — así que si dos `UPDATE` separados ponen timestamps con
  `now()` en la misma función, esos timestamps salen idénticos. Eso
  permite, con acceso SQL directo (nunca desde la app), cruzar
  `feedback_invitations.used_at = feedback_responses.submitted_at` para
  de-anonimizar qué invitación corresponde a qué respuesta. Sin explotar,
  solo señalado.
- **Sin Supabase local montado** (`npx supabase start`, necesita Docker) —
  el `npm test` completo de la skill (incluidos los tests de
  caracterización contra BBDD real) no se puede correr hoy. Para cambios
  pequeños se ha estado usando `tsc --noEmit` + `eslint` + verificación
  manual en el navegador como sustituto proporcional. Para algo que toque
  una función RPC nueva, mejor montar el entorno real primero.
- **Informes de grupo, 2026-09-17: 4 archivos de test rotos por el rediseño
  de `create_report_group`/`close_report_group`
  (`0099_report_groups_membership_management_and_email.sql` en el repo
  principal), arreglados solo a medias.** Ese rediseño (pedido por el
  usuario) trae 3 cambios reales: (1) `create_report_group` ahora exige
  que quien CREA el grupo también tenga su propio 360 cerrado, (2) el
  creador ahora se inserta a sí mismo como miembro ya aceptado del grupo
  (antes nunca aparecía en `report_group_members` en absoluto — eso
  también le impedía cerrar su propio grupo), (3) cambia de `returns uuid`
  a `returns table(...)`. Arreglado del todo: `tests/characterization/
  report-groups-manager.test.ts` (reescrito para usar un empleado elegible
  como creador, no el Supervisor) y `scripts/seed-report-group.mjs`
  (parseo del nuevo shape de retorno). **Arreglado solo el parseo del
  retorno, NO la elegibilidad del creador**, en estos 4 (todos usan
  `reportGroupCreator = readyEmployees[0]`, bucket "listo, sin cerrar" —
  sin 360 CERRADO, así que su `beforeAll` ahora lanza donde antes no):
  `tests/characterization/read-only-reports.test.ts`,
  `tests/characterization/read-only-reports-manager.test.ts`,
  `tests/integration/read-only-reports-new-path-verification.test.ts`,
  `tests/integration/read-only-reports-route.test.ts`. Y sin tocar en
  absoluto: `tests/characterization/report-groups.test.ts` (la baseline
  original de la Story 1.1, vía Server Action, usa `supervisorToken` como
  creador de principio a fin — el mismo problema, un archivo entero por
  reescribir). Ninguno de estos 5 se pudo ejecutar (sin Supabase local) —
  se necesita elegir un creador de bucket "cerrado" en cada fixture y
  revisar cada aserción que asuma "el creador nunca es miembro" antes de
  confiar en ellos.

## Otras cosas que conviene saber

- **Node 20+ obligatorio** (Next.js 16 pide ≥20.9.0); el Node por defecto
  del sistema es 18 — anteponer `/opt/homebrew/opt/node@20/bin` al `PATH`
  en cada comando `npm`/`node` (mismo patrón que `scripts/dev.sh` del repo
  principal).
- **`.env.test.local` es solo para un Supabase local de verdad** (aviso ya
  en el propio `vitest.config.ts`) — nunca copiar ahí credenciales reales
  de producción, aunque parezca un atajo rápido para desbloquear un test
  que falla.
- **La rebrand de colores corporativos de Kairos** (verde oscuro
  `#145F37`, verde claro `#8CB43C`) vive centralizada en
  `src/app/globals.css` como custom properties bajo `@theme inline` —
  cualquier `bg-indigo`/`text-coral-deep`/etc. en cualquier archivo sigue
  esos tokens automáticamente. `CompetencyRadar.tsx`'s `GROUP_COLORS` es
  una paleta categórica aparte, deliberadamente NO ligada a esos tokens
  (mismo criterio que los colores de categoría de evaluador) — no
  "arreglar" para que combine con la marca, es a propósito.
- **La marca de la brújula** (login, `CompassWatermark` en
  `src/app/login/page.tsx`) se rediseñó para alinearse con el logo real de
  Kairos: aguja en trama de puntos con degradado entre los dos verdes,
  misma técnica que el reloj de arena de su logo (comprobado a mano sobre
  su PNG real). Sustituyó a una brújula 3D dorada/marino que ya no encaja
  con la paleta de marca.
