---
title: 'Report Groups Screens Redesign'
type: 'feature'
created: '2026-09-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'de973ee40b1e068a427e0bd52f13c8f2f189e658'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/dashboard/groups`, `/dashboard/groups/nuevo`, and `/dashboard/groups/[id]` are the first real, live-wired screens to receive the Brújula Segura redesign — they still use raw, un-tokenized Tailwind (`bg-black`, `text-gray-*`, plain `rounded`/`border`) even though report groups is the one domain Epic 1 already fully migrated to the new layering.

**Reframing (per Story 1.7's resolution):** this story's AC references "Epic 1's new API path (flag on) or old path (flag off)" — no such flag exists; Story 1.6 already fully replaced the old path. This story is a pure presentation-layer restyle (CSS classes + swapping hand-rolled markup for Story 2.1-2.5's components) entirely decoupled from data-fetching, so the AC's "works identically regardless of backend path" condition is trivially satisfied: nothing about how these pages fetch data changes. (Note, confirmed via investigation: the three pages' own data reads — `get_my_report_groups`, `get_colleagues_with_closed_cycle`, `get_report_group`, `get_report_group_competency_summary` — still call Supabase directly. Only the three *write* actions were migrated to `reportGroupsManager` in Epic 1 Story 1.6; migrating these pages' *reads* to the manager layer was never in Epic 1's scope and is not part of this story either — this is a visual restyle only.)

**Approach:** Apply Story 2.1-2.5's tokens/components to page chrome only:
- `/dashboard/groups/page.tsx` — `Card` wrapping the group list, `ButtonPrimary` for "Crear grupo" (replacing the hand-rolled black button), list rows restyled with `text-ink`/`text-ink-soft` tokens.
- `/dashboard/groups/nuevo/page.tsx` — `Card` wrapping the form, `ButtonPrimary`-equivalent styling already handled by `EvaluatorPicker`'s own `primary` prop (unchanged — see Never), form input restyled with `border-line`/`rounded-brujula-md`, error message restyled without using coral (DESIGN.md's own Do's/Don'ts reserves coral for exactly one energizing moment per screen, never an error/warning state — no dedicated alert/error component exists in the design system yet, so this uses a neutral `border-line` box with `text-ink` text instead of inventing an untokenized color).
- `/dashboard/groups/[id]/page.tsx` — `Card` wrapping each section (pending-invite decision, open-group member list, closed-group report), `ButtonPrimary` for "Confirmar"/"Cerrar informe", `ButtonSecondary` for "Rechazar", `AggregateBadge` replacing the plain "X personas aportan a este agregado" paragraph with "Vista agregada — N personas" (this is exactly the rollup-vs-individual distinction `AggregateBadge` exists for), member-status labels restyled with token colors.

## Boundaries & Constraints

**Always:**
- Pages render correctly at both desktop and mobile breakpoints (desktop-optimized-but-responsive, per UX-DR22-23 for authenticated app surfaces) — verify via responsive build/manual check, not just desktop.
- Every restyled interactive element uses Story 2.2's `ButtonPrimary`/`ButtonSecondary` (never a hand-rolled `<button className="bg-black...">` again).
- The report-groups detail page's aggregate section (`X personas aportan a este agregado`) uses `AggregateBadge`, matching its designed purpose exactly.

**Never:**
- Do not modify `EvaluatorPicker.tsx` or `CompetencyComparisonChart.tsx` — both are pre-existing, complex, separately-owned components outside Epic 2's component set; only the page chrome *around* them is restyled.
- Do not change any data-fetching call, RPC name, redirect target, or form-action wiring — this story only changes `className` strings and swaps hand-rolled markup for the equivalent Story 2.2-2.4 component, never touches logic.
- Do not introduce a new "alert"/"error banner" component — DESIGN.md defines none; use the neutral `border-line`/`text-ink` treatment described above.
- Do not touch `src/app/actions/reportGroups.ts` or any `src/server/*` file — this is presentation-only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `/dashboard/groups`, has groups | list of groups | `Card`-wrapped list, `ButtonPrimary` "Crear grupo" link, token colors | N/A |
| `/dashboard/groups`, no groups | empty list | empty-state message in `text-ink-soft`, same `Card`/button chrome | N/A |
| `/dashboard/groups/nuevo`, with `?error=` | form validation error from a redirect | error shown in neutral `border-line`/`text-ink` box, not coral | N/A |
| `/dashboard/groups/[id]`, pending invite | `my_status === "pending"` | `Card` with `ButtonPrimary` "Confirmar" + `ButtonSecondary` "Rechazar" | N/A |
| `/dashboard/groups/[id]`, open group | `status === "open"` | member list in a `Card`, `ButtonPrimary` "Cerrar informe" (disabled below threshold, same logic) | N/A |
| `/dashboard/groups/[id]`, closed + can see report | `status === "closed" && canSeeReport` | `AggregateBadge` shows accepted-member count, AI-interpretation `Card`, unmodified `CompetencyComparisonChart` | N/A |
| `/dashboard/groups/[id]`, closed + cannot see report | `status === "closed" && !canSeeReport` | unchanged message, token-restyled text color only | N/A |
| Mobile viewport (~375px) | any of the above | no horizontal scroll, buttons/cards reflow sensibly, `spacing.gutter` (20px) side margin preserved | N/A |

</frozen-after-approval>

## Code Map

- `src/app/dashboard/groups/page.tsx` (85 lines) — list page; direct Supabase reads (`get_my_report_groups`), unchanged. Current styling: `bg-black` button, `border rounded divide-y` list, `text-gray-400`/`text-gray-500`/`text-gray-600`/`text-gray-700`.
- `src/app/dashboard/groups/nuevo/page.tsx` (93 lines) — create page; direct Supabase reads (`get_colleagues_with_closed_cycle`), unchanged. Uses `EvaluatorPicker` (untouched) for the member checklist + its own `primary` submit button. Current error treatment: `bg-red-50 text-red-700`.
- `src/app/dashboard/groups/[id]/page.tsx` (209 lines) — detail page; direct Supabase reads (`get_report_group`, `get_report_group_competency_summary`), unchanged. Uses `CompetencyComparisonChart` (untouched) for the closed-group report. Current: `bg-black` buttons, `bg-gray-50` AI-interpretation box, various `text-gray-*`.
- `src/components/ui/{ButtonPrimary,ButtonSecondary,Card,AggregateBadge}.tsx` (Stories 2.2/2.3) — components to apply. All accept `className` passthrough and `forwardRef`.
- `src/app/globals.css` (Story 2.1) — tokens: `--color-ink`, `--color-ink-soft`, `--color-line`, `--radius-brujula-md`.
- `src/components/EvaluatorPicker.tsx`, `src/components/CompetencyComparisonChart.tsx` — read-only references, confirmed out of scope, not modified.
- No test covers any of these three pages (confirmed via `grep` across `tests/`) — verification is manual/build-based, same as every prior Epic 2 story.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/dashboard/groups/page.tsx` -- restyle with `Card`, `ButtonPrimary`, token text colors
- [x] `src/app/dashboard/groups/nuevo/page.tsx` -- restyle with `Card`, neutral error box, token text/border colors
- [x] `src/app/dashboard/groups/[id]/page.tsx` -- restyle with `Card`, `ButtonPrimary`/`ButtonSecondary`, `AggregateBadge`, token text colors
- [x] Verify `npm run build` succeeds, responsive check (desktop + ~375px mobile viewport), and that `EvaluatorPicker`/`CompetencyComparisonChart` still render correctly unmodified

**Acceptance Criteria:**
- Given the report-groups pages, when restyled using Story 2.1-2.4's tokens and components, then they render correctly at both desktop and mobile breakpoints.
- Given the pages' data-fetching (direct Supabase, unchanged by Epic 1 or this story), when the redesign is applied, then it works identically regardless of backend path — trivially true since this story never touches data-fetching logic.

## Implementation Notes

## Spec Change Log

## Review Triage Log

- **`ButtonPrimary`/`ButtonSecondary` have no `disabled:` styling at all — the "Cerrar informe" button (`disabled={acceptedCount < 5}`) previously showed gray fill + `cursor-not-allowed` below threshold; now it renders visually identical whether enabled or disabled** — Edge Case Hunter finding, Blind Hunter finding (independently, same claim). Verdict: **medium**, real, and this is the first live usage exposing it (Story 2.2's own review dismissed the equivalent finding as "no current exposure" — that's no longer true). Routes to **patch**: add `disabled:opacity-50 disabled:cursor-not-allowed` to both components.
- **Neither `ButtonPrimary` nor `ButtonSecondary` has any `hover:` feedback — every original hand-rolled button did (`hover:bg-gray-800`)** — Blind Hunter finding. Verdict: **medium**, real, same "first live exposure" reasoning. Routes to **patch**: add a subtle token-safe hover treatment to both (bundled with the disabled-state fix above).
- **The hand-duplicated "Crear grupo" `<Link>` copies `ButtonPrimary`'s class string but adds `text-sm` (not present in the component itself), and will silently drift if `ButtonPrimary` is ever restyled** — Edge Case Hunter finding (claim), Blind Hunter finding (the `text-sm` inconsistency specifically), Verification Gap's independent "other finding" (the drift risk). Verdict: **medium**, real and triple-confirmed — causes genuine inconsistent button text sizing across the three restyled pages, the opposite of this story's goal. Routes to **patch**: export a shared class-string constant from `ButtonPrimary.tsx` and have the Link import and use it directly, removing the erroneous `text-sm`.
- **`/dashboard/groups/nuevo`'s empty-colleagues message isn't `Card`-wrapped, unlike the list page's analogous empty state; the I/O matrix has no row for it** — Blind Hunter finding. Verdict: **low**, real, trivial, cheap consistency win. Routes to **patch**.
- **The "closed + cannot see report" branch is the only status-dependent section left without `Card` wrapping — and it's exactly the untested path** — Blind Hunter finding. Verdict: **low**, real, trivial. Routes to **patch**.
- **`EvaluatorPicker.tsx`'s own submit button (the actual "Crear grupo" CTA on `/nuevo`) remains hand-rolled `bg-black`/`hover:bg-gray-800` — the exact pattern this story's "Always" boundary says must never appear again, yet it's excluded by the story's own "Never touch EvaluatorPicker" rule** — Edge Case Hunter finding, Blind Hunter finding (independently). Verdict: **medium**, real, and traces to a genuine gap in this story's own frozen spec: the Approach text assumed EvaluatorPicker's `primary` prop already produced tokenized styling, without verifying it — that assumption was wrong. Not fixed here: `EvaluatorPicker` is used in multiple contexts beyond report-groups and deserves its own careful, scoped restyle pass, not a side-effect of this story. Routes to **defer**.
- **`focus-visible:outline-paper-deep` (used by `ButtonPrimary` and the duplicated Link) has very low contrast against the page background (`paper` vs `paper-deep` are near-identical off-white/white neutrals in both themes) — a real WCAG focus-visibility problem, first exposed by this story's live usage** — Blind Hunter finding. Verdict: **medium**, real and independently confirmed by computing the actual token values. Traces to a genuine internal tension in DESIGN.md's own frozen `focus-ring` spec: its color-assignment reasoning ("paper-deep... so the ring is never drawn against a fill it can't be seen on") assumes the ring overlaps the filled component, but its own stated mechanism ("drawn outside the element bounds") means the ring actually sits against the page background, not the fill — DESIGN.md's own spec doesn't resolve this tension. Not fixed here: overriding DESIGN.md's explicit color-assignment rule is a design-system-level decision outside a screens-redesign implementation story's authority. Routes to **defer**.
- **`sprint-status.yaml` shows `in-progress` (should be `review` per its own status definitions, matching every sibling Story 2.1-2.5) and the spec's `status: 'in-review'` doesn't match the tracker's vocabulary; Tasks checklist left unchecked despite shipped work** — Blind Hunter findings. Verdict: **false/moot**. Same expected mid-workflow snapshot state explained for every prior story — resolved by this same finalization pass.
- Verification Gap independently confirmed no demonstrable regression exists in the two untested "closed" render branches (new markup type-checks cleanly, underlying data plumbing is pre-existing and unchanged) — a real coverage hole, not a filed verification gap.

## Verification

**Commands:**
- `npm run build` -- succeeds, same route list
- `npm run lint` -- no new violations
- `npx tsc --noEmit` -- no new errors
- Manual: visual/DOM check at desktop and ~375px mobile widths; confirm `EvaluatorPicker`/`CompetencyComparisonChart` still receive the same props and render
