---
title: 'Read-Only Reports Pages Become Thin Delegates'
type: 'refactor'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5409809'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `dashboard/page.tsx`, `mi-mapa/page.tsx`, `informe-empresa/page.tsx` still call Supabase directly for the 6 reads Story 3.26 wrapped. epics.md's own AC says each page should have "zero direct Supabase imports remaining."

**Approach:** Add a `USE_NEW_API_REPORTS` flag (default off), checked once per read, mirroring Story 3.22's `let X; if (flag) { try {...} catch {...} } else {...}` shape (the only viable shape for a Server Component — no early-return like Server Actions). The old path stays byte-preserved below the flag check. Since this domain composes 4 pre-existing managers (Story 3.26/3.27's own established correction — no single `reportsManager` exists), each page's new-path branches call `feedbackManager`/`cyclesManager`/`reportGroupsManager`/`membersManager` directly, never a domain manager that doesn't exist.

**Scope correction (investigated, not guessed, same correction Stories 3.10/3.16 already established for the identical situation):** epics.md's "zero direct Supabase imports remaining" is not literally achievable while the old path stays byte-preserved (required so Story 3.29 has a real path to gate/roll back to) — `createClient` stays imported in all 3 pages, used by the still-present old-path branches and by the unconditional `auth.getUser()`/`members` lookup every page does regardless of this domain's flag (out of this story's scope — Story 3.4's `USE_NEW_API_ADMIN_MEMBERS` territory). This story's actual bar, matching every prior thin-delegate story: zero direct Supabase RPC/table calls for this domain's 6 reads *when the flag is on*.

**Dashboard's merge requirement (investigated, Story 3.26's own flagged risk):** the old path's single `myRequests` query returns ad_hoc AND cycle rows merged, sorted `created_at desc`. The new path must call `feedbackManager.getMyAdHocRequests()` + `cyclesManager.getMyCycleRequests()` and merge+re-sort client-side to reproduce the identical unified list, verified against Story 3.25's frozen baseline. `getMyCycleRequests()`'s result is reused for both the merged list and the `cycleRequestByCycleId` dedup map (Story 3.26's own superset-selection design). `cyclesManager.getMyOpenCycles()` is deliberately unfiltered/unsorted (Story 3.26's flagged risk) — this page must still apply the `opens_at <= today <= closes_at` filter and `opens_at`-ascending sort client-side, exactly as today.

**Fallback fidelity (investigated per page, not assumed from Story 3.22's precedent):** `dashboard/page.tsx`'s old path destructures only `{ data }` from every one of its 4 reads (`myRequests`/`participantRows`/`myCycleRequests`/`groupsData`), silently discarding `error` -- a failure renders as empty/`[]`, never a crash. `mi-mapa`/`informe-empresa`'s old paths do the same for their one RPC each. The new path's manager functions `throw` on error (established convention) -- every new-path branch in all 3 pages needs `try/catch` falling back to the same empty state, or `USE_NEW_API_REPORTS=true` would crash pages that silently degrade today (the exact regression Story 3.22's review caught and fixed).

## Boundaries & Constraints

**Always:** Check `process.env.USE_NEW_API_REPORTS === "true"` once per read, never inside a manager. New-path branches wrap every manager call in `try/catch`, falling back to the identical empty state (`[]`/`null`) the old path's unchecked-`error` pattern already produces. Old path stays **byte-for-byte unmodified** below the flag check.

**Never:** Do not touch `is_platform_admin`/`accept_member_invite`/`claim_pending_email_invitations` (Story 3.4's `USE_NEW_API_ADMIN_MEMBERS`, different flag, different domain) or `create_individual_account`/`get_my_pending_invitations` (Story 3.2/3.19's excluded scope) in `dashboard/page.tsx`. Do not modify `src/server/managers/*.ts`, `src/server/db/*.ts`, or any `src/app/api/**` route (Story 3.26/3.27's files stay as delivered). Do not add `USE_NEW_API_REPORTS` to `.env.example`/`docs/feature-flags.md` yet -- that's Story 3.29's job, mirroring Story 3.10/3.11's split. Do not touch any `tests/characterization/read-only-reports*.test.ts` or `tests/integration/read-only-reports-route.test.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `dashboard/page.tsx`, flag on | caller has an open ad_hoc + open cycle request | identical merged/sorted list to Story 3.25's baseline | N/A |
| `dashboard/page.tsx`, flag on | caller participates in an open, not-yet-organized cycle | identical `cyclesToOrganize` (date-filtered, sorted) | N/A |
| `dashboard/page.tsx`, flag on | caller invited to a pending report group | identical `pendingGroups` | N/A |
| `dashboard/page.tsx`, flag on | a wrapped read throws | falls back to the old path's empty state, no crash | caught, not propagated |
| `mi-mapa/page.tsx`, flag on | caller has/hasn't closed a 360 | identical `hasClosedCycle`/radar axes to baseline | N/A |
| `informe-empresa/page.tsx`, flag on | Supervisor, revealed/no revealed data | identical radar axes to baseline | N/A |
| Any of the 3 pages, flag off (default) | any state | byte-identical to pre-story behavior | N/A |

</frozen-after-approval>

## Code Map

- `src/app/actions/feedback.ts` (Story 3.16) -- exact `let X; if (flag) {try{...}catch{fallback}} else {...}` shape to mirror, adapted for a Server Component (no early `return` after the new-path branch; execution continues into shared downstream code either way).
- `src/app/responder/[token]/page.tsx` (Story 3.22) -- exact Server-Component thin-delegate shape, including the try/catch-fallback fix from that story's own review.
- `src/app/dashboard/page.tsx:193-197,204-207,225-229,245-251` -- the 4 reads to flag-gate: merged `myRequests` (split into `feedbackManager.getMyAdHocRequests()` + `cyclesManager.getMyCycleRequests()`, merged+sorted `createdAt desc`, mapped to the old snake_case shape), `openCycles`/`cyclesToOrganize` (`cyclesManager.getMyOpenCycles()`, then the same date-filter+sort applied today, plus `cycleRequestByCycleId` reusing the same `getMyCycleRequests()` call), `pendingGroups` (`reportGroupsManager.getMyReportGroups()`, filtered/mapped identically).
- `src/app/dashboard/mi-mapa/page.tsx:42` -- `feedbackManager.getMyCompetencyMap()`, mapped back to the local `MapRow` (snake_case) shape so all downstream code is untouched.
- `src/app/dashboard/informe-empresa/page.tsx:42` -- `membersManager.getOrganizationCompetencySummary()`, mapped back to the local `SummaryRow` (snake_case) shape.
- `tests/characterization/read-only-reports.test.ts` (Story 3.25) -- the frozen baseline this story's new tests must reproduce; not modified.
- `tests/integration/responder-invitation-flag-toggle.test.ts` / `admin-members-auth-flag-toggle.test.ts` -- the `DashboardPage()`-called-directly technique (Story 3.23's discovery) to mirror for this story's own page-level equivalence tests.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/dashboard/page.tsx` -- flag-gate `myRequests`/`openCycles`+`cyclesToOrganize`/`cycleRequestByCycleId`/`pendingGroups`
- [x] `src/app/dashboard/mi-mapa/page.tsx` -- flag-gate `mapData`
- [x] `src/app/dashboard/informe-empresa/page.tsx` -- flag-gate `summaryData`
- [x] `tests/integration/read-only-reports-thin-delegate.test.ts` -- new -- calls all 3 page functions directly (flag on vs off) against seeded data, asserting equivalent output/no-throw, covering every I/O matrix row

**Acceptance Criteria:**
- Given the three page components, when refactored, then each issues zero direct Supabase RPC/table calls for this domain's 6 reads when the flag is on (per the Scope correction above)
- Given Story 3.25's characterization tests, when run with the flag unset (default), then all 14 still pass unchanged

## Implementation Notes

- `dashboard/page.tsx` ends up with 4 independent `if (process.env.USE_NEW_API_REPORTS === "true") {...} else {...}` blocks (myRequests, openCycles, myCycleRequests, pendingGroups) rather than one -- mirrors this same file's own existing `USE_NEW_API_ADMIN_MEMBERS` convention of checking a shared flag at each call site independently. `cyclesManager.getMyCycleRequests()` is called once (inside the myRequests block) and its result stashed in `newPathCycleRequests`, reused (no second manager call) by the `myCycleRequests` block -- per the frozen Intent's superset-selection reuse requirement.
- To keep each old-path branch byte-for-byte unmodified while still assigning into an outer `let` (required by the flag-branching shape), destructuring `const { data: X } = await supabase...` became `({ data: X } = await supabase...)` -- only the declarator keyword changes, the query itself (select/eq/order args) is untouched. Same technique Story 3.22 already used for `RespondPage`'s `ctx`.
- `mi-mapa`/`informe-empresa`: only `mapData`/`summaryData` are flag-gated: the `frameworkData` read stays an unconditional direct Supabase call in both branches (out of this domain's 6 reads), so its select string is duplicated once per branch rather than factored out, to keep the old branch's `Promise.all([...])` call byte-for-byte unmodified.
- `dashboard/page.tsx`'s `MyRequestRow.feedback_cycles` field is typed `unknown` rather than `{ name: string } | null` -- supabase-js infers the old path's untyped `feedback_cycles(name)` embed as an array shape (no Database generic configured project-wide), and downstream code already reads it via `as unknown as {...}` regardless, matching the pre-existing convention rather than fighting it.
- New test file uses `react-dom/server`'s `renderToStaticMarkup` (verified compatible with this repo's Vitest node-environment config, `next/link`, and React 19 `<form action={fn}>` Server Actions via a standalone sanity check before committing to the approach) to assert flag-on vs flag-off render output is byte-identical per scenario -- a stronger check than the two prior domains' routing-only "which mock fired" flag-toggle tests, since this story's own Tasks explicitly ask for output equivalence, not just routing.

**Post-review patch (3-lens review, see Review Triage Log):** `dashboard/page.tsx`'s `myRequests` block no longer shares one `Promise.all` + one `try/catch` across `feedbackManager.getMyAdHocRequests()` and `cyclesManager.getMyCycleRequests()` -- it now uses `Promise.allSettled`, with each read independently defaulting to `[]` on its own rejection, so one read failing can never blank out the other read's already-succeeded data (that data also feeds `newPathCycleRequests`/`cycleRequestByCycleId`/`cyclesToOrganize`, a different UI section). Test file grew from 12 to 18 `test()` blocks: 1 new regression test for the fix above, plus 5 coverage-gap patches (multi-row merge/sort ordering, `openCycles` date-filter boundaries, both `USE_NEW_API_REPORTS`+`USE_NEW_API_ADMIN_MEMBERS` on simultaneously, empty-`frameworks` on the flag-on path for both `mi-mapa` and `informe-empresa`, and a positive old-vs-new HTML equivalence assertion added to the pre-existing individual-account test).

## Spec Change Log

## Review Triage Log

- **`dashboard/page.tsx`'s new-path `myRequests` block shares one `Promise.all` + one `try/catch` across `getMyAdHocRequests()`/`getMyCycleRequests()`, so `getMyAdHocRequests()` alone throwing also discards `cycleRows` (and thus `newPathCycleRequests`/`cycleRequestByCycleId`/`cyclesToOrganize`) even though that read never failed -- the old path never has this coupling (two fully independent Supabase calls)** -- Blind Hunter, HIGH confidence, real production bug. Verdict: **high**, real and the story's headline fix. Routes to **patch**: replaced the shared `Promise.all`/`try/catch` with `Promise.allSettled`, each read defaulting to `[]` independently on its own rejection; `myRequests` is now built by merging whatever `adHocRows`/`cycleRows` actually resolved, matching the old path's true independent-failure semantics. New regression test: `"myRequests's ad-hoc read throws but the cycle-requests read succeeds (flag on) -> cycle data survives, dedup map stays correct"`, re-verified against the pre-existing `"myRequests read throws"` test (still passes unmodified).
- **The one existing multi-row scenario always has exactly 1 ad_hoc + 1 cycle row -- too few to distinguish a correct `created_at desc` merge-sort from an accidentally-stable concat-per-type order** -- Edge Case Hunter, HIGH. Verdict: **high**, real gap. Routes to **patch**: new test with 2 ad_hoc + 2 cycle rows, timestamps interleaved by type, fed to the manager mocks pre-shuffled (not pre-sorted) so a pass can only mean the page itself sorts correctly; asserts both HTML equality and the actual substring order of all 4 labels.
- **`openCycles`'s `opens_at <= today <= closes_at` date filter has no test at its own boundaries** -- Edge Case Hunter, HIGH. Verdict: **high**, real gap. Routes to **patch**: new test with 4 cycles -- `opensAt === today` (included), `closesAt === today` (included), `opensAt` tomorrow (excluded), `closesAt` yesterday (excluded) -- flag on/off equality plus content assertions per cycle.
- **No test covers `USE_NEW_API_REPORTS` and `USE_NEW_API_ADMIN_MEMBERS` both on at once, the realistic eventual production state once both stories' flags are flipped** -- Edge Case Hunter, HIGH. Verdict: **high**, real gap, cheap to close. Routes to **patch**: new test mocking `adminManager.checkIsPlatformAdmin`/`membersManager.claimPendingInvitations`/`acceptInvite` (mirroring `admin-members-auth-flag-toggle.test.ts`'s own dashboard-bootstrap mocking pattern -- newly added to this file's `managerMocks`/`vi.mock` setup), asserting both flag blocks independently take their new path with no cross-interaction and the render still matches both-off.
- **`mi-mapa`/`informe-empresa`'s unconditional `frameworkData` read is never exercised with `frameworks = []` on the flag-on path, where it interacts with the flag-gated `mapData`/`summaryData` read** -- Edge Case Hunter, MEDIUM-HIGH. Verdict: **medium-high**, real gap against the duplicated-select-string risk the spec's own Implementation Notes already flagged. Routes to **patch**: one test per page with `frameworks = []` and a non-empty `mapData`/`summaryData`, confirming flag-on/off still render identically (and, for `informe-empresa`, that `hasAnyData` correctly stays false since it's driven by `axes`, not `summaryData`, directly).
- **The "individual account" dashboard test only asserted `getMyReportGroups` wasn't called -- never compared rendered HTML old-vs-new, unlike every other scenario in this file** -- Edge Case Hunter, MEDIUM. Verdict: **medium**, real gap, cheap to close. Routes to **patch**: added the `htmlOld`/`htmlNew` equality check plus two content sanity assertions (`"Informes de grupo"` absent, `"Pedir feedback 360"` present) to the existing test, additively -- negative assertions kept as-is.

## Verification

**Commands run (2026-09-15, post-review patch, against a local `supabase start` instance):**
- `npx vitest run tests/integration/read-only-reports-thin-delegate.test.ts` -- 18/18 passed, run twice back-to-back for idempotency (both runs 18/18)
- `npx vitest run tests/characterization/read-only-reports.test.ts tests/characterization/read-only-reports-manager.test.ts tests/integration/read-only-reports-route.test.ts` -- 51/51 passed, unmodified
- `npm run test` -- 507/507 passed across 29 files (full suite, includes the above; up from 501/501 pre-patch)
- `npm run lint` -- 0 errors, 1 warning (pre-existing, unrelated: `scripts/seed-company-360.mjs:128`) -- 0 new
- `npx tsc --noEmit` -- no type errors
