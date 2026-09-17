---
title: 'Feedback Feature Flag and Rollback Safety'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5521c13560935a20f2e95d649a4d0aad8ccb67ba'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.16 already built the `USE_NEW_API_FEEDBACK` flag mechanism (default off, old path byte-preserved, checked only in each of the 5 thin callers in `src/app/actions/feedback.ts`), but nothing proves that routing mechanism as a permanent `npm run test` regression, and `docs/feature-flags.md`/`.env.example` (both extended by every domain's equivalent story since Story 3.5) don't yet mention this domain's flag.

**Approach:** Three additive deliverables, mirroring Story 3.11's exact shape (cycles' own flag/rollback story), no changes to any existing action/manager/route file's logic: (1) a new, permanent test file proving the flag-routing mechanism (not business-logic equivalence — that's Story 3.18's job) for **all 5** of the 5 call sites in `src/app/actions/feedback.ts` (feedback has only 5, small enough to sample fully rather than partially — this preempts the under-sampling gap Story 3.11's own review caught and patched for cycles' 6); (2) a new `## USE_NEW_API_FEEDBACK` section in `docs/feature-flags.md`, matching Story 3.5/3.11's exact subsection shape (Domain/Default/Where it's checked/New path/Old path/Regression test, then Manual QA checklist/Rollback procedure/Deletion eligibility), framed with feedback's anonymity-critical stakes (epics.md's own AC: "validate this anonymity-critical domain especially carefully") — the "Verified safe to flip" subsection intentionally omitted, added only once Story 3.18 lands; (3) add `USE_NEW_API_FEEDBACK=false` to `.env.example`, mirroring the existing entries' comment style exactly.

## Boundaries & Constraints

**Always:**
- The new toggle test spies on `feedbackManager` (via `vi.mock`) to prove *which path was taken*, not business-logic correctness — assert call/no-call and argument shape, not deep output equivalence.
- For both flag states (`"true"` → manager called, `supabase.rpc` not called for that action; unset/`"false"`/any-other-string → `supabase.rpc` called, manager not called), covering all 5 call sites: `createFeedbackRequest`, `createFeedbackRequestForIndividual`, `cancelFeedbackRequest`, `closeFeedbackRequest`, `updateFeedbackRequestEvaluators`.
- `docs/feature-flags.md`'s new section states the manual-QA-before-flip checklist and rollback procedure in the same shape/detail as the existing sections, adapted for feedback's anonymity-critical framing (epics.md's own AC wording).
- `.env.example`'s new entry documents default (`false`), where it's checked, and points to `docs/feature-flags.md`, matching the existing entries' comment style.

**Never:**
- Do not modify any existing logic in `src/app/actions/feedback.ts`, `src/server/managers/feedbackManager.ts`, `src/server/db/feedback.ts`, or `src/app/api/feedback-requests/**` — this story is additive-only (new test file, new docs).
- Do not set `USE_NEW_API_FEEDBACK=true` anywhere in committed code, config, `.env.example`'s own default, or any CI-equivalent.
- Do not attempt deep old-vs-new business-logic equivalence testing — that is Story 3.18's scope, not this one's.
- Do not delete the old code path or write any rollback tooling that executes deletion — Epic 5's job, this story only documents the procedure.
- Do not add a "Verified safe to flip" subsection to the new `docs/feature-flags.md` section — that's added by Story 3.18, once it actually lands.
- Do not touch `submitFeedbackResponse` — untouched by Story 3.16, stays untouched here too (no flag, responder domain).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `createFeedbackRequest`, flag `"true"` | env var set | `feedbackManager.createRequest` spy called; `supabase.rpc` not called for this action | N/A |
| `createFeedbackRequest`, flag unset | env var absent | `supabase.rpc("create_ad_hoc_feedback_request", ...)` called; manager spy not called | N/A |
| `createFeedbackRequestForIndividual`, flag `"true"`/unset | env var set/absent | `feedbackManager.createIndividualRequest` spy called / `supabase.rpc(...)` called, mutually exclusive | N/A |
| `cancelFeedbackRequest`, flag `"true"`/unset | env var set/absent | `feedbackManager.cancelRequest` spy called / `supabase.rpc("cancel_ad_hoc_feedback_request", ...)` called, mutually exclusive | N/A |
| `closeFeedbackRequest`, flag `"true"`/unset | env var set/absent | `feedbackManager.closeRequest` spy called / `supabase.rpc("close_ad_hoc_feedback_request", ...)` called, mutually exclusive | N/A |
| `updateFeedbackRequestEvaluators`, flag `"true"`/unset | env var set/absent | `feedbackManager.updateRequestEvaluators` spy called / `supabase.rpc("update_ad_hoc_feedback_request_evaluators", ...)` called, mutually exclusive | N/A |
| Any of the above, flag `"false"` (string, not just unset) | env var literally `"false"` | same as unset -- old path runs | N/A |

</frozen-after-approval>

## Code Map

- `tests/integration/cycles-flag-toggle.test.ts` (Story 3.11) -- the exact technique to mirror: `vi.hoisted` manager mocks, hoisted fake `@/lib/supabase/server` client (`rpc` spy recording call names into an array, no `.from()` needed -- none of the 5 call sites' old/new paths read from a table), `next/navigation`/`next/cache` mocks (redirect-throws-marker pattern), flag set/cleared per-test via `beforeEach`/`afterEach`.
- `src/app/actions/feedback.ts` (Story 3.16) -- exact `if (process.env.USE_NEW_API_FEEDBACK === "true") {...} return;} ... old path ...` shape at all 5 call sites (`createFeedbackRequest` line ~19, `createFeedbackRequestForIndividual` line ~55, `cancelFeedbackRequest` line ~95, `closeFeedbackRequest` line ~127, `updateFeedbackRequestEvaluators` line ~159). `submitFeedbackResponse` (line ~200) has no flag -- excluded.
- `docs/feature-flags.md` (Story 3.5, extended by 3.11) -- exact structure to extend: append a new `## USE_NEW_API_FEEDBACK` section after `USE_NEW_API_CYCLES`'s Deletion eligibility subsection, same subsection order.
- `.env.example` (Story 3.5, extended by 3.11) -- exact comment style/format of the existing `USE_NEW_API_CYCLES` entry, to mirror for `USE_NEW_API_FEEDBACK`.
- No `USE_NEW_API_FEEDBACK=true` anywhere in committed code/config (confirmed via repo-wide grep) -- stays that way after this story.

## Tasks & Acceptance

**Execution:**
- [x] `tests/integration/feedback-flag-toggle.test.ts` -- new -- proves flag routing for all 5 call sites, both flag states, plus the literal-`"false"` spot-check
- [x] `docs/feature-flags.md` -- extended -- new `## USE_NEW_API_FEEDBACK` section, same shape as existing sections
- [x] `.env.example` -- extended -- `USE_NEW_API_FEEDBACK=false`, same comment style as existing entries

**Acceptance Criteria:**
- Given `npm run test` (no env var set beforehand), when it runs, then the new toggle test file's flag-unset scenarios pass, proving old-path routing is exercised by the normal test command
- Given the same `npm run test` run, when the toggle test file sets `USE_NEW_API_FEEDBACK="true"` for its own flag-on scenarios (scoped to that file/test, not the whole suite), then those scenarios pass too
- Given `docs/feature-flags.md` and `.env.example`, when read, then no instance sets or defaults the flag to `true`, and both are internally consistent about the flag's default (off)
- Given Stories 3.13-3.16's full test suites, when this story is complete, then they still pass unchanged

## Implementation Notes

Three additive deliverables, exactly as scoped -- no line of `src/app/actions/feedback.ts`, `src/server/managers/feedbackManager.ts`, `src/server/db/feedback.ts`, or `src/app/api/feedback-requests/**` touched (confirmed via `git status`/diff: only `.env.example`, `docs/feature-flags.md`, this spec file, `sprint-status.yaml`, and the new test file changed).

1. **`tests/integration/feedback-flag-toggle.test.ts`** (new) -- mirrors `tests/integration/cycles-flag-toggle.test.ts`'s (Story 3.11) technique exactly: `vi.hoisted` mock of `@/server/managers/feedbackManager` (the 5 exports the flagged call sites use: `createRequest`, `createIndividualRequest`, `cancelRequest`, `closeRequest`, `updateRequestEvaluators`), a hoisted fake `@/lib/supabase/server` whose `rpc()` spy records call names into an array (no `.from()` needed -- none of the 5 call sites' old or new paths read from a table), and the same "redirect-throws-a-marker" / no-op `revalidatePath` mocks for `next/navigation`/`next/cache`. 11 tests cover all 5 call sites in both flag states, plus one literal-`"false"` spot-check on `createFeedbackRequest` (the mechanism -- the `=== "true"` string comparison -- is identical code shape across all 5 functions, so a single spot-check suffices, matching Story 3.11's own precedent). `submitFeedbackResponse` is not imported or tested -- it has no flag check, per the frozen Never list.
2. **`docs/feature-flags.md`** -- new `## USE_NEW_API_FEEDBACK` section added after the existing `USE_NEW_API_CYCLES` section's Deletion eligibility subsection, same subsection order (Domain/Default/Where it's checked/New path/Old path/Regression test, then Manual QA checklist/Rollback procedure/Deletion eligibility). No "Verified safe to flip" subsection added, per the frozen Boundaries (that's Story 3.18's job). The Domain and Manual QA checklist subsections carry the anonymity-critical framing epics.md's Story 3.17 AC calls for verbatim ("validate this anonymity-critical domain especially carefully"), and the checklist calls out the spec.md §6 anonymity threshold (5 invitees / 3 responses) explicitly on both sides of the flag, since that threshold logic itself lives in the RPCs and is unaffected by this flag either way.
3. **`.env.example`** -- new `USE_NEW_API_FEEDBACK=false` entry appended immediately after the existing `USE_NEW_API_CYCLES=false` entry, same comment style/structure (default, where checked, activation literal, pointer to `docs/feature-flags.md`).

Also updated `_bmad-output/implementation-artifacts/sprint-status.yaml`'s `3-17-feedback-feature-flag-and-rollback-safety` entry from `in-progress` to `done` (it had already been flipped to `in-progress` by the dispatch tooling before implementation started).

No deviations from the spec's frozen Intent/Boundaries/I-O matrix. No open questions.

## Spec Change Log

## Review Triage Log

3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap) run against the diff at baseline `5521c13560935a20f2e95d649a4d0aad8ccb67ba`. Verification Gap found nothing.

- **[patch, medium]** Blind Hunter and Edge Case Hunter independently found the same gap: none of the 5 "flag true" tests ever call `mockRejectedValueOnce` on the manager mocks (new-path `catch (e) { redirect(...) }` branch), and the fake `rpc()` hardcodes `error: null` (old-path `if (error) redirect(...)` branch) -- both branches Story 3.16 added/preserved are reachable from this file's own test invocations but never exercised. A broken error-redirect on either path would ship undetected by this permanent test. Patched: added one error-path test per branch per call site (10 new tests), matching this story's own already-established full-5-coverage philosophy (not a partial sample) for the happy path.
- **[patch, low]** Blind Hunter: `docs/feature-flags.md`'s new section cites "`.memlog.md`'s ADOPTED rollout-sequencing decision" with no path -- the repo has 5 different `.memlog.md` files, making the citation hard to trace. Patched: added the specific path (`_bmad-output/planning-artifacts/architecture/architecture-brujula-gui-2026-09-11/.memlog.md`).
- **[false, timing artifact]** Blind Hunter's "Review Triage Log empty while status is done" finding: the diff was captured before this triage's own finalize-bookkeeping edits, the same self-referential timing pattern already seen in Stories 3.13/3.16's reviews.
- **[false]** Blind Hunter's "no `deferred-work.md` entry for the single-site literal-`"false"` spot-check" and "I/O matrix row overstates `\"false\"`-coverage across all 5" and "test title asserts identical-code-shape as fact without demonstrating it for the other 4" findings (three framings of the same underlying observation): refuted by Story 3.11's own identical, already-accepted precedent -- that story's review explicitly evaluated this exact class of finding for its own single-site `"false"` spot-check (`createFeedbackCycle`, out of 6 call sites) and rejected it verdict `false`, reasoning "the `\"false\"` test proves the `=== \"true\"` string-comparison mechanism itself, which is identical code shape across all N functions... testing it once... provides no additional coverage value on a second function." The same reasoning applies here without modification; `cycles-flag-toggle.test.ts`'s own matrix uses the identical "Any of the above, flag `\"false\"`" generic phrasing, also unmodified by that story's review.
- **[defer]** Blind Hunter: the Manual QA checklist's access-denial step ("confirm access is still correctly denied at every one of the 5 call sites") has zero automated coverage, named in the doc but not tracked as a follow-up. Pre-existing, systemic pattern -- `docs/feature-flags.md`'s `USE_NEW_API_CYCLES` section has the identical un-automated access-denial-only-in-manual-QA step, already accepted by Story 3.11.

## Verification

**Commands:**
- `npm run test` -- **actual:** 19 test files, 346 tests, all passed (325 prior + 21 toggle tests, after review-triage patches added 10 error-path tests). This story's own new file (`tests/integration/feedback-flag-toggle.test.ts`) is fully mocked and needs no live Supabase instance.
- `npm run lint` -- **actual:** 0 errors. 1 pre-existing warning in `scripts/seed-company-360.mjs` (`'idByEmail' is assigned a value but never used`), unrelated to this story and unchanged by it.
- `npx tsc --noEmit` -- **actual:** exit code 0, no output -- no type errors.
- Repo-wide grep for `USE_NEW_API_FEEDBACK=true` -- **actual:** only prose mentions in planning/spec docs (this spec's own frozen text) and `docs/feature-flags.md`'s manual-QA/rollback-procedure prose (describing what an operator sets locally, mirroring `USE_NEW_API_CYCLES`'s identical existing prose); no committed `.env*`, config, or CI-equivalent file sets it to `true`.
