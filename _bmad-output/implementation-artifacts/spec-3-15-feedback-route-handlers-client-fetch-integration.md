---
title: 'Feedback Route Handlers and Client Fetch Integration'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '99fc183c4f3825ce688a1a24873021ecf9cc9c70'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `feedbackManager` (Story 3.14) has no HTTP surface yet — Client/Server Components in the feedback surfaces cannot reach it over `/api/**`, only in-process (and nothing calls it in-process yet either, since `src/app/actions/feedback.ts` is unmodified until Story 3.16).

**Approach:** Add one Route Handler file per `feedbackManager` function (7 total), mirroring Story 3.9's `src/app/api/cycles/**` shape exactly: `requireAuthorizedRequest()` gate, manual body/param validation returning `422 validation_error`, `try/catch` around the manager call mapping thrown `Error` to `422 validation_error` (RPC's own message, unmodified) and any non-`Error` throw to `500 internal_error`. No Client Component wiring is added — none of this domain's Client Components exist yet to wire (confirmed by investigation, same situation Story 1.5/3.9 already documented for their own domains); this is verified at the Route Handler level via tests, same as those stories.

## Boundaries & Constraints

**Always:** Every route calls `requireAuthorizedRequest()` (from `src/app/api/_shared.ts`, the generalized cross-domain helper Epic 3 already established) before touching `feedbackManager`. Every route calls only `feedbackManager`, never `@/server/db/feedback` or Supabase directly. `[id]` path segments are validated with `isValidUuid()` before use. Every route returns the `{ error: { code, message } }` envelope on failure, per AD-5.

**Never:** Do not modify `src/app/actions/feedback.ts`, any `src/app/dashboard/feedback/**` page, `src/server/db/feedback.ts`, or `src/server/managers/feedbackManager.ts` (Story 3.14's files stay as delivered). Do not add per-domain typed client fetchers — `src/lib/api/client.ts`'s existing generic `apiFetch<T>()` (Story 1.5) is the one client-side mechanism, domain-agnostic by design; do not extend it. Do not touch `tests/characterization/feedback.test.ts` or `feedback-manager.test.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `POST /api/feedback-requests`, no app token | missing/invalid `brujula_app_token` cookie | 401 unauthorized envelope | N/A |
| `POST /api/feedback-requests`, missing CSRF header | valid token, no `x-brujula-csrf` | 403 forbidden envelope | N/A |
| `POST /api/feedback-requests`, valid | `{ inviteeMemberIds: string[] (>=5) }` | 201, `{ requestId }` | N/A |
| `POST /api/feedback-requests`, malformed body | `inviteeMemberIds` not an array of strings | 422 validation_error, generic body-shape message | N/A |
| `POST /api/feedback-requests`, RPC rejects | `< 5` invitees | 422 validation_error, RPC's own exact message | thrown-not-swallowed |
| `POST /api/feedback-requests/individual`, valid | `{ inviteeEmails: string[] }`, individual-kind org caller | 201, `{ requestId }` | N/A |
| `GET /api/feedback-requests/[id]`, malformed id | non-UUID path segment | 422 validation_error | N/A |
| `GET /api/feedback-requests/[id]`, below threshold | `< 3` responses | 200, `[]` | N/A |
| `GET /api/feedback-requests/[id]`, non-requester caller | caller is an invitee, not requester | 422 validation_error, RPC's own exact access-control message | thrown-not-swallowed |
| `PATCH /api/feedback-requests/[id]/evaluators`, has responses | request already has >= 1 response | 422 validation_error, RPC's own exact message | thrown-not-swallowed |
| `POST /api/feedback-requests/[id]/cancel`, valid | open, zero-response request | 200 | N/A |
| `POST /api/feedback-requests/[id]/close`, already closed | second close attempt | 422 validation_error, RPC's own exact message | thrown-not-swallowed |
| `GET /api/feedback-requests/pending-invitations`, valid | caller has an unused invitation | 200, array including that invitation | N/A |
| Same manager functions, in-process vs over HTTP | identical seeded state | identical results (incl. below-threshold `[]`) | N/A |

</frozen-after-approval>

## Code Map

- `src/app/api/cycles/**` (Story 3.9) -- exact shape to mirror: one file per manager function, `requireAuthorizedRequest()` gate, `isValidUuid()` param checks, `try/catch` → `422 validation_error`/`500 internal_error`. Static sibling paths (`cycles/colleagues-closed/route.ts`) coexist with a dynamic segment (`cycles/[cycleId]/**`) at the same directory level -- Next.js resolves static routes with priority, confirmed already working precedent to reuse for `feedback-requests/individual` and `feedback-requests/pending-invitations` sitting alongside `feedback-requests/[id]/**`.
- `src/app/api/_shared.ts` -- the generalized (Epic 3) `requireAuthorizedRequest()`/`jsonError()`/`isValidUuid()` helpers; import from here, not `src/app/api/report-groups/_shared.ts` (Epic 1's original, left in place, not retrofitted, per this initiative's extract-on-reuse pattern).
- `src/server/managers/feedbackManager.ts` (Story 3.14) -- the 7 functions to expose: `createRequest`, `createIndividualRequest`, `cancelRequest`, `closeRequest`, `updateRequestEvaluators`, `getCompetencyNarrative`, `getMyPendingInvitations`. Also exports `FeedbackSubtype`/`EvaluatorCategory` types added during that story's review.
- `tests/integration/cycles-route.test.ts` (Story 3.9) -- exact shape to mirror for the new `tests/integration/feedback-route.test.ts`: only `@/lib/supabase/server` mocked, route handler functions imported directly and invoked with constructed `Request` objects, real signed app tokens via `signAppToken()` (Story 1.4), same `scripts/seed-demo-company.mjs` fixture technique.
- `src/server/shared/auth.ts` -- `APP_TOKEN_COOKIE`, `CSRF_HEADER`, `signAppToken()` -- needed by the new test file to construct authorized requests.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/api/feedback-requests/route.ts` -- create -- `POST` → `createRequest`
- [x] `src/app/api/feedback-requests/individual/route.ts` -- create -- `POST` → `createIndividualRequest`
- [x] `src/app/api/feedback-requests/pending-invitations/route.ts` -- create -- `GET` → `getMyPendingInvitations`
- [x] `src/app/api/feedback-requests/[id]/route.ts` -- create -- `GET` → `getCompetencyNarrative`
- [x] `src/app/api/feedback-requests/[id]/evaluators/route.ts` -- create -- `PATCH` → `updateRequestEvaluators`
- [x] `src/app/api/feedback-requests/[id]/cancel/route.ts` -- create -- `POST` → `cancelRequest`
- [x] `src/app/api/feedback-requests/[id]/close/route.ts` -- create -- `POST` → `closeRequest`
- [x] `tests/integration/feedback-route.test.ts` -- create -- exercises every I/O & Edge-Case Matrix row above, including the in-process-vs-HTTP parity row

**Acceptance Criteria:**
- Given `src/app/api/feedback-requests/route.ts` and `feedback-requests/[id]/route.ts` (and their sibling route files), when a valid app-token request calls any, then it invokes `feedbackManager` and returns the standard error envelope on failure
- Given the same manager functions, when called in-process versus over HTTP against identical seeded data, then both produce identical results, including the below-threshold `[]` state

## Implementation Notes

**New files:** 7 Route Handlers under `src/app/api/feedback-requests/**`, one per `feedbackManager` function, mirroring Story 3.9's `src/app/api/cycles/**` shape exactly: `import "server-only";` first, `requireAuthorizedRequest(request)` first (return its `Response` immediately if non-null), manual body parsing/validation (malformed JSON or a wrong-shaped field → 422 `validation_error` before calling the manager), `isValidUuid` guard on every `[id]` path param before calling the manager, try/catch around the manager call (`Error` → 422 `validation_error` with the manager's own message text unchanged; non-`Error` → `console.error` + 500 `internal_error`), void-returning managers (`cancelRequest`/`closeRequest`/`updateRequestEvaluators`) → `Response.json(null, { status: 200 })`. Routes and status codes: `POST /api/feedback-requests` (201 `{requestId}`), `POST /api/feedback-requests/individual` (201 `{requestId}`), `GET /api/feedback-requests/pending-invitations` (200, array), `GET /api/feedback-requests/[id]` (200, array, `[]` below the reveal threshold), `PATCH /api/feedback-requests/[id]/evaluators` (200 `null`), `POST /api/feedback-requests/[id]/cancel` (200 `null`), `POST /api/feedback-requests/[id]/close` (200 `null`).

`createRequest`/`createIndividualRequest`'s `subtype`/`name` parameters (both carry JS defaults in `feedbackManager`, `"general"`/`null`) are accepted as optional body fields -- present-but-invalid is rejected as `validation_error`, absent is passed through as `undefined` so the manager's own default applies. This matches the I/O matrix's own valid-body examples (`{ inviteeMemberIds: [...] }`, `{ inviteeEmails: [...] }`, neither showing `subtype`/`name`) and `src/app/actions/feedback.ts`'s own optional-field handling for the same two RPCs (read-only reference, unmodified).

Static sibling paths (`feedback-requests/individual/route.ts`, `feedback-requests/pending-invitations/route.ts`) coexist with the dynamic `feedback-requests/[id]/**` segment at the same directory level, confirmed working (Story 3.9 precedent, re-verified here by `npx tsc --noEmit` resolving all 7 routes with no ambiguity and every route test passing).

`tests/integration/feedback-route.test.ts` -- 31 new `test()` blocks, mirroring `tests/integration/cycles-route.test.ts`'s shape: only `@/lib/supabase/server` is mocked, real signed app tokens throughout (`signAppToken`, Story 1.4). Covers: 401 missing-token + manager-never-invoked for all 7 routes; 403 missing-CSRF + manager-never-invoked for the 5 mutating routes; 422 malformed-`[id]` + manager-never-invoked for the 4 `[id]`-path-param routes; 422 malformed-body + manager-never-invoked for 4 representative body-taking cases (`inviteeMemberIds` not an array, a malformed uuid inside it, malformed JSON, `inviteeEmails` not an array, missing `inviteeMemberIds` on the evaluators PATCH); a fresh `scripts/seed-demo-company.mjs` fixture chain (8 employees, same technique as `tests/characterization/feedback-manager.test.ts`) exercising every one of the 7 routes over at least one real, non-mocked-RPC happy path, plus the RPC-rejection error-path rows from the I/O matrix (`create_ad_hoc_feedback_request`'s below-min-invitees message, `update_ad_hoc_feedback_request_evaluators`'s has-responses message, `get_request_competency_narrative`'s non-requester access-control message, `close_ad_hoc_feedback_request`'s already-closed message) using the exact recorded RPC message strings from Story 3.14's own characterization suite. The in-process-vs-HTTP parity row is exercised twice: `getCompetencyNarrative`'s below-threshold `[]` case, and `getMyPendingInvitations`'s populated case -- both call the manager function directly (`actingAs` + the same mocked client) and assert the route's JSON-decoded response is `toEqual` the in-process result.

**No production files outside the 7 new route files were touched** -- `src/app/api/_shared.ts`, `src/app/api/cycles/**`, `src/app/api/report-groups/**`, `src/lib/api/client.ts`, `src/server/managers/feedbackManager.ts`, `src/server/db/feedback.ts`, `src/app/actions/feedback.ts`, and every page under `src/app/dashboard/feedback/**` remain unmodified, as required by this story's Never boundaries. `tests/characterization/feedback.test.ts` and `feedback-manager.test.ts` were read for reference only, not modified.

**In-process vs. HTTP equivalence:** every route calls the identical `feedbackManager` function the manager-level suite (Story 3.14) already exercises directly, with no additional transformation of inputs/outputs beyond JSON (de)serialization and the shared error envelope -- there is no route-local business logic that could diverge between the two call paths. Directly re-asserted (not just argued) for `getCompetencyNarrative` (below-threshold `[]`) and `getMyPendingInvitations` in the new suite.

**Nothing left incomplete.** No formal multi-lens review loop (`bmad-review`) was run against this diff as part of this implementation pass -- the frontmatter `status` is left at `in-progress` and `review_loop_iteration` at `0` pending that step, matching Story 3.9's own precedent. `EvaluatorCategory` (mentioned in this spec's own Code Map as re-exported by `feedbackManager`) is in fact not re-exported there (only `FeedbackSubtype`/`CompetencyNarrativeRow`/`PendingInvitation` are) -- a pre-existing documentation mismatch in the Code Map, not something this story's Never boundary permits fixing (`feedbackManager.ts` is frozen); harmless here since no route in this domain accepts an `evaluatorCategory`/`evaluatorCategories` field, so the type was never actually needed.

## Spec Change Log

## Review Triage Log

3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap) run against the diff at baseline `99fc183c4f3825ce688a1a24873021ecf9cc9c70`.

- **[patch, medium]** Blind Hunter: the `subtype`/`name` body-validation branches this diff adds to `POST /api/feedback-requests` and `POST /api/feedback-requests/individual` (rejecting an out-of-enum `subtype` or wrong-typed `name`) have zero test coverage -- the "malformed request body" suite only exercises `inviteeMemberIds`/`inviteeEmails` shape checks. Patched: added one test per route.
- **[patch, medium]** Blind Hunter: `POST /api/feedback-requests/individual` gets only a happy-path test; unlike every other mutating route in this diff, its RPC-rejection path is never exercised through the route layer. Patched: added a malformed-email rejection test, mirroring `feedback-manager.test.ts`'s own coverage of the same RPC.
- **[patch, medium]** Verification Gap: `PATCH /api/feedback-requests/[id]/evaluators`'s success branch (200/`null`) is never reached by any of the 5 existing tests against that route -- all 5 short-circuit via auth/validation rejection or the manager throwing (has-responses). A regression confined to that return statement (wrong status/body, or the manager call silently dropped) would ship undetected. Patched: added a valid-update success test, mirroring the cancel/close routes' own success-test shape.
- **[false]** Blind Hunter's "Client Fetch Integration unaddressed" finding: the frozen Intent explicitly scopes this out ("No Client Component wiring is added... this is verified at the Route Handler level via tests, same as those stories"), matching Story 1.5's and Story 3.9's identical, already-accepted precedent -- not a gap unique to this diff.
- **[false]** Blind Hunter's "`inviteeEmails` validated only as `typeof string`, unlike `inviteeMemberIds`'s `isValidUuid()` pre-check" finding: refuted by identical precedent -- `src/app/api/cycles/requests/route.ts` (Story 3.9, unchanged) validates its own `evaluatorEmails` the exact same way (`typeof e === "string"` only, no email-shape check), confirmed by direct read.
- **[rejected]** Blind Hunter's finding that the spec's own Code Map falsely claims `feedbackManager` re-exports `EvaluatorCategory`: the fix is editing this build's spec text, rejected per that explicit rule regardless of merit (the claim is indeed wrong and harmless -- no route in this domain needed that type).
- **[rejected]** Blind Hunter's finding that the Implementation Notes miscounts the malformed-body test cases as "4" when the block has 5: same rule, fix is editing spec prose.
- **[defer]** Blind Hunter: all 7 new route files re-declare identical `invalidId`/`invalidBody` closures -- a third occurrence of a pattern already flagged for Story 3.3's `_shared.ts` and Story 3.9's 8 cycles routes.
- **[defer]** Blind Hunter: `src/app/api/_shared.ts`'s `requireAuthorizedRequest()`/`jsonError()` still hardcode `[report-groups]`-tagged log messages even though the file is now used cross-domain (Epic 3) -- every one of these 7 new routes inherits the mislabeling on 401/403 rejections. Pre-existing (Story 3.3's generalization), not introduced by this diff.
- **[defer]** Blind Hunter: the non-`Error`-throw -> 500 `internal_error` branch in all 7 new routes is untested -- mirrors the identical untested branch already present and accepted in every prior domain's routes (Story 3.3/3.9), not novel to this diff. Verification Gap independently traced this and found no realistic path to it (`db/feedback.ts` wraps every RPC failure as `throw new Error(...)`), consistent with why it was never worth testing in the prior domains either.
- **[defer]** Blind Hunter: no rate-limiting/abuse-throttling on the two newly-public create endpoints -- the identical systemic gap already flagged in Story 3.3's `deferred-work.md` entry for `POST /api/auth/signin` ("no route or Server Action anywhere in this repo has rate-limiting today").
- **[defer]** Edge Case Hunter: all 4 `[id]`-path-param routes' `await params` is unguarded against a theoretical rejection (outside the try/catch guarding the manager call) -- confirmed by Edge Case Hunter itself to be an exact mirror of the pre-existing Story 3.9 precedent (`cycles/requests/[requestId]/close/route.ts`, unchanged), not a defect newly introduced here. Grouped as one entry (shared root cause across all 4 files).

## Verification

**Commands:**
- `npx vitest run tests/integration/feedback-route.test.ts` -- expected: all pass (actual: 35/35 passed, after review-triage patches added 4 tests)
- `npm run test` -- expected: all existing tests pass, no new failures (actual: 325/325 passed across 18 files -- 290 prior + 35 new)
- `npm run lint` -- expected: 0 new errors/warnings (actual: 0 errors, 1 pre-existing unrelated warning in `scripts/seed-company-360.mjs`, unchanged by this story)
- `npx tsc --noEmit` -- expected: no type errors (actual: none)
