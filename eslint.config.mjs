import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Story 1.3 (_bmad-output/implementation-artifacts/
  // spec-1-3-enforce-the-import-boundary.md): machine-enforced import
  // boundary for the db -> managers -> API layering introduced in Stories
  // 1.1/1.2. Pages, components, and Server Actions must go through
  // @/server/managers/*, never straight to Supabase (@/lib/supabase/*) or
  // the db-access layer (@/server/db/*). @/server/db/* has zero exceptions
  // -- nothing under src/app/** or src/components/** imports it today.
  {
    files: [
      "src/app/**/*.{ts,tsx,js,jsx,mjs}",
      "src/components/**/*.{ts,tsx,js,jsx,mjs}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // "**/lib/supabase/**" also catches a relative-path import
              // (e.g. "../../../lib/supabase/server") that would otherwise
              // dodge the "@/lib/supabase/**" alias-only pattern below.
              group: [
                "@/lib/supabase/**",
                "@/lib/supabase",
                "**/lib/supabase/**",
                "@supabase/supabase-js",
              ],
              message:
                "Do not import the Supabase client directly from src/app/** or src/components/**. Go through a @/server/managers/* manager instead (see spec-1-3-enforce-the-import-boundary.md).",
            },
            {
              group: ["@/server/db/**", "@/server/db"],
              message:
                "Do not import the db-access layer directly from src/app/** or src/components/**. Go through a @/server/managers/* manager instead (see spec-1-3-enforce-the-import-boundary.md).",
            },
            {
              // AD-12 (ARCHITECTURE-SPINE.md): the same import-boundary
              // shape as the @/server/db/** restriction above, one layer
              // over -- src/server/infra/* is the only code allowed to
              // import an infrastructure-service SDK (Resend, etc.); a
              // page/component must go through a @/server/managers/*
              // manager instead, same as it would for db/*.
              group: ["@/server/infra/**", "@/server/infra"],
              message:
                "Do not import the infra layer directly from src/app/** or src/components/**. Go through a @/server/managers/* manager instead (see ARCHITECTURE-SPINE.md AD-12).",
            },
          ],
        },
      ],
    },
  },
  // Temporary exception: these 2 files still call Supabase directly. Both
  // are the platform-admin org list/detail screens -- a deliberately
  // deferred, pre-existing gap (no feature flag ever covered them; see
  // _bmad-output/implementation-artifacts/deferred-work.md and the Epic 6
  // backlog entry "Complete manager delegation for remaining admin pages")
  // that is explicitly out of scope for the domain migrations that closed
  // out every other entry this list used to carry (actions/{admin,feedback,
  // members,reportGroups}.ts; the feedback, report-groups, cycles and
  // members/self/reports/auth-signup domains; invitacion/[token] and
  // responder/[token]). Listed here by exact path (never a directory/
  // wildcard exemption) so newly added files are never silently exempted.
  // @/server/db/* and the raw @supabase/supabase-js package stay forbidden
  // even for these files -- they may only reach Supabase through the
  // @/lib/supabase/* wrapper. NOTE: the [id] path segment must stay escaped
  // as \\[id\\] below -- an unescaped bracket is a glob character class, so
  // the entry silently fails to match itself and the file falls through to
  // the stricter block above.
  {
    files: [
      "src/app/admin/empresas/\\[id\\]/page.tsx",
      "src/app/admin/page.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/db/**", "@/server/db", "@supabase/supabase-js"],
              message:
                "Do not import the db-access layer directly from src/app/** or src/components/**. Go through a @/server/managers/* manager instead (see spec-1-3-enforce-the-import-boundary.md).",
            },
            {
              // AD-12: same re-listing requirement as @supabase/supabase-js
              // above -- this block fully replaces the base block's
              // patterns for these 2 files, so the infra restriction has to
              // be repeated here too, or these 2 files would silently lose
              // it entirely.
              group: ["@/server/infra/**", "@/server/infra"],
              message:
                "Do not import the infra layer directly from src/app/** or src/components/**. Go through a @/server/managers/* manager instead (see ARCHITECTURE-SPINE.md AD-12).",
            },
          ],
        },
      ],
    },
  },
  // Story 7.3: the 3rd exemption block that used to live here
  // (src/app/actions/cycles.ts, carved out by Story 6.4 for
  // `generateAiInterpretation`/src/lib/aiInterpretation.ts) is removed --
  // that file no longer constructs a raw Supabase client at all. The AI-
  // interpretation orchestration now goes entirely through
  // `@/server/managers/aiInterpretationManager`, so actions/cycles.ts falls
  // through to the base import-boundary block above like every other
  // Server Action file. Zero `no-restricted-imports` exemptions remain in
  // this config beyond the 2 admin-pages files above (a separate,
  // deliberately deferred gap -- see that block's own comment).
]);

export default eslintConfig;
