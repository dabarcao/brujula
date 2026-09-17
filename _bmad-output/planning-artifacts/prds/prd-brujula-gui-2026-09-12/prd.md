---
title: Brújula Core — Backend/GUI Decoupling
status: final
created: '2026-09-12'
updated: '2026-09-12'
amendments: ['FR-6 amended same-day to make the characterization-testing discipline explicit, per architecture spine AD-9']
---

# PRD: Brújula Core — Backend/GUI Decoupling
*Working title — confirm.*

## 0. Document Purpose

This PRD is for the product owner (also the sole/primary builder) and for the downstream BMad workflows that consume it — `bmad-create-epics-and-stories`, then `bmad-build`. It distills two already-finalized upstream documents rather than introducing new requirements: `SPEC.md` (`_bmad-output/specs/spec-brujula-core/SPEC.md`, 5 capabilities/4 constraints/4 non-goals, self-validated) and the architecture spine (`_bmad-output/planning-artifacts/architecture/architecture-brujula-gui-2026-09-11/ARCHITECTURE-SPINE.md`, 11 architecture decisions, reviewed by 3 independent lenses). The spine is this PRD's technical companion — cited for mechanism ("how"), never restated; this document stays at requirements altitude ("what" and "why"). Every FR traces back to one of the SPEC's CAP-N capabilities, kept as an inline cross-reference. A separate, parallel visual-redesign PRD-equivalent (the "Brújula Segura" UX spines) is out of scope here — see §5.

## 1. Vision

Brújula is an anonymous peer-feedback and 360° coaching tool, in production today with real customer organizations. Its interface and its backend are currently the same thing: 25 files across the codebase call Supabase directly from inside pages and form actions, so a change to how a screen looks and a change to how data is stored or secured can't be made independently, or even always be told apart. That coupling is a growing risk on a product whose entire value proposition rests on getting anonymity guarantees right every time a request touches the database.

This initiative builds a durable "core" — a `db → managers → API` layering — that the GUI talks to instead of the database directly, secured by the app's own token rather than borrowed from Supabase's session. Once built, a future visual redesign, a new client, or eventually replacing Supabase itself with direct Postgres access all become contained changes behind a boundary, instead of full-codebase risk.

This is deliberately not a rewrite. The ~35 Postgres functions and 23 row-level-security policies already doing real work stay exactly where they are; this initiative wraps and exposes them safely rather than reimplementing them, migrating one bounded domain at a time behind a feature flag, smallest and lowest-traffic first.

## 2. Target User

### 2.1 Jobs To Be Done
- **[ASSUMPTION]** As the builder and operator of Brújula, I need to change how a screen fetches or renders data without ever risking the anonymity/authorization logic underneath it — today those are the same 25 files.
- As the same operator, I need to eventually swap Brújula's backend (Supabase → direct Postgres) without a full-application rewrite.
- As the same operator, I need every migration step to be safe to ship directly to production, since there is no staging environment and no CI today.
- Indirectly, on behalf of every current evaluator, requester, and Supervisor using Brújula: their experience (anonymous response flow, report reveal, aggregate views) must not change or regress while this happens underneath them.

### 2.2 Key User Journeys

- **UJ-1. The operator migrates the report-groups domain first.**
  - **Persona + context:** the product owner/developer, proving the new layering pattern on the smallest, most isolated existing domain before touching anything higher-stakes.
  - **Entry state:** `src/app/actions/reportGroups.ts` (71 lines) still calls Supabase directly; no `src/server/` tree exists yet.
  - **Path:** stands up `src/server/db/reportGroups.ts` and `src/server/managers/reportGroupsManager.ts`; adds the ESLint boundary rule; adds `src/app/api/report-groups/route.ts`; flips `USE_NEW_API_REPORTGROUPS` on locally against seeded demo data.
  - **Climax:** creates a group, responds to it, closes it, and gets an AI interpretation — end to end — entirely through the new layering, with the old direct-Supabase path still present but unused.
  - **Resolution:** the pattern (db/manager/route/lint-boundary/token-auth) is proven on one domain; the same shape repeats for cycles, feedback, and the rest, per the architecture spine's rollout order.
  - **Edge case:** if the ESLint rule doesn't actually fail the build when a page imports `@/server/db/*` directly (bypassing the manager), the boundary this whole initiative exists to build isn't real yet — this is checked before the POC is called done.

- **UJ-2. An anonymous evaluator's experience is unaffected. [ASSUMPTION]**
  - **Persona + context:** Diego, an ad-hoc evaluator who never logs in — the single-use invitation token is his only credential, unchanged by this initiative.
  - **Entry state:** opens `/responder/[token]` from an email link, as today.
  - **Path:** answers questions, submits.
  - **Climax:** submission succeeds exactly as it does before any migration — because the responder domain is deliberately migrated *last*, and even then authenticates via its existing token mechanism, never the new app-token scheme meant for logged-in users.
  - **Resolution:** Diego never notices this initiative happened at all. That invisibility is itself the requirement (FR-4).

## 3. Glossary

- **Core** — the new `db → managers → API` layering (`src/server/**` plus `src/app/api/**`) that the GUI talks to instead of Supabase directly. The product owner's own term for it.
- **DB-access layer** (`src/server/db/*`) — the only code permitted to import a Supabase or Postgres client. Wraps the existing ~35 Postgres RPCs with typed signatures; does not reimplement their logic, which is already battle-tested (two prior RLS-recursion bugs already found and fixed in it) and would be the highest-risk thing to touch on a zero-test production app.
- **Manager** — one per domain (`src/server/managers/*`), owns business logic and orchestration, calls the DB-access layer only.
- **Domain** — one of the six bounded areas of the product this initiative migrates independently: report groups, admin/members, cycles, feedback, responder/invitation, read-only reports.
- **App token** — the new, first-party credential the API layer issues at login and validates via `requireApiToken()`, distinct from and issued alongside the existing Supabase session cookie.
- **RLS (Row-Level Security)** — the existing Postgres authorization mechanism (23 policies across 9 migrations, keyed off Supabase's `auth.uid()` inside `SECURITY DEFINER` RPCs), kept as the live authorization backstop throughout this initiative.
- **Feature flag** — a per-domain, off-by-default environment variable (`USE_NEW_API_<DOMAIN>`) that lets the old and new code paths coexist during migration.
- **POC** — the first domain migrated (report groups), used to prove the pattern before repeating it.

## 4. Features

### 4.1 GUI/Core Boundary Enforcement

**Description:** No code under `src/app/**` or `src/components/**` may import a Supabase client or the DB-access layer directly — only a manager. This is the mechanism that makes "the GUI never touches the backend directly" a checkable fact rather than a convention. Realizes UJ-1. Realizes CAP-1.

**Functional Requirements:**

#### FR-1: Import boundary is machine-enforced (CAP-1)

The build fails if any file under `src/app/**` or `src/components/**` imports `@/lib/supabase/*` or `@/server/db/*` directly. Realizes UJ-1's edge case.

**Consequences (testable):**
- An ESLint `no-restricted-imports` rule reports the violation and fails `npm run lint` / CI on either forbidden import path.
- Every file under `src/server/db/*` and `src/server/managers/*` opens with `import "server-only"`, so an accidental import into a client bundle fails the Next.js build, not just lint.

**Out of Scope:**
- Runtime enforcement (e.g. a proxy that blocks a Supabase call at request time) — this is a build-time-only guarantee.

### 4.2 Per-Domain Manager/API Exposure

**Description:** Each of the six domains exposes its business logic through exactly one manager, reachable two ways: in-process (existing Server Components/Actions, kept as thin delegates) and over HTTP (`src/app/api/**/route.ts`, for the ~8 Client Components and any future non-browser client). Realizes UJ-1. Realizes CAP-2.

**Functional Requirements:**

#### FR-2: One manager per domain, two callers (CAP-2)

For each of the six domains, a single manager function is callable both from an in-process Server Component/Action and from an HTTP Route Handler, with identical behavior either way.

**Consequences (testable):**
- For the report-groups POC (and each domain thereafter), the same manager function is demonstrably invoked from both call paths with the same result against the same seeded data.
- Server Action files under `src/app/actions/` become one-line delegates to a manager function — no direct Supabase or DB-access-layer calls remain in that directory.

**Feature-specific NFRs:**
- No added network hop for the in-process path — a Server Component calling its own app's HTTP API instead of the manager directly is explicitly disallowed (same serverless-function boundary, added latency, no real isolation benefit).

### 4.3 App-Owned API Authentication

**Description:** The API layer authenticates the GUI via a token the app itself issues and validates, decoupled from Supabase's session — a deliberate choice given Supabase itself is a planned future removal. Running two authorization mechanisms in parallel (the new app token at the API layer, RLS underneath) is an accepted ongoing cost of this design, not a free choice — it's what buys safety during the transition, at the price of two things to keep consistent instead of one. Realizes UJ-1. Realizes CAP-3.

**Functional Requirements:**

#### FR-3: Independent app token, RLS kept as the safety net underneath (CAP-3)

Route Handlers reject any request without a valid app-issued token, even if a valid Supabase session cookie is present. Underneath, the DB-access layer continues to authenticate to Supabase so existing RLS policies keep enforcing authorization during this transition.

**Consequences (testable):**
- A request to `src/app/api/**` without a valid app token returns 401, regardless of Supabase session cookie state.
- Existing RLS-backed authorization behavior (e.g. a Supervisor-only aggregate query) is unchanged — same result, same rejection cases, before and after a domain's migration.
- Login issues both credentials (the existing Supabase session cookie, unchanged; the new app token) — neither replaces the other in this initiative.

**Out of Scope:**
- Replacing RLS with application-level authorization checks — a distinct future initiative, explicitly not part of this one (see §5).

### 4.4 Anonymous Invitee Continuity

**Description:** The existing single-use invitation token mechanism for anonymous evaluators is untouched by the new app-token scheme — it is a different credential for a different kind of caller. Realizes UJ-2. Realizes CAP-4.

**Functional Requirements:**

#### FR-4: Invitee routes authenticate via their existing token, never the app token (CAP-4)

Responder/invitee-facing routes (`/responder/[token]`, `/invitacion/[token]`) validate the single-use invitation token exactly as they do today; `requireApiToken()` never gates these routes.

**Consequences (testable):**
- An invitee can view and submit a response end to end with no login and no app token present, both before and after the responder domain migrates.
- The responder domain migrates last in the rollout order (§6), only after the pattern has held on five lower-stakes domains.

### 4.5 Safe Incremental Migration

**Description:** Each domain migrates behind its own feature flag, with a minimum automated safety net proving the migration didn't silently change behavior, on a production app that has no staging environment or CI today. This mirrors the team's own existing discipline of small, sequential, individually-verifiable changes — 66 SQL migrations shipped this way to date with no big-bang rewrite — applied now to application code instead of just the database. Realizes UJ-1. Realizes CAP-5.

**Functional Requirements:**

#### FR-5: Per-domain feature flag with a one-way-safe rollback (CAP-5)

Each domain's old and new code paths coexist behind a dedicated flag, default off, checked in exactly one place.

**Consequences (testable):**
- `USE_NEW_API_<DOMAIN>` env vars exist per domain, default `false`, checked only in the thin caller (Server Action delegate or Route Handler) — never inside a manager.
- The old code path for a domain is deleted only after its new path has survived one full production cycle with the flag on — defined here as either one complete Ciclo 360 lifecycle (open through close) or 14 calendar days, whichever is longer.
- At most one domain's flag is flipped per deploy.

#### FR-6: Minimum automated regression check per domain (CAP-5)

Before a domain's flag flips on, a small, targeted test suite (not full coverage) catches a broken migration — using **characterization testing**: capture the domain's current, pre-refactor behavior as a recorded baseline first, then verify the new path against that same baseline throughout the migration, not with a one-off comparison only at the end.

**Consequences (testable):**
- Each migrated domain has tests (Vitest, against a locally seeded Supabase instance via the existing `scripts/seed-*.mjs` — never production) written against its *current* implementation before any refactoring begins, capturing: creating/updating/closing the domain's core entity and its most state-changing operation, as recorded golden outputs.
- The new path is re-verified against that same recorded baseline at each subsequent migration stage (after scaffolding, after the Server Action/page refactor, and immediately before the flag flips), plus new auth-boundary and anonymity-threshold tests specific to the new path.

**Out of Scope:**
- Testing Server Component rendering itself — Vitest doesn't support this, so that layer stays manually/QA-checklist verified, not unit-tested (per the architecture spine's AD-9).

**Notes:**
- `[NOTE FOR PM]` Whether to introduce CI to run these tests automatically, versus running them locally before each flag flip, is an open question (§8) — decide before the POC is considered done.

## 5. Non-Goals (Explicit)

- Replacing Postgres RLS with explicit application-level authorization checks in the managers layer — deferred to a future initiative, undertaken only once Supabase itself is actually scheduled for removal.
- Actually swapping the DB-access layer's Supabase client for a direct Postgres client — this initiative only builds the seam (FR-1's boundary) that makes that swap contained later; the swap itself is not part of this PRD.
- Introducing CI or a staging environment as a project-wide capability — the migration's safety net (FR-5, FR-6) is designed to work without either; whether to add them is an open question (§8), not a commitment of this initiative.
- The "Brújula Segura" visual redesign — a separate, parallel initiative with its own finalized UX spines (`DESIGN.md`/`EXPERIENCE.md`). This PRD's only touchpoint with it is that Client Components will call the new API via a shared fetch wrapper going forward, which the UX spines already account for. Sequencing between the two initiatives is the architecture spine's concern, not a decision this PRD makes — but for a downstream reader: per-domain UI redesign work follows that domain's own backend migration, never precedes it, while UI work that's global and additive (tokens, shared chrome) can proceed in parallel at any time.

## 6. MVP Scope

### 6.1 In Scope
- The layering scaffolding itself: `src/server/db/`, `src/server/managers/`, the ESLint boundary rule, `src/server/shared/auth.ts` (`requireApiToken()`), and app-token issuance at login (FR-1, FR-3).
- The report-groups domain fully migrated end to end (the POC) — `db/reportGroups.ts`, `reportGroupsManager.ts`, `src/app/api/report-groups/route.ts`, the corresponding Server Action files as thin delegates, and its feature flag (FR-2, FR-5).
- The minimum Vitest safety net, scoped to the report-groups domain (FR-6).
- Verifying, before the POC is called done, a known discrepancy flagged in the architecture spine (AD-6): `src/lib/supabase/server.ts` has a comment claiming session refresh is handled by "the middleware," but no `middleware.ts` exists anywhere in the repo — if session refresh isn't actually happening, FR-3's RLS backstop degrades silently for long-lived sessions.

### 6.2 Out of Scope for MVP
- Migrating the remaining five domains (admin/members, cycles, feedback, responder/invitation, read-only reports) — sequenced afterward, in that risk-ascending order, per the architecture spine's AD-8. Each is its own follow-on scope, not part of this MVP.
- Everything in §5's Non-Goals.

## 7. Success Metrics

**Primary (this MVP's gate)**
- **SM-2**: The report-groups POC (this MVP) works end to end — create, respond, close, AI interpretation — against seeded demo data with its flag on, before any other domain's migration starts. Validates FR-2, FR-3, FR-5, FR-6.

**North Star (the initiative overall, beyond this MVP)**
- **SM-1**: All six domains run on the new layering with their feature flags removed and old direct-Supabase paths deleted; the ESLint boundary rule holds at 0 violations repo-wide. Validates FR-1, FR-2, FR-5. Carried forward from `SPEC.md`'s own success signal — not this PRD's completion gate, §6 is.

**Counter-metrics (do not optimize)**
- **SM-C1**: Migration velocity (domains-per-week) is not a target to optimize — this app has zero pre-existing test coverage and no staging environment, so skipping or shortening the per-domain manual-QA/test-safety-net step (FR-6) to hit a schedule is exactly the failure mode this initiative's rollout discipline exists to prevent. Counterbalances SM-1.

## 8. Open Questions

1. Whether and how to introduce CI to run the ESLint boundary rule and the Vitest suite automatically (today both are local-only) — decide before the report-groups POC (this MVP) is considered done, not later. Carried from `SPEC.md`.
2. The exact token issuance/refresh/rotation flow and the CSRF-mitigation mechanism for the new app token (FR-3) — scoped to the scaffolding work itself, once the POC proves the surrounding pattern. Carried from `SPEC.md` and the architecture spine's AD-5.

## 9. Assumptions Index

- §2.1 — Target User framed as the builder/operator themselves ("this is for me as the builder"), since this is an infrastructure-facing initiative, not an end-user-facing product decision.
- §2.2 UJ-2 — the anonymous-evaluator journey is written as an invariant-to-preserve rather than a new experience, since FR-4's entire point is that nothing changes for this persona.

**Distillation-method disclosure** *(not an inferential assumption — noting the source relationship, not a gap in it)*: §1 Vision and §0 Document Purpose are elaborated prose distilled from `SPEC.md`'s single dense Why paragraph and the architecture spine's context, not verbatim quotes.
