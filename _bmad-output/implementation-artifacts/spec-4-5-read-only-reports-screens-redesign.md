---
title: 'Read-Only Reports Screens Redesign'
type: 'feature'
created: '2026-09-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4f2f1f2'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/app/dashboard/page.tsx` (dashboard home), `src/app/dashboard/mi-mapa/page.tsx`, and `src/app/dashboard/informe-empresa/page.tsx` are the last three screens in the entire app still on pre-redesign styling (plain `bg-black`/`text-gray-*`/`border-gray-300`/`bg-red-50`, zero design tokens). This is Epic 4's final story; once it lands every domain runs on both the new backend layering (Epic 1/3, already fully done) and the new visual identity (Epic 2/4).

**Approach:** All three pages are Server Components with a Story 3.28 flag-gated data-fetching preamble (`USE_NEW_API_REPORTS`) that stays completely untouched — this story only restyles the render tree below it and adds the three explicitly-named State Patterns (dashboard-empty, mi-mapa-first-time, permission-denied) that don't exist in any form today.

**Investigated (not guessed): which dashboard sections are "moments" (`card-accent`) vs. aggregate/plain.** EXPERIENCE.md Component Patterns ("Aggregate-chrome distinction") and Information Architecture ("Dashboard home — open cycles and pending actions as `card-accent` cards") both scope `card-accent` to *this member's own* pending items. Direct read of `dashboard/page.tsx` found 3 distinct list sections: "Ciclos 360 abiertos" (`cyclesToOrganize` — cycles where this member must organize their own evaluators), "Tareas pendientes" (`pendingGroups` report-group invitations awaiting confirm/reject + `pendingInvitations` awaiting a response), and "Mis feedbacks en curso" (`myRequests` — ad-hoc/cycle requests *this member initiated*, now waiting on others). The first two are actions pending *from* this member — literal "moments" per the design language. The third is a personal status/history list, not a pending action for the member themselves, so it gets a plain `Card` list, not `card-accent` — this keeps `card-accent`'s meaning ("something needs you") legible instead of diluting it across every list on the page. The key-dashboard-home.html mock itself mixes `card-accent` and plain `card` in its example grid, consistent with this reading (mocks illustrate, EXPERIENCE.md's text wins on any conflict).

**Investigated (not guessed): the dashboard-empty state's scope.** State Patterns: "a brand-new organization or a lull between cycles shows a single centered `card` ('Todavía no hay ciclos abiertos') with a `button-primary` to start one — not an empty grid." Today neither "Ciclos 360 abiertos" (silently doesn't render when empty) nor "Tareas pendientes" (per-section plain-text empty message) matches this. Decision: when *both* moment sections are empty (`cyclesToOrganize.length === 0` and `pendingGroups.length === 0` and `pendingInvitations.length === 0`), render one centered dashboard-empty `Card` in place of both sections, with `button-primary` linking to `/dashboard/feedback/nueva` — the one request-creation action every account type already has in the existing top action-button row (confirmed by direct read: "Pedir feedback" renders unconditionally; "Pedir feedback 360" is individual-only, so it is not a safe universal default). "Mis feedbacks en curso" is unaffected and keeps its own existing empty copy — that section was never in scope of the AC's "open cycles and pending actions" framing.

**Investigated (not guessed): Mi mapa and Informe empresa get different chrome registers.** Inspiration & Anti-patterns: "Notion → Mi mapa and Informe de grupo use a narrower content measure and skip the card-grid/aggregate-badge chrome entirely." Mi mapa (`mi-mapa/page.tsx`) is this member's own personal data — narrow measure, no `aggregate-badge`, no `card-accent` either (it's a single ongoing view, not a "moment" list). Informe empresa (`informe-empresa/page.tsx`) is explicitly Sofía's aggregate rollup (Key Flows, epics.md AC) — denser grid register, `aggregate-badge` reading "Vista agregada — [N] personas" (exact count precedent: `dashboard/groups/[id]/page.tsx`, `admin/page.tsx`), **never** `card-accent` (explicit Do/Don't and epics.md AC text).

**Investigated (not guessed): Informe empresa's non-supervisor guard must change behavior, not just styling.** epics.md's own Story 4.5 AC: "a non-Supervisor reaching it directly sees the permission-denied state from Story 4.1's pattern." Direct read of current code found `if (!member || !member.is_supervisor) { redirect("/dashboard"); }` — a silent redirect, not a message. This must become the same pattern already used by `dashboard/members/page.tsx` (Story 4.1): keep `redirect("/login")` for the no-user/no-member case (there is genuinely nothing to show), but render `<PermissionDenied message="..." />` instead of redirecting for the "member exists but isn't a supervisor" case.

**Investigated (not guessed): `CompetencyRadar.tsx` stays untouched.** Story 4.2 already added and then fully reverted a draw-in animation on this component after discovering it wasn't rendered by that story's own in-scope page — confirmed via direct read this session that `mi-mapa`/`informe-empresa` are exactly the two (and only) call sites the animation was meant for, but epics.md's Story 4.5 AC and DESIGN.md do not ask for a reveal/draw-in interaction on either of these pages (unlike Story 4.2's report page, which has an explicit reveal gate) — both pages render the radar unconditionally as part of the page's own initial content, there is no gate to animate open. `CompetencyRadar.tsx` is therefore in-scope only if its own SVG needs a token-color pass; direct read shows it already uses a deliberately fixed, semantically-meaningful 5-color palette (`GROUP_COLORS`, explicitly *not* matching `EVALUATOR_CATEGORY_COLORS`, chosen to be maximally distinct from each other) — not swapped for `indigo`/`coral` tokens, since doing so would collapse 5 meaningfully-different role colors into the palette's 2 accent colors. Only its plain `text-gray-500`/`#e5e7eb` chrome (ring strokes, caption text, legend) is a candidate for a token pass; the data-color palette itself is out of scope.

## Boundaries & Constraints

**Always:** Keep every `USE_NEW_API_REPORTS`/`USE_NEW_API_ADMIN_MEMBERS` flag-gated read exactly as-is (both branches) — this is a render-only restyle. Use `PermissionDenied`/`ErrorBanner` (Story 4.1) for their established purposes, never invent new copy patterns for the same states. `card-accent` only for `dashboard/page.tsx`'s own "Ciclos 360 abiertos"/"Tareas pendientes" items. `aggregate-badge` only on `informe-empresa/page.tsx`, reading "Vista agregada — [N] personas". Mobile-first still applies (this app's established default) but these three pages are desktop-leaning per Foundation ("Dashboard home" is not phone-primary like the wizard) — no new mobile-specific interaction is required beyond not breaking at narrow widths.

**Never:** Do not modify `src/server/managers/**`, `src/server/db/**`, any `src/app/api/**` route, or any Server Action. Do not touch `CompetencyRadar.tsx`'s `GROUP_COLORS`/`GROUP_ORDER`/`GROUP_LABELS` data-color values. Do not add `card-accent` to `informe-empresa/page.tsx` or `admin`/aggregate screens (explicit Do/Don't). Do not add a `variant` prop to any Epic 2 primitive. Do not change `dashboard/page.tsx`'s known pre-existing double-title bug in "Mis feedbacks en curso" (logged out-of-scope by Story 4.3) — leave it exactly as today.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dashboard home, cycles + tasks pending | `cyclesToOrganize` and/or `pendingGroups`/`pendingInvitations` non-empty | each item renders as a `card-accent` grid card | N/A |
| Dashboard home, fully quiet | all three empty at once | one centered dashboard-empty `Card` + `button-primary` → `/dashboard/feedback/nueva`, no empty grid | N/A |
| Dashboard home, "Mis feedbacks en curso" empty only | `myRequests` empty, other sections have items | unchanged existing empty copy for that section alone (plain, not dashboard-empty) | N/A |
| Mi mapa, employee with a closed cycle | `hasClosedCycle === true` | narrow-measure content, radar + mention lists, tokenized copy | N/A |
| Mi mapa, zero closed cycles | `hasClosedCycle === false` | mi-mapa-first-time `Card` state instead of the radar | N/A |
| Informe empresa, supervisor, data present | `hasAnyData === true` | denser grid, `aggregate-badge` "Vista agregada — [N] personas", radar, never `card-accent` | N/A |
| Informe empresa, supervisor, no data yet | `hasAnyData === false` | reassuring `Card` empty state (ink/paper-deep, no red) | N/A |
| Informe empresa, non-supervisor member | `member.is_supervisor === false` | `PermissionDenied` message, no redirect | N/A |
| Informe empresa, no member at all | `!member` | unchanged `redirect("/dashboard")` (nothing to show) | N/A |

</frozen-after-approval>

## Code Map

- `src/app/dashboard/page.tsx` -- primary build target: restyle header/action-button row/all 3 sections with tokens; wrap "Ciclos 360 abiertos" + "Tareas pendientes" items in `CardAccent`; add the unified dashboard-empty state; restyle "Mis feedbacks en curso" as plain `Card` list, keeping its own existing empty copy and its known pre-existing double-title bug untouched.
- `src/app/dashboard/mi-mapa/page.tsx` -- token restyle, narrow measure (Notion-style, no card-grid/aggregate-badge chrome); mi-mapa-first-time `Card` state replacing the current plain-text branch.
- `src/app/dashboard/informe-empresa/page.tsx` -- token restyle, denser grid register (Leapsome-style, matching `admin/page.tsx`'s established density); `AggregateBadge` "Vista agregada — [N] personas"; swap the non-supervisor `redirect("/dashboard")` for `PermissionDenied`, keeping the no-member `redirect("/dashboard")` as-is.
- `src/components/CompetencyRadar.tsx` -- chrome-only token pass if needed (ring/axis stroke color, legend/caption text color) -- `GROUP_COLORS`/`GROUP_ORDER`/`GROUP_LABELS` data values stay byte-identical.
- `src/components/ui/CardAccent.tsx`, `AggregateBadge.tsx`, `PermissionDenied.tsx`, `Card.tsx`, `ButtonPrimary.tsx` (`buttonPrimaryClassName`) -- already built; `CardAccent` has zero real call sites today (confirmed by grep), this story is its first wiring-in.
- `_bmad-output/planning-artifacts/ux-designs/ux-brujula-gui-2026-09-11/DESIGN.md` -- `components.card-accent` (~243, ~260 Do/Don't), `components.aggregate-badge` (~251).
- `_bmad-output/planning-artifacts/ux-designs/ux-brujula-gui-2026-09-11/EXPERIENCE.md` -- Information Architecture (~19), Component Patterns (~46), State Patterns (~61-63), Sofía's flow (~133-145), Inspiration & Anti-patterns Notion note (~90).
- `_bmad-output/planning-artifacts/ux-designs/ux-brujula-gui-2026-09-11/mockups/key-dashboard-home.html` -- visual reference for `card-accent`/`aggregate-badge` contrast.
- `_bmad-output/planning-artifacts/epics.md:1098-1122` -- Story 4.5's own AC text.

## Tasks & Acceptance

**Execution:**
- [ ] `src/app/dashboard/page.tsx` -- token restyle; `CardAccent` for "Ciclos 360 abiertos"/"Tareas pendientes" items; unified dashboard-empty state; plain `Card` list for "Mis feedbacks en curso"
- [ ] `src/app/dashboard/mi-mapa/page.tsx` -- token restyle, narrow measure, mi-mapa-first-time state
- [ ] `src/app/dashboard/informe-empresa/page.tsx` -- token restyle, denser grid, `AggregateBadge`, `PermissionDenied` for non-supervisor
- [ ] `src/components/CompetencyRadar.tsx` -- chrome-only token pass if the review finds it necessary

**Acceptance Criteria:**
- Given Story 3.30 has landed, when the dashboard home is restyled, then open cycles and pending actions render as `card-accent` "moment" cards, and a brand-new/quiet dashboard shows the dashboard-empty state instead of an empty grid
- Given Mi mapa, when an employee has zero closed 360s, then the mi-mapa-first-time state appears instead of an empty radar
- Given Informe empresa, when rendered, then it uses the denser aggregate grid with `aggregate-badge`, never `card-accent` -- and a non-Supervisor reaching it directly sees the permission-denied state from Story 4.1's pattern
- Given all five stories in this epic are complete, when verified together, then every domain runs on both the new backend layering and the new visual identity

## Implementation Notes

- `src/app/dashboard/page.tsx` -- token restyle throughout; "Ciclos 360 abiertos"/"Tareas pendientes" items render as `CardAccent` grid cards (eyebrow/title/meta), "Mis feedbacks en curso" as a plain `Card` list (its own empty copy and the known pre-existing double-title bug, e.g. "Ciclo 360 Ciclo 360 — ...", left byte-for-byte untouched, per Boundaries). New unified dashboard-empty state (`isDashboardEmpty` = `cyclesToOrganize`/`pendingGroups`/`pendingInvitations` all empty) renders a centered `Card` with the headline + `ButtonPrimary` CTA to `/dashboard/feedback/nueva`.
- `src/app/dashboard/mi-mapa/page.tsx` -- narrow measure (`max-w-xl`), token restyle, mi-mapa-first-time `Card` state (exact EXPERIENCE.md copy) replacing the old plain-text branch. Mention-delta +/- numbers changed from `text-green-600`/`text-red-600` to neutral `text-ink` -- not explicitly named in the spec's Code Map, but DESIGN.md's Do's/Don'ts explicitly forbids red/green as a value signal anywhere, "including future chart types," so this was carried through even though the spec didn't call this line out by name.
- `src/app/dashboard/informe-empresa/page.tsx` -- token restyle, denser `max-w-4xl` register matching `admin/page.tsx`; `AggregateBadge` "Vista agregada — N personas"; the non-supervisor branch now returns `PermissionDenied` in place (no redirect) while the no-member branch keeps its existing `redirect("/dashboard")`.
- `src/components/CompetencyRadar.tsx` -- chrome-only token pass (ring/axis stroke, caption/legend text); `GROUP_COLORS`/`GROUP_ORDER`/`GROUP_LABELS` data values stayed byte-identical throughout, including after the review patch.

**Verified (implementer, real Playwright screenshots against local Supabase data):** dashboard-empty, mi-mapa-first-time, the populated aggregate radar with `AggregateBadge`, `CardAccent` "moment" cards for open cycles and pending tasks, the mixed/partial-empty case (one section populated, the other still showing its own per-section empty copy), and the non-supervisor `PermissionDenied` render (URL unchanged, confirmed no redirect) -- all matched the frozen Intent and I/O matrix.

**Independently re-verified by the orchestrator** (direct diff read, `tsc`/lint/`npm test` rerun, and 6 fresh Playwright screenshots across 3 real demo accounts spanning all three pages and both the dashboard-empty and populated states) before dispatching review.

## Review Triage Log

3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap) ran in parallel against the pre-patch diff. Findings, triaged:

**Fixed (real, converged across 2 lenses):**
- Informe empresa's `AggregateBadge` headcount (`activeMemberCount`) could render a misleading "Vista agregada — 0 personas" on a query error (Edge Case Hunter), and the underlying metric itself counts *all active org members*, not specifically the people whose feedback crossed the reveal threshold and is actually represented in the radar (Blind Hunter, tracing `get_organization_competency_summary()`'s `eligible_requests` CTE, `supabase/migrations/0054_expose_role_in_competency_reports.sql:107-117`, which deliberately never exposes subject-level identity -- an anonymity/threshold property of that RPC, not an oversight). **Disposition:** fixed the null-collapse (badge is now omitted entirely, never fabricates "0", when the count query errors); the deeper metric-precision gap is accepted and documented in-code as a scope limitation -- computing the exact "people represented" figure would require new backend surface, out of bounds for this UI-only story's Boundaries (never modify `src/server/managers/**`/`src/server/db/**`/`src/app/api/**`).

**Fixed (real, single-lens):**
- `CompetencyRadar.tsx`'s token-color pass was incomplete: `#9ca3af` (average-profile line) and `#111827` (self-evaluation overlay line + dot, a real per-person data series) were left as hardcoded hex, producing a dark-mode contrast bug against the app's real `prefers-color-scheme: dark` overrides (Edge Case Hunter). Converted to `var(--ink-soft)`/`var(--ink)` respectively.
- `dashboard/page.tsx`'s dashboard-empty Card showed a second sentence ("En cuanto tengas un ciclo 360 abierto o alguien te pida feedback, aparecerá aquí") that directly contradicted a populated "Mis feedbacks en curso" list rendered right below it whenever `myRequests` was non-empty but the three "moment" collections were empty (Blind Hunter). The frozen spec's own decision to exclude `myRequests` from `isDashboardEmpty` was kept unchanged; instead the contradictory sentence was removed, leaving only the literal EXPERIENCE.md-quoted headline + CTA, which is accurate regardless of `myRequests`' state.
- `CardAccent`'s interactive children ("Organizar evaluadores", "Confirmar"/"Rechazar", "Responder") had no `focus-visible` override, unlike every other component on a solid indigo/coral fill (Blind Hunter, citing DESIGN.md's Accessibility Floor). Added the same `focus-visible:outline-paper-deep` class string `ButtonPrimary`/`ButtonSecondary`/`RevealButton` already use.
- Minor weakened assertion (Verification Gap): a dropped eyebrow-adjacency check in one existing test, defensible (the old concatenated string genuinely can't appear once eyebrow/title became separate DOM elements) but left no direct replacement. Not independently re-patched -- superseded by Fix 5's broader new-coverage pass in the same file.

**Fixed (test-coverage gaps, real, both single- and multi-lens):**
- Zero test coverage anywhere in `tests/` for three headline spec ACs: the `PermissionDenied` swap on `informe-empresa/page.tsx` for a non-supervisor (Verification Gap), the `AggregateBadge` count/pluralization text (Verification Gap), and `mi-mapa/page.tsx`'s `hasClosedCycle === false` first-time branch (Verification Gap). Added 4 new tests to `tests/integration/read-only-reports-thin-delegate.test.ts`, reusing that file's existing fake-Supabase-client pattern -- required extending the shared fixture (`resolveFrom`/`makeQueryBuilder`) to thread through `select(col, {count, head})` options, since the real `activeMemberCount` query previously collided (same `selectArg === "id"`) with mi-mapa's own member-row lookup and always silently resolved to a null count in tests.

**Not a defect (checked, confirmed correct):**
- The mention-delta green/red → `text-ink` change (flagged as a "possible regression, not spec-covered either way" by Verification Gap) is in fact the *correct* fix, not a regression -- DESIGN.md explicitly states "Scores and agreement never use red/green" and "Don't introduce red or green anywhere as a value signal, including in future chart types."
- `isDashboardEmpty`'s flag-parity (Edge Case Hunter task 1: no divergence between `USE_NEW_API_REPORTS` on/off), pluralization boundaries 0/1/2 (Edge Case Hunter task 3), the dashboard-empty CTA's reachability for every account type (Edge Case Hunter task 5, traced every migration setting `auth_user_id` on a member -- no deactivation path exists anywhere), the mixed/partial-empty JSX structure (Edge Case Hunter task 6), the `PermissionDenied` ordering (no data leak before the check, Blind Hunter), and the `htmlNew === htmlOld` flag-parity assertion counts in both modified test files (unchanged, Verification Gap) were all independently checked and found correct -- no action taken.

**Post-patch verification:** `npx tsc --noEmit` clean, `npm run lint` clean (1 pre-existing unrelated warning), `npm test` 525 → 529 passing. Zero files under `src/server/managers/**`, `src/server/db/**`, `src/app/api/**`, or any Server Action touched at any point in this story. Orchestrator independently re-verified the post-patch diff and reran the full test suite before finalizing.

