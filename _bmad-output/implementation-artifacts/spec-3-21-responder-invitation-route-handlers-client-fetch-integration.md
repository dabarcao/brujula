---
title: 'Responder/Invitation Route Handlers and Client Fetch Integration'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0650f042c6c2f124d377495ee691362374b894f2'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `responderManager` (Story 3.20) has no HTTP surface yet — an anonymous evaluator's browser (a future Client Component wizard) cannot reach it over `/api/**`.

**Approach:** Add 3 Route Handlers, one per `responderManager` function, structurally different from every other domain's routes in this codebase (AD-7/FR4): none call `requireAuthorizedRequest()`/`requireApiToken()` at all — the single-use invitation token, passed explicitly as a path param, is this domain's sole credential. `GET /api/responder/[token]` (`getContext`) and `GET /api/invitacion/[token]` (`getInviteDetails`) return their manager's result directly as a `200` body, matching the two page components' own current treatment of `{valid: false}`/`[]` as normal (not error) states. `POST /api/responder/[token]/submit` (`submitResponse`) is the one mutating route; its thrown-error path maps to `422 validation_error`, same convention as every other domain.

**Investigated (not guessed): the mutating route needs no CSRF header, unlike every other domain's mutating routes.** `requireApiToken()`'s CSRF check exists because a same-site attacker can otherwise ride a victim's *ambient* ad-ridden cookie (Supabase session or app token) to forge a state-changing request without knowing any secret. This domain's routes read no cookie-based credential to authorize the action -- the single-use token itself, passed explicitly in the URL, *is* the credential, and an attacker who doesn't already know that token's value cannot construct a matching malicious request to begin with (the same reasoning that makes a password-reset or magic-link URL inherently CSRF-resistant). A logged-in member's Supabase session cookie may ride along (`createClient()` reads it), but `get_responder_context`/`submit_feedback_response` only use it to check *who* is logged in when the invitation is member-linked (`requires_login`/wrong-user rejection) -- it never substitutes for the token as the authorizing credential. No `x-brujula-csrf` header is required on `POST /api/responder/[token]/submit`.

## Boundaries & Constraints

**Always:** No route in this domain calls `requireAuthorizedRequest()`/`requireApiToken()` -- confirmed as this domain's one structural deviation (AD-7/FR4), already established by Story 3.20 for the manager layer, now extended to routes. Every `[token]` path segment is validated with `isValidUuid()` before use (same friendly-422 rationale as every other domain's `[id]` params). `getContext`/`getInviteDetails` return their manager result directly as the `200` body (no error envelope for a `{valid: false}`/`[]` result -- that is a normal state, not a failure). `submitResponse`'s thrown `Error` maps to `422 validation_error` with the RPC's own unmodified message.

**Never:** Do not call `requireApiToken()`/`requireAuthorizedRequest()` anywhere in this domain's routes. Do not require the `x-brujula-csrf` header on `POST /api/responder/[token]/submit` (per the investigated finding above). Do not modify `src/server/db/responder.ts`, `src/server/managers/responderManager.ts`, `src/app/responder/[token]/page.tsx`, `src/app/invitacion/[token]/page.tsx`, or `src/app/actions/feedback.ts` (Story 3.20's files stay as delivered). Do not add per-domain typed client fetchers -- `src/lib/api/client.ts`'s existing generic `apiFetch<T>()` is the one client-side mechanism. Do not touch `tests/characterization/responder-invitation.test.ts` or `responder-invitation-manager.test.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `GET /api/responder/[token]`, malformed token | non-UUID path segment | 422 validation_error | N/A |
| `GET /api/responder/[token]`, invalid/bogus token, no app token at all | no cookies, no headers | 200, `{valid: false}` -- accepted, never gated by `requireApiToken()` | N/A |
| `GET /api/responder/[token]`, valid app token present but token invalid | app-token cookie set, path token bogus | 200, `{valid: false}` -- app token has no bearing, not interchangeable with the invitation token | N/A |
| `GET /api/responder/[token]`, member invite, not logged in | valid token, no session | 200, `{valid: false, requiresLogin: true}` | N/A |
| `POST /api/responder/[token]/submit`, valid, no app token, no CSRF header | complete answers, anon | 200, `{responseId}` -- accepted | N/A |
| `POST /api/responder/[token]/submit`, RPC rejects | invalid/already-used token | 422 validation_error, RPC's own exact message | thrown-not-swallowed |
| `POST /api/responder/[token]/submit`, malformed body | `answers` not an array | 422 validation_error, generic body-shape message | N/A |
| `GET /api/invitacion/[token]`, valid | fresh member invite | 200, array with `{valid: true}` row | N/A |
| `GET /api/invitacion/[token]`, bogus token | nonexistent invite_token | 200, `[]` | N/A |
| Same manager functions, in-process vs over HTTP | identical seeded state | identical results | N/A |

</frozen-after-approval>

## Code Map

- `src/app/api/feedback-requests/**` (Story 3.15) -- shape to mirror for the parts that DO apply: `isValidUuid()` param checks, manual body validation, `try/catch` → `422 validation_error`/`500 internal_error`. Does NOT apply: `requireAuthorizedRequest()` -- never called anywhere in this domain's routes.
- `src/app/api/_shared.ts` -- import only `jsonError`/`isValidUuid` here, never `requireAuthorizedRequest`.
- `src/server/managers/responderManager.ts` (Story 3.20) -- the 3 functions to expose: `getContext(token)`, `getInviteDetails(token)`, `submitResponse(token, answers)`.
- `tests/integration/cycles-route.test.ts` (Story 3.9) -- shape to mirror for the new `tests/integration/responder-invitation-route.test.ts`: route handler functions imported directly, invoked with constructed `Request` objects. Unlike that file, no `signAppToken()`/app-token cookie construction needed anywhere -- confirm this by testing that a request carrying NO cookies at all still succeeds for a valid token, and that a request carrying a valid app-token cookie alongside an invalid path token still fails (the two credential types are not interchangeable, per epics.md's own AC).
- `src/server/shared/auth.ts` -- read-only reference confirming `CSRF_HEADER`/`requireApiToken` are never imported by this domain's route files (a grep-based static check is a cheap way to enforce this in the test file).

## Tasks & Acceptance

**Execution:**
- [x] `src/app/api/responder/[token]/route.ts` -- create -- `GET` → `getContext`
- [x] `src/app/api/responder/[token]/submit/route.ts` -- create -- `POST` → `submitResponse`
- [x] `src/app/api/invitacion/[token]/route.ts` -- create -- `GET` → `getInviteDetails`
- [x] `tests/integration/responder-invitation-route.test.ts` -- create -- exercises every I/O & Edge-Case Matrix row above, including the "app token present but invalid path token still rejected" and "no app token at all still accepted" scenarios that directly satisfy epics.md's AC

**Acceptance Criteria:**
- Given a responder-facing route, when a request carries a valid single-use invitation token but no app token, then it is accepted -- `requireApiToken()` is never invoked on this route
- Given the same route, when a request carries a valid app token but an invalid/missing invitation token, then it is rejected -- the two credential types are not interchangeable

## Implementation Notes

**New files:** 3 Route Handlers -- `src/app/api/responder/[token]/route.ts` (`GET` → `responderManager.getContext`), `src/app/api/responder/[token]/submit/route.ts` (`POST` → `responderManager.submitResponse`), `src/app/api/invitacion/[token]/route.ts` (`GET` → `responderManager.getInviteDetails`) -- plus `tests/integration/responder-invitation-route.test.ts`. Each route imports only `jsonError`/`isValidUuid` from `../../_shared` (never `requireAuthorizedRequest`), shaped after `src/app/api/feedback-requests/**`'s (Story 3.15) `isValidUuid` → manual body validation → `try/catch` → `422 validation_error` pattern, minus the `requireAuthorizedRequest()` call that domain always makes first.

**GET routes' catch-block deviates on purpose from the feedback-requests precedent:** `feedback-requests`' `GET`/`POST` routes map every caught `Error` to `422 validation_error`, because their manager functions throw for ordinary invalid-input cases. `getContext`/`getInviteDetails` never throw for an invalid/bogus/used token -- that's their normal `{valid: false}`/`[]` result, returned directly as the `200` body per the frozen Intent. So a caught error in these two `GET` routes can only be a genuine RPC-call failure (e.g. a DB outage), not a user-input problem -- mapped to `500 internal_error` instead of `422`. `submitResponse` (the one mutating route) keeps the `422 validation_error` mapping, per the spec's explicit "Always" boundary, since its thrown errors (invalid/already-used token, missing required answers, wrong-user mismatch) are exactly the same kind of RPC-rejects-the-input case every other domain's mutating routes already map to `422`.

**`submit`'s body validation:** `answers` must be an array where every element is a plain object with a string `questionId` and, if present, a string `answerText`, a `number | null` `answerValue`, and a string `competencyCode` -- matching `FeedbackAnswerInput`'s shape (`src/server/managers/responderManager.ts`). No per-element `isValidUuid()` check on `questionId` -- the boundary's `isValidUuid()` requirement is scoped to path segments only (confirmed against every other domain's own precedent: body-array elements like `participantMemberIds` get their own explicit uuid-array guard in `cycles`' routes, but this spec's matrix never calls for the equivalent here, and `question_id` reaches the RPC via a jsonb param, not a bound `uuid`-typed argument).

**No `src/lib/api/client.ts` changes:** per the spec's own "Never" boundary (no per-domain typed client fetchers), this story adds no client-side code at all -- `apiFetch<T>()` already covers calling these 3 routes generically once/if a Client Component wizard is built. No existing Client Component calls them yet (confirmed via grep for `/api/responder` and `/api/invitacion` across `src/`), so this is verified at the route-handler level only, same allowance Story 1.5 established for `report-groups`.

**Test file:** `tests/integration/responder-invitation-route.test.ts`, mirroring `tests/integration/cycles-route.test.ts`'s shape (route handlers imported directly, invoked with constructed `Request`s) plus `tests/characterization/responder-invitation.test.ts`'s `actingAs`/`actingAsAnon()` mocked-`@/lib/supabase/server` technique (needed here, unlike `cycles-route.test.ts`, because several scenarios must run with no session at all). 14 tests across 6 `describe` blocks: a grep-based structural check (comment-stripped, to avoid false-positiving on this domain's own doc comments naming `requireApiToken` in prose) that none of the 3 route files import or call `requireAuthorizedRequest`/`requireApiToken`/`CSRF_HEADER`; malformed-`[token]`-path-segment 422s (manager never invoked) for all 3 routes; malformed-body 422s for `submit`; every `GET /api/responder/[token]` matrix row, including the two that directly exercise epics.md's AC (`bogus token + a valid app-token cookie` → still `{valid: false}`; `bogus token + no cookies at all` → same `{valid: false}`) plus an in-process-vs-over-HTTP equality check; `POST .../submit`'s accepted-with-zero-credentials case (asserts `x-brujula-csrf` is absent from the request) and its RPC-rejects 422 case; both `GET /api/invitacion/[token]` matrix rows, also with an in-process-vs-over-HTTP equality check. Fixture: one fresh demo company via `scripts/seed-demo-company.mjs` (8 employees) plus a peer `ad_hoc` feedback request built directly through `create_ad_hoc_feedback_request`, same technique the Story 3.19 characterization file already established.

**Nothing left incomplete or risky.** `src/server/db/responder.ts`, `src/server/managers/responderManager.ts`, both page components, `src/app/actions/feedback.ts`, and both characterization test files were not touched. No review lens was run against this diff (not requested); a future `bmad-review`/`bmad-retrospective` pass remains available if desired.

## Spec Change Log

## Review Triage Log

3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap) run against the diff at baseline `0650f042c6c2f124d377495ee691362374b894f2`, with Blind Hunter specifically directed to stress-test this story's central security decision (no CSRF header on the mutating route).

- **[patch, high]** Blind Hunter: `submit_feedback_response` casts `(a->>'question_id')::uuid` inline while scanning `p_answers` (`supabase/migrations/0061_saboteadores.sql:204`) -- confirmed by direct read. `submit/route.ts`'s `isValidAnswer()` never checks `questionId`'s format before the RPC call, so a malformed value reaches this inline cast and Postgres's raw `invalid input syntax for type uuid: "..."` error gets forwarded verbatim as the `422` body to an anonymous, unauthenticated caller -- exactly the class of leak `isValidUuid()` exists elsewhere in this codebase to prevent. Patched: added a per-element `isValidUuid()` check on `questionId` in `isValidAnswer()`.
- **[patch, medium]** Blind Hunter: neither `GET /api/responder/[token]` nor `POST .../submit` is tested with "logged in as a different member than the invitation's own invitee" -- only "not logged in at all" is covered. This is exactly the identity-substitution branch the RPCs use (`invitee.auth_user_id is distinct from auth.uid()`) and the scenario a CSRF-header-free mutating route most needs direct evidence against. Patched: added a dedicated test for each route.
- **[patch, medium]** Blind Hunter: no upper bound on `answers` array length in `submit`'s body validation. Unlike every other domain's mutating routes (all gated by `requireApiToken()`, giving at least a weak accountability backstop), this route needs no app token, no CSRF header, and no session at all -- anyone holding one valid unused token can post an oversized `answers` array, and `submit_feedback_response` runs several `jsonb_array_elements`-driven scans per validation step. A straightforward amplification vector, novel to this domain's weaker auth model. Patched: added a sane max-length check (50 answers).
- **[defer]** Blind Hunter: the CSRF-exemption rationale only rebuts forged-request *construction*, not token-confidentiality *leakage* (Referer headers once a client wizard fetches these routes, browser history, access logs, an evaluator forwarding their own link) -- and `feedback_invitations` has no `expires_at`, so a leaked token stays valid indefinitely until first use. Real residual risk, but the mitigation (e.g. `Referrer-Policy: no-referrer` on the page components) belongs to Story 3.22, which actually wires up a client -- this story ships no client caller yet.
- **[defer]** Verification Gap and Blind Hunter (independently, same finding): the GET routes' deliberate `500` (not `422`) convention for a caught `Error` is untested -- neither `getContext` nor `getInviteDetails` throws for any input this test file's real-Supabase-only style can drive them with; forcing a genuine RPC infra failure would require mocking inconsistent with this file's own established real-Postgres approach. Same disposition as the identical class of gap already deferred for Stories 3.15/3.17 (non-realistic-path catch branches).
- **[defer]** Blind Hunter: `submit`'s catch block maps every caught `Error` to `422 validation_error`, including a genuine infra failure, potentially surfacing an infra error's raw message to an anonymous caller. This is the same, already-logged systemic pattern across every mutating route in this codebase (Story 3.3's deferred-work entry: "the uniform Error → 422 mapping doesn't distinguish genuine backend/infra failures from business-rule rejections"), not unique to this domain in kind -- though this domain's lack of any auth gate does make the exposure marginally wider, noted in the deferred-work entry.
- **[false]** Blind Hunter's finding that `src/lib/api/client.ts`'s `apiFetch<T>()` unconditionally attaching `x-brujula-csrf` "contradicts" this domain's no-CSRF-header design: no functional defect -- this route never inspects the header's presence or absence, so a client that happens to send it causes no harm. The test's own hand-built `Request` (no header) correctly proves the header is optional, not that it must be absent.
- **[defer]** Edge Case Hunter's 2 test-helper findings (`tokenRequest()` has no guard against a GET request constructed with a body; `stripComments()`'s naive `//`-stripping could theoretically mask a real `requireApiToken()`/`CSRF_HEADER` usage if it appeared inside a string literal). Same class of test-helper hardening gap already logged repeatedly; confirmed no route file in this diff actually contains `//` inside a string literal today, so the second one has no currently-reachable path.

## Verification

**Commands run:**
- `npx vitest run tests/integration/responder-invitation-route.test.ts` -- expected: all pass (actual: 16/16 pass, after review-triage patches added 2 tests)
- `npm run test` -- expected: all existing tests pass, no new failures (actual: 404/404 pass across 23 test files)
- `npm run lint` -- expected: 0 new errors/warnings (actual: 0 errors, 1 pre-existing unrelated warning in `scripts/seed-company-360.mjs`)
- `npx tsc --noEmit` -- expected: no type errors (actual: none)
