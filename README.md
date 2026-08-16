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

Hay dos archivos de migración en `supabase/migrations/`, y hay que aplicarlos
**en orden** (0001 antes que 0002): copia el contenido de cada uno y pégalo
en el SQL Editor del dashboard de Supabase (tu proyecto → SQL Editor → New
query → pegar → Run), uno detrás de otro.

- `0001_initial_schema.sql`: tablas principales y políticas de Row-Level
  Security.
- `0002_auth_bootstrap.sql`: función que crea la organización y da de alta
  al primer administrador cuando alguien se registra desde `/signup`.

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
