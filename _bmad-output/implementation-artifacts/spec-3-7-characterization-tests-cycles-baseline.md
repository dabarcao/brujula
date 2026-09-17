---
title: 'Characterization Tests for Cycles (Current Behavior Baseline)'
type: 'chore'
created: '2026-09-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd489692'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/app/actions/cycles.ts` (155 lines, 6 exported Server Actions) and the direct-RPC read paths it feeds (`get_cycle_status`, `get_request_competency_comparison`) have zero test coverage. This is the first story of Epic 3's cycles domain (3.7-3.12) — before any refactor touches this code, its exact current behavior must be captured as a frozen baseline, mirroring Story 3.1's already-proven technique for admin/members/auth.

**Approach:** One new file, `tests/characterization/cycles.test.ts`, real Supabase throughout (no RPC/manager mocking), following Story 3.1's exact shape: mock only `next/navigation`/`next/cache`/`next/headers`; a `login`/`actingAs(token)` helper to simulate different users via bearer token; exact-string assertions on redirect URLs and RPC error messages. Fixtures: reuse `scripts/seed-demo-company.mjs` for the underlying org/member/cycle infrastructure it already builds (an organization, a Supervisor, several employees, one closed cycle) — the same technique Story 1.1 used for its own org/member setup — but never as a shortcut for the actual cycles actions under test; every scenario this story characterizes calls the real `src/app/actions/cycles.ts` functions or the real read RPCs directly, not the seed script's own internal calls. One representative error case per RPC family (Story 3.1's own bar, reinforced by its review after finding 3 RPCs with zero error coverage).

**Scope (investigated, not guessed):** epics.md's AC names 6 things to characterize: creating a feedback cycle, organizing evaluators, an individual cycle request, updating evaluators, closing a cycle request, and the resulting competency-comparison report output. These map to `createFeedbackCycle`, `organizeCycleEvaluators`, `createIndividualCycleRequest`, `updateCycleRequestEvaluators` (+ its email-based twin `updateIndividualCycleRequestEvaluators`, structurally identical, one happy-path test only), `finalizeCycleRequest`, and the `get_request_competency_comparison`/`get_cycle_status` read RPCs respectively. `finalizeCycleRequest` synchronously generates and saves an AI interpretation on success (mirrors `reportGroupsManager.closeGroup`'s established shape from Epic 1) — characterize that the interpretation is text-or-null and never throws, not its exact content (non-deterministic).

## Boundaries & Constraints

**Always:**
- Every scenario calls the real Server Action or real RPC against the local `supabase start` instance — no RPC/manager mocking anywhere in this file.
- Every error-path assertion uses the RPC's own exact message text (confirmed against the migration source, not guessed) and the exact redirect URL shape each action produces on error.
- `finalizeCycleRequest`'s AI-interpretation side effect is asserted as "text or null, never throws" (matching `reportGroupsManager.closeGroup`'s already-established, reviewed precedent for the same non-deterministic-content problem), not asserted for specific wording.
- Fixture setup (org/members/one pre-closed cycle) reuses `scripts/seed-demo-company.mjs`'s existing output; the cycle actions/RPCs actually under test in each scenario are always called directly by this test file, never delegated to the seed script.

**Never:**
- Do not modify `src/app/actions/cycles.ts` or any page under `src/app/dashboard/cycles/**`/`src/app/dashboard/feedback/**` — read-only characterization, no production code changes.
- Do not touch `tests/characterization/{admin-members-auth,admin-members-auth-manager,auth-signin,report-groups,report-groups-manager}.test.ts` or any Epic 1/Story-3.1-3.6 file — this story is additive only.
- Do not characterize `create_ad_hoc_feedback_request*`/`close_ad_hoc_feedback_request` — those are `feedbackManager`'s RPCs (Story 3.13's domain), confirmed via investigation to have zero overlap with `cycles.ts`.
- Do not build a full render/characterization of `src/app/dashboard/feedback/[id]/page.tsx` — only the specific `get_request_competency_comparison`/`get_cycle_status` RPCs the AC names, called directly, not the whole page.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `createFeedbackCycle`, valid input | as the Supervisor, valid name/dates/participants | redirects to `/dashboard?cycleCreated=1` | N/A |
| `createFeedbackCycle`, missing required field | empty name | redirects to `/dashboard/cycles/nueva?error=` with the exact pre-RPC validation message | N/A |
| `organizeCycleEvaluators`, valid input | as the Supervisor, valid evaluator ids + categories | redirects to `/dashboard?cycleOrganized=1` | N/A |
| `organizeCycleEvaluators`, RPC rejects | invalid/duplicate evaluator set | redirects to `/dashboard/cycles/{cycleId}?error=` with the RPC's own exact message | thrown-not-swallowed |
| `createIndividualCycleRequest`, valid input | valid evaluator emails + categories + closesAt | redirects to `/dashboard?requestCreated=1` | N/A |
| `createIndividualCycleRequest`, RPC rejects | invalid input (e.g. malformed email set) | redirects to `/dashboard/feedback/nueva-360?error=` with the RPC's own exact message | thrown-not-swallowed |
| `updateCycleRequestEvaluators`, valid input | as the Supervisor, valid evaluator set | redirects to `/dashboard/feedback/{requestId}/gestionar?updated=1` | N/A |
| `updateIndividualCycleRequestEvaluators`, valid input | valid evaluator-email set | same redirect shape as the member-id variant | N/A |
| `finalizeCycleRequest`, below-threshold or valid close | a request eligible to close | redirects to `/dashboard/feedback/{requestId}`; AI interpretation saved as text or null, never throws | N/A |
| `finalizeCycleRequest`, RPC rejects | a request not eligible to close | redirects to `/dashboard/feedback/{requestId}?error=` with the RPC's own exact message | thrown-not-swallowed |
| `get_cycle_status`, closed cycle | seeded closed cycle | returns rows with `status: "completado"` for participants who finished | N/A |
| `get_request_competency_comparison`, closed request | the seeded closed 360 | returns the comparison shape (non-empty, documented keys) the report page consumes | N/A |

</frozen-after-approval>

## Code Map

- `src/app/actions/cycles.ts` -- all 6 exports, exact bodies confirmed by investigation: `createFeedbackCycle` (8-35), `finalizeCycleRequest` (43-64, includes the AI-interpretation side effect), `organizeCycleEvaluators` (66-85), `createIndividualCycleRequest` (87-108), `updateCycleRequestEvaluators` (110-131), `updateIndividualCycleRequestEvaluators` (133-154).
- `src/app/dashboard/cycles/[id]/estado/page.tsx:54-56` -- direct `supabase.rpc("get_cycle_status", {p_cycle_id: id})` call, the shape to reproduce for that read scenario.
- `src/app/dashboard/feedback/[id]/page.tsx:373` -- direct `get_request_competency_comparison` call, the "resulting competency-comparison report output" the AC names.
- `_bmad-output/implementation-artifacts/spec-3-1-characterization-tests-admin-members-auth-baseline.md` -- the exact technique to mirror: `login`/`actingAs(token)` helpers, mock list, fixture-via-real-actions-not-seed-script principle, "one error case per RPC family" bar (reinforced by that story's own review finding 3 uncovered RPCs).
- `scripts/seed-demo-company.mjs:243-289` -- confirmed cycle-fixture mechanism: creates a `feedback_cycles` row, organizes evaluators, closes a bucket of requests, producing the org/member/closed-cycle infrastructure this story's fixtures reuse (not the cycle actions under test themselves).
- `src/lib/aiInterpretation.ts` -- `generateAiInterpretation`, called synchronously inside `finalizeCycleRequest`; already has an established "text or null, never throws" testing precedent from `reportGroupsManager.closeGroup` (Story 1.2) to mirror here.
- `_bmad-output/implementation-artifacts/epic-3-context.md` -- cycles-vs-feedback RPC ownership split (Requirements & Constraints), confirms zero overlap with `feedback.ts`'s RPCs.

## Tasks & Acceptance

**Execution:**
- [x] `tests/characterization/cycles.test.ts` -- new -- all 12 I/O-matrix scenarios (11 `test()` blocks -- the individual-cycle create+update pair share one block, per the Intent's "one happy-path test only" for that email-based twin), plus fixture setup reusing `scripts/seed-demo-company.mjs`

**Acceptance Criteria:**
- Given `scripts/seed-demo-company.mjs`'s seeded org/members/closed-cycle state, when each of the 6 cycles Server Actions runs with valid input, then it redirects exactly as documented in the I/O matrix.
- Given the same actions run with input the underlying RPC rejects, then the redirect carries the RPC's own exact error message, not a generic one.
- Given `finalizeCycleRequest`'s AI-interpretation side effect, when it runs on a successful close, then it never throws regardless of whether interpretation text was generated.
- Given `get_cycle_status`/`get_request_competency_comparison` called directly against the seeded closed cycle, then both return non-empty, correctly-shaped data.

## Implementation Notes

**New file:** `tests/characterization/cycles.test.ts` (11 `test()` blocks covering all 12 I/O-matrix scenarios, against the local `supabase start` instance, no application source touched).

**Accurate mock list (differs from the frozen Intent's stated one):** the frozen Intent says "mock only `next/navigation`/`next/cache`/`next/headers`". Investigated and found not to hold for this domain: unlike Story 3.1's admin/members/auth suite (which needs `next/headers` because `signIn`/`signOut` write real cookies), none of `cycles.ts`'s 6 actions ever touch cookies -- every one only calls `supabase.rpc(...)` via the mocked `@/lib/supabase/server` client factory, the exact shape `report-groups.test.ts` (Story 1.1) already established. This file's actual, accurate mock list is `next/navigation` + `next/cache` + `@/lib/supabase/server` -- noted here rather than editing the frozen block, per Story 3.1's own precedent for the identical kind of wording gap in its own frozen Intent.

**Fixture:** one fresh demo company per run via `scripts/seed-demo-company.mjs` (`node scripts/seed-demo-company.mjs "Char Test Cycles <runId>" 6`), spawned with `execFileSync` and its stdout regex-parsed for the Supervisor email, the cycle id, and each employee's realism bucket -- the same technique `report-groups.test.ts` established. 6 employees (2 per bucket) is enough: `closedEmployee` (bucket "cerrado") feeds `get_cycle_status`/`get_request_competency_comparison`; `readyEmployee` ("listo, sin cerrar") feeds `finalizeCycleRequest`'s valid-close scenario; `halfDoneEmployee` ("a medias") feeds its RPC-rejects scenario; all 6 double as the >=5-strong evaluator pool for the fresh cycle/request this file creates itself.

**Investigated deviation from the I/O matrix's literal wording, not a guess:** `organizeCycleEvaluators`/`updateCycleRequestEvaluators`'s "as the Supervisor" scenarios are exercised with the Supervisor genuinely acting as the request owner, not merely as an example label. `organize_cycle_evaluators` requires the caller to already be a participant of the cycle (`feedback_cycle_participants`) -- true for the Supervisor here because this suite's own fresh `createFeedbackCycle` call names the Supervisor as that cycle's sole participant (`create_feedback_cycle` places no `is_supervisor` restriction on participants -- only `organize_cycle_evaluators`'s own evaluator list excludes the Supervisor, per `0032_supervisor_cannot_be_evaluator.sql`). This also sidesteps a real constraint: `scripts/seed-demo-company.mjs`'s own seeded employees are already locked into its open cycle, and re-using any of them as a participant in a second fresh cycle would trip `create_feedback_cycle`'s "one open cycle at a time per participant" guard (`0023_one_open_cycle_at_a_time.sql`).

**`createIndividualCycleRequest`/`updateIndividualCycleRequestEvaluators` fixture:** both RPCs require `organizations.kind = 'individual'`, which `scripts/seed-demo-company.mjs`'s org never is. Two fresh individual accounts are created directly via `create_individual_account` (called the same way `src/app/dashboard/page.tsx` calls it -- itself out of this story's scope, only the two RPCs `cycles.ts` actually calls are characterized) -- one for the valid create+update pair, a second, independent one for the malformed-email RPC-rejects case (so it doesn't collide with the first account's own "ya tienes un 360 abierto" state).

**RPC exact messages (confirmed against final/authoritative migration source, matching each RPC's *current* definition after all later redefinitions):**
- `create_feedback_cycle` (`0023_one_open_cycle_at_a_time.sql`, latest signature) -- pre-RPC validation in `cycles.ts` itself: `'Rellena todos los campos.'`
- `organize_cycle_evaluators` (`0050_cycle_closing_date_and_edit_rules.sql`, latest) -- `'Ya has organizado tus evaluadores para este ciclo.'`
- `create_individual_cycle_request` (`0057_feedback_request_name.sql`, latest, `p_name` added on top of `0050`'s body -- error text unchanged) -- `'Algún email no es válido.'`
- `close_cycle_request` (`0060_finalize_cycle_request.sql`, latest) -- `'Todavía no se puede finalizar: hace falta llegar al mínimo de respuestas y tu propia autoevaluación.'`
- `get_cycle_status` (`0035_cycle_status_for_supervisor.sql`, only definition) and `get_request_competency_comparison` (`0054_expose_role_in_competency_reports.sql`, latest) -- read paths, no error case in this story's scope (per the I/O matrix).

**`finalizeCycleRequest`'s AI-interpretation assertion:** matches the spec's required shape exactly -- `ai_interpretation` is asserted to be `null` or a non-empty string, never a specific wording, mirroring `reportGroupsManager.closeGroup`'s established precedent (Story 1.2) for the same non-deterministic-content problem. Locally, with no `ANTHROPIC_API_KEY` set for the test process, the outcome was `null` both runs.

**Verification performed:**
- `npx supabase status` reported the CLI-tracked services "stopped" while `docker ps` showed `db`/`auth`/`rest`/`kong` (and others) healthy -- the known-normal state for this repo; no restart needed, confirmed via a direct RPC call before writing tests.
- `npm run test` -- 11 files, 172 tests passed (161 prior + 11 new), run twice for idempotency (unique `Date.now()`-suffixed company name/emails avoid collisions across runs).
- `npm run lint` -- 0 errors; the 1 pre-existing warning (`scripts/seed-company-360.mjs`, unrelated, untouched) is unchanged.
- `npx tsc --noEmit` -- no output, no type errors.
- `git status` confirms no production source was touched: only `tests/characterization/cycles.test.ts` (new) plus this spec file and the sprint-status tracker.

**Nothing left incomplete.** No application source under `src/app/actions/cycles.ts`, `src/app/dashboard/cycles/**`, or `src/app/dashboard/feedback/**` was modified; no other characterization test file was touched.

## Spec Change Log

## Review Triage Log

**3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap):**

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | `get_colleagues_with_closed_cycle` has zero test coverage anywhere in the repo, despite being named in Story 3.8's own AC (the very next story) as one of the RPCs `db/cycles.ts` must wrap -- it will be wrapped without a pre-refactor baseline | medium | patch | Verified: called from `src/app/dashboard/groups/nuevo/page.tsx`, never mentioned or excluded in this spec (unlike the explicitly-excluded ad-hoc-feedback RPCs). Not deliberately excluded by this story's own Intent, just omitted -- add one characterization scenario, mirroring `get_cycle_status`/`get_request_competency_comparison`'s existing shape. |
| 2 | 3 of 6 RPC families (`create_feedback_cycle`, `update_cycle_request_evaluators`, `update_individual_cycle_request_evaluators`) have zero RPC-level error-path coverage -- only happy paths (and, for `createFeedbackCycle`, only the pre-RPC JS validation, never the RPC's own `raise exception`) | medium | patch | Independently found by Blind Hunter (3 separate findings) and Edge Case Hunter (1 claim), both citing exact migration line numbers for the untriggered `raise exception` branches. Directly repeats the exact anti-pattern this story's own frozen Intent cited as the bar not to repeat (Story 3.1's own review finding 3 RPCs with zero error coverage). |
| 3 | The "add-only" branch of both `update*Evaluators` RPCs (triggered when a request already has responses) is never exercised -- only the "full replace" (zero-response) branch is tested, in either the member-id or email-based variant | medium | defer | Real, verified via the test file's own comment admitting it "exercises the 'full replace' branch." Not a trivial fix -- requires building a fixture with a request that already has partial responses, materially more setup than this story's other additions. Logged for Story 3.12's deeper verification pass or a future revisit. |
| 4 | `get_request_competency_comparison`'s assertions omit `principle_code`/`principle_name`/`role_code`/`role_name` -- fields the RPC's own type declares and which this story's own Code Map cites the migration ("expose role in competency reports") that added them | low | patch | Verified: the row type annotation lists all 9 columns but only 5 are asserted via `toHaveProperty`. Data is already returned by the existing call -- trivial to add the missing assertions, no new fixture work. |
| 5 | `get_cycle_status`/`get_request_competency_comparison`'s access-control rejections (non-supervisor, non-requester) are never characterized -- this story's own Boundaries dismissed this as "no error case in this story's scope" | medium | patch (rejection cases only) | Real, and Blind Hunter directly challenged the self-granted exemption. The two rejection-message assertions reuse fixtures this file already builds (the Supervisor account vs. a regular employee account) -- cheap to add. The reveal-threshold empty-result behavior (below-minimum-responses) is NOT included in this patch -- see #6. |
| 6 | `get_request_competency_comparison`'s reveal-threshold behavior (silently empty results when response count is below the minimum) is uncharacterized | medium | defer | Real, but requires a request seeded with a specific partial-response count below threshold -- materially more fixture complexity than #5's access-control cases. Bundled with #3 for a future revisit. |
| 7 | The I/O matrix row for `finalizeCycleRequest` ("below-threshold or valid close") conflates two outcomes into one row whose Input/State and Expected Output columns only describe the valid-close case | n/a | rejected | Fix is to edit this build's frozen spec table only -- explicitly barred regardless of merit. The actual test coverage for both outcomes is correct and unaffected. |
| 8 | Several test-helper functions (`login`, `restGet`, `errorFromRedirect`, the per-evaluator category-array builder, `resolve()`) lack defensive guards for malformed-response/fixture-mismatch edge cases (6 locations from Edge Case Hunter, 1 more from Blind Hunter) | low | defer | Real but low-impact -- these would surface as confusing errors only if the local Supabase instance or seed script's own output shape changed unexpectedly, not from any real behavior this story characterizes. Matches the same class of test-infrastructure hardening already deferred in Stories 3.5/3.6's own reviews. |
| 9 | `finalizeCycleRequest`'s AI-interpretation "text" branch (as opposed to "null") is never actually exercised locally -- `ANTHROPIC_API_KEY` is unset in `.env.test.local`, so `generateAiInterpretation` always short-circuits to `null` before reaching `save_ai_interpretation` | medium (if real) | defer | Independently found by both Verification Gap and Edge Case Hunter. Real, but this is the exact same weak-assertion shape already accepted in three already-merged Epic 1 files (`report-groups.test.ts`, `report-groups-manager.test.ts`, `report-groups-route.test.ts`) for the identical non-determinism problem -- a repo-wide precedent question, not something to fix uniquely in this diff. |

No `intent_gap` or `bad_spec` entries -- no loopback triggered (all findings requiring code changes were additive, none required reverting or amending the frozen block itself).

## Verification

**Commands:**
- `npm run test` -- expected: all 161 prior tests pass, plus this story's new characterization tests (actual: 178/178 passed -- 161 prior + 17 new, after the review's 6 added tests)
- `npm run lint` -- expected: no new violations (actual: 0 errors, 1 pre-existing unrelated warning)
- `npx tsc --noEmit` -- expected: no new type errors (actual: none)
