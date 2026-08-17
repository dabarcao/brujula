# Brújula

Feedback anónimo entre compañeros, con orientación hacia la mejora.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres + Auth), con Row-Level Security
- Desplegado en Vercel

## Poner en marcha en local

1. Instala dependencias:

   ```
   npm install
   ```

2. Copia `.env.local.example` a `.env.local` y rellena con los valores de tu
   proyecto de Supabase (Project Settings → API en el dashboard de Supabase).

3. Arranca el servidor de desarrollo:

   ```
   npm run dev
   ```

   La app queda disponible en http://localhost:3000

## Base de datos

Hay varios archivos de migración en `supabase/migrations/`, y hay que
aplicarlos **en orden** (0001, luego 0002, luego 0003...): copia el
contenido de cada uno y pégalo en el SQL Editor del dashboard de Supabase
(tu proyecto → SQL Editor → New query → pegar → Run), uno detrás de otro.

- `0001_initial_schema.sql`: tablas principales y políticas de Row-Level
  Security.
- `0002_auth_bootstrap.sql`: función que crea la organización y da de alta
  al primer administrador cuando alguien se registra desde `/signup`.
- `0003_member_invites.sql`: alta de empleados por invitación (RRHH invita
  desde `/dashboard/members`, la persona invitada completa su alta desde
  `/invitacion/[token]`).
- `0004_fix_rls_recursion.sql`: corrige una recursión infinita en las
  políticas de RLS de `members` (bug de la migración 0001, no relacionado
  con las invitaciones).
- `0005_ad_hoc_feedback_flow.sql`: flujo ágil de feedback — plantilla
  guiada por defecto, solicitudes, invitaciones y respuestas
  (`/dashboard/feedback/nueva`, bandeja de tareas en `/dashboard`,
  `/responder/[token]`). Incluye también un arreglo de RLS en
  `feedback_responses`, mismo tipo de bug que 0004 pero en otra tabla.
- `0006_departments_and_360_template.sql`: departamentos (sustituyen a
  `members.team`, que no se usaba), distinción empleado/responsable en
  competencias y preguntas, y la plantilla por defecto del ciclo 360 (24
  preguntas, basada en un cuestionario real de cliente). Cambia la firma
  de `invite_member` (ahora exige departamento) — hay que actualizar el
  código de la app y `scripts/seed-fake-employees.mjs` a la vez que se
  aplica esta migración.
- `0007_360_cycle_flow.sql`: ciclo 360 completo — RRHH crea el ciclo
  (`/dashboard/cycles/nueva`), cada empleado organiza a sus evaluadores por
  categoría (`/dashboard/cycles/[id]`) y su autoevaluación se añade sola.
  Añade preguntas de tipo "scale" a `/responder/[token]` y separa la
  autoevaluación (siempre visible) de las respuestas de compañeros (con
  umbral) en la vista de resultados.
- `0008_fix_required_check_manager_only.sql`: corrige `submit_feedback_response`,
  que exigía las preguntas "manager_only" como obligatorias aunque la
  persona evaluada no fuera responsable (bug de 0007, encontrado probando
  el ciclo 360 en el navegador).
- `0009_fix_cross_template_answers.sql`: limpia datos de prueba
  contaminados y blinda `submit_feedback_response` contra respuestas a
  preguntas que no pertenecen a la plantilla de la solicitud.
- `0010_self_eval_skips_open_questions.sql`: la autoevaluación ya no exige
  las preguntas abiertas del ciclo 360, solo las de escala.
- `0011_ad_hoc_request_lifecycle.sql`: una solicitud ágil abierta a la
  vez; se puede cancelar o modificar (cambiar evaluadores) mientras no
  tenga respuestas todavía.
- `0012_ad_hoc_request_types.sql`: tipos de solicitud ágil (reunión,
  colaboración, liderazgo de iniciativa, general), cada uno con su propia
  plantilla por defecto.
- `0013_org_custom_questionnaires.sql`: cuestionarios propios por
  empresa — sustituyen al de la plataforma en el flujo ágil, se añaden
  después del bloque por defecto en el ciclo 360
  (`/dashboard/questionnaires`).
- `0014_close_completed_ad_hoc_request.sql`: permite marcar como
  completada una solicitud ágil que ya tiene respuestas (distinto de
  cancelar, que solo vale sin respuestas).
- `0015_org_questionnaires_disabled.sql`: revierte 0013 — crear/editar
  cuestionarios propios de empresa deja de ser una capacidad del
  Supervisor, queda reservado para el futuro Admin general. Se borra
  `/dashboard/questionnaires`.
- `0016_platform_admin_org_creation.sql`: el alta de empresa deja de ser
  autoservicio público (`/signup`, ahora retirado). Añade la tabla
  `platform_admins` y el panel `/admin`, donde el Admin general da de
  alta empresas nuevas.
- `0017_supervisor_and_admin_management.sql`: el Supervisor pasa de ser
  un `role` excluyente (`org_admin`) a una capacidad (`is_supervisor`)
  sobre un miembro normal, igual que `is_manager` — así puede ser
  Supervisor y Usuario participante a la vez, con una sola cuenta. El
  ciclo 360 deja de abrirse automáticamente para toda la empresa: el
  Supervisor selecciona explícitamente los participantes al crearlo
  (`feedback_cycle_participants`). `/admin` gana listado y edición
  (renombrar) de empresas ya creadas.

### Confirmación de email

Por defecto, Supabase exige confirmar el email antes de poder iniciar
sesión. La app ya contempla ese caso (el nombre de la empresa queda
guardado hasta la primera vez que el usuario confirma e inicia sesión), pero
para probar más rápido durante el desarrollo puedes desactivarlo
temporalmente en Authentication → Providers → Email → "Confirm email".

El esquema incluye las tablas principales (organizations, members,
feedback_requests, feedback_responses, etc.) y las políticas de
Row-Level Security que garantizan el aislamiento entre organizaciones y el
anonimato del feedback, tal como se describe en la spec del producto
(`spec_feedback_app.md`).

## Despliegue

El proyecto se despliega en Vercel conectando este repositorio de GitHub
desde el dashboard de Vercel ("Add New... → Project → Import Git
Repository"). Hay que configurar las mismas variables de entorno que en
`.env.local` dentro de la configuración del proyecto en Vercel (Settings →
Environment Variables).
