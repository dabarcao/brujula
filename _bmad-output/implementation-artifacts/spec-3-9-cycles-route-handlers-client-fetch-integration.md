---
title: 'Cycles Route Handlers and Client Fetch Integration'
type: 'feature'
created: '2026-09-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c0350e1'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/server/managers/cyclesManager.ts` (Story 3.8) exists and is fully tested, but nothing exposes it over HTTP yet. Story 3.3 already proved the Route Handler + client-fetch pattern for admin/members; this story applies it identically to cycles.

**Scope correction (investigated, not guessed):** epics.md's Story 3.9 AC names only 3 literal example paths (`cycles/route.ts`, `cycles/[id]/route.ts`, `cycles/[id]/close/route.ts`) for what is actually an 8-function manager — under-specified shorthand, not a literal exhaustive route list (the same class of gap already found in Story 3.8's own AC, which named 7 RPCs for an 8-function manager). Worse, the 3 literal examples conflate two different id types under one `[id]` segment: `close` operates on a **request** id (`close_cycle_request(p_request_id)`), while `organizeEvaluators`/`getStatus` operate on a **cycle** id — a single `/api/cycles/[id]/**` tree cannot cleanly express both without ambiguity. This story resolves it with two disambiguated path prefixes: `/api/cycles/[cycleId]/**` for cycle-scoped operations, `/api/cycles/requests/[requestId]/**` for request-scoped ones — every route still satisfies the AC's actual testable behavior (valid app-token request invokes `cyclesManager`, returns the standard error envelope on failure; in-process and HTTP produce identical results against the same seed).

**Approach:** One Route Handler file per manager function (mirroring `src/app/api/admin/**`/`members/**`'s one-function-per-route shape exactly), all under `src/app/api/cycles/**`, all calling `requireAuthorizedRequest()` (from the already-generalized top-level `src/app/api/_shared.ts`, Story 3.3) before doing anything. Reuse `src/lib/api/client.ts`'s `apiFetch`/`ApiError` as-is (confirmed domain-agnostic, no changes needed). No Client Component calls these routes yet (confirmed: none of the repo's `"use client"` files touch cycles data) — pure API-surface scaffolding, same as every prior route-handler story in this initiative.

## Boundaries & Constraints

**Always:**
- Every route: `import "server-only";` first, calls its one corresponding `cyclesManager` function, never touches `@/server/db/*` or Supabase directly.
- Every route starts with `requireAuthorizedRequest(request)` from the top-level `_shared.ts`; return its non-null `Response` immediately if present.
- Error envelope, status codes, and try/catch shape match Story 3.3's pattern exactly: manager `Error` → 422 `validation_error` with the manager's own message text unchanged; non-`Error` throw → `console.error` + 500 `internal_error`; malformed request body → 422 `validation_error` before calling the manager; a malformed `[cycleId]`/`[requestId]` path param → 422 `validation_error` via `isValidUuid` (already exported by `_shared.ts`) before calling the manager.
- URL scheme (resolving the AC's own ambiguity, see Intent): `POST /api/cycles` (createCycle), `POST /api/cycles/[cycleId]/evaluators` (organizeEvaluators), `GET /api/cycles/[cycleId]/status` (getStatus), `GET /api/cycles/colleagues-closed` (getColleaguesWithClosedCycle), `POST /api/cycles/requests` (createIndividualRequest), `POST /api/cycles/requests/[requestId]/close` (closeRequest), `PATCH /api/cycles/requests/[requestId]/evaluators` (updateRequestEvaluators), `PATCH /api/cycles/requests/[requestId]/evaluators-by-email` (updateIndividualRequestEvaluators).
- New test file re-verifies the auth-gating contract (missing token → 401, missing CSRF → 403 on mutating routes, manager never invoked on rejection) for all 8 routes, mirroring `tests/integration/admin-members-auth-route.test.ts`'s shape, plus at least one real happy-path call per route against the local Supabase instance.

**Never:**
- Do not touch `src/app/actions/cycles.ts` or any page under `src/app/dashboard/cycles/**`/`src/app/dashboard/feedback/**` — delegating them is Story 3.10's job.
- Do not modify `src/app/api/_shared.ts`, `src/app/api/admin/**`, `src/app/api/members/**`, `src/app/api/auth/**`, or `src/lib/api/client.ts` — all already shipped and reviewed.
- Do not add any route the manager layer doesn't already expose (no new manager functions, no business-logic changes).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `POST /api/cycles`, valid token+CSRF, valid body | as the Supervisor | 201, `{ cycleId }` | N/A |
| `POST /api/cycles`, missing app token | no cookie | 401 `unauthorized`, `createCycle` never invoked | N/A |
| `POST /api/cycles/[cycleId]/evaluators`, valid token, missing CSRF | valid token, no header | 403 `forbidden`, `organizeEvaluators` never invoked | N/A |
| `POST /api/cycles/[cycleId]/evaluators`, malformed `cycleId` | not a UUID | 422 `validation_error`, `organizeEvaluators` never invoked | N/A |
| `POST /api/cycles/requests/[requestId]/close`, RPC rejects | a request not eligible to close | 422, the RPC's own exact message | thrown-not-swallowed |
| `GET /api/cycles/[cycleId]/status`, valid token | as the Supervisor | 200, array of status rows | N/A |
| `GET /api/cycles/colleagues-closed`, valid token | any authenticated caller | 200, array (possibly empty) | N/A |
| `PATCH /api/cycles/requests/[requestId]/evaluators`, valid token+CSRF, valid body | as the Supervisor | 200, `null` body | N/A |

</frozen-after-approval>

## Code Map

- `src/app/api/_shared.ts` (Story 3.3, generalized) -- `jsonError`, `requireAuthorizedRequest`, `isValidUuid` — reuse as-is, no changes.
- `src/app/api/admin/organizations/route.ts`, `[id]/route.ts`, `src/app/api/members/invite/route.ts` (Story 3.3) -- exact Route Handler shape to mirror: manual body parsing/validation, `requireAuthorizedRequest` first, try/catch, `Error` → 422, non-`Error` → 500, void-returning managers → `Response.json(null, { status: 200 })`.
- `src/lib/api/client.ts` -- `apiFetch<T>`, `ApiError` -- already domain-agnostic; reuse as-is.
- `src/server/managers/cyclesManager.ts` (Story 3.8) -- exact signatures: `createCycle(name, opensAt, closesAt, participantMemberIds)`, `closeRequest(requestId)`, `organizeEvaluators(cycleId, evaluatorMemberIds, evaluatorCategories)`, `createIndividualRequest(evaluatorEmails, evaluatorCategories, closesAt, name)`, `updateRequestEvaluators(requestId, evaluatorMemberIds, evaluatorCategories)`, `updateIndividualRequestEvaluators(requestId, evaluatorEmails, evaluatorCategories)`, `getStatus(cycleId)`, `getColleaguesWithClosedCycle()`.
- `tests/integration/admin-members-auth-route.test.ts` (Story 3.3) -- the auth-gating test shape (missing token/missing CSRF, manager-never-invoked assertions, `isValidUuid` rejection test) to mirror in the new test file.
- `tests/characterization/cycles.test.ts`, `tests/characterization/cycles-manager.test.ts` (Stories 3.7/3.8) -- fixtures/exact RPC error messages already confirmed there, reusable for this story's happy-path/error-path route tests.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/api/cycles/route.ts` -- new -- POST → `createCycle`
- [x] `src/app/api/cycles/[cycleId]/evaluators/route.ts` -- new -- POST → `organizeEvaluators`
- [x] `src/app/api/cycles/[cycleId]/status/route.ts` -- new -- GET → `getStatus`
- [x] `src/app/api/cycles/colleagues-closed/route.ts` -- new -- GET → `getColleaguesWithClosedCycle`
- [x] `src/app/api/cycles/requests/route.ts` -- new -- POST → `createIndividualRequest`
- [x] `src/app/api/cycles/requests/[requestId]/close/route.ts` -- new -- POST → `closeRequest`
- [x] `src/app/api/cycles/requests/[requestId]/evaluators/route.ts` -- new -- PATCH → `updateRequestEvaluators`
- [x] `src/app/api/cycles/requests/[requestId]/evaluators-by-email/route.ts` -- new -- PATCH → `updateIndividualRequestEvaluators`
- [x] `tests/integration/cycles-route.test.ts` -- new -- auth-gating matrix (401/403/422, manager-never-invoked) for all 8 routes, plus at least one real happy-path call per route

**Acceptance Criteria:**
- Given any cycles route, when called with no app-token cookie, then it returns 401 and the underlying manager function is never invoked.
- Given any cycles mutation route, when called with a valid token but no CSRF header, then it returns 403 and the underlying manager function is never invoked.
- Given the same manager functions, when called in-process versus over HTTP with the same seed, then both produce identical results.
- Given Story 3.7's/3.8's characterization and manager suites, when this story is complete, then they still pass unchanged.

## Implementation Notes

**New files:**
- 8 Route Handlers under `src/app/api/cycles/**`, one per `cyclesManager` function, each mirroring Story 3.3's `src/app/api/admin/organizations/route.ts`/`[id]/route.ts`/`src/app/api/members/invite/route.ts` shape exactly: `import "server-only";` first, `requireAuthorizedRequest(request)` first (return its `Response` immediately if non-null), manual body parsing/validation (malformed JSON or a wrong-shaped field → 422 `validation_error` before calling the manager, no exception), `isValidUuid` guard on every `[cycleId]`/`[requestId]` path param before calling the manager, try/catch around the manager call (`Error` → 422 `validation_error` with the manager's own message text unchanged; non-`Error` → `console.error` + 500 `internal_error`), void-returning managers → `Response.json(null, { status: 200 })`. Per the frozen Boundaries' URL scheme: `POST /api/cycles` (201 `{cycleId}`), `POST /api/cycles/[cycleId]/evaluators` (201 `{requestId}` -- a creation, same status convention as `createOrganization`/`inviteNewMember`/`createNewDepartment`), `GET /api/cycles/[cycleId]/status` (200, array), `GET /api/cycles/colleagues-closed` (200, array), `POST /api/cycles/requests` (201 `{requestId}`), `POST /api/cycles/requests/[requestId]/close` (200 `null`), `PATCH /api/cycles/requests/[requestId]/evaluators` (200 `null`), `PATCH /api/cycles/requests/[requestId]/evaluators-by-email` (200 `null`).
- `tests/integration/cycles-route.test.ts` -- 34 new `test()` blocks, mirroring `tests/integration/admin-members-auth-route.test.ts`'s shape: only `@/lib/supabase/server` is mocked (unlike Story 3.3's suite, no `next/headers` mock is needed -- none of these 8 routes read/write cookies), real signed app tokens throughout. Covers: 401 missing-token + manager-never-invoked for all 8 routes; 403 missing-CSRF + manager-never-invoked for all 6 mutating routes; 422 malformed-`[cycleId]`/`[requestId]` + manager-never-invoked for the 5 UUID-path-param routes; 422 malformed-body + manager-never-invoked for 3 representative body-taking routes; a fresh `scripts/seed-demo-company.mjs` fixture chain (same technique as `tests/characterization/cycles-manager.test.ts`) exercising every one of the 8 routes over at least one real, non-mocked-RPC happy path, plus 5 RPC-rejection error-path tests reusing the exact recorded RPC message strings from Story 3.8's own suite (`create_feedback_cycle`'s open-cycle-conflict prefix, `get_cycle_status`'s non-supervisor message, `create_individual_cycle_request`'s malformed-email message, `update_cycle_request_evaluators`'s already-closed message, `close_cycle_request`'s not-eligible message).

**No production files outside the 8 new route files were touched** -- `src/app/api/_shared.ts`, `src/app/api/admin/**`, `src/app/api/members/**`, `src/app/api/auth/**`, `src/lib/api/client.ts`, `src/server/managers/cyclesManager.ts`, `src/app/actions/cycles.ts`, and every page under `src/app/dashboard/cycles/**`/`src/app/dashboard/feedback/**` remain unmodified, as required by this story's Never boundaries.

**In-process vs. HTTP equivalence (AC 3):** every route calls the identical `cyclesManager` function the manager-level suite (Story 3.8) already exercises directly, with no additional transformation of inputs/outputs beyond JSON (de)serialization and the shared error envelope -- there is no route-local business logic that could diverge between the two call paths. Not separately re-asserted byte-for-byte in the new suite beyond the shared RPC-message/shape assertions already listed above.

**Nothing left incomplete.** No formal multi-lens review loop (`bmad-review`/`bmad-build`'s review step) was run against this diff as part of this implementation pass -- the frontmatter `status` is left at `in-progress` and `review_loop_iteration` at `0` pending that step; `_bmad-output/implementation-artifacts/sprint-status.yaml`'s `3-9` entry is left as `in-progress` for the same reason, matching Story 3.8's own precedent.

## Spec Change Log

## Review Triage Log

**3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap):**

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | `PATCH /api/cycles/requests/[requestId]/evaluators` is the only one of 5 UUID-path-param routes with no malformed-`requestId` test, despite the route's own `isValidUuid` guard and the spec's own claim of "5 UUID-path-param routes" covered | medium | patch | Independently found by all three lenses (Verification Gap, Blind Hunter, Edge Case Hunter), each confirming the same 4-sibling-routes-have-it, this-one-doesn't gap by listing every test title in the file. |
| 2 | `POST /api/cycles/[cycleId]/evaluators` and `PATCH /api/cycles/requests/[requestId]/evaluators-by-email` never get a malformed-body test -- every call in the suite sends an already-valid body, so their `Array.isArray`/`every(...)` guards are never exercised | medium | patch | Verified: only 3 of 5 body-taking routes have this test. Directly against the frozen spec's own "Always" commitment ("malformed request body → 422 validation_error before calling the manager" for every route). |
| 3 | 5 locations (createCycle's `participantMemberIds`, organizeEvaluators's/updateRequestEvaluators's `evaluatorMemberIds`, createCycle's `opensAt`/`closesAt`, createIndividualRequest's `closesAt`) only check `typeof === "string"`, not UUID/date format -- a malformed array element or date string reaches the RPC and leaks a raw Postgres error instead of this story's friendly `validation_error` convention | medium | patch | Verified against the RPC's own typed params (`uuid[]`/`date`). Matches the exact class of defect Story 3.3's own review treated as patch-worthy (raw Postgres UUID error leak) -- 3 of 5 locations are trivially fixable by reusing the already-imported `isValidUuid` helper; the 2 date fields need a `Date.parse` guard. |
| 4 | Implementation Notes claims "4 RPC-rejection error-path tests" but the file actually has 5 (`createCycle`, `getStatus`, `createIndividualRequest`, `updateRequestEvaluators`, `closeRequest`) | low | fixed directly | Trivial arithmetic/documentation error, non-frozen section, corrected directly rather than routed through the implementer. |
| 5 | Spec frontmatter (`in-review`) and Implementation Notes text ("left at in-progress") appear to disagree | false | — | Self-referential timing artifact: the implementer truthfully reported `in-progress`; the orchestrator advanced the spec to `in-review` before dispatching review, per this session's established convention (identical to Story 3.8's own finding #1). |
| 6 | AC3's "in-process versus over HTTP" is only tested by invoking the exported route function directly with a constructed `Request`, never via a real running server/network call | n/a | rejected (false) | Matches the established, already-accepted Route Handler testing convention from Story 3.3's own suite (`admin-members-auth-route.test.ts` uses the identical technique) -- not a gap this story introduces. |
| 7 | `apiFetch`/`ApiError` (the "Client Fetch" half of this story's title) is never called against any of the 8 new routes in the test suite | n/a | rejected (false) | Verified: Story 3.3's own suite doesn't test `apiFetch` against its new routes either -- already-accepted precedent, not a new gap. |
| 8 | All 8 new route files re-declare nearly identical `invalidBody`/`invalidId` closures and repeated array-validation blocks -- a missed extraction opportunity now that the pattern has repeated across two full stories (3.3, 3.9) | low | defer | Real, matches the established "extract-on-first-real-reuse" pattern already deferred multiple times this session (e.g. `_shared.ts` duplication in Story 3.3). Touches already-shipped admin/members code if extracted now -- logged for a future dedicated refactor. |
| 9 | No route validates that `evaluatorCategories` array elements are actually members of the `CycleParticipantCategory` union, only that each is a `string` | low | defer | Real but matches the accepted, repo-wide validation-depth convention (admin/members routes have the identical limitation, never patched). Enforcing enum membership consistently is a moderate scope expansion, not a trivial fix. |

No `intent_gap` or `bad_spec` entries -- no loopback triggered. Additionally verified (not a finding): `npx next build` succeeds cleanly with all 8 new routes correctly resolved alongside their sibling static/dynamic segments -- confirms the disambiguated `[cycleId]`/`requests/[requestId]` routing design compiles with no ambiguity.

## Verification

**Commands:**
- `npm run test` -- expected: all 192 prior tests pass, plus this story's new integration tests (actual: 234/234 passed -- 192 prior + 42 new, after the review's 8 added tests)
- `npm run lint` -- expected: no new violations (actual: 0 errors, 1 pre-existing unrelated warning in `scripts/seed-company-360.mjs`, unchanged by this story)
- `npx tsc --noEmit` -- expected: no new type errors (actual: none)
