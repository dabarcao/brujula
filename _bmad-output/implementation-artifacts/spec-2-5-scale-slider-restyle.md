---
title: 'Scale Slider Restyle'
type: 'chore'
created: '2026-09-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c7a28e091d2ed95e3a10bc05ead83337f253c349'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/components/ScaleSlider.tsx` — the live, already-wired 0.5-increment scale input used in `ResponderWizard.tsx` (the anonymous feedback response flow) and `CompetencyPicker.tsx` — still uses raw, un-tokenized Tailwind grays (`accent-black`, `text-gray-900`, `text-gray-300`, `text-gray-400`), unlike every other Epic 2 component so far. This is the first Epic 2 story to touch an existing, production-facing file rather than add a net-new unwired one.

**Approach:** Restyle only the visual classes: `accent-black` → `accent-indigo` (Tailwind's native `<input type="range">` accent-color utility, colors both the thumb and filled track portion in supporting browsers — the closest native mechanism to DESIGN.md's `scale-slider: {track: line, fill: indigo, thumb: indigo, thumbRadius: rounded.full}`; native range thumbs are already circular by default, matching `rounded.full` with no extra CSS needed), and the muted-gray text classes (`text-gray-900`/`text-gray-300`/`text-gray-400`) → the design token equivalents (`text-ink`/`text-ink-soft`) so the slider's labels/value/hint text don't look visually orphaned next to its newly-indigo-colored track. Zero logic changes: the `touched`/`value` `useState` pair, the hidden-input-empty-until-touched behavior, `min`/`max`/`step`, and the `onChange` handler stay byte-for-byte identical.

## Boundaries & Constraints

**Always:**
- Only `className` strings change in `ScaleSlider.tsx` — no JSX structure change, no prop signature change, no new state, no new imports.
- The hidden input's value-commit behavior (`touched ? value : ""`) is preserved exactly — this is the actual form-submission contract `ResponderWizard`/`CompetencyPicker` depend on.
- Manually verify (build + visual/DOM check, or exercise via existing manual QA if available) that `ResponderWizard.tsx`'s and `CompetencyPicker.tsx`'s usage still renders and functions correctly after the restyle — these are real, live consumers, not unwired net-new files like Stories 2.2-2.4's components.

**Never:**
- Do not touch `ResponderWizard.tsx` or `CompetencyPicker.tsx` themselves — only `ScaleSlider.tsx`'s own file changes.
- Do not change the `min`/`max`/`step` values, the `useState` initial value (`3`), or the touched/untouched hidden-input logic.
- Do not introduce a new dependency (e.g. a custom range-slider library) — the restyle stays within native `<input type="range">` plus Tailwind's `accent-*` utility, exactly as today's implementation already does.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Initial render, untouched | default | slider at visual midpoint (3), value text shows "—" in `text-ink-soft`, hidden input value is `""` | N/A |
| User drags the slider | any drag | value updates in 0.5 steps, value text switches to `text-ink`, hidden input gets the numeric value, thumb/track render indigo | N/A |
| Visual only | any state | `accent-indigo` replaces `accent-black`; no functional/behavioral difference from before this story | N/A |

</frozen-after-approval>

## Code Map

- `src/components/ScaleSlider.tsx` — the only file this story touches. Currently: `accent-black` (range input), `text-gray-900`/`text-gray-300` (value display), `text-gray-400` (level labels + hint text). `touched`/`value` `useState`, hidden input, `onChange` handler — all logic, none of it touched.
- `src/components/ResponderWizard.tsx`, `src/components/CompetencyPicker.tsx` — confirmed via `grep` as the only two live consumers; read-only reference, not modified.
- `src/app/globals.css` (Story 2.1) — tokens consumed: `--color-indigo` (via Tailwind's `accent-indigo` utility, which resolves against the same `--color-indigo` custom property as `bg-indigo`/`text-indigo` do), `--color-ink`, `--color-ink-soft`.
- No existing test covers `ScaleSlider`/`ResponderWizard`/`CompetencyPicker` (confirmed via `grep` across `tests/`) — verification for this story is manual/build-based, same as every other Epic 2 story so far.

## Tasks & Acceptance

**Execution:**
- [x] `src/components/ScaleSlider.tsx` -- `accent-black` → `accent-indigo`; `text-gray-900` → `text-ink`; `text-gray-300`/`text-gray-400` → `text-ink-soft`
- [x] Verify `npm run build` succeeds and `ResponderWizard.tsx`/`CompetencyPicker.tsx` (the two live consumers) still typecheck and render without error

**Acceptance Criteria:**
- Given the existing `ScaleSlider` component, when restyled, then only its visual tokens change (indigo fill/thumb, `rounded.full` thumb) — its interaction model and existing value-commit behavior are unchanged.

## Implementation Notes

Exactly 4 className substitutions in `ScaleSlider.tsx` (`accent-black`→`accent-indigo`; `text-gray-900`→`text-ink`; two instances of `text-gray-300`/`text-gray-400`→`text-ink-soft`), confirmed via `git diff` to be the only lines touched — no JSX/state/prop/import changes. `npm run build`, `npm run lint`, `npx tsc --noEmit` all clean; confirmed via `grep` that `ResponderWizard.tsx`/`CompetencyPicker.tsx` (the two live consumers) pass only `name`/`levels` props and never depend on `ScaleSlider`'s internal DOM structure or classNames, so the restyle carries no risk to either.

**Verification run (2026-09-13):** `npm run build` succeeds, same route list; `npm run lint` 0 errors (1 pre-existing unrelated warning); `npx tsc --noEmit` clean; compiled CSS confirmed `accent-indigo`/`text-ink`/`text-ink-soft` resolve to `var(--indigo)`/`var(--ink)`/`var(--ink-soft)` respectively.

## Spec Change Log

## Review Triage Log

- **DESIGN.md's `scale-slider` spec requires `track: '{colors.line}'`, but `accent-indigo` only colors the thumb and filled portion — the unfilled track segment stays the browser's UA default, never styled to `--color-line`** — Blind Hunter finding. Verdict: **low**, real gap between DESIGN.md's literal spec and the delivered result — but this story's own frozen Approach already explicitly named `accent-indigo` as "the closest native mechanism," knowingly accepting the approximation rather than adding cross-browser `::-webkit-slider-runnable-track`/`::-moz-range-track` pseudo-element CSS, which exceeds this restyle-only story's minimal-footprint scope. Routes to **defer**.
- **`ResponderWizard.tsx`/`CompetencyPicker.tsx` remain full of raw, un-tokenized grays around the now-tokenized slider** — Blind Hunter finding. Verdict: **false/out-of-scope-by-design**. This story's own frozen "Never" list explicitly forbids touching either file — restyling them is a deliberately later, per-domain story (Epic 4), not this one's job.
- **Spec frontmatter `status: 'in-review'` vs. `sprint-status.yaml`'s `in-progress`** — Blind Hunter finding. Verdict: **false**. These are two different tracking artifacts with two different, independently-established vocabularies (the spec template's own draft/in-progress/in-review/done vs. the sprint tracker's backlog/ready-for-dev/in-progress/review/done) — expected to be transiently out of sync mid-workflow, same pattern explained for every prior story.
- **Implementation Notes empty despite Verification claims** — Blind Hunter finding. Verdict: **false/moot**. Mid-workflow snapshot state, filled in as part of this same finalization pass.
- **Original `text-gray-300`/`text-gray-400` two-tier de-emphasis hierarchy collapses onto one `text-ink-soft` token** — Blind Hunter finding. Verdict: **false/acceptable-simplification**. The design system provides exactly one "soft ink" tier, not two — collapsing the original ad hoc gray distinction into the actual available token is the correct, token-compliant outcome, not a defect; introducing a third custom tone would be scope creep beyond a restyle story.
- **No stated browser-support baseline for `accent-color`, no cross-browser check** — Blind Hunter finding. Verdict: **false/not-caused-by-this-diff**. The original code already used the identical `accent-color` mechanism (`accent-black`) — this compatibility characteristic is unchanged by this story, not introduced by it.
- **No dark-mode-specific check** — Blind Hunter finding. Verdict: **false**. Same established reasoning as Stories 2.2/2.4: these are the same custom-property-backed tokens Story 2.1's already-reviewed mechanism handles automatically under `prefers-color-scheme`.
- **I/O matrix has no explicit row for the level-label spans/hint paragraph color change** — Blind Hunter finding. Verdict: **false/rejected**. The fix would mean editing the frozen `<frozen-after-approval>` block, which triage never does; the actual behavior is correct and covered in substance by the existing rows.
- Edge Case Hunter and Verification Gap independently reported zero findings, with Verification Gap specifically confirming neither live consumer (`ResponderWizard.tsx`, `CompetencyPicker.tsx`) depends on `ScaleSlider`'s internal classNames or DOM structure.

## Verification

**Commands:**
- `npm run build` -- succeeds, same route list
- `npm run lint` -- no new violations
- `npx tsc --noEmit` -- no new errors
- Manual: diff `ScaleSlider.tsx` to confirm only className strings changed, no logic/JSX-structure lines touched
