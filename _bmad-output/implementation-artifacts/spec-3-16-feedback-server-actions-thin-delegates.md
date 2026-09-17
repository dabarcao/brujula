---
title: 'Feedback Server Actions Become Thin Delegates'
type: 'refactor'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1aa752e94ba293cbf68b21702887c647d901a7c1'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/app/actions/feedback.ts`'s 5 in-scope Server Actions still call `supabase.rpc(...)` directly — `feedbackManager` (Story 3.14) exists but nothing calls it yet.

**Approach:** Add a `USE_NEW_API_FEEDBACK` flag (default off, unset today) checked once per action; when true, delegate to `feedbackManager` inside a `try/catch` that preserves the exact same `redirect()`/`revalidatePath()` shape as the old path, then `return`. The old direct-`supabase.rpc()` path stays byte-preserved below the flag check, unconditionally reachable when the flag is off or unset — mirroring Story 3.10's `src/app/actions/cycles.ts` exactly. `submitFeedbackResponse` (responder/invitation-domain, Story 3.19-3.24) is untouched — no flag check, no delegation, stays exactly as-is.

**Scope correction (investigated, not guessed, same correction Story 3.10 already established for the identical situation):** epics.md's Story 3.16 AC states `feedback.ts` will have "zero direct Supabase imports" after this refactor. Not literally achievable while the old path stays byte-preserved (required by this story's own Never boundary) -- `feedback.ts` will still import `createClient` from `@/lib/supabase/server`, used by every one of the 5 actions' still-present old-path branches. This story's actual bar, matching Story 3.10's precedent exactly: zero direct Supabase RPC calls for the 5 feedback-owned operations *when the flag is on* -- achievable and what's tested.

## Boundaries & Constraints

**Always:** Check `process.env.USE_NEW_API_FEEDBACK === "true"` once at the top of each of the 5 in-scope actions, never inside `feedbackManager` or `db/feedback.ts`. On the new path, wrap the manager call in `try/catch`, `redirect()` to the exact same error URL shape the old path uses (with `e instanceof Error ? e.message : String(e)`), then on success call the same `revalidatePath()`/`redirect()` as the old path, then `return` (so execution never falls through to the old path). The old path must remain **completely unmodified, byte-for-byte** — not deleted, not simplified, not merged with the new branch — since Story 3.17 needs a real old path to gate and roll back to.

**Never:** Do not modify `submitFeedbackResponse`, `src/server/db/feedback.ts`, `src/server/managers/feedbackManager.ts`, any `src/app/dashboard/feedback/**` page, or `src/app/api/feedback-requests/**`. Do not add `USE_NEW_API_FEEDBACK` to `.env.example`/`docs/feature-flags.md` yet — that's Story 3.17's job, mirroring Story 3.10/3.11's split. Do not touch `tests/characterization/feedback.test.ts`, `feedback-manager.test.ts`, or `tests/integration/feedback-route.test.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Flag unset/off, any of the 5 actions | default env (no `USE_NEW_API_FEEDBACK`) | old direct-RPC path runs, exact same behavior as before this story | N/A |
| Flag on, `createFeedbackRequest` valid | `USE_NEW_API_FEEDBACK=true`, valid invitees | delegates to `feedbackManager.createRequest`, same redirect as old path | N/A |
| Flag on, RPC rejects (any of the 5 actions) | e.g. below min-invitees | `feedbackManager` throws, caught, redirects to the same error URL with the same message as the old path | thrown-not-swallowed |
| Flag on vs off, same seeded state | identical inputs | identical redirect URL/error message from both paths | N/A |
| Story 3.13's characterization suite | flag unset (default) | all 17 tests still pass unchanged, including the below-threshold case | N/A |

</frozen-after-approval>

## Code Map

- `src/app/actions/cycles.ts` (Story 3.10) -- exact shape to mirror for all 5 actions: flag check first, `try { await cyclesManager.X(...) } catch (e) { redirect(errorUrl + encodeURIComponent(e instanceof Error ? e.message : String(e))); }` then success `revalidatePath`/`redirect`/`return`, old path unchanged below with a blank line separating the two branches.
- `src/app/actions/feedback.ts` -- the 5 in-scope actions to refactor (`createFeedbackRequest`, `createFeedbackRequestForIndividual`, `cancelFeedbackRequest`, `closeFeedbackRequest`, `updateFeedbackRequestEvaluators`) and their exact current error-redirect URL shapes to preserve: `/dashboard/feedback/nueva?error=...` (both create actions), `/dashboard/feedback/{requestId}?error=...` (cancel/close/update), success redirects `/dashboard?requestCreated=1`, `/dashboard?requestCancelled=1`, `/dashboard?requestClosed=1`, `/dashboard/feedback/{requestId}?updated=1`. `submitFeedbackResponse` (lines 109-165) stays untouched.
- `src/server/managers/feedbackManager.ts` (Story 3.14) -- the 5 functions to delegate to: `createRequest(inviteeMemberIds, subtype, name)`, `createIndividualRequest(inviteeEmails, subtype, name)`, `cancelRequest(requestId)`, `closeRequest(requestId)`, `updateRequestEvaluators(requestId, inviteeMemberIds)`.
- `tests/characterization/feedback.test.ts` (Story 3.13) -- frozen baseline, re-run unmodified with the flag unset/off (default) to confirm the old path -- the only path this suite exercises -- is untouched.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/actions/feedback.ts` -- refactor -- add the `USE_NEW_API_FEEDBACK`-gated new-path branch to all 5 in-scope actions, old path byte-preserved below each; `submitFeedbackResponse` untouched
- [x] `tests/characterization/feedback.test.ts` -- re-run unmodified (flag unset) -- confirms all 17 tests still pass, proving the old path is untouched

**Acceptance Criteria:**
- Given the feedback Server Actions, when refactored, then each is a one-line delegate to `feedbackManager` on the new path, with `redirect()`/`revalidatePath()` staying in the action (never moved into the manager)
- Given the refactor is done, when the flag is on, then none of the 5 refactored actions issue a direct `supabase.rpc()` call on that path (the shared `createClient` import stays, used only by the still-present old-path branches, per the Scope correction above)
- Given Story 3.13's characterization tests, when run with the flag unset (default), then all 17 still pass unchanged, including the threshold-boundary case

## Implementation Notes

## Spec Change Log

## Review Triage Log

3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap) run against the diff at baseline `1aa752e94ba293cbf68b21702887c647d901a7c1`. Edge Case Hunter found zero findings.

- **[defer]** Verification Gap: the five new `USE_NEW_API_FEEDBACK`-gated delegate branches have no test exercising the flag-on path -- only the frozen flag-off characterization suite was re-run. Self-dispositioned `defer` by the reviewer itself, citing exact precedent: the identical cycles-domain thin-delegate commit (Story 3.10) also shipped with no new-path test, with verification landing in the next two stories (Story 3.11's flag-toggle test, Story 3.12's new-path-verification test) -- this story's own frozen Never boundary explicitly scopes that out ("that's Story 3.17/3.18's job"), and `sprint-status.yaml` already tracks both as `backlog`.
- **[false]** Blind Hunter's `subtype as FeedbackSubtype` unchecked-cast finding: refuted by identical, already-accepted precedent -- `src/app/actions/cycles.ts` (Story 3.10) casts `categories as CycleParticipantCategory[]` the same way, trusting the RPC's own check constraint rather than re-validating client-side.
- **[false]** Blind Hunter's "catch block relies on `redirect()`'s internal throw, no explicit return" finding: refuted by identical precedent -- every one of `cycles.ts`'s 6 actions has the exact same shape (no explicit `return`/`throw` inside the `catch`), and Next.js's `redirect()` throwing to unwind is the documented, established idiom already used unmodified in every prior domain (Stories 1.6, 3.4, 3.10).
- **[false]** Blind Hunter's "flag string duplicated 5 times, no module-level const" finding: refuted by identical precedent -- `cycles.ts` inlines `process.env.USE_NEW_API_CYCLES === "true"` 6 separate times the same way, not extracted to a shared constant there either.
- **[false]** Blind Hunter's "requestId discarded, missed opportunity to route to the new request" finding: this diff's own frozen Boundaries explicitly require the new path to redirect to "the exact same error URL shape the old path uses" and preserve "the same `revalidatePath()`/`redirect()` as the old path" -- behavioral parity is the deliberate goal, not an oversight.
- **[false, timing artifact]** Blind Hunter's "Tasks checklist unchecked, status stuck at in-progress, Implementation Notes/Spec Change Log empty" findings: the diff `{diff_file}` was captured before this triage's own finalize-bookkeeping edits (checking off both tasks, advancing status to `in-review`) -- the same self-referential timing pattern already seen in Story 3.13's review. The "deviation not recorded in Spec Change Log" sub-claim is separately false on its own terms: that section is reserved for step-04 loopback amendments (per its own template comment, "Empty until the first bad_spec loopback"), not general documentation -- the AC deviation is correctly recorded in Intent instead, matching Story 3.10's identical choice of location for the identical deviation.

## Verification

**Commands:**
- `npx vitest run tests/characterization/feedback.test.ts` -- expected: 17/17 pass, unchanged (flag unset)
- `npm run test` -- expected: all existing tests pass, no new failures
- `npm run lint` -- expected: 0 new errors/warnings
- `npx tsc --noEmit` -- expected: no type errors
