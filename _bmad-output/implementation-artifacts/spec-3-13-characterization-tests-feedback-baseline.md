---
title: 'Characterization Tests for Feedback (Current Behavior Baseline)'
type: 'chore'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'e29797e'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/app/actions/feedback.ts` (the ad-hoc-feedback domain — 166 lines) has zero test coverage. This is the first story of Epic 3's feedback domain (3.13-3.18) — before any refactor touches this code, its exact current behavior must be captured as a frozen baseline, mirroring Story 3.7's already-proven technique for cycles.

**Approach:** One new file, `tests/characterization/feedback.test.ts`, real Supabase throughout (no RPC/manager mocking), following Story 3.7's exact shape: mock only `next/navigation`/`next/cache`; a `login`/`actingAs(token)` helper; exact-string assertions on redirect URLs and RPC error messages. Fixtures: reuse `scripts/seed-demo-company.mjs` for org/member infrastructure (confirmed to build zero ad-hoc requests itself — none of the existing seed scripts provide repeatable, parameterized ad-hoc/threshold-boundary fixtures), then create ad-hoc requests directly via the real Server Actions/RPCs under test, same technique Story 3.7 used for cycles.

**Scope corrections (investigated, not guessed):**
1. **`submitFeedbackResponse`** (`feedback.ts:109-165`) is excluded, despite living in this file today. epics.md's Story 3.13 AC names creating/updating/canceling/closing an ad-hoc request and the narrative report — never "submitting a response." Investigation confirms this function is token-based, unauthenticated, redirects to `/responder/{token}` — semantically a responder/invitation-domain action (Story 3.19's own future scope, per the architecture's established "responder/invitation migrates last" sequencing), not feedback-management. It happens to share a file with the 5 in-scope functions today; domain ownership follows semantics, not file location, matching the same reasoning already applied to `get_my_pending_invitations`/`get_request_competency_comparison` in Stories 3.2/3.8.
2. **`get_request_competency_comparison`** (characterized once already by Story 3.7, `tests/characterization/cycles.test.ts:714-757`) is confirmed cycle-exclusive in practice: `dashboard/feedback/[id]/page.tsx:372-373` gates it `revealed && isCycle` — it is never invoked for `request_type = 'ad_hoc'`. Story 3.7's existing characterization is the correct, sufficient baseline; this story does not re-characterize it. The actual ad-hoc-domain narrative-report RPC is a *different* one: **`get_request_competency_narrative`** (gated `revealed && !isCycle`, `supabase/migrations/0058_competency_narrative_report.sql`) — this is what AC1's "resulting narrative report output" refers to, and what this story characterizes instead.
3. **`get_my_pending_invitations`** (`supabase/migrations/0048_pending_invitations_cross_org.sql`, called from `dashboard/page.tsx:180`) is confirmed feedback-domain-owned (Story 3.2's own investigated finding, re-verified here) and will need wrapping by Story 3.14's `db/feedback.ts`. Proactively included in this story's characterization scope — Story 3.8's own review had to reactively catch `get_colleagues_with_closed_cycle` being characterized nowhere before Story 3.8 wrapped it "blind"; including this RPC here avoids repeating that exact near-miss for feedback.

**Anonymity-threshold behavior (epics.md's own explicit AC focus):** confirmed to live entirely in RPCs, not `feedback.ts` (zero validation/threshold logic in the Server Action file itself). `create_ad_hoc_feedback_request`'s own `min_invitees_per_request` check (default 5) and `get_feedback_request_progress`'s `min_responses_to_reveal` check (default 3, simple `peer_count >= threshold` for `request_type != 'cycle'`, no cycle-only 80%-completion clause) are the boundary this story characterizes -- exact RPC messages, not reimplemented logic.

## Boundaries & Constraints

**Always:**
- Every scenario calls the real Server Action or real RPC against the local `supabase start` instance -- no RPC mocking anywhere in this file.
- Every error-path assertion uses the RPC's own exact message text (confirmed against the migration source).
- The below-threshold narrative-report scenario asserts the "esperando más respuestas" / not-revealed state exactly as epics.md's own AC requires -- no content leaked, matching the byte-withholding confidentiality boundary already established for pre-threshold individual responses elsewhere in this codebase.
- Fixture setup (org/members) reuses `scripts/seed-demo-company.mjs`'s existing output; the ad-hoc requests/responses actually under test are created by this test file directly via the real Server Actions/RPCs, never a seed script.
- One representative error case per RPC family (Story 3.1's own bar, consistently applied since).

**Never:**
- Do not modify `src/app/actions/feedback.ts` or any page under `src/app/dashboard/feedback/**` -- read-only characterization.
- Do not touch any prior story's characterization file (`cycles.test.ts`, `admin-members-auth.test.ts`, etc.) -- additive only.
- Do not characterize `submitFeedbackResponse` -- responder/invitation-domain scope (Story 3.19), per the investigated correction above. Calling the underlying `submit_feedback_response` RPC directly as fixture-building infrastructure (to produce a specific response count for threshold tests) is fine; characterizing the Server Action itself is not.
- Do not characterize `get_request_competency_comparison` -- already frozen by Story 3.7, cycle-exclusive, out of scope here.
- Do not characterize `create_feedback_cycle`/`organize_cycle_evaluators`/`close_cycle_request`/`update_cycle_request_evaluators*` or their Server Actions -- `cyclesManager`'s RPCs, Story 3.7's domain, not this one's.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `createFeedbackRequest`, valid invitees (>=5) | as an employee, teammate ids | redirects to `/dashboard?requestCreated=1` | N/A |
| `createFeedbackRequest`, below min-invitees | <5 invitee ids | redirects to `/dashboard/feedback/nueva?error=` with the RPC's own exact message | thrown-not-swallowed |
| `createFeedbackRequestForIndividual`, valid emails | as an individual account, teammate emails | redirects to `/dashboard?requestCreated=1` | N/A |
| `createFeedbackRequestForIndividual`, RPC rejects | malformed/self email | redirects to `/dashboard/feedback/nueva?error=` with the RPC's own exact message | thrown-not-swallowed |
| `updateFeedbackRequestEvaluators`, valid input | as the requester | redirects to `/dashboard/feedback/{id}?updated=1` | N/A |
| `cancelFeedbackRequest`, valid | as the requester | redirects to `/dashboard?requestCancelled=1` | N/A |
| `cancelFeedbackRequest`, RPC rejects | already closed/cancelled | redirects to `/dashboard/feedback/{id}?error=` with the RPC's own exact message | thrown-not-swallowed |
| `closeFeedbackRequest`, eligible to close | >=3 responses | redirects to `/dashboard?requestClosed=1` | N/A |
| `closeFeedbackRequest`, below-threshold | <3 responses | redirects to `/dashboard/feedback/{id}?error=` with the RPC's own exact message | thrown-not-swallowed |
| `get_request_competency_narrative`, above threshold | closed ad-hoc request, >=3 responses | returns revealed content (grouped by competency, `mention_count`/`avg_value`/`comments[]`) | N/A |
| `get_request_competency_narrative`, below threshold | <3 responses | returns the "esperando más respuestas" / not-revealed state, no content | N/A |
| `get_request_competency_narrative`, non-requester access | a different caller | throws `'No tienes acceso a esta solicitud.'` | thrown-not-swallowed |
| `get_my_pending_invitations`, valid | an invitee with an unused invitation | returns the pending-invitation row(s) | N/A |

</frozen-after-approval>

## Code Map

- `src/app/actions/feedback.ts` -- 6 exports; 5 in scope (`createFeedbackRequest` 7-26, `createFeedbackRequestForIndividual` 28-47, `cancelFeedbackRequest` 49-64, `closeFeedbackRequest` 66-81, `updateFeedbackRequestEvaluators` 83-100); `submitFeedbackResponse` (109-165) excluded per Intent.
- `supabase/migrations/0058_competency_narrative_report.sql` -- `get_request_competency_narrative`'s exact shape/threshold logic to characterize.
- `supabase/migrations/0048_pending_invitations_cross_org.sql` -- `get_my_pending_invitations`'s exact join/filter shape.
- `supabase/migrations/0005_ad_hoc_feedback_flow.sql` (lines 135-144) -- `create_ad_hoc_feedback_request`'s `min_invitees_per_request` check and exact error message.
- `supabase/migrations/0050_cycle_closing_date_and_edit_rules.sql` (lines 498-556, latest `get_feedback_request_progress`) -- `min_responses_to_reveal` check for `request_type != 'cycle'`.
- `_bmad-output/implementation-artifacts/spec-3-7-characterization-tests-cycles-baseline.md`, `tests/characterization/cycles.test.ts` -- the exact technique to mirror (login/actingAs helpers, mock list, fixture-via-real-actions principle, error-per-RPC-family bar) and the frozen `get_request_competency_comparison` baseline this story explicitly does not duplicate.
- `scripts/seed-demo-company.mjs` -- confirmed zero ad-hoc-request fixtures; reused only for org/member infrastructure.

## Tasks & Acceptance

**Execution:**
- [x] `tests/characterization/feedback.test.ts` -- new -- all 13 I/O-matrix scenarios, plus fixture setup reusing `scripts/seed-demo-company.mjs`

**Acceptance Criteria:**
- Given `scripts/seed-demo-company.mjs`'s seeded org/members, when each of the 5 in-scope feedback Server Actions runs with valid input, then it redirects exactly as documented in the I/O matrix.
- Given input the underlying RPC rejects, then the redirect carries the RPC's own exact error message.
- Given a request with fewer than 3 responses, when `get_request_competency_narrative` is called, then it returns the not-revealed/"esperando más respuestas" state, not partial or full content.
- Given `get_my_pending_invitations` called directly, then it returns the exact shape the dashboard's "Tareas pendientes" list consumes.

## Implementation Notes

**New file:** `tests/characterization/feedback.test.ts` (13 `test()` blocks -- one per I/O-matrix row -- against the local `supabase start` instance, no application source touched).

**Accurate mock list (same as Story 3.7's own investigated finding, re-confirmed for this domain):** the frozen Intent says "mock only `next/navigation`/`next/cache`". Confirmed to hold: none of `feedback.ts`'s 5 in-scope actions ever touch cookies -- every one only calls `supabase.rpc(...)` via the mocked `@/lib/supabase/server` client factory, same shape `cycles.test.ts` already established. Mock list: `next/navigation` + `next/cache` + `@/lib/supabase/server`.

**Fixture:** one fresh demo company per run via `scripts/seed-demo-company.mjs` (`node scripts/seed-demo-company.mjs "Char Test Feedback <runId>" 8`), spawned with `execFileSync` and its stdout regex-parsed for the Supervisor email and each of the 8 employees' emails -- same technique `cycles.test.ts` established. 8 employees is enough for 6 distinct ad-hoc requesters (`create_ad_hoc_feedback_request` allows only one open ad-hoc request per requester at a time, so every scenario needing its own open/closed request needed its own employee) plus a spare invitee pool of >= 5 non-requester employees for each. Every ad-hoc request/response actually under test is built directly via the real Server Actions/RPCs (`createFeedbackRequest`, `cancelFeedbackRequest`, `closeFeedbackRequest`, `updateFeedbackRequestEvaluators`, and `submit_feedback_response`/`get_responder_context`/`get_my_pending_invitations` called directly as fixture-building plumbing per the frozen Intent's own explicit allowance), never through the seed script (which only ever builds 360-cycle fixtures).

**Fixture reuse across matrix rows (deliberate, to hold the employee count to 8):** `closeFeedbackRequest`'s "eligible to close" fixture (a closed ad-hoc request, subtype `competencias`, 3 of 5 invitees responded) is reused for: the "already closed" RPC-rejects case (closing it a second time), `get_request_competency_narrative`'s above-threshold case (same request, same requester), and `get_request_competency_narrative`'s non-requester-access case (one of that request's own invitees, not its requester). Similarly, `get_request_competency_narrative`'s below-threshold fixture (2 of 5 invitees responded, general subtype) is reused for `get_my_pending_invitations`'s valid case (one of the 3 invitees who deliberately never responded still has an unused invitation).

**RPC exact messages (confirmed against final/authoritative migration source, matching each RPC's *current* definition after all later redefinitions -- confirmed via `grep -rli 'function <name>('` across every migration, same technique `cycles.test.ts` used):**
- `create_ad_hoc_feedback_request` (`0057_feedback_request_name.sql`, latest -- text unchanged since `0005`) -- min-invitees: `'Tienes que invitar al menos a 5 personas.'` (default `min_invitees_per_request` is 5, `0001_initial_schema.sql:50`).
- `create_ad_hoc_feedback_request_for_individual` (`0057_feedback_request_name.sql`, latest -- text unchanged since `0037`) -- malformed email: `'Algún email no es válido.'`
- `cancel_ad_hoc_feedback_request` (`0011_ad_hoc_request_lifecycle.sql` -- its only definition, confirmed via grep) -- not-open guard: `'Esta solicitud ya no está abierta.'`
- `close_ad_hoc_feedback_request` (`0014_close_completed_ad_hoc_request.sql` -- its only definition, confirmed via grep) -- not-open guard: `'Esta solicitud ya no está abierta.'`
- `update_ad_hoc_feedback_request_evaluators` (`0032_supervisor_cannot_be_evaluator.sql`, latest) -- only the happy path was in scope per the matrix (no dedicated error row); its own guards were confirmed by source reading only.
- `get_request_competency_narrative` (`0058_competency_narrative_report.sql`, only definition) -- non-requester access: `'No tienes acceso a esta solicitud.'`

**Investigated deviation from the frozen I/O matrix's literal wording, not a guess (same kind of documented deviation Story 3.7's own Implementation Notes recorded for `organizeCycleEvaluators`):** the matrix's `closeFeedbackRequest`, "below-threshold (<3 responses)" row describes an unreachable branch. `close_ad_hoc_feedback_request` (`0014_close_completed_ad_hoc_request.sql` -- confirmed via `grep` across every migration to be its only-ever definition) has **no response-count check at all** -- it only requires the caller to be the request's own requester and `status = 'open'`. Closing succeeds regardless of response count; its one and only error path is the same "not open anymore" guard `cancelFeedbackRequest`'s own RPC-rejects scenario already exercises. The test file's `closeFeedbackRequest` "RPC rejects" scenario therefore exercises that real path (closing the same request a second time) rather than a response-count rejection that does not exist in the actual RPC -- documented here per the frozen block's own "do not modify unless human renegotiates" boundary, not by editing the table.

**`get_request_competency_narrative`'s above-threshold content:** required a `competencias`-subtype ad-hoc request (the `ad_hoc_competencias` template's 3 `competency`-type questions, `0026_competency_text_question_type.sql`) -- the default `general`-subtype template (`default_open_feedback`) is all `open`-type questions with no `competency_code`, which the narrative RPC's `and fa.competency_code is not null` filter would have silently excluded, yielding an always-empty "above threshold" result. Investigated by reading `0058_competency_narrative_report.sql`'s query body directly, not assumed from the matrix's generic "closed ad-hoc request" wording.

**Verification performed:**
- `docker ps` showed `supabase_db_brujula`/`supabase_auth_brujula`/`supabase_rest_brujula`/`supabase_kong_brujula` all healthy while `npx supabase status` reported the CLI-tracked services "stopped" -- the same known-normal state `cycles.test.ts` already documented for this repo; no restart needed.
- `npx vitest run tests/characterization/feedback.test.ts` -- 17/17 passed (13 original + 4 added during review triage), run twice back-to-back for idempotency (the `Date.now()`-suffixed company name/emails avoid cross-run collisions, same convention every characterization file in this repo uses).
- `npm run test` -- 16 files, 279 tests passed (262 prior + 17 new).
- `npm run lint` -- 0 errors; the 1 pre-existing warning (`scripts/seed-company-360.mjs`, unrelated, untouched) is unchanged.
- `npx tsc --noEmit` -- no output, no type errors.
- `git status` confirms no application source was touched: only `tests/characterization/feedback.test.ts` (new), this spec file, and the sprint-status tracker.

**Nothing left incomplete.** No file under `src/app/actions/feedback.ts` or `src/app/dashboard/feedback/**` was modified; no other characterization test file was touched. `update_ad_hoc_feedback_request_evaluators`'s RPC-level error paths (has-responses, min-invitees, self-invite, invalid/supervisor-invitee) are now all exercised with dedicated error-path tests, added during review triage below -- no longer a gap to flag forward.

## Spec Change Log

## Review Triage Log

3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap) run against the diff at baseline `e29797e`.

- **[patch, high]** `updateFeedbackRequestEvaluators` shipped with zero RPC-level error-path coverage despite `update_ad_hoc_feedback_request_evaluators` (`0032_supervisor_cannot_be_evaluator.sql:95-160`) having 5 distinct guard clauses (status, has-responses, min-invitees, self-invite, invalid/supervisor invitee), while every sibling action (create/cancel/close) got dedicated error-path tests. Patched: added 4 new tests -- min-invitees, self-invite, and invalid/supervisor-invitee reusing one still-open zero-response request sequentially (each rejected attempt doesn't mutate state), plus a dedicated has-responses test with its own requester/response fixture. 13 -> 17 tests.
- **[patch, medium]** The `updateFeedbackRequestEvaluators` describe block's header comment claimed the has-responses guard was "exercised by the RPC-rejects scenario under closeFeedbackRequest's sibling, cancelFeedbackRequest, below" -- that scenario actually exercises the unrelated "not open" guard. Patched: rewrote the header comment to correctly describe the 5-guard structure and removed the false pointer; the new has-responses test's own comment now correctly notes what the old comment got wrong.
- **[patch, low]** `get_request_competency_narrative`'s above-threshold test asserted only `typeof row.avg_value === "number"`, not the actual value, even though the fixture is fully deterministic (`respondAsEvaluator` always submits `answer_value: 4`). Patched: asserts `avg_value === 4` on the fully-mentioned row (confirmed `respondAsEvaluator`'s fixture shape directly, `tests/characterization/feedback.test.ts:264-278`, before patching).
- **[patch, low]** `createFeedbackRequestForIndividual`'s "valid emails" test asserted `rows.length > 0` while every other valid-input scenario in the file asserts an exact `toHaveLength(1)`. Patched to `toHaveLength(1)` (safe: a fresh individual account has at most one ad-hoc request).
- **[patch, low]** `createFeedbackRequestForIndividual`'s "RPC rejects" test silently used a second fresh account (`individual-b`) with no comment explaining why, unlike the exactly parallel `employees[1]` case in `createFeedbackRequest`'s own error test, which does explain it. Patched: added the matching comment (reusing `individual-a` would hit the "already have one open request" guard instead of the malformed-email guard this test targets).
- **[false]** Blind Hunter flagged the spec's `status: 'in-review'` vs. `sprint-status.yaml`'s `done` vs. this section's own "no review performed" as three disagreeing signals. Self-referential timing artifact: this was the state mid-review, before this triage pass corrected all three -- not a real defect in the diff under review.
- **[false]** Edge Case Hunter flagged the spec's "esperando más respuestas" phrasing (Intent, threshold row) as not matching the literal UI copy at `src/app/dashboard/feedback/[id]/page.tsx:514-517`. Checked: the spec traces that phrasing to epics.md's own AC wording for the RPC's not-revealed state (Intent line: "as epics.md's own AC requires"), not a claim about literal rendered UI text -- no defect.
- **[defer]** Edge Case Hunter's remaining findings (5 items) are all test-helper defensive-guard gaps -- e.g. no explicit throw if a seeded email has no matching member row, or if `login()` returns no `access_token` -- the same class of test-helper hardening gap already logged to `deferred-work.md` for Stories 3.7/3.8/3.12. Logged there rather than patched, consistent with that precedent: these guard omissions would only matter if the seed script or auth itself were already broken, in which case the resulting failure, while less clearly worded, would still fail loudly rather than silently pass.
- **[patch, low]** Blind Hunter noted `epic-3-context.md` doesn't yet mark Story 3.13 `(done)`, unlike every other completed story in that file. Patched as part of this same finalize step, below.

Verification Gap ran independently and found no gaps (result: "No verification gaps found" -- independently re-confirmed the investigated deviations and threshold-gate placements against real migration source).

## Verification

**Commands:**
- `npm run test` -- expected: all 262 prior tests pass, plus this story's new characterization tests (actual: 279/279 passed -- 262 prior + 17 new, after review-triage patches)
- `npm run lint` -- expected: no new violations (actual: 0 errors, 1 pre-existing unrelated warning)
- `npx tsc --noEmit` -- expected: no new type errors (actual: none)
