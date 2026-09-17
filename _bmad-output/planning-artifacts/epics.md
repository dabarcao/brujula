---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-brujula-gui-2026-09-12/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-brujula-gui-2026-09-11/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-brujula-gui-2026-09-11/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-brujula-gui-2026-09-11/EXPERIENCE.md
  - docs/spec.md
---

# Brújula Core - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Brújula Core (backend/GUI decoupling + the parallel "Brújula Segura" visual redesign, interleaved per the architecture spine's rollout order), decomposing the requirements from the PRD, the UX design contract, the Architecture spine, and supporting domain context in the product's own spec into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: The build must fail if any file under `src/app/**` or `src/components/**` imports `@/lib/supabase/*` or `@/server/db/*` directly (an ESLint `no-restricted-imports` rule failing `npm run lint`/CI on either path); every file under `src/server/db/*` and `src/server/managers/*` must open with `import "server-only"` as a build-time backstop.

FR2: Each of the six domains (report groups, admin/members, cycles, feedback, responder/invitation, read-only reports) must expose its business logic through exactly one manager, callable both in-process (Server Components/Actions) and over HTTP (Route Handlers), with identical behavior either way; Server Action files under `src/app/actions/` become one-line delegates to a manager function.

FR3: Route Handlers must reject any request without a valid app-issued token (401), even if a valid Supabase session cookie is present. The DB-access layer must keep authenticating to Supabase underneath so existing RLS policies keep enforcing authorization. Login must issue both the existing Supabase session cookie (unchanged) and the new app token — neither replaces the other.

FR4: Responder/invitee-facing routes (`/responder/[token]`, `/invitacion/[token]`) must validate the single-use invitation token exactly as today; `requireApiToken()` must never gate these routes.

FR5: Each domain's old and new code paths must coexist behind a dedicated `USE_NEW_API_<DOMAIN>` flag, default `false`, checked only in the thin caller (never inside a manager). The old code path is deleted only after the new path survives one full production cycle (one complete Ciclo 360 lifecycle, or 14 calendar days, whichever is longer) with the flag on. At most one domain's flag is flipped per deploy.

FR6: Each migrated domain must have 2-3 passing integration tests (Vitest, against a locally seeded Supabase instance via the existing `scripts/seed-*.mjs`, never production) covering auth-boundary rejection, anonymity-threshold enforcement, and a golden-output check comparing the old and new paths on the same seed, before that domain's flag flips on.

### NonFunctional Requirements

NFR1: No added network hop for the in-process path — a Server Component must never call its own app's HTTP API instead of calling a manager function directly (same serverless-function boundary; added latency, no isolation benefit).

NFR2: The migration's entire safety net (feature flags + minimum tests) must be designed to work with no CI and no staging environment, since neither exists in this repo today.

NFR3: Automated testing does not cover Server Component rendering (Vitest doesn't support it) — that layer is verified manually/via QA checklist, not unit-tested.

### Additional Requirements

- Brownfield migration of an existing production Next.js 16 + Supabase app — no starter/greenfield template applies.
- New source tree per the architecture spine: `src/server/db/*.ts` (cycles, feedback, responder, reportGroups, members, admin, aiInterpretations), `src/server/managers/*.ts` (cyclesManager, feedbackManager, responderManager, reportGroupsManager, membersManager, adminManager, authManager, aiInterpretationManager), `src/server/shared/{errors.ts, auth.ts}`, `src/app/api/**/route.ts`.
- `aiInterpretationManager` is a split, not a verbatim move: RPC calls (fetching comparison/saboteador data, `save_ai_interpretation`, `save_report_group_interpretation`) move to a new `db/aiInterpretations.ts`; only prompt-building, the Anthropic API call, and orchestration stay in the manager.
- `feedback_requests` shared-table ownership follows the existing RPC naming split: `cyclesManager` calls only cycle-specific lifecycle RPCs (`create_feedback_cycle`, `close_cycle_request`, `organize_cycle_evaluators`); `feedbackManager` calls only ad-hoc-specific lifecycle RPCs (`create_ad_hoc_feedback_request*`, `close_ad_hoc_feedback_request`). Neither duplicates the other's lifecycle RPC call.
- API error envelope convention: JSON `{ error: { code, message } }`, HTTP status conveys the class (401/403 auth, 404 not found, 422 validation, 500 unexpected).
- App token carried as a separate httpOnly + Secure + SameSite=Lax cookie, plus a required anti-CSRF header on mutating requests — exact mechanism finalized during the scaffolding epic, not pre-decided here.
- Known discrepancy to verify before the POC is called done: `src/lib/supabase/server.ts` has a comment claiming session refresh is handled by "the middleware," but no `middleware.ts` exists anywhere in the repo.
- Domain migration order is fixed, risk-ascending: (1) report groups, (2) admin/members + auth, (3) cycles, (4) feedback, (5) responder/invitation — last, (6) read-only reports.
- Domain grounding from `docs/spec.md` relevant to manager/story logic: anonymity thresholds (minimum 5 invitees, minimum 3 responses, floor never configurable below 3; "jefe/responsable directo" exception revealed at 1 response); VACC competency roles (Visionario, Arquitecto, Catalizador, Coach, plus Plenitud as a transversal fifth); 5 saboteurs (Controlador, Evitador, Hiperracional, Complaciente, Perfeccionista — self-only, no aggregate impact score); evaluator categories (jefe/equipo/empresa/otro); core entities `feedback_cycles`, `feedback_requests`, `feedback_invitations`, `feedback_responses` relevant to the cycles/feedback domain managers.
- Full RLS-to-application-code authorization rewrite and the actual Supabase-to-direct-Postgres client swap are explicitly deferred, future, separate initiatives — noted for backlog awareness, not built as part of this breakdown.

### UX Design Requirements

**Design tokens:**
- UX-DR1: Full color token set (`paper`, `paper-deep`, `surface-2`, `ink`, `ink-soft`, `line`, `indigo`, `indigo-deep`, `indigo-wash`, `coral`, `coral-deep`, `role-visionario`, `role-arquitecto`, `role-catalizador`, `role-catalizador-deep`, `role-coach`, `role-coach-deep`, `role-plenitud`, `saboteador-tint`, `saboteador-wash`, `intensity-1..5`) plus their `-dark` counterparts for `prefers-color-scheme`.
- UX-DR2: Typography tokens (Sora for `display`/`heading`/`heading-sm`; Inter for `body`/`caption`/`data` with `tabular-nums`).
- UX-DR3: Rounded scale (`sm` 8px, `md` 14px, `lg` 22px, `full` 9999px) and elevation tokens (`card`/`raised`/`floating` shadow values).
- UX-DR4: Spacing scale (4px base unit, `gutter` 20px).

**Components (14, each with its own visual + behavioral spec — not to be collapsed into a generic "build the component library" story):**
- UX-DR5: `button-primary` (indigo fill, white label, `rounded.lg`, `elevation.raised`).
- UX-DR6: `button-secondary` (transparent, line outline, ink label).
- UX-DR7: `reveal-button` — the "Mostrar mis resultados" CTA (coral-deep fill, pill shape, `elevation.floating`, compass-glyph icon).
- UX-DR8: `card` (base color-blocked unit).
- UX-DR9: `card-accent` (indigo-filled card for dashboard-home "moments").
- UX-DR10: `anonymity-badge` (indigo-wash pill, lock/compass glyph + micro-copy, plus its icon-swap-to-checkmark emphasis state at wizard submit).
- UX-DR11: `role-badge` (per-role tinted pill; `-deep` variants for Catalizador/Coach for AA contrast).
- UX-DR12: `saboteador-bar` (softer-toned horizontal bar, calibrated to clear 3:1 non-text contrast).
- UX-DR13: `intensity-scale` (5-step indigo ramp meter, always paired with a printed number).
- UX-DR14: `progress-bar` (indigo fill on line-colored track, wizard use).
- UX-DR15: `bookmark-chip` (coral-wash pill, coral-deep text, pause/resume affordance).
- UX-DR16: `scale-slider` (restyle of the existing `ScaleSlider` — indigo fill/thumb, `rounded.full` thumb; interaction unchanged).
- UX-DR17: `aggregate-badge` ("Vista agregada — [N] personas," deliberately not color-blocked in the indigo/coral palette).
- UX-DR18: `focus-ring` (2px solid, 2px offset; indigo on paper backgrounds, paper-deep on indigo-or-coral-filled components).

**Accessibility:**
- UX-DR19: All color/text pairings clear WCAG AA (coral/role-catalizador/role-coach carry white text only via their `-deep` variants, never the base tone).
- UX-DR20: Reduced-motion fallback specified per interaction (reveal → instant full-opacity render; wizard step transition → instant swap, celebration removed not replayed).
- UX-DR21: Anonymity-badge emphasis pairs its color shift with a non-color cue (lock→checkmark icon swap), never color alone.

**Responsive/platform:**
- UX-DR22: Mobile-first layout for `/responder/[token]` and `/invitacion/[token]` (single-column, large touch targets, no hover-dependent interaction).
- UX-DR23: Desktop-optimized-but-responsive layout for `/dashboard/**` and `/admin/**` (multi-column card grids above the mobile breakpoint, single-column below).

**Interaction patterns:**
- UX-DR24: Reveal → draw-in (radar axes draw in sequentially, ~60ms stagger per axis) only on explicit user tap of `reveal-button`, never on page load.
- UX-DR25: Wizard step transition (~200ms slide/fade between questions, plus a checkmark micro-celebration confined to the wizard only).
- UX-DR26: Chip toggles (evaluator categories — tap to add/remove a comparison-chart line, session-only state).

**State patterns:**
- UX-DR27: Threshold-not-met empty state (reassuring progress copy, never error-styled).
- UX-DR28: Generic error state (plain-language + retry, never red/coral).
- UX-DR29: Saved/paused state (`bookmark-chip` on wizard exit).
- UX-DR30: Revealed vs. not-yet-revealed report state (collapsed summary vs. expanded radar).
- UX-DR31: Permission-denied state for a non-Supervisor/non-admin on role-gated routes.
- UX-DR32: Dashboard-empty state (new org / lull between cycles).
- UX-DR33: Mi-mapa first-time state (zero closed 360s yet).
- UX-DR34: Invitación accept/decline state (asymmetric — checkmark acknowledgment on accept, plain confirmation on decline).

**Information architecture / component patterns:**
- UX-DR35: Aggregate-chrome distinction — Supervisor-only aggregate views render in a denser grid with `aggregate-badge`, never `card-accent`.
- UX-DR36: Evaluator-category chips restyled to the `role-badge` shape, without changing the existing single-hue-family color decision.

**Key flows (shape the acceptance criteria of their domain's stories):**
- UX-DR37: Three key flows — Marta's report reveal, Diego's wizard submission, Sofía's aggregate review — with their stated climax beats and failure paths, each realized end-to-end by its corresponding domain's stories.

### FR Coverage Map

| Req | Epic |
|---|---|
| FR1–FR3, FR5–FR6 | Epic 1 (established, report groups), Epic 3 (applied per remaining domain) |
| FR4 | Epic 3 (responder/invitation story) |
| NFR1–NFR3 | Epic 1 (architectural rule established, holds throughout) |
| Additional Requirements (source tree, aiInterpretationManager split, feedback_requests ownership split, error envelope, token/CSRF, middleware discrepancy check, fixed domain order) | Epic 1 (scaffolding-wide), Epic 3 (per-domain specifics) |
| UX-DR1–21 (tokens, all 14 components, accessibility) | Epic 2 |
| UX-DR22–37 (responsive/interaction/state patterns, IA rules) | Epic 2 (UX-DR34, report-groups' own Invitación flow), Epic 4 (remaining domains) |

## Epic List

### Epic 1: Core Layering Foundation — Report Groups Migration (POC)

Proves the entire `db → managers → API` pattern end to end on the smallest, most isolated domain — the layering scaffolding, the app-token auth mechanism, the ESLint boundary rule, and the per-domain feature-flag/test pattern all get built once here and reused by every later domain. Uses characterization testing (capture the current implementation's actual behavior as a baseline *before* refactoring, then verify the new path against that same baseline) as the core safety discipline, given zero pre-existing test coverage on a live production app — this pattern repeats for every domain in Epic 3, not just this one.

**FRs covered:** FR1, FR2, FR3, FR5, FR6.

### Epic 2: Brújula Segura Visual Foundation — Tokens, Components & Report Groups Redesign

Establishes the full design-token system and 14-component library from DESIGN.md, then applies it to the one domain already migrated in Epic 1 — the first real screens running the new visual identity.

**UX-DRs covered:** UX-DR1–21, UX-DR34.

### Epic 3: Remaining Backend Domain Migrations

The same proven pattern from Epic 1, applied as ordered stories to the five remaining domains in risk-ascending order: admin/members + auth → cycles → feedback → responder/invitation → read-only reports.

**FRs covered:** FR1, FR2, FR3, FR4 (responder/invitation story), FR5, FR6 — repeated per domain.

### Epic 4: Remaining Domain UI Redesigns

Mirrors Epic 3's domain order; each story is gated on its corresponding Epic 3 story landing first, per the architecture spine's sequencing rule (per-domain redesign follows that domain's backend migration, never precedes it).

**UX-DRs covered:** UX-DR22–33, UX-DR35–37.

### Epic 5: Legacy Retirement & Supabase-Removal Readiness Review

Once all six domains are stable on the new path, deletes remaining old-path code project-wide and formally evaluates the deferred RLS-to-application-code and Supabase-to-direct-Postgres work as a scoped future initiative (not built here — see PRD §5 Non-Goals).

**Addresses:** the architecture spine's Deferred items; closes the loop on FR5's "delete old path" condition project-wide.

## Epic 1: Core Layering Foundation — Report Groups Migration (POC)

Proves the entire `db → managers → API` pattern end to end on the smallest, most isolated domain, using characterization testing as the core safety discipline given zero pre-existing coverage on a live production app.

### Story 1.1: Characterization Tests for Report Groups (Current Behavior Baseline)

As the operator,
I want automated tests that capture report-groups' current behavior before any refactor,
So that every later story in this migration is verified against unchanged behavior, not checked once at the end.

**Acceptance Criteria:**

**Given** the current `src/app/actions/reportGroups.ts` implementation, untouched
**When** characterization tests are written against it using `scripts/seed-demo-company.mjs`-seeded data
**Then** they capture, as recorded/golden outputs: creating a group with N members, accepting/declining, closing once the accepted-count crosses threshold, and the AI-interpretation text generated on close

**Given** these tests
**When** run against today's implementation
**Then** all pass — proving they describe existing behavior, not aspirational behavior

**Given** AD-6's middleware/session-refresh discrepancy
**When** this story's baseline is captured
**Then** a manual check confirms whether Supabase session refresh is actually happening today, recorded as a known baseline fact before any refactor begins

### Story 1.2: DB-Access and Manager Scaffolding for Report Groups

As the operator,
I want a `db/reportGroups.ts` wrapping the existing report-group RPCs and a `reportGroupsManager.ts` calling only that file,
So that report-groups business logic has a home outside the Server Action file.

**Acceptance Criteria:**

**Given** the existing `create_report_group`/`respond_to_report_group`/`close_report_group` RPCs
**When** `db/reportGroups.ts` is created
**Then** it exports typed functions wrapping each RPC with no Supabase-shaped types in their signatures

**Given** `reportGroupsManager.ts`
**When** it needs data
**Then** it calls only `db/reportGroups.ts`, never `supabase` directly

**Given** `closeReportGroup`'s AI-interpretation step
**When** the manager is built
**Then** its RPC calls move into a new `db/aiInterpretations.ts`, and only prompt-building/Anthropic-call logic remains in a new `aiInterpretationManager.ts` (per AD-3)

**And** Story 1.1's characterization tests still pass, now run against the new manager path (not yet wired to any UI, called directly in the test)

### Story 1.3: Enforce the Import Boundary

As the operator,
I want the build to fail if any page or component imports Supabase or the DB-access layer directly,
So that "the GUI never touches the core directly" is a checkable fact, not a convention.

Realizes FR1.

**Acceptance Criteria:**

**Given** the ESLint config
**When** a `no-restricted-imports` rule forbids `@/lib/supabase/*` and `@/server/db/*` under `src/app/**`/`src/components/**`
**Then** `npm run lint` fails on either violation

**Given** `src/server/db/*` and `src/server/managers/*`
**When** each file is created
**Then** it opens with `import "server-only"`

**Given** a deliberate test violation (a scratch file importing `@/server/db/reportGroups` from a page)
**When** lint runs
**Then** it reports the violation — verifying the rule works, not just exists — then the scratch file is removed

### Story 1.4: App Token Issuance and Validation

As the operator,
I want login to issue a first-party app token alongside the existing Supabase session, and a `requireApiToken()` helper Route Handlers use,
So that the API layer doesn't depend on Supabase's session mechanism.

Realizes FR3.

**Acceptance Criteria:**

**Given** a successful login
**When** authentication completes
**Then** both the existing Supabase session cookie (unchanged) and a new app token (httpOnly, Secure, SameSite=Lax) are set

**Given** a Route Handler request without a valid app token
**When** `requireApiToken()` runs
**Then** it returns 401 regardless of Supabase session cookie state

**Given** a mutating request missing the required anti-CSRF header
**When** validated
**Then** it's rejected

**And** the DB-access layer continues authenticating to Supabase underneath, so existing RLS keeps enforcing authorization unchanged

### Story 1.5: Report Groups Route Handler and Client Fetch Wrapper

As a Client Component,
I want to create/respond-to/close a report group through the new API,
So that Client Components no longer need direct Supabase access.

Realizes FR2.

**Acceptance Criteria:**

**Given** `src/app/api/report-groups/route.ts`
**When** a valid app-token request calls it
**Then** it invokes `reportGroupsManager` and returns the `{error:{code,message}}` envelope on failure

**Given** `src/lib/api/client.ts`
**When** a Client Component calls `apiFetch('/report-groups', ...)`
**Then** the app token travels automatically (same-origin) and the response is typed

**Given** the same manager function
**When** called in-process versus over HTTP
**Then** both produce identical results against the same seeded data

### Story 1.6: Report Groups Server Actions Become Thin Delegates

As the operator,
I want `src/app/actions/reportGroups.ts` to delegate to `reportGroupsManager`,
So that the existing form-action UX keeps working through the new layering.

Realizes FR2.

**Acceptance Criteria:**

**Given** the three report-group Server Actions
**When** refactored
**Then** each is a one-line delegate to the manager, with `redirect()`/`revalidatePath()` staying in the action

**Given** the refactor is done
**When** `npm run lint` runs
**Then** `reportGroups.ts` has zero direct Supabase imports

**And** Story 1.1's characterization tests, re-pointed at this Server Action layer, still pass unchanged

### Story 1.7: Report Groups Feature Flag and Rollback Safety

As the operator,
I want the new path to coexist behind `USE_NEW_API_REPORTGROUPS` (default off),
So that I can flip it on only once I trust it, with the old path still available as a fallback.

Realizes FR5.

**Acceptance Criteria:**

**Given** the flag is off
**When** a user acts on a report group
**Then** the old direct-Supabase path runs unchanged

**Given** the flag is on
**When** the same actions run
**Then** the new path runs instead, checked only in the thin caller — never inside the manager

**Given** the new path has run in production with the flag on
**When** one full production cycle elapses (one Ciclo 360 lifecycle or 14 calendar days, whichever is longer)
**Then** the old path becomes eligible for deletion (tracked here, executed in Epic 5)

### Story 1.8: New-Path Verification Against the Characterization Baseline

As the operator,
I want Story 1.1's characterization tests re-run against the new manager/API path, plus new auth-boundary tests,
So that I can prove old-vs-new equivalence directly from the recorded baseline, not a fresh ad hoc comparison, before flipping the flag in production.

Realizes FR6.

**Acceptance Criteria:**

**Given** Story 1.1's characterization tests
**When** pointed at the new path with the flag on, same seed
**Then** every recorded output matches the baseline exactly — group creation, accept/decline, close threshold, AI-interpretation text

**Given** the new path
**When** new auth-boundary and access-boundary tests run (not characterization — newly specified behavior from Story 1.4)
**Then** they pass as specified

**Given** both the characterization-equivalence tests and the new auth-boundary tests pass
**When** this story is complete
**Then** the flag is considered safe to flip in production — this is the gating condition for Story 1.7's rollout

## Epic 2: Brújula Segura Visual Foundation — Tokens, Components & Report Groups Redesign

Establishes the design-token system and component library from DESIGN.md, then applies it to report groups — the domain already migrated in Epic 1.

### Story 2.1: Design Token System

As the operator,
I want DESIGN.md's full color, typography, rounded, spacing, and elevation token sets implemented in the codebase,
So that every later component and screen restyle draws from one consistent, theme-aware source.

Realizes UX-DR1–4.

**Acceptance Criteria:**

**Given** DESIGN.md's frontmatter token tables
**When** implemented (Tailwind v4 `@theme` block or equivalent in `globals.css`)
**Then** every light-mode token and its `-dark` counterpart exists and resolves correctly under `prefers-color-scheme`

**Given** the existing minimal `globals.css` (only `--background`/`--foreground` today)
**When** the new tokens are added
**Then** the existing background/foreground behavior is preserved or deliberately superseded, not silently broken

### Story 2.2: Core Interactive Primitives

As a user of any Brújula screen,
I want consistent primary/secondary buttons, the reveal CTA, and a visible focus ring,
So that the most common interactive elements look and behave consistently everywhere.

Realizes UX-DR5–7, UX-DR18–19 (contrast), UX-DR21 (focus-ring is part of accessibility floor).

**Acceptance Criteria:**

**Given** `src/components/ui/`
**When** `button-primary`, `button-secondary`, and `reveal-button` are built
**Then** each matches its DESIGN.md token spec exactly, including `reveal-button`'s `coral-deep` fill (not the base `coral` tone) for AA-legible white text

**Given** any of these components receives keyboard focus
**When** rendered
**Then** `focus-ring` appears per its DESIGN.md spec (indigo on paper backgrounds, paper-deep on filled components)

### Story 2.3: Card System

As a user browsing the dashboard or a report,
I want visually distinct "moment" cards versus regular content cards versus aggregate-rollup chrome,
So that I can tell at a glance whether I'm looking at my own data, general content, or a rollup.

Realizes UX-DR8–9, UX-DR17, UX-DR35.

**Acceptance Criteria:**

**Given** `card` and `card-accent`
**When** built
**Then** `card-accent`'s indigo fill is used only in components explicitly marked for dashboard-home "moments," never for aggregate views

**Given** `aggregate-badge`
**When** built
**Then** it uses `surface-2`, deliberately outside the indigo/coral palette, per UX-DR35's aggregate-chrome distinction

### Story 2.4: Feedback and Status Components

As a user giving or reviewing feedback,
I want the anonymity badge, role badges, saboteador bars, the intensity scale, a progress bar, and the bookmark/pause chip,
So that trust signaling, competency data, and wizard progress read consistently everywhere they appear.

Realizes UX-DR10–16, UX-DR19–20.

**Acceptance Criteria:**

**Given** `anonymity-badge`
**When** built
**Then** its submit-time emphasis state pairs the color shift with the lock→checkmark icon swap (UX-DR21), never color alone

**Given** `role-badge`
**When** built for Catalizador and Coach
**Then** it renders on the `-deep` fill variants, not the base tone, per DESIGN.md's AA-contrast rule

**Given** `saboteador-bar` and `intensity-scale`
**When** built
**Then** each always renders its numeric value as printed text alongside the visual meter, never meter-only

**Given** any component with a motion effect (reveal draw-in is Epic 4/domain-specific, but the shared primitives' own micro-interactions)
**When** `prefers-reduced-motion` is set
**Then** the component's specified reduced-motion fallback applies

### Story 2.5: Scale Slider Restyle

As an evaluator answering a scale question,
I want the existing 0.5-increment slider restyled to the new token set,
So that its interaction model stays familiar while its look matches the redesign.

Realizes UX-DR16.

**Acceptance Criteria:**

**Given** the existing `ScaleSlider` component
**When** restyled
**Then** only its visual tokens change (indigo fill/thumb, `rounded.full` thumb) — its interaction model and existing value-commit behavior are unchanged

### Story 2.6: Report Groups Screens Redesign

As a user creating, responding to, or reviewing a report group,
I want the redesigned components applied to `/dashboard/groups`, `/dashboard/groups/nuevo`, and `/dashboard/groups/[id]`,
So that the first real screens reflect the new visual identity.

Realizes the report-groups portion of UX-DR22–23 (desktop-optimized, responsive), UX-DR37 (Sofía's flow touches informe-empresa later, not here — this story covers only report-groups' own screens).

**Acceptance Criteria:**

**Given** the report-groups pages
**When** restyled using Story 2.1–2.4's tokens and components
**Then** they render correctly at both desktop and mobile breakpoints, per the desktop-optimized-but-responsive rule for authenticated app surfaces

**Given** the pages are running on Epic 1's new API path (flag on) or old path (flag off)
**When** either is active
**Then** the visual redesign works identically regardless of which backend path is serving the data — this story depends only on Epic 1's flag existing, not on it being on

### Story 2.7: Invitación Accept/Decline Redesign

As Sofía or any employee invited to a report group,
I want `/invitacion/[token]` restyled with an asymmetric accept/decline treatment,
So that accepting feels like a small positive moment and declining stays plain and unremarkable.

Realizes UX-DR34.

**Acceptance Criteria:**

**Given** `/invitacion/[token]`
**When** the user accepts
**Then** a one-time checkmark-style acknowledgment appears (Officevibe-inspired, per EXPERIENCE.md's Inspiration & Anti-patterns), respecting `prefers-reduced-motion`

**Given** the same page
**When** the user declines
**Then** a plain confirmation appears with no celebration — the two outcomes are visually asymmetric by design

## Epic 3: Remaining Backend Domain Migrations

Applies Epic 1's proven pattern (characterization → scaffolding → route handler → delegate → flag → verification) to the five remaining domains, in risk-ascending order. The import-boundary rule, app-token mechanism, and fetch wrapper already exist globally from Epic 1 and are reused, not rebuilt, per domain.

### Story 3.1: Characterization Tests for Admin/Members/Auth (Current Behavior Baseline)

As the operator,
I want tests capturing the current behavior of organization creation, member invitation, department management, and login/signup, before any refactor,
So that this domain's migration is verified against a real baseline.

**Acceptance Criteria:**

**Given** the current `src/app/actions/{admin,auth,members}.ts` implementations, untouched
**When** characterization tests are written against seeded demo data
**Then** they capture: creating an organization as platform admin, inviting a member, accepting/claiming an invitation, creating a department, updating an organization name, and login/logout

**Given** these tests
**When** run against today's implementation
**Then** all pass

### Story 3.2: DB-Access and Manager Scaffolding for Admin/Members/Auth

As the operator,
I want `db/admin.ts`, `db/members.ts`, and manager files (`adminManager.ts`, `membersManager.ts`, `authManager.ts`) wrapping the existing RPCs,
So that admin, membership, and auth logic have a home outside the Server Action files.

**Acceptance Criteria:**

**Given** the existing `is_platform_admin`, `list_organizations`, `list_organization_members`, `create_organization_as_admin`, `invite_member`, `create_department`, `update_organization_name`, `accept_member_invite`, `claim_pending_email_invitations`, `get_my_pending_invitations` RPCs
**When** `db/admin.ts` and `db/members.ts` are created
**Then** each exports typed functions wrapping the relevant RPCs, no Supabase-shaped types in their signatures

**Given** `adminManager.ts`, `membersManager.ts`, and `authManager.ts`
**When** built
**Then** each calls only its corresponding `db/*` file, never `supabase` directly — `authManager` additionally owns login/logout/session glue on top of Story 1.4's shared `requireApiToken()` mechanism

**And** Story 3.1's characterization tests still pass, now run against the new manager path

### Story 3.3: Admin/Members Route Handlers and Client Fetch Integration

As a Client Component or Server Component in the admin/members surfaces,
I want to reach admin/member data through the new API or in-process manager calls,
So that this domain no longer needs direct Supabase access.

**Acceptance Criteria:**

**Given** `src/app/api/admin/companies/route.ts` and a members-equivalent route
**When** a valid app-token request calls either
**Then** it invokes the corresponding manager and returns the standard error envelope on failure

**Given** the same manager functions
**When** called in-process from Server Components versus over HTTP
**Then** both produce identical results against the same seeded data

### Story 3.4: Admin/Members Server Actions Become Thin Delegates

As the operator,
I want `src/app/actions/{admin,auth,members}.ts` to delegate to their managers,
So that existing form-action UX keeps working through the new layering.

**Acceptance Criteria:**

**Given** the admin/auth/members Server Actions
**When** refactored
**Then** each is a one-line delegate to its manager, with `redirect()`/`revalidatePath()` staying in the action

**Given** the refactor is done
**When** `npm run lint` runs
**Then** these three files have zero direct Supabase imports

**And** Story 3.1's characterization tests, re-pointed at this Server Action layer, still pass unchanged

### Story 3.5: Admin/Members Feature Flag and Rollback Safety

As the operator,
I want the new admin/members path behind `USE_NEW_API_ADMINMEMBERS` (default off),
So that I can validate it with real admin usage before committing.

**Acceptance Criteria:**

**Given** the flag is off
**When** an admin manages organizations, members, or departments
**Then** the old direct-Supabase path runs unchanged

**Given** the flag is on
**When** the same actions run
**Then** the new path runs instead, checked only in the thin caller

**Given** the new path has run one full production cycle with the flag on
**When** that elapses
**Then** the old path becomes eligible for deletion (executed in Epic 5)

### Story 3.6: Admin/Members New-Path Verification Against the Characterization Baseline

As the operator,
I want Story 3.1's characterization tests re-run against the new path, plus new auth-boundary tests specific to platform-admin and Supervisor permission checks,
So that I can prove equivalence before flipping the flag — this domain also proves the token/permission pattern on a second, distinct role structure (platform admin vs. Supervisor vs. member).

**Acceptance Criteria:**

**Given** Story 3.1's characterization tests
**When** pointed at the new path with the flag on, same seed
**Then** every recorded output matches the baseline exactly

**Given** the new path
**When** a non-admin attempts a platform-admin-only action, or a non-Supervisor attempts an organization-management action
**Then** both are correctly rejected, matching today's RLS-backed behavior exactly

**Given** both test sets pass
**When** complete
**Then** the flag is considered safe to flip — gating condition for Story 3.5's rollout

### Story 3.7: Characterization Tests for Cycles (Current Behavior Baseline)

As the operator,
I want tests capturing the current behavior of creating, organizing, and closing a 360 cycle, before any refactor,
So that this domain's migration is verified against a real baseline.

**Acceptance Criteria:**

**Given** the current `src/app/actions/cycles.ts` implementation, untouched
**When** characterization tests are written against seeded demo data
**Then** they capture: creating a feedback cycle, organizing evaluators, an individual cycle request, updating evaluators, closing a cycle request, and the resulting competency-comparison report output

**Given** these tests
**When** run against today's implementation
**Then** all pass

### Story 3.8: DB-Access and Manager Scaffolding for Cycles

As the operator,
I want `db/cycles.ts` and `cyclesManager.ts` wrapping the existing cycle RPCs,
So that cycle-lifecycle logic has a home outside the Server Action file.

**Acceptance Criteria:**

**Given** the existing `create_feedback_cycle`, `close_cycle_request`, `organize_cycle_evaluators`, `create_individual_cycle_request`, `update_cycle_request_evaluators`, `get_cycle_status`, `get_colleagues_with_closed_cycle` RPCs
**When** `db/cycles.ts` is created
**Then** it exports typed functions wrapping each, no Supabase-shaped types in signatures

**Given** `cyclesManager.ts`
**When** built
**Then** it calls only `db/cycles.ts`, and calls only cycle-specific lifecycle RPCs — never the ad-hoc-specific RPCs `feedbackManager` owns, per the architecture spine's `feedback_requests` shared-table ownership split (AD-3)

**And** Story 3.7's characterization tests still pass, now run against the new manager path

### Story 3.9: Cycles Route Handlers and Client Fetch Integration

As a Client Component or Server Component in the cycles surfaces,
I want to reach cycle data through the new API or in-process manager calls,
So that this domain no longer needs direct Supabase access.

**Acceptance Criteria:**

**Given** `src/app/api/cycles/route.ts`, `cycles/[id]/route.ts`, and `cycles/[id]/close/route.ts`
**When** a valid app-token request calls any of them
**Then** it invokes `cyclesManager` and returns the standard error envelope on failure

**Given** the same manager functions
**When** called in-process versus over HTTP
**Then** both produce identical results against the same seeded data

### Story 3.10: Cycles Server Actions Become Thin Delegates

As the operator,
I want `src/app/actions/cycles.ts` to delegate to `cyclesManager`,
So that existing form-action UX keeps working through the new layering.

**Acceptance Criteria:**

**Given** the cycles Server Actions
**When** refactored
**Then** each is a one-line delegate to `cyclesManager`, with `redirect()`/`revalidatePath()` staying in the action

**Given** the refactor is done
**When** `npm run lint` runs
**Then** `cycles.ts` has zero direct Supabase imports

**And** Story 3.7's characterization tests, re-pointed at this Server Action layer, still pass unchanged

### Story 3.11: Cycles Feature Flag and Rollback Safety

As the operator,
I want the new cycles path behind `USE_NEW_API_CYCLES` (default off),
So that I can validate cycle lifecycle behavior before committing, given cycles are higher-stakes than report groups or admin.

**Acceptance Criteria:**

**Given** the flag is off
**When** a Supervisor creates, organizes, or closes a cycle
**Then** the old direct-Supabase path runs unchanged

**Given** the flag is on
**When** the same actions run
**Then** the new path runs instead, checked only in the thin caller

**Given** the new path has run one full production cycle with the flag on
**When** that elapses
**Then** the old path becomes eligible for deletion (executed in Epic 5)

### Story 3.12: Cycles New-Path Verification Against the Characterization Baseline

As the operator,
I want Story 3.7's characterization tests re-run against the new path, plus a check that `cyclesManager` only calls the cycle-specific lifecycle RPCs named in the architecture spine's ownership split (AD-3),
So that I can prove equivalence and architectural correctness before flipping the flag.

**Acceptance Criteria:**

**Given** Story 3.7's characterization tests
**When** pointed at the new path with the flag on, same seed
**Then** every recorded output matches the baseline exactly, including the competency-comparison report

**Given** `cyclesManager`'s RPC call set
**When** compared against AD-3's documented cycle-specific list (`create_feedback_cycle`, `close_cycle_request`, `organize_cycle_evaluators`)
**Then** it calls only those, never any ad-hoc-specific RPC — checkable now from the architecture spine alone, without depending on `feedbackManager` existing yet (Story 3.18 performs the reverse, symmetric check once `feedbackManager` exists)

**Given** both checks pass
**When** complete
**Then** the flag is considered safe to flip — gating condition for Story 3.11's rollout

### Story 3.13: Characterization Tests for Feedback (Current Behavior Baseline)

As the operator,
I want tests capturing the current behavior of ad-hoc feedback requests — creation, evaluator management, closing, and the narrative report — before any refactor,
So that this anonymity-critical domain's migration is verified against a real baseline.

**Acceptance Criteria:**

**Given** the current `src/app/actions/feedback.ts` implementation, untouched
**When** characterization tests are written against seeded demo data
**Then** they capture: creating an ad-hoc request (both for a teammate and for oneself as an individual account), updating evaluators, canceling a request, closing a request, and the resulting narrative report output — including behavior at and below the anonymity threshold (spec.md §6: minimum 5 invitees, minimum 3 responses)

**Given** these tests
**When** run against today's implementation
**Then** all pass, and the below-threshold case correctly shows the "esperando más respuestas" state rather than any content

### Story 3.14: DB-Access and Manager Scaffolding for Feedback

As the operator,
I want `db/feedback.ts` and `feedbackManager.ts` wrapping the existing ad-hoc feedback RPCs,
So that feedback-request logic has a home outside the Server Action file — with the anonymity-threshold logic preserved exactly.

**Acceptance Criteria:**

**Given** the existing `create_ad_hoc_feedback_request*`, `close_ad_hoc_feedback_request` RPCs (and any threshold-checking RPCs they call)
**When** `db/feedback.ts` is created
**Then** it exports typed functions wrapping each, no Supabase-shaped types in signatures, with no reimplementation of threshold logic — it stays in the RPCs

**Given** `feedbackManager.ts`
**When** built
**Then** it calls only `db/feedback.ts`, and calls only ad-hoc-specific lifecycle RPCs — never `cyclesManager`'s cycle-specific RPCs, mirroring Story 3.8's ownership split from the other side

**And** Story 3.13's characterization tests still pass, including the below-threshold case, now run against the new manager path

### Story 3.15: Feedback Route Handlers and Client Fetch Integration

As a Client Component or Server Component in the feedback surfaces,
I want to reach ad-hoc feedback data through the new API or in-process manager calls,
So that this domain no longer needs direct Supabase access.

**Acceptance Criteria:**

**Given** `src/app/api/feedback-requests/route.ts` and `feedback-requests/[id]/route.ts`
**When** a valid app-token request calls either
**Then** it invokes `feedbackManager` and returns the standard error envelope on failure

**Given** the same manager functions
**When** called in-process versus over HTTP
**Then** both produce identical results against the same seeded data, including the below-threshold state

### Story 3.16: Feedback Server Actions Become Thin Delegates

As the operator,
I want `src/app/actions/feedback.ts` to delegate to `feedbackManager`,
So that existing form-action UX keeps working through the new layering.

**Acceptance Criteria:**

**Given** the feedback Server Actions
**When** refactored
**Then** each is a one-line delegate to `feedbackManager`, with `redirect()`/`revalidatePath()` staying in the action

**Given** the refactor is done
**When** `npm run lint` runs
**Then** `feedback.ts` has zero direct Supabase imports

**And** Story 3.13's characterization tests, re-pointed at this Server Action layer, still pass unchanged — including the threshold-boundary case

### Story 3.17: Feedback Feature Flag and Rollback Safety

As the operator,
I want the new feedback path behind `USE_NEW_API_FEEDBACK` (default off),
So that I can validate this anonymity-critical domain especially carefully before committing.

**Acceptance Criteria:**

**Given** the flag is off
**When** a user creates, manages, or closes an ad-hoc feedback request
**Then** the old direct-Supabase path runs unchanged

**Given** the flag is on
**When** the same actions run
**Then** the new path runs instead, checked only in the thin caller

**Given** the new path has run one full production cycle with the flag on
**When** that elapses
**Then** the old path becomes eligible for deletion (executed in Epic 5)

### Story 3.18: Feedback New-Path Verification Against the Characterization Baseline

As the operator,
I want Story 3.13's characterization tests re-run against the new path, with explicit extra scrutiny on the anonymity-threshold behavior,
So that the product's core trust guarantee is provably unchanged before flipping this flag — this is the highest-stakes verification in the whole migration.

**Acceptance Criteria:**

**Given** Story 3.13's characterization tests
**When** pointed at the new path with the flag on, same seed
**Then** every recorded output matches the baseline exactly, including the below-threshold "esperando más respuestas" state and the exact reveal conditions

**Given** a request at exactly 2 responses (below the minimum-3 floor) and at exactly 3 (at the floor)
**When** each is checked against the new path
**Then** the 2-response case shows no content and the 3-response case reveals correctly, matching today's behavior exactly

**Given** `feedbackManager`'s RPC call set (now built) and `cyclesManager`'s (already built in Story 3.8)
**When** compared against each other and against AD-3's documented split
**Then** `feedbackManager` calls only the ad-hoc-specific RPCs (`create_ad_hoc_feedback_request*`, `close_ad_hoc_feedback_request`), with zero overlap against `cyclesManager`'s cycle-specific set — completing the symmetric check Story 3.12 could only do one-sided

**Given** all checks pass
**When** complete
**Then** the flag is considered safe to flip — gating condition for Story 3.17's rollout

### Story 3.19: Characterization Tests for Responder/Invitation (Current Behavior Baseline)

As the operator,
I want tests capturing the current anonymous-response behavior — viewing a wizard, submitting, and accepting/declining an invitation — before any refactor,
So that this external, unauthenticated, highest-stakes-to-break domain is verified against a real baseline before it moves last.

**Acceptance Criteria:**

**Given** the current `/responder/[token]` and `/invitacion/[token]` page implementations, untouched
**When** characterization tests are written against seeded demo data (valid token, expired/invalid token, already-used token)
**Then** they capture: viewing the wizard context, submitting a full response, and accepting/declining a group invitation — all without any login

**Given** these tests
**When** run against today's implementation
**Then** all pass, including the invalid/expired/already-used token rejection cases

### Story 3.20: DB-Access and Manager Scaffolding for Responder/Invitation

As the operator,
I want `db/responder.ts` and `responderManager.ts` wrapping the existing invitee-facing RPCs,
So that the anonymous response flow has a home outside the page components — with its distinct, token-only auth model preserved exactly.

**Acceptance Criteria:**

**Given** the existing `get_responder_context`, `get_invite_details`, `submit_feedback_response` (invitee side), `accept_member_invite`, `claim_pending_email_invitations` RPCs
**When** `db/responder.ts` is created
**Then** it exports typed functions wrapping each, no Supabase-shaped types in signatures

**Given** `responderManager.ts`
**When** built
**Then** it calls only `db/responder.ts`, and validates the single-use invitation token itself — it never calls `requireApiToken()`, per AD-7/FR4

**And** Story 3.19's characterization tests still pass, now run against the new manager path

### Story 3.21: Responder/Invitation Route Handlers and Client Fetch Integration

As an anonymous evaluator's browser session,
I want to reach the wizard/invitation data through the new API,
So that this domain no longer needs direct Supabase access — while remaining fully reachable without any login.

Realizes FR4.

**Acceptance Criteria:**

**Given** a responder-facing route (e.g. `feedback-requests/[id]/submit/route.ts`)
**When** a request carries a valid single-use invitation token but no app token
**Then** it is accepted — `requireApiToken()` is never invoked on this route

**Given** the same route
**When** a request carries a valid app token but an invalid/missing invitation token
**Then** it is rejected — the two credential types are not interchangeable

### Story 3.22: Responder/Invitation Pages Become Thin Delegates

As the operator,
I want `/responder/[token]` and `/invitacion/[token]` to call `responderManager` (in-process, as Server Components) instead of Supabase directly,
So that this domain moves onto the new layering without touching its unauthenticated UX.

**Acceptance Criteria:**

**Given** both page components
**When** refactored
**Then** each calls only `responderManager`, with zero direct Supabase imports remaining

**And** Story 3.19's characterization tests, re-pointed at this page layer, still pass unchanged — including token-validity edge cases

### Story 3.23: Responder/Invitation Feature Flag and Rollback Safety

As the operator,
I want the new responder/invitation path behind `USE_NEW_API_RESPONDER` (default off),
So that this external, anonymous, customer-facing critical path gets the most cautious rollout of any domain — migrated last, on purpose.

**Acceptance Criteria:**

**Given** the flag is off
**When** an anonymous evaluator uses either page
**Then** the old direct-Supabase path runs unchanged

**Given** the flag is on
**When** the same flows run
**Then** the new path runs instead, checked only in the thin caller

**Given** the new path has run one full production cycle with the flag on
**When** that elapses
**Then** the old path becomes eligible for deletion (executed in Epic 5)

### Story 3.24: Responder/Invitation New-Path Verification Against the Characterization Baseline

As the operator,
I want Story 3.19's characterization tests re-run against the new path, with explicit extra scrutiny on token-validity edge cases,
So that a bug here — the worst possible outcome in this whole migration — is caught before real anonymous users ever see the new path.

**Acceptance Criteria:**

**Given** Story 3.19's characterization tests
**When** pointed at the new path with the flag on, same seed
**Then** every recorded output matches the baseline exactly, for valid, expired, invalid, and already-used tokens alike

**Given** the pattern has already been proven on four prior domains (report groups, admin/members, cycles, feedback)
**When** this domain's flag is considered
**Then** it is flipped only after all four have each survived their own full production cycle — this domain does not go first under any circumstance

**Given** both checks pass
**When** complete
**Then** the flag is considered safe to flip — gating condition for Story 3.23's rollout

### Story 3.25: Characterization Tests for Read-Only Reports (Current Behavior Baseline)

As the operator,
I want tests capturing the current output of the dashboard home, Mi mapa, and Informe empresa pages, before any refactor,
So that this lowest-risk, purely-read domain is still verified against a real baseline.

**Acceptance Criteria:**

**Given** the current `src/app/dashboard/page.tsx`, `mi-mapa/page.tsx`, and `informe-empresa/page.tsx` implementations, untouched
**When** characterization tests are written against seeded demo data
**Then** they capture: the dashboard's open-cycles/pending-actions summary, an employee's competency map (with and without a closed 360), and the Supervisor's company-wide aggregate view

**Given** these tests
**When** run against today's implementation
**Then** all pass

### Story 3.26: Read-Model Composition for Read-Only Reports

As the operator,
I want these three read-only pages to compose the existing `cyclesManager`, `feedbackManager`, `membersManager`, and `adminManager` functions rather than requiring a new dedicated manager,
So that read-aggregation logic doesn't duplicate what each domain's own manager already owns.

**Acceptance Criteria:**

**Given** no dedicated "reportsManager" exists in the architecture spine's structural seed
**When** these pages are migrated
**Then** each composes calls to the already-existing per-domain managers rather than introducing a new manager or new `db/*` file

**And** Story 3.25's characterization tests still pass, now run against this composed read path

### Story 3.27: Read-Only Reports Route Handlers and Client Fetch Integration

As a Client Component on the dashboard or Mi mapa,
I want to reach this composed read data through the new API where a Client Component needs it,
So that any interactive element on these pages no longer needs direct Supabase access.

**Acceptance Criteria:**

**Given** any Client Component on these three pages that fetches data client-side (if any — most content here is expected to be Server Component-rendered)
**When** identified
**Then** it calls the new API via `apiFetch`, never Supabase directly

**Given** the composed read path
**When** called in-process from these Server Components
**Then** results are identical to what the equivalent HTTP path would return

### Story 3.28: Read-Only Reports Pages Become Thin Delegates

As the operator,
I want the three read-only pages to call the composed manager functions instead of Supabase directly,
So that this domain completes the migration alongside the other five.

**Acceptance Criteria:**

**Given** the three page components
**When** refactored
**Then** each has zero direct Supabase imports remaining

**And** Story 3.25's characterization tests, re-pointed at this page layer, still pass unchanged

### Story 3.29: Read-Only Reports Feature Flag and Rollback Safety

As the operator,
I want the new read-only-reports path behind `USE_NEW_API_REPORTS` (default off),
So that this low-risk domain still gets the same rollback safety as every other domain, for consistency.

**Acceptance Criteria:**

**Given** the flag is off
**When** any user views these pages
**Then** the old direct-Supabase path runs unchanged

**Given** the flag is on
**When** the same pages render
**Then** the new composed path runs instead, checked only in the thin caller

**Given** the new path has run one full production cycle with the flag on
**When** that elapses
**Then** the old path becomes eligible for deletion (executed in Epic 5)

### Story 3.30: Read-Only Reports New-Path Verification Against the Characterization Baseline

As the operator,
I want Story 3.25's characterization tests re-run against the new composed path,
So that all six domains are proven equivalent before Epic 5's cleanup begins.

**Acceptance Criteria:**

**Given** Story 3.25's characterization tests
**When** pointed at the new path with the flag on, same seed
**Then** every recorded output matches the baseline exactly across all three pages

**Given** this is the sixth and final domain
**When** its verification passes
**Then** all six domains have independently proven old-vs-new equivalence, and Epic 5 (legacy retirement) can begin

## Epic 4: Remaining Domain UI Redesigns

Applies Epic 2's design system to the five remaining domains' screens, mirroring Epic 3's order; each story is gated on its corresponding Epic 3 domain having landed first.

### Story 4.1: Admin/Members Screens Redesign

As a platform admin or Supervisor,
I want `/admin`, `/admin/empresas/[id]`, and `/dashboard/members` restyled with the new design system,
So that these dense, frequently-used screens get the Leapsome-style scan density and clear aggregate/individual distinction the redesign calls for.

Realizes UX-DR23, UX-DR28, UX-DR31, UX-DR35.

**Acceptance Criteria:**

**Given** Story 3.6 (admin/members backend migration) has landed
**When** these screens are restyled
**Then** they use the denser grid (smaller gaps, more cards per row) per DESIGN.md's Layout & Spacing, distinct from the more spacious individual-report layout

**Given** an org-wide or aggregate view on these screens
**When** rendered
**Then** it uses `aggregate-badge`, never `card-accent`

**Given** a non-admin or non-Supervisor reaches one of these routes directly
**When** the page renders
**Then** the permission-denied state appears (plain-language, no red, `button-secondary` back to dashboard) — this establishes the reusable pattern for the other domains' permission-gated views

**Given** any action on these screens fails
**When** an error occurs
**Then** the generic error state appears (plain-language + retry, never coral/red) — this establishes the reusable pattern for error handling across all domains

### Story 4.2: Cycles Screens Redesign

As a Supervisor or employee viewing a 360 cycle,
I want `/dashboard/cycles/**` restyled with the new design system, including the comparison chart and report reveal,
So that Marta's report-reveal experience (the product's most emotionally loaded moment) gets the deliberate, non-auto-playing treatment the redesign specifies.

Realizes UX-DR24, UX-DR26, UX-DR27, UX-DR30, UX-DR36, UX-DR37 (Marta's flow, cycles portion).

**Acceptance Criteria:**

**Given** Story 3.12 (cycles backend migration) has landed
**When** these screens are restyled
**Then** the evaluator-category toggle chips use the `role-badge` shape without changing the existing single-hue violet-family color decision

**Given** a cycle report hasn't crossed its response/self-evaluation threshold
**When** viewed
**Then** the threshold-not-met state appears (reassuring progress copy, never error-styled)

**Given** a cycle report has crossed its threshold
**When** first opened
**Then** it shows the collapsed summary (headline strength + one growth area) — the radar and exact-values table render only after the user taps `reveal-button`, never on page load

**Given** the user taps reveal
**When** the radar renders
**Then** its five sectors draw in sequentially (~60ms stagger), respecting `prefers-reduced-motion` with an instant full-opacity fallback

### Story 4.3: Feedback Screens Redesign

As a user reviewing an ad-hoc feedback request,
I want `/dashboard/feedback/**` restyled with the same reveal-gate and threshold treatment as cycles,
So that Marta's flow is realized consistently whether her report came from a 360 cycle or an ad-hoc request.

Realizes UX-DR24, UX-DR27, UX-DR30, UX-DR37 (Marta's flow, feedback portion).

**Acceptance Criteria:**

**Given** Story 3.18 (feedback backend migration) has landed
**When** these screens are restyled
**Then** they reuse the same reveal-gate, threshold-not-met, and axis-draw-in patterns established in Story 4.2 — not a divergent reimplementation

**Given** the saboteadores block on a self-evaluation report
**When** rendered
**Then** it uses `saboteador-bar` at its deliberately softer, lower-contrast treatment relative to the competency radar on the same page

### Story 4.4: Responder/Invitation Screens Redesign

As Diego, an anonymous evaluator on his phone,
I want `/responder/[token]` restyled mobile-first with the wizard's progress bar, anonymity badge, and pause/resume affordance,
So that his flow — the product's highest-stakes-to-break, most trust-sensitive surface — gets exactly the treatment EXPERIENCE.md specifies.

Realizes UX-DR22, UX-DR25, UX-DR29, UX-DR37 (Diego's flow, complete).

**Acceptance Criteria:**

**Given** Story 3.24 (responder/invitation backend migration) has landed
**When** `/responder/[token]` is restyled
**Then** it renders single-column with large touch targets and no hover-dependent interaction, at the mobile breakpoint as the primary target

**Given** a question transition
**When** the user answers and moves to the next question
**Then** a ~200ms slide/fade plays, with a checkmark micro-celebration confined to this context only — respecting `prefers-reduced-motion` with an instant-swap fallback and the celebration removed, not replayed

**Given** the user submits the most sensitive free-text answer
**When** they tap submit
**Then** the anonymity badge briefly emphasizes with both its color shift and the lock→checkmark icon swap

**Given** the user closes the tab mid-wizard and returns later
**When** they reopen the link
**Then** `bookmark-chip` greets them ("Guardado — continúa cuando quieras"), answers intact

### Story 4.5: Read-Only Reports Screens Redesign

As Sofía, a Supervisor reviewing company-wide patterns,
I want the dashboard home, Mi mapa, and Informe empresa restyled,
So that her flow — distinguishing a personal "moment" from an aggregate rollup at a glance — is fully realized, completing the redesign across all six domains.

Realizes UX-DR23, UX-DR31, UX-DR32, UX-DR33, UX-DR35, UX-DR37 (Sofía's flow, complete).

**Acceptance Criteria:**

**Given** Story 3.30 (read-only reports backend migration) has landed
**When** the dashboard home is restyled
**Then** open cycles and pending actions render as `card-accent` "moment" cards, and a brand-new/quiet dashboard shows the dashboard-empty state instead of an empty grid

**Given** Mi mapa
**When** an employee has zero closed 360s
**Then** the mi-mapa-first-time state appears instead of an empty radar

**Given** Informe empresa
**When** rendered
**Then** it uses the denser aggregate grid with `aggregate-badge`, never `card-accent` — and a non-Supervisor reaching it directly sees the permission-denied state from Story 4.1's pattern

**Given** all five stories in this epic are complete
**When** verified together
**Then** every domain now runs on both the new backend layering (Epic 1/3) and the new visual identity (Epic 2/4)

## Epic 5: Legacy Retirement & Supabase-Removal Readiness Review

Once all six domains are stable on the new path, retires old code and evaluates the deferred work.

### Story 5.1: Delete Old Direct-Supabase Paths, Per Domain

As the operator,
I want each domain's old direct-Supabase code path deleted once its new path has survived one full production cycle,
So that the codebase converges on a single implementation per domain instead of carrying dead code indefinitely.

**Acceptance Criteria:**

**Given** a domain whose feature flag has been on for one full production cycle (per its own Epic 1/3 story)
**When** this story processes that domain
**Then** the old code path is deleted, the feature flag is removed, and the corresponding characterization tests are retired or converted into permanent regression tests

**Given** all six domains
**When** each is processed in turn
**Then** the repo ends with zero feature flags and zero direct-Supabase imports remaining under `src/app/**`/`src/components/**` — matching the PRD's SM-1 north-star signal

### Story 5.2: Confirm the Import Boundary Holds at Zero Violations Repo-Wide

As the operator,
I want the ESLint boundary rule verified clean across the entire codebase after all six domains are migrated and legacy paths are removed,
So that the initiative's actual success signal (SM-1) is confirmed, not assumed.

**Acceptance Criteria:**

**Given** Story 5.1 is complete
**When** `npm run lint` runs
**Then** it reports 0 violations of the `no-restricted-imports` rule anywhere in the repo

**Status: satisfied, via Epic 6 Stories 6.3/6.4, not directly.** Investigating this story's own AC revealed it couldn't just be confirmed as-is: Story 5.1 only ever had an old-vs-new path to collapse for the 5 flagged domains, but cycles/feedback/report-groups/members-self/reports/auth-signup pages carried ~35 direct-Supabase reads that had *no* manager path built at all (never flag-gated, so outside 5.1's own scope). Confirming this AC required building that missing manager layer first — see Stories 6.3/6.4 below, which did that work and left `npm run lint` reporting 0 `no-restricted-imports` violations except the two deliberately-deferred platform-admin pages (Story 6.2). This AC is satisfied by that work's own final state, not by a standalone verification pass.

### Story 5.3: Supabase-Removal and RLS-Rewrite Readiness Review

As the operator,
I want a documented assessment of what would be involved in the deferred RLS-to-application-code rewrite and the Supabase-to-direct-Postgres swap,
So that these explicitly non-goal items from this initiative become a scoped, evaluable future initiative rather than a vague someday.

**Acceptance Criteria:**

**Given** all six `db/*` files are now the sole Supabase import surface (per AD-2's seam)
**When** this review is conducted
**Then** it documents, for each `db/*` file, what a direct-Postgres-client swap would require, and separately documents what re-implementing each RLS policy's logic in the managers layer would require

**Given** this review
**When** complete
**Then** it is handed off as input to a future, separate initiative — this story does not implement either swap, per the PRD's Non-Goals

## Epic 6: Operational Hardening

Fixes and hardens gaps discovered through real usage of the already-completed product (Epics 1-4) that were never captured by the original PRD/epics — starting with unbounded list rendering. Each story here is independent and self-contained; there is no fixed sequencing between them, unlike Epics 1-5. Originated via a `bmad-correct-course` sprint change proposal (`sprint-change-proposal-2026-09-16.md`), not the original planning pass.

### Story 6.1: Paginate the Admin Organizations List

As a platform admin,
I want the "Empresas" list on /admin to load in pages instead of rendering every organization at once,
So that the screen stays fast and usable as the platform's real organization count grows, instead of degrading unboundedly like it does today.

**Acceptance Criteria:**

**Given** the `list_organizations` RPC is extended with `p_limit`/`p_offset` parameters (both optional, defaulting to today's unbounded behavior)
**When** `/admin` is requested with no `?page=` param
**Then** it shows the first 24 organizations, ordered by `created_at desc, id desc`, with a "Vista agregada — N empresas" badge showing the true total count (not the current page's size)

**Given** more than 24 organizations exist
**When** the admin uses the Prev/Next controls
**Then** the page navigates via `?page=N` (Server Component, no client state), each page shows a disjoint, correctly-ordered slice, and Prev/Next disable correctly at the first/last page

**Given** `?page=` is set to a value beyond the last valid page
**When** the page renders
**Then** it clamps to the last valid page rather than 500ing or silently rendering an empty grid

**Given** zero organizations exist, or a non-admin reaches the route
**When** the page renders
**Then** the existing empty/permission-denied states are unchanged, and the new `Pagination` component renders nothing rather than "Página 1 de 0"

**Given** `admin/empresas/[id]/page.tsx` and `db/admin.ts`'s `listOrganizations()` still call the RPC with zero arguments (out of scope for this story)
**When** this story ships
**Then** both continue returning the complete, unpaginated set exactly as before — verified by an explicit regression test, since they share the same RPC being modified

### Story 6.3: Shared Session-Resolution Helpers

As the operator,
I want one `authManager.getCurrentUser()`/`membersManager.getCurrentMember()` pair that every page can call for "who is logged in" and "what's their own member row",
So that the ~15 pages independently reimplementing this same inline `supabase.auth.getUser()` + `.from("members")...` lookup have one correct, tested source of truth instead of N slightly-different copies.

Originated from the user's own question, asked mid-Story-5.2-investigation: "se supone que hemos metido todas las lecturas de negocio en los managers, por qué el getUser es distinto?" — surfacing that the `db -> managers -> pages` layering (AD-1/AD-2) is a mandatory principle for this codebase, not a per-story migration target, and that "who is logged in" is exactly the kind of cross-cutting read that principle requires.

**Acceptance Criteria:**

**Given** any authenticated request
**When** a page/Server Action needs the current user or the current user's own `members` row
**Then** it calls `authManager.getCurrentUser()` / `membersManager.getCurrentMember()` — both return `null` for "not logged in", never throw for that case, and are the only place either lookup's query is written

### Story 6.4: Complete `db -> managers -> pages` Layering for Cycles, Feedback, Report-Groups, and Members/Self/Reports/Auth-Signup

As the operator,
I want every remaining direct-Supabase read/write across these domains' pages moved into `db/*`+`managers/*`, and every page-level computation that is actually a business rule (not presentation) moved there too,
So that the mandatory MVC layering principle (AD-1/AD-2) genuinely holds repo-wide, not just where a feature-flagged migration happened to already cover it.

Built directly on Story 6.3. Confirmed via investigation that the true gap was much larger than Story 5.2's own AC assumed (~35 direct-Supabase reads with no manager path ever built, across 10+ pages, spanning 4 domains) — the user confirmed proceeding with this full scope ("Hacerlo igual, es una iniciativa nueva grande") rather than a narrower fix.

**Acceptance Criteria:**

**Given** any page under `src/app/dashboard/cycles/**`, `feedback/**`, `groups/**`, `members/page.tsx`, `mi-mapa/page.tsx`, `informe-empresa/page.tsx`, `page.tsx` (dashboard root), or `src/app/actions/{cycles,feedback,auth}.ts`
**When** it reads or writes data
**Then** it does so only via a `@/server/managers/*` call — zero direct `@/lib/supabase/*`/`@supabase/supabase-js`/`@/server/db/*` imports, enforced by `eslint.config.mjs`'s `no-restricted-imports` rule with no per-file exemption remaining for any of these files

**Given** the user's own explicit closing instruction — "revisa con 3 expertos que toda la funcionalidad de negocio está en managers y la diferentes páginas sólo hacen uso de los managers para todo"
**When** 3 independent expert reviews audit the repo (import-boundary compliance; business logic leaked into pages; manager/db-layer internal integrity)
**Then** every CONFIRMED finding from that review is fixed before this story is considered done, not just logged

**Status: done.** All 4 domains migrated (new `getCurrentUser`/`getCurrentMember`-based session resolution; ~35 new `db/*`+`managers/*` read functions across `cycles.ts`, `feedback.ts`, `members.ts`, `reportGroups.ts`; all 10+ consuming pages rewired). The mandated 3-expert review found the import boundary and manager/db-layer integrity compliant (two minor cleanup items, fixed: a latent ESLint exemption gap, two dead-code files) but found real business-logic leakage in 5 pages (status/eligibility derivation duplicated across pages, an analytics/ranking computation, a cross-referenced "what needs my action" list, and a request-list merge/sort) — all fixed in a second remediation pass, independently re-verified. Two small, disclosed trade-offs and one pre-existing latent inconsistency (report-groups' close-threshold display vs. its real per-org RPC enforcement) logged in `deferred-work.md` rather than fixed here (see that file for why). Final state: `npx tsc --noEmit` clean, `npm run lint` clean except the 2 deliberately-deferred admin pages (Story 6.2), 512/512 tests passing.

## Epic 7: Port Upstream Product Features onto the Layered Architecture

Ports real functionality built in parallel, directly against `dabarcao/brujula` (the pre-refactor original repo `brujula-core` was bootstrapped from, at commit `93b0e69`), into `brujula-core`'s now-complete `db -> managers -> API/pages` layering (Epics 1-6). Originated via `bmad-correct-course` (`sprint-change-proposal-2026-09-16-upstream-port.md`) after `git fetch` against `dabarcao/brujula.git`'s `origin/main` revealed 8 unpulled commits (`93b0e69..755c2e9`) with real product work, co-authored with Claude Sonnet 5, built while this session did the architecture refactor. Every story in this epic follows the `mvc-layering` skill (`.claude/skills/mvc-layering/SKILL.md`) and closes with that skill's proportional 3-expert compliance audit (import-boundary / business-logic-leakage / manager-db-integrity, scoped to that story's own touched files) as part of its own Definition of Done.

### Story 7.1: Schema Foundation — Port 28 Upstream Migrations

As the operator,
I want the 28 SQL migrations upstream added since `brujula-core`'s snapshot point applied here, renumbered to avoid colliding with `brujula-core`'s own `0067_list_organizations_pagination.sql`,
So that every later story in this epic has the schema it needs, landed once, atomically, instead of piecemeal per feature.

**Acceptance Criteria:**

**Given** upstream migrations `0067_plenitud_description.sql` through `0094_signup_success_texts.sql` (28 files)
**When** they are ported into `brujula-core/supabase/migrations/`
**Then** each is renumbered `0068` through `0095` (straight +1 shift, internal order preserved exactly), applies cleanly against `brujula-core`'s current schema, and no existing manager/db wrapper's characterization tests regress (every new/changed RPC signature verified upstream to keep backward-compatible defaults)

**Given** migration `0072_competency_model_v2.sql` (renumbered) requires all existing feedback data to be wiped first
**When** this story executes that step
**Then** the wipe runs only against `brujula-core`'s local dev/test data (no production data exists here) and only after the user gives an explicit, in-the-moment go-ahead — not a standing pre-approval, regardless of any other autonomy granted this session

**Given** `brujula-core/scripts/*.mjs` (6 seed scripts) assume the pre-v2, 15-competency symmetric model
**When** this story completes
**Then** every seed script that seeds competency/feedback data is updated for the 16-competency asymmetric v2 model, so the AD-9 characterization-testing safety net does not silently break

**Status: done.** All 28 upstream migrations renumbered `0068`-`0095` (verified no filename cross-references, safe renumber) and applied via `npx supabase db reset` (the only local-apply mechanism, which also served as the required data wipe — local dev/test data only). Seed scripts needed **no changes**: all 6 already read question shape dynamically from the DB rather than hardcoding the old model (verified by running `seed-demo-company.mjs` end to end against the new schema). Fixed 3 pre-existing test fixtures whose assumptions broke against a genuine upstream bugfix (the "one open cycle at a time" guard now checks request status, not calendar-date overlap) and `db/responder.ts`'s handling of `submit_feedback_response`'s changed return shape. **Found and fixed a real regression during porting**: `update_ad_hoc_feedback_request_evaluators` had silently lost its Supervisor-exclusion guard across upstream's rewrites (its 360-cycle sibling function kept it) — restored via a new, brujula-core-owned migration `0096` layered on top, so the 28 renumbered files stay byte-identical to what upstream shipped. 512/512 tests passing, `tsc`/lint clean, live-verified. Commit `8332e43`.

### Story 7.2: Dashboard — En-Curso/Cerrado Split + Report-Group Task Link

As a user,
I want my dashboard to separate feedback still in progress from feedback already closed (with its real close date), and a pending report-group invitation to link to the group page instead of accept/reject blind,
So that I can see who else is accepting before deciding, and don't lose track of what's actually still open.

Depends on Story 7.1. Ports commit `1aa41c8` plus the 2 orphaned `create_feedback_cycle` RPC bugfixes bundled in commit `859f7fa` (the fixes land automatically once Story 7.1's schema is in — `cyclesManager.createCycle`/`db/cycles.ts` already wrap the RPC by name with no param-shape change).

**Acceptance Criteria:**

**Given** a user with both open and closed feedback requests
**When** their dashboard renders
**Then** "Mis feedbacks en curso" and "Mis feedbacks cerrados" render as two separate sections, the closed section showing each request's real close date

**Given** the en-curso/cerrado split and close-date derivation
**When** implemented
**Then** the business rule lives inside `feedbackManager` (e.g. extending `getMyPendingRequestsSummary()` or a sibling function), never recomputed in `dashboard/page.tsx` itself — the exact class of leak Story 6.4 already fixed once in this file

**Given** a pending report-group invitation on the dashboard
**When** the user clicks it
**Then** it navigates to the group's own page (where they can see who else has accepted) instead of offering blind accept/reject controls inline

**Status: done.** New `feedbackManager.getMyFeedbackRequestsByStatus()` owns the open/closed split (both `AdHocRequestRow` and `CycleRequestRow` extended with `closesAt`); `dashboard/page.tsx` only destructures and renders. `CompetencyComparisonChart` gained `selfLabel`/`peerLabel` props (individual report's default output unchanged). 3-expert audit: no confirmed findings. 523/523 tests, `tsc`/lint clean, live-verified (closed/open sections, group-invitation link). Commit `40ddcd5`.

### Story 7.3: Competency Model v2 — Biblioteca, Thresholds, AI Interpretation (3 Parts)

As a user,
I want a browsable competency-model reference page, high/low thresholds shown against my own results, and an AI interpretation of my profile that covers competencies, saboteadores, and free-text themes as three distinct, well-attributed parts,
So that I understand not just my scores but what they mean and why, grounded in the same model the app measures me against.

Depends on Story 7.1. Ports the model/Biblioteca/AI-interpretation portions of commits `859f7fa`, `62e2ed8`, `b8a2857`, `0a5cd87`.

**Acceptance Criteria:**

**Given** the 16-competency v2 model (Story 7.1's schema)
**When** a user visits the new Biblioteca page
**Then** they see the full competency model drawn as a clickable radar (Teal orgs, Plenitud, 4 VACC roles, all competencies), each click showing that competency's description below — all text DB-driven, no hardcoded copy

**Given** `src/lib/aiInterpretation.ts` is `brujula-core`'s last remaining unmigrated-debt file (the 3rd and final `eslint.config.mjs` exemption, called from `src/app/actions/cycles.ts`)
**When** this story rewrites it for the 3-part interpretation + peer-open-text ingestion + thresholds
**Then** it is split into `db/aiInterpretations.ts` (reads) + `aiInterpretationManager.generateProfileInterpretation()` (orchestration), mirroring the existing `generateReportGroupInterpretation()` shape, and the 3rd `eslint.config.mjs` exemption block is removed entirely

**Given** an AI-generated profile interpretation
**When** rendered
**Then** it shows 3 distinct parts (competencies, saboteadores, free-text summary), each next to its corresponding report section, with competency mentions in the text bolded and carrying a native tooltip of the real Biblioteca description

**Status: done.** `aiInterpretationManager.generateProfileInterpretation()`/`saveProfileInterpretation()`/`getSavedProfileInterpretation()` added, backed by new `db/aiInterpretations.ts` reads and existing `db/feedback.ts` functions (reused, not duplicated). `actions/cycles.ts` now calls only the manager — **the 3rd and last `eslint.config.mjs` exemption is gone**; only the 2 deliberately-deferred admin pages remain exempted anywhere in the repo. New Biblioteca page + `CompetencyModelDiagram` (16-axis clickable radar, DB-driven text) + `InterpretationText` (mention-highlighting). 3-expert audit: zero confirmed findings. 542/543 (1 known pre-existing flake), `tsc`/lint clean. Manual-QA gap disclosed honestly: no `ANTHROPIC_API_KEY` configured in this environment, so the real 3-part generation was never observed — the graceful-degradation (`null`, never throws) path was verified directly instead. Found one pre-existing stale label (`CompetencyRadar.tsx`'s `GROUP_LABELS` still says "Visionario" instead of "Visión") — not fixed, out of file scope, flagged for a follow-up. Commit `b8a2904`.

### Story 7.4: Members Domain — Invitado Member Type

As a Supervisor,
I want to invite someone as a read-only "Invitado" who can respond to feedback and browse the Biblioteca but never request or be evaluated,
So that I can bring in an external or limited-role participant without giving them full member capabilities.

Depends on Story 7.1. Ports the `is_guest` portion of commit `62e2ed8`.

**Acceptance Criteria:**

**Given** `membersManager`/`db/members.ts` already models `isSupervisor` as a boolean member attribute
**When** this story adds the Invitado type
**Then** `isGuest` is modeled the same additive way, surfaced everywhere `isSupervisor` already is

**Given** every frontend chokepoint that branches on member type today (dashboard "Pedir feedback" button, mi-mapa link, etc. — no single existing gate covers all of them)
**When** this story ships
**Then** an explicit checklist of every such chokepoint is worked through and each correctly excludes an Invitado, verified individually — not left to review-by-inspection to catch a missed one

**Status: done.** `isGuest` threaded through `db/members.ts`/`membersManager.ts`/the invite form/member list; `listCycleParticipantCandidates` excludes guests (can't be a 360 subject), `listEvaluatorCandidates`/`getEvaluatorCandidates` deliberately don't (guests can still evaluate); pending-invitations now show the real subtype. Every chokepoint checklist item verified individually — **live verification caught a real bug code review missed**: the dashboard's empty-state "Pedir feedback" CTA card (a separate JSX branch from the top-bar button) had no guest guard at all. 3-expert audit: no confirmed findings. 532/532 (1 known pre-existing flake), `tsc`/lint clean, live-verified end to end (RPC rejections, hidden links, badge, subtype label, guest-as-evaluator flow). Commit `bc15685`.

### Story 7.5: Onboarding360Wizard + Questionnaire Changes

As a user starting a 360,
I want a guided 3-step wizard (context, evaluator selection, confirmation) instead of a single dense form, with the questionnaire reordered so saboteador questions don't interrupt competency questions,
So that starting a 360 is less overwhelming and answering it flows more naturally.

Depends on Story 7.3 (final competency/questionnaire content). Ports the remainder of commit `0a5cd87`: `Onboarding360Wizard`, questionnaire reorder + Presencia's 3rd question, saboteador-question deactivation (retired from the active questionnaire, reserved for a future toolbox) and its associated self-assessment-submission bugfix.

**Acceptance Criteria:**

**Given** a user starting a company or individual 360
**When** they use the new flow
**Then** `Onboarding360Wizard` guides them through context → evaluator selection → confirmation, with its editable **bold** text sourced from `platform_texts`

**Given** the questionnaire after this story ships
**When** a user answers it
**Then** saboteador questions no longer appear (retired via the `active` column, not deleted), questions are reordered so they're never interleaved with competency questions, and Presencia has its 3rd question

**Status: done.** `Onboarding360Wizard` (new) wraps the existing `EvaluatorPicker`/`EmailEvaluatorPicker` forms in `cycles/nueva/page.tsx`/`feedback/nueva-360/page.tsx`; the underlying Server Action submission mechanism is preserved (same `cyclesManager.createCycle`/`createIndividualRequest` calls) via page-local `useActionState`-shaped adapters — `actions/cycles.ts`'s own `createFeedbackCycle`/`createIndividualCycleRequest` exports are now unused by these two pages but left in place (out of file scope; unifying them is a flagged follow-up). Questionnaire reorder/Presencia/saboteador-deactivation confirmed schema-only, already landed in Story 7.1; found and fixed one stale hardcoded question-count claim in the old `cycles/nueva/page.tsx` copy. Added the first real characterization test exercising the self-assessment-submission bugfix through the manager layer (previously untested at that layer) — passes. 3-expert audit: zero confirmed findings. 544/544 (1 known pre-existing flake), `tsc`/lint clean, live-verified via direct RPC calls (no browser tool available). **Epic 7 complete** — all 7 stories done; the `dabarcao/brujula` upstream commits (`93b0e69..755c2e9`) found via `git fetch` at the epic's origin are now fully ported onto the layered architecture. Commit `aeadb32`.

### Story 7.6: Email Infrastructure (Resend) + Responder Intro/Finalize UX

As an evaluator or requester,
I want real invitation and thank-you emails sent automatically, with a brief intro before I start answering and a clear way to finalize my report,
So that I don't have to be told out-of-band that feedback is waiting for me, and I know what's expected before I commit to answering.

Depends on Story 7.1. Ports commit `255e265` in full. Introduces a new architectural layer.

**Acceptance Criteria:**

**Given** email sending doesn't fit `db/*` (no Supabase client, no RLS/authorization dimension) or `managers/*` (it's an infrastructure call, not business orchestration alone)
**When** this story is implemented
**Then** it lands in a new `src/server/infra/email.ts` layer, documented as **AD-12** in `ARCHITECTURE-SPINE.md` — "Infrastructure-service integrations get their own `infra/` layer, called only from a manager, never from a page or `db/*` file" — with `eslint.config.mjs` and both copies of the `mvc-layering` skill updated to reflect it

**Given** an invitation is created or a report is finalized
**When** the corresponding manager function runs
**Then** it triggers the appropriate email via the new `infra/email.ts` layer (invitation email, thank-you email)

**Given** `RESEND_API_KEY` may be absent in some environments (mirroring `ANTHROPIC_API_KEY`'s existing graceful-degradation pattern)
**When** this story is verified
**Then** the automated gate (`tsc`/lint/tests) passing is explicitly NOT treated as proof of real email delivery — a manual QA step with a real API key configured is required before this story is considered done

**Status: done.** `src/server/infra/email.ts` (Resend wrapper), AD-12 added to `ARCHITECTURE-SPINE.md`, `eslint.config.mjs` extended (new `@/server/infra/**` restriction, re-listed in both pre-existing exemption blocks per the replace-not-merge gotcha), both `mvc-layering` skill copies updated. `db/responder.ts`'s `submitFeedbackResponse` surfaces `inviteeEmail` for the thank-you-email trigger; `responderManager.sendInvitationEmails()` called from `cyclesManager` (in-domain) and, as a documented exception, from `actions/feedback.ts` directly (`feedbackManager.ts` was locked by the parallel Story 7.2). Caught and fixed a real bug while porting: filtering self-invitations via `.neq()` silently dropped every ad-hoc invitation, since `evaluator_category` is `null` (not `'self'`) for that flow and PostgREST's `neq` drops nulls — fixed in application code instead. `resend@6.28.1`. 3-expert audit: no confirmed findings (one low-stakes, commented judgment call). 523/523 tests, `tsc`/lint clean. Automated tests only prove the no-`RESEND_API_KEY` graceful-no-op path — real delivery needs a manual QA pass with a real key, not done here. Commit `85539d1`, plus a follow-up (`5ce2cc3`) closing a scope gap the story itself flagged: the individual-account "add more evaluators" ad-hoc flow, blocked at the time by Story 7.2's file lock on `feedbackManager.ts` — implemented once 7.2 landed, which also surfaced (and logged in `deferred-work.md`, not fixed) a pre-existing add-only/removal-UI mismatch shared by both the member-id and email evaluator pickers.

### Story 7.7: Evaluator-Email-Only-New Fix + ResponderWizard Question-by-Question Validation

As a requester who adds evaluators to an already-created request,
I want only the newly-added evaluators to receive an email (not everyone again), and as an evaluator answering a 360,
I want my answers validated as I go rather than only at final submit,
So that I don't spam people who already responded, and don't lose my answers to a validation error discovered too late.

Depends on Story 7.6. Ports commits `69f6495` + `755c2e9`.

**Acceptance Criteria:**

**Given** a requester adds evaluators to an existing ad-hoc or 360-cycle request
**When** the add completes
**Then** only the newly-added evaluators receive an invitation email — evaluators already invited receive nothing

**Given** an evaluator working through `ResponderWizard`
**When** they answer a required question
**Then** the required-question warning clears immediately (not only on the next "Siguiente" click), and validation happens question-by-question so a later issue never discards already-entered answers

**Status: done.** `db/feedback.ts`/`db/cycles.ts`'s evaluator-update functions now surface the add-only RPCs' own newly-inserted rows; `responderManager.sendInvitationEmailsForNewInvitees()` (new, reuses `infra/email.ts`, factored a shared subject/body builder with the existing create-flow sender) emails only those, called from `feedbackManager`/`cyclesManager` directly (both were unlocked by the time this story ran, so no Server-Action-level workaround was needed). `ResponderWizard` validates open/scale/competency questions per-step, clears its warning on answer. Ran concurrently with Story 7.3; coordinated cleanly (confirmed no file collisions, one shared test file's content ended up attributed to this story's commit due to timing — documented, not rewritten). 3-expert audit: zero confirmed findings. Full suite (post-reset): the only failures were the same pre-existing org-count-race class, confirmed pre-existing and unrelated. Flagged one small leftover gap: `actions/auth.ts`'s signup-success copy still hardcoded instead of reading the `platform_texts` keys migration `0095` already added — not fixed here (out of file scope), candidate follow-up. Commit `126ceec`.
