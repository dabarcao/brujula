---
title: 'Cycles New-Path Verification Against the Characterization Baseline'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '8f2eabe'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** epics.md's Story 3.12 AC requires (1) Story 3.7's characterization baseline to match exactly when run against the new path with the flag on, permanently, including the competency-comparison report, and (2) a static check that `cyclesManager` calls only the 3 cycle-specific lifecycle RPCs named in AD-3, never any ad-hoc-feedback RPC — both as the gating condition before the flag is ever flipped for real. Neither is currently a permanent, automated fact: Story 3.10's flag-ON proof was a manual one-off; Story 3.11's toggle test proves routing for 4 of 8 `cyclesManager` functions, never business-logic equivalence.

**Investigated (not guessed): AD-3's "3 RPCs" is not a contradiction with `db/cycles.ts` wrapping 8.** Cross-checked `ARCHITECTURE-SPINE.md`'s AD-3 verbatim: it scopes "`cyclesManager` calls only cycle-specific lifecycle RPCs (`create_feedback_cycle`, `close_cycle_request`, `organize_cycle_evaluators`)" specifically to the **shared `feedback_requests` table's write-ownership split** against `feedbackManager`'s ad-hoc RPCs — a *never-cross-this-boundary* rule, not an exhaustive cap on everything `cyclesManager` may call. Story 3.8's own spec already investigated and resolved this identically: the other 5 RPCs `db/cycles.ts` wraps were separately justified as cycles-owned by Story 3.8's own investigation, not by AD-3, which never enumerates them. AC2's "checkable now from the architecture spine alone" phrasing means: prove `cyclesManager` never calls an ad-hoc-feedback RPC (`create_ad_hoc_feedback_request*`, `close_ad_hoc_feedback_request`) — a negative/boundary check, not "cyclesManager's RPC set equals exactly these 3."

**Approach:** Two sections in one new test file, `tests/integration/cycles-new-path-verification.test.ts`, mirroring Story 3.6's proven shape (real Supabase, no manager/RPC mocking): (1) re-run Story 3.7's characterized scenarios against the Server Actions with the flag forced on for the file's duration, asserting the exact same redirect URLs/error messages Story 3.7's baseline documents, for all 6 `cycles.ts` functions plus both read-RPC scenarios (`get_cycle_status`, `get_colleagues_with_closed_cycle`); also re-run the `get_request_competency_comparison` scenario end-to-end against data produced via the new path, confirming report-reading integrity even though that RPC itself isn't flag-gated (it's excluded to `db/feedback.ts`, Story 3.14, per Story 3.8's own investigated correction); (2) a static source-inspection check proving `cyclesManager.ts` never references any ad-hoc-feedback RPC name, satisfying AC2's boundary check without depending on `feedbackManager` existing yet (Story 3.18 does the reverse, symmetric check). One in-process-vs-HTTP equivalence test (mirroring Story 3.6's own technique) is included as a natural, low-cost extension of AC1's equivalence framing, though not literally required by epics.md's AC text.

**Scope note (investigated, not guessed):** unlike Story 3.6, epics.md's Story 3.12 AC has no access-boundary/non-Supervisor-rejection requirement (AC2 here is a static RPC-ownership check, not a runtime rejection test). Investigation confirms Story 3.9's route suite does have an analogous real gap (only 1 of 7 mutating cycles routes has non-Supervisor rejection coverage) — but since this story's own AC doesn't call for closing it, it's logged to `deferred-work.md` rather than absorbed into this story's scope.

**Investigated (not guessed): `finalizeCycleRequest`'s equivalence proof.** Its new-path AI-interpretation shape (`src/app/actions/cycles.ts:75-98`, unchanged since Story 3.10) is: `cyclesManager.closeRequest` in a try/catch, then unconditionally `generateAiInterpretation`/`save_ai_interpretation` with the latter's RPC result never checked — identical in both old and new branches. This story's equivalence test reproduces this exactly and asserts `ai_interpretation` ends up `text or null, never throws` (Story 3.7's own established convention for this same non-determinism problem), not a specific value.

## Boundaries & Constraints

**Always:**
- The flag is set to `"true"` once, for this file's duration only (`beforeAll`/`afterAll`, restoring the prior value rather than bare-deleting, matching Story 3.6's own precedent), never left set for any other test file.
- Every Section-1 assertion asserts the exact same redirect URL shape / error message text Story 3.7's baseline already documents for that scenario.
- Section 2's static check reads `cyclesManager.ts`'s source text directly (e.g. via `fs.readFileSync`) and asserts none of the 3 known ad-hoc-feedback RPC names (`create_ad_hoc_feedback_request`, `create_ad_hoc_feedback_request_for_individual`, `close_ad_hoc_feedback_request`) appear anywhere in it.
- `finalizeCycleRequest`'s equivalence test reproduces its AI-interpretation orchestration's exact shape (unconditional, unguarded, `save_ai_interpretation`'s result unchecked) — this is a deliberate preservation, not an oversight, matching Story 3.10's own investigated finding.

**Never:**
- Do not modify `tests/characterization/cycles.test.ts` (Story 3.7's frozen baseline) — read-only reference, never edited or duplicated wholesale.
- Do not modify `tests/characterization/cycles-manager.test.ts`, `tests/integration/cycles-route.test.ts`, or `tests/integration/cycles-flag-toggle.test.ts` — all already-shipped, reviewed story deliverables.
- Do not modify any file under `src/` — this story is test-only, no production code changes.
- Do not flip the flag to `"true"` anywhere outside this one test file's own scoped `beforeAll`/`afterAll`.
- Do not add access-boundary/non-Supervisor-rejection tests — out of this story's own AC scope (see Scope note); logged to deferred-work.md instead.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `createFeedbackCycle`, flag on, valid input | as the Supervisor | same `/dashboard?cycleCreated=1` redirect as Story 3.7's baseline | N/A |
| `createFeedbackCycle`, flag on, RPC rejects | a participant already has an open cycle | same `?error=` redirect, same message as baseline | thrown-not-swallowed |
| `organizeCycleEvaluators`, flag on, RPC rejects | already organized for this cycle | same `?error=` redirect, same message as baseline | thrown-not-swallowed |
| `createIndividualCycleRequest`, flag on, RPC rejects | malformed email | same `?error=` redirect, same message as baseline | thrown-not-swallowed |
| `updateCycleRequestEvaluators`/`updateIndividualCycleRequestEvaluators`, flag on, valid input | as the Supervisor / fresh individual account | same redirect shape as baseline for both variants | N/A |
| `finalizeCycleRequest`, flag on, valid close | a request eligible to close | same `/dashboard/feedback/{requestId}` redirect; AI interpretation text-or-null, never throws, `save_ai_interpretation` result unchecked | N/A |
| `finalizeCycleRequest`, flag on, RPC rejects | a request not eligible to close | same `?error=` redirect, same message as baseline | thrown-not-swallowed |
| `get_cycle_status`/`get_colleagues_with_closed_cycle`, flag on | seeded closed cycle | same shape as baseline | N/A |
| `get_request_competency_comparison`, against new-path-produced data | closed request via the new path | same comparison shape as baseline (RPC itself unflagged, confirms report-reading integrity post-refactor) | N/A |
| `cyclesManager.ts` source, static check | file text | contains none of the 3 ad-hoc-feedback RPC names | N/A |

</frozen-after-approval>

## Code Map

- `tests/integration/admin-members-auth-new-path-verification.test.ts`, `_bmad-output/implementation-artifacts/spec-3-6-admin-members-new-path-verification.md` (Story 3.6) -- the exact technique/spec shape to mirror.
- `tests/characterization/cycles.test.ts` (Story 3.7, frozen) -- read-only: exact scenario fixtures and assertion strings.
- `tests/characterization/cycles-manager.test.ts` (Story 3.8) -- read-only: manager-layer correctness already proven.
- `tests/integration/cycles-flag-toggle.test.ts` (Story 3.11) -- read-only: proves routing only, for 4 of 8 functions; this story proves real equivalence instead, for all functions Story 3.7 characterized.
- `src/app/actions/cycles.ts` (Story 3.10) -- exact flag-branch shape to exercise with `USE_NEW_API_CYCLES="true"`; `finalizeCycleRequest`'s exact AI-interpretation shape (lines 75-98).
- `src/server/db/cycles.ts` (Story 3.8) -- source to statically inspect for AC2's RPC-ownership check (where every real `.rpc()` call actually lives; `cyclesManager.ts` itself makes zero direct `.rpc()` calls).
- `_bmad-output/planning-artifacts/architecture/architecture-brujula-gui-2026-09-11/ARCHITECTURE-SPINE.md` (AD-3) -- verbatim rule this story's AC2 satisfies.
- `_bmad-output/implementation-artifacts/spec-3-8-db-access-manager-scaffolding-cycles.md` -- the already-resolved AD-3-vs-8-RPCs reasoning this story's own Intent cites rather than re-litigates.

## Tasks & Acceptance

**Execution:**
- [x] `tests/integration/cycles-new-path-verification.test.ts` -- new -- section (1): flag-on equivalence for all Story 3.7-characterized scenarios; section (2): static `db/cycles.ts` RPC-ownership check; one in-process-vs-HTTP equivalence test

**Acceptance Criteria:**
- Given Story 3.7's characterization tests' recorded outputs, when the same scenarios run against the new path (flag on) in this story's new file, then every recorded output matches exactly, including the competency-comparison report.
- Given `cyclesManager`'s RPC call set, when compared against AD-3's documented cycle-specific list, then it calls only those, never any ad-hoc-specific RPC.
- Given both checks pass, when this story is complete, then the flag is considered safe to flip -- the explicit gating condition for this domain's eventual rollout.

## Implementation Notes

**New file:** `tests/integration/cycles-new-path-verification.test.ts` (19 tests), test-only, no `src/` changes.

**Section 1** re-runs Story 3.7's characterized scenarios against the Server Actions with `USE_NEW_API_CYCLES` forced to `"true"` for the file's duration only (`beforeAll`/`afterAll`, restoring the prior value, never a bare delete when a value pre-existed) — same mocks as Story 3.7's own suite (`next/navigation`, `next/cache`, `@/lib/supabase/server`; no `next/headers` mock needed, confirmed none of `cycles.ts`'s 6 actions touch cookies). Every assertion is copied verbatim from `tests/characterization/cycles.test.ts`: `createFeedbackCycle` (pre-RPC validation, valid create, "already has an open cycle" rejection), `organizeCycleEvaluators` (valid organize, "already organized" rejection), `updateCycleRequestEvaluators` (valid full-replace, "not open" rejection), `createIndividualCycleRequest`/`updateIndividualCycleRequestEvaluators` (valid pair, malformed-email rejection, self-invite rejection), `finalizeCycleRequest` (eligible close + AI-interpretation text-or-null, ineligible-close rejection), and the two direct-RPC reads `get_cycle_status`/`get_colleagues_with_closed_cycle`. `get_request_competency_comparison` is re-run separately against `readyEmployee`'s request — closed a few tests earlier via the flag-ON `finalizeCycleRequest`, i.e. genuinely produced through the new path — confirming report-reading integrity plus its own non-requester access-control rejection.

**`finalizeCycleRequest`'s AI-interpretation equivalence (the caller's specific focus for this build):** confirmed by reading `src/app/actions/cycles.ts:75-98` that the new-path branch's AI-interpretation orchestration is byte-identical in shape to the old path — `cyclesManager.closeRequest` in a try/catch, then unconditionally `const result = await generateAiInterpretation(supabase, requestId); if (result) { await supabase.rpc("save_ai_interpretation", ...); }`, with `save_ai_interpretation`'s own RPC result never destructured, checked, or awaited-and-discarded-on-error — no `{ error }` read, no throw, on either branch. The test's own assertions mirror this exactly: it asserts only that `ai_interpretation` ends up `text or null` and that the call never throws (Story 3.7's own established convention for this non-determinism), and does **not** assert anything about `save_ai_interpretation` having been checked, retried, or guarded — an assertion like that would only pass if the production code were different from what it actually is. Verified directly against the live file, not assumed from the spec's own Intent.

**Section 2** reads `src/server/db/cycles.ts`'s source text via `fs.readFileSync` and asserts it contains none of the 3 ad-hoc-feedback RPC names (`create_ad_hoc_feedback_request`, `create_ad_hoc_feedback_request_for_individual`, `close_ad_hoc_feedback_request`) — confirmed these are the exact 3 names via `supabase/migrations/0005_ad_hoc_feedback_flow.sql`/`0037_individual_accounts.sql`/`0014_close_completed_ad_hoc_request.sql`. `db/cycles.ts` is the correct target: `cyclesManager.ts` itself makes zero direct `.rpc()` calls (confirmed via `grep -n "rpc(" src/server/managers/cyclesManager.ts` returning nothing) — every real `.rpc()` call lives in `db/cycles.ts`, so that file is what the check must inspect to actually gate AC2's boundary.

**Section 1's `organizeCycleEvaluators`/`updateCycleRequestEvaluators` describe blocks** are flat, top-level siblings of `createFeedbackCycle`'s own describe block, not nested inside it — matching the flat structure every other describe block in this file already uses. The `freshCycleId`/`freshRequestId` fixture state they depend on (set by `createFeedbackCycle`'s tests, read by the two describes that follow) now lives in the outer module scope alongside the file's other shared fixture variables, rather than as `let`s local to `createFeedbackCycle`'s describe block.

**Section 3** (in-process-vs-HTTP equivalence, included as a low-cost extension per the spec's own Intent, not literally required by epics.md's AC text): unlike Story 3.6's `createOrganizationAsAdmin` precedent, `createFeedbackCycle`'s own "one open cycle at a time per participant" rule makes a *second successful* create for the same participant non-repeatable without inviting brand-new org members purely as plumbing — out of proportion to a check that isn't required. Chose the rejection path instead: `evaluatorPool[0]` (a seeded employee already locked into the seed's own open cycle) is used for both the in-process, flag-ON `createFeedbackCycle` Server Action call and the `POST /api/cycles` Route Handler call — since rejection never mutates state, reusing the same participant for both calls is safe and repeatable, and both surfaces are asserted to reject with the byte-identical message.

**Verified, not assumed:** every AD-3 RPC name and every characterized error message above was cross-checked against the live migration files listed inline as comments, not copied blind from the spec's own Code Map.

**Nothing left incomplete.** No file under `src/` was touched; `tests/characterization/cycles.test.ts`, `tests/characterization/cycles-manager.test.ts`, `tests/integration/cycles-route.test.ts`, and `tests/integration/cycles-flag-toggle.test.ts` are all untouched. The flag is set only inside this file's own `beforeAll`/`afterAll`. No formal multi-lens review loop (`bmad-review`/`bmad-build`'s review step) was run against this diff as part of this implementation pass — frontmatter `status` is left at `in-progress` and `review_loop_iteration` at `0` pending that step, matching Story 3.8's own precedent for the same reason.

## Spec Change Log

## Review Triage Log

**3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap):**

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | Spec frontmatter (`in-review`)/Implementation Notes ("left at `in-progress`")/`sprint-status.yaml` (`in-progress`) appear to disagree | false | — | Self-referential timing artifact, identical to every prior story this session. |
| 2 | Section 2's static check reads `src/server/managers/cyclesManager.ts`'s source for the 3 ad-hoc-feedback RPC names, but `cyclesManager.ts` contains zero `.rpc()` calls at all -- every actual RPC call lives in `src/server/db/cycles.ts`. The check is vacuously true and cannot catch the AC2 regression it's meant to gate | high | patch | Independently confirmed via direct grep: `cyclesManager.ts` has no `.rpc(` occurrences. A real, significant design flaw -- this is the mechanism meant to satisfy AC2, and it currently can't fail no matter what `cyclesManager`/`db/cycles.ts` actually calls. Fix: point the check at `db/cycles.ts` instead, where the real RPC calls live. |
| 3 | `deferred-work.md`'s new entry labels `GET /api/cycles/[cycleId]/status` -- a read endpoint -- as one of the "mutating cycles routes" while citing it as the one route that already has non-Supervisor coverage | low | fixed directly | Real, verified wording contradiction, non-frozen file, corrected directly. |
| 4 | Section 3's in-process-vs-HTTP equivalence check covers only `createFeedbackCycle`, not the other 5 Server-Action/Route-Handler pairs | n/a | rejected (false) | Explicitly, deliberately scoped in the frozen Intent as "one... test... not literally required by epics.md's AC text," matching Story 3.6's own identical precedent (one representative check, not exhaustive). |
| 5 | Section 1's `get_cycle_status`/`get_colleagues_with_closed_cycle` scenarios call the RPCs directly (matching Story 3.7's baseline), never exercising `cyclesManager.getStatus`/`getColleaguesWithClosedCycle` or their Route Handlers -- these two "new path" functions get no equivalence coverage from this story | low | defer | Real observation, but not a meaningful gap: neither RPC is flag-gated anywhere in production code yet (`dashboard/cycles/[id]/estado/page.tsx` and `groups/nuevo/page.tsx` still call the RPCs directly, unrefactored -- likely Epic 4's job), so there is no actual "new path" caller to verify equivalence against yet. Story 3.8's own manager-level suite already covers these two functions' correctness directly. |
| 6 | `ARCHITECTURE-SPINE.md`'s AD-3 itself still reads as an exhaustive RPC list, an ambiguity this spec (following Story 3.8) has to explain away rather than fix at the source | n/a | rejected | Editing a finalized planning-phase artifact is out of scope for a build-phase story, matching established precedent (e.g. DESIGN.md's own wording tensions, deferred not fixed, throughout Epic 2). |
| 7 | The Verification section and the test file's own Section 2 comment cite `0005_ad_hoc_feedback_flow.sql`/`0037_individual_accounts.sql`/`0057_feedback_request_name.sql` for the 3 ad-hoc RPC names, but `close_ad_hoc_feedback_request` is actually defined in `0014_close_completed_ad_hoc_request.sql`, not any of those three | low | patch | Verified via direct grep -- confirmed `0014` is the sole definition (a later file, `0051_close_cycle_request.sql`, only mentions the name in a comment, doesn't redefine it). Bundled into the same patch as finding #2 since both touch Section 2. |
| 8 | The `organizeCycleEvaluators`/`updateCycleRequestEvaluators` describe blocks are nested inside `createFeedbackCycle`'s describe (to share fixture state), each re-prefixed "Section 1:", producing a confusing duplicated test-tree hierarchy | low | patch | Real, matches the identical class of finding already found and patched in Story 3.8's own review. |

No `intent_gap` or `bad_spec` entries -- no loopback triggered.

## Verification

**Commands run:**
- `npx supabase status` reported the CLI-tracked services "stopped" while `docker ps` showed `db`/`auth`/`rest`/`kong` (and others) healthy -- the known-normal state for this repo (confirmed against Story 3.8's own Implementation Notes), verified before running any tests.
- `npx vitest run tests/integration/cycles-new-path-verification.test.ts` -- 19/19 passing on first run.
- `npm run test` -- 262/262 passing (243 prior + 19 new), confirming no other suite's behavior changed with the flag scoped to this file only.
- `npm run lint` -- 0 errors, 1 pre-existing warning (`scripts/seed-company-360.mjs`, unrelated to this story) -- no new violations.
- `npx tsc --noEmit` -- clean, no output, exit 0.
- `git status`/`git diff --stat` confirms only this one new test file was added under `tests/`, no `src/` file was touched, and no existing test file was modified. (`_bmad-output/implementation-artifacts/deferred-work.md` and `sprint-status.yaml` show pre-existing modifications from this spec's own authoring pass -- the AC2-scope-boundary deferred-work entry and the `3-12` status flip to `in-progress` -- neither was made or touched by this implementation pass.)

**Review-triage patch pass (findings #2, #7, #8 above):**
- Section 2's static check now reads `src/server/db/cycles.ts` (the file where every real `.rpc()` call actually lives) instead of `src/server/managers/cyclesManager.ts` (which has zero `.rpc()` calls, confirmed via `grep -n "rpc(" src/server/managers/cyclesManager.ts` returning nothing) -- the check now actually exercises the code path it's meant to gate for AC2, instead of being vacuously true.
- The `close_ad_hoc_feedback_request` migration citation (in both the test file's Section 2 comment and this spec's Implementation Notes) is corrected from `0057_feedback_request_name.sql` to `0014_close_completed_ad_hoc_request.sql` -- verified via `grep -n close_ad_hoc_feedback_request supabase/migrations/0014_close_completed_ad_hoc_request.sql`, which shows the `create or replace function` definition at line 7. The other two names' citations (`0005_ad_hoc_feedback_flow.sql` for `create_ad_hoc_feedback_request`, `0037_individual_accounts.sql` for `create_ad_hoc_feedback_request_for_individual`) were independently re-verified via grep and are correct as-is.
- The `organizeCycleEvaluators`/`updateCycleRequestEvaluators` describe blocks are flattened to top-level siblings of `createFeedbackCycle`'s describe block (previously nested inside it), with `freshCycleId`/`freshRequestId` moved to outer module scope so the three describes still share that fixture state across the flat structure.
- `npx tsc --noEmit` -- clean, no output, exit 0, after the patch.
- `npx vitest run tests/integration/cycles-new-path-verification.test.ts` -- 19/19 passing after the patch (same count; this was a structural/targeting fix, not a new-scenario addition).
