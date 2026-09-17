# Epic 1 Context: Core Layering Foundation — Report Groups Migration (POC)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Brújula's GUI and backend are currently the same code: pages and form actions call Supabase directly, so UI changes and data/security changes can't be made independently or even reliably told apart. This epic proves, end to end on the smallest and most isolated existing domain (report groups), the new `db → managers → API` layering that every later domain will reuse: a data-access layer that owns all Supabase calls, a manager layer that owns business logic, a route handler exposing that manager over HTTP, a machine-enforced import boundary, a first-party app-token auth mechanism issued alongside (not replacing) the Supabase session, and the feature-flag/characterization-test rollout pattern that makes each migration step safe to ship straight to production — there is no staging environment or CI today. Success here (report groups working end to end, flag on, against seeded data) is the gate before any other domain migrates.

## Stories

- Story 1.1: Characterization Tests for Report Groups (Current Behavior Baseline)
- Story 1.2: DB-Access and Manager Scaffolding for Report Groups
- Story 1.3: Enforce the Import Boundary
- Story 1.4: App Token Issuance and Validation
- Story 1.5: Report Groups Route Handler and Client Fetch Wrapper
- Story 1.6: Report Groups Server Actions Become Thin Delegates
- Story 1.7: Report Groups Feature Flag and Rollback Safety
- Story 1.8: New-Path Verification Against the Characterization Baseline

## Requirements & Constraints

- The build must fail if any file under the pages or components trees imports the Supabase client or the DB-access layer directly; this must be a checkable, automated fact, not a convention a developer could forget.
- Report groups' business logic must be reachable through exactly one manager, callable identically whether invoked in-process (Server Components/Actions) or over HTTP — no added network hop for the in-process path, since a Server Component calling its own app's API instead of the manager directly adds latency with no real isolation benefit.
- Route handlers must reject any request lacking a valid app-issued token with a 401, even when a valid Supabase session cookie is present; mutating requests additionally require an anti-CSRF header. The Supabase-session-based authorization underneath (RLS) must keep working unchanged during this transition — this is not a replacement of Supabase auth, it runs alongside it.
- The old and new code paths must coexist behind a single, default-off feature flag, checked only at the calling site (never inside the manager), with old-path deletion eligible only after the new path survives one full production cycle in production.
- Before a flag flips on, the domain needs a small, targeted automated safety net (not full coverage): characterization tests capturing today's actual behavior as a recorded baseline, written and passing against the *current*, pre-refactor implementation first, then re-verified against that same baseline at each subsequent migration stage — not a single end-of-migration comparison.
- Automated tests run only against a locally seeded Supabase instance, never production, and do not attempt to cover Server Component rendering (not supported by the test runner) — that layer stays manually/QA-checklist verified.
- Everything above must work without introducing CI or a staging environment, since neither exists in this repo; that remains an open decision to revisit before this epic is considered fully done, not a blocker to completing it.
- A known discrepancy must be checked as part of this epic's baseline work: whether Supabase session refresh is actually happening anywhere in the app (a code comment claims "the middleware" handles it, but no middleware file exists) — if it isn't, the RLS safety net degrades silently for long sessions, and that fact needs to be recorded before the POC is called proven.

## Technical Decisions

- Three-layer, one-directional dependency: pages/components → managers → db-access → Supabase. The db-access layer is the only code allowed to import a Supabase/Postgres client and exports plain-TypeScript-typed functions with no Supabase-shaped types leaking out — this is deliberately the single seam a future direct-Postgres swap would touch, not built now.
- Existing Postgres RPCs (already battle-tested, including prior RLS-recursion fixes) are wrapped as-is in the db-access layer, not reimplemented or rewritten.
- Managers own orchestration and business logic only, never `redirect()`/`revalidatePath()` (those stay one layer up in the Server Action), and never read cookies/headers themselves — identity is passed in as a parameter.
- The AI-interpretation step is split rather than moved verbatim: its RPC calls belong in a new db-access file; only prompt-building, the model call, and orchestration stay in a dedicated manager.
- Defense in depth on the import boundary: an ESLint rule fails linting on a forbidden import, and every db-access/manager file opens with a `server-only` import so an accidental client-bundle import fails the build too — the rule must be proven to actually fire (a deliberate scratch violation, then removed), not just assumed to exist.
- Login issues two independent credentials going forward: the existing Supabase session cookie (unchanged, consumed only by the db-access layer to satisfy RLS) and a new first-party app token (httpOnly, Secure, SameSite=Lax cookie) consumed only by the API layer. Neither replaces the other; exact issuance/refresh/rotation detail is being decided within this epic, not pre-determined.
- API error responses use one shared envelope shape (`{ error: { code, message } }`) with HTTP status conveying the error class (401/403 auth, 404 not found, 422 validation, 500 unexpected); manager return types use camelCase fields, `null` for absent values, and ISO-8601 timestamp strings.
- File/naming convention established here and reused by every later domain: one file per domain per layer, `db/<domain>.ts` / `managers/<domain>Manager.ts` / `api/<domain>/route.ts`; feature flags named `USE_NEW_API_<DOMAIN>`.
- Shared presentation primitives (if touched at all here) must stay presentation-only, with no data-fetching imports — that boundary belongs to the separate visual-redesign epic, not this one.

## Cross-Story Dependencies

- Story 1.1's recorded baseline is the anchor the rest of the epic verifies against: Story 1.2 runs it against the new manager path, Story 1.6 runs it against the refactored Server Actions, and Story 1.8 runs it again (plus new auth-boundary tests) as the final gate.
- Story 1.5 (route handler + client fetch wrapper) depends on both Story 1.2 (the manager it calls) and Story 1.4 (the token mechanism it enforces).
- Story 1.7 (feature flag) depends on both the new path (Stories 1.2/1.5/1.6) and the old path remaining intact and switchable at the same call site.
- Story 1.8 is the explicit gating condition for Story 1.7's production rollout — the flag isn't considered safe to flip until 1.8 passes.
- Story 1.3 (import boundary) and Story 1.4 (app token) are scoped narrowly to report groups here but are built as repo-wide mechanisms; every later domain in the broader initiative reuses them as-is rather than rebuilding them.
- This epic is a hard prerequisite for the parallel visual-redesign epic's report-groups screens work, which depends only on this epic's flag/API existing (not on the flag being on) — but that redesign work itself is out of scope for this epic.
