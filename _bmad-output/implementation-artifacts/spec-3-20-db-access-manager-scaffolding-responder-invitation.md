---
title: 'DB-Access and Manager Scaffolding for Responder/Invitation'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c14a4d449984eeb63c9f4d1b92e4712c5a2b3b52'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `get_responder_context`, `get_invite_details`, `submit_feedback_response` (invitee side) have no home outside the two Server Components and `submitFeedbackResponse` (Story 3.19's frozen baseline) — no `db/`/`managers/` layer exists yet for this domain.

**Approach:** Add `src/server/db/responder.ts` and `src/server/managers/responderManager.ts`, mirroring `db/feedback.ts`/`feedbackManager.ts`'s shape (`server-only`, typed wrappers, camelCase public types over snake_case RPC rows, `throw new Error(error.message)` on RPC failure). No threshold/token-validity logic is reimplemented — every RPC already validates its own token internally (confirmed by direct read of all 3 RPCs' source in Story 3.19's own investigation); the manager is a structurally-different, token-only auth model (AD-7/FR4) that never calls `requireApiToken()`, but that "difference" is achieved simply by *not calling it* — no new validation code is needed or written here.

**Scope correction (investigated, not guessed, same correction Story 3.19 already established):** epics.md's Story 3.20 AC lists `accept_member_invite`/`claim_pending_email_invitations` alongside the 3 real responder RPCs for `db/responder.ts` to wrap. Both are already owned by `membersManager`/`db/members.ts` (Story 3.2, confirmed via grep — `acceptMemberInvite`/`claimPendingEmailInvitations` exist there, zero overlap) — not this domain's responsibility. `db/responder.ts` wraps exactly the 3 RPCs Story 3.19 actually characterized: `get_responder_context`, `get_invite_details`, `submit_feedback_response`.

**Investigated (not guessed): `submit_feedback_response`'s JSONB answer shape stays snake_case internally.** The RPC reads each answer object via `->>'question_id'`/`->>'competency_code'`/`->>'answer_text'`/`->>'answer_value'` (`supabase/migrations/0061_saboteadores.sql`) — literal JSON keys, unrelated to the RPC's own top-level `p_`-prefixed argument names. `db/responder.ts`'s `submitFeedbackResponse` accepts a camelCase `answers` array at its TypeScript boundary (matching this codebase's public-API convention) and maps each entry to the RPC's required snake_case keys internally before calling `supabase.rpc(...)` — the same shape `src/app/actions/feedback.ts`'s own `submitFeedbackResponse` already builds inline.

## Boundaries & Constraints

**Always:** `db/responder.ts` is the only new file that constructs a Supabase client for this domain; `responderManager.ts` calls only `db/responder.ts`, never `@supabase/supabase-js`/`@supabase/ssr` directly, never `requireApiToken()`, never `redirect()`/`revalidatePath()`. Every db function is plain-TypeScript typed and throws the RPC's own unmodified message text on failure. The token is passed straight through to each RPC unmodified — no reformatting, no pre-validation, no early rejection based on shape.

**Never:** Do not modify `src/app/actions/feedback.ts`, `src/app/responder/[token]/page.tsx`, `src/app/invitacion/[token]/page.tsx`, or `src/app/actions/auth.ts` — this story only adds the two new files (plus a manager-level test file). Do not wrap `accept_member_invite`/`claim_pending_email_invitations` (already `membersManager`'s). Do not characterize or touch `acceptInviteSignUp`/`individualSignUp` — already excluded (Story 3.2, calls `supabase.auth.signUp()` directly, no RPC). Do not modify `tests/characterization/responder-invitation.test.ts` — frozen baseline, re-run unmodified.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `getContext`, invalid token | bogus token | `{valid: false}` | N/A |
| `getContext`, member invite, not logged in | valid token, no/wrong session | `{valid: false, requiresLogin: true}` | N/A |
| `submitResponse`, valid (peer) | complete required answers | returns `{responseId}`, invitation marked used | N/A |
| `submitResponse`, wrong-user | member-linked invite, different logged-in caller | throws the RPC's exact "no corresponde a tu usuario" message | thrown-not-swallowed |
| `getInviteDetails`, valid | fresh member invite | `[{organizationName, email, fullName, valid: true}]` | N/A |
| `getInviteDetails`, bogus token | nonexistent invite_token | `[]` | N/A |

</frozen-after-approval>

## Code Map

- `src/server/db/feedback.ts`, `src/server/managers/feedbackManager.ts` (Story 3.14) -- exact shape to mirror: `server-only`, typed wrappers, private `Raw*` snake_case row types, `if (error) throw new Error(error.message)`.
- `tests/characterization/responder-invitation.test.ts` (Story 3.19, frozen) -- read-only: exact scenario fixtures and assertion strings for `get_responder_context`/`get_invite_details`/`submit_feedback_response`, including the identity-mismatch and RPC-branch-priority scenarios its own review added.
- `tests/characterization/feedback-manager.test.ts` (Story 3.14) -- exact shape to mirror for the new `tests/characterization/responder-invitation-manager.test.ts`: manager functions called directly, only `@/lib/supabase/server` mocked, same fixture technique.
- `src/app/responder/[token]/page.tsx`, `src/app/invitacion/[token]/page.tsx` -- read-only reference: exact current RPC call shapes (unmodified by this story).
- `src/app/actions/feedback.ts:200-256` -- `submitFeedbackResponse`'s exact snake_case answer-building shape to mirror inside `db/responder.ts`.
- `src/server/managers/membersManager.ts`, `src/server/db/members.ts` -- confirmed via grep to already own `acceptMemberInvite`/`claimPendingEmailInvitations` -- zero overlap with this domain.
- `supabase/migrations/0061_saboteadores.sql:93-274` -- latest `get_responder_context`/`submit_feedback_response` definitions.
- `supabase/migrations/0003_member_invites.sql:84-98` -- `get_invite_details`'s only-ever definition.

## Tasks & Acceptance

**Execution:**
- [x] `src/server/db/responder.ts` -- create -- 3 typed wrapper functions (`getResponderContext`, `getInviteDetails`, `submitFeedbackResponse`), `server-only`, camelCase public types
- [x] `src/server/managers/responderManager.ts` -- create -- one function per db function (`getContext`, `getInviteDetails`, `submitResponse`), imports only from `@/server/db/responder`, never calls `requireApiToken()`
- [x] `tests/characterization/responder-invitation.test.ts` -- re-run unmodified -- confirms Story 3.19's 15 tests still pass untouched
- [x] `tests/characterization/responder-invitation-manager.test.ts` -- create -- new-path re-verification of a representative subset of Story 3.19's baseline against `responderManager`'s functions directly, covering every I/O & Edge-Case Matrix row above

**Acceptance Criteria:**
- Given the existing `get_responder_context`/`get_invite_details`/`submit_feedback_response` RPCs, when `db/responder.ts` is created, then it exports typed functions wrapping each with no Supabase-shaped types in any signature
- Given `responderManager.ts`, when built, then it calls only `db/responder.ts` and never calls `requireApiToken()`
- Given Story 3.19's characterization suite, when run against this story's unmodified page/action files, then all 15 tests still pass

## Implementation Notes

**New files:** `src/server/db/responder.ts` (3 typed wrapper functions -- `getResponderContext`, `getInviteDetails`, `submitFeedbackResponse` -- mirroring `db/feedback.ts`'s exact shape: `server-only`, private `Raw*` snake_case row types, `if (error) throw new Error(error.message)`) and `src/server/managers/responderManager.ts` (one function per db function -- `getContext`, `getInviteDetails`, `submitResponse` -- importing only from `@/server/db/responder`, never `requireApiToken()`/`redirect()`/`revalidatePath()`).

**`submitFeedbackResponse`'s camelCase boundary:** the public `FeedbackAnswerInput` type (`questionId`/`answerText`/`answerValue`/`competencyCode`) is mapped internally to `submit_feedback_response`'s required snake_case jsonb keys before the RPC call -- the same shape `src/app/actions/feedback.ts:200-230` already builds inline, per the frozen Intent's investigated finding. `db/responder.ts`'s `submitFeedbackResponse` returns the RPC's raw response id (`Promise<string>`), matching `createAdHocFeedbackRequest`'s own precedent (`db/feedback.ts`); `responderManager.submitResponse` wraps it as `{ responseId }`, matching `feedbackManager.createRequest`'s own `{ requestId }` precedent.

**Test file:** `tests/characterization/responder-invitation-manager.test.ts` (6 `test()` blocks across 3 `describe` groups -- `getContext`, `submitResponse`, `getInviteDetails`), mirroring `feedback-manager.test.ts`'s exact mocking shape (only `@/lib/supabase/server` mocked) plus `responder-invitation.test.ts`'s own `actingAsAnon()` addition (no `Authorization` override at all, landing calls on Postgres's `anon` role), needed here because `getContext`'s invalid-token/not-logged-in scenarios and `getInviteDetails` are both genuinely anonymous calls. Fixture: one fresh demo company per run via `scripts/seed-demo-company.mjs` (8 employees), same technique as every prior characterization file; the peer `ad_hoc` request and member invite actually under test are built directly through `callRpc` (fixture-building plumbing), never through `responderManager` itself. Covers every row of the spec's own I/O & Edge-Case Matrix.

**Nothing left incomplete or risky.** No file under `src/server/db/feedback.ts`, `src/app/actions/feedback.ts`, `src/app/responder/[token]/page.tsx`, `src/app/invitacion/[token]/page.tsx`, `src/app/actions/auth.ts` or `tests/characterization/responder-invitation.test.ts` was modified -- only the two new source files, the new manager test file, this spec, and `_bmad-output/implementation-artifacts/sprint-status.yaml` (marking Story 3.20 done). No review lens was run against this diff (not requested); a future `bmad-review`/`bmad-retrospective` pass remains available if desired.

## Spec Change Log

## Review Triage Log

3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap) run against the diff at baseline `c14a4d449984eeb63c9f4d1b92e4712c5a2b3b52`.

- **[patch, medium]** Verification Gap: no test that runs through `getResponderContext`/`responderManager.getContext` ever asserts `ctx.isSelf`'s value -- the two dedicated `getContext` tests never reach the RPC branch where `is_self` is populated, and the one test that does receive a real value never reads it. A regression in the `isSelf: raw.is_self` mapping (e.g. a typo'd key) would ship undetected. Patched: added the assertion where the fixture already produces a known value.
- **[patch, low]** Blind Hunter: `questionType`/`question_type` typed as bare `string` in both `ResponderQuestion` and `RawResponderQuestion`, even though `survey_questions.question_type` is a real check constraint over 4 known values -- inconsistent with the exact precedent this spec claims to mirror (`db/feedback.ts`'s `FeedbackSubtype`/`EvaluatorCategory` unions, added during that story's own review). Patched: added a `QuestionType` union type.
- **[patch, medium]** Blind Hunter: `get_responder_context`'s "already used" branch (`{valid:true, used:true}`) -- the double-submission-prevention behavior Story 3.19's own AC calls out by name -- is never exercised through `responderManager`. Patched: added a dedicated test.
- **[patch, medium]** Blind Hunter: of `submit_feedback_response`'s rejection paths, only the wrong-user case is exercised through `responderManager.submitResponse` -- for an anonymous, public-facing endpoint on this "highest-stakes-to-break" domain, the invalid/already-used-token case is the single most consequential one to leave unverified at the new orchestration layer. Patched: added a dedicated test.
- **[patch, low]** Blind Hunter: `db/responder.ts`'s `submitFeedbackResponse` relies on `JSON.stringify` silently dropping `undefined`-valued keys to reproduce the original Server Action's per-question-type key construction, with no comment flagging this implicit dependency. Patched: added a one-line comment.
- **[rejected]** Blind Hunter's finding that the spec's Intent doesn't explicitly address epics.md's literal "validates the single-use invitation token itself" AC phrasing: the interpretation already in the frozen Intent (every RPC validates its own token internally, so the manager has nothing left to independently re-validate) is correct, not a missed requirement -- the fix would be editing this build's frozen spec text, rejected per that explicit rule regardless of merit.
- **[defer]** Blind Hunter: no lint rule or test enforces "`responderManager` never calls `requireApiToken()`" -- the domain's one explicitly-called-out structural deviation is guarded only by a comment. Matches the identical, already-logged systemic gap for manager-layer import boundaries generally (Story 3.14's deferred-work entry).
- **[defer]** Blind Hunter: the self-evaluation (`is_self: true`) branch is never exercised through `responderManager` in this file (Story 3.19's own suite already covers it at the RPC level). Lower priority than the already-used branch since the manager is a pure pass-through with no self/peer-specific transformation logic, and the `isSelf` mapping itself is now covered by the patch above.
- **[defer]** Blind Hunter: `submit_feedback_response`'s remaining two rejection paths (missing required answers, foreign/invalid-competency answers) still unexercised through `responderManager.submitResponse`. Generic input-validation guards, lower priority than the invalid-token case already patched above.
- **[defer]** Edge Case Hunter's 2 test-helper defensive-guard findings (`departments[0]` unguarded if the seed produces none; the test's inline answer-builder has no `multiple_choice` branch, unreachable with this file's current fixtures). Same class of test-helper hardening gap already logged repeatedly across this initiative.

## Verification

**Commands run:**
- `npx vitest run tests/characterization/responder-invitation.test.ts` -- expected: 15/15 pass, unchanged (actual: 15/15 pass)
- `npx vitest run tests/characterization/responder-invitation-manager.test.ts` -- expected: all pass (actual: 8/8 pass, after review-triage patches added 3 tests)
- `npm run test` -- expected: all existing tests pass, no new failures (actual: 388/388 pass across 22 test files)
- `npm run lint` -- expected: 0 new errors/warnings (actual: 0 errors, 1 pre-existing unrelated warning)
- `npx tsc --noEmit` -- expected: no type errors (actual: none)
