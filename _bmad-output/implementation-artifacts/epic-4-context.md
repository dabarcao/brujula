# Epic 4 Context: Remaining Domain UI Redesigns

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 2 already built the Brújula Segura design system (tokens, shared primitives) and redesigned the report-groups domain as its proof point. Epic 4 applies that same system to the five remaining domains' screens — admin/members, cycles, feedback, responder/invitation, and read-only reports — mirroring Epic 3's risk-ascending domain order and gating each story on that domain's backend migration having landed first (Epic 3 is now fully complete, so all five stories are unblocked on that front). Completing this epic means every domain in the product runs on both the new backend layering and the new visual identity, closing out the two-track redesign that began in Epic 1/2.

## Stories

- Story 4.1: Admin/Members Screens Redesign (done)
- Story 4.2: Cycles Screens Redesign (done)
- Story 4.3: Feedback Screens Redesign (done)
- Story 4.4: Responder/Invitation Screens Redesign (done)
- Story 4.5: Read-Only Reports Screens Redesign (done -- epic complete)

## Requirements & Constraints

- Each story is gated on its corresponding Epic 3 domain migration (Stories 3.6, 3.12, 3.18, 3.24, 3.30 respectively); all five have landed, so no story in this epic is currently blocked on backend work.
- The authenticated app (`/dashboard/**`, `/admin/**`) is desktop-optimized but responsive: multi-column card grids above the mobile breakpoint, collapsing to single column below it, never the reverse. `/responder/[token]` is the one mobile-first exception: single-column, large touch targets, no hover-dependent interaction.
- Aggregate/Supervisor-only views (admin, Informe empresa) must use the denser Leapsome-style grid with smaller gaps and more cards per row, distinct from the more spacious individual-report layout, and must be visually marked as a rollup via `aggregate-badge` — never `card-accent`, which is reserved for personal "moment" cards.
- A non-admin/non-Supervisor reaching a role-gated route directly must see the permission-denied state (plain-language, no red, `button-secondary` back to dashboard); any failed action shows the generic error state (plain-language + retry, never coral/red). Story 4.1 establishes both patterns; later stories reuse them rather than reimplementing.
- Report reveal (cycles and feedback) must never auto-render on load: collapsed summary first, full radar/exact-values table only after the user taps `reveal-button`. Sequential axis draw-in (~60ms stagger) must respect `prefers-reduced-motion` with an instant full-opacity fallback.
- Color is never the sole signal anywhere (role badges/intensity values always pair color with text/number); text-on-fill combinations must clear WCAG AA — Catalizador and Coach role badges specifically require their `-deep` fill variants, never the base tone, under white text.
- Responder/invitation wizard transitions (~200ms slide/fade, checkmark micro-celebration) must respect `prefers-reduced-motion` with an instant-swap fallback and the celebration removed, not replayed.

## Technical Decisions

- All screens consume the already-built Epic 2 token/component set: `card`, `card-accent`, `aggregate-badge`, `role-badge` (with `-deep` variants for Catalizador/Coach), `saboteador-bar`, `intensity-scale`, `progress-bar`, `bookmark-chip`, `scale-slider`, `reveal-button`, `button-primary`/`button-secondary`, `anonymity-badge`, `focus-ring`. No new components are introduced by this epic unless a story's acceptance criteria explicitly names one.
- Existing hand-rolled SVG chart components (`CompetencyRadar.tsx`, `CompetencyComparisonChart.tsx`) are extended in place for the new draw-in/reveal behavior, not replaced by a charting library.
- Client Components fetch exclusively through `src/lib/api/client.ts`, the shared fetch wrapper over the new internal API (never Supabase directly) — consistent with the layering Epic 1/3 already established.
- The reveal gate toggles rendering of already server-rendered data (a `revealed` boolean), not a new fetch — no loading spinner on reveal.
- Evaluator-category toggle chips keep their existing single-hue muted-violet color decision unchanged; only their shape/radius is restyled to `role-badge`'s pill form.

## UX & Interaction Patterns

- **Reveal → draw-in** (4.2, 4.3): tapping `reveal-button` triggers the radar's five sectors drawing in sequentially; Story 4.3 must reuse this and the threshold-not-met/reveal-gate patterns from 4.2 verbatim, not a divergent reimplementation.
- **Threshold-not-met**: reassuring progress copy ("X de Y respuestas necesarias") in indigo-wash, never gray or red — this is progress, not failure.
- **Saboteadores block** (4.3): rendered via `saboteador-bar` at its deliberately softer, lower-contrast treatment relative to the competency radar on the same page — never styled as a sixth "role."
- **Responder wizard** (4.4): single-column mobile-first layout; anonymity badge visible under every question, not just the first, with a color+icon (lock→checkmark) emphasis at the most sensitive free-text submit; `bookmark-chip` ("Guardado — continúa cuando quieras") greets a returning user mid-wizard with answers intact.
- **Dashboard home, empty** (4.5): a single centered `card` with `button-primary` to start a cycle, not an empty grid or an error state.
- **Mi mapa, first-time** (4.5): a short explanatory card replaces the radar for an employee with zero closed 360s — distinct from the per-request threshold-not-met state.
- **Informe empresa** (4.5): denser aggregate grid with `aggregate-badge`; non-Supervisor direct access shows the 4.1 permission-denied pattern.

## Cross-Story Dependencies

- Story 4.1 establishes the reusable permission-denied and generic-error state patterns that Story 4.5 (Informe empresa) explicitly reuses.
- Story 4.2 establishes the reveal-gate, threshold-not-met, and axis-draw-in patterns that Story 4.3 must reuse rather than reimplement.
- Story 4.5 is last in sequence and is the epic's closing verification point: once all five stories land, every domain runs on both the new backend layering (Epic 1/3) and the new visual identity (Epic 2/4).
- No `epic-2-context.md` exists yet to cross-check continuity against; this file was compiled directly from DESIGN.md/EXPERIENCE.md instead.
