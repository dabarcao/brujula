---
title: 'Design Token System'
type: 'feature'
created: '2026-09-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7088a6dcf387b4bf326a4511a99ead2a2856dc3d'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/app/globals.css` only has the Next.js scaffold's `--background`/`--foreground` pair (light/dark). None of DESIGN.md's "Brújula Segura" tokens (colors, typography, radius, spacing, elevation) exist in code yet — every later component/screen restyle story (2.2–2.7, then Epic 4) needs them as its foundation.

**Approach:** Implement every color, typography, `rounded`, `spacing`, and elevation token from DESIGN.md's frontmatter as Tailwind v4 `@theme` entries in `globals.css`, using Tailwind v4's namespace convention (`--color-*` → `bg-*`/`text-*`/`border-*` utilities, `--font-*` → `font-*`, `--text-*` (+ paired `--text-*--line-height`) → `text-*` size utilities, `--radius-*` → `rounded-*`, `--spacing-*` → named spacing utilities alongside the untouched numeric scale, `--shadow-*` → `shadow-*`). Dark-mode pairing follows the *same pattern the existing `--background`/`--foreground` pair already uses*: each token is defined once in `@theme` (light value), then every `-dark` counterpart overrides the same custom property inside the existing `@media (prefers-color-scheme: dark)` block — so `bg-indigo`/`text-ink`/etc. automatically resolve to the dark value under dark mode with no `dark:` variant needed anywhere else in the codebase, matching DESIGN.md's own framing ("pairs every token above with a `-dark` suffix... following `prefers-color-scheme`").

**Decided without asking (repo convention, investigated not guessed):** `src/app/layout.tsx` has an explicit existing comment rejecting `next/font/google` ("evita una dependencia de red en tiempo de build"), and this environment has no way to fetch or self-host real Sora/Inter font files without a network call that convention forbids. `{typography.*}.fontFamily` tokens are therefore implemented as literal CSS font-stack strings exactly as DESIGN.md specifies them (`'Sora', 'Segoe UI', system-ui, sans-serif` etc.) — correct and complete as *tokens*, but Sora/Inter will only actually render for users who happen to have them installed locally until a future story makes a deliberate, separate call on font loading (self-hosted static files being the network-independent option, not attempted here since no such files are available in this environment). This is a known, documented limitation, not a defect.

**DESIGN.md's `spacing` scale (1=4px…16=64px) is Tailwind v4's default scale already** (base unit 4px = `0.25rem` at 16px root) — confirmed by checking Tailwind v4's default `--spacing` multiplier. No override needed for the numbered steps; only `spacing.gutter` (20px) is a genuinely new named token.

## Boundaries & Constraints

**Always:**
- Every light-mode token from DESIGN.md's frontmatter (`colors`, `typography`, `rounded`, `spacing.gutter`, `elevation`) gets a corresponding `@theme` entry; every `-dark` color counterpart is wired via the existing `prefers-color-scheme` media block, not a new mechanism.
- The existing `--background`/`--foreground` pair and their consumption in `body { background: var(--background); ... }` are preserved or deliberately superseded — not silently broken (per this story's own 2nd AC). Decide during implementation which, and record the choice.
- No `components` section from DESIGN.md's frontmatter (button-primary, card, etc.) is implemented here — those are Stories 2.2–2.5's job; this story is tokens only.

**Never:**
- Do not add `next/font/google`, a Google Fonts `<link>`, or any other network font fetch — matches the existing, deliberate repo convention.
- Do not touch any component or page file — `globals.css` only (plus, if needed, a small tsconfig/type addition purely for the CSS build, nothing runtime).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `npm run build` (light mode default) | none | every DESIGN.md token resolves to its light value; build succeeds | N/A |
| `prefers-color-scheme: dark` | OS/browser dark mode | every color token with a `-dark` counterpart resolves to that dark value | N/A |
| A utility class using a new token (e.g. `bg-indigo`, `rounded-lg`, `text-display`, `shadow-card`) | any component using it | Tailwind generates the correct CSS rule at build time (verified via built output, not just theory) | N/A |
| Existing `--background`/`--foreground` usage | current `body` styling | still resolves correctly post-change (preserved or deliberately, visibly superseded) | N/A |

</frozen-after-approval>

## Code Map

- `src/app/globals.css` — the only file this story touches; currently 18 lines, Next.js scaffold only (`--background`/`--foreground`, Geist font vars that don't actually exist anywhere since `next/font` isn't used — `--font-sans`/`--font-mono` in the current `@theme inline` block reference undefined custom properties).
- `src/app/layout.tsx` — read-only reference: confirms the "no next/font/google, system stack only" convention via its own comment; not modified by this story.
- `_bmad-output/planning-artifacts/ux-designs/ux-brujula-gui-2026-09-11/DESIGN.md` — source of every token value (frontmatter `colors`/`typography`/`rounded`/`spacing`/`elevation` blocks). `components` section explicitly out of scope for this story.
- Tailwind v4.3.3 (`node_modules/tailwindcss/package.json`) — CSS-first config, no `tailwind.config.js`. Verify exact theme-namespace behavior (`--text-*` paired line-height syntax, unprefixed `--radius` for the `rounded` DEFAULT utility, etc.) against the installed version's actual generated output during implementation — do not assume from general Tailwind v4 knowledge without confirming a real build.
- No existing component in `src/` references any DESIGN.md token name yet (this is genuinely first-use infrastructure) — nothing else can break from renaming/adding tokens.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/globals.css` -- add every DESIGN.md color token (light values in `@theme`, dark values inside the existing `prefers-color-scheme: dark` block) as `--color-*`
- [x] `src/app/globals.css` -- add typography tokens (`--font-display`, `--font-heading`, `--font-heading-sm`, `--font-body`, `--font-caption`, `--font-data` for font-family; `--text-*` + paired line-height for each named size/weight combination DESIGN.md defines)
- [x] `src/app/globals.css` -- add `--radius-sm/md/lg/full` and the DEFAULT (14px) radius
- [x] `src/app/globals.css` -- add `--spacing-gutter: 20px` (numbered steps need no override, already Tailwind's default scale -- confirm this claim against a real build before relying on it)
- [x] `src/app/globals.css` -- add `--shadow-card`, `--shadow-raised`, `--shadow-floating` from `elevation`
- [x] Decide and implement how `--background`/`--foreground` relate to the new `paper`/`paper-deep`/`ink` tokens (superseded vs. preserved) -- record the decision in Implementation Notes
- [x] Verify: run the actual build (`npm run build` or equivalent) and confirm generated CSS contains the expected utility classes for a representative sample (a color, a radius, a font size, a shadow) -- do not just trust the `@theme` syntax is correct by inspection

**Acceptance Criteria:**
- Given DESIGN.md's frontmatter token tables, when implemented, then every light-mode token and its `-dark` counterpart exists and resolves correctly under `prefers-color-scheme` (verified against a real build, not just source inspection).
- Given the existing minimal `globals.css`, when the new tokens are added, then the existing background/foreground behavior is preserved or deliberately superseded, not silently broken.

## Implementation Notes

**`--background`/`--foreground` -- superseded, not preserved.** Grepped `src/` for every consumer of `--background`/`--foreground`/`bg-background`/`text-foreground`: only `globals.css` itself referenced them (`body { background: var(--background); color: var(--foreground); }`). Nothing else in the codebase used them, so they were removed outright rather than kept as a parallel/legacy pair. `body` now reads `background: var(--paper); color: var(--ink); font-family: var(--font-body);`.

**`--font-sans` repointed, not left dangling.** The pre-existing `@theme inline` block had `--font-sans: var(--font-geist-sans)`, and `--font-geist-sans` is never defined anywhere (no `next/font` usage, confirmed via `layout.tsx`'s own "evita una dependencia de red" comment) -- so the `font-sans` utility that `layout.tsx`'s `<body className="... font-sans">` already applies was silently invalid CSS before this change. `--font-sans` now resolves to `var(--font-body)` (the Inter/system stack), fixing that dangling reference as a natural side effect of wiring the new typography tokens -- no component/page file was touched to do this, only the token definition in `globals.css`.

**`typography.caption`'s missing `lineHeight`.** DESIGN.md's frontmatter defines `caption: { fontFamily, fontSize: '13px', letterSpacing: '0.02em' }` with no `lineHeight` key, but the prose Typography section states the full scale as "`{typography.caption}` 13/18". Used `18px` for `--text-caption--line-height`, sourced from that prose scale line rather than inventing a value, since the frontmatter's omission reads as incompleteness rather than an intentional "no line-height" decision.

**Tailwind v4.3.3 namespace behavior -- verified against a real build, not assumed:**
- Bare `--radius: 14px` (unprefixed, the same name Tailwind's own default theme marks "Deprecated") does drive the bare `rounded` utility in this version: confirmed compiled output `.rounded{border-radius:14px}`.
- `--text-<name>`, paired with `--text-<name>--line-height`, `--text-<name>--font-weight`, and `--text-<name>--letter-spacing` all compose onto the one `text-<name>` utility class as expected (e.g. `.text-display{font-size:32px;line-height:var(--tw-leading,40px);letter-spacing:var(--tw-tracking,-.01em);font-weight:var(--tw-font-weight,700)}`).
- DESIGN.md's numbered `spacing` scale (1=4px ... 16=64px) is exactly Tailwind v4's default `--spacing: 0.25rem` multiplier at the default 16px root -- confirmed no override was needed; only `--spacing-gutter: 20px` was added, and it compiles correctly for arbitrary spacing utilities (confirmed `.p-gutter{padding:20px}` in a throwaway test).
- Verification method: since no component in `src/` references any of these token names yet (first-use infrastructure, per Code Map), a temporary throwaway page (`src/app/_token_verify_tmp/page.tsx`) referencing every new utility class was added, `npm run build` was run, the compiled `.next/static/chunks/*.css` was inspected for each class, and the temporary page was then deleted before the final build/lint pass below -- it is not part of this story's diff.

## Spec Change Log

## Review Triage Log

- **New `--radius-sm/lg` and bare `--radius` values collide with Tailwind v4's own reserved defaults (confirmed against `node_modules/tailwindcss/theme.css`: stock `--radius-sm: 0.25rem`, `--radius-lg: 0.5rem`, bare `--radius: 0.25rem`), silently changing the `rounded`/`rounded-sm`/`rounded-lg` utility classes everywhere they're already used across ~10+ untouched, not-yet-redesigned pages** (`ResponderWizard.tsx`, `EvaluatorPicker.tsx`, `admin/page.tsx`, `registro/page.tsx`, `dashboard/members/page.tsx`, `dashboard/cycles/[id]/page.tsx`, and more) — Verification Gap main finding. Verdict: **high**. Confirmed real and demonstrated: a 3-4x radius jump (4px→14px, 8px→22px) on screens with zero visual/render test coverage anywhere in this repo, contradicting this story's own frozen Boundary ("do not touch any component or page file... tokens only") in spirit — the mechanism (shared global Tailwind theme variable) reaches those files even though no file was edited, and directly conflicts with the epic's own phased rollout (per-domain restyle only after that domain's backend migration + dedicated redesign story, not a repo-wide jump on token-introduction day). Routes to **patch**: rename to non-colliding custom keys (`--radius-brujula-sm/md/lg`) that only future, deliberate restyle stories opt into; leave Tailwind's own `rounded`/`rounded-sm`/`rounded-lg`/`rounded-full` at their stock values for now.
- **`typography.data`'s `font-variant-numeric: tabular-nums` sub-property — the whole reason DESIGN.md defines this token — was never implemented, only its `fontFamily` half** — Blind Hunter finding. Verdict: **low-medium**, real: the frozen Intent commits to "every... typography... token," and Tailwind v4's `--font-*` namespace only ever maps to `font-family`, not `font-variant-numeric` — a plain companion CSS rule is needed. Routes to **patch**.
- **No `color-scheme: light dark` declared on `:root`, so native form controls/scrollbars won't follow the new dark palette even though every custom color token now has one** — Blind Hunter finding. Verdict: **low**, real, trivial one-line fix. Routes to **patch**.
- **Claims the diff doesn't exist / doesn't match the repository, `baseline_commit` doesn't resolve, `git status` shows an unrelated file changed** — Blind Hunter findings 1-2 (and framing for 5). Verdict: **false**. Independently re-verified directly against `brujula-core`: the spec file exists, `git status` shows exactly `globals.css`/`sprint-status.yaml`/the new spec file, and `git cat-file -t` confirms the baseline commit resolves cleanly. Same wrong-repository false-positive class seen in earlier stories' reviews (the cited "unrelated file," `dashboard/cycles/page.tsx`, is `brujula-gui`'s stale uncommitted state from outside this initiative, not anything in `brujula-core`).
- **`--font-mono: var(--font-geist-mono)` deleted without the same due-diligence shown for `--font-sans`** — Blind Hunter finding, Edge Case Hunter finding (low confidence). Verdict: **false**. Independently verified via `grep -rn "font-mono" src/` — zero consumers anywhere, exactly like `--font-sans` was before its fix; the removal is safe, just under-documented in Implementation Notes (a paperwork gap, not a functional one).
- **Code Map states `globals.css` was "18 lines" before this change; the diff's hunk header shows 26** — Blind Hunter finding. Verdict: **false/negligible**. A backward-looking miscount in non-frozen, informational Code Map text with zero forward consequence — rejected, not worth a fix.
- **`--radius-xl/2xl/3xl/4xl` (Tailwind's stock larger sizes) are untouched by this diff, so components using them get unbranded values** — Edge Case Hunter finding. Verdict: **false**. DESIGN.md's `rounded` token table has no value at all for those sizes — leaving them at Tailwind stock is the only sensible behavior, not a gap.
- **`--shadow-sm/md/lg/xl/2xl` (Tailwind's stock shadow scale) are untouched, so components using them get pure-black shadows, contradicting the "never pure black" elevation principle** — Edge Case Hunter finding. Verdict: **false**. This diff never touches that namespace at all — Tailwind's stock shadow utilities were already black-tinted before this story and remain exactly as they were; not a regression this diff introduced.
- **`sprint-status.yaml` shows `in-progress` while the spec's own frontmatter says `in-review`** — Blind Hunter finding. Verdict: **false**. Expected mid-workflow state, same pattern as every prior story at this exact point (step-05, not yet reached, is what syncs it).

## Verification

**Commands:**
- `npm run build` -- ran clean before this change (baseline; no pre-existing `LayoutProps` error was actually present) and again after: `✓ Compiled successfully`, `Finished TypeScript`, all 18 routes generated, identical route list to baseline. Ran a third time after removing the temporary verification page, as the final state.
- `npm run lint` -- `0 errors`, 1 pre-existing unrelated warning in `scripts/seed-company-360.mjs` (`idByEmail` unused var), not touched by this story.
- Manual: inspected `.next/static/chunks/*.css` after building with a temporary all-tokens test page (see Implementation Notes) -- confirmed correct compiled output for a representative sample: `.bg-indigo{background-color:var(--indigo)}`, `.rounded{border-radius:14px}`, `.rounded-lg{border-radius:22px}`, `.text-display{font-size:32px;line-height:var(--tw-leading,40px);letter-spacing:var(--tw-tracking,-.01em);font-weight:var(--tw-font-weight,700)}`, `.shadow-card{--tw-shadow:0 1px 2px var(--tw-shadow-color,#1c203a0f), 0 8px 20px var(--tw-shadow-color,#1c203a14);...}`, `.p-gutter{padding:20px}`; confirmed the dark-mode media block carries every `-dark` value (`@media (prefers-color-scheme:dark){:root{--paper:#171a2e;...--indigo:#96a3ff;...}}`); confirmed `body{background:var(--paper);color:var(--ink);font-family:var(--font-body)}`. Temporary page removed before the final build/lint run above; `git status` shows only `src/app/globals.css` modified under `src/`.
