---
status: final
updated: '2026-09-11'
name: 'Brújula Segura'
description: 'Confident-compass visual identity for Brújula — a warm, color-blocked, energizing register for an anonymous peer-feedback and 360 coaching tool, treating feedback as a team ritual rather than private reflection.'
colors:
  paper: '#F7F4EE'
  paper-deep: '#FFFFFF'
  surface-2: '#EFEADD'
  ink: '#1C2033'
  ink-soft: '#5B5F7A'
  line: '#E4DFD3'
  indigo: '#3B4FA6'
  indigo-deep: '#232F73'
  indigo-wash: '#E7EAF7'
  coral: '#FF6B4A'
  coral-deep: '#A8391F'
  coral-wash: '#FFE4DA'
  role-visionario: '#3B4FA6'
  role-arquitecto: '#0E8074'
  role-catalizador: '#FF6B4A'
  role-catalizador-deep: '#A8391F'
  role-coach: '#C98A2E'
  role-coach-deep: '#8F6321'
  role-plenitud: '#8B4B9E'
  saboteador-tint: '#B56A4C'
  saboteador-wash: '#F7E6DE'
  intensity-1: '#EEF0FA'
  intensity-2: '#C5CCEC'
  intensity-3: '#8C98D4'
  intensity-4: '#5563B6'
  intensity-5: '#232F73'
  paper-dark: '#171A2E'
  paper-deep-dark: '#20243D'
  surface-2-dark: '#282D4E'
  ink-dark: '#EFEEE6'
  ink-soft-dark: '#AEB2CC'
  line-dark: '#333861'
  indigo-dark: '#96A3FF'
  indigo-deep-dark: '#C7CFFF'
  indigo-wash-dark: '#262C52'
  coral-dark: '#FF9179'
  coral-deep-dark: '#FFB49C'
  coral-wash-dark: '#3B2A28'
  role-visionario-dark: '#96A3FF'
  role-arquitecto-dark: '#3FBDAA'
  role-catalizador-dark: '#FF9179'
  role-catalizador-deep-dark: '#FFB49C'
  role-coach-dark: '#E3B15E'
  role-coach-deep-dark: '#F0C989'
  role-plenitud-dark: '#C48AD9'
  saboteador-tint-dark: '#D9A98F'
  saboteador-wash-dark: '#3A2C27'
  intensity-1-dark: '#232748'
  intensity-2-dark: '#3A4076'
  intensity-3-dark: '#5B64A8'
  intensity-4-dark: '#8590D6'
  intensity-5-dark: '#C7CFFF'
typography:
  display:
    fontFamily: "'Sora', 'Segoe UI', system-ui, sans-serif"
    fontWeight: 700
    fontSize: '32px'
    lineHeight: '40px'
    letterSpacing: '-0.01em'
  heading:
    fontFamily: "'Sora', 'Segoe UI', system-ui, sans-serif"
    fontWeight: 600
    fontSize: '26px'
    lineHeight: '32px'
  heading-sm:
    fontFamily: "'Sora', 'Segoe UI', system-ui, sans-serif"
    fontWeight: 600
    fontSize: '20px'
    lineHeight: '26px'
  body:
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: '16px'
    lineHeight: '1.6'
  caption:
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif"
    fontSize: '13px'
    letterSpacing: '0.02em'
  data:
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif"
    fontVariantNumeric: 'tabular-nums'
rounded:
  sm: '8px'
  md: '14px'
  lg: '22px'
  full: '9999px'
  DEFAULT: '14px'
spacing:
  '1': '4px'
  '2': '8px'
  '3': '12px'
  '4': '16px'
  '6': '24px'
  '8': '32px'
  '12': '48px'
  '16': '64px'
  gutter: '20px'
elevation:
  card: '0 1px 2px rgba(28,32,58,0.06), 0 8px 20px rgba(28,32,58,0.08)'
  raised: '0 10px 28px rgba(35,47,115,0.18)'
  floating: '0 14px 32px rgba(255,107,74,0.28)'
components:
  button-primary:
    background: '{colors.indigo}'
    color: '{colors.paper-deep}'
    radius: '{rounded.lg}'
    shadow: 'elevation.raised'
    fontFamily: '{typography.heading.fontFamily}'
  button-secondary:
    background: 'transparent'
    border: '1px solid {colors.line}'
    color: '{colors.ink}'
    radius: '{rounded.lg}'
  reveal-button:
    background: '{colors.coral-deep}'
    color: '{colors.paper-deep}'
    radius: '{rounded.full}'
    shadow: 'elevation.floating'
  card:
    background: '{colors.paper-deep}'
    radius: '{rounded.lg}'
    shadow: 'elevation.card'
    padding: '{spacing.6}'
  card-accent:
    background: '{colors.indigo}'
    color: '{colors.paper-deep}'
    radius: '{rounded.lg}'
    shadow: 'elevation.raised'
  anonymity-badge:
    background: '{colors.indigo-wash}'
    color: '{colors.indigo-deep}'
    radius: '{rounded.full}'
    fontFamily: '{typography.caption.fontFamily}'
  role-badge:
    radius: '{rounded.full}'
    fontFamily: '{typography.caption.fontFamily}'
    color: '{colors.paper-deep}'
    fill-visionario: '{colors.role-visionario}'
    fill-arquitecto: '{colors.role-arquitecto}'
    fill-catalizador: '{colors.role-catalizador-deep}'
    fill-coach: '{colors.role-coach-deep}'
    fill-plenitud: '{colors.role-plenitud}'
  saboteador-bar:
    background: '{colors.saboteador-wash}'
    fill: '{colors.saboteador-tint}'
    radius: '{rounded.sm}'
  intensity-scale:
    ramp: ['{colors.intensity-1}', '{colors.intensity-2}', '{colors.intensity-3}', '{colors.intensity-4}', '{colors.intensity-5}']
    valueLabel: 'always printed beside the meter, never meter-only'
  progress-bar:
    track: '{colors.line}'
    fill: '{colors.indigo}'
    radius: '{rounded.full}'
  bookmark-chip:
    background: '{colors.coral-wash}'
    color: '{colors.coral-deep}'
    radius: '{rounded.sm}'
  scale-slider:
    track: '{colors.line}'
    fill: '{colors.indigo}'
    thumb: '{colors.indigo}'
    thumbRadius: '{rounded.full}'
  aggregate-badge:
    background: '{colors.surface-2}'
    color: '{colors.ink-soft}'
    radius: '{rounded.full}'
    fontFamily: '{typography.caption.fontFamily}'
  focus-ring:
    color: '{colors.indigo}'
    colorOnFilled: '{colors.paper-deep}'
    width: '2px'
    offset: '2px'
    style: 'solid outline, drawn outside the element bounds'
---

# DESIGN.md — Brújula Segura

## Brand & Style

Brújula Segura treats feedback as an energizing team ritual, not a private confession. The posture is **confident, warm, and unafraid of color** — color-blocked cards, a bold accent used without apology on primary actions, generous radius and lifted shadow. It borrows its consumer-grade polish from Lattice and Culture Amp rather than the quieter, therapeutic register of Headspace or Notion (that was Direction A, "Brújula Serena," and was not chosen). The compass is the brand's own motif — a recurring graphic identity element, not a decoration — because the product's name and its promise (find your bearing, safely) are the same idea.

Every screen still carries the same non-negotiable undertone regardless of how confident the chrome gets: feedback here is anonymous, and the interface says so quietly but constantly, never loudly and never just once.

References to "spec.md §N" throughout both this document and EXPERIENCE.md point to Brújula's existing product spec (`docs/spec.md`), which this redesign doesn't restate — only cites where a token or pattern is grounded in an already-decided product rule.

## Colors

`{colors.indigo}` is the one color used *with* authority: primary buttons, the reveal CTA's companion elements, card accents, the app's own chrome. It is never used decoratively — every appearance of indigo-as-fill means "this is the primary path forward." `{colors.coral}` is the second, deliberate accent (the brainstorm's final call was "indigo/coral," not indigo alone) — it marks the single most energizing moment on a screen: the "mostrar mis resultados" reveal button, a wizard-step completion pulse, a report's headline strength. Coral never appears twice on the same screen doing two different jobs.

`{colors.paper}` is a warm off-white, never stark `#FFFFFF` as a page background — cards sit on it in `{colors.paper-deep}` (true white) so the color-blocking reads as intentional layering, not a flat page. `{colors.ink}` is near-black but indigo-tinted, so body text quietly belongs to the same family as the brand accent.

**Role colors** (`{colors.role-visionario}` through `{colors.role-plenitud}`) replace the current implementation's literal red/blue/green/orange/yellow set, which reads stoplight-adjacent even though it's naming categories, not scores. The five are chosen to be clearly distinct from one another and from the score-intensity ramp below, with none reading as pure danger-red or go-green: indigo (Visionario), teal (Arquitecto), coral (Catalizador), amber (Coach), plum (Plenitud, kept visually apart from the four roles since it's transversal, per spec.md §7). See `mockups/key-report-reveal.html` for all five in context — the radar's translucent sector fills and the role-badge list beside it.

**White text on a role fill must clear AA.** Two of the five base tones don't: `{colors.role-catalizador}` (#FF6B4A, same value as `{colors.coral}`) and `{colors.role-coach}` (#C98A2E) both fail at white-text sizes. Any role-badge pill (`{components.role-badge}`) uses `{colors.role-catalizador-deep}` and `{colors.role-coach-deep}` respectively as its fill instead of the base tone — the base tones stay reserved for non-text uses (the radar's translucent sector wedges, which have no text directly on them). Visionario, Arquitecto, and Plenitud clear AA at their base tone and need no deep variant.

**Scores and agreement never use red/green.** `{colors.intensity-1}` through `{colors.intensity-5}` are a single indigo hue ramp — low values are a pale wash, high values are near `{colors.indigo-deep}`. This is the only value-encoding color in the system; nothing else is ever read as "good" or "bad" by color alone.

`{colors.saboteador-tint}` and `{colors.saboteador-wash}` are deliberately quieter, desaturated warm tones — visibly gentler than `{colors.coral}` — so the saboteadores block (spec.md §7: self-only, no comparison to others, no aggregate "impact" number) never competes visually with the confident register used everywhere else. It is the one place on the page allowed to feel soft, but "soft" stops short of illegible: `{colors.saboteador-tint}` is calibrated to still clear the 3:1 non-text-contrast floor against `{colors.saboteador-wash}` as a filled bar, precisely because it's a graphical value indicator, not decoration. See `mockups/key-report-reveal.html` for the saboteador bars in context, sitting visibly quieter than the radar above them without disappearing.

`{colors.coral-deep}` is the color used whenever coral needs to carry white text — `{components.reveal-button}`'s fill and the Catalizador `{components.role-badge}`, as established above, and nowhere else. The base bright tone stays reserved for non-text uses: the `elevation.floating` shadow tint, icon accents, and the radar's translucent sector wedges.

**Dark mode** pairs every token above with a `-dark` suffix (for example `{colors.indigo-dark}`, `{colors.role-arquitecto-dark}`), following `prefers-color-scheme`. The relationships hold across both: indigo stays the sole authoritative accent, coral stays the single energizing moment, the intensity ramp stays indigo-only light-to-dark, and the saboteador tone stays visibly softer than the radar's role colors — dark mode lightens and desaturates slightly for screen glare rather than inverting the palette's meaning.

## Typography

`{typography.display}` and `{typography.heading}` are set in **Sora** — geometric, confident, slightly rounded terminals that echo `{rounded.lg}`. It carries the brand's personality: page titles, the compass wordmark, report headline strengths, a cycle's name. `{typography.body}` is **Inter** for everything read at length or interacted with — form labels, buttons, table cells, wizard questions. The pairing is deliberate: Sora says "this is Brújula," Inter says "now do the work."

`{typography.data}` is Inter with `fontVariantNumeric: tabular-nums` for every place digits line up in a column — the exact-values comparison table (spec.md §9), saboteador scores, percentile figures. No third typeface is introduced for this; tabular figures inside Inter carry the job.

Scale: `{typography.display}` 32/40, `{typography.heading}` 26/32, `{typography.heading-sm}` 20/26, `{typography.body}` 16/26, `{typography.caption}` 13/18 — `text-wrap: balance` on every heading.

## Layout & Spacing

`{spacing}` is a 4px base scale. Cards use `{spacing.6}` internal padding; sections stack with `{spacing.8}`–`{spacing.12}` between them. `{spacing.gutter}` (20px) is the non-negotiable side margin at every width, including the mobile-first `/responder/[token]` flow (spec.md §4.4 — most invitees open this from a phone).

Dashboard and report screens use a card-grid layout — the competency map, saboteadores, and AI narrative each get their own color-blocked card rather than one long scrolling page, so the "energizing ritual" register reads even before any content loads. Admin/company screens (spec.md §11, Supervisor views) tighten this grid for density — smaller `{spacing.4}` gaps, more cards per row — borrowing the Leapsome-style scan density the brainstorm named for `/admin` and `informe-empresa`, distinct from the more spacious individual-report layout.

## Elevation & Depth

Three tiers, all warm-tinted (never pure black) to stay inside the indigo family:

- `elevation.card` — `0 1px 2px rgba(28,32,58,0.06), 0 8px 20px rgba(28,32,58,0.08)` — the resting state for every `{components.card}`.
- `elevation.raised` — `0 10px 28px rgba(35,47,115,0.18)` — indigo-tinted, used only on `{components.button-primary}` and `{components.card-accent}` so the lift itself signals "primary."
- `elevation.floating` — `0 14px 32px rgba(255,107,74,0.28)` — coral-tinted, reserved for `{components.reveal-button}` alone, so the one shadow color in the whole system that isn't indigo marks the one most energizing action.

## Shapes

`{rounded.lg}` (22px) is the signature radius — primary buttons, hero/report cards, the reveal button's pill shape. `{rounded.md}` (14px) is the default for ordinary cards, inputs, and the wizard's question card. `{rounded.sm}` (8px) is reserved for small inline elements: the saboteador bar, badges nested inside a card. `{rounded.full}` is pills only — role badges, the anonymity chip, evaluator-category chips, the bookmark/pause affordance. Nothing in the system uses a sharp 0px corner; that reads as the old, un-redesigned Brújula.

## Components

> Visual reference: `mockups/key-report-reveal.html` (card, card-accent contrast with the dashboard mock, role-badge, saboteador-bar, intensity values), `mockups/key-wizard-question.html` (progress-bar, anonymity-badge, bookmark-chip, scale-slider styling), `mockups/key-dashboard-home.html` (card-accent vs. aggregate-badge). This section and EXPERIENCE.md's Component Patterns win on any conflict with a mock.

- **`{components.button-primary}`** — indigo fill, white Sora-weight label, `{rounded.lg}`, `elevation.raised`. The single most common interactive element; every screen has exactly one visually primary action.
- **`{components.button-secondary}`** — transparent fill, `{colors.line}` outline, `{colors.ink}` label, `{rounded.lg}`. Every non-primary action (cancel, back, "volver al panel") — never given `elevation.raised`, so it never visually competes with the one primary button on screen.
- **`{components.reveal-button}`** — `{colors.coral-deep}` fill (not the base `{colors.coral}` — see Colors), pill-shaped (`{rounded.full}`), `elevation.floating`, paired with a small compass-glyph icon. This is "mostrar mis resultados" and nothing else — its coral-family + floating-shadow combination is reserved exclusively for this one interaction across the product, so a user learns it on sight.
- **`{components.card}`** — the base color-blocked unit: white on warm paper, `{rounded.lg}`, `elevation.card`. Competency map, saboteadores, AI-narrative, and report-header all render as siblings of this component.
- **`{components.card-accent}`** — the same card, filled `{colors.indigo}` with white text — reserved for dashboard-home "moments" (an open cycle, an invitation to respond) per the brainstorm's Lattice-style card treatment, never for data-dense admin screens.
- **`{components.anonymity-badge}`** — a small indigo-wash pill with a lock/compass glyph and one line of micro-copy ("Anónimo — nadie ve tu nombre"), anchored beside every feedback input, not just a one-time disclaimer banner.
- **`{components.role-badge}`** — pill in the relevant `{colors.role-*}` tone (using the `-deep` variant for Catalizador and Coach, per Colors), always white text; placement is EXPERIENCE.md's Component Patterns' to define. Shows a numeric value ("Catalizador · 4.6") only when the surrounding component doesn't already display it elsewhere on the same view (for example, the report-reveal role list, where the exact-values table hasn't rendered yet). Otherwise it shows the name alone, to avoid stating the same number twice.
- **`{components.saboteador-bar}`** — a horizontal bar in `{colors.saboteador-tint}` on `{colors.saboteador-wash}`, visibly softer-edged and lower-contrast than the competency radar it sits below, but still calibrated to clear the 3:1 non-text floor as a graphical indicator (see Colors).
- **`{components.intensity-scale}`** — the five-step indigo ramp, used for every competency/agreement value shown as a filled meter, always with the exact number printed beside it (never meter-only), replacing any red/green treatment anywhere in the product.
- **`{components.progress-bar}`** — indigo fill on a line-colored track, used in the wizard as a smooth bar (never a "12 of 30" counter).
- **`{components.bookmark-chip}`** — `{colors.coral-wash}` pill with `{colors.coral-deep}` text (this specific pairing is what makes it AA-legible — see Colors) reading "Guardado — continúa cuando quieras" — the pause/resume affordance styled as a bookmark rather than a progress-loss warning.
- **`{components.scale-slider}`** — the existing 0.5-increment `ScaleSlider` component, restyled only: `{colors.indigo}` fill and thumb, `{rounded.full}` thumb shape, `{colors.line}` track. No change to its interaction model.
- **`{components.aggregate-badge}`** — a small `{colors.surface-2}` pill reading "Vista agregada — [N] personas," paired with the denser admin/aggregate grid (Layout & Spacing) as the visual signal that a view is a rollup, never an individual's data — deliberately the one badge in the system that is *not* color-blocked in the confident indigo/coral palette, so it reads as structurally different at a glance.
- **`{components.focus-ring}`** — 2px solid outline, 2px offset, drawn outside the element's own fill. On `{colors.paper}`/`{colors.paper-deep}` backgrounds it uses `{colors.indigo}`; on indigo- or coral-filled components (`button-primary`, `reveal-button`) it switches to `{colors.paper-deep}` instead, so the ring is never drawn against a fill it can't be seen on.

## Do's and Don'ts

- **Do** reserve `{colors.coral}` for exactly one energizing moment per screen. **Don't** let it repeat as a second CTA on the same view — it stops meaning anything the moment it's decorative.
- **Do** use the indigo `{components.intensity-scale}` for every score, agreement level, or comparison value. **Don't** introduce red or green anywhere as a value signal, including in future chart types.
- **Do** keep `{components.saboteador-bar}` visually softer than the competency radar on the same page. **Don't** style saboteadores as a sixth "role" — they are deliberately not part of the VACC/role system (spec.md §7).
- **Do** show the `{components.anonymity-badge}` next to every feedback input, every time. **Don't** treat a one-time onboarding disclaimer as sufficient.
- **Do** use `{components.card-accent}` (indigo-filled) only for dashboard-home "moment" cards. **Don't** apply it to admin/aggregate screens, where the distinct chrome should instead come from the tighter, denser grid described in Layout & Spacing — a filled indigo card on an aggregate view risks reading as one person's individual result.
