---
title: 'Characterization Tests for Read-Only Reports (Current Behavior Baseline)'
type: 'chore'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'df6a5345830b8094a01abc1c16ad0d1f3532380a'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/app/dashboard/page.tsx`, `mi-mapa/page.tsx`, and `informe-empresa/page.tsx` have zero test coverage for their read-only data-fetching. This is the first story of Epic 3's final domain block (3.25-3.30) — the lowest-risk domain, purely read, migrated last since it composes every other domain's own data. Before any refactor, current behavior must be captured as a frozen baseline.

**Approach:** Direct RPC/REST characterization, mirroring every prior domain's Story-3.x1 technique (real Supabase, no page rendering). Fixtures: `scripts/seed-demo-company.mjs` plus real ad-hoc/cycle requests and report groups created directly through the already-characterized RPCs from prior domains (per the investigated exclusions below).

**Scope corrections (investigated, not guessed):**
- `dashboard/page.tsx` is already partially migrated by 3 prior domains' own flag-gated bootstrap logic: `is_platform_admin` (Story 3.4, `adminManager`), `accept_member_invite` (Story 3.4, `membersManager`), `claim_pending_email_invitations` (Story 3.4, `membersManager`) — confirmed via direct read, none of this is this domain's scope. `create_individual_account` (the `pendingIndividualSignup` bootstrap branch) is a mutation already investigated and excluded from manager-migration entirely by Story 3.2's own correction ("no manager equivalent") — excluded here too, for the same reason.
- `get_my_pending_invitations` (called directly in `dashboard/page.tsx` for the pending-tasks list) is already frozen by Story 3.19's own characterization baseline (`tests/characterization/responder-invitation.test.ts`) -- the identical RPC, already wrapped by `feedbackManager.getMyPendingInvitations()` (Story 3.14). Not re-characterized here, matching this codebase's established precedent for RPCs already frozen by an earlier domain (e.g. `get_request_competency_comparison`, frozen by cycles, excluded from feedback's own baseline).
- The genuinely in-scope, still-unmigrated reads in `dashboard/page.tsx` are 3 direct-table queries (no existing RPC or manager wraps any of them): the caller's own in-progress ad-hoc/cycle feedback requests (`feedback_requests`), the caller's open company cycles (`feedback_cycle_participants` joined to `feedback_cycles`), and a cycle-request dedup read (`feedback_requests` filtered to `request_type = 'cycle'`) -- plus one RPC, `get_my_report_groups`, confirmed via repo-wide grep to have **no** existing manager wrapper (not even `reportGroupsManager`, despite the name similarity) -- epic-3-context.md's "composes existing managers" framing holds only for the already-excluded `get_my_pending_invitations`; everything else here is genuinely new.
- `get_organization_competency_summary` (`informe-empresa`) has its own RPC-level Supervisor-only guard (`raise exception 'Solo el administrador de la empresa puede ver este informe.'` for a non-Supervisor caller) -- a distinct rejection to characterize, separate from the page's own `redirect("/dashboard")` gate for the same case.

## Boundaries & Constraints

**Always:** Real Supabase throughout (no RPC mocking), exact-string/exact-shape assertions, same technique every prior characterization file in this repo uses. Cover both named states from epics.md's own AC: "with and without a closed 360" for `mi-mapa`, and the Supervisor-only aggregate view for `informe-empresa` (both the RPC-level rejection and a populated result).

**Never:** Do not characterize any already-flag-gated bootstrap logic in `dashboard/page.tsx` (`is_platform_admin`, `accept_member_invite`, `claim_pending_email_invitations`) or `create_individual_account` -- out of scope per the investigated corrections above. Do not re-characterize `get_my_pending_invitations` -- already frozen by Story 3.19. Do not attempt to render any of the 3 page components as React components -- not unit-testable in this repo (established constraint; direct RPC/REST characterization is this story's actual technique, matching every prior Story-3.x1).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dashboard: in-progress feedback requests read | caller has an open ad-hoc/cycle request | returns rows with id/created_at/request_type/status/name/cycle name | N/A |
| Dashboard: open company cycles read | caller is a participant in an open cycle | returns the cycle's id/name/opens_at/closes_at | N/A |
| Dashboard: `get_my_report_groups`, has pending | caller invited to an unaccepted report group | returns the group with `my_status`, `accepted_count`/`total_count` | N/A |
| Dashboard: `get_my_report_groups`, none | caller has no report groups | returns `[]` | N/A |
| `get_my_competency_map`, with closed 360 | caller has a closed cycle request | returns per-competency rows (`base_value`, `mention_delta`, `last_cycle_closed_at`) | N/A |
| `get_my_competency_map`, without closed 360 | caller has never closed a cycle | returns `[]` (RPC's own early `return;`) | N/A |
| `get_organization_competency_summary`, Supervisor, revealed data | closed/threshold-met requests exist org-wide | returns per-competency aggregate rows | N/A |
| `get_organization_competency_summary`, Supervisor, no revealed data | no request meets the reveal threshold org-wide | returns `[]` | N/A |
| `get_organization_competency_summary`, non-Supervisor caller | regular employee | throws the RPC's own exact access-control message | thrown-not-swallowed |

</frozen-after-approval>

## Code Map

- `tests/characterization/responder-invitation.test.ts` (Story 3.19) -- exact shape to mirror: real Supabase, `login`/`actingAs` helper, exact-string/shape assertions; also the file that already freezes `get_my_pending_invitations`, not re-characterized here.
- `src/app/dashboard/page.tsx` -- read-only reference: lines ~34-48 (`is_platform_admin`, already Story 3.4's), ~73-101/159-168 (`accept_member_invite`/`claim_pending_email_invitations`, already Story 3.4's), ~108-114 (`create_individual_account`, excluded per Story 3.2), ~180 (`get_my_pending_invitations`, excluded per Story 3.19), ~193-197 (in-progress requests query), ~204-207 (open cycles query), ~225-229 (cycle-request dedup query), ~245 (`get_my_report_groups`, skipped for individual-kind orgs).
- `src/app/dashboard/mi-mapa/page.tsx` -- read-only reference: `get_my_competency_map` call and its two render states (`mapRows.length > 0`/`=== 0`).
- `src/app/dashboard/informe-empresa/page.tsx` -- read-only reference: the Supervisor-only page gate (`redirect("/dashboard")`) plus `get_organization_competency_summary`'s own RPC-level guard.
- `supabase/migrations/0063_fix_competency_map_same_day_mentions.sql` -- `get_my_competency_map`'s latest definition.
- `supabase/migrations/0054_expose_role_in_competency_reports.sql:83-` -- `get_organization_competency_summary`'s latest definition, including its Supervisor-only guard.
- `supabase/migrations/0065_fix_get_my_report_groups.sql` -- `get_my_report_groups`'s latest definition.
- `scripts/seed-demo-company.mjs` -- org/member infrastructure; confirmed-empty for ad-hoc/report-group fixtures, same baseline every prior domain story established.

## Tasks & Acceptance

**Execution:**
- [x] `tests/characterization/read-only-reports.test.ts` -- new -- characterizes the 3 dashboard queries + `get_my_report_groups` (dashboard), `get_my_competency_map` (mi-mapa, 2 states), `get_organization_competency_summary` (informe-empresa, 3 states), covering every I/O & Edge-Case Matrix row above

**Acceptance Criteria:**
- Given the current `dashboard/page.tsx`, `mi-mapa/page.tsx`, and `informe-empresa/page.tsx` implementations, untouched, when characterization tests are written against seeded demo data, then they capture the dashboard's open-cycles/pending-actions summary, an employee's competency map (with and without a closed 360), and the Supervisor's company-wide aggregate view
- Given these tests, when run against today's implementation, then all pass

## Implementation Notes

One additive deliverable, exactly as scoped -- no file under `src/` touched (confirmed via `git status`: only this spec file, `sprint-status.yaml`, and the new test file changed).

**`tests/characterization/read-only-reports.test.ts`** (new, 10 tests) -- mirrors `responder-invitation.test.ts`/`cycles.test.ts`'s proven shape: real local Supabase, `login`/`restGet`/`callRpc` helpers, exact-string/exact-shape assertions. No Server Action or Next.js module is mocked anywhere in this file -- every read characterized here (dashboard's 3 direct-table queries, `get_my_report_groups`, `get_my_competency_map`, `get_organization_competency_summary`) is called directly (RPC or REST), exactly as each page calls it; none of the 3 pages goes through a Server Action for any of these reads.

- Fixture: one 8-employee demo company (org A) via `scripts/seed-demo-company.mjs`, whose own 3-realism-bucket split gave both `get_my_competency_map` states for free (a closed-360 employee, a not-yet-closed one) with no extra cycle fixture needed. `dashboardEmployee` (bucket "a medias") anchors all 3 dashboard direct-table reads at once (an ad_hoc request built directly via `create_ad_hoc_feedback_request`, plus its own already-existing open cycle request from the seed's `organize_cycle_evaluators` call) and doubles as `get_my_competency_map`'s "without closed 360" state and `get_my_report_groups`'s "none" state. `closedInvitee` (bucket "cerrado") doubles as `get_my_competency_map`'s "with closed 360" state and the sole (eligible) invitee of a report group built directly via `create_report_group`, giving `get_my_report_groups`'s "has pending" state. A second, minimal org B (supervisor only, zero `feedback_requests`) was built directly via `create_organization_as_admin` for `get_organization_competency_summary`'s "no revealed data" state -- confirmed by direct read of `seed-demo-company.mjs` that its own bucket split always closes at least one employee's 360 (bucket 0 is always "cerrado", even at employee count 1), so it can never itself produce a company with zero closed cycles.
- All exact-shape assertions were recorded from the actual first-run output, not guessed: `get_my_competency_map`'s row count/codes were cross-checked against a live `competency_frameworks?select=code` read rather than hardcoded to a competency count that could drift; `get_organization_competency_summary`'s and `get_my_report_groups`'s "has data" assertions use `toHaveProperty`/targeted-field checks (matching `cycles.test.ts`'s own established pattern for RPC output with framework-driven row sets) rather than a brittle full deep-equal.
- One dead helper (`signUp`, unused once `signUpOrSignIn`/`signUpWithInvite` covered every account-creation path actually needed) was removed after `npm run lint` flagged it -- the only lint finding introduced by this story.

**Post-review patch (3-lens review, see Review Triage Log above) -- 4 tests added, 14 total, all additive, no existing test modified:**
- `dashboard: in-progress feedback requests read` describe block gained 2 tests: (1) closes the original ad_hoc fixture via `close_ad_hoc_feedback_request`, creates a 2nd ad_hoc request (possible only once the 1st is closed, per the RPC's own one-open-at-a-time guard), and asserts the resulting 3-row `feedback_requests` array's `created_at.desc` order by array index (new open ad_hoc, then the now-closed original, then the seed's own cycle request) -- exercises the closed-request row the page's own query has always been able to return but the original suite never triggered; (2) proves `feedback_requests`'s RLS is organization-scoped only, not per-member (confirmed against `supabase/migrations/0001_initial_schema.sql:220-223`) -- a different org-A employee's own token, filtered to `dashboardEmployee`'s id, still successfully reads `dashboardEmployee`'s rows, locking in that the account boundary lives entirely in the page's own `.eq("requester_member_id", member.id)` clause today.
- `get_my_report_groups` describe block gained 2 tests: (1) the creator's own view (`reportGroupCreator`) -> `is_creator: true`, `my_status: null` (confirmed against `create_report_group`'s insert logic, which never adds the creator itself to `report_group_members`); (2) `closedInvitee` accepts via `respond_to_report_group`, then `get_my_report_groups` is re-called and asserted to show `my_status: "accepted"`, with the page's own `pendingOnly`-style filter applied to that result now yielding `[]` -- proving the filter genuinely excludes non-pending groups, not just happens to include the one pending one. This test runs last in its describe block, since it mutates `closedInvitee`'s own `report_group_members` row and must follow the pre-existing "has pending" test.
- Deferred (not implemented, appended to `deferred-work.md`): multi-row ordering for the "open company cycles" and "cycle-request dedup" dashboard queries -- would need a 2nd `create_feedback_cycle` fixture, a materially larger scope increase than a direct correction.

**Verification performed (original pass):**
- `npx vitest run tests/characterization/read-only-reports.test.ts` -- 10/10 passed, twice back-to-back (idempotent: no leftover state from the first run breaks the second).
- `npm run test` -- 448/448 passed across all 26 test files (no leakage from this file into any other suite).
- `npm run lint` -- 0 errors, 1 pre-existing unrelated warning (`scripts/seed-company-360.mjs`, untouched by this story).
- `npx tsc --noEmit` -- 0 errors.

**Verification performed (post-review patch pass):**
- `npx vitest run tests/characterization/read-only-reports.test.ts` -- 14/14 passed, twice back-to-back (idempotent).
- `npm run test` -- 452/452 passed across all 26 test files (no leakage from this file into any other suite).
- `npm run lint` -- 0 errors, the same 1 pre-existing unrelated warning (`scripts/seed-company-360.mjs`, untouched).
- `npx tsc --noEmit` -- 0 errors.

No deviations from the spec's frozen Intent/Boundaries/I-O matrix. No open questions.

`sprint-status.yaml`'s `3-25-...` entry was already flipped to `in-progress` by the dispatch tooling before this implementation pass started (same pattern Story 3.24's own Implementation Notes documents). This pass leaves both it and this spec's own frontmatter `status` at `in-progress` -- no review-triage or finalize step was run as part of this pass, so neither is moved to `done` here.

## Spec Change Log

## Review Triage Log

- **Closed-request row never exercised, despite the page's own `feedback_requests` query (dashboard/page.tsx:193-197) having no `.eq("status", ...)` clause — the original suite's only in-progress-requests test produced exactly 2 rows, both open, and never showed the page's own distinct `" — cerrada"` rendering for a closed one** — Blind Hunter + Edge Case Hunter, converged, HIGH. Verdict: **high**, real and cheap to close. Routes to **patch**: close the original ad_hoc fixture via the already-characterized `close_ad_hoc_feedback_request` RPC, create a 2nd ad_hoc request (only possible once the 1st is closed, per `create_ad_hoc_feedback_request`'s own one-open-at-a-time guard), and assert the resulting 3-row array's `created_at.desc` order by index — closing the Edge Case Hunter's ordering finding for this query cheaply, using rows already on hand, rather than as a separate fixture.
- **Account-boundary for `feedback_requests` is JS-filter-only, not RLS-backed, and the negative case was never tested** — Edge Case Hunter, HIGH. Verdict: **high**, real and confirmed: `feedback_requests`'s RLS policy (`supabase/migrations/0001_initial_schema.sql:220-223`) is `organization_id in (select auth_member_organization_ids())` — organization-scoped only — unlike `feedback_cycle_participants`'s own per-member policy (`0017_supervisor_and_admin_management.sql:194-196`). The page's own `.eq("requester_member_id", member.id)` clause is therefore the *only* thing enforcing the account boundary today. Routes to **patch**: a new test proves a different org-A employee's own token, with the filter still targeting `dashboardEmployee`'s id, successfully reads `dashboardEmployee`'s rows — locking in that the boundary lives in the query's filter, not the database, as current characterized behavior (not a fix — this story only freezes behavior).
- **`get_my_report_groups` field-surface undercovered — only the invitee's `my_status: "pending"` view was tested; the creator's own view (`is_creator: true`) and the post-accept state (`my_status: "accepted"`) were never exercised, so the page's own `pendingOnly` filter (dashboard/page.tsx:~249) was never actually proven to exclude a non-pending group** — Blind Hunter + Edge Case Hunter, converged, MEDIUM-HIGH. Verdict: **medium-high**, real coverage gap in the frozen I/O matrix's own stated scenarios. Routes to **patch**: added the creator's-view test (`reportGroupCreator` -> `is_creator: true`, `my_status: null`, confirmed against `create_report_group`'s own insert logic never adding the creator to `report_group_members`) and an accept-then-recheck test (`respond_to_report_group` as `closedInvitee`, re-call `get_my_report_groups`, assert `my_status: "accepted"` and that the page's own `pendingOnly`-style filter now yields `[]`).
- **Multi-row ordering for the "open company cycles" and "cycle-request dedup" dashboard queries is untested (both still single-row)** — Edge Case Hunter, LOW-MEDIUM. Verdict: **low-medium**, real but needs a 2nd `create_feedback_cycle` fixture — materially larger scope increase than a direct correction, and not required to lock in today's single-row behavior. Routes to **defer**: appended to `deferred-work.md`.

## Verification

**Commands:**
- `npx vitest run tests/characterization/read-only-reports.test.ts` -- expected: all pass, run twice back-to-back for idempotency
- `npm run test` -- expected: all existing tests pass, plus this story's new tests
- `npm run lint` -- expected: 0 new errors/warnings
- `npx tsc --noEmit` -- expected: no type errors
