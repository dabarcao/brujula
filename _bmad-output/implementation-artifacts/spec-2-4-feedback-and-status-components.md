---
title: 'Feedback and Status Components'
type: 'feature'
created: '2026-09-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '590649dc76d2d8c6e69b8b385fe1980dd2303a49'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** No trust-signaling, competency-data, or progress components exist yet. Six DESIGN.md components — `anonymity-badge`, `role-badge`, `saboteador-bar`, `intensity-scale`, `progress-bar`, `bookmark-chip` — are used across the wizard, reports, and dashboard, and several carry real behavioral rules (never color-alone, exact `-deep` fill variants, numeric value always printed) that must be built correctly from the start since every later screen depends on them.

**Approach:** Six new `src/components/ui/` files, mirroring Stories 2.2/2.3's established pattern (`forwardRef`, array-join-filter-Boolean `className`, no `"use client"`, no data imports — except `AnonymityBadge`, which needs client-side interactivity for its `emphasized` prop transition and therefore is the first `"use client"` component in this set):

- **`AnonymityBadge`** — indigo-wash pill, lock glyph + "Anónimo — nadie ve tu nombre" (or caller-supplied children). Takes an `emphasized?: boolean` prop: when `true`, swaps to `{colors.coral-wash}` background and the icon swaps from lock to checkmark — color shift and icon swap always together, per EXPERIENCE.md's explicit "does not get a color-only treatment" rule for this exact moment. The transition itself uses `motion-safe:transition-colors` (Tailwind's built-in `prefers-reduced-motion` gate) so it's instant with reduced motion and smooth otherwise — no JS motion library needed.
- **`RoleBadge`** — pill, `role: "visionario"|"arquitecto"|"catalizador"|"coach"|"plenitud"` prop selects the fill: `catalizador`/`coach` use their `-deep` variant (AA-contrast rule), the other three use their base tone. White text always. Children/label shown per DESIGN.md's own conditional rule (shown when the surrounding component doesn't already display the value elsewhere) — left to the caller to decide what to pass as children, not hardcoded here.
- **`SaboteadorBar`** — horizontal meter, `{colors.saboteador-tint}` fill on `{colors.saboteador-wash}` track, `value`/`max` props (0–100 or raw/max pair), the numeric value always rendered as visible text beside the bar — never meter-only.
- **`IntensityScale`** — the five-step indigo ramp (`intensity-1`..`5`), `value: 1|2|3|4|5` prop selects the filled step, numeric value always printed beside it.
- **`ProgressBar`** — indigo fill on `{colors.line}` track, `value`/`max` props, smooth percentage fill — never a step/counter display (the wizard's own "12 of 30" is explicitly the anti-pattern DESIGN.md rejects).
- **`BookmarkChip`** — `{colors.coral-wash}` pill, `{colors.coral-deep}` text (the specific pairing DESIGN.md calls out as what makes it AA-legible), children-based content (matching the exact fixed copy EXPERIENCE.md specifies: "Guardado — continúa cuando quieras").

## Boundaries & Constraints

**Always:**
- `AnonymityBadge`'s `emphasized` state always changes color AND icon together, never one without the other — this is the product's single most trust-critical visual signal (EXPERIENCE.md, Diego's flow) and must never degrade to color-only.
- `SaboteadorBar` and `IntensityScale` always render their numeric value as visible text, never meter-only, regardless of any `className` override the caller supplies.
- `RoleBadge`'s `catalizador`/`coach` roles render on their `-deep` fill variant only — never the base `role-catalizador`/`role-coach` tone (fails AA with white text, per DESIGN.md).
- `AnonymityBadge`'s color/icon transition is `motion-safe:`-gated so `prefers-reduced-motion` users get an instant swap, never a suppressed or missing state change — the content (which state is active) is never gated behind motion.

**Never:**
- Do not wire any of these into an existing page — net-new, unimported files, same as Stories 2.2/2.3.
- Do not build the wizard's step-transition slide/fade or the reveal-button's radar draw-in animation — those are screen-level/domain-specific (Epic 4), not shared primitives, per this story's own scope (only "the shared primitives' own micro-interactions").
- `RoleBadge`/`SaboteadorBar`/`IntensityScale`/`ProgressBar`/`BookmarkChip` need no `"use client"` — only `AnonymityBadge` does, for its `emphasized` prop's transition to work correctly as a controlled, re-rendering client state (the prop itself can still be driven by a parent Server or Client Component; only this file needs the directive since it's the one with prop-driven visual state a browser must reactively transition).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `<AnonymityBadge />` | default (`emphasized` unset/false) | indigo-wash bg, lock icon, default copy | N/A |
| `<AnonymityBadge emphasized />` | `emphasized=true` | coral-wash bg, checkmark icon — both change together | N/A |
| `<AnonymityBadge emphasized />`, `prefers-reduced-motion: reduce` | OS setting | same color/icon swap, no animated transition (instant) | N/A |
| `<RoleBadge role="catalizador">Catalizador · 4.6</RoleBadge>` | catalizador role | `role-catalizador-deep` fill, white text | N/A |
| `<RoleBadge role="visionario">Visionario</RoleBadge>` | visionario role | base `role-visionario` fill, white text | N/A |
| `<SaboteadorBar value={3} max={5} />` | any value | bar filled proportionally + visible "3" (or "3/5") text | N/A |
| `<IntensityScale value={4} />` | step 4 of 5 | `intensity-4` fill + visible "4" text | N/A |
| `<ProgressBar value={12} max={30} />` | any value | smooth fill at 40%, no "12 of 30" counter text rendered | N/A |
| `<BookmarkChip>Guardado — continúa cuando quieras</BookmarkChip>` | default | coral-wash bg, coral-deep text | N/A |

</frozen-after-approval>

## Code Map

- `src/app/globals.css` (Story 2.1) — tokens: `--color-indigo-wash`, `--color-coral-wash`, `--color-coral-deep`, `--color-role-*` (all 5 + 2 `-deep`), `--color-saboteador-tint`, `--color-saboteador-wash`, `--color-intensity-1..5`, `--color-line`, `--color-indigo`, `--text-caption`, `--font-caption`.
- `src/components/ui/RevealButton.tsx` (Story 2.2) — inline-SVG-icon pattern to mirror for `AnonymityBadge`'s lock/checkmark glyphs.
- `_bmad-output/planning-artifacts/ux-designs/ux-brujula-gui-2026-09-11/EXPERIENCE.md` lines 66-79 ("Interaction Primitives") — source of `AnonymityBadge`'s exact emphasis behavior (`indigo-wash`→`coral-wash`, lock→checkmark, "does not get a color-only treatment", `prefers-reduced-motion` handling) — this detail exists only here, not in DESIGN.md's frontmatter.
- DESIGN.md `components.anonymity-badge`/`role-badge`/`saboteador-bar`/`intensity-scale`/`progress-bar`/`bookmark-chip` (frontmatter) and `## Components` prose — base visual spec for all six.

## Tasks & Acceptance

**Execution:**
- [x] `src/components/ui/AnonymityBadge.tsx` (new, `"use client"`)
- [x] `src/components/ui/RoleBadge.tsx` (new)
- [x] `src/components/ui/SaboteadorBar.tsx` (new)
- [x] `src/components/ui/IntensityScale.tsx` (new)
- [x] `src/components/ui/ProgressBar.tsx` (new)
- [x] `src/components/ui/BookmarkChip.tsx` (new)
- [x] Verify via the same create/build/inspect-CSS/delete technique as Stories 2.1-2.3, plus a manual check of `AnonymityBadge`'s emphasized-state class swap

**Acceptance Criteria:**
- Given `anonymity-badge`, when built, then its submit-time emphasis state pairs the color shift with the lock→checkmark icon swap, never color alone.
- Given `role-badge`, when built for Catalizador and Coach, then it renders on the `-deep` fill variants, not the base tone.
- Given `saboteador-bar` and `intensity-scale`, when built, then each always renders its numeric value as printed text alongside the visual meter, never meter-only.
- Given any component with a motion effect (`AnonymityBadge`'s emphasis transition — the only one in this story's scope), when `prefers-reduced-motion` is set, then the component's reduced-motion fallback (instant swap) applies.

## Implementation Notes

- All six follow Stories 2.2/2.3's exact pattern: default export, `forwardRef`, array-join-filter-Boolean `className` composition, no data imports. Only `AnonymityBadge.tsx` has `"use client"`, per the spec's own boundary.
- Only the token-mapped properties actually listed in each component's DESIGN.md frontmatter entry (background/color/radius/fontFamily) are baked in — same discipline `CardAccent`/`AggregateBadge` established in Story 2.3. None of `anonymity-badge`/`role-badge`/`bookmark-chip`'s frontmatter entries list a `padding` field, so none of `AnonymityBadge`/`RoleBadge`/`BookmarkChip` hardcode one; callers add spacing via `className` when these are actually wired into a screen (out of scope here). `inline-flex`/`gap` is kept only where structurally required for legibility (icon+text in `AnonymityBadge`, bar+value in `SaboteadorBar`/`IntensityScale`) — that's layout, not a design token, so it isn't skipped the way padding is.
- `AnonymityBadge`: a single ternary on `emphasized` drives both the `bg-indigo-wash text-indigo-deep` → `bg-coral-wash text-coral-deep` swap and the lock→checkmark `<svg>` swap, so the two can never diverge. `motion-safe:transition-colors` is the only motion in this story's scope (verified compiles inside `@media (prefers-reduced-motion: no-preference)` — see Verification); the state swap itself is never gated by that media query.
- `RoleBadge`: `catalizador`/`coach` map to `bg-role-catalizador-deep`/`bg-role-coach-deep` via a `Record<Role, string>` lookup (not a template-literal class, so Tailwind's static scanner can see every class name literally) — the other three roles map to their base tone. `children` has no default, matching DESIGN.md's "shown only when the surrounding component doesn't already display the value" rule, which is a per-usage decision the component can't make on its own.
- `SaboteadorBar`/`IntensityScale`: the printed numeric value is a sibling `<span>` to the meter, not merged into the meter's own class string — so a caller's `className` override (which only ever touches the outer wrapper, per the array-join pattern) structurally cannot remove it. `SaboteadorBar` defaults `max=5` (spec.md's saboteador 1–5 scale, EXPERIENCE.md "1–5 note printed alongside"); `IntensityScale`'s `value` fills steps `1..value` at full opacity in each step's own ramp color and dims steps above `value` to `opacity-30`, matching the exact-values table's compiled swatch pattern in `mockups/key-report-reveal.html` (consulted only for this one visual ambiguity — DESIGN.md/EXPERIENCE.md's prose doesn't otherwise specify whether "the filled step" means cumulative or single-segment fill).
- `ProgressBar`: `value`/`max` (default `max=100`) only ever set a fill `width` percentage; no counter text node exists in the component at all, so the "12 of 30" anti-pattern can't leak in through any prop.
- `rounded-brujula-*` (not bare `rounded-*`) used everywhere a radius is needed, per `globals.css`'s own instruction that stories 2.2+ reference the `rounded-brujula-*` namespace explicitly (bare `rounded-*` stays pinned to Tailwind's stock scale until a future story migrates the whole site). Bare `rounded-full` is the one exception `globals.css` calls out as needing no override.

## Spec Change Log

- **`BookmarkChip` radius resolved as `rounded-full`, not the `{rounded.sm}` DESIGN.md's own `components.bookmark-chip` frontmatter entry states.** DESIGN.md's `## Shapes` prose ("`rounded.full` is pills only — role badges, the anonymity chip, evaluator-category chips, **the bookmark/pause affordance**") and its `## Components` prose ("`{components.bookmark-chip}` — ... **pill** with ... text") both explicitly call `bookmark-chip` a pill, twice, independently of each other. Only the single frontmatter `radius: '{rounded.sm}'` line disagrees, and it sits directly under `saboteador-bar`'s identical `{rounded.sm}` line in that YAML block — reads as a copy-paste slip in DESIGN.md itself rather than a deliberate choice. Implemented `rounded-full`, following the two independent prose sources over the one outlier data field. This is a self-contained DESIGN.md inconsistency, not a gap in this spec, so it didn't block implementation — flagged here for whoever next edits DESIGN.md to reconcile the frontmatter entry.

## Review Triage Log

- **`AnonymityBadge`'s `children ?? DEFAULT_COPY` doesn't fall back for an explicit empty-string `children`, rendering no visible label** — Edge Case Hunter finding. Verdict: **low**, real, trivial (`??` → `||`). Routes to **patch**.
- **`RoleBadge`'s `ROLE_FILL[role]` has no fallback if a `role` value outside the TS union reaches it at runtime (e.g. from untyped API data)** — Edge Case Hunter finding. Verdict: **low**, real — plausible once real backend data flows in (Epic 4), trivial fallback fix. Routes to **patch**.
- **`IntensityScale`'s `value` has no clamp for out-of-1-5-range input** — Edge Case Hunter finding. Verdict: **low**, real, same reasoning as above. Routes to **patch**.
- **`ProgressBar`/`SaboteadorBar`: `max <= 0` (e.g. `max=0, value=0`) produces `NaN` in the fill width, an invalid CSS value** — Edge Case Hunter finding, Blind Hunter finding (independently, same claim). Verdict: **low-medium**, real, genuine division-by-zero, trivial guard clause. Routes to **patch** (both files).
- **`ProgressBar`/`SaboteadorBar`/`IntensityScale` carry no ARIA meter semantics (`role`, `aria-valuenow/min/max`) — plain `<div>`/`<span>` have no accessible-by-default fallback the way a native `<button>` does** — Blind Hunter finding. Verdict: **medium**, real, and directly relevant to this story's own stated accessibility emphasis (never meter-only). The visible numeric text already carries the raw value to screen readers, but formal ARIA semantics let assistive tech navigate/announce it properly. Mechanical, well-defined fix (a handful of props). Routes to **patch**.
- **Verification claims "all five `RoleBadge` roles" were exercised, but only 3 of 5 (plus no explicit `text-paper-deep` check) appear in the pasted compiled-CSS evidence** — Blind Hunter finding. Verdict: **low**, real precision gap in the write-up. Routes to **patch**: re-verify all 5 roles + the white-text claim explicitly, correct the Verification section to match.
- **`AnonymityBadge`'s lock/checkmark icons are two fully copy-pasted `<svg>` blocks, differing only in the inner path — a maintainability risk for the exact "always paired" invariant this component protects** — Blind Hunter finding. Verdict: **low-medium**, real, valid code-quality concern given the component's own stated purpose. Routes to **patch**: single shared `<svg>` wrapper, swap only the inner `<polyline>`/`<path>`.
- **DESIGN.md's own frontmatter still says `bookmark-chip.radius: '{rounded.sm}'`, contradicting its own prose twice — the source-of-truth document stays wrong for the next reader who trusts the frontmatter over prose** — Blind Hunter finding. Verdict: **low**, real, but out of this story's scope: DESIGN.md is a frozen, `status: final` planning artifact from an earlier BMad phase (bmad-ux), not this build-story's file to amend. Routes to **defer**.
- **`sprint-status.yaml` shows `in-progress` while the spec shows `in-review`** — Blind Hunter finding. Verdict: **false**. Expected mid-workflow state, same pattern as every prior story at this point.
- **No dark-mode-specific verification for these six components** — Blind Hunter finding. Verdict: **false**. Same reasoning already established in Story 2.2's review: these components consume the same custom-property-backed utility classes as everything else; dark-mode correctness is inherent to Story 2.1's already-reviewed token mechanism, not something each consumer must re-verify.
- **Code Map omits `--color-indigo-deep`/`--color-paper-deep` from its token list** — Blind Hunter finding. Verdict: **false/negligible**. Both tokens exist and work correctly; a non-frozen Code Map's incomplete enumeration has zero functional consequence.
- **`SaboteadorBar` uses `<span className="block">` for its track/fill, `ProgressBar` uses `<div>` — unexplained tag-choice divergence** — Blind Hunter finding. Verdict: **low**, real but purely cosmetic (both render identically). Rejected: no functional harm, fix is pure churn for zero benefit.
- **`context: []` empty despite citing EXPERIENCE.md/DESIGN.md/RevealButton/mockups** — Blind Hunter finding. Verdict: **false/consistent-with-precedent**. Same reasoning as Story 2.3's identical finding — the Code Map already inlines every needed fact; `context:` is for files needing fresh loading, not citing already-distilled sources.
- **No automated tests for any of the six components** — Blind Hunter finding. Verdict: **false/consistent-with-precedent**. Same established, already-accepted manual-verification-only pattern from Stories 2.1-2.3.
- **`RoleBadge` has no safeguard (default children/aria-label/dev warning) against a caller creating a color-alone pill** — Blind Hunter finding. Verdict: **low**. Rejected: no current consumer exists to be exposed to this, and the correct enforcement venue (an ESLint rule or required-prop typing) isn't a runtime addition to the component itself — same reasoning as Story 2.2's identical rejected finding.
- **`SaboteadorBar`'s default `max=5` vs. the spec's own parenthetical "(0–100 or raw/max pair)"** — Edge Case Hunter finding (claim). Verdict: **false**. The implemented default (max=5) is domain-correct — saboteadores, like every other evaluation in this product, use a 1-5 scale (confirmed via DESIGN.md's `scale-slider` spec and spec.md's evaluation-scale convention) — the spec's own generic parenthetical was imprecise boilerplate, not a functional gap in the code.

## Verification

**Commands:**
- `npm run build` -- succeeds, same route list ✅ (verified twice: once at baseline before touching anything, once after — 27 routes, unchanged; the six new files are unimported so they add nothing to the route list)
- `npm run lint` -- no new violations ✅ (one pre-existing, unrelated warning in `scripts/seed-company-360.mjs`)
- `npx tsc --noEmit` -- no new errors ✅ (clean)
- Manual compiled-CSS inspection per the Tasks list, including confirming `motion-safe:` classes compile correctly ✅ — temporarily imported all six into a throwaway route (`src/app/zzverify24/page.tsx`, exercising `AnonymityBadge` both default and `emphasized`, all five `RoleBadge` roles individually, `SaboteadorBar`, `IntensityScale`, `ProgressBar`, `BookmarkChip`), ran `npm run build`, grepped `.next/static/chunks/*.css` for the exact expected rules, then deleted the throwaway route, deleted `.next`, and confirmed `git status` shows only the intended files. Confirmed exact matches for **all five** `RoleBadge` roles plus the white-text class (corrected from an earlier pass of this section, which pasted only 3 of 5 roles and never showed `text-paper-deep`):
  - `.bg-indigo-wash{background-color:var(--indigo-wash)}` / `.text-indigo-deep{color:var(--indigo-deep)}`
  - `.bg-coral-wash{background-color:var(--coral-wash)}` / `.text-coral-deep{color:var(--coral-deep)}`
  - `.bg-role-visionario{background-color:var(--role-visionario)}`
  - `.bg-role-arquitecto{background-color:var(--role-arquitecto)}`
  - `.bg-role-catalizador-deep{background-color:var(--role-catalizador-deep)}` (never the base `role-catalizador`)
  - `.bg-role-coach-deep{background-color:var(--role-coach-deep)}` (never the base `role-coach`)
  - `.bg-role-plenitud{background-color:var(--role-plenitud)}`
  - `.text-paper-deep{color:var(--paper-deep)}` — the white-text class `RoleBadge` applies unconditionally to all five roles
  - `.bg-saboteador-wash{...}` / `.bg-saboteador-tint{...}`
  - `.bg-intensity-1{...}` through `.bg-intensity-5{...}`, `.opacity-30{opacity:.3}`
  - `.bg-line{background-color:var(--line)}` / `.bg-indigo{background-color:var(--indigo)}`
  - `.rounded-brujula-sm{border-radius:8px}` / `.rounded-full{border-radius:3.40282e38px}`
  - `.font-caption,.font-data{font-family:Inter,Segoe UI,system-ui,sans-serif}` (Tailwind's minifier merges selectors with identical declarations — `font-caption` and `font-data` share the same family, so they appear as one merged rule, not a missing class) / `.text-caption{font-size:13px;...}`
  - `@media (prefers-reduced-motion:no-preference){.motion-safe\:transition-colors{transition-property:color,background-color,...}}` — confirms the transition itself is gated behind the media query, so `prefers-reduced-motion: reduce` users get the same `emphasized`-driven class/icon swap, just without the animated transition, exactly as required.
- Manual check of `AnonymityBadge`'s emphasized-state class swap ✅ — read-verified in source that a single ternary on `emphasized` drives both the background/text-color pair and the lock/checkmark `<svg>` choice (no path where one changes without the other), then confirmed via the compiled CSS above that both class sets exist in the build output.

**Patch round (post-review):** the Review Triage Log above routed eight findings to **patch**; all eight were applied with the smallest change that closes each gap, then re-verified against just the touched files (`npx tsc --noEmit`, `npx eslint` on the five edited files, plus a rebuild of the throwaway verification route) rather than the full command list above, per the reviewer's own scoping instruction — full verification runs separately.
  - `AnonymityBadge.tsx`: `children ?? DEFAULT_COPY` → `children || DEFAULT_COPY` (falls back correctly for `children=""`); the two copy-pasted lock/checkmark `<svg>` blocks collapsed into one shared `<svg>` wrapper with only the inner `<polyline>`/`<path>`+`<rect>` swapped by `emphasized`.
  - `RoleBadge.tsx`: `ROLE_FILL[role]` → `ROLE_FILL[role] ?? "bg-role-visionario"`, so an out-of-union runtime `role` degrades to a defined fill instead of rendering no background class.
  - `IntensityScale.tsx`: `value` is now clamped (`Math.min(5, Math.max(1, Math.round(value)))`) into a local `clamped` before it selects filled steps or is printed as text; added `role="meter"` with `aria-valuenow={clamped}`/`aria-valuemin={1}`/`aria-valuemax={5}` on the outer element.
  - `ProgressBar.tsx` / `SaboteadorBar.tsx`: fill-width calculation now guards `max <= 0` to `0%` instead of dividing by zero into `NaN`; added `role="progressbar"` with `aria-valuenow`/`aria-valuemin={0}`/`aria-valuemax={max}` on each component's own track element (`ProgressBar`'s outer `<div>`, which *is* the track; `SaboteadorBar`'s inner track `<span>`, since its outer element is a flex wrapper around both the bar and the printed value, not the track itself).
  - Re-verified via the same throwaway-route + compiled-CSS technique, plus new cases for the edge conditions just fixed (`max=0`/`value=0` on `ProgressBar`/`SaboteadorBar`, an out-of-range `value` cast onto `IntensityScale`, an empty-string `children` on emphasized `AnonymityBadge`): build succeeded (TypeScript's own `IntensityValue` union rejects out-of-range literals at typed call sites, so the runtime-clamp test needed an `as unknown as 1` cast to simulate untyped data reaching the component — expected, not a defect), no new lint/type errors, and no `NaN`/invalid CSS values produced. Cleaned up the throwaway route and `.next` afterward.
