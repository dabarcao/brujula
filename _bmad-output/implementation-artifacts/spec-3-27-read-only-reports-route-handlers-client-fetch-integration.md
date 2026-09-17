---
title: 'Read-Only Reports Route Handlers and Client Fetch Integration'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '641382b'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The 6 manager functions Story 3.26 added have no HTTP surface — only in-process callers can reach them. epics.md's own AC conditions Client Component wiring on "if any" such component exists.

**Approach:** Add one GET Route Handler per function, mirroring Story 3.15's own established shape (`requireAuthorizedRequest()` gate, `try/catch` → `422 validation_error`/`500 internal_error`, no Client Component wiring since none exists — verified at the route level via in-process-vs-HTTP parity tests, matching Story 1.5/3.9/3.15's identical precedent).

**Scope corrections (investigated, not guessed):**
- Confirmed via direct read: `dashboard/page.tsx`, `mi-mapa/page.tsx`, `informe-empresa/page.tsx` import zero Client Components that fetch data (their only shared component, `CompetencyRadar`, is itself a Server Component — "no `use client`, no interactivity" per its own header comment). epics.md's Story 3.27 AC's first clause ("Given any Client Component... if any") is vacuously satisfied — matches Story 1.5/3.9/3.15's identical documented situation for their own domains at this same phase (Client Component wiring happens later, if ever, not in any domain's own route-handlers story).
- AD-3/AD-4 (architecture spine) requires Route Handlers as the general HTTP surface regardless of current Client Component consumption — "Client Components and any non-browser client call Route Handlers"; every domain's own route-handlers story builds routes ahead of consumption, proven by identical precedent.
- Since Story 3.26 placed all 6 functions inside 4 pre-existing managers (not a new `reportsManager`), this story symmetrically places each new route inside that manager's pre-existing `src/app/api/**` namespace — 4 of 6 add a `GET` handler to an existing (currently POST-only) `route.ts` file (idiomatic REST: `GET` lists, `POST` creates, same path), the other 2 are new sibling files where the bare path is already taken by an unrelated `GET` (`members`) or would be semantically ambiguous (`feedback-requests/competency-map`).

## Boundaries & Constraints

**Always:** Every route calls `requireAuthorizedRequest()` before touching its manager (this domain is NOT responder/invitation-exempt — standard token gate applies). Every route calls only the one manager function it wraps, never `db/*` or Supabase directly. Every route returns the `{ error: { code, message } }` envelope on failure. All 6 routes are `GET`-only (no mutating method added) — `requireApiToken()`'s CSRF-header check is skipped automatically for `GET` (confirmed in `src/server/shared/auth.ts`), so no CSRF-rejection row applies.

**Never:** Do not modify any page under `src/app/dashboard/**`, `src/server/managers/*.ts`, or `src/server/db/*.ts` (Story 3.26's files stay as delivered). Do not add a Client Component or wire `apiFetch` into any page — none exists to wire, per this story's own investigated correction. Do not touch `tests/characterization/read-only-reports.test.ts` or `read-only-reports-manager.test.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `GET /api/feedback-requests`, no app token | missing/invalid token cookie | 401 unauthorized envelope | N/A |
| `GET /api/feedback-requests`, valid | authenticated caller | 200, ad_hoc-only rows | N/A |
| `GET /api/feedback-requests/competency-map`, closed 360 | authenticated caller | 200, per-competency rows | N/A |
| `GET /api/feedback-requests/competency-map`, no closed 360 | authenticated caller | 200, `[]` | N/A |
| `GET /api/cycles`, valid | authenticated caller | 200, open-cycle rows | N/A |
| `GET /api/cycles/requests`, valid | authenticated caller | 200, cycle-type request rows | N/A |
| `GET /api/report-groups`, valid | authenticated caller | 200, group rows | N/A |
| `GET /api/members/organization-competency-summary`, Supervisor | Supervisor caller | 200, aggregate rows | N/A |
| `GET /api/members/organization-competency-summary`, non-Supervisor | regular employee | 422 validation_error, RPC's own exact message | thrown-not-swallowed |
| Same manager functions, in-process vs over HTTP | identical seeded state | identical results | N/A |

</frozen-after-approval>

## Code Map

- `src/app/api/feedback-requests/route.ts` (Story 3.15, POST-only today) -- add `GET` → `feedbackManager.getMyAdHocRequests()`.
- `src/app/api/feedback-requests/competency-map/route.ts` -- new -- `GET` → `feedbackManager.getMyCompetencyMap()`.
- `src/app/api/cycles/route.ts` (Story 3.9, POST-only today) -- add `GET` → `cyclesManager.getMyOpenCycles()`.
- `src/app/api/cycles/requests/route.ts` (Story 3.9, POST-only today) -- add `GET` → `cyclesManager.getMyCycleRequests()`.
- `src/app/api/report-groups/route.ts` (Story 1.5, POST-only today) -- add `GET` → `reportGroupsManager.getMyReportGroups()`.
- `src/app/api/members/organization-competency-summary/route.ts` -- new -- `GET` → `membersManager.getOrganizationCompetencySummary()` (bare `members/route.ts` already has an unrelated `GET`, per Story 3.3).
- `src/app/api/_shared.ts` -- `requireAuthorizedRequest()`/`jsonError()`, import from here.
- `tests/integration/feedback-route.test.ts` (Story 3.15) -- exact shape to mirror for the new test additions/file.
- `src/server/shared/auth.ts` -- `signAppToken()`, needed by the new tests.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/api/feedback-requests/route.ts` -- add `GET` handler
- [x] `src/app/api/feedback-requests/competency-map/route.ts` -- new -- `GET` handler
- [x] `src/app/api/cycles/route.ts` -- add `GET` handler
- [x] `src/app/api/cycles/requests/route.ts` -- add `GET` handler
- [x] `src/app/api/report-groups/route.ts` -- add `GET` handler
- [x] `src/app/api/members/organization-competency-summary/route.ts` -- new -- `GET` handler
- [x] `tests/integration/read-only-reports-route.test.ts` -- new -- exercises every I/O matrix row, including in-process-vs-HTTP parity for all 6 routes

**Acceptance Criteria:**
- Given any Client Component on these three pages that fetches client-side (none exist today), when identified, then it calls the new API via `apiFetch` — vacuously satisfied, documented above
- Given the composed read path, when called in-process versus over HTTP against identical seeded data, then results are identical for all 6 functions

## Implementation Notes

**4 existing `route.ts` files gained a `GET` export, 2 new sibling files were added** -- exactly as the Code Map laid out. `feedback-requests/route.ts`, `cycles/route.ts`, and `cycles/requests/route.ts` each import their one new manager function alongside the existing `POST`-only import and append a `GET` handler using the identical shape already established by `cycles/colleagues-closed/route.ts` and `feedback-requests/pending-invitations/route.ts` (Stories 3.9/3.15): `requireAuthorizedRequest()` gate, `try { ...; Response.json(result, {status:200}) } catch` mapping any thrown `Error` to `422 validation_error` with the error's own message, any non-`Error` throw to `500 internal_error`. `report-groups/route.ts` follows the same shape but imports `jsonError`/`requireAuthorizedRequest` from its own local `./_shared` (not the global `../_shared`), matching that file's existing import -- the two `_shared.ts` files are genuinely different modules (report-groups/_shared.ts predates the global one and was never consolidated); this story didn't touch either, just followed the import each route.ts already used.

**Two new files:** `feedback-requests/competency-map/route.ts` and `members/organization-competency-summary/route.ts`, both `GET`-only, no route params, same handler shape as above. `members/organization-competency-summary/route.ts` lives beside (not inside) `members/route.ts` because that bare path already has an unrelated `GET` (Story 3.3, `?orgId=...` -> `listMembers`).

**No page, manager, or db file was touched** -- confirmed via `git diff --stat`: only the 4 existing route.ts files, 2 new route.ts files, this spec, `sprint-status.yaml`, and the new test file changed.

**Test file:** `tests/integration/read-only-reports-route.test.ts` (6 `describe` blocks for auth gating plus one `describe` per route, 21 `test()` total), mirroring `tests/integration/feedback-route.test.ts`/`cycles-route.test.ts`'s mocking shape (only `@/lib/supabase/server` mocked, real signed app tokens via `signAppToken`, no CSRF-header rows since all 6 routes are `GET`-only). Fixture: reused `tests/characterization/read-only-reports-manager.test.ts`'s (Story 3.26) own org A (8-employee demo company) + org B (minimal, Supervisor-only) setup and render-state mapping (`dashboardEmployee` for ad_hoc/open-cycle/cycle-request/no-closed-360/non-Supervisor states, `closedInvitee` for closed-360, `reportGroupCreator`+`reportGroupId` for report groups, `supervisorBToken` for the empty-org-summary state) -- deliberately not re-derived from scratch, since this story's routes wrap the identical manager functions Story 3.26 already characterized. Covers every I/O & Edge-Case Matrix row, including the explicit in-process-vs-HTTP parity assertion (`expect(httpResult).toEqual(inProcessResult)`) for all 6 functions, and the non-Supervisor 422 case asserting the RPC's own exact Spanish message end-to-end through the route.

**Verification:** `npx tsc --noEmit` clean; `npm run lint` 0 new errors/warnings (1 pre-existing unrelated warning in `scripts/seed-company-360.mjs`); `npx vitest run tests/integration/read-only-reports-route.test.ts` 21/21 passed; `tests/characterization/read-only-reports.test.ts`/`read-only-reports-manager.test.ts` re-run unmodified, 30/30 passed; `npm run test` full suite 489/489 passed across 28 files.

**Nothing left incomplete.** All 6 routes are live, GET-only, token-gated, calling exactly one manager function each. No Client Component wiring was added (none exists to wire, per this story's own frozen Intent) -- that AC clause remains vacuously satisfied, same as Stories 1.5/3.9/3.15. Residual, not a defect: `report-groups/`'s two parallel `_shared.ts` modules remain unconsolidated (pre-existing since Story 1.5, out of this story's Boundaries to touch).

## Spec Change Log

## Review Triage Log

3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap) run against the diff at baseline `641382b`. All three came back clean -- no patchable findings.

- **[clean]** Blind Hunter: confirmed all 4 modified `route.ts` files' pre-existing `POST` handlers are byte-identical/untouched; every `GET` handler calls exactly one manager function with no extra logic; every route has both the `Error`→422 and non-`Error`→500 branches; `report-groups/_shared.ts` and the global `_shared.ts` produce an identical 401 envelope for a missing token (diffed line-for-line). No findings.
- **[clean]** Edge Case Hunter: confirmed all 6 wrapped functions are genuinely zero-arg (no query-param input surface exists to test); judged manager-internal scoping/error-path re-proof at the route layer as correctly redundant (Story 3.26's suite already covers it, the route has no identity-touching logic of its own); judged the single "pending" `getMyReportGroups` state as sufficient at this layer since Story 3.26 already exhaustively covers creator/accept-flow field-mapping. No findings.
- **[clean]** Verification Gap: every claim checked (zero-arg functions, zero data-fetching Client Components including `CompetencyRadar`'s Server Component status, GET's CSRF exemption, the two `_shared.ts` files' genuine independence and identical behavior, the cookie-read mechanism, the exact RPC message, diff scope, test count) held up against direct inspection. No overclaims found.
- **[defer]** Verification Gap: `src/app/api/_shared.ts`'s own header comment still says "shared by every route.ts under `src/app/api/report-groups/**`" -- stale (it's the global cross-domain file since Story 3.4), pre-existing, out of this story's Boundaries (this story didn't touch that file's header).

## Verification

**Commands:**
- `npx vitest run tests/integration/read-only-reports-route.test.ts` -- expected: all pass
- `npx vitest run tests/characterization/read-only-reports.test.ts tests/characterization/read-only-reports-manager.test.ts` -- expected: still all pass, unmodified
- `npm run test` -- expected: all existing tests pass, plus this story's new tests
- `npm run lint` -- expected: 0 new errors/warnings
- `npx tsc --noEmit` -- expected: no type errors
