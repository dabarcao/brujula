---
id: SPEC-brujula-core
companions:
  - ../../planning-artifacts/architecture/architecture-brujula-gui-2026-09-11/ARCHITECTURE-SPINE.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Brújula Core — backend/GUI decoupling

## Why

Brújula (an anonymous peer-feedback/360 HR tool, Next.js 16 + Supabase, in production with real customer organizations) has no boundary between its interface and its backend: 25 files call Supabase directly from pages and Server Actions. This is both a pain to solve and a vision to realize — the tight coupling means a UI change and a data-model change can't be made safely in isolation, and the product owner wants a durable "core" the GUI talks to through a secured API, with a deliberate seam toward eventually removing Supabase for direct Postgres access. This spec distills the finalized architecture spine (see `companions:`) into a buildable contract.

## Capabilities

- **CAP-1**
  - **intent:** The GUI (pages and client components) reads and writes all Brújula data exclusively through a managers/API boundary, never Supabase directly.
  - **success:** An ESLint `no-restricted-imports` rule reports 0 violations of `@/lib/supabase/*` or `@/server/db/*` under `src/app/**` and `src/components/**`, enforced pre-commit or in CI.

- **CAP-2**
  - **intent:** Each of the six existing domains (report groups, admin/members, cycles, feedback, responder/invitation, read-only reports) exposes its business logic through one manager, reachable both in-process (Server Components/Actions) and over HTTP (Route Handlers for Client Components and future clients).
  - **success:** For each migrated domain, the same manager function is demonstrably invoked from both an in-process caller and a Route Handler with identical results.

- **CAP-3**
  - **intent:** The API layer authenticates the GUI via an app-owned token, issued alongside (not replacing) the Supabase session, while Postgres RLS keeps enforcing authorization underneath during the transition.
  - **success:** A request to `app/api/**` without a valid app token is rejected (401) even carrying a valid Supabase session cookie; existing RLS-backed operations continue passing their current authorization behavior unchanged.

- **CAP-4**
  - **intent:** Anonymous invitee flows (`responder`/`invitacion`, single-use token) keep working exactly as today, authenticated by their existing token rather than the new app token.
  - **success:** An invitee can view and submit a response end to end with no login and no app token present.

- **CAP-5**
  - **intent:** Each domain migrates to the new layering behind a feature flag with a safe rollback path, validated by a minimum automated safety net before the flag flips.
  - **success:** Each migrated domain ships behind `USE_NEW_API_<DOMAIN>` (default off), has 2–3 passing Vitest integration tests (auth-boundary, anonymity-threshold, golden-output) against a locally seeded DB, and the old code path is removed only after one full production cycle on the new path.

## Constraints

- Zero automated test coverage and no CI/staging exist today — bends CAP-5 toward a local-seeded-Vitest tripwire plus per-domain feature flags rather than a full test suite or CI-gated rollout.
- Postgres RLS (23 policies, 9 migrations) is the sole live authorization mechanism, keyed off Supabase `auth.uid()` inside `SECURITY DEFINER` RPCs — bends CAP-3 to issue the new app token *alongside* the Supabase session rather than replacing it, since `db/*` must still hold a real Supabase session for RLS to keep working.
- ~35 existing Postgres RPCs already carry business logic and are battle-tested (two prior RLS-recursion bugs already fixed) — bends CAP-1/CAP-2 to wrap RPCs as-is inside the DB-access layer rather than port their logic into TypeScript.
- This is a live production app serving real customer organizations, with the team's established discipline of small sequential changes (66 migrations to date) — bends CAP-5 to a strict risk-ascending, one-domain-at-a-time rollout rather than a batched cutover.

## Non-goals

- Replacing RLS with application-level authorization checks — deferred to a future initiative, done only once Supabase itself is actually scheduled for removal.
- Actually swapping the DB-access layer's Supabase client for direct Postgres access — this spec only builds the seam (CAP-1's `db/` isolation) that makes that swap contained later.
- Introducing CI or a staging environment — open question, revisit before the report-groups POC (first CAP-5 slice) is considered done.
- The "Brújula Segura" visual redesign (DESIGN.md/EXPERIENCE.md, new UI tokens/components) — a separate, parallel initiative with its own spec; out of scope here beyond the data-fetching pattern (Client Components call the new API via a shared fetch wrapper).

## Success signal

All six domains run on the new managers/API layering with their feature flags removed and old direct-Supabase paths deleted, and the ESLint boundary rule holds at 0 violations repo-wide. The report-groups POC (delivered first) demonstrably works end to end — create, respond, close, AI interpretation — against seeded demo data with its flag on, before any other domain migration starts.

## Open Questions

- Whether/how to introduce CI to run the ESLint boundary rule and Vitest suite automatically — decide before the report-groups POC is considered done.
- Exact token issuance/refresh/rotation flow and the CSRF-header mechanism for the new app token — scoped to the scaffolding epic, once the POC proves the layering pattern.
