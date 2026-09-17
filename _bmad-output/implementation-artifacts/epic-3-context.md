# Epic 3 Context: Remaining Backend Domain Migrations

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 1 proved the `db → managers → API` layering pattern end to end on the smallest domain (report groups). Epic 3 applies that same proven pattern — characterization tests → db/manager scaffolding → route handlers → thin-delegate refactor → feature flag → new-path verification — to the five remaining domains, in a fixed risk-ascending order: admin/members + auth, then cycles, then feedback, then responder/invitation (deliberately last, since it's the external, unauthenticated, highest-stakes-to-break surface), then read-only reports (lowest risk, purely read). Completing this epic means every domain in the product has moved off direct-Supabase calls from pages/actions and onto the new layering, gated safely behind per-domain flags — the prerequisite for Epic 4's UI redesign work per domain and for Epic 5's final legacy-code deletion.

## Stories

- Story 3.1: Characterization Tests for Admin/Members/Auth (done)
- Story 3.2: DB-Access and Manager Scaffolding for Admin/Members/Auth (done)
- Story 3.3: Admin/Members Route Handlers and Client Fetch Integration (done)
- Story 3.4: Admin/Members Server Actions Become Thin Delegates (done)
- Story 3.5: Admin/Members Feature Flag and Rollback Safety (done)
- Story 3.6: Admin/Members New-Path Verification Against the Characterization Baseline (done -- admin/members/auth domain block complete)
- Story 3.7: Characterization Tests for Cycles (done)
- Story 3.8: DB-Access and Manager Scaffolding for Cycles (done)
- Story 3.9: Cycles Route Handlers and Client Fetch Integration (done)
- Story 3.10: Cycles Server Actions Become Thin Delegates (done)
- Story 3.11: Cycles Feature Flag and Rollback Safety (done)
- Story 3.12: Cycles New-Path Verification Against the Characterization Baseline (done -- cycles domain block complete)
- Story 3.13: Characterization Tests for Feedback (done)
- Story 3.14: DB-Access and Manager Scaffolding for Feedback (done)
- Story 3.15: Feedback Route Handlers and Client Fetch Integration (done)
- Story 3.16: Feedback Server Actions Become Thin Delegates (done)
- Story 3.17: Feedback Feature Flag and Rollback Safety (done)
- Story 3.18: Feedback New-Path Verification Against the Characterization Baseline (done -- feedback domain block complete)
- Story 3.19: Characterization Tests for Responder/Invitation (done)
- Story 3.20: DB-Access and Manager Scaffolding for Responder/Invitation (done)
- Story 3.21: Responder/Invitation Route Handlers and Client Fetch Integration (done)
- Story 3.22: Responder/Invitation Pages Become Thin Delegates (done)
- Story 3.23: Responder/Invitation Feature Flag and Rollback Safety (done)
- Story 3.24: Responder/Invitation New-Path Verification Against the Characterization Baseline (done -- responder/invitation domain block complete)
- Story 3.25: Characterization Tests for Read-Only Reports (done)
- Story 3.26: Read-Model Composition for Read-Only Reports (done)
- Story 3.27: Read-Only Reports Route Handlers and Client Fetch Integration (done)
- Story 3.28: Read-Only Reports Pages Become Thin Delegates (done)
- Story 3.29: Read-Only Reports Feature Flag and Rollback Safety (done)
- Story 3.30: Read-Only Reports New-Path Verification Against the Characterization Baseline (done -- read-only-reports domain block complete; Epic 3 complete, all 6 backend domains migrated, Epic 5 legacy retirement may now begin)

## Requirements & Constraints

- Each domain must expose its logic through exactly one manager, callable identically in-process (Server Components/Actions) and over HTTP, with no added network hop for the in-process path.
- Route Handlers reject any request lacking a valid app-issued token (401) even with a valid Supabase session present; the underlying Supabase session keeps authenticating to satisfy existing RLS. Two kinds of routes are exempt from this: responder/invitee-facing routes (`/responder/[token]`, `/invitacion/[token]`, the submit route), which validate the single-use invitation token instead; and each domain's own `signin`/`signout` routes (e.g. `/api/auth/signin`), which by construction cannot require a token that doesn't exist yet — these instead gate on the anti-CSRF header alone. Neither kind is ever gated by `requireApiToken()`.
- Each domain's old and new paths coexist behind its own `USE_NEW_API_<DOMAIN>` flag (default off), checked only in the thin caller, never inside a manager. Old-path deletion happens later (Epic 5), only after one full production cycle (one complete Ciclo 360 lifecycle or 14 days, whichever is longer) with the flag on. Only one domain's flag flips per deploy.
- Each domain needs 2-3 passing integration tests before its flag flips: auth-boundary rejection, anonymity-threshold enforcement, and an old-vs-new golden-output comparison on the same seed. Tests run only against a locally seeded Supabase instance, never production; Server Component rendering itself is not unit-testable and stays manually verified.
- Feedback domain specifically must preserve anonymity-threshold behavior exactly (minimum 5 invitees, minimum 3 responses, floor never below 3, "jefe/responsable directo" exception at 1 response) — logic stays in the RPCs, not reimplemented.
- Cycles vs. feedback RPC ownership is split and must not cross: `cyclesManager` calls only cycle-lifecycle RPCs (`create_feedback_cycle`, `close_cycle_request`, `organize_cycle_evaluators`); `feedbackManager` calls only ad-hoc-lifecycle RPCs (`create_ad_hoc_feedback_request*`, `close_ad_hoc_feedback_request`). Both may read the shared `feedback_requests` table but neither re-implements the other's lifecycle writes.
- Read-only reports (dashboard home, Mi mapa, Informe empresa) get no dedicated manager — they compose the existing `cyclesManager`, `feedbackManager`, `membersManager`, and `adminManager` functions.

## Technical Decisions

- Reused as-is from Epic 1, not rebuilt per domain: the ESLint import-boundary rule + `server-only` backstop, the `requireApiToken()` mechanism, the app-token cookie/CSRF scheme, and the `src/lib/api/client.ts` fetch wrapper.
- File/naming convention: one file per domain per layer — `db/<domain>.ts`, `managers/<domain>Manager.ts`, `api/<domain>/route.ts` — flags named `USE_NEW_API_<DOMAIN>`. API errors use `{ error: { code, message } }` with HTTP status conveying the class (401/403/404/422/500). Manager return types use camelCase fields, `null` for absent values, ISO-8601 timestamps.
- "Thin delegate" stories (3.4, 3.10, 3.16, 3.22, 3.28) refactor callers to route through the new manager but must leave the old direct-Supabase code path intact and reachable — it stays alive behind that domain's flag so the following "Feature Flag and Rollback Safety" story has a real old path to gate and roll back to. Deleting the old path is explicitly out of scope until Epic 5.
- Responder/invitation (`responderManager`) validates its own single-use token and never calls `requireApiToken()` — a structurally different auth model from every other domain in this epic.
- Admin/members/auth introduces a second, distinct role structure to verify (platform admin vs. Supervisor vs. member) alongside the token pattern already proven in Epic 1.

## Cross-Story Dependencies

- Each domain's six-story block is self-contained and follows the same internal chain: the characterization-test story is the baseline that the scaffolding, thin-delegate, and verification stories are each re-run against; the verification story is the explicit gating condition for that domain's feature-flag rollout story.
- Cycles (3.8) and feedback (3.14) each declare their RPC ownership split independently; Story 3.12 checks it one-sided (cyclesManager only, since feedbackManager doesn't exist yet), and Story 3.18 completes the symmetric check once both managers exist.
- Responder/invitation's flag (3.23, gated by 3.24) is explicitly sequenced last: it flips only after admin/members, cycles, and feedback have each already survived their own full production cycle — not simply after its own tests pass.
- Read-only reports (3.26) has a hard dependency on `cyclesManager`, `feedbackManager`, `membersManager`, and `adminManager` already existing, since it composes them rather than introducing its own manager.
- Story 3.2 (already done) intentionally excluded `get_my_pending_invitations` from admin/members scope: despite epics.md listing it under Story 3.2's RPCs, it's actually a feedback-domain RPC (used in the dashboard's pending-tasks list) — it belongs to the feedback domain's scaffolding (Story 3.14), not admin/members.
- Epic 4's per-domain UI redesign stories are each gated on this epic's corresponding domain story landing first (backend migration before that domain's redesign), though Epic 4 itself is out of this epic's scope.
