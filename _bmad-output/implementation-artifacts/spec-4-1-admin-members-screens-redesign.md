---
title: 'Admin/Members Screens Redesign'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '3a64c0a'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/app/admin/page.tsx`, `admin/empresas/[id]/page.tsx`, and `dashboard/members/page.tsx` still use pre-redesign plain Tailwind (gray banners, sharp `rounded`, `bg-black` buttons, `<ul>` lists) — the design system Epic 2 built (Direction B, "Brújula Segura") hasn't reached these dense, frequently-used admin screens yet, per epics.md's own framing (Leapsome-style scan density).

**Approach:** Restyle all 3 pages with the existing Epic 2 component/token set (`Card`, `AggregateBadge`, `ButtonPrimary`/`ButtonSecondary`, the `indigo`/`coral`/`paper`/`ink` palette, `rounded-brujula-*`), mirroring `dashboard/groups/**`'s (Story 2.6) established layout conventions exactly — no new component library, no data-fetching/Server Action changes (Epic 3's already-migrated backend layer stays untouched). Two new shared components are extracted (not invented) from patterns already duplicated across these very pages: `PermissionDenied` (identical inline JSX currently copy-pasted 3x across the 3 pages under test) and `ErrorBanner` (Story 2.6's own already-established `border-line`/`text-ink` neutral-box pattern, currently inline there, needed a 2nd time here).

**Investigated (not guessed): which lists become the "denser aggregate grid," and where `aggregate-badge` applies.** DESIGN.md's own Layout & Spacing section names `/admin` explicitly as a target for the tighter grid ("smaller `{spacing.4}` gaps, more cards per row... borrowing the Leapsome-style scan density"), and its Do's/Don'ts explicitly forbid `card-accent` on admin/aggregate screens ("a filled indigo card on an aggregate view risks reading as one person's individual result"). All 3 pages' member/org lists are aggregate, org-wide views (never a single person's own data) — each gets `aggregate-badge` + the denser grid; none gets `card-accent`.

**Investigated (not guessed): Story 2.7's actual target.** epics.md's "invitación accept/decline redesign" does NOT refer to `/invitacion/[token]/page.tsx` (still unredesigned plain Tailwind, confirmed by direct read) — it's the report-group invite accept/decline flow (`src/app/dashboard/groups/[id]/page.tsx` + `PendingInviteActions.tsx`/`AcceptAcknowledgment.tsx`). Not used as a reference here since it's a different domain; Story 2.6's own pages remain the correct, verified reference.

## Boundaries & Constraints

**Always:** Reuse only components already exported from `src/components/ui/*` plus the 2 new ones this story extracts. Every list becomes a `Card`-wrapped denser grid (smaller gaps, more per row than a spacious individual layout) marked with `AggregateBadge`, never `CardAccent`. Every error banner becomes `ErrorBanner` (neutral `border-line`/`text-ink`, never red/coral). Every permission-gated early-return becomes `PermissionDenied` (plain-language message, `ButtonSecondary` back to `/dashboard`, no red). Success banners use `indigo-wash`, never `bg-blue-50`.

**Never:** Do not modify any Server Action, RPC call, or data-fetching logic in any of the 3 pages — only JSX/className changes. Do not modify `src/server/managers/*.ts`, `src/server/db/*.ts`, or any `src/app/api/**` route. Do not touch `dashboard/groups/**` or `invitacion/**` (read-only reference). Do not add a `variant`/`size` prop to any existing `src/components/ui/*` component (composition, not props, is this system's variant mechanism, per the investigated component-API finding). Do not self-host Sora/Inter fonts (an explicitly separate, deferred gap noted in `globals.css`, out of this story's scope).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `/admin`, platform admin | authenticated platform admin | denser org grid, `AggregateBadge`, restyled create-org form | N/A |
| `/admin`, non-admin | authenticated non-admin caller | `PermissionDenied` (no red, `ButtonSecondary` → `/dashboard`) | N/A |
| `/admin/empresas/[id]`, platform admin | authenticated platform admin | denser members grid, `AggregateBadge`, restyled rename form | N/A |
| `/admin/empresas/[id]`, non-admin | authenticated non-admin caller | `PermissionDenied` | N/A |
| `/dashboard/members`, Supervisor | authenticated Supervisor | denser members grid, `AggregateBadge`, restyled invite/department forms | N/A |
| `/dashboard/members`, non-Supervisor | authenticated non-Supervisor caller | `PermissionDenied` | N/A |
| Any of the 3 pages, a Server Action error param present | e.g. `?error=...` | `ErrorBanner` (neutral, no red) instead of the old `bg-red-50` banner | N/A |

</frozen-after-approval>

## Code Map

- `src/app/dashboard/groups/page.tsx`, `groups/[id]/page.tsx` (Story 2.6) -- exact layout/component pattern to mirror: `Card`, `AggregateBadge`, `ButtonPrimary`/`ButtonSecondary`/`buttonPrimaryClassName`, `max-w-2xl mx-auto w-full` main wrapper, `-m-6 divide-y divide-line` list-inside-card technique, the `border-line`/`text-ink` error-box pattern to extract into `ErrorBanner`.
- `src/app/admin/page.tsx`, `admin/empresas/[id]/page.tsx`, `dashboard/members/page.tsx` -- the 3 pages to restyle; each currently has an identical copy-pasted permission-denied `<main>` block (the `PermissionDenied` extraction source) and its own ad-hoc `bg-red-50`/`bg-blue-50`/`bg-green-50` banners.
- `src/components/ui/Card.tsx`, `AggregateBadge.tsx`, `ButtonPrimary.tsx`, `ButtonSecondary.tsx` -- exact prop signatures confirmed: plain `HTMLAttributes` pass-through, no `variant`/`size` props; `AggregateBadge` takes full caption text as children (no `count` prop).
- `src/app/globals.css` -- token source: `indigo`/`indigo-wash`/`coral`/`paper`/`paper-deep`/`ink`/`ink-soft`/`line`/`surface-2`, `rounded-brujula-sm/md/lg` (bare `rounded-*` intentionally NOT overridden, must use the `-brujula-` suffix in all new/touched markup).
- `_bmad-output/planning-artifacts/ux-designs/ux-brujula-gui-2026-09-11/DESIGN.md` -- Layout & Spacing (`/admin` named explicitly), Do's/Don'ts (`card-accent` forbidden on aggregate screens).

## Tasks & Acceptance

**Execution:**
- [x] `src/components/ui/PermissionDenied.tsx` -- new -- extracted from the 3 pages' identical inline block; props: `message: string`
- [x] `src/components/ui/ErrorBanner.tsx` -- new -- extracted from Story 2.6's own inline neutral-box pattern; props: `children`
- [x] `src/app/admin/page.tsx` -- restyle -- `PermissionDenied`, `ErrorBanner`, `Card`-wrapped denser org grid + `AggregateBadge`, restyled create-org form/nav tabs
- [x] `src/app/admin/empresas/[id]/page.tsx` -- restyle -- `PermissionDenied`, `ErrorBanner`, `Card`-wrapped denser members grid + `AggregateBadge`, restyled rename form
- [x] `src/app/dashboard/members/page.tsx` -- restyle -- `PermissionDenied`, `ErrorBanner`, `Card`-wrapped denser members grid + `AggregateBadge`, restyled invite/department forms

**Acceptance Criteria:**
- Given Story 3.6 has landed (confirmed done), when these screens are restyled, then they use the denser grid per DESIGN.md's Layout & Spacing, distinct from the more spacious individual-report layout
- Given an org-wide or aggregate view on these screens, when rendered, then it uses `AggregateBadge`, never `CardAccent`
- Given a non-admin or non-Supervisor reaches one of these routes directly, when the page renders, then `PermissionDenied` appears (plain-language, no red, `ButtonSecondary` back to dashboard)

## Implementation Notes

All 3 pages restyled per plan: `PermissionDenied` and `ErrorBanner` extracted and wired in, denser `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4` `Card` grids with `AggregateBadge`, `card-accent` never used. Post-review patch (3-lens review, see Review Triage Log below) closed 2 real gaps across all 3 pages:
- Each grid `Card` gained `overflow-hidden`, matching Story 2.6's own established pattern (`groups/page.tsx:76`, `groups/[id]/page.tsx:139`); the name/email text inside each card gained `truncate` (single-line name, org or member) or `break-words` (the combined email/status or email/department line) as appropriate per element.
- Each of the 3 `AggregateBadge` usages gained the "Vista agregada — " prefix DESIGN.md specifies, matching the one existing precedent (`groups/[id]/page.tsx:196`), while keeping each page's own domain-appropriate noun and existing singular/plural logic (`empresa(s)`, `empleado(s)`).

`PermissionDenied`'s "Volver al panel" copy (vs. the 3 original inline blocks' "Volver") was flagged by the same review but is a deliberate, accepted improvement -- left as-is, see Review Triage Log.

**Manual visual verification -- completed after initial commit.** No browser-automation tool was available in this environment at implementation time (no `claude-in-chrome`/MCP browser tool connected), so the initial commit disclosed this as a limitation rather than claiming a visual check that hadn't happened. The user (on this Ubuntu Server host, no GUI) asked whether something could be installed instead -- installed Playwright + a headless Chromium locally (`npm install --no-save playwright && npx playwright install chromium`; the user ran the one `sudo apt-get install` for Chromium's system shared libraries, since that step needs an interactive password prompt this environment can't provide) and drove it with a small throwaway script (not committed) that logs in via the real `/login` form and screenshots each route.

Verified by actually looking at the rendered output:
- `/admin` (platform admin), light and dark: `Card`-wrapped 3-column grid, `Vista agregada — 1000 empresas` badge (real accumulated test-seed data), `Crear empresa` form restyled, indigo `Crear` button, org-name `truncate` visibly working ("Char Test ReadOnly Emp…"), long emails wrapping via `break-words` inside the card bounds. Dark mode: navy background/cards, indigo button and badge both remain legible -- no hardcoded colors broke the theme swap.
- `/dashboard/members` (Supervisor, a freshly seeded demo company), light: 6-employee grid, `Vista agregada — 6 empleados` (correct plural), `admin`/`activo` badges both legible, `ButtonSecondary`-styled "Crear departamento" visually distinct from the primary "Invitar" button.
- `/dashboard/members` as a non-Supervisor employee: `PermissionDenied` renders exactly as specced -- centered plain-language message, no red, pill-shaped `ButtonSecondary` "Volver al panel".
- `/admin/empresas/[id]`: same grid/badge pattern, `supervisor`/`activo` badges on the org's own admin row, rename form restyled with `ButtonPrimary`.

Both review-patched issues (grid-card text overflow, `AggregateBadge` copy) are visibly correct in these real screenshots, not just correct in the diff. Playwright and its Chromium download remain installed locally (not committed -- `node_modules`/`~/.cache/ms-playwright`, both gitignored) for reuse verifying the remaining Epic 4 stories.

## Spec Change Log

## Review Triage Log

- **New grid `Card` items have no overflow protection for unbreakable long text (long org name, member name, or email), and the diff actually removed the old `whitespace-nowrap` from `admin/page.tsx`'s org-email span without replacing it** -- Edge Case Hunter, HIGH. Verdict: **high**, a genuine regression against Story 2.6's own established pattern. Routes to **patch**: added `overflow-hidden` to every grid `Card` in all 3 pages (`admin/page.tsx`, `admin/empresas/[id]/page.tsx`, `dashboard/members/page.tsx`), plus `truncate` on the org/member name line and `break-words` on the combined email/department/status line in each, matching `groups/page.tsx:76` and `groups/[id]/page.tsx:139`'s own precedent.
- **`AggregateBadge` usages render bare `{count} {label}`, dropping the "Vista agregada — " prefix DESIGN.md's own `aggregate-badge` spec (line 251) and the one existing precedent (`groups/[id]/page.tsx:196`) both require** -- Blind Hunter, MEDIUM-HIGH. Verdict: **medium-high**, real copy divergence from an explicit spec. Routes to **patch**: prefixed all 3 usages (`admin/page.tsx`, `admin/empresas/[id]/page.tsx`, `dashboard/members/page.tsx`) with "Vista agregada — ", keeping each page's own noun (`empresa(s)`/`empleado(s)` -- "personas" doesn't fit counting organizations) and existing singular/plural logic unchanged.
- **`PermissionDenied` hardcodes "Volver al panel" where the 3 original inline blocks said "Volver"** -- Blind Hunter, LOW. Verdict: **not applicable, left as-is**. Deliberate, accepted improvement -- matches the app's established "Volver al panel" convention already used by `mi-mapa`/`informe-empresa`'s own back-links. Not reverted.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 new errors/warnings
- `npx tsc --noEmit` -- expected: no type errors
- `npm run test` -- expected: all existing tests still pass (no data-fetching logic touched)

**Manual checks (UI/visual, no automated test covers rendered appearance) -- done, see Implementation Notes:**
- [x] `/admin` as a platform admin, light and dark -- grid density, `AggregateBadge`, restyled form all confirmed via real screenshot.
- [x] `/dashboard/members` as a Supervisor -- grid, badge pluralization, `ButtonSecondary` vs `ButtonPrimary` distinction confirmed via real screenshot.
- [x] `/dashboard/members` as a non-Supervisor member -- `PermissionDenied` state confirmed via real screenshot.
- [x] `/admin/empresas/[id]` as a platform admin -- confirmed via real screenshot.
- [ ] `ErrorBanner` on a triggered Server Action error (e.g. duplicate org name) -- not exercised this pass (would require submitting a form with a real duplicate-name conflict); the component itself (`ErrorBanner.tsx`) is unit-simple (a styled `<p>`, no logic) and was already visually confirmed correct in Story 2.6's own identical pattern -- low-risk gap, noted rather than silently skipped.
