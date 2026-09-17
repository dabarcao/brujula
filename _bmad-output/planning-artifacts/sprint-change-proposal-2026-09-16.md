---
title: 'Sprint Change Proposal: Paginate the Admin Organizations List'
type: 'course-correction'
created: '2026-09-16'
status: 'approved'
mode: 'batch'
scope: 'minor'
---

# Sprint Change Proposal — 2026-09-16

## 1. Issue Summary

**Trigger:** reported directly by the product owner while using the already-completed, already-redesigned app (Epics 1–4 all `done`), not by any test or story in flight. There is no single "triggering story" — the gap was never covered by any of the 53 originally-planned stories.

**Problem statement:** the platform-admin "Empresas" screen (`/admin`) renders **every** organization in the database at once, with no pagination, no limit, and no way to view the list in pages. `src/app/admin/page.tsx:56` calls `supabase.rpc("list_organizations")` — a zero-argument RPC with no `LIMIT`/`OFFSET` in its SQL (`supabase/migrations/0017_supervisor_and_admin_management.sql:416-439`) — and `.map()`s the full result into a card grid (`page.tsx:140`), including an "Vista agregada — N empresas" badge that displays the unbounded count.

**Evidence:** the local database currently holds exactly 1,000 `organizations` rows (confirmed via REST count query). Name analysis shows this is test/fixture data from repeated integration-test runs (`Char Test …`, `Route Test …`, `New Path Verif …`, matching `tests/integration/*-flag-toggle.test.ts` naming) plus `"Individual de Prueba"` × 416 and manual UI-verification fixtures from this session — not organic production growth. That distinction matters for urgency (nothing is broken in production today) but not for validity: the code has no ceiling at all, so the same failure mode will reproduce with real customer data once the platform has real usage.

**Issue category:** technical limitation discovered post-implementation — specifically, a scalability requirement that was never captured anywhere in the original PRD, epics, or architecture spine for this screen. It is not a misunderstanding of a stated requirement (none existed) and not a stakeholder pivot.

## 2. Impact Analysis

### Epic impact

- **Epic 3** (`admin/members` backend migration, Stories 3.1–3.6, all `done`) built a manager/db layer for this domain (`adminManager.listAllOrganizations()` → `db/admin.ts` `listOrganizations()`) that already exists but was **never wired to `admin/page.tsx`** — the page still calls Supabase directly for this one read, unlike the write actions in `src/app/actions/admin.ts` which are flag-gated behind `USE_NEW_API_ADMIN_MEMBERS`. This is a **pre-existing, separate gap** (an incomplete Story 3.4 delegation), not something this proposal needs to close — see §4, Recommended Approach.
- **Epic 4** (`Admin/Members Screens Redesign`, Story 4.1, `done`) restyled this exact page visually but never touched its data-fetching shape, because pagination was out of scope for a pure-UI redesign story and was not yet a known problem.
- Neither Epic 3 nor Epic 4 needs to be reopened. Both were completed correctly against their original, narrower scope.
- **No existing epic is a thematic fit** for this kind of change: Epic 3 = backend domain migrations (closed), Epic 4 = UI redesign (closed), Epic 5 = legacy-path retirement (not yet started, unrelated). **Recommendation: create a new Epic 6** to hold this story and give a documented home to the two related-but-out-of-scope follow-ups identified during investigation (see §4).
- Epic 5 is unaffected: its own gating condition (each domain's flag surviving one production cycle) is independent of this fix and needs no resequencing.

### Story impact

One new story, `Story 6.1`, fully specified below (§4). No existing story text changes.

### Artifact conflicts

- **PRD:** no conflict. This is an implementation-level fix; it doesn't touch stated product goals, MVP scope, or any FR/NFR.
- **Architecture (ARCHITECTURE-SPINE.md):** no AD needs to change. The new RPC signature is additive and backward-compatible (`p_limit`/`p_offset` both default to values that reproduce today's exact unbounded behavior for the two other call sites). AD-11 ("shared UI primitives are presentation-only") directly governs the new `Pagination` component and is followed, not amended.
- **UX (DESIGN.md/EXPERIENCE.md):** no existing pagination pattern is defined anywhere in either document — this story originates one. Worth a follow-up note to whoever next touches DESIGN.md to fold the resulting `Pagination` component into the documented component inventory, but that documentation update is not blocking this story.
- **Other artifacts:** one new Postgres migration (`supabase/migrations/0067_list_organizations_pagination.sql`), one new test suite, `epics.md` and `sprint-status.yaml` updated per this proposal.

### Technical impact

Fully resolved already (via dedicated investigation this session — two Explore agents plus one Plan agent) and captured in full in §4. Summary: offset/limit pagination (not keyset — this is a low-volume internal admin screen, not a public high-traffic list), a backward-compatible RPC signature change, a new reusable `Pagination` UI component, URL-driven page state (no client framework needed), page size 24, no new feature flag.

## 3. Recommended Approach

**Option 1 — Direct Adjustment (add one new story) — SELECTED.**

- Option 2 (rollback) is not viable/not applicable: there is nothing to revert. Epics 1–4 were built correctly against their scope; the gap is an omission, not a defect in what was built.
- Option 3 (MVP/PRD review) is not applicable: this does not touch MVP scope or product goals.
- Option 1 is directly viable: the fix is additive, isolated to one Server Component and one RPC, has zero write-path impact, and a complete technical design already exists.

**Effort estimate:** Low (one new migration, one new small component, one page's data-fetching logic, one new test file plus two extended characterization tests).
**Risk level:** Low (additive, backward-compatible RPC signature verified against both other call sites; no flag needed since there's no old-path/new-path coexistence to manage; the only production-critical invariant — `is_platform_admin()` gating — is preserved verbatim in the SQL delta).
**Timeline impact:** none on Epic 5 or any other in-flight work; this is a net-new, self-contained story.

## 4. Detailed Change Proposals

### New Epic

```
## Epic 6: Operational Hardening

Fixes and hardens gaps discovered through real usage of the already-completed
product (Epics 1-4) that were never captured by the original PRD/epics —
starting with unbounded list rendering. Each story here is independent and
self-contained; there is no fixed sequencing between them, unlike Epics 1-5.
```

### New Story (appended under Epic 6)

```
### Story 6.1: Paginate the Admin Organizations List

As a platform admin,
I want the "Empresas" list on /admin to load in pages instead of rendering
every organization at once,
So that the screen stays fast and usable as the platform's real organization
count grows, instead of degrading unboundedly like it does today.

**Acceptance Criteria:**

**Given** the `list_organizations` RPC is extended with `p_limit`/`p_offset`
parameters (both optional, defaulting to today's unbounded behavior)
**When** `/admin` is requested with no `?page=` param
**Then** it shows the first 24 organizations, ordered by `created_at desc, id
desc`, with a "Vista agregada — N empresas" badge showing the true total
count (not the current page's size)

**Given** more than 24 organizations exist
**When** the admin uses the Prev/Next controls
**Then** the page navigates via `?page=N` (Server Component, no client
state), each page shows a disjoint, correctly-ordered slice, and Prev/Next
disable correctly at the first/last page

**Given** `?page=` is set to a value beyond the last valid page
**When** the page renders
**Then** it clamps to the last valid page rather than 500ing or silently
rendering an empty grid

**Given** zero organizations exist, or a non-admin reaches the route
**When** the page renders
**Then** the existing empty/permission-denied states are unchanged, and the
new `Pagination` component renders nothing rather than "Página 1 de 0"

**Given** `admin/empresas/[id]/page.tsx` and `db/admin.ts`'s
`listOrganizations()` still call the RPC with zero arguments (out of scope
for this story)
**When** this story ships
**Then** both continue returning the complete, unpaginated set exactly as
before — verified by an explicit regression test, since they share the same
RPC being modified
```

### SQL delta (new migration, next number after `0066_report_group_avg_of_avgs.sql`)

`supabase/migrations/0067_list_organizations_pagination.sql`:

```sql
create or replace function list_organizations(
  p_limit integer default null,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  created_at timestamptz,
  supervisor_email text,
  supervisor_status text,
  total_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    o.id,
    o.name,
    o.created_at,
    m.email,
    m.status,
    count(*) over() as total_count
  from organizations o
  left join members m on m.organization_id = o.id and m.is_supervisor
  where is_platform_admin()
  order by o.created_at desc, o.id desc
  limit p_limit
  offset coalesce(p_offset, 0);
$$;

grant execute on function list_organizations(integer, integer) to authenticated;
```

`p_limit default null` → Postgres treats `LIMIT NULL` as "no limit," so a zero-argument call (as `admin/empresas/[id]/page.tsx:51` and `db/admin.ts:50` still make) is byte-identical to today's behavior. `where is_platform_admin()` stays in its original position, filtering rows before the window function runs, so a non-admin caller still gets zero rows, not an error and not a `total_count: 0` phantom row.

### Explicitly out of scope for Story 6.1 (documented here so they aren't lost, not built now)

- `src/app/admin/empresas/[id]/page.tsx:56-59` — `list_organization_members` via `membersManager.listMembers`, same unbounded-list shape. Candidate for a future **Story 6.2**, reusing the same `Pagination` component and SQL pattern.
- `src/app/dashboard/members/page.tsx:60,176` — org-scoped member list, same shape, lower priority (an org's own member count is naturally small). Candidate **Story 6.3** if it ever becomes a real problem.
- `admin/empresas/[id]/page.tsx:51-54` currently fetches the *entire* organizations list just to `.find()` one by id — a separate, pre-existing inefficiency this story's pagination doesn't fix (and would make relatively more wasteful, though not incorrect). Flagged for whoever picks up that page: add a dedicated `get_organization_by_id` RPC instead of relying on `list_organizations` there at all.
- Completing the Story 3.4 delegation (routing `admin/page.tsx` through `adminManager` instead of calling Supabase directly) is a **separate architectural decision** — it would reopen whether the read path should also live behind `USE_NEW_API_ADMIN_MEMBERS`, per AD-10's "one domain, one flag" rule. Deliberately not bundled into Story 6.1. Left as a one-line pointer comment in `db/admin.ts` near the existing Story 3.4 note, for whoever eventually picks that up.

## 5. Implementation Handoff

**Scope classification: Minor** — implemented directly, no backlog reorganization and no PM/Architect escalation needed. The full technical design (offset/limit rationale, exact SQL, component shape, page size, test plan) is already resolved and captured above and in this session's own working plan file.

**Routed to:** Developer agent (this session, continuing directly via `bmad-method:bmad-build` against `sprint-status.yaml`'s `6-1-paginate-admin-organizations-list` entry), following the same Plan → Implement → 3-lens Review → Finalize cadence used for every other story this session.

**Success criteria:** `tsc`/lint clean; full test suite green including the new pagination suite and the two extended characterization tests; live Playwright verification against the local seeded 1,000-row dataset showing correct paging, an accurate total-count badge, and unchanged behavior on `admin/empresas/[id]`.
