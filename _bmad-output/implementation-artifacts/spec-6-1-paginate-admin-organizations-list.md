---
title: 'Paginate the Admin Organizations List'
type: 'feature'
created: '2026-09-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '69c79562a8f06196b273b0b1ef7c95d205cacdee'
context: ['{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-16.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/app/admin/page.tsx:56` calls `supabase.rpc("list_organizations")` with no `LIMIT`/`OFFSET` and renders every row (1000 locally today, no ceiling in the code) into a card grid, including a "Vista agregada — N empresas" badge showing the unbounded count.

**Approach:** extend `list_organizations()` with optional `p_limit`/`p_offset` (defaulting to today's exact unbounded behavior) plus a `total_count` column via `count(*) over()`; add a `page` URL param, `PAGE_SIZE = 24`, and a new presentation-only `Pagination` component to `admin/page.tsx`. Originated via `bmad-correct-course` — see the linked sprint-change-proposal for full investigation and rationale; this spec is the implementable distillation of it, not a re-derivation.

## Boundaries & Constraints

**Always:** Preserve `where is_platform_admin()` verbatim, in its original position (filters rows before `count(*) over()` runs, so a non-admin caller still gets zero rows, never an error, never a fabricated `total_count`). `p_limit default null` / `p_offset default 0` so a zero-argument call is byte-identical to today's behavior. Order by `created_at desc, id desc` (the `id` tiebreak prevents skipped/duplicated rows across a page boundary on tied timestamps). Clamp an out-of-range `?page=` server-side to the last valid page rather than rendering an empty grid or erroring.

**Never:** Do not modify `admin/empresas/[id]/page.tsx`'s own `list_organizations()` call, its member list, or `dashboard/members/page.tsx` — same unbounded-list pattern, explicitly deferred to future stories per the proposal. Do not route `admin/page.tsx` through `adminManager`/`db/admin.ts` in this story — it keeps calling the RPC directly, now with the new params; completing that delegation is a separate architectural decision (would reopen whether reads join `USE_NEW_API_ADMIN_MEMBERS`). Do not add a new feature flag — additive, read-only, no write-path change. Do not touch `src/app/actions/admin.ts`'s write actions.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default load | no `?page=` | first 24 orgs, badge shows true `total_count` | N/A |
| Mid-range page | `?page=3`, >72 orgs exist | disjoint 24-row slice, Prev+Next both active | N/A |
| Last page | `?page=` = last valid page | partial or full final slice, Next disabled/non-link | N/A |
| Out-of-range page | `?page=999999` | clamps to last valid page, renders that page | N/A |
| Empty org set | 0 organizations | existing "Todavía no hay empresas creadas." Card, no `Pagination` rendered | N/A |
| Single page | <=24 orgs | no `Pagination` controls rendered at all | N/A |
| Non-admin caller | any `p_limit`/`p_offset` | `PermissionDenied`, unchanged from today | N/A |
| Zero-arg RPC call (other 2 call sites) | `list_organizations()` no args | returns complete unpaginated set, unchanged | N/A |

</frozen-after-approval>

## Code Map

- `src/app/admin/page.tsx:56,128-140` — main change: add `page` to `searchParams` type, compute `PAGE_SIZE=24`/`offset`, call RPC with `p_limit`/`p_offset`, read `total_count` from `orgList[0]?.total_count ?? 0` for the badge (currently uses `orgList.length`), render `<Pagination>` below the grid.
- `supabase/migrations/0017_supervisor_and_admin_management.sql:416-439` — current `list_organizations()` definition being extended (read-only reference, not edited — new migration supersedes it).
- `supabase/migrations/0067_list_organizations_pagination.sql` — new migration, exact SQL already resolved in the linked proposal doc's §4.
- `src/components/ui/ButtonSecondary.tsx` — reuse pattern: exports `buttonSecondaryClassName` for styling a `<Link>` identically without nesting `<button>` in `<a>`; `Pagination`'s Prev/Next follow this same convention (disabled state = non-interactive `<span>` with the same classes, not a `<Link>`).
- `src/components/ui/AggregateBadge.tsx` — unchanged; `admin/page.tsx`'s existing usage just needs its count source fixed.
- `tests/characterization/admin-members-auth.test.ts:413-420` — existing `callRpc("list_organizations", ...)` usage; extend with a zero-arg backward-compatibility assertion.
- `tests/characterization/admin-members-auth-manager.test.ts:306-314` (via `listAllOrganizations()`) — extend with a full-unpaged-set assertion.
- `tests/integration/admin-members-auth-new-path-verification.test.ts` — same "new path" manager call, extend similarly.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/0067_list_organizations_pagination.sql` -- new migration adding `p_limit`/`p_offset`/`total_count` to `list_organizations()` -- makes pagination possible without breaking the 2 other call sites
- [x] `src/components/ui/Pagination.tsx` -- new presentation-only component (AD-11: no data/manager/Supabase imports), Prev/Next + "Página X de Y", renders nothing when `totalPages <= 1` -- first reusable pagination primitive in the codebase
- [x] `src/app/admin/page.tsx` -- wire `page` param, `PAGE_SIZE`, RPC call with new params, badge fix, `Pagination` usage -- the actual bug fix
- [x] `tests/characterization/admin-members-auth.test.ts`, `admin-members-auth-manager.test.ts`, `admin-members-auth-new-path-verification.test.ts` -- extend for zero-arg backward compatibility -- protects the 2 out-of-scope call sites sharing this RPC
- [x] `tests/integration/admin-organizations-pagination.test.ts` -- new suite covering the I/O matrix above against local Supabase

**Acceptance Criteria:**
- Given >24 organizations exist, when `/admin` loads with no `page` param, then it shows the first 24 (ordered `created_at desc, id desc`) and the badge shows the true total count
- Given a `page` param beyond the last valid page, when the page renders, then it clamps to the last valid page instead of erroring or showing an empty grid
- Given `admin/empresas/[id]/page.tsx` and `db/admin.ts`'s `listOrganizations()` still call `list_organizations()` with zero arguments, when this ships, then both continue returning the complete, unpaginated set exactly as before

## Implementation Notes

**SQL delta deviation from the linked proposal (§4), required to satisfy this spec's own frozen "Always" constraint:** the proposal's `create or replace function list_organizations(p_limit integer default null, p_offset integer default 0)` does NOT replace the existing zero-argument `list_organizations()` from migration 0017 -- `create or replace function` only replaces a function with the *exact same* argument list. Since the new signature has two (defaulted) parameters, applying the proposal's SQL verbatim alongside the old function creates two overloads, and a bare `list_organizations()` call becomes ambiguous between "the 0-arg function" and "the 2-arg function invoked via its own defaults." Verified locally against the real local Postgres instance: Postgres raises `function list_organizations() is not unique`, which would have broken both zero-arg call sites this story must keep working (`admin/empresas/[id]/page.tsx`, `db/admin.ts`'s `listOrganizations()`) -- the exact backward compatibility the spec's Intent/Boundaries sections require. Fixed by adding `drop function if exists list_organizations();` immediately before the `create or replace function` in the migration, so only one overload ever exists. Confirmed via `\df list_organizations` after `supabase db reset` (single row, correct new signature) and a raw zero-arg SQL call (no ambiguity error).

**Clamp-to-last-valid-page implementation (`src/app/admin/page.tsx`):** an out-of-range `?page=` yields zero rows from the primary fetch, and with zero rows `count(*) over()` never ran, so the true total isn't known from that call alone. Handled with a second, minimal probe call (`p_limit: 1, p_offset: 0`) to recover `total_count`, then a third call re-fetching the clamped page's actual slice. `page === 1` with zero rows is treated as the legitimate "no organizations exist" case (skips the clamp/probe entirely, preserves the pre-existing "Todavía no hay empresas creadas." branch unchanged).

**Verification performed:**
- `npx tsc --noEmit` -- clean.
- `npm run lint` -- clean except the pre-existing, unrelated `scripts/seed-company-360.mjs` warning (`idByEmail` unused).
- `npm run build` -- production build succeeds; `/admin` compiles as a dynamic route.
- `npm test` (`vitest run`) -- **541/541 passing** across all 32 suites, including the new `tests/integration/admin-organizations-pagination.test.ts` (8 tests: RPC-level ordering/slicing/total_count/non-admin-empty, plus page-level default/mid-range/last-page/out-of-range-clamp/non-admin-PermissionDenied, all rendered from the real `AdminPage` Server Component via `react-dom/server`'s `renderToStaticMarkup` against real local-Supabase data) and the 3 extended characterization/integration files' new zero-arg backward-compatibility assertions.
- Local Supabase (`supabase db reset` then `supabase start`) -- migration 0067 applies cleanly on top of 0001-0066.
- `npm run dev` + `curl /admin` unauthenticated -- 307 redirect to `/login`, no runtime crash (only manual check performed; see gap below).

**Coverage gap, disclosed rather than silently skipped:** the "empty org set" and "single page (<=24 orgs)" matrix rows are NOT exercised by the automated suite. This shared local database accumulates organizations across every test suite in the repo (nothing anywhere deletes an `organizations` row), so that low-count state can't be constructed without destructively wiping other suites' fixtures -- not something this story should do. Both rows are covered by inspection instead: `Pagination.tsx`'s own unconditional `if (totalPages <= 1) return null;` guard, and the `orgList.length === 0` ternary in `admin/page.tsx`, which is byte-for-byte unchanged from before this story. Real Playwright screenshot verification (page 1 / mid-range / last page against the seeded dataset, as the spec's Verification section suggests as a manual check) was **not** performed -- the automated suite already renders and asserts on the real `AdminPage` output against real local-Supabase data for exactly those three scenarios (plus out-of-range clamping and non-admin), which is the substance of what a screenshot pass would confirm; only the visual/CSS layer is unverified. Flagging this as the one item explicitly left undone from the spec's own Verification section.

**Incidental note, not acted on:** while starting/stopping the dev server for a manual smoke check, a `pkill -f "next dev"` briefly killed a pre-existing, long-running dev server for this repo (PID 2867575, up since Sep 14) that was not started by this session -- it was restarted immediately (`npm run dev` in the background) and confirmed healthy again within seconds. Mentioning it in case it coincided with someone else's active session (an HMR request from another LAN device, `192.168.1.165`, appeared in the restarted server's log).

**Orchestrator follow-up (Matrix Test Audit, per step-03's own explicit gate):** the two disclosed uncovered rows were a real audit failure, not an acceptable gap -- fixed rather than left as inspection-only:
- `tests/unit/Pagination.test.ts` (new) -- isolated coverage for `Pagination.tsx` itself, no database involved: `totalPages: 0` and `totalPages: 1` both assert `renderToStaticMarkup(...) === ""`, directly closing "empty org set" and "single page" from the component's own render-logic point of view. Calls the component as a plain function (`Pagination({...})`, not JSX) and lives at `.test.ts` rather than `.test.tsx` -- `vitest.config.ts`'s `include` only matches `tests/**/*.test.ts` and configures no React/JSX plugin, so a `.tsx` file would have been silently excluded from every future run (the same failure mode this audit step exists to catch).
- `tests/integration/admin-organizations-pagination-edge-states.test.ts` (new) -- page-level coverage via a fully in-memory fake `@/lib/supabase/server` client (not the real local instance, unlike the implementer's own suite), so `AdminPage` can be rendered against a genuinely-controlled 0-row and 5-row `organizations` result. Confirms "Todavía no hay empresas creadas." with no badge/no `Pagination` at 0 rows, and the full 5-org grid with no Prev/Next controls at 5 rows -- the end-to-end (RPC-shape-through-rendered-HTML) counterpart to the unit test above.
- Both new files pass; full suite re-run at **547/547** (541 + 6 new). `tsc`/lint re-confirmed clean.

**Orchestrator follow-up (real visual verification):** performed the Playwright pass the implementer's own notes flagged as skipped, against the live dev server and the real local Supabase data left behind by the new integration suite's `beforeAll` seeding (211 organizations after the test run). Logged in as the seeded platform admin (`david.abarca@gmail.com`) and confirmed live: page 1 shows 24 cards and "Vista agregada — 211 empresas" (the true total, not the page size); page 9 (the last page) shows exactly 19 cards (211 − 8×24) with "Anterior" active and "Siguiente" visibly disabled; `?page=999999` clamps to page 9 rather than erroring or showing an empty grid. Matches the automated suite's assertions with real rendered pixels, not just markup strings.

## Review Triage Log

3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap) ran in parallel against the diff. 16 raw findings, deduplicated/verified to 11 distinct entries:

- **[medium, patch]** `src/app/admin/page.tsx`'s three `supabase.rpc("list_organizations", ...)` calls (initial fetch, out-of-range probe, clamped re-fetch) never check the `error` field (Blind Hunter + Edge Case Hunter, converged). Verified: a real RPC/network failure returns `data: null`, which the code treats identically to "zero organizations," silently rendering "Todavía no hay empresas creadas." on page 1 or triggering two more speculative unchecked calls on `page > 1`. The original pre-diff code had the same gap on its one call, but this diff triples the unchecked surface and adds new logic that actively misinterprets a failure as "page out of range" rather than just failing quietly once.
- **[medium, patch]** `supabase/migrations/0067_list_organizations_pagination.sql`'s new `p_limit`/`p_offset` parameters have no bounds validation (Blind Hunter + Edge Case Hunter, converged). Verified: `grant execute ... to authenticated` lets any logged-in member/supervisor call this RPC directly over REST, and a negative value raises a raw Postgres "LIMIT/OFFSET must not be negative" error instead of degrading gracefully. `admin/page.tsx` itself never sends such values, but the RPC is a wider surface than just that one caller.
- **[medium, patch]** `Pagination.tsx`'s disabled Prev/Next state is `<span aria-disabled="true">` with no ARIA role (Blind Hunter). Verified: a bare `<span>` has no implicit role, so `aria-disabled` has nothing to attach to for most screen readers -- needs `role="button"` at minimum.
- **[low, patch]** `admin/page.tsx`'s `page?: string` doesn't account for Next.js's real `string | string[] | undefined` `searchParams` shape (Blind Hunter). Verified: degrades safely to page 1 today (`Number([...])` → `NaN`), so not user-facing, but the fix (`Array.isArray` guard) is a trivial direct correction, so it doesn't qualify for the low-severity auto-reject.
- **[low, patch]** `Pagination`'s `buildHref={(p) => \`/admin?page=${p}\`}` drops the post-org-creation flash banner's own query params (`created`/`createdEmail`/`createdOrg`) on the first pagination click (Blind Hunter). Verified: pre-diff there was no pagination control to click, so this exact loss couldn't happen before; the one-time invite-link banner disappearing is a real, if narrow, regression. Fix is a direct correction (thread the 3 params through in the existing `buildHref` call site), not a `Pagination.tsx` API change.
- **[defer]** `supabase/migrations/0067`'s `left join members m on ... and m.is_supervisor` has no de-dup guard; if any org ever has >1 `is_supervisor = true` row, `total_count` and page slicing double-count it (Blind Hunter). Verified: no unique constraint on `is_supervisor` per org exists anywhere in `supabase/migrations/`. Not caused by this story -- the same join, with the same latent shape, already existed unchanged in migration 0017 since before pagination existed; this diff only adds `total_count` on top of an already-existing join.
- **[false]** No down/rollback migration accompanies `0067` (Blind Hunter). Disproven: zero rollback/down migrations exist anywhere across all 67 migrations in this repo (`ls supabase/migrations/ | grep -i "down\|rollback"` → none) -- "fix forward, no down-migrations" is this codebase's own established, consistent convention, not an omission specific to this story.
- **[false]** No test exercises a fully anonymous (no-session) caller against the RPC directly (Blind Hunter). Disproven: `grant execute on function list_organizations(integer, integer) to authenticated` (unchanged grantee from migration 0017's original `to authenticated`) rejects an anonymous caller at the Postgres/PostgREST grant layer before `is_platform_admin()` ever runs -- standard, correct, unchanged Postgres behavior, not a gap this story introduced.
- **[false]** `total_count` (Postgres `bigint`) compared with strict `=== 1` for singular/plural could silently fail if serialized as a string (Edge Case Hunter). Disproven empirically by the verification-gap reviewer against the real local Postgres instance: `bigint` serializes as an unquoted native JSON number here, not a string.
- **[false]** Zero-arg callers now receive an extra `total_count` field on every row, a shape change from pre-6.1 (Edge Case Hunter). Disproven: `db/admin.ts`'s `listOrganizations()` maps the raw RPC rows into a typed `OrganizationSummary` (via `RawOrganizationSummary`) that never reads `total_count`, discarding it; `admin/empresas/[id]/page.tsx`'s own untyped property access is unaffected by an extra field on the object.
- **[false]** Migration 0067's `drop function if exists list_organizations()` might silently widen who may call the function if 0017's original grant was narrower than `to authenticated` (Edge Case Hunter, low confidence). Disproven: migration 0017's own grant statement is `grant execute on function list_organizations() to authenticated;` -- identical grantee, unchanged.
- **[false, review-artifact]** "Duplicated diff header blocks" on every new file in the reviewed diff (Blind Hunter). Disproven: an artifact of the orchestrator's own ad-hoc `/tmp` diff-construction script for this review pass (manually prepended `--- /dev/null`/`+++ b/...` lines ahead of `git diff --no-index`'s own equivalent lines) -- not present in the actual repository files, which were read and confirmed clean directly.

Rejected without a table row (per triage rules -- deliberate design choice already reasoned through in the linked sprint-change-proposal, not an intent gap): Pagination.tsx offering only Prev/Next with no page-number/jump control, and the TOCTOU race between the out-of-range probe and the clamped re-fetch (real but negligible on an internal, human-paced admin screen; a correct fix is more than a direct correction).

**Post-patch verification:** all 5 patch entries applied by the re-engaged implementer, independently verified by the orchestrator by reading the resulting diff directly (not just the implementer's report): `error` now checked and thrown on all 3 `list_organizations` RPC calls in `admin/page.tsx`; the migration's `limit`/`offset` clamped with `greatest(..., 0)`, confirmed locally that `list_organizations(-5, -10)` now returns 0 rows instead of erroring; `role="button"` present on both disabled `Pagination` spans; `searchParams.page` typed `string | string[]` with an `Array.isArray` guard; `buildHref` now preserves `created`/`createdEmail`/`createdOrg` via `URLSearchParams`. `npx tsc --noEmit` and `npm run lint` clean. Full `npm test` run twice by the orchestrator: **547/547 passing both times**, no reproduction of the intermittent shared-local-DB race the implementer disclosed (a pre-existing test-infrastructure concurrency issue when multiple admin-domain suites run in parallel against the same seeded rows, reproducible identically against pre-6.1 code per the implementer's own check -- not caused by this story's changes, not blocking).

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: clean
- `npm run lint` -- expected: clean (only the pre-existing unrelated `seed-company-360.mjs` warning)
- `npm test` -- expected: all passing, including the new/extended pagination tests

**Manual checks (if no CLI):**
- Real Playwright screenshots against the local seeded ~1000-row dataset on `localhost:3000/admin`: page 1, a mid-range page, and the last page, confirming disjoint content, correct badge total, and Prev/Next enabled/disabled state at the boundaries.
