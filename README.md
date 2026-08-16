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

El esquema inicial vive en `supabase/migrations/0001_initial_schema.sql`.
Para aplicarlo, copia el contenido del archivo y pégalo en el SQL Editor del
dashboard de Supabase (tu proyecto → SQL Editor → New query → pegar → Run).

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
