---
title: 'Cycles Screens Redesign'
type: 'feature'
created: '2026-09-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2e47e79'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/dashboard/cycles/**` and the report view they lead to still use pre-redesign plain Tailwind, and the report's "reveal" moment — the product's most emotionally loaded interaction — has no reveal-gate at all today: once a report crosses its threshold, the full radar/narrative renders unconditionally on page load.

**Approach:** Build the reveal-gate/threshold-not-met/axis-draw-in interaction fresh (none of it exists yet), restyle every `/dashboard/cycles/**` page plus the shared report page with Epic 2's design system, using `RevealButton` (already built, zero call sites yet) and `RoleBadge`'s shape conventions (already built, zero call sites yet).

**Investigated (not guessed): the report view is ONE shared file serving both cycle and ad-hoc requests, not two.** `src/app/dashboard/feedback/[id]/page.tsx` (592 lines) branches internally on `isCycle = request.request_type === "cycle"` throughout — confirmed by direct read. Story 4.3's own AC ("feedback screens... reuse the same reveal-gate... established in Story 4.2 — not a divergent reimplementation") means this file's *existing* branching already does that reuse; Story 4.2 must build the reveal-gate/threshold/draw-in mechanism correctly for **both** branches now, not just the `isCycle` one, or Story 4.3 would have nothing finished to verify. Story 4.3's own remaining scope narrows to `saboteador-bar` styling on the `!isCycle` self-evaluation report (a separate, already-existing component) plus final confirmation — not rebuilding what this story already covers.

**Investigated (not guessed): the evaluator-category "violet-family" color decision already exists — in a different file than the obvious one.** `src/components/EvaluatorPicker.tsx` (used to *assign* a category when organizing evaluators) is an unstyled `<select>`, not chips, and has no color at all — checking only that file would wrongly conclude no violet decision exists. The real target is `src/components/CompetencyComparisonChart.tsx`'s **report-viewing** toggle chips (tap to show/hide a category's line on the chart) plus `src/lib/evaluatorCategories.ts`'s `EVALUATOR_CATEGORY_COLORS` — 4 already-defined violet hex values (`#4c1d95`→`#ddd6fe`), with an explicit code comment recording the deliberate single-hue decision ("antes eran 4 colores de familias distintas, que competían... con los 5 colores de GROUP_COLORS"). This story restyles the chips' *shape* to match `RoleBadge`'s conventions (`rounded-full`, `font-caption text-caption`) — the 4 hex values and their inline-style application stay exactly as-is, per both the AC and EXPERIENCE.md's own explicit "this redesign does not touch that decision, only its shape/radius."

**Investigated (not guessed): the axis draw-in animation needs no client-side JS.** `CompetencyRadar.tsx` is a Server Component (no `"use client"`, confirmed). The ~60ms-stagger draw-in is achievable as pure CSS (`animation-delay` per axis, keyframe opacity/stroke-dashoffset), which runs simply by virtue of the SVG mounting after the parent's reveal-state flips — no need to convert it to a Client Component. Only the reveal toggle itself (collapsed vs. expanded) needs `useState`, isolated to a small Client Component wrapper around the existing Server Component content.

## Boundaries & Constraints

**Always:** `RevealButton` (already built) gates rendering only — data is already server-fetched for the account owner, no loading spinner on reveal. Threshold-not-met copy uses `indigo-wash`, never gray/red. The collapse/expand boundary is the *only* content gate on the report page — nothing else about layout changes on reveal. Axis draw-in respects `prefers-reduced-motion` (CSS media query, instant full-opacity fallback, content never gated behind motion). Evaluator-category chips keep their exact 4 existing hex values and inline-style coloring mechanism — only shape/typography changes.

**Never:** Do not modify any Server Action, RPC call, or data-fetching logic (`src/app/actions/{feedback,cycles}.ts`, `src/server/managers/*.ts`, `src/server/db/*.ts` all stay untouched — Epic 3's migration is done and out of this story's scope). Do not add a `variant` prop to `RoleBadge`/`RevealButton`/any other `src/components/ui/*` component. Do not touch `EVALUATOR_CATEGORY_COLORS`'s hex values. Do not build a real `role-badge` reuse for the evaluator-category chips (its `role` prop is a closed 5-value union incompatible with 4 violet tones) — restyle the chips' own markup to match its shape conventions instead.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Report below threshold (either domain) | `revealed: false` | threshold-not-met state, reassuring `indigo-wash` copy, never gray/red | N/A |
| Report crosses threshold, first open | `revealed: true`, local state unset | collapsed summary (headline strength + one growth area) only, `RevealButton` visible | N/A |
| User taps reveal | click | radar's 5 sectors draw in sequentially (~60ms stagger), exact-values table fades in after | N/A |
| User taps reveal, `prefers-reduced-motion` | OS setting on | instant full-opacity, no stagger, content still fully shown | N/A |
| Comparison chart evaluator-category chips | cycle report, multiple evaluator categories present | `role-badge`-shaped pills, same 4 violet hex values, tap toggles chart line visibility | N/A |
| `/dashboard/cycles/[id]`, organizing evaluators | Supervisor mid-organization | restyled `EvaluatorPicker` (tokens only, still a `<select>` for assignment) | N/A |

</frozen-after-approval>

## Code Map

- `src/components/ui/RevealButton.tsx` -- already built, zero call sites; `forwardRef` over native `<button>`, fixed `bg-coral-deep`/`rounded-full`/`shadow-floating` styling, plain `children`.
- `src/components/ui/RoleBadge.tsx` -- already built, zero call sites; shape reference only (`rounded-full font-caption text-caption`) — do not import/reuse directly for evaluator-category chips (closed `role` union).
- `src/app/dashboard/feedback/[id]/page.tsx` -- the shared report page (both `isCycle`/`!isCycle`); threshold-not-met copy ~lines 514-535 (token swap to `indigo-wash`), revealed rendering ~lines 580-586 (needs the new reveal-gate wrapper), `isCycle` branch ~336-387.
- `src/components/CompetencyComparisonChart.tsx:330-360` -- evaluator-category toggle chips (`toggleCategory`, `CATEGORY_COLORS`) — shape-only restyle.
- `src/lib/evaluatorCategories.ts` -- `EVALUATOR_CATEGORY_COLORS` (4 violet hexes, unchanged), `EVALUATOR_CATEGORY_LABELS`.
- `src/components/CompetencyRadar.tsx` -- Server Component, add CSS-only axis draw-in (keyframes + `animation-delay`, `prefers-reduced-motion` media query).
- `src/app/dashboard/cycles/page.tsx`, `cycles/nueva/page.tsx`, `cycles/[id]/page.tsx`, `cycles/[id]/estado/page.tsx` -- general token/`Card`/`Button` restyle, same conventions Story 4.1 established.
- `src/components/EvaluatorPicker.tsx` -- token-only restyle (`border-line`/`text-ink` etc.), shape unchanged (stays a `<select>`, not chips — a data-entry field, distinct from the report-viewing toggle chips above).
- `src/app/globals.css` -- `coral-deep`, `shadow-floating`, `indigo-wash`, `font-caption`/`text-caption` token source.
- `_bmad-output/planning-artifacts/ux-designs/ux-brujula-gui-2026-09-11/EXPERIENCE.md` -- reveal-gate mechanic (line ~43), collapsed/expanded spec (~60), axis draw-in (~68, ~112), evaluator-category chip decision (~45).

## Tasks & Acceptance

**Execution:**
- [ ] `src/app/dashboard/feedback/[id]/page.tsx` -- build reveal-gate (collapsed summary + `RevealButton`, small Client Component wrapper for the toggle state), restyle threshold-not-met to `indigo-wash`, general token/`Card` restyle for both `isCycle`/`!isCycle` branches
- [ ] `src/components/CompetencyRadar.tsx` -- add CSS-only axis draw-in animation with `prefers-reduced-motion` fallback
- [ ] `src/components/CompetencyComparisonChart.tsx` -- restyle evaluator-category chips to `role-badge` shape, hex values unchanged
- [ ] `src/app/dashboard/cycles/page.tsx`, `cycles/nueva/page.tsx`, `cycles/[id]/page.tsx`, `cycles/[id]/estado/page.tsx` -- general restyle
- [ ] `src/components/EvaluatorPicker.tsx` -- token-only restyle

**Acceptance Criteria:**
- Given Story 3.12 has landed (confirmed done), when these screens are restyled, then the evaluator-category toggle chips use the `role-badge` shape without changing the existing single-hue violet-family color decision
- Given a cycle report hasn't crossed its threshold, when viewed, then the threshold-not-met state appears (reassuring progress copy, never error-styled)
- Given a cycle report has crossed its threshold, when first opened, then it shows the collapsed summary only — radar/exact-values table render only after `RevealButton` is tapped, never on page load
- Given the user taps reveal, when the radar renders, then its five sectors draw in sequentially (~60ms stagger), respecting `prefers-reduced-motion` with an instant full-opacity fallback

## Implementation Notes

**Post-review patch (3-lens review, see Review Triage Log):**
- `src/app/dashboard/feedback/[id]/page.tsx` -- `<RevealGate>` now takes `key={id}`, so React remounts it (fresh `opened: false`) on every client-side navigation between report ids instead of reconciling the same instance and carrying a previously-revealed report's open state into a different, not-yet-revealed one.
- `src/components/CompetencyRadar.tsx` -- reverted byte-for-byte to its pre-Story-4.2 state (`git diff 2e47e79 --` now empty for this file). The axis draw-in animation was out of this story's scope: this file's chart is used only by `mi-mapa`/`informe-empresa` (Story 4.5, not yet built, no reveal-gate), never by this story's own report page (`feedback/[id]/page.tsx`, which renders `CompetencyComparisonChart` instead and only imports `GROUP_COLORS`/`GROUP_LABELS` from this file). `CompetencyComparisonChart.tsx`'s own draw-in animation is untouched -- that one is correctly in-scope.
- `src/components/CompetencyComparisonChart.tsx` -- evaluator-category chips no longer render the category hex as text color, in either active or inactive state. Text now uses `text-ink` (active, `font-semibold`) / `text-ink-soft` (inactive) -- the design-token colors already AA-safe against neutral backgrounds in both themes. The hex is now reserved for the dot indicator, a new `border` (`${color}66` active / `${color}33` inactive), and the existing background tint (`${color}33`/`${color}14`, unchanged). `EVALUATOR_CATEGORY_COLORS`'s 4 hex values are untouched. Computed contrast (WCAG relative-luminance formula, alpha-blended tint over `--paper`) for all 4 hexes x both states x both themes ranges 4.95:1-14.01:1 -- all clear the 4.5:1 AA floor, worst case light-theme/`other`/inactive at 4.95:1.
- `src/components/CompetencyComparisonChart.tsx` -- exact-values table (below the chips) converted from leftover pre-redesign classes (`border`, `rounded`, `bg-gray-50`, `text-gray-500`, `divide-y`, `text-gray-700`) to this story's tokens (`border-line`, `rounded-brujula-sm`, `bg-surface-2`, `text-ink-soft`, `divide-line`, `text-ink`), matching how `EvaluatorPicker.tsx` and this same page already style equivalent bordered tables.

## Spec Change Log

## Review Triage Log

- **`RevealGate.tsx` uses `useState(false)` for `opened` with no identity tied to the report id; `page.tsx` renders `<RevealGate>` at a fixed tree position with no `key`, and there's no `loading.tsx`/`template.tsx` under `dashboard` to force-unmount on navigation -- a client-side nav from an already-revealed report A to a not-yet-revealed report B reconciles the same component instance, so report B's radar/table render immediately, skipping the collapsed summary and `RevealButton`** -- Edge Case Hunter, HIGH confidence, real production bug. Verdict: **high**, real and matches this story's own "collapse/expand boundary is the only content gate" constraint being silently bypassed. Routes to **patch**: added `key={id}` to `<RevealGate>` so React remounts (resets `opened` to `false`) on every report-id change. Re-verified visually via Playwright nav-between-two-reports script (see Verification).
- **`CompetencyRadar.tsx`'s new draw-in animation is out of this story's scope -- `feedback/[id]/page.tsx` (this story's actual report page) never renders `CompetencyRadar`, only imports `GROUP_COLORS`/`GROUP_LABELS` from it; the real chart on that page is `CompetencyComparisonChart`. `CompetencyRadar`'s chart is used only by `mi-mapa`/`informe-empresa` (Story 4.5, not yet built), neither reveal-gated, neither in this story's own Verification checklist -- as shipped, the animation fires unconditionally on every plain page load of those two unrelated pages** -- Edge Case Hunter + Blind Hunter, converged, MEDIUM-HIGH confidence. Verdict: **medium-high**, real scope leak. Routes to **patch**: reverted `CompetencyRadar.tsx` to its exact pre-Story-4.2 state (`git diff 2e47e79 -- src/components/CompetencyRadar.tsx` now empty); `CompetencyComparisonChart.tsx`'s animation and the `brujula-axis-in` keyframe in `globals.css` both left untouched (in-scope, still used).
- **Evaluator-category chips render colored TEXT (`color: category hex`) directly on an alpha-tinted background of the same hex; computed contrast for the 2 lightest of the 4 fixed hexes (`#ddd6fe`, `#a78bfa`) is ~1.3:1 and ~2.3-2.5:1 against their own tinted backgrounds, failing even the 3:1 UI-text floor. Before this story only the active state had colored text (narrower, pre-existing issue); this story's restyle extended colored text to the inactive state too, widening the exposure** -- Blind Hunter, HIGH confidence, real accessibility bug. Verdict: **high**, real and WCAG AA-failing as shipped. Routes to **patch**: chip text now uses `text-ink`/`text-ink-soft` tokens instead of the category hex, for both states; hex reserved for dot/border/background only. Verified by computing relative-luminance contrast for all 4 `EVALUATOR_CATEGORY_COLORS` hexes x active/inactive x light/dark theme -- all 16 combinations clear 4.5:1 AA (range 4.95:1-14.01:1).
- **Exact-values table still uses pre-redesign classes (`border`, `rounded`, `bg-gray-50`, `text-gray-500`, `divide-y`) instead of this story's design tokens, around the table below the evaluator-category chips** -- Blind Hunter, LOW severity, in-scope. Verdict: **low**, cosmetic inconsistency but in-scope for this story's own restyle. Routes to **patch**: converted to `border-line`/`rounded-brujula-sm`/`bg-surface-2`/`text-ink-soft`/`divide-line` (plus `text-gray-700` -> `text-ink` on value cells for full consistency), matching `EvaluatorPicker.tsx`'s existing bordered-table convention.
- **Verification Gap finding: the implementer's own screenshot-description of the radar's draw-in stagger was loosely worded** -- Verification Gap / orchestrator, independently measured real `getComputedStyle` opacity values via Playwright and confirmed the underlying animation genuinely works correctly and matches its own 60ms-stagger timing math. Verdict: **false, described imprecisely but code correct** -- not a fixable defect, no patch routed; the code was already right, only the verbal description in the original report was imprecise.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 new errors/warnings
- `npx tsc --noEmit` -- expected: no type errors
- `npm run test` -- expected: all existing tests still pass (no data-fetching logic touched)

**Manual checks (UI/visual — Playwright + local headless Chromium are already installed, `~/.cache/ms-playwright`, use them, do not just claim success):**
- Screenshot a below-threshold report, a just-crossed-threshold report (collapsed state), and the same report after a simulated reveal-button click, for both a cycle report and an ad-hoc report.
- Screenshot the comparison chart's evaluator-category chips (both active/inactive states) and confirm the 4 violet hex values are visually unchanged from before this story.
- Confirm `prefers-reduced-motion: reduce` (Playwright `page.emulateMedia`) shows the radar at full opacity immediately, no stagger.
- Screenshot `/dashboard/cycles`, `/dashboard/cycles/nueva`, `/dashboard/cycles/[id]` (organizing), `/dashboard/cycles/[id]/estado` in light and dark theme.
