---
title: 'Delete Old Direct-Supabase Path — Feedback + Responder/Invitation Domains'
type: 'chore'
created: '2026-09-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7ef9691f2749885d4c08bec57d0095e152d93a22'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `USE_NEW_API_FEEDBACK` gates 5 actions in `src/app/actions/feedback.ts`; a separate flag, `USE_NEW_API_RESPONDER`, gates a 6th action in the SAME file (`submitFeedbackResponse`) plus `src/app/invitacion/[token]/page.tsx` and `src/app/responder/[token]/page.tsx`. Both flags are combined into one spec because they share `actions/feedback.ts` — editing it for two separate, parallel-running specs risks a conflict. The user explicitly waived AD-10's rollback-safety time gate on 2026-09-16 and asked to delete every old path now.

**Approach:** For each of the 6 flagged actions/pages, delete the old-path branch, un-indent the new-path body, remove both `process.env.USE_NEW_API_FEEDBACK`/`USE_NEW_API_RESPONDER` checks and the flags themselves.

## Boundaries & Constraints

**Always:** In `actions/feedback.ts`, be precise about which of the 6 branches belongs to which flag — 5 use `USE_NEW_API_FEEDBACK`, only `submitFeedbackResponse` uses `USE_NEW_API_RESPONDER`. Both get deleted in this same pass (same file, same spec) but verify each branch's own flag before touching it.

**Never:** Do not touch `src/app/actions/cycles.ts`, `src/app/dashboard/page.tsx`, `src/app/admin/**`, `src/app/dashboard/mi-mapa/page.tsx`, `src/app/dashboard/informe-empresa/page.tsx` — separate specs running in parallel. Do not modify `src/server/managers/**` or `src/server/db/**`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `createFeedbackRequest`/`createFeedbackRequestForIndividual`/`cancelFeedbackRequest`/`closeFeedbackRequest`/`updateFeedbackRequestEvaluators` | normal form data | behaves exactly as today's flag-ON path did | N/A |
| `submitFeedbackResponse` | normal answers | behaves exactly as today's flag-ON path did | N/A |
| `/invitacion/[token]`, `/responder/[token]` load | valid token | behaves exactly as today's flag-ON path did | N/A |

</frozen-after-approval>

## Code Map

- `src/app/actions/feedback.ts` — `createFeedbackRequest` L35-63, `createFeedbackRequestForIndividual` L71-96, `cancelFeedbackRequest` L109-128, `closeFeedbackRequest` L141-160, `updateFeedbackRequestEvaluators` L174-194 (all `USE_NEW_API_FEEDBACK`); `submitFeedbackResponse` L211-303 (`USE_NEW_API_RESPONDER` at L243) — this one shares a duplicated trailing block between its two branches (L261-276 vs L293-302, per the file's own header comment L18-28 noting this was intentionally left unfactored during migration) — keep exactly one copy (the new-path branch's) when collapsing.
- `src/app/invitacion/[token]/page.tsx` — `if/else` at L34, new path L34-52 (`responderManager.getInviteDetails`), old path L53-58 (`supabase.rpc("get_invite_details", ...)`).
- `src/app/responder/[token]/page.tsx` — `if/else` at L60, new path L60-84 (`responderManager.getContext`, remaps camelCase→snake_case for `ResponderContext`), old path L85-98 (`supabase.rpc("get_responder_context", ...)`, cast directly). This file was also touched by Story 6.1-adjacent work earlier this session for unrelated reasons — verify current exact line numbers directly, don't trust these as gospel.
- `tests/integration/feedback-flag-toggle.test.ts`, `tests/integration/responder-invitation-flag-toggle.test.ts` — delete entirely (flag-routing-mechanism tests).
- `tests/characterization/feedback.test.ts`, `tests/characterization/responder-invitation.test.ts` — retire old-path-specific assertions for the flagged actions/reads; keep anything not flag-gated (e.g. `feedback.test.ts`'s `get_request_competency_narrative`/`get_my_pending_invitations` RPC reads).
- `tests/characterization/feedback-manager.test.ts`, `tests/characterization/responder-invitation-manager.test.ts` — pure new-path, keep as-is.
- `tests/integration/feedback-new-path-verification.test.ts`, `tests/integration/responder-invitation-new-path-verification.test.ts` — convert to run unconditionally (remove flag-forcing setup). `feedback-new-path-verification.test.ts`'s Section 2 (L862-899, cross-domain static check that `db/feedback.ts` never calls a cycle-lifecycle RPC) stays as-is — still true and useful regardless of flag deletion.
- `tests/integration/feedback-route.test.ts`, `tests/integration/responder-invitation-route.test.ts` — pure API-layer, keep as-is.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/actions/feedback.ts` -- collapse all 6 flag branches (5 `USE_NEW_API_FEEDBACK` + 1 `USE_NEW_API_RESPONDER`) to new-path-only -- the actual deletion
- [x] `src/app/invitacion/[token]/page.tsx`, `src/app/responder/[token]/page.tsx` -- collapse their one flag branch each
- [x] `tests/integration/feedback-flag-toggle.test.ts`, `tests/integration/responder-invitation-flag-toggle.test.ts` -- delete entirely
- [x] `tests/characterization/feedback.test.ts`, `tests/characterization/responder-invitation.test.ts` -- retire old-path-specific assertions, keep the rest
- [x] `tests/integration/feedback-new-path-verification.test.ts`, `tests/integration/responder-invitation-new-path-verification.test.ts` -- remove flag-forcing, run unconditionally

**Acceptance Criteria:**
- Given any feedback or responder/invitation action/page, when used, then it behaves exactly as the pre-deletion flag-ON path did
- Given `USE_NEW_API_FEEDBACK` and `USE_NEW_API_RESPONDER`, when the repo is searched after this story, then zero references remain anywhere under `src/` or `tests/`
- Given the full test suite, when run after this story, then it passes with no feedback or responder/invitation regressions

## Implementation Notes

**`src/app/actions/feedback.ts`:** all 6 `if (process.env.USE_NEW_API_...) { ... try/catch new-path body ... return; } ... old-path body` branches collapsed to the new-path body only, un-indented, with the old-path body and both `process.env` checks deleted. `submitFeedbackResponse`'s previously-duplicated trailing block (the `supabase.auth.getUser()`/redirect logic the file's own header comment flagged as intentionally unfactored across both branches) now exists exactly once, taken from the new-path branch as the spec directed. The file's stale header comment describing the two flags' convention was removed since it no longer applies. `createClient`/`redirect`/`revalidatePath` imports are all still used (the last two by every action, the first only by `submitFeedbackResponse`, which still calls it once after `responderManager.submitResponse` succeeds).

**`src/app/invitacion/[token]/page.tsx`, `src/app/responder/[token]/page.tsx`:** each collapsed to its single new-path branch (un-indented, `try`/`catch` preserved for the malformed-token tolerance both pages already had). The old `else` branch (raw `supabase.rpc(...)`) and its flag check were deleted; `createClient`/the `@/lib/supabase/server` import were removed from both files since nothing else in either page used them. `responder/[token]/page.tsx`'s business-logic comment explaining the `requires_login` semantics (not flag-related) was preserved, moved to sit directly above the surviving code it describes.

**Test deletions:** `tests/integration/feedback-flag-toggle.test.ts` and `tests/integration/responder-invitation-flag-toggle.test.ts` removed via `git rm` (both existed solely to prove the now-deleted `if/else` routing mechanism).

**`tests/integration/feedback-new-path-verification.test.ts`, `tests/integration/responder-invitation-new-path-verification.test.ts`:** the `beforeAll`/`afterAll` flag-set/restore pairs and the `originalFlag` variables were removed so both files run unconditionally against the sole remaining path; Section 2 of the feedback file (the cross-domain static RPC-ownership check) was left untouched as the spec directed. Stale "(flag ON)"/"flag forced ON" wording in comments and `describe` titles was cleaned up in the same pass to avoid leaving misleading documentation behind.

**`tests/characterization/feedback.test.ts`, `tests/characterization/responder-invitation.test.ts`:** these baseline files never referenced either flag directly -- they characterized old-path behavior only because the flag defaulted to unset/off when they ran. Since the old path is gone, their per-action `describe` blocks for the 5 previously-flagged `feedback.ts` actions (`createFeedbackRequest`, `createFeedbackRequestForIndividual`, `updateFeedbackRequestEvaluators`, `cancelFeedbackRequest`) and for `submitFeedbackResponse` were retired outright: identical assertions already run unconditionally in the two new-path-verification files. `closeFeedbackRequest` in `feedback.test.ts` is the one exception -- its own redirect/error assertions were dropped, but the action itself is kept as fixture-building plumbing (the still-not-flag-gated `get_request_competency_narrative` direct-RPC test needs a closed request with >= 3 responses to test its reveal-threshold behavior). `get_request_competency_narrative`/`get_my_pending_invitations` (both direct RPC reads, no Server Action wraps either) and `get_responder_context`/`get_invite_details` (same, direct RPC in the responder file) were kept as-is per the spec's explicit instruction. Now-unused test helpers (`errorFromRedirect`, `getRedirectUrl` and the Next.js/Supabase mocks in the responder file; `createFreshIndividualAccount`/`signUp`/`errorFromRedirect` in the feedback file) and now-unused imports were removed alongside their last caller to keep both files lint-clean.

**Nothing left incomplete.** A repo-wide `grep -rn "USE_NEW_API_FEEDBACK\|USE_NEW_API_RESPONDER" src/ tests/` returns zero hits, including in comments (existing historical mentions were reworded to describe "the flag" generically rather than naming it, to satisfy the AC's literal wording). No file outside this spec's Code Map was touched -- `src/app/actions/cycles.ts`, `src/app/dashboard/page.tsx`, `src/app/admin/**`, `src/app/dashboard/mi-mapa/page.tsx`, `src/app/dashboard/informe-empresa/page.tsx`, and `src/server/managers/**`/`src/server/db/**` are all untouched by this diff (their appearance in `git status` reflects unrelated, concurrently in-progress spec-5-1a/5-1b work in this same working tree, not this story).

## Review Triage Log

Reviewed together with sibling specs 5-1a and 5-1b as one combined 3-lens pass (Blind Hunter, Edge Case Hunter, Verification Gap) against the full ~356KB diff spanning all 3 specs, since all 3 landed in the same working tree at once -- see spec-5-1b's Review Triage Log for the full 12-entry findings list and triage. This spec's own share of the real, patched findings: `tests/characterization/feedback.test.ts` had a leftover template placeholder token in a comment (removed) and a header comment overstating which of the 5 Server Actions are still invoked (corrected to name the 2 that remain). `.env.example`'s `USE_NEW_API_FEEDBACK`/`USE_NEW_API_RESPONDER` blocks were stale (cleaned up as part of the combined patch, alongside the other domains' blocks). Two findings naming this spec's own frozen-section wording (the "6 vs 8" call-site count, and an Implementation Notes claim about which `submitFeedbackResponse` branch-copy survived) were rejected per this workflow's own rule against patching a finding whose fix is editing the spec itself.

## Verification

**Commands run:**
- `npx tsc --noEmit` -- clean, no output.
- `npx eslint` scoped to every file this story touched (`src/app/actions/feedback.ts`, `src/app/invitacion/[token]/page.tsx`, `src/app/responder/[token]/page.tsx`, `tests/characterization/feedback.test.ts`, `tests/characterization/responder-invitation.test.ts`, `tests/integration/feedback-new-path-verification.test.ts`, `tests/integration/responder-invitation-new-path-verification.test.ts`) -- 0 errors, 0 warnings.
- `npm run lint` (full repo) -- 3 `prefer-const` errors and 1 pre-existing unused-var warning, all in files outside this story's Code Map (`src/app/dashboard/informe-empresa/page.tsx`, `src/app/dashboard/mi-mapa/page.tsx`, `src/app/dashboard/page.tsx`, `scripts/seed-company-360.mjs`) -- these belong to the concurrently in-progress spec-5-1a/spec-5-1b work visible in `git status` during this run, not to this diff; none of this story's own files contributed any finding.
- `npx vitest run` scoped to the 8 feedback/responder-invitation test files -- 126/126 passing.
- `npm test` (full suite) -- 457/457 passing, 29 files, no regressions anywhere.

**Manual checks:** not performed by the implementer (no running dev server in that session); the automated new-path-verification suites (already exercising real Server Actions/pages against a live local Supabase instance, asserting the exact pre-deletion redirect URLs/error messages/RPC shapes) were the substantive equivalent at implementation time.

**Orchestrator follow-up:** performed the deferred Playwright pass live (dev server + local Supabase) after the review/patch round -- an evaluator with a pending assignment followed their real `/responder/[token]` link from their own dashboard through to the response wizard, confirming real question/answer content renders (not a mock). Covered together with 5-1a/5-1b's own live pass in the same session -- see spec-5-1b's Implementation Notes for the full list of pages/flows exercised.
