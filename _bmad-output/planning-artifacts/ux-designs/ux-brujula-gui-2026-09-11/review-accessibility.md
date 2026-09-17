---
status: draft
updated: '2026-09-11'
reviewer: independent accessibility review (automated, hex-computed WCAG contrast)
scope: DESIGN.md, EXPERIENCE.md, mockups/key-report-reveal.html, mockups/key-wizard-question.html, mockups/key-dashboard-home.html
---

# Accessibility Review — Brújula Segura UX Spine (2026-09-11)

## Verdict

The spine's *structural* accessibility commitments (no color-only value encoding for roles/scores/saboteadores, always-printed numbers, threshold/error states that avoid red) are sound and mostly followed through into the mocks, but the spine ships two outright WCAG AA contrast failures on its own named hex values (white text on coral, white text on the amber role badge), a focus-ring spec that is vague enough to render invisible on the product's two most important buttons, and a reduced-motion fallback that is fully specified for the report reveal but never specified for the wizard — all fixable without touching the palette's identity, but all real as written.

---

## Critical

### C1. White text on `{colors.coral}` (#FF6B4A) fails WCAG AA — including the large-text/UI threshold

Computed contrast of `#FFFFFF` on `#FF6B4A`: **≈2.82:1**. WCAG AA requires 4.5:1 for normal text and 3:1 for large text (≥18pt/14pt-bold) or UI components. 2.82:1 clears *neither* bar.

This is not a marginal token — it is `{components.reveal-button}` (`background: {colors.coral}`, `color: {colors.paper-deep}`), the single "climax beat" CTA in the entire product ("Mostrar mis resultados", `key-report-reveal.html` `.reveal-btn`), and it is also `role-catalizador` (#FF6B4A) used as a white-text role-badge fill (`<span class="role-badge" style="background:var(--role-catalizador)">Catalizador · 4.6</span>` in `key-report-reveal.html`).

DESIGN.md/EXPERIENCE.md's own Accessibility Floor tries to pre-excuse this: *"`{colors.coral}` is used for fills with white text (large-scale button label), never for small body text on `{colors.paper}`"* — but "large-scale button label" only needs to clear 3:1, and this fails even that, by a meaningful margin (0.18 short of 3:1, 1.68 short of 4.5:1).

**Fix**: use `{colors.coral-deep}` (#C64A2E) as the fill wherever white text sits on it — computed contrast of white on #C64A2E is **≈4.75:1**, clearing normal-text AA. Reserve pure `{colors.coral}` for non-text fills (icons, shadow tint, chip backgrounds paired with `{colors.coral-deep}` text, as the existing `bookmark-chip` already correctly does).

### C2. White text on `role-coach` amber (#C98A2E) fails WCAG AA at both thresholds

Computed contrast of `#FFFFFF` on `#C98A2E`: **≈2.93:1** — below even the 3:1 large-text/UI floor, and far below 4.5:1 for the badge's actual caption-size text (13px per `{typography.caption}`, i.e. normal-text-size, needing 4.5:1). This is the borderline case the brief specifically flagged, and it does not survive computation. Visible directly in `key-report-reveal.html`: `<span class="role-badge" style="background:var(--role-coach)">Coach · 3.1</span>` — in Marta's flow this is literally her one flagged growth area, so it's a badge she will look at closely in an already emotionally loaded moment.

**Fix**: darken the amber fill for any white-text context (a `role-coach-deep` in the spirit of `coral-deep`/`indigo-deep`, roughly one step toward `#8F6321`-range gets to ~4.6:1 — exact value should be verified against a contrast tool at implementation time), or keep `#C98A2E` for non-text uses and render badge text in `{colors.ink}` instead of white for this one role.

*(For contrast, the other three white-on-role-color pairings were computed and are fine: indigo #3B4FA6 → 7.36:1, teal #0E8074 → 4.82:1 (passes AA but only just — see M2), plum #8B4B9E → 5.84:1.)*

---

## High

### H1. "Visible focus ring in `{colors.indigo}`" is under-specified, and applied literally it fails on the product's own two most-important buttons

EXPERIENCE.md's Accessibility Floor states only: *"The wizard, reveal button, and all chips are fully keyboard-operable with a visible focus ring in `{colors.indigo}}`."* No width, offset, or style (outline vs. box-shadow, inset vs. outset) is named.

This isn't pedantry — the gap produces a concrete failure mode on this exact palette. `{components.button-primary}` is filled with `{colors.indigo}` (#3B4FA6) itself: an indigo ring drawn flush against an indigo-filled button is effectively **1:1 contrast against its own component**, i.e. invisible, unless the implementer independently knows to offset it outward onto the surrounding `{colors.paper}` (where indigo-on-paper computes to a healthy 6.70:1). Worse, `{components.reveal-button}` is filled with `{colors.coral}` (#FF6B4A) — computed contrast of the *same* indigo ring color against that fill is **≈2.61:1**, below the 3:1 WCAG 1.4.11/2.4.11 non-text-contrast minimum for a focus indicator against its adjacent color, even with an offset that still sits inside the coral.

As written, a builder has a 50/50 chance of producing a focus ring that is invisible on the primary button and non-compliant on the reveal button — the two elements the spec calls out by name as needing to be visibly keyboard-focusable.

**Fix**: name a concrete token: e.g. "2px solid `{colors.indigo}` outline, 2px offset, rendered outside the element's own fill against `{colors.paper}`/`{colors.paper-deep}`" — and for indigo- or coral-filled components specifically, either force the offset-outward behavior or specify an alternate ring color (e.g. white/paper ring on filled buttons) so the ring never sits on a background it can't be seen against.

### H2. Wizard step-transition reduced-motion fallback is never actually specified — only the reveal's is

The brief's premise (reveal never auto-plays, wizard has a "micro-celebration") both supposedly "respect `prefers-reduced-motion`" per Accessibility Floor: *"Every animated reveal and wizard transition respects `prefers-reduced-motion` (see Interaction Primitives) — content is never gated behind motion that can't be disabled."*

Checking Interaction Primitives, the **reveal** fallback is concrete: *"Respects `prefers-reduced-motion`: falls back to an instant full-opacity render, no animation skipped silently — the content still appears, only the motion is removed."* That's implementable as written.

The **wizard step transition** entry has no such sentence at all: *"a short (~200ms) slide/fade between questions, plus a small checkmark micro-celebration confined to this one context — never appears on the report or dashboard."* Nothing says what a reduced-motion user sees instead — does the slide/fade become an instant cut? Does the checkmark celebration still play (it's arguably not vestibular-triggering, just a small icon) or disappear entirely? The Accessibility Floor's blanket claim ("every... wizard transition respects `prefers-reduced-motion`") is aspirational cross-reference to a primitive that doesn't cover it — this is exactly the "throwaway line" pattern the brief asked to check for, present in one of the two motion instances.

**Fix**: add a sentence to the wizard step-transition entry mirroring the reveal's, e.g. "Respects `prefers-reduced-motion`: the slide/fade becomes an instant swap; the checkmark micro-celebration is removed rather than replayed instantly, since it is decorative, not load-bearing content."

### H3. The anonymity badge's "emphasis" state is a pure color-only signal, on the product's single most trust-critical element

`key-wizard-question.html`:
```css
.anon-badge{background:var(--indigo-wash);color:var(--indigo-deep);...}
.anon-badge.emph{background:var(--coral-wash);color:var(--coral-deep);}
```
```html
<div class="anon-badge emph">🔒 Anónimo — nadie ve tu nombre</div>
```
The `.emph` state changes only background/text color (indigo-wash/indigo-deep → coral-wash/coral-deep). Text is byte-for-byte identical ("🔒 Anónimo — nadie ve tu nombre"), the lock icon is unchanged, there is no size, shape, border, or motion change specified anywhere (DESIGN.md/EXPERIENCE.md never describe one either — EXPERIENCE.md's Key Flow just says it "briefly emphasizes"). Per EXPERIENCE.md this is transient ("briefly"), which compounds the problem: a color-vision-deficient or low-vision user gets no reliably perceivable confirmation that the reconfirmation moment happened at all.

This sits awkwardly against the spine's own stated principle: *"Color is never the only signal: role badges and the intensity scale always pair color with a text label or number, never color alone"* (Accessibility Floor) — that sentence names only role badges and the intensity scale, leaving the anonymity badge's emphasis un-covered, even though it is arguably the single moment in the product where trust reassurance matters most (Diego, mid-commute, about to submit a critical comment about a colleague, anonymously).

**Fix**: pair the color change with a non-color cue that survives `prefers-reduced-motion` review too — e.g. a brief scale-pulse (with an instant/no-op reduced-motion fallback) or swap the lock icon to a checkmark for the emphasis window, not just a wash/text color swap.

---

## Medium

### M1. `{components.saboteador-bar}` fill-on-track contrast is far below the WCAG non-text-contrast minimum

`{colors.saboteador-tint}` (#D99A86) fill on `{colors.saboteador-wash}` (#F7E6DE) track computes to **≈1.94:1** — well under the 3:1 WCAG 1.4.11 minimum for a graphical object that conveys information (the bar's fill length is exactly that — it visually encodes the saboteador's score).

The printed number is confirmed present and consistent (see Section 4 below), which keeps this from being a strict "color is the only way to read the value" violation — but it does mean the *bar itself*, the at-a-glance visual the component exists to provide, is functionally unreadable for anyone with reduced contrast sensitivity; they're left with the number alone, making the graphical component decorative-only for that user rather than the softer-but-still-legible treatment DESIGN.md intends ("visibly gentler... the one place on the page allowed to feel soft" — soft was the goal, invisible is the result). Confirmed directly in `key-report-reveal.html`: `.sabo-track{background:var(--sabo-wash)}` / `.sabo-fill{background:var(--sabo-tint)}` with `--sabo-tint:#D99A86; --sabo-wash:#F7E6DE`.

**Fix**: either darken `saboteador-tint` slightly (a value around `#C97F60`–`#C17656` should clear 3:1 against `#F7E6DE` while staying visibly softer/warmer than `{colors.coral}` — verify against a tool before adopting) or add a 1px border on the fill in `saboteador-tint`'s current, darker `-deep` neighbor tone so the fill's edge is perceivable even if its area-fill contrast stays soft.

### M2. `role-arquitecto` teal (#0E8074) with white text passes AA, but only marginally (4.82:1 vs. 4.5:1 required)

Not a failure, but flagged since the brief asked which role badges were borderline: teal clears the bar by only 0.32, the smallest margin of the five role colors. Any future token nudge (including the dark-mode variant `#3FBDAA`, not checked here) should re-verify this pairing rather than assume it inherits the light-mode pass.

---

## Low

### L1. Intensity-scale's "number always printed beside the meter" claim is asserted twice but demonstrated nowhere

DESIGN.md (`{components.intensity-scale}`) and EXPERIENCE.md (Component Patterns) both state the meter always pairs with a printed number. This is not contradicted anywhere — but it's also never actually shown: `key-report-reveal.html`'s "exact-values table" (`.table`, rows like `<td>4.7</td><td>4.0</td>`) renders **plain numbers with no filled intensity-scale meter bar at all**. So the specific claim requested for verification (Section 4) is *internally consistent* but *unverified by example* — a builder has the spine's word for the pairing rule but no mock to check their implementation against, unlike the saboteador-bar, which is fully demonstrated. Worth adding a small intensity-scale meter to one mock, or at least noting in EXPERIENCE.md that the exact-values table intentionally uses raw numbers rather than the meter component.

### L2. Role-badge value display is inconsistent within the same mock

In `key-report-reveal.html`'s revealed-state role list, Catalizador and Coach show `"Catalizador · 4.6"` / `"Coach · 3.1"` (name + numeric value) while Plenitud, Visionario, and Arquitecto show only the bare role name. This doesn't violate the "never color alone" rule (name-as-text is present on all five), but it's an inconsistency a builder could reasonably read either way — worth a one-line clarification of when a role badge carries a value vs. just a name.

### L3. (Informational, not a defect) Wizard touch targets are plausibly generous

`key-wizard-question.html`'s `.submit` button and `.anon-badge` are children of a `display:flex; flex-direction:column` card with no `align-self`/width override, so both stretch to the card's full width by default flexbox behavior (~230px wide in the 320px mock) at ~45px tall (14px padding + line-height) — comfortably over the 44×44px target-size guideline, and the `textarea` has `min-height:100px`. This works in Diego's one-handed-commute scenario as intended; flagged here only as a confirmed pass, not a finding, since the brief asked the question directly.

---

## Contrast values computed for this review (WCAG relative-luminance formula)

| Pairing | Hex / Hex | Ratio | AA normal (4.5:1) | AA large/UI (3:1) |
|---|---|---|---|---|
| ink on paper | #1C2033 / #F7F4EE | 14.67:1 | pass | pass |
| ink on paper-deep | #1C2033 / #FFFFFF | 16.10:1 | pass | pass |
| white on indigo | #FFFFFF / #3B4FA6 | 7.36:1 | pass | pass |
| white on coral | #FFFFFF / #FF6B4A | **2.82:1** | **fail** | **fail** |
| white on coral-deep (suggested fix) | #FFFFFF / #C64A2E | 4.75:1 | pass | pass |
| white on role-arquitecto (teal) | #FFFFFF / #0E8074 | 4.82:1 | pass (marginal) | pass |
| white on role-coach (amber) | #FFFFFF / #C98A2E | **2.93:1** | **fail** | **fail** |
| white on role-plenitud (plum) | #FFFFFF / #8B4B9E | 5.84:1 | pass | pass |
| saboteador-tint on saboteador-wash | #D99A86 / #F7E6DE | **1.94:1** | n/a (non-text) | **fail (needs 3:1)** |
| indigo ring on paper (offset case) | #3B4FA6 / #F7F4EE | 6.70:1 | — | pass |
| indigo ring on indigo button (flush case) | #3B4FA6 / #3B4FA6 | ~1:1 | — | **fail** |
| indigo ring on coral button (flush case) | #3B4FA6 / #FF6B4A | 2.61:1 | — | **fail** |
