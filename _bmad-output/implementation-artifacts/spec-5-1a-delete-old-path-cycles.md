---
title: 'Delete Old Direct-Supabase Path — Cycles Domain'
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

**Problem:** `src/app/actions/cycles.ts` has 6 Server Actions, each with an `if (USE_NEW_API_CYCLES === "true") {new path; return;} ...old path` branch. The user explicitly waived AD-10's rollback-safety time gate on 2026-09-16 and asked to delete every old path now.

**Approach:** For each of the 6 actions, delete the old-path branch (the code after the `if` block's `return`), un-indent the new-path body so it's the only body, and remove the `process.env.USE_NEW_API_CYCLES` check and the flag itself (grep the whole repo for the env var name afterward — `.env.local`/`.env.test.local` entries too, if present). Do not touch `src/server/managers/cyclesManager.ts` or `src/server/db/cycles.ts` — they are already the single implementation.

## Boundaries & Constraints

**Always:** Preserve the unconditional shared tail in `finalizeCycleRequest` (the `generateAiInterpretation` + `save_ai_interpretation` RPC call after either branch, currently duplicated in both) — keep exactly one copy, the one that was in the new-path branch. Keep `get_cycle_status`, `get_request_competency_comparison`, `get_colleagues_with_closed_cycle` RPC calls in `tests/characterization/cycles.test.ts` — they are not flag-gated, not old-path-specific, still valid.

**Never:** Do not touch `src/app/actions/feedback.ts`, `src/app/dashboard/page.tsx`, or any other domain's flag (`USE_NEW_API_ADMIN_MEMBERS`, `USE_NEW_API_FEEDBACK`, `USE_NEW_API_RESPONDER`, `USE_NEW_API_REPORTS`) — those are separate specs, running in parallel with this one; touching them risks a merge conflict with that work. Do not modify `src/server/managers/**` or `src/server/db/**`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Any of the 6 cycles Server Actions called | normal form data | behaves exactly as today's flag-ON path did (manager call) | N/A |
| `finalizeCycleRequest` | closing a request | AI interpretation still generated and saved exactly once | N/A |
| `tests/characterization/cycles.test.ts`'s read-only RPC assertions | unchanged | still pass, untouched | N/A |

</frozen-after-approval>

## Code Map

- `src/app/actions/cycles.ts` — 6 actions to collapse: `createFeedbackCycle` L34-63, `finalizeCycleRequest` L75-117 (watch the duplicated AI-interpretation tail), `organizeCycleEvaluators` L125-149, `createIndividualCycleRequest` L166-193, `updateCycleRequestEvaluators` L208-233, `updateIndividualCycleRequestEvaluators` L250-275.
- `tests/characterization/cycles.test.ts` — old-path baseline (flag never set); becomes dead for the 6 mutating actions once the old branch is gone — retire those specific assertions (or the whole file if nothing else of value remains after removing them), but KEEP the read-only RPC tests (`get_cycle_status`, `get_request_competency_comparison`, `get_colleagues_with_closed_cycle`) since those aren't flag-gated.
- `tests/characterization/cycles-manager.test.ts` — pure new-path/manager-level, keep as-is, no changes needed.
- `tests/integration/cycles-flag-toggle.test.ts` — tests the flag-routing mechanism itself; delete this file entirely once the flag is gone.
- `tests/integration/cycles-new-path-verification.test.ts` — Section 1 (L393-772) is new-path business-logic verification against real Supabase; convert to run unconditionally (remove the flag-forcing setup at L297-298). Section 2 (L823-846) is a static cross-domain check shared conceptually with `feedback-new-path-verification.test.ts`'s own Section 2 — leave this file's Section 2 as-is (it only asserts `db/cycles.ts` doesn't call ad-hoc RPCs, which remains true and useful regardless of flag deletion). Section 3 (in-process vs HTTP route comparison) — keep, still meaningful.
- `tests/integration/cycles-route.test.ts` — pure API-layer/new-path, keep as-is.
- `eslint.config.mjs` — do NOT edit in this spec (Story 5.2's job); leave the cycles-domain exemption entries in place even though they'll become unnecessary, since Story 5.2 verifies zero-violations holistically after all domains are done.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/actions/cycles.ts` -- collapse all 6 flag branches to new-path-only, remove the flag env-var reads -- the actual deletion
- [x] `tests/integration/cycles-flag-toggle.test.ts` -- delete entirely -- tests a mechanism that no longer exists
- [x] `tests/characterization/cycles.test.ts` -- retire the 6 mutating-action old-path assertions, keep the 3 read-only RPC test groups -- old-path-specific content becomes meaningless
- [x] `tests/integration/cycles-new-path-verification.test.ts` -- remove flag-forcing setup in Section 1, run its assertions unconditionally -- no longer a "new path" to force, it's just the path

**Acceptance Criteria:**
- Given any of the 6 cycles Server Actions, when called, then it behaves exactly as the pre-deletion flag-ON path did (verified by the retained/converted test suites passing)
- Given `USE_NEW_API_CYCLES`, when the repo is searched after this story, then zero references remain anywhere under `src/` or `tests/`
- Given the full test suite, when run after this story, then it passes with no cycles-domain regressions

## Implementation Notes

All 6 Server Actions in `src/app/actions/cycles.ts` collapsed to new-path-only, un-indented, flag reads removed. `finalizeCycleRequest` kept exactly one copy of the previously-duplicated `generateAiInterpretation`/`save_ai_interpretation` tail (the former new-path branch's copy). `.env.example`'s `USE_NEW_API_CYCLES` block replaced with a "removed by this story" note (later used as the template for cleaning up the other 4 domains' blocks too, during this story's combined review pass).

`tests/integration/cycles-flag-toggle.test.ts` deleted entirely. `tests/characterization/cycles.test.ts` had its 6 mutating-action describe blocks (and everything that only existed to support them) retired, keeping the 3 read-only RPC groups (`get_cycle_status`, `get_request_competency_comparison`, `get_colleagues_with_closed_cycle`) verbatim. `tests/integration/cycles-new-path-verification.test.ts` had its flag-forcing `beforeAll`/`afterAll` removed so Sections 1-3 run unconditionally.

Confirmed via direct diff review (orchestrator, not just implementer self-report): all 6 collapsed actions are byte-preserving un-indents of the prior new-path branch, no logic drift. `grep -rn "USE_NEW_API_CYCLES" src/ tests/` returns zero matches.

## Review Triage Log

This spec's diff was reviewed together with sibling specs 5-1b and 5-1c as one combined pass (all 3 landed in the same working tree; see spec-5-1b's Review Triage Log for the full 3-lens findings list and triage — cycles-specific items from that pass: the `.env.example` cleanup this spec started was completed for the other 4 domains' blocks as part of that combined patch round; no cycles-specific code defect was found by any of the 3 lenses).

## Verification

**Commands:**
- `npx tsc --noEmit` -- clean
- `npm run lint` -- clean (existing unrelated `seed-company-360.mjs` warning only)
- `npm test` (scoped to this domain's 4 test files) -- 80/80 passing
- `npm test` (full suite, post-combined-review) -- 457/457 passing (one pre-existing, unrelated intermittent org-count race in `admin-organizations-pagination.test.ts` when run alongside the full suite -- logged in `deferred-work.md`, not caused by this story, passes 100% in isolation)

**Manual checks (if no CLI):**
- Live Playwright pass (orchestrator, after the combined review/patch round): loaded `/dashboard/cycles` as the seeded Supervisor of a freshly-seeded 8-employee demo company (which itself creates a cycle, organizes evaluators, and closes some requests via direct RPC calls during seeding -- confirming those RPCs work end-to-end, independent of this story's Server Action changes) -- page loaded without error. Did not separately click through create/organize/close via the UI form flows themselves; covered by `cycles-new-path-verification.test.ts`/`cycles-route.test.ts`'s real-Supabase assertions on those same Server Actions.
