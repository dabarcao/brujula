---
title: 'Read-Only Reports Feature Flag and Rollback Safety'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '8ce1e20'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.28 already built `USE_NEW_API_REPORTS` across all 3 pages, but `docs/feature-flags.md`/`.env.example` don't mention it, and nothing proves the literal-`"false"`-string case (vs. merely unset) as a permanent regression.

**Approach:** Three additive deliverables, mirroring Story 3.17/3.23's exact shape, no changes to any existing page/manager/route file's logic: (1) a new, small, permanent test file proving the flag-routing mechanism itself (which path is taken) across all three flag states — `"true"`, unset, and the literal string `"false"` — for all 3 pages; (2) a new `## USE_NEW_API_REPORTS` section in `docs/feature-flags.md`; (3) add `USE_NEW_API_REPORTS=false` to `.env.example`.

**Investigated (not guessed): unlike responder/invitation, this domain needs no NEW automated page-routing test to close a coverage gap — Story 3.28 already built one.** Story 3.23's own review found its original claim ("Server Component pages can't be automated-tested") was wrong and had to retroactively patch in `DashboardPage()`-style direct-call tests. Story 3.28's `tests/integration/read-only-reports-thin-delegate.test.ts` already uses that exact technique for all 3 of this domain's pages (18 tests, including explicit manager-call-count assertions proving routing, not just output equivalence) — confirmed by direct read. The one genuine gap: that suite always sets the flag to `"true"` or deletes it (unset) — it never sets the literal string `"false"`, the one distinct state Story 3.17/3.23's own dedicated flag-toggle files always spot-check separately (`"false"` must behave identically to unset, not as a falsy-but-still-truthy string).

**Investigated (not guessed): this domain carries no cross-domain sequencing gate like responder/invitation's.** epics.md's own Story 3.29 AC frames this as "this low-risk domain still gets the same rollback safety as every other domain, for consistency" — a materially different framing from responder/invitation's explicit "the most cautious rollout... does not go first under any circumstance" (Story 3.23/3.24's own AC text). Story 3.30's own AC frames read-only-reports only as "the sixth and final domain" (a build-order/completeness fact — it's built last because it composes the other 5 domains' managers, which must exist first) with no stated requirement that its flag itself must wait for the other domains' flags to each survive a full production cycle. No such gate is invented here; this section states the real prerequisite (this domain's own manager functions, Stories 3.26/3.27, already exist and are tested) rather than an unstated one.

## Boundaries & Constraints

**Always:**
- The new toggle test spies on all 4 managers this domain calls (`feedbackManager`/`cyclesManager`/`reportGroupsManager`/`membersManager`) via `vi.mock`, to prove *which path was taken* for each of the 3 pages, not business-logic correctness (already covered by Story 3.28).
- Explicitly covers 3 flag states per page: `"true"` (manager called, no direct Supabase RPC/table call for this domain's reads), unset (old path runs), and literal `"false"` (same as unset).
- `docs/feature-flags.md`'s new section follows the exact subsection order every prior entry uses (Domain/Default/Where it's checked/New path/Old path/Regression test, then Manual QA checklist/Rollback procedure/Deletion eligibility) — no "Verified safe to flip" subsection (Story 3.30's job, once it lands).
- `.env.example`'s new entry matches every prior entry's comment style (default, where checked, activation literal, pointer to `docs/feature-flags.md`).

**Never:**
- Do not modify any existing logic in `src/app/dashboard/page.tsx`, `mi-mapa/page.tsx`, `informe-empresa/page.tsx`, any `src/server/managers/*.ts`, `src/server/db/*.ts`, or any `src/app/api/**` route — additive-only.
- Do not set `USE_NEW_API_REPORTS=true` anywhere in committed code, config, or `.env.example`'s own default.
- Do not touch `tests/integration/read-only-reports-thin-delegate.test.ts` or any `tests/characterization/read-only-reports*.test.ts` — additive-only, new file.
- Do not attempt deep old-vs-new business-logic equivalence testing beyond the routing check — already Story 3.28's scope, and Story 3.30's job to re-verify against the frozen baseline.
- Do not delete the old code path or write rollback tooling that executes deletion — Epic 5's job.
- Do not add a "Verified safe to flip" subsection — Story 3.30's job, once it lands.
- Do not invent a cross-domain sequencing gate epics.md doesn't state (per the investigated finding above).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `dashboard/page.tsx`, flag `"true"` | env var set | this domain's 4 managers called; no direct Supabase RPC/table call for the 4 flag-gated reads | N/A |
| `dashboard/page.tsx`, flag unset | env var absent | old path runs; managers not called | N/A |
| `dashboard/page.tsx`, flag `"false"` (string) | env var literally `"false"` | same as unset — old path runs | N/A |
| `mi-mapa/page.tsx`, same 3 flag states | — | `feedbackManager.getMyCompetencyMap` called only when `"true"` | N/A |
| `informe-empresa/page.tsx`, same 3 flag states | — | `membersManager.getOrganizationCompetencySummary` called only when `"true"` | N/A |

</frozen-after-approval>

## Code Map

- `tests/integration/responder-invitation-flag-toggle.test.ts` (Story 3.23) -- exact technique to mirror: `vi.hoisted` manager mocks, hoisted fake `@/lib/supabase/server` client with a `calls` log, `next/navigation` redirect-throws-a-marker mock, flag set/cleared per-test.
- `tests/integration/read-only-reports-thin-delegate.test.ts` (Story 3.28) -- already-existing, more thorough equivalence suite for all 3 pages; this story's new file is narrower (routing-only, 3 flag states) and separate, not a replacement.
- `src/app/dashboard/page.tsx`, `mi-mapa/page.tsx`, `informe-empresa/page.tsx` -- read-only reference for the exact `process.env.USE_NEW_API_REPORTS === "true"` check sites Story 3.28 added.
- `docs/feature-flags.md:351` (`## USE_NEW_API_RESPONDER`, Story 3.23) -- exact structure/subsection order to append after (new section becomes the 5th, following Responder's).
- `.env.example:84` (`USE_NEW_API_RESPONDER=false`, Story 3.23) -- exact comment style to mirror.
- `epics.md` Story 3.29/3.30 ACs -- the "low-risk... for consistency" / "sixth and final domain" framing this story's docs section quotes, per the investigated sequencing finding above.

## Tasks & Acceptance

**Execution:**
- [x] `tests/integration/read-only-reports-flag-toggle.test.ts` -- new -- proves flag routing for all 3 pages, 3 flag states each
- [x] `docs/feature-flags.md` -- extended -- new `## USE_NEW_API_REPORTS` section
- [x] `.env.example` -- extended -- `USE_NEW_API_REPORTS=false`

**Acceptance Criteria:**
- Given the flag is off, when any user views these pages, then the old direct-Supabase path runs unchanged
- Given the flag is on, when the same pages render, then the new composed path runs instead, checked only in the thin caller
- Given `docs/feature-flags.md` and `.env.example`, when read, then no instance sets or defaults the flag to `true`

## Implementation Notes

## Spec Change Log

## Review Triage Log

3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap) run against the diff at baseline `8ce1e20`.

- **[patch, medium]** Edge Case Hunter: `dashboard/page.tsx` has a 4th independent flag-check site (`myCycleRequests`/`cycleRequestByCycleId`, no manager call of its own -- reuses `newPathCycleRequests` on the new path) that the original 3 dashboard tests only covered via an aggregate `.some((c) => c.startsWith("from:feedback_requests:"))` check shared with the unrelated `myRequests` read's own old-path select. A bug isolated to just this one site (e.g. its own flag check accidentally hardcoded to `true`) could pass all 9 tests undetected. Patched: replaced the aggregate check with two precise per-select assertions (`"from:feedback_requests:id, created_at, request_type, status, name, feedback_cycles(name)"` vs. `"from:feedback_requests:id, cycle_id"`) in all 3 dashboard tests. Verified the fix actually catches the described regression: temporarily hardcoded the line-322 flag check to `true`, confirmed the "flag unset"/"flag false" tests then fail (2/9), reverted, re-confirmed 9/9 clean.
- **[false]** Blind Hunter, Verification Gap: no findings on the docs cross-references, manual QA checklist accuracy, "where it's checked" counts, or the "no cross-domain sequencing gate" central claim -- every checked assertion held up against direct inspection of the real code and `epics.md`'s actual AC text.
- **[false]** Edge Case Hunter's own findings #2-4 (unset/false code-path-identical duplication, mock-leakage risk, no error-redirect branch in this domain): each explicitly assessed by the reviewer itself as by-design, theoretical/low-risk, or already covered elsewhere -- not raised as fixable gaps.

## Verification

**Commands run (2026-09-15):**
- `npx vitest run tests/integration/read-only-reports-flag-toggle.test.ts` -- 9/9 passed (3 pages x 3 flag states)
- `npx vitest run tests/integration/read-only-reports-thin-delegate.test.ts` -- 18/18 passed, unmodified (file untouched, confirmed via `git status`/`git diff --stat`)
- `npm run test` -- 516/516 passed across 30 files (full suite, includes both files above)
- `npm run lint` -- 0 errors, 1 warning (pre-existing, unrelated: `scripts/seed-company-360.mjs:128`) -- 0 new
- `npx tsc --noEmit` -- no type errors
- Repo-wide grep for `USE_NEW_API_REPORTS=true` -- no committed `.env*`/config/CI file sets it to `true`; the only hits are prose in `docs/feature-flags.md` (manual QA/rollback instructions, same pattern as the other 4 flags) and this spec's own frozen text.
