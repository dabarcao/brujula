---
title: 'Core Interactive Primitives'
type: 'feature'
created: '2026-09-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5a5ca9d2879c32805f6cdb5009d86cbe1a5fa1ec'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** No shared component library exists yet (`src/components/ui/` doesn't exist) — every button on every screen is hand-styled inline, and none of DESIGN.md's `button-primary`/`button-secondary`/`reveal-button`/`focus-ring` specs are implemented anywhere.

**Approach:** Create `src/components/ui/ButtonPrimary.tsx`, `ButtonSecondary.tsx`, and `RevealButton.tsx` — thin wrappers around native `<button>` using Story 2.1's tokens (`bg-indigo`, `rounded-brujula-lg`, `shadow-raised` for primary; transparent/`border-line`/`text-ink` for secondary; `bg-coral-deep`/`rounded-full`/`shadow-floating` for reveal, per DESIGN.md's explicit "not the base coral tone" AA-contrast rule). Each gets a `focus-visible` outline matching `components.focus-ring`: `outline-indigo` on paper backgrounds (secondary), `outline-paper-deep` on filled components (primary, reveal) — never plain `:focus`, so the ring only shows for keyboard navigation. Pure presentation only: no data-fetching, no `"use client"` (native `<button>` markup needs no browser-only API, so these stay usable from Server Components too, per AD-4's "presentation primitives, no data imports" rule) — the caller supplies `onClick`/`type`/form-related props via standard `ButtonHTMLAttributes` passthrough.

**Not wired into any existing page in this story** — these are net-new files nothing yet imports; Stories 2.6/2.7 (report groups, invitación) and Epic 4 are where real pages adopt them.

## Boundaries & Constraints

**Always:**
- Each component matches DESIGN.md's token spec exactly: `button-primary` = `{colors.indigo}` fill, `{colors.paper-deep}` text, `{rounded.lg}`, `elevation.raised`, heading-weight label. `button-secondary` = transparent fill, `{colors.line}` border, `{colors.ink}` text, `{rounded.lg}`, no elevation. `reveal-button` = `{colors.coral-deep}` fill (never base `coral` — DESIGN.md's own AA-contrast rule), `{rounded.full}`, `elevation.floating`.
- `focus-visible` (not `:focus`) outline: 2px, 2px offset, solid, drawn outside the element — `indigo` on `button-secondary` (paper background), `paper-deep` on `button-primary`/`reveal-button` (filled backgrounds), per DESIGN.md's `focus-ring` component spec.
- All three accept and forward standard `ButtonHTMLAttributes<HTMLButtonElement>` (including `disabled`, `type`, `onClick`, `aria-*`) plus `className` for one-off composition, matching how a plain `<button>` would be used today.

**Never:**
- No `"use client"` directive — these must stay renderable from Server Components.
- Do not import from `@/lib/supabase/*`, `@/server/*`, or any data-fetching module — pure presentation.
- Do not modify any existing page or component to adopt these yet — this story only creates the three files.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `<ButtonPrimary>Enviar</ButtonPrimary>` | default props | indigo fill, white text, `rounded-brujula-lg`, `shadow-raised` | N/A |
| `<ButtonSecondary>Cancelar</ButtonSecondary>` | default props | transparent fill, line-colored border, ink text, `rounded-brujula-lg`, no shadow | N/A |
| `<RevealButton>Mostrar mis resultados</RevealButton>` | default props | `coral-deep` fill (not base coral), white text, `rounded-full`, `shadow-floating` | N/A |
| Any of the three, keyboard `Tab` focus | `:focus-visible` | 2px solid outline, 2px offset, correct color for background (indigo on secondary, paper-deep on primary/reveal) | N/A |
| Any of the three, mouse click (no keyboard) | `:focus` but not `:focus-visible` | no visible outline (matches native `focus-visible` browser behavior) | N/A |
| `disabled` prop | `<ButtonPrimary disabled>` | native disabled behavior/styling, no custom override needed beyond what's specified | N/A |

</frozen-after-approval>

## Code Map

- `src/app/globals.css` (Story 2.1) — source of every token consumed here: `--color-indigo`, `--color-paper-deep`, `--color-line`, `--color-ink`, `--color-coral-deep`, `--radius-brujula-lg` (NOT bare `rounded-lg` — Story 2.1's review renamed these to avoid colliding with Tailwind's stock scale), `--shadow-raised`, `--shadow-floating`, `--font-heading`.
- No `src/components/ui/` directory exists yet — this story creates it for the first time.
- DESIGN.md's `components.button-primary`/`button-secondary`/`reveal-button`/`focus-ring` entries (frontmatter, lines ~108-178) and prose (`## Components` section) — exact source of every value used.
- No existing component in `src/components/` currently implements any of these patterns (confirmed via `grep -rn "type=\"submit\"\|<button"` — every existing button is hand-styled inline with ad hoc Tailwind classes, none referencing DESIGN.md tokens).

## Tasks & Acceptance

**Execution:**
- [x] `src/components/ui/ButtonPrimary.tsx` (new)
- [x] `src/components/ui/ButtonSecondary.tsx` (new)
- [x] `src/components/ui/RevealButton.tsx` (new)
- [x] Verify: a throwaway page (or Storybook-less manual build check) rendering all three, inspecting compiled CSS for the exact expected values, matching Story 2.1's own verification technique (create, build, inspect, delete)

**Acceptance Criteria:**
- Given `src/components/ui/`, when `button-primary`, `button-secondary`, and `reveal-button` are built, then each matches its DESIGN.md token spec exactly, including `reveal-button`'s `coral-deep` fill (not the base `coral` tone) for AA-legible white text.
- Given any of these components receives keyboard focus, when rendered, then `focus-ring` appears per its DESIGN.md spec (indigo on paper backgrounds, paper-deep on filled components).

## Implementation Notes

## Spec Change Log

## Review Triage Log

- **`RevealButton` has no icon slot, though DESIGN.md's `reveal-button` entry explicitly requires it be "paired with a small compass-glyph icon"** — Blind Hunter finding. Verdict: **medium**, real — and the omission originates in this spec itself (the frozen Intent/Boundaries/I-O matrix never mentioned the icon requirement), not just the code. Routes to **patch**: add a small inline SVG compass glyph inside `RevealButton` (no new icon-library dependency), rendered before the label.
- **None of the three components use `React.forwardRef`, so a `ref` cannot reach the underlying `<button>`** — Blind Hunter finding, Edge Case Hunter finding 3. Verdict: **low-medium**, real. No current consumer needs it yet, but retrofitting later (once Stories 2.6/2.7/Epic 4 wire these into many call sites) is far costlier than adding it now with zero consumers. Routes to **patch**.
- **No default `type="button"`; inside a `<form>` the native default becomes `type="submit"`, an easy latent bug for `ButtonSecondary`'s likely "Cancelar" use** — Blind Hunter finding, Edge Case Hunter finding 1 (independently, same claim). Verdict: **low-medium**, real, trivial fix. Routes to **patch**.
- **`className` string-concatenation doesn't reliably let callers override conflicting utilities, since Tailwind's generated-CSS order (not class-attribute order) decides precedence** — Blind Hunter finding. Verdict: **low**, real, but the correct fix (a merge utility like `tailwind-merge`) is a new dependency — bigger than this story's footprint, and no current consumer is exposed to it yet. Routes to **defer**.
- **Dark-mode behavior for these buttons isn't separately verified** — Blind Hunter finding. Verdict: **false**. These components consume the same `bg-indigo`/`bg-coral-deep`/etc. utility classes as everything else; dark-mode correctness is inherent to Story 2.1's already-reviewed token mechanism (CSS custom properties re-declared under `prefers-color-scheme`), not something each consuming component must separately implement.
- **No hover/active/pressed state, no disabled visual treatment beyond native default** — Blind Hunter finding. Verdict: **false**. DESIGN.md's own `button-primary`/`button-secondary`/`reveal-button` frontmatter entries specify no hover/active/disabled treatment at all — there is no token or spec text this story failed to implement; the source document is genuinely silent here.
- **No automated test, only a manual throwaway "create, build, inspect, delete" verification** — Blind Hunter finding. Verdict: **false**. Confirmed by Verification Gap's own independent check: this is the exact same, already-established pattern Story 2.1 used for the identical class of token-consuming change, not a new deviation.
- **No runtime warning when a button renders with no children and no `aria-label` (accessible-name gap)** — Edge Case Hunter finding 2. Verdict: **low**. Rejected: no current or planned icon-only button usage exists anywhere in this initiative's specs, and a runtime `console.warn` baked into a shared primitive isn't the idiomatic fix for this class of concern anyway (an ESLint `jsx-a11y` rule is the correct enforcement point, not per-component runtime code) — speculative for a scenario with zero demonstrated exposure.
- **Claims that Story 2.1's tokens don't exist in `globals.css`, that `bg-indigo`/`rounded-brujula-lg`/etc. generate no CSS, and that the `baseline_commit` doesn't resolve** — Blind Hunter finding 1, Edge Case Hunter findings 4-5 (claims). Verdict: **false**. Independently re-verified directly against `brujula-core`: `grep` confirms 7+ matches for these exact tokens in `globals.css` (added by the already-committed, already-reviewed Story 2.1), and `git cat-file -t` confirms the baseline commit resolves cleanly. Same wrong-repository false-positive class seen repeatedly in earlier stories' reviews.
- **Spec's own Tasks checklist left all items unchecked despite the diff completing them** — Verification Gap other finding. Verdict: **false/moot**, a paperwork gap fixed directly in this same update rather than needing a code patch.

## Verification

**Commands:**
- `npm run build` -- expected: succeeds, same route list as baseline
- `npm run lint` -- expected: no new violations
- `npx tsc --noEmit` -- expected: no new type errors
- Manual: compiled CSS inspection per the Tasks list, confirming exact token values and `focus-visible` (not `:focus`) selector usage
