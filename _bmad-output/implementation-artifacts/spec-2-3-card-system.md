---
title: 'Card System'
type: 'feature'
created: '2026-09-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '483e29e768f255ffc1e7a0f603fad2ac9fa918b4'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** No card primitives exist yet. DESIGN.md defines three visually distinct chrome levels (`card`, `card-accent`, `aggregate-badge`) that must stay clearly distinguishable so a user can tell at a glance whether they're looking at general content, a personal "moment," or an aggregate rollup — but nothing enforces that distinction today.

**Approach:** Add `src/components/ui/Card.tsx` (`{colors.paper-deep}` background, `{rounded.lg}`, `elevation.card`, `{spacing.6}` padding — the base color-blocked unit), `CardAccent.tsx` (`{colors.indigo}` fill, `{colors.paper-deep}` text, `{rounded.lg}`, `elevation.raised` — a visually distinct sibling component, not a `Card` variant prop, so its use at each call site is a deliberate, separate import matching DESIGN.md's own Do's/Don'ts: "Do use `card-accent` only for dashboard-home moment cards. Don't apply it to admin/aggregate screens"), and `AggregateBadge.tsx` (`{colors.surface-2}` background, `{colors.ink-soft}` text, `{rounded.full}`, `{typography.caption}` font — deliberately outside the indigo/coral palette per UX-DR35, reading "Vista agregada — [N] personas"). Each carries a doc comment stating its DESIGN.md-mandated usage boundary, since the actual enforcement is a naming/convention discipline (a human choosing the right component per call site), not something code can check.

## Boundaries & Constraints

**Always:**
- `CardAccent` is a separate component from `Card`, never a `variant="accent"` prop — this makes misuse (importing the wrong one) visible at the import line, and matches DESIGN.md's framing of them as distinct chrome levels.
- `AggregateBadge`'s content is generic (children-based, e.g. "Vista agregada — 12 personas"), not hardcoded to any specific count format.
- All three: pure presentation, no `"use client"`, no data-fetching imports, `ButtonHTMLAttributes`-equivalent passthrough pattern isn't needed here (these aren't interactive) — just `HTMLAttributes<HTMLDivElement>`/`<HTMLSpanElement>` plus `className` passthrough, matching Story 2.2's established pattern (default export, forwardRef, since later stories may need refs for measurement/scroll-into-view).

**Never:**
- Do not wire these into any existing page — net-new, unimported files, same as Story 2.2.
- Do not add a `variant` prop unifying `Card`/`CardAccent` into one component — the whole point is they stay visually and structurally distinct choices.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `<Card>...</Card>` | default | `bg-paper-deep`, `rounded-brujula-lg`, `shadow-card`, `p-6` | N/A |
| `<CardAccent>...</CardAccent>` | default | `bg-indigo`, `text-paper-deep`, `rounded-brujula-lg`, `shadow-raised` | N/A |
| `<AggregateBadge>Vista agregada — 12 personas</AggregateBadge>` | default | `bg-surface-2`, `text-ink-soft`, `rounded-full`, `font-caption text-caption` | N/A |
| Any component, `ref` passed | forwardRef | ref reaches the underlying DOM node | N/A |

</frozen-after-approval>

## Code Map

- `src/app/globals.css` (Story 2.1) — tokens consumed: `--color-paper-deep`, `--color-indigo`, `--color-surface-2`, `--color-ink-soft`, `--radius-brujula-lg`, `--shadow-card`, `--shadow-raised`, `--text-caption`, `--font-caption`.
- `src/components/ui/ButtonPrimary.tsx` (Story 2.2) — established pattern to mirror: `forwardRef`, `className` array-join-filter-Boolean composition, plain doc comment citing DESIGN.md + this spec.
- DESIGN.md `components.card`/`card-accent`/`aggregate-badge` (frontmatter) and `## Do's and Don'ts` (card-accent's usage boundary), `## Components` prose (aggregate-badge's exact copy pattern "Vista agregada — [N] personas").

## Tasks & Acceptance

**Execution:**
- [x] `src/components/ui/Card.tsx` (new)
- [x] `src/components/ui/CardAccent.tsx` (new)
- [x] `src/components/ui/AggregateBadge.tsx` (new)
- [x] Verify via the same create/build/inspect-CSS/delete technique Stories 2.1/2.2 used

**Acceptance Criteria:**
- Given `card` and `card-accent`, when built, then `card-accent`'s indigo fill is used only in components explicitly marked for dashboard-home "moments," never for aggregate views (enforced by being a separate component + doc comment, not a shared variant).
- Given `aggregate-badge`, when built, then it uses `surface-2`, deliberately outside the indigo/coral palette.

## Implementation Notes

- `CardAccent` and `AggregateBadge` intentionally carry no `p-6`/padding utility — the frozen I/O matrix's expected-output cells list padding (`p-6`) only for `Card`'s row, omitting it for the other two; implementation follows that literally. Callers needing internal spacing on `CardAccent`/`AggregateBadge` pass it via `className`.
- `AggregateBadge` renders a `<span>` (inline pill), while `Card`/`CardAccent` render a `<div>` (block container) — both are `HTMLAttributes`-typed per the spec's constraint; the element choice follows each one's role (pill vs. color-blocked block) rather than being separately specified.
- All three follow Story 2.2's `ButtonPrimary`/`ButtonSecondary` pattern exactly: default export, `forwardRef`, array-join-filter-Boolean `className` composition, no `"use client"`, no data imports.

## Spec Change Log

## Review Triage Log

- **Token-name mismatch: Code Map cites `--color-paper-deep` etc., Verification's compiled-CSS output shows `var(--paper-deep)`** — Blind Hunter finding. Verdict: **false**. Both are correct and consistent: `--color-paper-deep` is the Tailwind `@theme inline` namespace key (drives `bg-paper-deep` utility generation), `--paper-deep` is the underlying plain custom property it aliases to (Story 2.1's deliberate two-layer design enabling live dark-mode overrides). Tailwind's compiled output referencing the plain variable directly is expected, not a discrepancy.
- **`sprint-status.yaml` shows `in-progress` while spec shows `in-review`** — Blind Hunter finding. Verdict: **false**. Expected mid-workflow snapshot state, same pattern as every prior story at this exact point.
- **`baseline_commit` doesn't resolve** — Blind Hunter finding. Verdict: **false**. Independently re-verified: `git cat-file -t` resolves it cleanly in `brujula-core`. Same wrong-repository false-positive class seen repeatedly in this epic's reviews.
- **Verification's shadow-value rows use `...` elision, undermining the "exact match" claim** — Blind Hunter finding. Verdict: **false/negligible**. A prose-brevity convention in the write-up, not a gap in what was actually checked (the underlying compiled-CSS grep confirmed full values; only the summary elided repetitive box-shadow stops).
- **No check confirming the *absence* of `p-6` on `CardAccent`/`AggregateBadge`, no automated test/snapshot left behind, I/O matrix omits edge cases like empty children/long text** — Blind Hunter findings. Verdict: **false/consistent-with-precedent**. Matches the same manual-verification-only pattern already established and accepted in Stories 2.1/2.2 for this class of pure-presentational, branch-free component; nothing here is a new deviation.
- **`AggregateBadge` has no ARIA/role marker distinguishing it for assistive tech, despite UX-DR35's rollup-vs-individual distinction** — Blind Hunter finding. Verdict: **false**. The distinction is carried by the component's own text content ("Vista agregada — [N] personas"), which a screen reader already reads aloud identically to how a sighted user reads it — no additional marker is needed for a badge whose entire content is descriptive text.
- **`context: []` doesn't list Stories 2.1/2.2 as dependencies despite the Code Map citing them** — Blind Hunter finding. Verdict: **false/consistent-with-precedent**. The Code Map already inlines every fact the implementer needs from those prior stories (token names, established pattern) directly as text — `context:` is for files that need loading fresh, not for citing already-distilled prior sources, matching Stories 2.1/2.2's own identical `context: []`.
- Edge Case Hunter and Verification Gap independently reported zero findings, confirming every checkable claim in Intent/Tasks & Acceptance against the actual code.

## Verification

**Commands:**
- `npm run build` -- succeeds, same route list ✅ (verified)
- `npm run lint` -- no new violations ✅ (1 pre-existing unrelated warning in `scripts/seed-company-360.mjs`)
- `npx tsc --noEmit` -- no new errors ✅ (clean)
- Manual compiled-CSS inspection per the Tasks list ✅ — temporarily imported all three into a throwaway route (`src/app/verify-cards-tmp/page.tsx`), ran `npm run build`, grepped `.next/static/chunks/*.css` for the exact expected rules, then deleted the throwaway route and rebuilt to confirm the route list returned to baseline. Confirmed exact matches:
  - `.bg-paper-deep{background-color:var(--paper-deep)}`
  - `.rounded-brujula-lg{border-radius:22px}`
  - `.shadow-card{...0 1px 2px ..., 0 8px 20px ...}`
  - `.bg-indigo{background-color:var(--indigo)}`
  - `.shadow-raised{...0 10px 28px ...}`
  - `.bg-surface-2{background-color:var(--surface-2)}`
  - `.text-ink-soft{color:var(--ink-soft)}`
  - `.rounded-full{border-radius:3.40282e38px}`
  - `.font-caption{font-family:Inter,Segoe UI,system-ui,sans-serif}`
  - `.text-caption{font-size:13px;...}`
