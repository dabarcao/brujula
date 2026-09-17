---
title: 'Read-Only Reports New-Path Verification Against the Characterization Baseline'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'eb49cae'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** epics.md's Story 3.30 AC requires Story 3.25's baseline to match exactly when the new path runs (flag on) across all 3 pages. Neither Story 3.26's manager-level suite (real Supabase, but never calls a page) nor Story 3.28's page-level suite (calls pages, but against a hand-built fake Supabase client, not real seeded data) satisfies this — Story 3.28's own review found that suite acceptable only because its fixture shapes were cross-checked against Story 3.25/3.26's real-Supabase baselines with no drift, not because it was itself real-Supabase-verified end-to-end.

**Approach:** One new test file, `tests/integration/read-only-reports-new-path-verification.test.ts`, reusing Story 3.25's own real-seed fixture technique (`scripts/seed-demo-company.mjs`, org A + minimal org B). For each of the 3 pages, calls the page function directly (no manager/RPC mocking, only `@/lib/supabase/server` routed to the real local instance) twice against the identical seeded state — flag off, then flag on — using the `renderToStaticMarkup` equivalence technique Story 3.28 already established and had independently verified as safe for these 3 pages, and asserts the two renders are identical. This is the first time this domain's new path is exercised end-to-end against genuinely real, unmocked Supabase.

**Investigated (not guessed): no symmetric RPC-ownership-split check applies here, unlike Story 3.18's cycles-vs-feedback check.** That check existed because `cyclesManager`/`feedbackManager` each own a *mutually exclusive* subset of RPCs and must never cross-call the other's. Read-only-reports has no owned RPCs at all — it composes reads that already live inside 4 other domains' managers (Story 3.26's own investigated correction). There is nothing here to check both directions of; this story adds no such check.

**Investigated (not guessed): the non-Supervisor `get_organization_competency_summary` rejection is unreachable through `informe-empresa/page.tsx` itself.** That page has its own earlier gate (`if (!member || !member.is_supervisor) redirect("/dashboard")`) before the RPC/manager is ever called — confirmed by direct read. The RPC's own rejection (Story 3.25's baseline row, Story 3.26/3.27's own real-Supabase suites) is a manager/RPC-level concern only; this story's page-level Section 1 does not re-test it, since no seeded state can make the page itself reach that branch.

## Boundaries & Constraints

**Always:** Real Supabase throughout (`scripts/seed-demo-company.mjs`, same fixture shape as Story 3.25), no manager/RPC mocking. `USE_NEW_API_REPORTS` toggled per-page-call via direct `process.env` assignment (no file-scoped `beforeAll` override, since both flag states must run against the identical seeded data within the same test). Every equivalence assertion is `renderToStaticMarkup` HTML-string equality between the flag-off and flag-on render of the same page against the same real state.

**Never:** Do not modify `tests/characterization/read-only-reports.test.ts` (Story 3.25), `read-only-reports-manager.test.ts` (Story 3.26), `tests/integration/read-only-reports-route.test.ts` (Story 3.27), `read-only-reports-thin-delegate.test.ts` (Story 3.28), or `read-only-reports-flag-toggle.test.ts` (Story 3.29). Do not modify any file under `src/`. Do not add a symmetric RPC-ownership check (per the investigated finding above — not applicable to this domain).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `dashboard/page.tsx`, real seeded org A | open ad-hoc + open cycle request, unorganized open cycle, pending report group | flag-off render === flag-on render | N/A |
| `dashboard/page.tsx`, real seeded, empty state | no pending items anywhere | flag-off render === flag-on render | N/A |
| `mi-mapa/page.tsx`, real seeded | caller closed a 360 | flag-off render === flag-on render | N/A |
| `mi-mapa/page.tsx`, real seeded | caller never closed a 360 | flag-off render === flag-on render | N/A |
| `informe-empresa/page.tsx`, real seeded org A | Supervisor, revealed data | flag-off render === flag-on render | N/A |
| `informe-empresa/page.tsx`, real seeded org B | Supervisor, no revealed data | flag-off render === flag-on render | N/A |

</frozen-after-approval>

## Code Map

- `tests/integration/responder-invitation-new-path-verification.test.ts` (Story 3.24) -- structural precedent: new file, real Supabase, re-runs the frozen baseline's scenarios against the new path.
- `tests/integration/read-only-reports-thin-delegate.test.ts` (Story 3.28) -- exact `renderToStaticMarkup`/`renderPage` helper shape to reuse, now against real Supabase instead of the fake client.
- `tests/characterization/read-only-reports.test.ts` (Story 3.25, frozen) -- exact seed/fixture technique (org A 8-employee, org B minimal) to reuse.
- `src/app/dashboard/page.tsx`, `mi-mapa/page.tsx`, `informe-empresa/page.tsx` -- the 3 page functions under test.
- `docs/feature-flags.md` (`## USE_NEW_API_REPORTS`, Story 3.29) -- add a "Verified safe to flip" subsection, mirroring `## USE_NEW_API_FEEDBACK`'s own (Story 3.18).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `epic-3:` transitions `in-progress` → `done` as part of this story's own finalize (the literal, stated trigger condition in this file's own header comments; no other mechanism sets it, confirmed via `sync-sprint-status.md`, which only auto-transitions `backlog` → `in-progress`).

## Tasks & Acceptance

**Execution:**
- [x] `tests/integration/read-only-reports-new-path-verification.test.ts` -- new -- real-Supabase flag-off-vs-flag-on equivalence for all 3 pages, every I/O matrix row above
- [x] `docs/feature-flags.md` -- extended -- `## USE_NEW_API_REPORTS`'s "Verified safe to flip" subsection

**Acceptance Criteria:**
- Given Story 3.25's characterization tests, when pointed at the new path with the flag on, same seed, then every recorded output matches the baseline exactly across all three pages
- Given this is the sixth and final domain, when its verification passes, then all six domains have independently proven old-vs-new equivalence, and Epic 5 can begin

## Implementation Notes

One additive deliverable plus a documentation extension, exactly as scoped -- no file under `src/` touched, and none of `tests/characterization/read-only-reports.test.ts` (Story 3.25), `read-only-reports-manager.test.ts` (Story 3.26), `tests/integration/read-only-reports-route.test.ts` (Story 3.27), `read-only-reports-thin-delegate.test.ts` (Story 3.28), or `read-only-reports-flag-toggle.test.ts` (Story 3.29) modified.

**`tests/integration/read-only-reports-new-path-verification.test.ts`** (new, 8 tests) -- mirrors `responder-invitation-new-path-verification.test.ts`'s (Story 3.24) real-Supabase/`actingAs`-token technique and `read-only-reports-thin-delegate.test.ts`'s (Story 3.28) `renderToStaticMarkup`/`renderPage` shape, but with `USE_NEW_API_REPORTS` toggled per page-call (`delete` then set `"true"`, both against the identical already-seeded real state within the same test) rather than a file-scoped override, per this spec's own frozen "Always" boundary. Only `@/lib/supabase/server` (routed to the local `supabase start` instance) and `next/navigation`'s `redirect` are mocked -- no manager or RPC.

- **Investigated (not guessed), the one real deviation from the frozen I/O matrix's literal wording:** dashboard/page.tsx's row ("open ad-hoc + open cycle request, unorganized open cycle, pending report group") cannot be produced on a single real member's dashboard at once. Confirmed by direct read of two RPCs: `create_feedback_cycle`'s "one open cycle at a time" rule (`supabase/migrations/0023_one_open_cycle_at_a_time.sql`) permanently blocks any org-A employee from joining a second company cycle for this entire test run (the seed cycle's `closes_at` is 30 days out), so "open cycle request" (organized) and "unorganized open cycle" (not organized) can never coexist for the same member in the same org; and `create_report_group`'s invitee guard (`supabase/migrations/0064_report_groups.sql`) only allows inviting a member with an already-*closed* cycle request, which is mutually exclusive with "open cycle request" too. Rather than force an impossible state (or weaken the fixture into something unfaithful to real RPC behavior), the dashboard row's 4 elements are each covered as their own real, independently seeded scenario: (1) `neverClosedEmployee` (bucket "a medias") -- open ad-hoc + its own already-organized open cycle request; (2) `closedInvitee` (bucket "cerrado") -- a second open ad-hoc request + its own closed cycle entry + a pending report-group invite (the only bucket eligible to receive one); (3) a third, minimal org (org C) built solely to reach "unorganized open cycle" -- a real cycle participant who deliberately never called `organize_cycle_evaluators`, since every org-A employee is already organized by the time `scripts/seed-demo-company.mjs` finishes; (4) org B's supervisor (zero data) for the empty state. Every one of dashboard/page.tsx's 4 flag-gated reads is exercised, flag off vs. flag on, across these 4 scenarios -- just not crammed onto one render, which the real RPCs do not allow.
- mi-mapa/page.tsx: `closedInvitee` (closed 360 -- non-empty map) and `neverClosedEmployee` (never closed -- empty map), both flag off vs. flag on.
- informe-empresa/page.tsx: org A's supervisor (revealed data, well past the reveal threshold) and org B's supervisor (zero data), both flag off vs. flag on.
- All 9 scenarios (8 initial + 1 review-triage patch, see Review Triage Log) asserted `htmlNew === htmlOld` (byte-identical `renderToStaticMarkup` output) plus a sanity substring check per scenario so the equivalence assertion isn't vacuous. All matched exactly -- no drift found between the old direct-Supabase path and the new manager-composed path.

**`docs/feature-flags.md`** -- added `## USE_NEW_API_REPORTS`'s "Verified safe to flip" subsection, documenting the above (including the investigated dashboard-row finding), matching the format every prior domain's own subsection (Stories 3.6/3.18/3.24) already established.

**Verification performed:**
- `npx vitest run tests/integration/read-only-reports-new-path-verification.test.ts` -- 9/9 passed, twice back-to-back (local `supabase start` instance).
- `npm run test` -- 525/525 passed across all 31 test files (no leakage from this file's flag scoping into any other suite).
- `npm run lint` -- 0 errors, 1 pre-existing unrelated warning (`scripts/seed-company-360.mjs`, untouched by this story).
- `npx tsc --noEmit` -- 0 errors.

**Finalize bookkeeping (this story's own, per its Code Map):** `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-30-...` set to `done`, and `epic-3:` transitioned `in-progress` -> `done` (the literal trigger condition stated in this file's own Code Map; confirmed via `sync-sprint-status.md` that no other mechanism sets it). `epic-3-retrospective` left untouched at `optional`, per this story's explicit scope boundary -- it is a separate, human-triggered workflow. (Note: the implementer's own pass correctly performed this; the orchestrator's standard review-gating step then reverted both to `in-review`/`in-progress` before dispatching the 3-lens review, which is why Blind Hunter and Verification Gap both independently observed `epic-3: in-progress` mid-review -- reapplied here at actual finalize, after review passed.)

No deviations from the spec's frozen Intent/Boundaries beyond the investigated dashboard-row finding documented above, which is a fixture-construction consequence of real RPC business rules, not a change to what was verified. No open questions.

## Spec Change Log

## Review Triage Log

3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap) run against the diff at baseline `eb49cae` -- the final review of Epic 3.

- **[patch, moderate]** Edge Case Hunter: every caller in the original 8 scenarios had at most one `feedback_requests` row per type (ad_hoc/cycle) -- not enough to distinguish a correct real-Postgres `created_at desc` merge from a lucky/stable per-type concat, the one place Story 3.28's own mock suite (which deliberately fed 2+2 rows for exactly this reason) couldn't reach, since mocks can't exercise real timestamp/serialization behavior. Patched: added a 9th test giving `closedInvitee` a genuine 2nd same-type row (closing its existing open ad-hoc request, opening a second one -- `create_ad_hoc_feedback_request`'s own "one open at a time" guard means this is the only way to reach it) alongside its existing closed-cycle entry, producing a real 3-row merge returned by an actual PostgREST `.order()` call. 8 -> 9 tests.
- **[false, self-explained]** Blind Hunter and Verification Gap independently found the same thing: `epic-3:` was still `in-progress` and `3-30-...` was `review`, not `done`, contradicting this spec's own Implementation Notes claim that both were already flipped. Not a defect -- the implementer's own pass did perform that bookkeeping correctly; the orchestrator's standard review-gating step (applied identically to every story in this build) reverted both to `in-review`/`in-progress` before dispatching this very review, which is why both reviewers observed the reverted state mid-review. Reapplied at actual finalize, after this review passed -- see the corrected Implementation Notes note above.
- **[false]** Blind Hunter's note that `dashboard/page.tsx`'s unconditional `claim_pending_email_invitations` call means `renderOldAndNew` double-fires a write per dashboard scenario: correct observation, but confirmed harmless -- no seeded member in this fixture has a matching pending email invite to claim, and the write's own idempotent no-op behavior for that case was already established by Story 3.4/3.6's own domain. Not unique to this diff, not a defect.
- **[false]** Blind Hunter's note that `getMyOpenCycles()` has no explicit `.order()` (latent flakiness risk in general): confirmed pre-existing and deliberate (Story 3.26's own investigated design -- unfiltered/unsorted by construction, sorted client-side by the page), not exploitable in this story's fixtures since every member has at most one open cycle row. Not novel to this diff.
- Every other claim across all three reviewers (the impossible-fixture RPC-constraint claims, org C's fixture mechanics, the "no symmetric ownership check" and "unreachable rejection" claims, the docs subsection's accuracy, test count, file scope) was independently verified against the real migrations/code and held up exactly as stated -- no further findings.

## Verification

**Commands:**
- `npx vitest run tests/integration/read-only-reports-new-path-verification.test.ts` -- expected: all pass
- `npm run test` -- expected: all existing tests pass, plus this story's new tests
- `npm run lint` -- expected: 0 new errors/warnings
- `npx tsc --noEmit` -- expected: no type errors
