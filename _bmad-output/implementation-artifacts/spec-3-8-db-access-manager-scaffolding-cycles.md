---
title: 'DB-Access and Manager Scaffolding for Cycles'
type: 'chore'
created: '2026-09-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '3fb8617'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/app/actions/cycles.ts` still calls Supabase directly. Story 3.7 already captured its pre-refactor baseline; this story builds the `db → managers` layering for this domain, mirroring Story 3.2's already-proven pattern (and the original Story 1.2 pattern) exactly.

**Scope correction (investigated, not guessed):** epics.md's Story 3.8 AC lists 7 RPCs for `db/cycles.ts` to wrap, but investigation found a real omission: `update_individual_cycle_request_evaluators` (`supabase/migrations/0050_cycle_closing_date_and_edit_rules.sql`) is a genuine, distinct RPC that a real Story-3.7-characterized Server Action (`updateIndividualCycleRequestEvaluators`) calls — it's missing from the AC's list, the same class of miscategorization already found and corrected in Stories 1.6/1.7/2.7/3.2. **Included in this story's scope as the 8th wrapped RPC.** Separately, `get_request_competency_comparison` (characterized by Story 3.7 as a read path) is **excluded**: its own SQL comment states it's cycle-request-specific in semantics, but its only call site (`src/app/dashboard/feedback/[id]/page.tsx`) lives under the shared `feedback_requests`-table request-detail page, not any cycles route — it belongs to `db/feedback.ts` (Story 3.14), not here. `cyclesManager` calls **all** functions `db/cycles.ts` exports, one per manager function — confirmed via `adminManager`/`db/admin.ts` (Story 3.2) as the established 1:1 pattern in this codebase, not a narrower subset; epic-3-context.md's "cyclesManager calls only cycle-lifecycle RPCs" describes what it must never call (the ad-hoc-feedback RPCs, per AD-3's shared-table split), not a cap smaller than what it wraps.

**Approach:** Eight new files' worth of wrapping across two files, mirroring `src/server/db/reportGroups.ts`/`src/server/managers/reportGroupsManager.ts`'s established shape (thin typed wrappers, no Supabase-shaped types in exported signatures, camelCase mapping from RPC snake_case, `import "server-only";` first):
- `src/server/db/cycles.ts` — `createFeedbackCycle(name, opensAt, closesAt, participantMemberIds)`, `closeCycleRequest(requestId)`, `organizeCycleEvaluators(cycleId, evaluatorMemberIds, evaluatorCategories)`, `createIndividualCycleRequest(evaluatorEmails, evaluatorCategories, closesAt, name)`, `updateCycleRequestEvaluators(requestId, evaluatorMemberIds, evaluatorCategories)`, `updateIndividualCycleRequestEvaluators(requestId, evaluatorEmails, evaluatorCategories)`, `getCycleStatus(cycleId)`, `getColleaguesWithClosedCycle()`.
- `src/server/managers/cyclesManager.ts` — calls only `db/cycles.ts`, one manager function per db function, same 1:1 shape as `adminManager`. Never calls `redirect()`/`revalidatePath()`/cookies, never calls the ad-hoc-feedback RPCs `feedbackManager` owns.

## Boundaries & Constraints

**Always:**
- Every `db/*` function exports plain-TypeScript-typed functions, no Supabase-shaped types in any signature — same rule as Story 1.2/3.2.
- `cyclesManager` calls only `db/cycles.ts`, never `supabase` directly, never `redirect()`/`revalidatePath()`/cookies.
- Story 3.7's characterization suite still passes, now additionally exercised against the new manager path for at least the RPCs it characterizes (mirroring Story 3.2's own "re-verify against Story 3.1's baseline" requirement).
- `db/cycles.ts`'s `closeCycleRequest` wraps only the `close_cycle_request` RPC itself — no AI-interpretation logic in the db or manager layer at all.
- `cyclesManager`'s close-request function does **not** orchestrate AI-interpretation generation/saving — verified (not assumed) that `finalizeCycleRequest`'s AI-interpretation helper, `generateAiInterpretation` (`src/lib/aiInterpretation.ts`), is a *different* function from the already-migrated `generateReportGroupInterpretation` (`aiInterpretationManager.ts`, report-groups-only). `generateAiInterpretation` itself internally calls `get_request_competency_comparison`, `get_request_competency_by_category`, and `get_request_saboteadores` — all feedback-domain RPCs (per this story's own Intent, `get_request_competency_comparison` belongs to Story 3.14, not here), so this interpretation helper is not cleanly cycles-owned and is **not migrated by this story**. `finalizeCycleRequest` keeps calling it and `save_ai_interpretation` directly, exactly as today, unaffected by this story's `db`/`manager` scaffolding.

**Never:**
- Do not touch `src/app/actions/cycles.ts` or any page under `src/app/dashboard/cycles/**`/`src/app/dashboard/feedback/**` — they keep calling Supabase directly, unchanged; delegating them is Story 3.10's job.
- Do not wrap `get_request_competency_comparison` here — feedback-domain scope (Story 3.14), per the Intent's investigated correction.
- Do not wrap `create_ad_hoc_feedback_request*`/`close_ad_hoc_feedback_request` — `feedbackManager`'s RPCs, per AD-3's shared-table ownership split.
- Do not add the ESLint boundary rule or app-token issuance mechanism — both already exist (Stories 1.3/1.4), reused as-is.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `cyclesManager` create-cycle, in-process | same fixtures as Story 3.7's create test | identical to the characterized baseline | thrown, not swallowed |
| `cyclesManager` close-cycle-request, in-process | same fixtures as Story 3.7's close tests (eligible + not-eligible) | identical to baseline for both outcomes | thrown, not swallowed |
| `cyclesManager` organize-evaluators, in-process | same fixtures as Story 3.7's organize test (valid + already-organized) | identical to baseline for both outcomes | thrown, not swallowed |
| `cyclesManager` create-individual-request, in-process | same fixtures as Story 3.7's individual-request test | identical to baseline | thrown, not swallowed |
| `cyclesManager` update-evaluators (member-id + email variants), in-process | same fixtures as Story 3.7's update tests | identical to baseline for both variants | thrown, not swallowed |
| `cyclesManager` get-cycle-status / get-colleagues-with-closed-cycle, in-process | same fixtures as Story 3.7's read tests | identical shape to baseline | N/A |

</frozen-after-approval>

## Code Map

- `src/server/db/reportGroups.ts`, `src/server/managers/reportGroupsManager.ts` (Story 1.2) — the exact pattern to mirror for the 8 in-scope RPCs: `import "server-only";` first, `createClient()` per function, `if (error) throw new Error(error.message)`, camelCase mapping, private snake_case row types. `closeGroup`'s own AI-interpretation orchestration is NOT a pattern to mirror here — verified (see Boundaries) that `finalizeCycleRequest`'s interpretation helper is a different, still-unmigrated, cross-domain function; `cyclesManager` does not touch it.
- `src/lib/aiInterpretation.ts` — `generateAiInterpretation(supabase, requestId)` (line 56), confirmed to internally call `get_request_competency_comparison`/`get_request_competency_by_category`/`get_request_saboteadores` (feedback-domain RPCs) — out of this story's scope, read-only reference confirming why it's excluded.
- `src/server/db/admin.ts`, `src/server/managers/adminManager.ts` (Story 3.2) — confirms the "manager calls every db-wrapped function, 1:1" pattern via direct comparison (4 db exports, 4 manager calls, no subset).
- `_bmad-output/implementation-artifacts/spec-3-7-characterization-tests-cycles-baseline.md`, `tests/characterization/cycles.test.ts` — the recorded baseline this story's own verification re-runs against; exact RPC signatures/error messages already confirmed there for all 8 RPCs plus the 2 excluded reads.
- RPCs in scope (exact signatures, confirmed via Story 3.7's own investigation and this story's own):
  - `create_feedback_cycle(p_name, p_opens_at, p_closes_at, p_participant_member_ids) returns uuid` (cycle id).
  - `close_cycle_request(p_request_id) returns void`.
  - `organize_cycle_evaluators(p_cycle_id, p_evaluator_member_ids, p_evaluator_categories) returns void`.
  - `create_individual_cycle_request(p_evaluator_emails, p_evaluator_categories, p_closes_at, p_name) returns uuid` (request id).
  - `update_cycle_request_evaluators(p_request_id, p_evaluator_member_ids, p_evaluator_categories) returns void`.
  - `update_individual_cycle_request_evaluators(p_request_id, p_evaluator_emails, p_evaluator_categories) returns void` (`0050_cycle_closing_date_and_edit_rules.sql` — the AC-omitted 8th RPC).
  - `get_cycle_status(p_cycle_id) returns table(member_id uuid, full_name text, email text, status text)`.
  - `get_colleagues_with_closed_cycle() returns table(...)` (`0064_report_groups.sql`) — no params, caller-scoped.
- `src/app/actions/cycles.ts` — exact current Server Action bodies (unmodified by this story) confirming each RPC's call-site param names/shapes.

## Tasks & Acceptance

**Execution:**
- [x] `src/server/db/cycles.ts` (new) -- 8 wrapped functions per the Code Map
- [x] `src/server/managers/cyclesManager.ts` (new) -- calls only `db/cycles.ts`, 1:1
- [x] `tests/characterization/cycles-manager.test.ts` (new) -- re-verifies a representative subset of Story 3.7's fixtures directly against the new manager functions

**Acceptance Criteria:**
- Given the 8 in-scope RPCs, when `db/cycles.ts` is created, then it exports typed functions wrapping each, no Supabase-shaped types in their signatures.
- Given `cyclesManager.ts`, when built, then it calls only `db/cycles.ts`, never `supabase` directly, and never calls any ad-hoc-feedback RPC.
- Given Story 3.7's characterization tests, when this story is complete, then they still pass unchanged, and the new manager-level test proves equivalence to that same baseline.

## Implementation Notes

**New files:**
- `src/server/db/cycles.ts` -- 8 thin typed wrappers (`createFeedbackCycle`, `closeCycleRequest`, `organizeCycleEvaluators`, `createIndividualCycleRequest`, `updateCycleRequestEvaluators`, `updateIndividualCycleRequestEvaluators`, `getCycleStatus`, `getColleaguesWithClosedCycle`), mirroring `src/server/db/reportGroups.ts`/`src/server/db/admin.ts` exactly: `import "server-only";` first, `createClient()` per function, `if (error) throw new Error(error.message)`, camelCase mapping via private snake_case row types, no Supabase-shaped types in any exported signature.
- `src/server/managers/cyclesManager.ts` -- 8 manager functions, 1:1 with `db/cycles.ts`, calling only that module. Never imports `@supabase/supabase-js`/`@supabase/ssr`, never calls `redirect()`/`revalidatePath()`/cookies, never calls an ad-hoc-feedback RPC.
- `tests/characterization/cycles-manager.test.ts` -- re-verifies a representative subset of Story 3.7's fixtures (own fresh `seed-demo-company.mjs` run) directly against every one of the 8 new manager functions: 14 new `test()` blocks covering all 6 I/O-matrix rows (create-cycle valid+reject, organize-evaluators valid+reject, update-evaluators valid+reject, create-individual-request valid+reject+self-invite-reject, close-request eligible+not-eligible, get-status valid+reject, get-colleagues-with-closed-cycle).

**Investigated correction to this story's own Code Map (not a frozen-block edit):** `organize_cycle_evaluators` does not `returns void` as the Code Map states -- its actual, current definition (`supabase/migrations/0050_cycle_closing_date_and_edit_rules.sql:24-126`) is `returns uuid`, `return new_request_id;` at line 124. Confirmed by reading the full function body (the earlier `0007`/`0032` definitions are superseded). `db/cycles.ts#organizeCycleEvaluators` and `cyclesManager#organizeEvaluators` both wrap this correctly as `Promise<string>` (the new cycle request's id), not `Promise<void>` -- the Code Map's other 7 signatures were all confirmed accurate as written.

**Deliberate behavior difference from the Server Action baseline, per this story's own Boundaries:** `cyclesManager.closeRequest` wraps only `close_cycle_request` -- it does not generate/save an AI interpretation the way `finalizeCycleRequest` (`src/app/actions/cycles.ts`, unmodified) does today. `tests/characterization/cycles-manager.test.ts`'s close-request test explicitly asserts `ai_interpretation` stays `null` through the manager path (a real, intentional divergence from Story 3.7's own baseline assertion for the same RPC, not a bug).

**Verification performed:**
- `npx supabase status` reported the CLI-tracked services "stopped" while `docker ps` showed `db`/`auth`/`rest`/`kong` (and others) healthy -- the known-normal state for this repo, confirmed before running tests.
- `npm run test` -- 12 files, 192 tests passed (178 prior + 14 new).
- `npm run lint` -- 0 errors; the 1 pre-existing warning (`scripts/seed-company-360.mjs`, unrelated, untouched) is unchanged.
- `npx tsc --noEmit` -- no output, no type errors.
- `git status` confirms no production source outside the two new `src/server/**` files was touched, and no existing test file was modified.

**Nothing left incomplete.** `src/app/actions/cycles.ts` and every page under `src/app/dashboard/cycles/**`/`src/app/dashboard/feedback/**` remain untouched, as required. No formal multi-lens review loop (`bmad-review`/`bmad-build`'s review step) was run against this diff as part of this implementation pass -- the frontmatter `status` is left at `in-progress` and `review_loop_iteration` at `0` pending that step; `_bmad-output/implementation-artifacts/sprint-status.yaml`'s `3-8` entry was intentionally left as `in-progress` for the same reason, not flipped to `done` here.

## Spec Change Log

## Review Triage Log

**3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap):**

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | Spec frontmatter/Implementation Notes/`sprint-status.yaml` appear to disagree on the story's status (`in-review` vs. text saying "left at in-progress" vs. tracker showing `in-progress`) | false | — | Self-referential timing artifact: the implementer truthfully reported `in-progress` at the moment they finished; the orchestrator (this review pass) subsequently advanced the spec to `in-review` before dispatching review, per this session's established per-story convention (matches every prior story: 3.2 through 3.7 all show this same lag between spec status and `sprint-status.yaml` during the review window). Not a defect. |
| 2 | Review Triage Log shipped empty | false | — | This IS the review pass filling it in, right now — the log was necessarily empty in the diff snapshot taken before review ran. |
| 3 | The Intent's "Scope correction" precedent citation ("same class of miscategorization already found and corrected in Stories 1.6/1.7/2.7/3.2") overstates similarity -- those stories' corrections were different specific issue types (flag sequencing, route-name mismatch, wrongly-included not omitted RPC) | n/a | rejected | Fix is to edit this build's spec prose only. Fair observation on the prose's looseness, but doesn't affect code correctness. |
| 4 | The frozen I/O matrix's last row marks `get_cycle_status`/`get_colleagues_with_closed_cycle` "Error Handling: N/A," but the shipped suite adds a non-supervisor rejection test for `get_cycle_status` -- the matrix undersells actual coverage | n/a | rejected | Fix is to edit this build's frozen spec table only. Coverage exceeds what the matrix committed to, which is not a problem. |
| 5 | `create_individual_cycle_request`'s `p_name` parameter (added later, in `0057_feedback_request_name.sql`) has no migration citation in the Code Map, unlike the care taken for the 8th RPC and `organize_cycle_evaluators`'s corrected return type | low | rejected | Fix is to edit this build's spec's Code Map only. |
| 6 | `db/cycles.ts`'s `data as string` casts (3 functions) have no null-guard if the RPC succeeds but returns null data | low | false | Matches the established, already-reviewed convention identical across every prior `db/*.ts` file in this codebase (`db/admin.ts`, `db/reportGroups.ts`, etc.) -- these RPCs `return <uuid variable>` unconditionally on their only success path (confirmed via migration source), making this scenario undemonstrated, not a new risk this story introduces. |
| 7 | Test-helper functions in `tests/characterization/cycles-manager.test.ts` lack defensive guards for a couple of fixture-mismatch edge cases | low | defer | Real but low-impact, matches the identical class of finding already deferred in Story 3.7's own review. |
| 8 | AC's "proves equivalence to that same baseline" claim is broader than accurate given the manager's `closeRequest` deliberately never produces an `ai_interpretation`, unlike the baseline's tolerance for a non-null one | n/a | rejected | Fix is to edit this build's spec's Tasks & Acceptance wording only. The divergence is already prominently documented elsewhere in the same spec (Boundaries, Code Map). |
| 9 | `describe("cyclesManager.organizeEvaluators", ...)` and `describe("cyclesManager.updateRequestEvaluators", ...)` are nested inside `describe("cyclesManager.createCycle", ...)` (to share fixture state), making the test-report hierarchy misleading | low | patch | Independently found by both Blind Hunter and Verification Gap. Real but cosmetic -- flatten the blocks or add a comment explaining the deliberate nesting. |
| 10 | `cyclesManager.getColleaguesReadyForGroup` bakes in a specific downstream consumer (report-group creation, an external domain this story doesn't touch) into its name, unlike every other function in the file, which mirrors its `db/*` counterpart's name | low | patch | Real naming-consistency gap -- unlike `membersManager.acceptInvite`-style intra-domain renames, this couples cycles-domain naming to a foreign domain's concept. Rename to match `db/cycles.ts`'s `getColleaguesWithClosedCycle`. |
| 11 | `CycleStatusRow.status` is typed as plain `string`, even though `get_cycle_status`'s own migration comment documents a closed set of values (`no_iniciado`/`en_progreso`/`completado`), unlike `CycleParticipantCategory`'s existing literal-union treatment in the same file | low | patch | Real, verified inconsistency and missed compile-time safety, trivial fix. |

No `intent_gap` or `bad_spec` entries -- no loopback triggered.

## Verification

**Commands:**
- `npm run test` -- expected: all 178 prior tests pass, plus this story's new manager tests (actual: 192/192 passed -- 178 prior + 14 new)
- `npm run lint` -- expected: no new violations (actual: 0 errors, 1 pre-existing unrelated warning)
- `npx tsc --noEmit` -- expected: no new type errors (actual: none)
