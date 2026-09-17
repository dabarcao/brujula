---
title: 'New-Path Verification Against the Characterization Baseline'
type: 'chore'
created: '2026-09-13'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: '1cae7df9f360824fbc03ea79e30cf049a7cd85a4'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Reframing (per Story 1.7's own resolution):** this story's literal AC text ("pointed at the new path with the flag on... safe to flip the flag in production") assumes a feature flag that Story 1.7 established doesn't exist for report groups — Story 1.6 fully replaced the old path, so there is nothing to flip between. The real, still-applicable intent survives the reframing: prove the new manager/API path is behaviorally equivalent to Story 1.1's recorded baseline, and that auth/access-boundary behavior is correctly specified, before considering report groups' migration complete.

**What already satisfies this intent (investigated, not assumed):** 56 tests currently pass across 5 files. Story 1.1's original suite (7 tests, unmodified) already runs against the refactored Server Actions (Story 1.6) and passes — proving Server-Action-layer equivalence. Story 1.2's manager-level suite (7 tests) re-runs the same 4 frozen fixtures directly against `reportGroupsManager`. Story 1.5's route-integration suite (26 tests) exercises, through the actual Route Handlers: create-eligible (201), create-ineligible (422, exact baseline message), close-at/above-threshold (200, AI-interpretation null-or-string per baseline), respond accept x5 + decline, plus 401/403 auth-boundary coverage on all 5 routes and an explicit in-process-vs-HTTP equivalence proof. Story 1.4's suite (12 tests) covers `signAppToken`/`requireApiToken`'s full contract in isolation.

**The one genuine gap found:** Story 1.1's 4th frozen fixture — close-below-threshold ("Hacen falta al menos 5 personas aceptadas para cerrar el grupo.") — has been proven at the Server Action layer (Story 1.1) and the manager layer (Story 1.2), but never through the Route Handler specifically (confirmed via `grep -n "Hacen falta" tests/integration/report-groups-route.test.ts` — no match).

**Approach:** add one test to `tests/integration/report-groups-route.test.ts`: create a fresh group (3 eligible members, via the route itself, consistent with how the rest of that file already creates groups) through `POST /api/report-groups`, accept via `respondRoute` for only 2 of the 3 (below the 5-minimum), call `closeRoute`, and assert the exact baseline message text — closing the one remaining fixture/path combination. No other code changes.

**Boundaries:**
- **Always:** the new test's expected message string matches Story 1.1's recorded baseline (`tests/characterization/report-groups.test.ts`) verbatim: `"Hacen falta al menos 5 personas aceptadas para cerrar el grupo."`.
- **Never:** do not modify any existing test file's existing tests, any route file, or `reportGroupsManager` — this story only adds one new test.

</frozen-after-approval>

## Implementation Notes

## Review Triage Log

- **No post-condition check that the group stays `"open"` (and membership unchanged) after the rejected close** — real; a Route Handler bug that silently mutated state on rejection would pass undetected. **Patched**: added a post-close `GET` assertion.
- **No in-process-vs-HTTP equivalence proof for this fixture, unlike the sibling `createGroup` ineligible-member case** — real, and directly tied to this story's own stated intent. **Patched**: added a matching test to the `"AC 3"` describe block.
- **`groupId` not validated against `GROUP_ID_RE` before reuse, unlike the file's other group-creation test** — real, trivial. **Patched**.
- **No assertion that respond calls actually produced 2-accepted/1-pending state before closing** — real; the test was trusting "2 respond calls returned 200" without checking the state the 422 assertion implicitly depends on. **Patched**: added a pre-close `GET` + membership-status assertion.
- **No spy proving `reportGroupsManager.closeGroup` was actually invoked and threw** — real; without it, the test can't distinguish a correctly-wired rejection from a coincidentally-matching 422 elsewhere. **Patched**: added `vi.spyOn` + `toHaveBeenCalledWith`.
- **No comment explaining why `eligibleTokens[0]` was chosen as the closer, given `close_report_group`'s separate accepted-closer precondition** — real; a future edit could swap in a non-accepted closer and silently test the wrong branch. **Patched**: added an explanatory comment.

Added one test to `tests/integration/report-groups-route.test.ts` proving Story 1.1's 4th frozen fixture (close-below-threshold) through the Route Handler: create a fresh group (3 eligible members) via the route, accept 2 of 3, confirm pre-close membership state, close via the route, assert the exact baseline error message, confirm the group stays `"open"` afterward.

**Verification:** `npm run test` — 58/58 passing (57 prior + 1 new). `npm run lint`/`npx tsc --noEmit` — unchanged from baseline (same 1 pre-existing warning/error).

**Review (Blind Hunter) found 6 findings, all patched** — the initial test only checked the response body; every established pattern already present elsewhere in the same file (post-condition state checks, in-process-vs-HTTP equivalence proofs, `GROUP_ID_RE` validation, membership-state assertions, manager-call spies, eligibility-branch comments) was missing from it. Strengthened in place:
- Added a pre-close `GET` confirming membership is truly 2 accepted / 1 pending before the close attempt, and a post-close `GET` confirming the group stayed `"open"` (the rejected close must not mutate state).
- Added `vi.spyOn(reportGroupsManager, "closeGroup")` + `toHaveBeenCalledWith(groupId)`, proving the route actually reached the manager and the manager threw — not a coincidentally-matching 422 from an earlier validation layer.
- Added `expect(groupId).toMatch(GROUP_ID_RE)`, matching the file's other group-creation tests.
- Added a comment explaining why `eligibleTokens[0]` (an accepted member) is used as the closer — deliberately isolating the threshold check from the separate closer-eligibility check.
- Added a genuine in-process-vs-HTTP equivalence test to the existing `"AC 3: in-process vs. over-HTTP equivalence"` describe block (mirroring its `createGroup`-ineligible-member test's shape exactly): two independent below-threshold groups, one closed via `reportGroupsManager.closeGroup` directly and one via the route, asserting byte-identical thrown/returned message text — this is the specific thing this story's intent is about, and the original test only compared the route's output to a hardcoded string, never to the manager's own in-process behavior.

**Epic 1 status after this story:** all 8 stories resolved (1.1-1.6, 1.8 implemented; 1.7 resolved as not-applicable per its own decision record). Report groups' migration to the `db → managers → API` layering is complete: Story 1.1's original characterization suite passes unmodified against the final refactored Server Actions (Story 1.6), the manager and Route Handler layers are independently proven equivalent to the same baseline (Stories 1.2, 1.5, this story), and auth/CSRF boundary behavior is covered at both the token-unit level (Story 1.4) and the route level (Story 1.5). 58 tests total.
