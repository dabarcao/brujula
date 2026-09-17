---
title: 'Responder/Invitation Feature Flag and Rollback Safety'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '6e0d304e5616613bcdbf8a628f1bd5cc530f7742'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.22 already built the `USE_NEW_API_RESPONDER` flag mechanism across all 3 call sites, but nothing proves that routing mechanism as a permanent `npm run test` regression, and `docs/feature-flags.md`/`.env.example` don't yet mention this domain's flag -- the most cautious rollout of any domain in this migration (external, anonymous, customer-facing, migrated last on purpose).

**Approach:** Three additive deliverables, mirroring Story 3.17's exact shape (feedback's own flag/rollback story), no changes to any existing action/page/manager/route file's logic: (1) a new, permanent test file proving the flag-routing mechanism for `submitFeedbackResponse` -- the one call site that's actually a Server Action and therefore testable the established way; (2) a new `## USE_NEW_API_RESPONDER` section in `docs/feature-flags.md`, framed with this domain's exceptional caution (epics.md's own AC: "the most cautious rollout of any domain," Story 3.24's own AC: "this domain does not go first under any circumstance" -- flips only after admin/members, cycles, and feedback have each survived their own full production cycle); (3) add `USE_NEW_API_RESPONDER=false` to `.env.example`.

**Investigated (not guessed): the two page components' flag routing cannot be proven by an automated toggle test, unlike every prior domain.** `/responder/[token]/page.tsx` and `/invitacion/[token]/page.tsx` are Server Components, not Server Actions -- confirmed via `epic-3-context.md`'s own established constraint ("Server Component rendering itself is not unit-testable and stays manually verified") and Story 3.19's own characterization suite, which never renders either page for the same reason. Story 3.22's own review already relied on manually spinning up an isolated dev server to verify the flag-on path for both pages (not an automated test) -- the same manual technique this story's own Manual QA checklist formalizes as the required verification method for these 2 of the 3 call sites, rather than a gap to close with a new automated test.

## Boundaries & Constraints

**Always:**
- The new toggle test spies on `responderManager` (via `vi.mock`) to prove *which path was taken* for `submitFeedbackResponse`, not business-logic correctness.
- For both flag states (`"true"` → manager called, `supabase.rpc("submit_feedback_response", ...)` not called; unset/`"false"`/any-other-string → `supabase.rpc(...)` called, manager not called).
- The fake `@/lib/supabase/server` client provides both `rpc()` (a spy, to prove old-path routing) and `auth.getUser()` (needed by both branches' identical redirect-target logic, unrelated to the flag), since `submitFeedbackResponse` calls both regardless of which path submitted the response.
- `docs/feature-flags.md`'s new section's Manual QA checklist explicitly requires manually exercising both page components with the flag on (via a local `npm run dev` process, restarted with the env var set) -- the only way to verify their flag routing, per the investigated finding above.
- `.env.example`'s new entry documents default (`false`), where it's checked, and points to `docs/feature-flags.md`, matching every prior entry's comment style.

**Never:**
- Do not modify any existing logic in `src/app/actions/feedback.ts`, `src/app/responder/[token]/page.tsx`, `src/app/invitacion/[token]/page.tsx`, `src/server/managers/responderManager.ts`, `src/server/db/responder.ts`, or any `src/app/api/responder/**`/`src/app/api/invitacion/**` route -- this story is additive-only.
- Do not set `USE_NEW_API_RESPONDER=true` anywhere in committed code, config, `.env.example`'s own default, or any CI-equivalent.
- Do not attempt an automated toggle test for either page component -- not achievable in this repo, per the investigated finding; manual verification is the correct, established method here.
- Do not attempt deep old-vs-new business-logic equivalence testing -- that is Story 3.24's scope.
- Do not delete the old code path or write rollback tooling that executes deletion -- Epic 5's job.
- Do not add a "Verified safe to flip" subsection -- added by Story 3.24, once it lands.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `submitFeedbackResponse`, flag `"true"`, session present | env var set, `getUser()` returns a user | `responderManager.submitResponse` spy called; `supabase.rpc("submit_feedback_response", ...)` not called; redirects to `/dashboard?responded=1` | N/A |
| `submitFeedbackResponse`, flag `"true"`, no session | env var set, `getUser()` returns no user | manager spy called; redirects to `/responder/{token}` | N/A |
| `submitFeedbackResponse`, flag unset | env var absent | `supabase.rpc("submit_feedback_response", ...)` called; manager spy not called | N/A |
| `submitFeedbackResponse`, flag `"false"` (string, not just unset) | env var literally `"false"` | same as unset -- old path runs | N/A |

</frozen-after-approval>

## Code Map

- `tests/integration/feedback-flag-toggle.test.ts` (Story 3.17) -- the exact technique to mirror: `vi.hoisted` manager mock, hoisted fake `@/lib/supabase/server` client, `next/navigation`/`next/cache` mocks, flag set/cleared per-test via `beforeEach`/`afterEach`. Extend the fake client's shape with `auth: { getUser: vi.fn() }` (not needed by feedback's own version) since `submitFeedbackResponse` (this domain) calls it in both branches.
- `src/app/actions/feedback.ts` (Story 3.22) -- exact flag-branch shape to exercise at lines ~243-277 (new path) and ~279-303 (old path) of `submitFeedbackResponse`.
- `docs/feature-flags.md` (Story 3.5, extended by 3.11/3.17) -- exact structure to extend: append `## USE_NEW_API_RESPONDER` after `USE_NEW_API_FEEDBACK`'s Deletion eligibility, same subsection order, but with a Manual QA checklist step explicitly covering both page components (not just the Server Action), and Rollback-eligibility language echoing epics.md's "does not go first under any circumstance" sequencing.
- `.env.example` (Story 3.5, extended by 3.11/3.17) -- exact comment style to mirror.
- `epic-3-context.md` -- "Responder/invitation's flag (3.23, gated by 3.24) is explicitly sequenced last: it flips only after admin/members, cycles, and feedback have each already survived their own full production cycle -- not simply after its own tests pass." -- verbatim constraint this story's docs section must state.

## Tasks & Acceptance

**Execution:**
- [x] `tests/integration/responder-invitation-flag-toggle.test.ts` -- new -- proves flag routing for `submitFeedbackResponse`, both flag states, plus the literal-`"false"` spot-check
- [x] `docs/feature-flags.md` -- extended -- new `## USE_NEW_API_RESPONDER` section, with a Manual QA checklist covering all 3 call sites (the 2 page components manually, `submitFeedbackResponse` both ways)
- [x] `.env.example` -- extended -- `USE_NEW_API_RESPONDER=false`, same comment style as existing entries

**Acceptance Criteria:**
- Given the flag is off, when an anonymous evaluator uses either page, then the old direct-Supabase path runs unchanged (proven automatically for `submitFeedbackResponse`, and documented as a manual-verification requirement for both page components)
- Given the flag is on, when the same flows run, then the new path runs instead, checked only in the thin caller
- Given `docs/feature-flags.md` and `.env.example`, when read, then no instance sets or defaults the flag to `true`, and both state this domain's exceptional "does not go first" sequencing explicitly

## Implementation Notes

Three additive deliverables, exactly as scoped -- no line of `src/app/actions/feedback.ts`, `src/app/responder/[token]/page.tsx`, `src/app/invitacion/[token]/page.tsx`, `src/server/managers/responderManager.ts`, `src/server/db/responder.ts`, or any `src/app/api/responder/**`/`src/app/api/invitacion/**` route touched (confirmed via `git diff --stat`: only `.env.example`, `docs/feature-flags.md`, this spec file, `sprint-status.yaml`, and the new test file changed).

1. **`tests/integration/responder-invitation-flag-toggle.test.ts`** (new) -- mirrors `tests/integration/feedback-flag-toggle.test.ts`'s (Story 3.17) technique exactly: `vi.hoisted` mock of `@/server/managers/responderManager` (only the `submitResponse` export `submitFeedbackResponse` calls), a hoisted fake `@/lib/supabase/server` whose `rpc()` spy records call names, extended beyond Story 3.17's shape with `auth: { getUser: vi.fn() }` since `submitFeedbackResponse` calls `supabase.auth.getUser()` in both branches (unrelated to the flag -- it only picks the post-submit redirect target), and the same "redirect-throws-a-marker" / no-op `revalidatePath` mocks every prior flag-toggle suite uses. 4 tests: flag `"true"` with a session (manager called, `/dashboard?responded=1`), flag `"true"` with no session (manager called, `/responder/{token}`), flag unset (RPC called, manager not called), and the literal-`"false"` spot-check. This is the one call site of the domain's 3 that is a Server Action and therefore testable this way; the two Server Components are out of scope for automated testing per the frozen Intent's investigated finding.
2. **`docs/feature-flags.md`** -- new `## USE_NEW_API_RESPONDER` section added after `USE_NEW_API_FEEDBACK`'s Deletion eligibility subsection, same subsection order (Domain/Default/Where it's checked/New path/Old path/Regression test, then Manual QA checklist/Rollback procedure/Deletion eligibility). No "Verified safe to flip" subsection added, per the frozen Boundaries (that's Story 3.24's job, once it lands). The Domain subsection quotes `epic-3-context.md`'s sequencing constraint verbatim ("it flips only after admin/members, cycles, and feedback have each already survived their own full production cycle -- not simply after its own tests pass") and Story 3.24's "this domain does not go first under any circumstance" framing. The Manual QA checklist explicitly restates the sequencing gate up front, then walks both page components (`/responder/[token]` and `/invitacion/[token]`) via a local `npm run dev` restart, plus every token-validity edge case (expired/invalid/already-used), since that's the only way to verify their flag routing per the investigated finding.
3. **`.env.example`** -- new `USE_NEW_API_RESPONDER=false` entry appended immediately after the existing `USE_NEW_API_FEEDBACK=false` entry, same comment style/structure (default, where checked, activation literal, the sequencing constraint, pointer to `docs/feature-flags.md`).

Also updated `_bmad-output/implementation-artifacts/sprint-status.yaml`'s `3-23-responder-invitation-feature-flag-and-rollback-safety` entry (it had already been flipped to `in-progress` by the dispatch tooling before implementation started; the review-triage step subsequently moved it through `in-review` before this story's own finalize step set it to `done`).

No deviations from the spec's frozen Intent/Boundaries/I-O matrix. No open questions.

## Spec Change Log

## Review Triage Log

3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap) run against the diff at baseline `6e0d304e5616613bcdbf8a628f1bd5cc530f7742`.

- **[patch, high]** Verification Gap and Blind Hunter independently converged on the same finding: this spec's own "Investigated" claim that the two Server Component pages' flag routing "cannot be proven by an automated toggle test, unlike every prior domain" is factually wrong, refuted by a concrete, already-working counter-example in this same repo -- `tests/integration/admin-members-auth-flag-toggle.test.ts` already imports `DashboardPage` (a Server Component) and calls `await DashboardPage()` directly, asserting on which mocked manager/RPC fired, without ever rendering JSX. `RespondPage`/`InvitationPage` have the identical shape (flag branch runs before any JSX is produced). Verification Gap additionally demonstrated the technique live: it confirmed the new toggle test genuinely catches a regression (temporarily inverting the flag condition broke the test, then reverted). As shipped, the most cautious domain in the whole migration had *less* automated coverage than a prior, lower-stakes domain, based on an investigation whose central premise didn't hold. Patched: added automated flag-toggle tests for both page components, mirroring `DashboardPage()`'s exact technique.
- **[patch, medium]** Blind Hunter: the new Manual QA checklist instructs testers to "Repeat via `/invitacion/{token}`... confirm the same rendering and post-submit behavior" and to confirm `submitFeedbackResponse`'s routing "also holds end-to-end through both page components' submit forms" -- both wrong. `/invitacion/[token]` is an account sign-up page whose form posts to `acceptInviteSignUp` (`src/app/actions/auth.ts`), not `submitFeedbackResponse`; it never shows "gracias por tu feedback" and never redirects to `/dashboard?responded=1`. Following this checklist as written, before flipping the repo's most safety-critical flag, would produce a false pass or tester confusion. Patched: corrected the checklist to describe `/invitacion/[token]`'s actual sign-up flow separately from `/responder/[token]`'s submit flow.
- **[patch, medium]** Blind Hunter: the sequencing-gate text (both `docs/feature-flags.md` and `.env.example`) names only 3 prior domains (`USE_NEW_API_ADMIN_MEMBERS`/`_CYCLES`/`_FEEDBACK`), but epics.md's Story 3.24 AC literally requires 4 ("report groups, admin/members, cycles, feedback"). Investigated during patching: report groups (Epic 1) has no `USE_NEW_API_REPORTGROUPS`-equivalent flag anywhere in the current codebase (confirmed via repo-wide grep) -- `src/app/actions/reportGroups.ts` calls `reportGroupsManager` unconditionally, no flag, no old-path branch, meaning that domain's own rollout already completed and its flag was already retired before this session's work began. Patched: the gate text now names report groups too, accurately describing it as already fully migrated (no flag remaining to check) rather than inventing a flag name that doesn't exist.
- **[patch, medium]** Blind Hunter and Edge Case Hunter independently found the same gap: the new toggle test never exercises `submitFeedbackResponse`'s error-redirect branches (`catch (e)` on a manager rejection, `if (error)` on the old path's RPC error) -- unlike `tests/integration/feedback-flag-toggle.test.ts` (Story 3.17), which this spec's own Code Map claims to mirror exactly and which does cover exactly this class of branch for every one of its call sites (added during that story's own review). Patched: added both error-path tests.
- **[false, self-resolving]** Edge Case Hunter's finding that `sprint-status.yaml`'s `in-review` value isn't in the file's own defined Story Status enum: this is the standard intermediate bookkeeping state every story in this build passes through during the review step (per the workflow's own step-04 instructions) -- resolves to `done` at this same finalize step, same as every prior story.
- **[defer]** Blind Hunter: `makeRpcResult`, the `next/navigation`/`next/cache` mocks, and `getRedirectUrl` are now duplicated verbatim across 8 test files (this is the domain's own flag-toggle file's turn). Same class of test-scaffolding-duplication gap already logged repeatedly across this initiative (extract-on-reuse pattern not yet triggered).

## Verification

**Commands:**
- `npm run test` -- **actual:** 24 test files, 414 tests, all passed (404 prior + 10 new toggle tests, after review-triage patches added page-component and error-path coverage). This story's own new file (`tests/integration/responder-invitation-flag-toggle.test.ts`) is fully mocked and needs no live Supabase instance.
- `npm run lint` -- **actual:** 0 errors. 1 pre-existing warning in `scripts/seed-company-360.mjs` (`'idByEmail' is assigned a value but never used`), unrelated to this story and unchanged by it.
- `npx tsc --noEmit` -- **actual:** exit code 0, no output -- no type errors.
- Repo-wide grep for `USE_NEW_API_RESPONDER=true` -- **actual:** only prose mentions in planning/spec docs (this spec's own frozen text, Story 3.22's own verification notes) and `docs/feature-flags.md`'s manual-QA/rollback-procedure prose (describing what an operator sets locally, mirroring the prior 3 domains' identical existing prose); no committed `.env*`, config, or CI-equivalent file sets it to `true`. `.env.example`'s own new entry defaults to `false`.
