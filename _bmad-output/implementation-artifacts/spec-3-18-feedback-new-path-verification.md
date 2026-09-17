---
title: 'Feedback New-Path Verification Against the Characterization Baseline'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '223168dd4f1a6d2e4f53ec79e45686a30ef1363e'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** epics.md's Story 3.18 AC requires (1) Story 3.13's characterization baseline to match exactly when run against the new path with the flag on, with explicit extra scrutiny on the anonymity-threshold behavior (the product's core trust guarantee), and (2) the symmetric RPC-ownership check Story 3.12 could only do one-sided (cycles' side) — now that `feedbackManager` exists, confirm it calls only ad-hoc-lifecycle RPCs, zero overlap with `cyclesManager`'s cycle-specific set — both as the gating condition before this anonymity-critical flag is ever flipped for real. Neither is currently a permanent, automated fact: Story 3.17's toggle test proves routing only, never business-logic equivalence.

**Approach:** Two sections in one new test file, `tests/integration/feedback-new-path-verification.test.ts`, mirroring Story 3.12's proven shape exactly (real Supabase, no manager/RPC mocking): (1) re-run Story 3.13's characterized scenarios against the Server Actions with the flag forced on for the file's duration, asserting the exact same redirect URLs/error messages/RPC outputs Story 3.13's baseline documents, for all 5 flagged `feedback.ts` functions plus both direct-RPC read scenarios (`get_request_competency_narrative`, `get_my_pending_invitations`) — with dedicated exactly-2-responses (below floor) and exactly-3-responses (at floor) scenarios run against the new path, per epics.md's explicit extra-scrutiny requirement; (2) a static source-inspection check proving `db/feedback.ts` never references any cycle-lifecycle RPC name (completing Story 3.12's one-sided check), and re-confirming `db/cycles.ts` still contains none of the ad-hoc-feedback RPC names (the other direction, already proven by Story 3.12, re-asserted here in one place per the AC's literal "compared against each other" framing — cheap, not required to be new).

**Investigated (not guessed): where the real RPC calls live.** `feedbackManager.ts` makes zero direct `.rpc()` calls (confirmed via `grep -n "rpc(" src/server/managers/feedbackManager.ts` returning nothing) — every real `.rpc()` call lives in `db/feedback.ts`, exactly the same shape Story 3.12's own review caught and fixed for `cyclesManager.ts`/`db/cycles.ts`. This story's Section 2 targets `db/feedback.ts`/`db/cycles.ts` directly from the start, not `feedbackManager.ts`/`cyclesManager.ts`.

## Boundaries & Constraints

**Always:**
- The flag is set to `"true"` once, for this file's duration only (`beforeAll`/`afterAll`, restoring the prior value rather than bare-deleting), never left set for any other test file.
- Every Section-1 assertion asserts the exact same redirect URL shape / error message text / RPC output shape Story 3.13's baseline already documents for that scenario.
- Section 2's static check reads `db/feedback.ts`'s and `db/cycles.ts`'s source text directly (e.g. via `fs.readFileSync`) and asserts zero cross-references between the two RPC name sets.
- The below-threshold (exactly 2 responses) and at-threshold (exactly 3 responses) scenarios are both run against the new path with the flag on, asserting the exact same "no content" / "revealed content" behavior Story 3.13's baseline established.

**Never:**
- Do not modify `tests/characterization/feedback.test.ts` (Story 3.13's frozen baseline) — read-only reference, never edited or duplicated wholesale.
- Do not modify `tests/characterization/feedback-manager.test.ts`, `tests/integration/feedback-route.test.ts`, or `tests/integration/feedback-flag-toggle.test.ts` — all already-shipped, reviewed story deliverables.
- Do not modify any file under `src/` — this story is test-only, no production code changes.
- Do not flip the flag to `"true"` anywhere outside this one test file's own scoped `beforeAll`/`afterAll`.
- Do not touch `submitFeedbackResponse` (no flag, responder domain) — used only as fixture-building plumbing via direct RPC, same allowance Story 3.13 established.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `createFeedbackRequest`, flag on, valid | >= 5 invitees | same `/dashboard?requestCreated=1` redirect as Story 3.13's baseline | N/A |
| `createFeedbackRequest`, flag on, RPC rejects | < 5 invitees | same `?error=` redirect, same message as baseline | thrown-not-swallowed |
| `createFeedbackRequestForIndividual`, flag on, RPC rejects | malformed email | same `?error=` redirect, same message as baseline | thrown-not-swallowed |
| `cancelFeedbackRequest`/`closeFeedbackRequest`, flag on, RPC rejects | already-not-open request | same `?error=` redirect, same "ya no está abierta" message as baseline | thrown-not-swallowed |
| `updateFeedbackRequestEvaluators`, flag on, valid input | zero-response request | same `?updated=1` redirect as baseline | N/A |
| `get_request_competency_narrative`, flag on, exactly 2 responses | below the 3-response floor | returns `[]`, no content -- matches baseline's below-threshold state exactly | N/A |
| `get_request_competency_narrative`, flag on, exactly 3 responses | at the floor | returns revealed content, matching baseline's above-threshold shape exactly | N/A |
| `get_my_pending_invitations`, flag on | unused invitation exists | same shape as baseline | N/A |
| `db/feedback.ts` source, static check | file text | contains none of cycles' lifecycle RPC names (`create_feedback_cycle`, `close_cycle_request`, `organize_cycle_evaluators`) | N/A |
| `db/cycles.ts` source, static check | file text | contains none of feedback's ad-hoc RPC names (`create_ad_hoc_feedback_request`, `create_ad_hoc_feedback_request_for_individual`, `close_ad_hoc_feedback_request`) | N/A |

</frozen-after-approval>

## Code Map

- `tests/integration/cycles-new-path-verification.test.ts`, `_bmad-output/implementation-artifacts/spec-3-12-cycles-new-path-verification.md` (Story 3.12) -- the exact technique/spec shape to mirror, including its own review's fix (Section 2 must target `db/*.ts`, not `*Manager.ts`, since managers make zero direct `.rpc()` calls) -- apply that lesson from the start here.
- `tests/characterization/feedback.test.ts` (Story 3.13, frozen) -- read-only: exact scenario fixtures and assertion strings, including the below/at-threshold fixtures (`respondAsEvaluator` helper, `min_responses_to_reveal` default of 3).
- `tests/characterization/feedback-manager.test.ts` (Story 3.14) -- read-only: manager-layer correctness already proven, including `cancelRequest`/`closeRequest` coverage added during that story's own review.
- `tests/integration/feedback-flag-toggle.test.ts` (Story 3.17) -- read-only: proves routing only, for all 5 functions; this story proves real equivalence instead.
- `src/app/actions/feedback.ts` (Story 3.16) -- exact flag-branch shape to exercise with `USE_NEW_API_FEEDBACK="true"`.
- `src/server/db/feedback.ts` (Story 3.14) -- source to statically inspect for the ad-hoc-vs-cycle RPC-ownership check; every real `.rpc()` call for this domain lives here.
- `src/server/db/cycles.ts` (Story 3.8) -- source to statically inspect for the reverse direction; every real `.rpc()` call for that domain lives here.
- `_bmad-output/planning-artifacts/architecture/architecture-brujula-gui-2026-09-11/ARCHITECTURE-SPINE.md` (AD-3) -- verbatim rule this story's Section 2 satisfies.
- `_bmad-output/implementation-artifacts/epic-3-context.md` -- Requirements & Constraints section states the exact split verbatim: "`cyclesManager` calls only cycle-lifecycle RPCs... `feedbackManager` calls only ad-hoc-lifecycle RPCs... Both may read the shared `feedback_requests` table but neither re-implements the other's lifecycle writes."

## Tasks & Acceptance

**Execution:**
- [x] `tests/integration/feedback-new-path-verification.test.ts` -- new -- section (1): flag-on equivalence for all Story 3.13-characterized scenarios, with dedicated exactly-2/exactly-3-response threshold scenarios; section (2): static `db/feedback.ts` + `db/cycles.ts` symmetric RPC-ownership check

**Acceptance Criteria:**
- Given Story 3.13's characterization tests' recorded outputs, when the same scenarios run against the new path (flag on) in this story's new file, then every recorded output matches exactly, including the below-threshold `[]` state and the exact reveal conditions
- Given a request at exactly 2 responses and at exactly 3, when each is checked against the new path, then the 2-response case shows no content and the 3-response case reveals correctly, matching today's behavior exactly
- Given `feedbackManager`'s RPC call set and `cyclesManager`'s, when compared against each other and against AD-3's documented split, then `feedbackManager` calls only the ad-hoc-specific RPCs with zero overlap against `cyclesManager`'s cycle-specific set
- Given all checks pass, when this story is complete, then the flag is considered safe to flip -- the explicit gating condition for this domain's eventual rollout

## Implementation Notes

**New file:** `tests/integration/feedback-new-path-verification.test.ts` (19 tests), test-only, no `src/` changes.

**Section 1** re-runs Story 3.13's characterized scenarios against the Server Actions with `USE_NEW_API_FEEDBACK` forced to `"true"` for the file's duration only (`beforeAll`/`afterAll`, restoring the prior value, never a bare delete when a value pre-existed) -- same mocks, same fixture technique (one fresh 8-employee demo company via `scripts/seed-demo-company.mjs`), and the same helper functions (`login`/`signUp`/`restGet`/`callRpc`/`getRedirectUrl`/`errorFromRedirect`/`createFreshIndividualAccount`/`respondAsEvaluator`) as `tests/characterization/feedback.test.ts` (Story 3.13). Every assertion is copied verbatim from that baseline: `createFeedbackRequest` (valid create, below-min-invitees rejection), `createFeedbackRequestForIndividual` (valid create, malformed-email rejection), `updateFeedbackRequestEvaluators` (valid full-replace, below-min-invitees/self-invite/supervisor-invitee/has-responses rejections -- all 5 of this RPC's guard clauses), `cancelFeedbackRequest` (valid cancel, "ya no está abierta" rejection), `closeFeedbackRequest` (valid close, "ya no está abierta" rejection), and the two direct-RPC reads `get_request_competency_narrative`/`get_my_pending_invitations`.

**The dedicated exactly-2/exactly-3-response threshold scenarios** (epics.md's explicit extra-scrutiny requirement on the anonymity-threshold behavior) reuse the same fixture shape Story 3.13's baseline established: `closeFeedbackRequest`'s own eligible-to-close fixture collects exactly 3 of 5 invitee responses (the `min_responses_to_reveal` default) before closing, and `get_request_competency_narrative` is re-run directly against that same request afterward, asserting the revealed-content shape (`mention_count`, deterministic `avg_value` of 4) matches the baseline exactly. A separate fixture (a fresh request with exactly 2 of 5 invitees responding, left open) exercises the below-floor state, asserting `get_request_competency_narrative` returns `[]` -- the RPC's own early-return, no partial content -- matching the baseline's confidentiality boundary exactly. Both scenarios run against the new path (flag on), satisfying the spec's own "dedicated" framing without needing any fixture beyond what Story 3.13's own structure already provides.

**Section 2** reads `src/server/db/feedback.ts`'s source text via `fs.readFileSync` and asserts it contains none of the 3 cycle-lifecycle RPC names (`create_feedback_cycle`, `close_cycle_request`, `organize_cycle_evaluators`) -- confirmed via direct reading of the file (Story 3.14) that `feedbackManager.ts` itself makes zero direct `.rpc()` calls (re-confirmed via `grep -n "rpc(" src/server/managers/feedbackManager.ts` returning nothing), so `db/feedback.ts` is the correct target, completing Story 3.12's one-sided check from this domain's side. A second, sibling static check re-reads `src/server/db/cycles.ts` and re-asserts none of the 3 ad-hoc-feedback RPC names appear -- the reverse direction, already proven by Story 3.12's own suite (`tests/integration/cycles-new-path-verification.test.ts`), re-run here in one place per AC3's literal "compared against each other" framing.

**Verified, not assumed:** every RPC name and every characterized error message above was cross-checked against the live source files (`tests/characterization/feedback.test.ts`, `src/app/actions/feedback.ts`, `src/server/db/feedback.ts`, `src/server/db/cycles.ts`, `src/server/managers/feedbackManager.ts`) read in full before writing this file, not copied blind from the spec's own Code Map.

**Nothing left incomplete.** No file under `src/` was touched; `tests/characterization/feedback.test.ts`, `tests/characterization/feedback-manager.test.ts`, `tests/integration/feedback-route.test.ts`, and `tests/integration/feedback-flag-toggle.test.ts` are all untouched. The flag is set only inside this file's own `beforeAll`/`afterAll`. No formal multi-lens review loop (`bmad-review`/`bmad-build`'s review step) was run against this diff as part of this implementation pass -- frontmatter `status` is left at `in-progress` and `review_loop_iteration` at `0` pending that step, matching Story 3.12's own precedent for the same reason.

## Spec Change Log

## Review Triage Log

3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap) run against the diff at baseline `223168dd4f1a6d2e4f53ec79e45686a30ef1363e`.

- **[patch, high]** All three lenses independently converged on the same gap: Section 2's static RPC-ownership check only asserts `db/feedback.ts` avoids 3 named cycle RPCs and `db/cycles.ts` avoids 3 named ad-hoc RPCs, but each `db/*.ts` file's own header comment documents wrapping more (`db/cycles.ts`: 8 total, 5 unchecked -- `create_individual_cycle_request`, `update_cycle_request_evaluators`, `update_individual_cycle_request_evaluators`, `get_cycle_status`, `get_colleagues_with_closed_cycle`; `db/feedback.ts`: 7 total, 2 unchecked -- `cancel_ad_hoc_feedback_request`, `update_ad_hoc_feedback_request_evaluators`). If either file were ever changed to call one of the unchecked names -- a real AD-3 ownership-split violation -- this story's own gating check would still pass green. This story's own AC3 wording ("compared against each other... zero overlap") reads as the full call sets, not a named subset. Patched: extended both `not.toContain` lists to the complete RPC name set each file's own header comment claims, derived by reading the actual `.rpc("...")` call sites in both files directly (not re-typed from memory).
- **[defer]** Blind Hunter: `get_request_competency_narrative`/`get_my_pending_invitations` are exercised only via raw `callRpc(...)`, never through `feedbackManager`'s equivalent functions or their already-shipped Story 3.15 Route Handlers. Matches Story 3.12's own identical precedent finding (its triage log's #5, verdict `defer`) for the symmetric situation with `get_cycle_status`/`get_colleagues_with_closed_cycle`: neither RPC is flag-gated anywhere in production code (the dashboard pages call them directly, unrefactored -- likely Epic 4's job), so there is no actual gated "new path" caller to verify equivalence against yet. `tests/characterization/feedback-manager.test.ts` (Story 3.14) already covers `feedbackManager.getCompetencyNarrative`/`getMyPendingInvitations`'s correctness directly.
- **[defer]** Edge Case Hunter's 4 test-helper defensive-guard findings (no explicit throw if `login()` gets no `access_token`, if a seeded email has no matching member id, if `ctx.competencies` is empty for a competency question, or if a redirect URL is missing `error=`): the same class of test-helper hardening gap already logged repeatedly for Stories 3.7/3.8/3.12/3.13/3.14/3.15/3.17 -- these guard omissions would only matter if the seed script, auth, or an already-passing upstream assertion were already broken, in which case the resulting failure, while less clearly worded, would still fail loudly rather than silently pass.
- **[defer]** Blind Hunter: the file seeds exactly one 8-employee company and allocates all 8 as one-time requester fixtures with no comment flagging the budget is fully spent, unlike Story 3.13's baseline which the Code Map calls out for reference. Minor maintainability note for a future contributor adding a scenario to this file, not a current defect.
- **[false]** Blind Hunter's "`closeFeedbackRequest`'s 'eligible to close (>= 3 responses)' test title implies a response-count gate that doesn't exist" finding: this title is copied verbatim from Story 3.13's own frozen baseline (`tests/characterization/feedback.test.ts`), not introduced by this diff -- re-litigating an already-accepted baseline's wording is out of this story's scope.
- **[false]** Blind Hunter's "'365/365 passing' is an unverifiable bare prose claim" finding: this is the same Verification-section convention every prior story in this repo uses (a report of commands actually run, not something the diff format can embed a live log into) -- not a defect unique to this diff.
- **[rejected]** Blind Hunter's "`subtype: 'general'` explicitly set as a no-op in one test" and "baseline_commit hash not human-labeled with a story name" findings: both cosmetic, no demonstrated harm, fix is stylistic polish with no behavioral value.
- **[rejected]** Blind Hunter's "non-requester access test for `get_request_competency_narrative` isn't listed in the spec's own I/O matrix" finding: the test has *more* coverage than the matrix lists, not less -- not a defect, and the only "fix" available is editing this build's frozen spec, rejected per that explicit rule regardless of merit.

## Verification

**Commands run:**
- `npx supabase status` reported the CLI-tracked services "stopped" while `docker ps` showed `db`/`auth`/`rest`/`kong` (and others) healthy -- the known-normal state for this repo (confirmed against Story 3.12's own Implementation Notes), verified before running any tests.
- `npx vitest run tests/integration/feedback-new-path-verification.test.ts` -- 19/19 passing on first run.
- `npm run test` -- 365/365 passing (346 prior + 19 new), confirming no other suite's behavior changed with the flag scoped to this file only.
- `npm run lint` -- 0 errors, 1 pre-existing warning (`scripts/seed-company-360.mjs`, unrelated to this story) -- no new violations.
- `npx tsc --noEmit` -- clean, no output, exit 0.
- `git status`/`git diff --stat` confirms only this one new test file was added under `tests/`, no `src/` file was touched, and no existing test file was modified.
