---
title: 'Delete Old Direct-Supabase Path — Admin/Members + Read-Only Reports Domains'
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

**Problem:** `USE_NEW_API_ADMIN_MEMBERS` gates 4 files (3 Server Actions + part of `dashboard/page.tsx`) and `USE_NEW_API_REPORTS` gates 3 files (the rest of `dashboard/page.tsx` + `mi-mapa`/`informe-empresa`). Both flags are combined into one spec because they share `dashboard/page.tsx` — editing it for two separate, parallel-running specs risks a conflict. The user explicitly waived AD-10's rollback-safety time gate on 2026-09-16 and asked to delete every old path now.

**Approach:** For each flagged branch across both domains, delete the old-path branch, un-indent the new-path body, remove both `process.env.USE_NEW_API_ADMIN_MEMBERS`/`USE_NEW_API_REPORTS` checks and the flags themselves.

**Investigated (not guessed): 3 admin-domain files are NOT flag-gated and are explicitly OUT of scope.** `src/app/admin/page.tsx`, `src/app/admin/empresas/[id]/page.tsx`, and `src/app/dashboard/members/page.tsx` call Supabase directly with no flag and no manager equivalent ever built — there is no "old path" to delete there, only a migration that was never finished. Deleting their ESLint exemption would require building new manager delegation from scratch, which is out of scope for a legacy-path *deletion* story — log this as deferred work instead.

## Boundaries & Constraints

**Always:** In `dashboard/page.tsx`, collapse all 7 flag branches (3 for `USE_NEW_API_ADMIN_MEMBERS` at `isPlatformAdmin`/pending-invite-accept/claim-pending-invitations; 4 for `USE_NEW_API_REPORTS` at myRequests/openCycles/myCycleRequests/pendingGroups) to new-path-only in the same pass, since both flags live in the same file.

**Never:** Do not touch `src/app/admin/page.tsx`, `src/app/admin/empresas/[id]/page.tsx`, `src/app/dashboard/members/page.tsx` (see Intent — no flag exists there, nothing to delete; log as deferred work instead, do not attempt to migrate them). Do not touch `src/app/actions/cycles.ts`, `src/app/actions/feedback.ts`, `src/app/invitacion/[token]/page.tsx`, `src/app/responder/[token]/page.tsx` — separate specs running in parallel. Do not modify `src/server/managers/**` or `src/server/db/**`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `signIn`/`signOut`/`inviteMember`/`createDepartment`/`createOrganizationAsAdmin`/`updateOrganizationName` | normal form data | behaves exactly as today's flag-ON path did | N/A |
| `dashboard/page.tsx` load (any account type) | normal session | all 7 previously-flagged reads behave exactly as flag-ON did | N/A |
| `mi-mapa`/`informe-empresa` load | normal session | behaves exactly as flag-ON did | N/A |
| `admin/page.tsx`, `admin/empresas/[id]/page.tsx`, `dashboard/members/page.tsx` | any | completely unchanged — not touched by this story | N/A |

</frozen-after-approval>

## Code Map

- `src/app/actions/admin.ts` — `createOrganizationAsAdmin` L20-63, `updateOrganizationName` L65-97 (line numbers approximate, verify directly).
- `src/app/actions/auth.ts` — `signIn` L96-~140, `signOut` L145-168 (already touched by the recent redirect-to-/login fix; preserve that fix, only remove the flag branch).
- `src/app/actions/members.ts` — `inviteMember` L28-~70, `createDepartment` L77-~110.
- `src/app/dashboard/page.tsx` — 7 branches total: `isPlatformAdmin` ~L63-90, pending-invite-accept ~L102-130, `claimPendingInvitations` ~L185-210 (all `USE_NEW_API_ADMIN_MEMBERS`); myRequests ~L237-281, openCycles ~L290-321, myCycleRequests ~L325-333, pendingGroups ~L349-365 (all `USE_NEW_API_REPORTS`). Verify exact current line numbers directly — this file has likely shifted since the investigation that produced these estimates.
- `src/app/dashboard/mi-mapa/page.tsx` — `mapData` fetch ~L50-80 flag-gated; `frameworkData` stays unconditional in both today, untouched.
- `src/app/dashboard/informe-empresa/page.tsx` — `summaryData` fetch ~L87-115 flag-gated; `frameworkData`/`activeMemberCount` stay unconditional, untouched.
- `tests/integration/admin-members-auth-flag-toggle.test.ts`, `tests/integration/read-only-reports-flag-toggle.test.ts` — delete entirely (flag-routing-mechanism tests).
- `tests/characterization/admin-members-auth.test.ts`, `tests/characterization/read-only-reports.test.ts` — retire old-path-specific assertions for the flagged actions/reads; keep anything not flag-gated.
- `tests/characterization/admin-members-auth-manager.test.ts`, `tests/characterization/read-only-reports-manager.test.ts` — pure new-path, keep as-is.
- `tests/integration/admin-members-auth-new-path-verification.test.ts`, `tests/integration/read-only-reports-new-path-verification.test.ts` — convert to run unconditionally (remove flag-forcing setup).
- `tests/integration/read-only-reports-thin-delegate.test.ts` — currently renders both branches via `renderToStaticMarkup` for equivalence; becomes meaningless once only one branch exists — rewrite to assert the (now sole) output directly, or delete if fully redundant with `read-only-reports-new-path-verification.test.ts`.
- `tests/integration/admin-members-auth-route.test.ts`, `tests/integration/read-only-reports-route.test.ts` — pure API-layer, keep as-is.
- `_bmad-output/implementation-artifacts/deferred-work.md` — log the 3 out-of-scope non-flagged admin files here.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/actions/admin.ts`, `src/app/actions/auth.ts`, `src/app/actions/members.ts` -- collapse all 6 flag branches to new-path-only -- the actual deletion
- [x] `src/app/dashboard/page.tsx` -- collapse all 7 branches (both flags) to new-path-only -- the actual deletion
- [x] `src/app/dashboard/mi-mapa/page.tsx`, `src/app/dashboard/informe-empresa/page.tsx` -- collapse their one flag branch each
- [x] `tests/integration/admin-members-auth-flag-toggle.test.ts`, `tests/integration/read-only-reports-flag-toggle.test.ts` -- delete entirely
- [x] `tests/characterization/admin-members-auth.test.ts`, `tests/characterization/read-only-reports.test.ts` -- retire old-path-specific assertions, keep the rest
- [x] `tests/integration/admin-members-auth-new-path-verification.test.ts`, `tests/integration/read-only-reports-new-path-verification.test.ts` -- remove flag-forcing, run unconditionally
- [x] `tests/integration/read-only-reports-thin-delegate.test.ts` -- rewrite or delete (see Code Map)
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- log `admin/page.tsx`/`admin/empresas/[id]/page.tsx`/`dashboard/members/page.tsx` as never having a completed new path (pre-existing gap, out of scope)

**Acceptance Criteria:**
- Given any admin/members or read-only-reports action/page, when used, then it behaves exactly as the pre-deletion flag-ON path did
- Given `USE_NEW_API_ADMIN_MEMBERS` and `USE_NEW_API_REPORTS`, when the repo is searched after this story, then zero references remain anywhere under `src/` or `tests/`
- Given `admin/page.tsx`, `admin/empresas/[id]/page.tsx`, `dashboard/members/page.tsx`, when this story ships, then they are byte-for-byte unchanged and their gap is logged in deferred-work.md
- Given the full test suite, when run after this story, then it passes with no admin/members or read-only-reports regressions

## Implementation Notes

- `src/app/actions/admin.ts`/`auth.ts`/`members.ts`: collapsed all 6
  `USE_NEW_API_ADMIN_MEMBERS` branches to their new-path body; removed the
  now-unused `createClient`/`signAppToken` imports each file no longer
  needs (`auth.ts` still imports `createClient` for
  `acceptInviteSignUp`/`individualSignUp`, untouched).
- `src/app/dashboard/page.tsx`: collapsed all 7 branches (3
  `USE_NEW_API_ADMIN_MEMBERS`, 4 `USE_NEW_API_REPORTS`). Renamed
  `newPathCycleRequests` -> `myPathCycleRequests` (the "new path" framing
  is stale once there's only one path); `myCycleRequests`/`myRequests`
  became non-nullable `const`s now that there's no longer an `{ data } =`
  destructure from a Supabase call for them.
- `src/app/dashboard/mi-mapa/page.tsx`, `informe-empresa/page.tsx`:
  collapsed their one `USE_NEW_API_REPORTS` branch each; `frameworkData`
  became a `const` (still unconditional/duplicated per the original
  design, untouched).
- Deleted `tests/integration/admin-members-auth-flag-toggle.test.ts` and
  `read-only-reports-flag-toggle.test.ts` entirely (pure flag-routing-mechanism
  tests, meaningless with no flag left to route on).
- `tests/characterization/admin-members-auth.test.ts` and
  `read-only-reports.test.ts`: investigated, no changes needed -- both
  files exercise the real Server Actions/RPCs directly without ever
  setting the flag env vars, and assert only on behavior (redirect URLs,
  error messages, DB state), never on which code path fired. There were no
  old-path-specific assertions to retire.
- `tests/integration/admin-members-auth-new-path-verification.test.ts`:
  removed the `originalFlag`/set-to-`"true"`/restore machinery from
  `beforeAll`/`afterAll`; the file's Server Action calls now exercise the
  (sole) manager-backed path unconditionally.
- `tests/integration/read-only-reports-new-path-verification.test.ts`:
  replaced the `renderOldAndNew` (flag-off vs flag-on) helper with a
  single-render `renderPage` helper; every scenario now renders once and
  asserts directly on that output instead of an old-vs-new equality check.
- `tests/integration/read-only-reports-thin-delegate.test.ts`: rewritten
  (not deleted) -- it carries real, non-redundant regression coverage
  (per-read error-fallback behavior, interleaved sort-order, date-filter
  boundaries, AggregateBadge singular/plural, PermissionDenied branch) not
  covered by the real-Supabase new-path-verification file. Dropped the
  dead old-path fixture plumbing (`*Old` state, the fake client's
  `feedback_requests`/`feedback_cycle_participants`/report-groups/
  competency-map/org-summary resolvers) since the pages no longer read
  those directly. Dropped the "both flags on simultaneously" test -- its
  entire premise (two flags interacting) no longer exists.
- `_bmad-output/implementation-artifacts/deferred-work.md`: logged the 3
  never-flagged admin files (`admin/page.tsx`, `admin/empresas/[id]/page.tsx`,
  `dashboard/members/page.tsx`) as a pre-existing gap, confirmed
  byte-for-byte untouched.
- Did NOT touch `.env.example`/`docs/feature-flags.md` -- the spec's
  Acceptance Criteria scopes the "zero references" check to `src/`/`tests/`
  only, and neither file is in the Code Map; leaving them was a deliberate
  choice to avoid overreach, not an oversight. Flagging this in case a
  follow-up wants those docs cleaned too.

## Review Triage Log

Reviewed together with sibling specs 5-1a and 5-1c as one combined 3-lens pass (Blind Hunter, Edge Case Hunter, Verification Gap) against the full ~356KB diff spanning all 3 specs, since all 3 landed in the same working tree at once. 15 raw findings across the 3 lenses, deduplicated/verified to 12 distinct entries:

- **[patch, converged 2 lenses]** `.env.example` had only the `USE_NEW_API_CYCLES` block cleaned up (Story 5.1a's own work); the other 4 domains' blocks (`ADMIN_MEMBERS`/`REPORTS`/`FEEDBACK`/`RESPONDER`) still described a live, settable flag with a "see docs/feature-flags.md for the manual QA checklist" instruction, even though this diff deletes every check for all 4. Verified directly (read the file). Fixed: all 4 remaining blocks rewritten to the same "was the flag ... removed by Story X" pattern already used for `USE_NEW_API_CYCLES`.
- **[patch, converged 2 lenses]** `tests/characterization/feedback.test.ts` had a literal, un-replaced template placeholder token (`PLACEHOLDER_NOT_USED`) left in a comment. Verified directly (grepped for it, found it verbatim). Fixed: removed, sentence tidied.
- **[patch]** Same file's own header comment claimed "the 5 Server Actions above are still invoked here, but only as fixture-building plumbing" -- verified directly (checked the actual `import` line) that only 2 of 5 (`createFeedbackRequest`, `closeFeedbackRequest`) are still imported/used; the other 3 were removed outright, as a *later* comment in the same file correctly states. Fixed: corrected the header comment to name the 2 that remain and point to the later note explaining the other 3's removal.
- **[patch]** `src/app/dashboard/page.tsx`'s rename `newPathCycleRequests` → `myPathCycleRequests` (made during implementation to drop "stale 'new path' framing") didn't actually achieve that -- "myPath" still reads as leftover path-tracking language. Fixed: renamed again to `cycleRequestRows`, which names what the variable actually holds with no path framing at all.
- **[patch]** `sprint-status.yaml`'s comment explaining the 3-way split of Story 5.1 was internally confusing -- read as though the 3 *resulting* specs still share files with each other, when the two shared files (`actions/feedback.ts`, `dashboard/page.tsx`) are each owned entirely by exactly one of the 3 final specs; the files were the *reason two flags had to be combined into one spec each*, not something shared across all 3. Fixed: reworded.
- **[patch]** `deferred-work.md`'s new entry (the 3 admin pages with no manager equivalent ever built) wasn't mirrored into `sprint-status.yaml` as a trackable backlog row, unlike every other deferred item this session has logged. Fixed: added `6-2-complete-manager-delegation-for-remaining-admin-pages: backlog` under Epic 6.
- **[defer]** `docs/feature-flags.md` and `ARCHITECTURE-SPINE.md` AD-10 (the architectural decision record defining the very flag convention this diff retires) are never updated to reflect that all 5 flags are gone. Real, but spans multiple planning artifacts and is better done once Story 5.2/5.3 also land, against the final state rather than incrementally. Logged in `deferred-work.md`.
- **[defer]** `mi-mapa`/`informe-empresa` fetch their two independent reads sequentially, not via `Promise.all` (Edge Case Hunter, converged with itself across both files). Verified via git diff against the pre-deletion code: the *old*, now-deleted path used `Promise.all`; the *new* path (which this story correctly kept, byte-for-byte, per its own Boundaries) was already sequential since Story 3.28 built it that way -- not introduced by this story. Performance-only, not correctness. Logged in `deferred-work.md`.
- **[false, resolved by normal finalization]** `sprint-status.yaml` marked all 3 sub-stories `ready-for-dev` despite being fully implemented (Blind Hunter). Not a defect to patch -- this is simply the expected state mid-review, before step-05 finalization; resolved as part of that normal step, not a special fix.
- **[false, resolved by normal finalization]** spec-5-1a's own Tasks/Implementation Notes/Verification sections were empty/unchecked despite the matching code changes being present in the diff (Blind Hunter). Same as above -- filled in as part of normal finalization, not a review-triage fix.
- **[rejected -- fix would edit this build's spec]** spec-5-1c's "Approach" line says "6" flagged call sites but its own "Problem" statement describes 8 (5 `USE_NEW_API_FEEDBACK` actions + `submitFeedbackResponse` + 2 page components under `USE_NEW_API_RESPONDER`) (Blind Hunter). Real wording inconsistency, but per this workflow's own triage rule, a finding whose fix is editing the spec itself is rejected outright, not routed to patch.
- **[rejected -- fix would edit this build's spec]** spec-5-1c's Implementation Notes claim about which copy of `submitFeedbackResponse`'s trailing block survived names the wrong one by the diff's own line markers (Edge Case Hunter, high confidence on the claims-check, but the two copies were textually identical apart from one dead trailing `return;` after a `redirect()` call that throws internally anyway -- zero functional impact). Same rejection rule as above.

**Post-patch verification:** `npx tsc --noEmit` clean, `npm run lint` clean (1 pre-existing unrelated warning), `npm test` full suite 457/457 passing (re-run twice; the one intermittent failure seen on one run is the separately-logged, pre-existing `admin-organizations-pagination.test.ts` shared-DB race, unrelated to this diff -- confirmed passes 100% in isolation). `grep -rn "USE_NEW_API_" src/ tests/` still zero matches after all patches.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: clean
- `npm run lint` -- expected: clean (existing unrelated warning only)
- `npm test` -- expected: all passing

**Manual checks (if no CLI):**
- Real Playwright pass: sign in/out, view dashboard home (as both a member with pending items and one without), view mi-mapa and informe-empresa, invite a member, create a department, create an organization as platform admin -- confirming behavior matches pre-deletion.

**Results (this implementation pass):**
- `npx tsc --noEmit` -- clean.
- `npm run lint` -- clean (only the pre-existing, unrelated
  `scripts/seed-company-360.mjs` `idByEmail` warning, matching the spec's
  own expectation).
- `npm test` -- 456/457 passing. The one failure
  (`tests/integration/admin-organizations-pagination.test.ts` > "default
  load ... badge shows the true total count") is an org-count race:
  Story 6.1's pagination page fetches the platform-wide org total twice in
  one test, and other specs (spec-5-1a/spec-5-1c, confirmed running in
  parallel against the same local Supabase instance during this session --
  their own untracked spec files and modified action/test files were
  visible in `git status` throughout) created new organizations between
  those two reads, growing the count mid-test. Re-ran
  `admin-organizations-pagination.test.ts` and
  `tests/characterization/admin-members-auth.test.ts` together in
  isolation: 24/24 pass. This file is pre-existing (Story 6.1, before this
  spec), not in this spec's Code Map, and unmodified by this story --
  logged here as an observed flake, not fixed.
- Ran every test file in this spec's own Code Map together in isolation
  (`admin-members-auth{,-manager}.test.ts`, `read-only-reports{,-manager}.test.ts`,
  both `*-new-path-verification.test.ts` files, `read-only-reports-thin-delegate.test.ts`,
  both `*-route.test.ts` files): 179/179 passing.
- Repo-wide `grep -rn "USE_NEW_API_ADMIN_MEMBERS\|USE_NEW_API_REPORTS" src/ tests/`: zero matches.
- `admin/page.tsx`, `admin/empresas/[id]/page.tsx`, `dashboard/members/page.tsx`:
  confirmed via `git diff --stat` to have zero changes.
- No Playwright pass was run by the implementer (no browser/Playwright
  available in that session) -- the automated suite above (characterization
  baseline + real-Supabase new-path-verification files, both exercising the
  actual Server Actions/RPCs/pages against a local `supabase start`
  instance) was the verification that ran at implementation time.
- **Orchestrator follow-up:** performed the deferred Playwright pass across
  all 3 combined specs (not just this one) after the review/patch round --
  seeded a fresh 8-employee demo company, then live in the browser:
  platform-admin sign-in -> `/admin` (paginated list + badge render
  correctly) -> sign-out (-> `/login`, confirming the earlier signOut fix
  survived this collapse); an employee's `/dashboard` (both "Ciclos 360
  abiertos"/"Tareas pendientes" and "Mis feedbacks en curso" sections
  render); supervisor's `/dashboard/mi-mapa` and `/dashboard/
  informe-empresa` (both load, aggregate badge present); `/dashboard/
  cycles` and `/dashboard/feedback/nueva` load without error. All matched
  expected pre-deletion behavior with real rendered pixels, not just
  markup strings or mocked assertions.
