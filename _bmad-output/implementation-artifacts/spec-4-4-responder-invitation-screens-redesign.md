---
title: 'Responder/Invitation Screens Redesign'
type: 'feature'
created: '2026-09-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4fdbba1'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/responder/[token]` and `ResponderWizard.tsx` — Diego's flow, the product's highest-stakes-to-break, most trust-sensitive surface — are fully unredesigned, desktop-oriented, and use a "Pregunta N de M" text counter that `ProgressBar.tsx`'s own code comment already names as the exact antipattern DESIGN.md rejects for this wizard. No anonymity badge, pause/resume, question-transition animation, or celebration exists in any form today.

**Approach:** Most of this story is genuine new interaction work, not restyling — matching Story 4.2's reveal-gate precedent. `AnonymityBadge`/`BookmarkChip`/`ProgressBar` (Epic 2, zero call sites yet) already implement the exact color/icon/shape mechanics EXPERIENCE.md specifies; this story wires them into `ResponderWizard.tsx` and builds the 3 genuinely new pieces: a CSS-only ~200ms question transition, a restrained checkmark celebration, and client-side-only (never touching the backend) draft persistence for pause/resume.

**Investigated (not guessed): which question triggers the anonymity-badge emphasis.** AC criterion 3 says "the most sensitive free-text answer." `ResponderWizard`'s questions come from whichever survey template the request uses; the base `default_360_cycle` template (`supabase/migrations/0006_departments_and_360_template.sql:287-289`) has exactly 3 open-ended questions in fixed order: a strength question (position 22), a constructive/challenge question (position 23, "¿Qué reto tiene esta persona en el desarrollo de su liderazgo?"), and a closing additional-feedback question (position 24) — the middle one is unambiguously "the sensitive" one, matching EXPERIENCE.md's own framing of this as the challenge-area moment. Since other request types (ad-hoc, custom questionnaires) may use different templates without this exact 3-question shape, the wizard identifies the emphasis-trigger question by matching its prompt text against this specific known challenge-question wording, not by a fixed position index — if no question in the current set matches, no emphasis moment fires (safe degradation, never fires on the wrong question).

**Investigated (not guessed): `AnonymityBadge`'s `emphasized` moment is a per-question advance, not final form submission.** `ResponderWizard.tsx`'s single `<form action={submitFeedbackResponse}>` only submits once, at the very end — there is no per-question backend call. AC criterion 3 ("When they tap submit") means the wizard's own internal "next question" action for that specific question, not the final wizard-completion submit. `AnonymityBadge.tsx`'s own code comment ("el momento de envío del wizard, el flujo de Diego") is consistent with this reading once cross-checked against the component's actual technical constraints.

**Investigated (not guessed): pause/resume must be client-side-only.** `submitFeedbackResponse` (`src/app/actions/feedback.ts`) has no incremental/per-question submission path — confirmed by direct read. "Answers intact on return" (AC criterion 4) is implemented as `localStorage`, keyed by the request token, storing the current step index and all typed answers; never touching the Server Action or backend. This is explicitly a draft cache, not authoritative data — if `localStorage` is unavailable/cleared, the user simply restarts, matching this app's own established "browser storage is a convenience, never load-bearing" pattern.

**Investigated (not guessed): the celebration must be visibly more restrained than Story 2.7's existing one.** EXPERIENCE.md explicitly states "playful touches never reach `/responder/[token]`" and names `AcceptAcknowledgment.tsx`'s (Story 2.7) existing one-time celebration as a *distinct*, more expressive pattern belonging to a different, less trust-sensitive flow (report-group accept/decline). This story's own checkmark must be a small, contained, per-question micro-moment — not a full-screen or prominent animation — and must never replay on `prefers-reduced-motion`.

**Investigated (not guessed): `/invitacion/[token]` is out of scope.** epics.md's own Story 4.4 AC (4 criteria, confirmed by direct read) never mentions this route. It stays unredesigned; not this story's concern.

## Boundaries & Constraints

**Always:** Mobile breakpoint (~390px) is the primary target, single-column, large touch targets, no hover-dependent interaction anywhere in the wizard. Question transitions are CSS-only (`motion-safe:`-gated, instant-swap fallback under `prefers-reduced-motion`). `AnonymityBadge` appears under every question, not just once at the top. The `emphasized` moment fires exactly once, at the challenge-question's own "next" action, never elsewhere. `BookmarkChip` appears only when a real saved draft is detected in `localStorage` on mount. Draft persistence is `localStorage` only — never a new Server Action, RPC, or backend call.

**Never:** Do not modify `submitFeedbackResponse`, `src/server/managers/responderManager.ts`, `src/server/db/responder.ts`, or any `src/app/api/responder/**`/`src/app/api/invitacion/**` route. Do not touch `/invitacion/[token]/page.tsx`. Do not reuse or reference `AcceptAcknowledgment.tsx`'s own celebration pattern directly — this story's own celebration must be independently, deliberately more subdued. Do not add a `variant` prop to `AnonymityBadge`/`BookmarkChip`/`ProgressBar`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `/responder/[token]`, valid, first visit | mobile viewport, no saved draft | single-column layout, `ProgressBar` (no "N de M" text), `AnonymityBadge` under the question, no `BookmarkChip` | N/A |
| Question transition | user answers, advances | ~200ms slide/fade, no stagger issue under `prefers-reduced-motion` (instant swap) | N/A |
| Advancing past the challenge question | tap "next" on "¿Qué reto tiene..." (or template-equivalent) | `AnonymityBadge` briefly emphasizes (`coral-wash` + checkmark icon), then returns to normal | N/A |
| Advancing past any other question | tap "next" | no emphasis, badge stays in its normal indigo/lock state | N/A |
| Closing tab mid-wizard, reopening the same link | `localStorage` draft present | `BookmarkChip` greets the user, step index and typed answers restored | N/A |
| `localStorage` unavailable/cleared | no draft found | wizard starts fresh at step 0, no `BookmarkChip`, no crash | N/A |
| Final answer submitted | last question | small, contained checkmark celebration, then normal redirect (unchanged) | N/A |

</frozen-after-approval>

## Code Map

- `src/components/ResponderWizard.tsx` -- the primary build target: replace the "Pregunta N de M" counter with `ProgressBar`, add `AnonymityBadge` per question with the emphasis trigger, add the CSS transition + celebration, add `localStorage` draft read/write.
- `src/app/responder/[token]/page.tsx` -- general token restyle (`Card`/tokens), mobile-first container.
- Under-scoping note (post-review, Blind Hunter/Verification Gap): the original Code Map above never listed `src/components/ScaleSlider.tsx` or `src/components/CompetencyPicker.tsx`, but the implementation legitimately touched both (each needed a `defaultValue`/`defaultEntries` prop so a restored draft can seed an uncontrolled slider/picker on the one-time `ready`-keyed remount -- see `ResponderWizard.tsx`'s own comment on that pattern). Verdict: **documentation note, not a defect** -- both files' changes are in-scope for "add `localStorage` draft read/write" above, the Code Map listing was just incomplete. No code change from this finding, only this note.
- `src/components/ui/AnonymityBadge.tsx`, `BookmarkChip.tsx`, `ProgressBar.tsx` -- already built, zero call sites; exact prop signatures confirmed (`AnonymityBadge`: `emphasized?: boolean`, `children?: ReactNode`; `BookmarkChip`: plain `HTMLAttributes`, caller composes text; `ProgressBar`: `value`/`max`, no text).
- `src/app/globals.css` -- `brujula-axis-in`/`brujula-ack-in` keyframe conventions (Stories 4.2/2.7) to mirror for this story's own new question-transition/celebration keyframes.
- `supabase/migrations/0006_departments_and_360_template.sql:287-289` -- the base template's 3 open questions, confirming the challenge-question's exact prompt text and position.
- `src/app/actions/feedback.ts` -- `submitFeedbackResponse`, read-only reference confirming no incremental submission path exists.
- `_bmad-output/planning-artifacts/ux-designs/ux-brujula-gui-2026-09-11/EXPERIENCE.md` -- Diego's flow (~lines 118-131), `anonymity-badge` emphasis spec (~66-79), "playful touches never reach `/responder/[token]`" (~94).

## Tasks & Acceptance

**Execution:**
- [ ] `src/components/ResponderWizard.tsx` -- replace counter with `ProgressBar`; add `AnonymityBadge` per question with challenge-question emphasis trigger; add CSS question-transition + restrained celebration; add `localStorage` draft persistence + `BookmarkChip`
- [ ] `src/app/responder/[token]/page.tsx` -- token/mobile-first restyle
- [ ] `src/app/globals.css` -- new keyframes for the question transition and celebration, following the established `motion-safe:`/fill-mode conventions

**Acceptance Criteria:**
- Given Story 3.24 has landed (confirmed done), when `/responder/[token]` is restyled, then it renders single-column with large touch targets and no hover-dependent interaction, mobile breakpoint as the primary target
- Given a question transition, when the user answers and moves to the next question, then a ~200ms slide/fade plays with a checkmark micro-celebration confined to this context only, respecting `prefers-reduced-motion`
- Given the user advances past the most sensitive free-text question, when they tap next, then the anonymity badge briefly emphasizes with both color shift and icon swap
- Given the user closes the tab mid-wizard and returns, when they reopen the link, then `bookmark-chip` greets them with answers intact

## Implementation Notes

**Post-review patch (3-lens review, see Review Triage Log):**
- `src/components/ResponderWizard.tsx` -- `handleSubmit` no longer clears the `localStorage` draft synchronously on every submit attempt. Added `export function ClearResponderDraft({ token })`, a tiny client component (`useEffect` + best-effort `localStorage.removeItem`) that does nothing else and renders nothing.
- `src/app/responder/[token]/page.tsx` -- imports and renders `<ClearResponderDraft token={token} />` inside the `ctx.used` branch (the "Ya has respondido" card) -- the only place the draft is ever cleared now, reached exclusively after the server has confirmed a successful submission (or a prior one). A submission the server rejects redirects back with `ctx.used` still `false`, so the wizard renders instead and the draft is left untouched.
- `src/components/ui/AnonymityBadge.tsx` -- added a `<span role="status" className="sr-only">Confirmado: tu respuesta sigue siendo anónima</span>`, mounted only while `emphasized` is true. No new prop -- gated on the existing `emphasized` prop, matching the component's minimal-prop-surface design.
- `src/components/ResponderWizard.tsx` -- removed the JS-level `prefers-reduced-motion` hook (`usePrefersReducedMotion`/`subscribeReducedMotion`/`getReducedMotionSnapshot`/`getReducedMotionServerSnapshot`), which had exactly one call site: gating the final-submit checkmark's *existence*. The checkmark now follows the same `motion-safe:`-only pattern already used for the question-transition class in this same file -- the static checkmark always renders while `submitting`, only the pop animation is withheld under reduced motion. `src/app/globals.css`'s `brujula-check-pop` comment updated to match; it previously (incorrectly, post-patch) described the element itself as reduced-motion-gated.
- `src/components/ResponderWizard.tsx` -- fixed the stale migration line citation in the `CHALLENGE_QUESTION_PROMPT` comment (was `:288`, actually `:293` in `supabase/migrations/0006_departments_and_360_template.sql`).
- Known tension, left as-is per explicit review direction: `EXPERIENCE.md` line 69 ("Wizard step transition") literally states the checkmark celebration "is removed rather than replayed instantly" under reduced motion -- i.e. it documents the pre-patch behavior. This patch deliberately makes the checkmark's *existence* reduced-motion-independent (only the animation is gated) to match this same file's own established, already-shipped pattern for the question-transition class, per the 3-lens review's explicit finding that the old behavior was the real inconsistency. `EXPERIENCE.md` itself (a planning artifact) was not edited -- out of this patch's scope; flagging here for whoever next touches that doc.

**Live verification (Playwright, throwaway scripts, deleted before finishing):**
- Seeded a real evaluator draft directly into `localStorage` (fetched real question ids/types via `get_responder_context`), positioned at the review step with one required `scale` question deliberately left blank, against a real running dev server + local Supabase.
- Submitted: server genuinely rejected it (`submit_feedback_response` raised "Faltan respuestas obligatorias."), redirected to `/responder/[token]?error=...`, `ErrorBanner` showed the message, and the draft was still present afterward -- verified both immediately and after a full page reload: `BookmarkChip` still shown, review step still restored, all 32 previously-entered answers intact (including one spot-checked open-text answer confirmed actually restored into its `<textarea>` DOM node, not just sitting in `localStorage`).
- Filled the missing answer and submitted again: genuinely accepted, redirected to `/dashboard?responded=1`. Revisited the same token URL afterward: rendered "Ya has respondido" with no `BookmarkChip`, and the draft was confirmed `null` in `localStorage` (and stayed `null` after a further reload).
- Confirmed the `AnonymityBadge`'s new `role="status"` announcement is genuinely inserted into the DOM on the challenge-question's "next" tap (found via `page.waitForSelector('[role="status"]:has-text("anónima")')`).
- Confirmed the reduced-motion checkmark fix live: with `reducedMotion: "reduce"` on the browser context, delayed the submit's network response to observe the `submitting` state -- the checkmark `<span>` was present with a real non-zero bounding box (24x24) and its `motion-safe:animate-[...]` class, matching the intended "static, no pop" reduced-motion rendering. Screenshot confirms a small checkmark badge on the "Enviar feedback" button's corner.

## Spec Change Log

## Review Triage Log

- **`ResponderWizard.tsx`'s `handleSubmit` cleared the `localStorage` draft synchronously in `onSubmit`, before the Server Action (`submitFeedbackResponse`) had run or returned any result -- a submission the server rejects (e.g. a required `scale`/`competency` question left blank, which has no client-side check today, only `<textarea required>` fields do) redirects back to `/responder/[token]?error=...` with `ctx.used` still `false`, and the wizard used to remount with the draft already wiped, losing every answer including the valid ones** -- Edge Case Hunter, Adversarial Critic, and Verification Gap, independently converged, HIGH confidence. Verdict: **high**, real full-data-loss bug on the product's highest-stakes-to-break surface. Routes to **patch**: draft-clearing moved out of the wizard entirely into a new `<ClearResponderDraft>` component, rendered only from `src/app/responder/[token]/page.tsx`'s `ctx.used` branch (reached exclusively after a server-confirmed successful submission). Re-verified live via Playwright: failed submission leaves the draft/answers fully intact (32/32 answer keys, restored to the DOM); successful submission clears it once the used-token page renders, confirmed by reload.
- **`AnonymityBadge.tsx`'s `emphasized` state change (color + icon swap) had no `aria-live`/`role="status"`/visually-hidden text -- a screen-reader user got no announcement of "the product's single most trust-critical moment" (EXPERIENCE.md), only a silent visual color+icon change** -- Edge Case Hunter, MEDIUM confidence, real accessibility gap. Verdict: **medium**, real and matches EXPERIENCE.md's own framing of this moment's importance. Routes to **patch**: added a `role="status"` visually-hidden (`sr-only`) span, mounted only while `emphasized` is true, text "Confirmado: tu respuesta sigue siendo anónima" -- no new prop, gated on the existing `emphasized` prop. Re-verified live via Playwright: the node is genuinely inserted into the DOM on the challenge question's "next" tap.
- **`ResponderWizard.tsx`'s final-submit checkmark was gated on `submitting && !prefersReducedMotion`, unlike the question-transition animation elsewhere in the same file (which correctly uses `motion-safe:` to keep content present and only drop the animation) -- reduced-motion users got zero confirmation glyph at all, not an instant/non-animated one** -- Edge Case Hunter, LOW severity, real inconsistency. Verdict: **low**, real but minor. Routes to **patch**: checkmark element now always renders while `submitting`; only the `motion-safe:animate-[brujula-check-pop_...]` utility is reduced-motion-gated, matching the file's own established pattern. The now-fully-unused JS-level `prefers-reduced-motion` hook (`usePrefersReducedMotion` and its 3 helper functions) was removed rather than left dead. Re-verified live via Playwright with `reducedMotion: "reduce"`: checkmark renders with a real bounding box during submission.
- **Code comment above `CHALLENGE_QUESTION_PROMPT` cited `supabase/migrations/0006_departments_and_360_template.sql:288`; the actual line is 293** -- Blind Hunter, cosmetic. Verdict: **low**, trivial. Routes to **patch**: citation corrected to `:293`.
- **Code Map (frozen Intent section) never listed `ScaleSlider.tsx`/`CompetencyPicker.tsx`, but the implementation legitimately touched both (draft-restore seeding via `defaultValue`/`defaultEntries`)** -- Blind Hunter / Verification Gap. Verdict: **false as a defect, documentation gap only** -- both files' changes are genuinely in-scope for the story's own "add `localStorage` draft read/write" task; no code change, only a Code Map note added above.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 new errors/warnings
- `npx tsc --noEmit` -- expected: no type errors
- `npm run test` -- expected: all existing tests still pass (no backend logic touched)

**Manual checks (UI/visual — Playwright + local headless Chromium already installed, mobile viewport ~390px as primary target, use them, do not just claim success):**
- Screenshot the wizard at each question, confirming `ProgressBar` (no text counter) and `AnonymityBadge` are present, mobile and desktop.
- Screenshot/verify the emphasis moment specifically on the challenge question's "next" tap, and confirm it does NOT fire on other questions.
- Verify `prefers-reduced-motion` (Playwright `emulateMedia`) shows instant transitions, no stagger, content never hidden.
- Close and reopen the wizard mid-flow (real browser reload against the same token) and confirm `BookmarkChip` + restored answers/step.
- Confirm the final-submit celebration is visually small/contained, not a full-screen or prominent effect.
