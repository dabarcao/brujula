---
title: 'Read-Model Composition for Read-Only Reports'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5b4c8f2'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/app/dashboard/page.tsx`, `mi-mapa/page.tsx`, and `informe-empresa/page.tsx` still call Supabase directly for 6 reads that have no `db/`/manager wrapper. epics.md's own AC says these pages should "compose the existing `cyclesManager`, `feedbackManager`, `membersManager`, and `adminManager` functions rather than requiring a new dedicated manager."

**Approach:** Add new exported functions to the *existing* `db/*.ts`/`managers/*Manager.ts` files (never a new file), each placed with the domain that already owns its underlying table/RPC. No page is touched in this story (that's Story 3.28) — this is DB-access + manager scaffolding only, verified against Story 3.25's frozen characterization baseline, mirroring Story 3.20's own approach.

**Scope corrections (investigated, not guessed):**
- epics.md's literal text forbids "a new manager or new `db/*` file" — it does not forbid new *functions* inside the 8 files that already exist. Since Story 3.25 confirmed 5 of 6 in-scope reads have zero existing wrapper, "compose" here means: each read becomes one new function in whichever existing manager already owns that domain's table/RPC, not a call into logic that doesn't exist yet.
- `dashboard/page.tsx`'s "in-progress requests" query (line 193) and its "cycle-request dedup" query (line 225) both read `feedback_requests`, mixing ad_hoc-type and cycle-type rows. Per the already-established cycles-vs-feedback RPC ownership split (epic-3-context.md), this is split at the manager boundary: `feedbackManager.getMyAdHocRequests()` (ad_hoc rows only) and `cyclesManager.getMyCycleRequests()` (cycle rows only, superset-selected so it serves both the list and the dedup map). Story 3.28 will merge+re-sort both by `created_at desc` to reproduce today's single unified list — not this story's concern.
- `get_my_competency_map` mixes a closed-cycle `base_value` with ad_hoc-mention `mention_delta` in one PL/pgSQL query (0063) — irreducibly composite, cannot split without reimplementing its SQL client-side (the exact duplication epics.md's AC warns against). Placed in `feedbackManager` (not `cyclesManager`): the row shape it returns is a competency aggregate, the same category as `feedbackManager.getCompetencyNarrative()` already returns, and the majority of its source rows are `feedback_answers`/`feedback_responses` (feedback-owned tables) — the closed-cycle state is only its early-return gate, not its main computation.
- `get_organization_competency_summary` is Supervisor-only and single-org-scoped (`fr.organization_id = caller's own org`, `0054_expose_role_in_competency_reports.sql:83+`) — placed in `membersManager`, not `adminManager`: `adminManager` today is exclusively platform-admin/cross-org (`listAllOrganizations`, `createOrganization`); platform admins belong to no organization and never carry `is_supervisor`. `membersManager` is already org-scoped and already aggregates across an org's members (`listMembers`); the Supervisor gate is enforced by the RPC itself, same as every other wrapped RPC in this codebase (managers never re-check permissions the RPC already checks).
- `get_my_report_groups` goes in `reportGroupsManager` (undisputed — already owns `getGroup`/`getGroupCompetencySummary`, the same domain).

## Boundaries & Constraints

**Always:** New functions only inside the 8 existing `db/*.ts`/`managers/*Manager.ts` files — never a new file. camelCase manager return types, `null` for absent values, ISO-8601 timestamps (established convention). Each new manager function propagates thrown RPC errors unmodified (no re-wrapping). No page under `src/app/` is touched.

**Never:** Do not introduce a new `db/*.ts` or `managers/*Manager.ts` file, or a `reportsManager`. Do not re-implement `get_my_competency_map`'s or `get_organization_competency_summary`'s SQL client-side. Do not add permission checks in the manager layer that the RPC already enforces (matches every existing manager's own pattern).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `feedbackManager.getMyAdHocRequests()` | caller has an open + a closed ad_hoc request | rows: id/createdAt/status/name, `feedback_requests` scoped to caller | N/A |
| `cyclesManager.getMyCycleRequests()` | caller organized evaluators for an open cycle | rows: id/cycleId/createdAt/status/cycleName | N/A |
| `cyclesManager.getMyOpenCycles()` | caller is a participant in an open cycle | rows: id/name/opensAt/closesAt | N/A |
| `reportGroupsManager.getMyReportGroups()`, pending | caller invited to an unaccepted group | rows: id/name/status/createdByMemberId/isCreator/myStatus/acceptedCount/totalCount | N/A |
| `reportGroupsManager.getMyReportGroups()`, none | caller has no groups | `[]` | N/A |
| `feedbackManager.getMyCompetencyMap()`, closed 360 | caller closed a cycle | rows: competencyCode/baseValue/mentionDelta/lastCycleClosedAt | N/A |
| `feedbackManager.getMyCompetencyMap()`, no closed 360 | caller never closed | `[]` | N/A |
| `membersManager.getOrganizationCompetencySummary()`, Supervisor | revealed data org-wide | aggregate rows | N/A |
| `membersManager.getOrganizationCompetencySummary()`, non-Supervisor | regular employee | throws RPC's exact message | thrown-not-swallowed |

</frozen-after-approval>

## Code Map

- `tests/characterization/read-only-reports.test.ts` (Story 3.25) -- frozen baseline; this story's new test file re-derives the same fixtures and asserts the new functions return equivalent (camelCase) values.
- `tests/characterization/responder-invitation-manager.test.ts` (Story 3.20) -- exact shape to mirror for the new manager-verification test file.
- `src/server/db/feedback.ts` / `src/server/managers/feedbackManager.ts` -- add `getMyAdHocRequests`, `getMyCompetencyMap`.
- `src/server/db/cycles.ts` / `src/server/managers/cyclesManager.ts` -- add `getMyCycleRequests`, `getMyOpenCycles`.
- `src/server/db/reportGroups.ts` / `src/server/managers/reportGroupsManager.ts` -- add `getMyReportGroups`.
- `src/server/db/members.ts` / `src/server/managers/membersManager.ts` -- add `getOrganizationCompetencySummary`.
- `src/app/dashboard/page.tsx:193-197,204-207,225-229,245` / `mi-mapa/page.tsx` / `informe-empresa/page.tsx` -- read-only reference for exact query/RPC shapes; NOT edited this story.

## Tasks & Acceptance

**Execution:**
- [x] `src/server/db/feedback.ts`, `feedbackManager.ts` -- add `getMyAdHocRequests()`, `getMyCompetencyMap()` -- wrap the ad_hoc-only table read and the `get_my_competency_map` RPC
- [x] `src/server/db/cycles.ts`, `cyclesManager.ts` -- add `getMyCycleRequests()`, `getMyOpenCycles()` -- wrap the cycle-only table read (superset fields for list+dedup reuse) and the open-cycles join
- [x] `src/server/db/reportGroups.ts`, `reportGroupsManager.ts` -- add `getMyReportGroups()` -- wrap `get_my_report_groups`
- [x] `src/server/db/members.ts`, `membersManager.ts` -- add `getOrganizationCompetencySummary()` -- wrap `get_organization_competency_summary`, propagate its thrown message unmodified
- [x] `tests/characterization/read-only-reports-manager.test.ts` -- new -- calls each new manager function directly (real local Supabase, no mocking of the DB itself) and asserts equivalent values to Story 3.25's baseline, covering every I/O matrix row above

**Acceptance Criteria:**
- Given the 6 reads' current direct-Supabase behavior (frozen by Story 3.25), when the new manager functions are called instead, then they return equivalent data (camelCase-mapped) for every I/O matrix row
- Given no dedicated `reportsManager` exists, when this story completes, then all 6 reads live inside the 8 already-existing `db/`/manager files, none newly created

## Implementation Notes

**No new files besides the test file** -- confirmed no new `db/*.ts`/`managers/*Manager.ts` file and no `reportsManager` were created; only 8 pre-existing files were touched: `src/server/db/{feedback,cycles,reportGroups,members}.ts`, `src/server/managers/{feedbackManager,cyclesManager,reportGroupsManager,membersManager}.ts`, plus the new test file and this spec/`sprint-status.yaml`.

**`getMyAdHocRequests`/`getMyCycleRequests`/`getMyOpenCycles` are this codebase's first non-RPC db-access reads.** Every prior `db/*.ts` function wraps a Postgres RPC that resolves `auth.uid()` itself server-side; these 3 wrap direct `.from(...)` table reads instead (no RPC exists for them -- Story 3.25's own confirmed finding), so each needed its own caller-scoping. `feedback_requests`'s RLS policy is organization-scoped only, not per-member (`0001_initial_schema.sql:220-223`, confirmed by Story 3.25's own characterization test), so `getMyAdHocRequests`/`getMyCycleRequests` cannot rely on RLS alone and need the caller's own `members.id` to filter by `requester_member_id`. Added a small private `getCallerMemberId(supabase)` helper, duplicated once in `db/feedback.ts` and once in `db/cycles.ts` (not shared via a new file, per this story's own Boundaries) -- resolves `auth.getUser()` then looks up the matching `members` row, throwing `"Debes iniciar sesión."` (the same text `get_my_competency_map`/`get_my_report_groups` raise for a null `caller_member`) if either is missing. `getMyOpenCycles` also calls it, mirroring the page's own redundant `.eq("member_id", member.id)` filter even though `feedback_cycle_participants`'s RLS policy is already per-member (`0017_supervisor_and_admin_management.sql:194-196`).

**`getMyCycleRequests`'s superset shape:** one query (`id, cycle_id, created_at, status, feedback_cycles(name)`, filtered to `request_type = 'cycle'`, ordered `created_at desc`) serves both dashboard/page.tsx's own list read (needs createdAt/status/cycleName) and its separate cycle-request dedup read (needs only cycleId) -- per this story's own frozen Intent, avoiding a 5th function that would just re-run the identical query.

**`getMyOpenCycles` does not filter by date.** It wraps `feedback_cycle_participants` joined to `feedback_cycles` exactly as the page's own query does (unfiltered, unsorted) -- the today-between-`opens_at`-and-`closes_at` filter and the `opens_at`-ascending sort both stay in `dashboard/page.tsx` (lines 220-223), untouched by this story (no page under `src/app/` was touched, per Boundaries). The function's name describes what it feeds, not filtering it performs itself; flagged here in case a future reader expects otherwise.

**`getOrganizationCompetencySummary`'s full return shape** (`competencyCode/competencyName/principleCode/principleName/roleCode/roleName/avgValue/responseCount`) maps every column `get_organization_competency_summary` actually returns (`0054_expose_role_in_competency_reports.sql:83-93`), not just the 2 fields `informe-empresa/page.tsx` currently reads -- matches every other wrapper in this codebase (e.g. `reportGroupsManager.getGroupCompetencySummary`), which exposes the RPC's full row even when today's only caller uses a subset.

**Test file:** `tests/characterization/read-only-reports-manager.test.ts` (16 `test()` blocks across 8 `describe` groups, up from 10/6 after a 3-lens review -- see Review Triage Log below), mirroring Story 3.20's `responder-invitation-manager.test.ts` mocking shape exactly (only `@/lib/supabase/server` mocked, `actingAs(token)` before each manager call). Fixture: one fresh demo company per run via `scripts/seed-demo-company.mjs` (8 employees) plus a second, minimal org (org B) via `create_organization_as_admin`, same technique Story 3.25's own fixture already established -- every ad_hoc request/report group/org actually under test is built directly through the already-characterized RPCs (`callRpc`), never through the new managers themselves. Covers every row of the spec's own I/O & Edge-Case Matrix, plus one bonus scenario (org B's "no revealed data" -> `[]`) mirroring Story 3.25's own extra coverage for `getOrganizationCompetencySummary`.

**Post-review additions (3-lens review, see Review Triage Log):**
- A new `"per-caller scoping (getCallerMemberId)"` describe block (3 tests) proves `getMyAdHocRequests`/`getMyCycleRequests`/`getMyOpenCycles` are genuinely scoped to whichever caller invokes them, not silently hardcoded to `dashboardEmployee` -- using a different org-A employee for the first two and the Supervisor's own token for the third (the only genuinely non-participant caller for the single shared seeded cycle; see Review Triage Log for why an org-A employee couldn't prove that one).
- `reportGroupsManager.getMyReportGroups` describe block gained the creator's-own-view test (`isCreator: true`, `myStatus: null`) and the accept-flow test (`respond_to_report_group` then `myStatus: "accepted"`), both re-derived from `read-only-reports.test.ts`'s (3.25, frozen, unmodified) own equivalent assertions.
- A new `"getCallerMemberId() error path"` describe block (1 test) proves the helper's own `"Debes iniciar sesión."` throw for an auth user with no `members` row, via a fresh `signUpOrSignIn` account that never runs `accept_member_invite`.

**Nothing left incomplete.** All 6 reads now have manager-layer wrappers; no page under `src/app/` was modified (Story 3.28's job); no new `db/*.ts`/`managers/*Manager.ts` file or `reportsManager` was created. A 3-lens review (Edge Case Hunter, Blind Hunter, cosmetic pass) found 3 real test-coverage gaps (all patched, see Review Triage Log) and 2 cosmetic items (1 patched -- `reportGroupsManager.ts`'s misplaced `export type`; 1 investigated and left as-is -- `db/cycles.ts`'s migration-line citation was already correct, the proposed "fix" would have been wrong). One residual risk still flagged for Story 3.28: `getMyOpenCycles`'s unfiltered-by-date behavior (see above) means whoever wires these functions into the page must still apply the same today-between-opens/closes filter and sort client-side, or the page's own behavior will silently change.

## Spec Change Log

## Review Triage Log

- **No test proves the new per-caller scoping actually works — every `getMyAdHocRequests`/`getMyCycleRequests`/`getMyOpenCycles` test used only `dashboardEmployee`'s token, so a bug in the duplicated `getCallerMemberId()` helper (wrong lookup, hardcoded id) would go undetected** — Edge Case Hunter, HIGH. Verdict: **high**, real and cheap to close. Routes to **patch**: a new `"per-caller scoping (getCallerMemberId)"` describe block, one test per function. Investigated (not guessed) before writing: `seed-demo-company.mjs` makes ALL 8 org-A employees cycle participants and evaluator-organizers (not just `dashboardEmployee`), so `getMyAdHocRequests` is the only one of the three where a different employee's own token gives a literal `[]` (no employee but `dashboardEmployee` has ad_hoc fixtures) — used that. For `getMyCycleRequests`, a different employee legitimately has its own cycle-request row, so the test instead asserts the returned row's `id` differs from `dashboardEmployee`'s own (proven scoping via exclusion, per this finding's own stated fallback). For `getMyOpenCycles`, every org-A employee shares the identical single seeded cycle, so even a hardcoded-to-`dashboardEmployee` bug would coincidentally return matching content for another employee — no org-A employee can prove this one. Used the Supervisor's own token instead: `create_feedback_cycle`'s `p_participant_member_ids` is only the 8 employees (the Supervisor can never be an evaluator, `0032_supervisor_cannot_be_evaluator.sql`), so the Supervisor is a genuine non-participant and a correctly-scoped call must return `[]`.
- **`getMyReportGroups()` drops creator/accept-flow coverage Story 3.25's baseline already proved** — Edge Case Hunter + Blind Hunter, converged, MEDIUM-HIGH. Verdict: **medium-high**, real coverage gap against the frozen I/O matrix's own scenarios (mirrors 3.25's own equivalent finding almost verbatim). Routes to **patch**: added the creator's-own-view test (`reportGroupCreator` -> `isCreator: true`, `myStatus: null`) and the accept-flow test (`respond_to_report_group` via raw RPC as `closedInvitee`, re-call the manager, assert `myStatus: "accepted"`, `acceptedCount: 1`, and that a `pendingOnly`-style filter over the manager's own camelCase rows now excludes it) — both translated 1:1 from `read-only-reports.test.ts:580-`'s own assertions, called through `reportGroupsManager.getMyReportGroups()` instead of the raw RPC. Ordered after the existing "pending" test and before nothing else (accept-flow mutates shared state, so it runs last in the describe block, matching 3.25's own ordering comment).
- **`getCallerMemberId()`'s own error path is untested** — Edge Case Hunter, MEDIUM. Verdict: **medium**, real and genuinely new code (this story's own first non-RPC-resolved caller lookup). Routes to **patch**: one new test, a fresh `signUpOrSignIn` account with no `accept_member_invite`/invite flow ever run (`orphan-3-26-${runId}@brujula-fake.test`), calling `feedbackManager.getMyAdHocRequests()` and asserting it rejects with `"Debes iniciar sesión."`. Not duplicated for `db/cycles.ts`'s identical helper (same body, same guard, per this file's own header note).
- **`reportGroupsManager.ts`'s `export type { ReportGroupSummaryRow };` sits between two import blocks, breaking the file's own convention** — cosmetic. Verdict: routes to **patch**: moved below both import statements, above the first function.
- **`db/cycles.ts`'s `getCallerMemberId()` doc comment's migration-line citation for `feedback_cycle_participants`'s per-member RLS policy** — cosmetic, as reported. Verdict: **not applicable, left as-is**. Re-verified `supabase/migrations/0017_supervisor_and_admin_management.sql` directly (`cat -n`, lines 190-198): the `create policy "members read their own cycle participation" ... using (...)` statement spans lines **194-196**, with line 193 (not 196) blank. The citation already in the file, `194-196`, is correct; the reported replacement (`193-195`) would have been wrong. Left untouched rather than "fixed" into an incorrect citation — this story's own process step required verifying exact line numbers against the migration file, not guessing from the finding text.

## Verification

**Commands run (post-review patch):**
- `npx vitest run tests/characterization/read-only-reports-manager.test.ts` -- expected: all pass, run twice back-to-back for idempotency (actual: 16/16 pass, both runs)
- `npx vitest run tests/characterization/read-only-reports.test.ts` -- expected: still all pass, unmodified (actual: 14/14 pass)
- `npm run test` -- expected: all existing tests pass, plus this story's new tests (actual: 468/468 pass across 27 test files, up from 462/462 pre-patch)
- `npm run lint` -- expected: 0 new errors/warnings (actual: 0 errors, 1 pre-existing unrelated warning in `scripts/seed-company-360.mjs`, unchanged from pre-patch)
- `npx tsc --noEmit` -- expected: no type errors (actual: none)
