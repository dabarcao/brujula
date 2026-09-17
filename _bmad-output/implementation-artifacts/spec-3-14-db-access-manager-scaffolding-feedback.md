---
title: 'DB-Access and Manager Scaffolding for Feedback'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '88c5be50dd6bdf05ac07b9569cb306839b95a25f'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/app/actions/feedback.ts`'s 5 in-scope ad-hoc-feedback Server Actions, plus the domain's two direct-RPC read paths (`get_request_competency_narrative`, `get_my_pending_invitations`), have no home outside that Server Action file and the dashboard pages that call the RPCs inline — no `db/`/`managers/` layer exists yet for this domain, frozen as a characterization baseline by Story 3.13.

**Approach:** Add `src/server/db/feedback.ts` and `src/server/managers/feedbackManager.ts`, mirroring Story 3.8's `db/cycles.ts`/`cyclesManager.ts` shape exactly (same file layout, `server-only` import, camelCase manager types over snake_case RPC rows, `throw new Error(error.message)` on RPC failure, one manager function per db function). No threshold/anonymity logic is reimplemented — it stays entirely in the RPCs, wrapped as-is.

## Boundaries & Constraints

**Always:** `db/feedback.ts` is the only new file that constructs a Supabase client for this domain; `feedbackManager.ts` calls only `db/feedback.ts`, never `@supabase/supabase-js`/`@supabase/ssr` directly, never `redirect()`/`revalidatePath()`, never reads cookies/headers. Every db function is plain-TypeScript typed (no `PostgrestError`, no raw `SupabaseClient`, in any signature) and throws the RPC's own unmodified message text on failure. `feedbackManager` calls only ad-hoc-lifecycle RPCs (`create_ad_hoc_feedback_request`, `create_ad_hoc_feedback_request_for_individual`, `cancel_ad_hoc_feedback_request`, `close_ad_hoc_feedback_request`, `update_ad_hoc_feedback_request_evaluators`) plus the two read RPCs (`get_request_competency_narrative`, `get_my_pending_invitations`) — never `cyclesManager`'s cycle-lifecycle RPCs, mirroring Story 3.8's split from the other side (its own header comment already documents excluding these as feedback-domain).

**Never:** Do not modify `src/app/actions/feedback.ts`, any `src/app/dashboard/feedback/**` page, or any migration — this story only adds the two new files. Do not touch `submitFeedbackResponse` or `submit_feedback_response`/`get_responder_context` (responder/invitation-domain scope, Story 3.19-3.24). Do not wrap `get_request_competency_comparison` (already cycle-exclusive, frozen by Story 3.7/owned by `cyclesManager`'s existing exclusion). Do not run or modify Story 3.13's characterization test file — it stays byte-identical; this story is verified by re-running it unmodified, not editing it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `createRequest`, valid | `inviteeMemberIds.length >= 5`, no open request | returns `{ requestId }` | N/A |
| `createRequest`, below min-invitees | `inviteeMemberIds.length < 5` | throws `create_ad_hoc_feedback_request`'s exact message | thrown-not-swallowed |
| `createIndividualRequest`, malformed email | one invalid email string | throws `create_ad_hoc_feedback_request_for_individual`'s exact message | thrown-not-swallowed |
| `updateRequestEvaluators`, has responses | request with >= 1 submitted response | throws `update_ad_hoc_feedback_request_evaluators`'s exact "ya hay respuestas" message | thrown-not-swallowed |
| `getCompetencyNarrative`, below threshold | < `min_responses_to_reveal` responses | returns `[]` (RPC's own early-return, no partial content) | N/A |
| `getCompetencyNarrative`, non-requester caller | caller is an invitee, not the requester | throws the RPC's exact access-control message | thrown-not-swallowed |
| `getMyPendingInvitations`, valid | caller has an unused invitation | returns rows including `token`/`requesterEmail`/`evaluatorCategory` | N/A |

</frozen-after-approval>

## Code Map

- `src/server/db/cycles.ts` -- exact shape to mirror: `server-only` import, one exported async function per RPC, private `Raw*` snake_case row types kept file-local, public camelCase types exported, `if (error) throw new Error(error.message)` on every call.
- `src/server/managers/cyclesManager.ts` -- exact shape to mirror: imports only from its own `db/*` file, one manager function per db function, re-exports shared param types (`export type { CycleParticipantCategory }` precedent for a type feedbackManager's own callers might need).
- `src/app/actions/feedback.ts` -- read-only reference; 5 in-scope RPC calls to wrap verbatim (`create_ad_hoc_feedback_request`, `create_ad_hoc_feedback_request_for_individual`, `cancel_ad_hoc_feedback_request`, `close_ad_hoc_feedback_request`, `update_ad_hoc_feedback_request_evaluators`), confirmed exact param names via direct read: `p_invitee_member_ids`, `p_subtype` (default `'general'`), `p_name` (default `null`), `p_invitee_emails`, `p_request_id`.
- `supabase/migrations/0057_feedback_request_name.sql:18-108,115-206` -- latest `create_ad_hoc_feedback_request`/`create_ad_hoc_feedback_request_for_individual` definitions (both `returns uuid`).
- `supabase/migrations/0011_ad_hoc_request_lifecycle.sql:84-115` -- `cancel_ad_hoc_feedback_request(p_request_id uuid) returns void`, only-ever definition (confirmed via repo-wide grep).
- `supabase/migrations/0014_close_completed_ad_hoc_request.sql:7-38` -- `close_ad_hoc_feedback_request(p_request_id uuid) returns void`, only-ever definition; no response-count check (Story 3.13's own investigated finding).
- `supabase/migrations/0032_supervisor_cannot_be_evaluator.sql:95-160` -- `update_ad_hoc_feedback_request_evaluators(p_request_id uuid, p_invitee_member_ids uuid[]) returns void`, only-ever definition, 5 guard clauses (now all covered by Story 3.13's characterization tests).
- `supabase/migrations/0058_competency_narrative_report.sql:25-89` -- `get_request_competency_narrative(p_request_id uuid) returns table(question_position int, question_prompt text, competency_code text, competency_name text, role_code text, mention_count int, avg_value numeric, comments text[])`, only-ever definition.
- `supabase/migrations/0048_pending_invitations_cross_org.sql:15-45` -- `get_my_pending_invitations() returns table(token uuid, created_at timestamptz, evaluator_category text, requester_member_id uuid, requester_full_name text, requester_email text)`, only-ever definition.
- `tests/characterization/feedback.test.ts` -- frozen baseline (Story 3.13, 17 tests) this story is verified against, run unmodified.
- `tests/characterization/cycles-manager.test.ts` -- exact shape to mirror for the new `tests/characterization/feedback-manager.test.ts`: only `@/lib/supabase/server` mocked (no `next/navigation`/`next/cache` -- the manager layer never calls `redirect()`/`revalidatePath()`), manager functions imported and called directly (`import * as feedbackManager from "@/server/managers/feedbackManager"`), same `scripts/seed-demo-company.mjs` fixture technique, same exact-string RPC-error assertions.

## Tasks & Acceptance

**Execution:**
- [x] `src/server/db/feedback.ts` -- create -- 7 typed wrapper functions (`createAdHocFeedbackRequest`, `createAdHocFeedbackRequestForIndividual`, `cancelAdHocFeedbackRequest`, `closeAdHocFeedbackRequest`, `updateAdHocFeedbackRequestEvaluators`, `getRequestCompetencyNarrative`, `getMyPendingInvitations`), `server-only`, camelCase public types (`CompetencyNarrativeRow`, `PendingInvitation`), snake_case `Raw*` types kept private
- [x] `src/server/managers/feedbackManager.ts` -- create -- one function per db function (`createRequest`, `createIndividualRequest`, `cancelRequest`, `closeRequest`, `updateRequestEvaluators`, `getCompetencyNarrative`, `getMyPendingInvitations`), imports only from `@/server/db/feedback`
- [x] `tests/characterization/feedback.test.ts` -- re-run unmodified -- confirms Story 3.13's 17 tests still pass untouched (proves nothing under `src/app/actions/feedback.ts` regressed)
- [x] `tests/characterization/feedback-manager.test.ts` -- create -- new-path re-verification of a representative subset of Story 3.13's baseline against `feedbackManager`'s functions directly, covering every I/O & Edge-Case Matrix row above

**Acceptance Criteria:**
- Given the existing ad-hoc-feedback RPCs, when `db/feedback.ts` is created, then it exports typed functions wrapping each with no Supabase-shaped types in any signature and no reimplemented threshold logic
- Given `feedbackManager.ts`, when built, then it calls only `db/feedback.ts` and only ad-hoc-lifecycle/read RPCs, never `cyclesManager`'s cycle RPCs
- Given Story 3.13's characterization suite, when run against this story's unmodified `src/app/actions/feedback.ts`, then all 17 tests still pass, including the below-threshold case
- Given the new `feedback-manager.test.ts` suite, when run against `feedbackManager`'s functions directly, then every I/O & Edge-Case Matrix row above is exercised and passes

## Implementation Notes

**Investigated finding, not a guess:** `cancel_ad_hoc_feedback_request` (`0011_ad_hoc_request_lifecycle.sql:115`) sets `status = 'closed'`, not a `'cancelled'` value -- `feedback_requests.status` (`0001_initial_schema.sql:108`) only ever accepts `('open', 'closed')` via its own check constraint; no `'cancelled'` status exists anywhere in the schema. The `cancelRequest`/`closeRequest` characterization tests added during review triage assert the real `'closed'` outcome for both, not the name-implied one.

## Spec Change Log

## Review Triage Log

3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap) run against the diff at baseline `88c5be50dd6bdf05ac07b9569cb306839b95a25f`.

- **[patch, high]** Verification Gap and Blind Hunter independently found `cancelAdHocFeedbackRequest`/`cancelRequest` and `closeAdHocFeedbackRequest`/`closeRequest` are wrapped but never invoked by any test anywhere in the repo (confirmed via repo-wide grep by both lenses) -- a wrong RPC/param name or swallowed error would ship silently. Patched: added manager-level test coverage for both.
- **[patch, low]** Blind Hunter: `subtype` params (`createAdHocFeedbackRequest`/`createAdHocFeedbackRequestForIndividual` and their manager counterparts) typed as plain `string`, no union constraining callers to the RPC's own known values -- unlike `cyclesManager`'s `CycleParticipantCategory` precedent. Patched: added a `FeedbackSubtype` union type matching the RPC's check constraint.
- **[patch, low]** Blind Hunter: `PendingInvitation.evaluatorCategory` typed as loose `string | null`, no precise union unlike the `CycleParticipantCategory` precedent. Patched: tightened to the feedback_invitations `evaluator_category` check-constraint's own value set.
- **[patch, low]** Blind Hunter: `getMyPendingInvitations`'s test only asserted `toHaveProperty` for `createdAt`/`evaluatorCategory`, not their actual values. Patched: asserts `typeof createdAt === "string"` and `evaluatorCategory === null` (ad-hoc invitations never set this field, confirmed via `createFeedbackRequest`'s own insert statement omitting it).
- **[patch, low]** Blind Hunter: no negative-path test for `createIndividualRequest`'s account-kind guard (`create_ad_hoc_feedback_request_for_individual`'s "Esta función es solo para cuentas individuales." error) -- only the malformed-email path was covered. Patched: added the missing test.
- **[false]** Blind Hunter's `avg_value`/`avgValue` numeric-serialized-as-string claim: refuted by Story 3.13's own already-passing characterization test (`tests/characterization/feedback.test.ts`, `get_request_competency_narrative` above-threshold case), which asserts `avg_value` with strict `.toBe(4)` against the same RPC via a raw REST call -- this Supabase/PostgREST version serializes this RPC's `numeric` column as a JSON number, not a string, contrary to the claim.
- **[rejected]** Blind Hunter's finding that the spec's own I/O & Edge-Case Matrix omits `cancelRequest`/`closeRequest` rows: the fix would be editing this build's frozen spec block, rejected per that explicit rule regardless of merit -- the real, actionable defect underneath (missing test coverage) is already captured and patched above.
- **[defer]** Blind Hunter: no mechanical (lint/test) enforcement of the manager-layer import boundary (`feedbackManager` must never import Supabase directly or another domain's manager) -- a pre-existing architectural gap across every domain's manager, not introduced by this story.
- **[defer]** Blind Hunter: `feedback-manager.test.ts` duplicates several helpers/types verbatim from `feedback.test.ts` rather than sharing them -- mirrors the identical, already-accepted `cycles.test.ts`/`cycles-manager.test.ts` duplication pattern from Story 3.8, not new to this story.
- **[defer]** Edge Case Hunter: `db/feedback.ts`'s `createAdHocFeedbackRequest`/`createAdHocFeedbackRequestForIndividual` don't guard against `data` being null/undefined when `error` is null before returning it as the request id -- mirrors the identical, already-accepted pattern in `db/cycles.ts`'s `createFeedbackCycle` (Story 3.8), not new to this story.
- **[defer]** Edge Case Hunter's remaining two findings are test-helper defensive-guard gaps (no explicit throw if a seeded email has no matching member id, or if `ctx.competencies` is empty for a competency-type question) -- the same class of test-helper hardening gap already logged to `deferred-work.md` for Stories 3.7/3.8/3.12/3.13, logged there rather than patched, consistent with that precedent.

Verification Gap's two findings are the same `cancelRequest`/`closeRequest` gap Blind Hunter also found independently -- merged into the single entry above.

## Verification

**Commands:**
- `npx vitest run tests/characterization/feedback.test.ts` -- expected: 17/17 pass, unchanged (actual: 17/17 pass)
- `npx vitest run tests/characterization/feedback-manager.test.ts` -- expected: all new tests pass (actual: 11/11 pass, after review-triage patches added 4 tests)
- `npm run test` -- expected: all existing tests pass, no new failures (actual: 290/290 pass across 17 files, up from 286 before patches)
- `npm run lint` -- expected: 0 new errors/warnings (actual: 0 errors, 1 pre-existing unrelated warning)
- `npx tsc --noEmit` -- expected: no type errors (actual: none)
