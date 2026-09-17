---
title: 'Feedback Screens Redesign'
type: 'feature'
created: '2026-09-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd8bdcf0'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** epics.md's own opening line scopes this story as "`/dashboard/feedback/**` restyled with the same reveal-gate and threshold treatment as cycles" — broader than just the 2 literal AC criteria (reuse the pattern; style the saboteadores block). Three sibling pages under this tree are still fully pre-redesign.

**Approach:** Investigated the actual current state of every `/dashboard/feedback/**` page rather than assuming Story 4.2's own narrowing note ("Story 4.3's remaining scope narrows to saboteador-bar styling... plus final confirmation") covered everything. Confirmed by direct read: `src/app/dashboard/feedback/nueva/page.tsx`, `nueva-360/page.tsx`, and `[id]/gestionar/page.tsx` are genuinely untouched (13/7/5 pre-redesign class matches respectively, zero design-token classes) — Story 4.2's own scope was `/dashboard/cycles/**` plus the shared report page only, never these 3. This story's real remaining work is: (1) restyle these 3 sibling pages with the established Story 4.1/4.2 conventions, (2) close the one gap Story 4.2's own review explicitly disclosed rather than fixed — the saboteadores block (`SaboteadoresReport`, `dashboard/feedback/[id]/page.tsx:238`) was already fully token-restyled by Story 4.2 (confirmed: `rounded-brujula-sm`, `bg-saboteador-wash`, `var(--saboteador-tint)`) but never visually verified with real populated data, since the seed script never submits saboteador-tagged self-evaluation answers, (3) confirm (not rebuild) that Story 4.2's reveal-gate/threshold/draw-in already correctly serves ad-hoc reports, per this story's own literal AC.

**Investigated (not guessed): `SaboteadoresReport` needs no code changes, only a real fixture to finally verify against.** Read the component directly — it already uses every relevant token (`var(--saboteador-tint)` for high scores, `var(--ink-soft)`/`var(--ink)` for text, `bg-saboteador-wash`/`rounded-brujula-sm` for the bar) with a code comment recording the deliberate "always softer than the competency radar, never red/coral" decision. This story's own job for that specific AC criterion is producing a genuine saboteador-populated fixture (submitting real self-evaluation answers to the 10 saboteador-tagged scale questions, which no seed script in this repo currently does) and screenshotting it — not touching the component's markup.

## Boundaries & Constraints

**Always:** Restyle the 3 sibling pages using the exact conventions Story 4.1 (`Card`/`ButtonPrimary`/`ButtonSecondary`/`ErrorBanner`/tokens) and Story 4.2 (`RoleBadge`-shape conventions where relevant) already established — no new component invented. Saboteadores block stays visually softer/lower-contrast than the competency radar on the same page (already true; do not change this). Reveal-gate/threshold/draw-in for ad-hoc reports must remain byte-identical to what Story 4.2 already built in the shared file — verify, don't reimplement.

**Never:** Do not modify `src/app/dashboard/feedback/[id]/page.tsx`'s reveal-gate/threshold/draw-in logic, `RevealGate.tsx`, `CompetencyComparisonChart.tsx`, or `CompetencyRadar.tsx` (Story 4.2's files, already correct and reviewed) except for a documented, investigated bug fix if this story's own verification pass finds one. Do not modify any Server Action, RPC call, or data-fetching logic (`src/app/actions/feedback.ts`, `src/server/**` stay untouched). Do not add saboteador-tagged answer submission to any existing seed script used by automated tests (`scripts/seed-demo-company.mjs`) — build the fixture via a throwaway, uncommitted script for this story's own manual verification only, to avoid changing any other story's already-frozen test fixtures.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `/dashboard/feedback/nueva`, restyled | any authenticated member | `Card`/`ButtonPrimary`/token-styled form | N/A |
| `/dashboard/feedback/nueva-360`, restyled | individual-org member | `Card`/`ButtonPrimary`/token-styled form | N/A |
| `/dashboard/feedback/[id]/gestionar`, restyled | requester managing evaluators | restyled `EvaluatorPicker`-based page | N/A |
| Ad-hoc report, self-evaluation, saboteadores present | real self-eval answers to all 10 saboteador questions | `SaboteadoresReport` renders with real data, softer than the radar | N/A |
| Ad-hoc report, below/above threshold | any state | same reveal-gate/threshold-not-met behavior Story 4.2 already verified for cycles | N/A |

</frozen-after-approval>

## Code Map

- `src/app/dashboard/feedback/nueva/page.tsx`, `nueva-360/page.tsx`, `[id]/gestionar/page.tsx` -- the 3 genuinely untouched pages to restyle.
- `src/app/dashboard/feedback/[id]/page.tsx:238-273` -- `SaboteadoresReport`, already token-restyled by Story 4.2; read-only reference, do not modify unless a real bug is found.
- `src/app/dashboard/cycles/page.tsx`, `nueva/page.tsx`, `[id]/page.tsx` (Story 4.1/4.2) -- exact restyle conventions to mirror for the 3 sibling pages here (same domain shape: a list page, a creation form, an evaluator-organizing page).
- `src/components/EvaluatorPicker.tsx` (Story 4.2, already restyled) -- reused as-is by `gestionar/page.tsx`.
- `supabase/migrations/0061_saboteadores.sql` -- the 10 saboteador-tagged `survey_questions` (self_only, scale type) needed to build a real fixture.
- `scripts/seed-demo-company.mjs` -- read-only reference for the self-evaluation answer-submission pattern to extend in a throwaway fixture script (not committed, not modifying this file).

## Tasks & Acceptance

**Execution:**
- [x] `src/app/dashboard/feedback/nueva/page.tsx` -- restyle
- [x] `src/app/dashboard/feedback/nueva-360/page.tsx` -- restyle
- [x] `src/app/dashboard/feedback/[id]/gestionar/page.tsx` -- restyle
- [x] Build a throwaway (uncommitted) fixture with real saboteador self-evaluation answers; screenshot `SaboteadoresReport` with real data
- [x] Screenshot an ad-hoc report's reveal-gate/threshold-not-met states, confirming Story 4.2's mechanism already correctly serves the `!isCycle` branch

**Acceptance Criteria:**
- Given Story 3.18 has landed (confirmed done), when these screens are restyled, then they reuse the same reveal-gate, threshold-not-met, and axis-draw-in patterns established in Story 4.2 — not a divergent reimplementation
- Given the saboteadores block on a self-evaluation report, when rendered with real data, then it uses `saboteador-bar` at its deliberately softer, lower-contrast treatment relative to the competency radar on the same page

## Implementation Notes

Restyled all 3 genuinely untouched sibling pages (`nueva/page.tsx`, `nueva-360/page.tsx`, `[id]/gestionar/page.tsx`) plus `src/components/EmailEvaluatorPicker.tsx` (not in the original Code Map, but justified and added since it's rendered directly on 2 of the 3 in-scope pages and would have clashed against the restyled surroundings otherwise) using the established `Card`/`ButtonPrimary`/`ButtonSecondary`/`ErrorBanner`/token conventions from Stories 4.1/4.2. `SaboteadoresReport` (`dashboard/feedback/[id]/page.tsx:238`) needed zero code changes -- confirmed already fully token-restyled by Story 4.2, confirmed via a zero-line `git diff` on the whole file.

A genuine saboteador-populated fixture was built for the first time this session (a `!isCycle` gap explicitly disclosed but not closed by Story 4.2's own review) -- via the individual-account 360 path (`create_individual_cycle_request`, migration 0057), which reuses the base survey template directly rather than cloning it. This surfaced a real, confirmed production bug: `create_feedback_cycle`'s company/org-cycle cloning loop (migration `0023_one_open_cycle_at_a_time.sql:85-94`) never copies `self_only`/`saboteador_code` (added later by migration `0061_saboteadores.sql`) when cloning questions into a new per-cycle template -- every company/org 360 cycle since 0061 landed has its 10 saboteador questions silently leak to peer evaluators and permanently returns zero rows from `get_request_saboteadores()`. Out of this UI-only story's explicit boundary to fix (migrations/RPCs off-limits); logged to `deferred-work.md` with full technical detail and a recommendation to prioritize it as its own bug-fix story ahead of remaining cosmetic Epic 4 work, since it's a live product defect, not a redesign gap.

## Spec Change Log

## Review Triage Log

3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap) run against the diff at baseline `d8bdcf0`.

- **[patch, high]** Blind Hunter: `gestionar/page.tsx`'s two picker invocations (`EmailEvaluatorPicker`, `EvaluatorPicker`) omitted the `primary` prop despite being this page's sole submit action -- the one restyled page in this diff breaking the "sole action is primary" convention every analogous screen in this codebase (including this story's own `nueva`/`nueva-360` pages, and Story 4.2's direct `cycles/[id]/page.tsx` precedent) already follows. Patched: added `primary` to both invocations.
- **[patch, high]** Blind Hunter + Edge Case Hunter, independently converged: `EmailEvaluatorPicker.tsx`'s inline `formError` (invalid/duplicate email) was changed from `text-red-700` to bare `text-ink` -- identical color to ordinary body text, no border/box/weight, essentially invisible feedback for a mistyped email, affecting all 3 of this story's pages via the shared component. Patched: added a compact bordered/tinted inline box (`border-line`/`bg-surface-2`/`rounded-brujula-sm`) with a small warning-circle icon and `font-medium` text -- genuine visual weight without red/coral, matching `ErrorBanner`'s own established neutral-box convention but sized for an inline field message. Verified live: screenshotted a real triggered validation error (`"not-an-email" no parece un email válido.`), clearly distinct from surrounding text.
- **[patch, medium]** Edge Case Hunter: the "Añadir" button's `className={\`${buttonSecondaryClassName} text-sm px-4 py-2\`}` appended a second, conflicting padding pair after `buttonSecondaryClassName`'s own baked-in `px-6 py-3` -- Tailwind's generated-stylesheet rule order (not string/source order) determines which wins, making the button's actual rendered size fragile to unrelated build changes elsewhere in the codebase. Patched: replaced the string-concatenation with the button's classes spelled out explicitly (matching `ButtonSecondary.tsx`'s own class list) so only one padding pair is ever present. Verified live: button renders at a reasonable, intentional-looking size.
- **[patch, low]** Edge Case Hunter: `EmailEvaluatorPicker.tsx`'s email `<td>` and `EvaluatorPicker.tsx`'s colleague name/email span had no `truncate`/`break-words` inside fixed-width columns -- the same class of regression Story 4.1 shipped and had to patch, pre-existing but on lines this story's own diff already touched (color tokens added). Patched: added `break-words` to both.
- **[false]** Neither reviewer found any issue with `SaboteadoresReport` (confirmed zero-diff), the file-scope claim, the 3 sibling pages' pre-redesign baseline characterization, or the `create_feedback_cycle` bug diagnosis itself (independently re-verified by Verification Gap via direct migration read) -- all held exactly as claimed.

Note: the initial patch-dispatch subagent crashed mid-run (transient network error) after applying all 4 code fixes correctly but before writing this Review Triage Log/Implementation Notes update -- the orchestrator independently verified each of the 4 fixes directly (grep + code read) and re-ran all automated checks plus a live screenshot of the inline-error fix before finalizing.

## Verification

**Commands (actual, run independently by the orchestrator after the review-triage patch):**
- `npm run lint` -- 0 errors, 1 pre-existing unrelated warning (`scripts/seed-company-360.mjs:128`)
- `npx tsc --noEmit` -- clean
- `npm run test` -- 525/525 passed, 31 files

**Manual checks (UI/visual, real Playwright + local headless Chromium screenshots, actually inspected):**
- `/dashboard/feedback/nueva`, `/nueva-360`, `/[id]/gestionar` -- light/dark, company/individual branches: restyled, `primary` correctly wired per context (sole-action pages primary, `gestionar`'s editing context now also primary post-patch).
- `SaboteadoresReport` with real saboteador self-evaluation data (built via the individual-account 360 path, since the company-cycle path is blocked by the newly-discovered `create_feedback_cycle` cloning bug) -- confirmed visually softer/lower-contrast than the same page's competency radar, in both themes.
- Ad-hoc threshold-not-met and reveal-gate collapsed/expanded states -- confirmed parity with Story 4.2's cycle-report behavior (light theme fully; dark theme confirmed for collapsed, not separately re-screenshotted expanded -- low risk, same shared component/tokens as the already-dark-verified cycle report).
- Inline email-validation error (post-patch) -- triggered live on the individual-account `nueva/page.tsx` branch, screenshotted: `"not-an-email" no parece un email válido.` in a bordered/tinted box with a warning icon, clearly distinct from surrounding text.
