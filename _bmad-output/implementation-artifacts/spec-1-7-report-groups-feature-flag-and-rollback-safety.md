---
title: 'Report Groups Feature Flag and Rollback Safety'
type: 'chore'
created: '2026-09-13'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: 'c9017bf99c42accb8408284cb251f9a93d841eb9'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**This story is resolved by decision, not by code.** Its own acceptance criteria (epics.md lines 286-306) assume `src/app/actions/reportGroups.ts` still contains the old direct-Supabase code alongside a new path, gated by `USE_NEW_API_REPORTGROUPS` ("Given the flag is off, the old direct-Supabase path runs unchanged"). Story 1.6 — already implemented, reviewed, and pushed (commit `c9017bf`) — instead fully replaced the old code with a one-line delegate to `reportGroupsManager`, exactly as Story 1.6's own epics.md text asked ("each is a one-line delegate to the manager"). There is no old path left in this file to flag between.

**Root cause:** a genuine planning-artifact inconsistency between two adjacent stories, not an implementation mistake in either one — each story was built to match its own literal text, but the two stories' texts contradict each other about whether the old code survives the refactor. `epic-1-context.md`'s Technical Decisions independently describe the intended shape ("old and new code paths must coexist behind a flag... old-path deletion eligible only after the new path survives one full production cycle"), which Story 1.6's literal text never actually instructed building.

**Decision (human-approved):** Accept Story 1.6 as the final, complete migration for report groups. Do not reconstruct the deleted old path. Mark this story resolved-as-not-applicable rather than reopening already-reviewed, already-pushed work.

**Why this is acceptable here, not just expedient:** report groups is explicitly the smallest, most isolated POC domain (epic-1-context.md's own framing). Its actual safety net — proving old-vs-new behavioral equivalence — already happened: Story 1.1's characterization suite (7 tests, captured against the real pre-refactor code) ran unmodified against the refactored Server Actions in Story 1.6 and passed, which is the same evidence a feature flag's "flip and compare" rollout would have produced, just gathered before merge instead of after. A flag's actual purpose in this initiative — a same-repo rollback lever given no staging/CI exists — has no code left to roll back *to*; reverting would mean reverting the reviewed Story 1.6 commit itself, which git already provides for free without a runtime flag.

**Forward guidance for Epic 3 (binding on future story dispatches, not just a note):** every later domain group (admin/members, cycles, feedback, responder/invitation, read-only-reports) repeats the identical two-story shape (`X Server Actions Become Thin Delegates` immediately followed by `X Feature Flag and Rollback Safety`) — confirmed via `grep -n "### Story 3\."` across all five groups. To avoid repeating this exact clash five more times: when dispatching each domain's "Become Thin Delegates" story, the instruction must explicitly keep the old direct-Supabase code path alongside the new manager-delegate path, gated by that domain's `USE_NEW_API_<DOMAIN>` env flag (default off), from that story onward — not delete the old code. The subsequent "Feature Flag" story then becomes primarily a verification/toggle-proof step (confirming both paths actually work and the flag switches between them), rather than needing to un-delete anything.

</frozen-after-approval>

## Implementation Notes

No code changed by this story. Verified via `grep -n "### Story 3\." _bmad-output/planning-artifacts/epics.md` that the identical thin-delegate-then-flag story pair repeats for all five remaining Epic 3 domain groups (Stories 3.4/3.5, 3.10/3.11, 3.16/3.17, 3.22/3.23, 3.28/3.29), confirming this is a structural planning-artifact pattern, not a one-off. Story 1.8 ("New-Path Verification Against the Characterization Baseline") references "Story 1.7's rollout" as its gating condition — since there is no flag rollout to gate, Story 1.8 will be scoped, when reached, to what it can still meaningfully verify: Story 1.1's baseline already re-run (done, via Story 1.6) plus any new auth-boundary tests not yet covered by Story 1.5's own test suite.
