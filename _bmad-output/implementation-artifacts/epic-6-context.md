# Epic 6 Context: Operational Hardening

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Fixes and hardens gaps discovered through real usage of the already-completed product (Epics 1-4, all done) that were never captured by the original PRD/epics — starting with unbounded list rendering on the platform-admin organizations screen. Unlike Epics 1-5, this epic did not come from the original planning pass; it originated via a `bmad-correct-course` sprint change proposal (`_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-16.md`) after the user found a real bug using the finished app. Stories here are independent and self-contained — there is no fixed cross-story sequencing the way Epics 1-3 or 3-4 had.

## Stories

- Story 6.1: Paginate the Admin Organizations List

## Requirements & Constraints

- The platform-admin "Empresas" list (`/admin`) must render in pages, not all rows at once — today it renders every `organizations` row unbounded via `supabase.rpc("list_organizations")`, which has no `LIMIT`/`OFFSET`.
- Any RPC signature change must be backward-compatible: two other call sites (`admin/empresas/[id]/page.tsx`'s own org lookup, and the unused `adminManager`/`db/admin.ts` layer) call `list_organizations()` with zero arguments today and must keep returning the complete, unpaginated set unchanged.
- The `is_platform_admin()` authorization gate inside the RPC must be preserved exactly — non-admin callers must still get an empty result, never an error and never a fabricated total.
- No pagination UI convention exists anywhere in this codebase yet; this epic originates the first one.

## Technical Decisions

- Pagination strategy is plain offset/limit (not keyset/cursor) — this is a low-volume internal admin screen, not a public high-traffic list, and organizations are rarely deleted. Order by `created_at desc, id desc` (the `id` tiebreaker prevents skipped/duplicated rows across a page boundary when timestamps tie).
- Total count travels alongside each row via `count(*) over()` in the same RPC call, avoiding a second round trip and avoiding two copies of the `is_platform_admin()` predicate that could drift.
- New pagination parameters default to values that exactly reproduce today's unbounded behavior (`p_limit default null` — Postgres treats `LIMIT NULL` as no limit), so unmigrated call sites need no changes.
- Page state lives in the URL (`?page=N`) since these are Server Components with no client-side pagination framework in place — no new client state management is introduced.
- New shared UI primitives for this epic go in `src/components/ui/*` and must stay presentation-only (AD-11): no imports from `@/lib/api/*`, `@/server/managers/*`, or `@/lib/supabase/*`.
- No new feature flag is introduced for pagination work in this epic — these are additive, read-only UI changes with no write-path impact, the same category as Epic 2/4's unflagged pure-restyle stories, not a `db → managers → API` domain migration in the AD-10 sense.
- Completing the still-deferred Story 3.4 delegation (routing `admin/page.tsx`'s reads through `adminManager` instead of calling Supabase directly) is explicitly a separate, later concern — not bundled into this epic's stories.

## Cross-Story Dependencies

None yet — Story 6.1 is self-contained. Two related-but-deferred gaps were identified during Story 6.1's investigation (the same unbounded-list pattern in `admin/empresas/[id]/page.tsx`'s member list and in `dashboard/members/page.tsx`) and are logged as future candidate stories in the sprint change proposal, not yet added to this epic.
