---
status: final
updated: '2026-09-11'
---

# EXPERIENCE.md — Brújula Segura

## Foundation

**Form factor: multi-surface, split by audience.** `/responder/[token]` and `/invitacion/[token]` — anonymous, unauthenticated, reached by tapping an email link — are **mobile-first**: single-column, large touch targets, no hover-dependent interaction. The authenticated app (`/dashboard/**`, `/admin/**`) is **desktop-optimized but responsive**: HR and supervisors scan dense competency data repeatedly at a desk, so layouts favor multi-column card grids above the mobile breakpoint and collapse to single-column below it, never the reverse priority.

**UI system: none inherited.** No shadcn, MUI, or existing design system in the codebase. DESIGN.md is the sole visual identity reference; every component here is custom. The existing hand-rolled SVG radar/comparison charts (`CompetencyRadar.tsx`, `CompetencyComparisonChart.tsx`) are extended in place rather than replaced by a charting library, for the same reason the original implementation gave: their geometry is fixed and known (15 axes, five sectors), which doesn't justify a new dependency.

**Data layer.** All Client Components fetch through `src/lib/api/client.ts` (a same-origin fetch wrapper over the new internal API — see the parallel architecture spine), never Supabase directly. Server Components continue to render already-authorized data inline; nothing in this document asks a page to add a loading spinner where one doesn't already exist today.

## Information Architecture

**Authenticated app** (desktop-first):
- **Dashboard home** — the "moments" surface: open cycles and pending actions as `{components.card-accent}` cards (DESIGN.md), not a table. *(See `mockups/key-dashboard-home.html`.)*
- **Ciclos** — list (open/closed split), detail, and estado sub-pages for 360 cycle management.
- **Feedback** — nueva (ad-hoc), nueva-360 (individual), `[id]` (a request's report), `[id]/gestionar` (evaluator management).
- **Grupos** — informes de grupo: create, accept/reject, closed report.
- **Mi mapa** — the employee's own aggregated competency map.
- **Informe empresa** — Supervisor-only aggregate view.
- **Members** — roster and invitations.
- **Admin** — platform-admin, organization management (`/admin`, `/admin/empresas/[id]`).

**Public/anonymous** (mobile-first):
- **Responder** (`/responder/[token]`) — the evaluator's one-question-at-a-time wizard.
- **Invitación** (`/invitacion/[token]`) — accept/decline a report-group invitation.
- **Login / Registro** — individual accounts, no organization required.

No new top-level surface is introduced by this redesign — every card, badge, and animation below attaches to a screen that already exists in `src/app/**`.

## Voice and Tone

Brújula Segura's copy is **direct and warm, never clinical, never gamified**. A cycle is "Ciclo 360 [nombre]," never "Encuesta." The anonymity badge reads as a plain statement of fact ("Anónimo — nadie ve tu nombre"), not a legal disclaimer. The reveal button says exactly what happens: "Mostrar mis resultados," never "Ver más." The bookmark/pause chip reassures rather than warns: "Guardado — continúa cuando quieras," never "Progreso perdido si sales." Saboteador copy stays in a tone of hypothesis, never verdict, per spec.md §7 — "puede que…" framing survives from the product's existing AI-interpretation prompt design and this redesign doesn't fight it.

## Component Patterns

> Visual reference: `mockups/key-report-reveal.html` (report collapsed + revealed states), `mockups/key-wizard-question.html` (wizard question + bookmark/paused states), `mockups/key-dashboard-home.html` (dashboard card-accent vs. aggregate-chrome contrast). DESIGN.md and this file win on any conflict with a mock — mocks illustrate, they don't add requirements.

- **Reveal gate** (report pages): the report's data is already present in the server-rendered HTML for the account owner's own results (see Foundation/State Patterns) — `{components.reveal-button}` toggles a `revealed` boolean that gates *rendering*, not fetching. One tap, one state, no loading spinner.
- **Threshold empty state**: when a request hasn't crossed spec.md §6's minimum-response threshold, the card shows reassuring progress copy ("X de Y respuestas necesarias") in `{colors.indigo-wash}`, never `{colors.line}`-gray or a red error tone — this is progress, not failure.
- **Evaluator-category chips**: the existing jefe/equipo/empresa/otro toggle pattern on the 360 comparison chart is restyled with `{components.role-badge}`-shaped pills in a single muted violet family (unchanged from today's design decision to keep four tones of one hue so they don't compete with the five role colors) — this redesign does not touch that decision, only its shape/radius.
- **Aggregate-chrome distinction**: Supervisor-only aggregate views (Informe empresa, Mapa de competencias de la empresa) render inside a visibly denser grid with `{components.aggregate-badge}` ("Vista agregada — [N] personas"), never the indigo `{components.card-accent}` treatment reserved for individual "moment" cards — so a Supervisor can never mistake a rollup for one person's detail at a glance. A non-Supervisor/non-admin who reaches these routes directly sees the permission-denied state instead (see State Patterns), never the aggregate content itself.
- **Wizard question card**: one question per screen, `{components.card}` at `{rounded.md}`, `{components.progress-bar}` above it (smooth fill, never a "12 of 30" counter), `{components.anonymity-badge}` pinned below the question text on every screen, not just the first.
- **`{components.button-secondary}`**: every non-primary action on a screen (cancel, back, "volver al panel") — outline only, never competes visually with the one `{components.button-primary}` per screen.
- **`{components.role-badge}`**: appears on radar sector labels, competency-table row headers, and the mapa-de-competencias mention summary; static, non-interactive, always paired with the role's name as text (never color alone, see Accessibility Floor). Catalizador and Coach render on their `-deep` fill variants (DESIGN.md) so white text stays AA-legible.
- **`{components.intensity-scale}`**: a filled horizontal meter, non-interactive; tapping/hovering a filled segment on desktop shows the exact numeric value in a small tooltip, but the number is also always printed beside the meter as plain text — the tooltip is a convenience, never the only way to read the value.
- **`{components.saboteador-bar}`**: static, non-interactive, one per saboteador (five total), always shown with its 1–5 note printed alongside — never collapsed behind a hover state, since this data is sensitive enough that hover-to-reveal would read as an obstacle.
- **`{components.scale-slider}`**: visual spec lives in DESIGN.md's Components section; this file only notes the interaction stays unchanged from today (see Interaction Primitives).

## State Patterns

- **Loading**: only Client Components that genuinely fetch on demand show a loading state (the reveal gate does not — see Component Patterns); when one is needed, a single centered spinner in `{colors.indigo}`, no skeleton screens introduced this round.
- **Empty (not enough responses)**: reassuring progress copy per Component Patterns, never styled like an error.
- **Error**: a plain-language message plus a retry action, in `{colors.ink}` on `{colors.paper-deep}` — errors never borrow `{colors.coral}` (reserved for the one energizing CTA per screen) or any red.
- **Saved/paused**: `{components.bookmark-chip}` — visible the moment a user navigates away mid-wizard, persists until they resume.
- **Revealed vs. not-yet-revealed** (reports): two literal states of the same page — collapsed (headline strength + one growth area, DESIGN.md `elevation.card` only) and expanded (full radar with axis-draw-in, exact-values table). The collapse/expand boundary is the only content gate on this page; nothing else about the layout changes.
- **Permission-denied** (Informe empresa, Admin): a non-Supervisor/non-admin who reaches one of these role-gated routes sees a plain-language message ("Esta vista es solo para supervisores de tu organización") in the same register as the generic Error state — `{colors.ink}` on `{colors.paper-deep}`, no red, with a `{components.button-secondary}` back to the dashboard. Never a bare 403 page.
- **Dashboard home, empty**: a brand-new organization or a lull between cycles shows a single centered `{components.card}` ("Todavía no hay ciclos abiertos") with a `{components.button-primary}` to start one — not an empty grid, and not styled as an error or a dead end.
- **Mi mapa, first-time**: an employee with zero closed 360s sees a short explanatory card instead of the radar ("Tu mapa aparecerá aquí después de tu primer ciclo 360 cerrado") — distinct from the per-request threshold-not-met state, since there's no request to wait on yet, just a first cycle that hasn't happened.
- **Invitación, accept/decline**: `/invitacion/[token]` shows the group name and inviter, two `{components.button-primary}`/`{components.button-secondary}` actions (accept/decline); accepting shows the Officevibe-style one-time checkmark acknowledgment (Inspiration & Anti-patterns), declining returns a plain confirmation with no celebration — the two outcomes are visually asymmetric on purpose.

## Interaction Primitives

- **Reveal → draw-in**: tapping `{components.reveal-button}` triggers the radar's axes drawing in sequentially (staggered ~60ms per axis), never on page load. Respects `prefers-reduced-motion`: falls back to an instant full-opacity render — nothing is silently skipped, the *content* still appears, only the motion is removed.
- **Wizard step transition**: a short (~200ms) slide/fade between questions, plus a small checkmark micro-celebration confined to this one context — never appears on the report or dashboard. Respects `prefers-reduced-motion`: the slide/fade becomes an instant swap, and the checkmark celebration is removed rather than replayed instantly, since it's decorative, not load-bearing content — the question itself is never gated behind either.
- **Anonymity-badge emphasis** (at wizard submit): the badge's brief emphasis at the moment of sending pairs its `{colors.indigo-wash}`→`{colors.coral-wash}` color shift with a non-color cue — the lock glyph swaps to a checkmark glyph for that same window, so the reconfirmation is perceivable without relying on the color change alone. This is the product's single most trust-critical moment (Key Flows, Diego); it does not get a color-only treatment.
- **Scale input**: the existing `ScaleSlider` component (0.5-increment slider) keeps its current interaction model; this redesign only restyles its track/thumb to the new token set (indigo fill, `{rounded.full}` thumb).
- **Chip toggles** (evaluator categories): tap to add/remove a line from the comparison chart; multiple can be active; state persists only for the session, not saved.

## Accessibility Floor

- Text contrast: `{colors.ink}` on `{colors.paper}`/`{colors.paper-deep}` and white text on `{colors.indigo}` both clear WCAG AA at body size (7.36:1). `{colors.coral}` (the base bright tone) is never used under text at any size — it falls short of AA even at button-label size — text on coral always uses `{colors.coral-deep}` instead (4.75:1+; see DESIGN.md Colors), and the same deep-variant rule applies to the Catalizador and Coach role badges.
- Every animated reveal and wizard transition respects `prefers-reduced-motion` (see Interaction Primitives) — content is never gated behind motion that can't be disabled, and each primitive states its specific reduced-motion fallback rather than relying on this line alone.
- The wizard, reveal button, and all chips are fully keyboard-operable with `{components.focus-ring}` (DESIGN.md): 2px solid, 2px offset, drawn outside the element — `{colors.indigo}` on paper backgrounds, switching to `{colors.paper-deep}` on indigo- or coral-filled components so the ring is never drawn against a fill it can't be seen on.
- Color is never the only signal: role badges and the intensity scale always pair color with a text label or number, and the anonymity badge's submit-time emphasis pairs its color shift with an icon change (see Interaction Primitives) — nothing in the system relies on color alone to communicate state.

## Inspiration & Anti-patterns

The 2026-09-11 brainstorm named 11 specific reference products, each grafted onto (or explicitly kept out of) one screen — recorded here so the reasoning survives, not just the outcome.

**Committed:**
- **Lattice** → dashboard home's `{components.card-accent}` "moments" treatment (Information Architecture, Component Patterns).
- **Leapsome** → the denser admin/aggregate grid on `/admin` and Informe empresa (DESIGN.md Layout & Spacing).
- **Duolingo** → the wizard-only step-completion micro-celebration (Interaction Primitives) — confined there deliberately, never on the report or dashboard.
- **Airbnb** (verified-participation trust pattern) → report headers show a plain "X de Y invitados respondieron" count (see `mockups/key-report-reveal.html` subheader) — transparency about participation, not a badge/seal treatment, since Brújula's trust story is anonymity, not verification.
- **Notion** (minimal chrome, content-first) → Mi mapa and Informe de grupo use a narrower content measure and skip the card-grid/aggregate-badge chrome entirely — closer to reading a document than scanning a dashboard, distinct from the denser admin register above.
- **Linear** (crisp, contained microinteractions) → cycle-management screens (Ciclos list/detail/estado, gestionar evaluadores) use near-instant (<100ms) state feedback with no decorative transition — this is the surface a Supervisor operates repeatedly, so speed reads as respect for their time.
- **15Five** (continuous feedback as habit, not a formal event) → the ad-hoc "Pedir feedback" entry point stays a small persistent action on dashboard home rather than a separate heavy form-first screen, and its copy avoids "solicitud formal" language in favor of "Pedir feedback rápido" (Voice and Tone).
- **BetterUp** (serene, restrained AI-narrative treatment) → the AI-interpretation text block renders in `{components.card}` with a narrower measure and more generous line-height than data cards, so it visually reads as a considered reflection, not another data table.
- **Officevibe** (playful nudges, low-risk surfaces only) → accepting a group-report invitation (Invitación) gets a small one-time checkmark-style acknowledgment, distinct from the wizard's per-question celebration and from any surface in the anonymous response flow — playful touches never reach `/responder/[token]`.

**Explicitly rejected, not silently dropped:**
- **Culture Amp** (soft illustration humanizing empty states) — this codebase has no illustration asset pipeline, and the empty states here (threshold-not-met, dashboard-empty) are already satisfied by reassuring plain-language copy without needing a new asset type. Revisit if a future pass introduces an illustration system.
- **GitHub** (persistent participation-trend visual on Mi mapa) — requires a trend-over-time data model Mi mapa doesn't have today (spec.md §9: it shows the latest closed cycle's snapshot plus agile-mention deltas since that close, not a history). A data-model change is out of scope for a visual-redesign spec; deferred to a future product decision, not this one.
- **Headspace/Calm** (soft gradients around vulnerable content) — this was the Direction A ("Brújula Serena") register, not Direction B's; already addressed by the Direction A rejection in Brand & Style.

## Key Flows

### Marta opens her first 360 report

*(See `mockups/key-report-reveal.html`.)*

Marta is a team lead whose first 360 cycle has just closed.

1. She gets a notification that her report is ready and opens `/dashboard/feedback/[id]` on her laptop between meetings.
2. The page loads instantly — no spinner — showing a collapsed summary: one headline strength in Sora, `{colors.role-*}`-tinted, and one growth area below it, both already server-rendered (see State Patterns, "Revealed vs. not-yet-revealed").
3. She hesitates before scrolling further; nothing has auto-played.
4. **Climax beat:** she taps `{components.reveal-button}` ("Mostrar mis resultados"). The radar's five sectors draw in one after another (Interaction Primitives), `{colors.role-*}` fills settling into place, the exact-values table fading in beneath once the last axis lands.
5. She notices the saboteadores block below is visibly softer-toned than the radar — it doesn't compete for her attention, it waits (see Colors, "gentler register").
6. She screenshots the headline strength to share with her coach later.

*Failure path:* if Marta's cycle hasn't yet crossed the 80%-response / self-evaluation gate (spec.md §6), the page shows the reassuring threshold empty state instead of the summary — no reveal button exists until the report is actually ready.

### Diego gives feedback mid-wizard

*(See `mockups/key-wizard-question.html`.)*

Diego is an ad-hoc evaluator, invited by a colleague to give feedback about a third teammate.

1. He opens a link from his email on his phone during a commute — `/responder/[token]`.
2. Each question fills the screen alone, `{components.progress-bar}` above it, `{components.anonymity-badge}` sitting quietly under every question, not just the first.
3. He pauses at the free-text question about a challenge area; he doesn't want to say too much.
4. **Climax beat:** as he taps to submit that answer, the anonymity badge is briefly emphasized ("Anónimo — nadie ve tu nombre") at the exact moment of sending — reconfirming, not interrupting.
5. He continues, and when a call interrupts him three questions later, he closes the tab.
6. The next time he opens the link, `{components.bookmark-chip}` greets him: "Guardado — continúa cuando quieras," his answers intact.

*Failure path:* if the request Diego is answering hasn't reached the platform's minimum invited-evaluator count yet (spec.md §6 — not his concern to configure, but relevant if a request is misconfigured), the wizard simply isn't reachable yet; that failure belongs to the requester's setup flow, not this one.

### Sofía reviews the company's competency map

*(See `mockups/key-dashboard-home.html`.)*

Sofía is the Supervisor (RRHH) for her organization, checking in on culture patterns before a leadership meeting.

1. She opens `/dashboard/informe-empresa` on her desktop, where she works most days.
2. The page renders in the denser, Leapsome-style grid (Layout & Spacing) — more cards, tighter gaps than an individual's dashboard — and every card carries `{components.aggregate-badge}` ("Vista agregada — 34 personas").
3. **Climax beat:** she notices none of these cards use the indigo `{components.card-accent}` fill her own personal dashboard uses for "moments" — the visual language itself tells her this is a rollup, before she reads a single number, and she trusts she's not looking at one person's private result by accident.
4. She scans the competency radar aggregated across the whole org, spots a consistently lower Coach score in one department, and exports the view to bring to the meeting.

*Failure path:* if a team is small enough that showing its aggregate would risk re-identifying someone (spec.md §6's k-anonymity floor), that team's card is hidden entirely rather than shown with a warning — the absence itself carries no signal Sofía could use to guess who's underneath it.
