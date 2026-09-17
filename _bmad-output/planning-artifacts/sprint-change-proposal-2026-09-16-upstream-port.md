---
title: 'Sprint Change Proposal: Port 8 Upstream brujula Commits into the Layered Architecture'
type: 'course-correction'
created: '2026-09-16'
status: 'approved'
mode: 'batch'
---

# Sprint Change Proposal: Port 8 Upstream `brujula` Commits into the Layered Architecture

## 1. Issue Summary

**Trigger**: user request, this session, to check the original project (`dabarcao/brujula` on GitHub) for recent commits and port any new functionality into `brujula-core` following the now-complete `db -> managers -> API/pages` layering (Stories 6.3/6.4, closed earlier this session) and the new `mvc-layering` skill.

**Discovery**: `brujula-core` was bootstrapped as a code snapshot of `dabarcao/brujula`'s commit `93b0e69` (2026-09-10). `git fetch origin` against the sibling checkout `brujula-gui` revealed **8 commits on `origin/main` that no local checkout has pulled yet** (`93b0e69..755c2e9`, all dated 2026-09-10 through 2026-09-16, co-authored with Claude Sonnet 5) — real product functionality built directly against the old (pre-refactor) architecture, in parallel with this session's own architecture work.

**Category**: new requirement emerged from a parallel workstream (not a technical limitation or a misunderstanding of existing requirements) — the PRD for the `db -> managers -> API` initiative (`_bmad-output/planning-artifacts/prds/prd-brujula-gui-2026-09-12/prd.md`) never anticipated new product features arriving mid-migration from a sibling repo.

**Evidence**: `git log HEAD..origin/main --stat --reverse` in `brujula-gui`, cross-checked against real file/migration content in both repos by a dedicated Explore agent and a dedicated Plan agent (not commit-message summaries alone). Full detail preserved in this session's own plan file, `/home/oski/.claude/plans/inherited-tinkering-cake.md`.

The 8 commits, by feature area:

1. `1aa41c8` — Dashboard: split "en curso"/"cerrado" feedback sections with real close date; report-group pending-invitation task becomes a link instead of blind accept/reject; configurable labels on `CompetencyComparisonChart`.
2. `859f7fa` — New **Biblioteca** page (clickable competency-model browser, DB-driven text) + 2 real RPC bugfixes in `create_feedback_cycle`. Upstream migrations 0067-0070.
3. `62e2ed8` — **Competency model v2** (16 competencies, asymmetric per-dimension split) — requires wiping existing feedback data. New **Invitado** member type. AI interpretation split into 3 parts, now ingests peer open-text. Upstream migrations 0071-0076.
4. `b8a2857` — Highlight competency mentions in AI interpretation text (native tooltip).
5. `0a5cd87` — `Onboarding360Wizard`. Per-competency high/low thresholds. Saboteador questions deactivated in the questionnaire. Upstream migrations 0077-0084.
6. `255e265` — **Real email sending via Resend** (invitation + thank-you), evaluator intro gate. New npm dependency. Upstream migrations 0085-0089.
7. `69f6495` — Fixes email sending when adding evaluators; `ResponderWizard` validates question-by-question. Upstream migrations 0090-0094.
8. `755c2e9` — Small `ResponderWizard` UX fix.

## 2. Impact Analysis

**Epic Impact**: No existing epic (1-6) is invalidated. This is new scope, sized roughly comparable to a full additional epic (larger than Epic 6, which was itself a mid-plan addition). Epic 5/6 are unaffected in content; a **new Epic 7** is the cleanest fit — this work has no natural home inside the existing 6 epics' own boundaries (Epic 5 is legacy-flag retirement, Epic 6 is operational hardening of the admin console specifically).

**Story Impact**: None of the 96 existing stories (Epics 1-6) require modification. 7 new stories are added under the new epic (one per chunk, see §4).

**Artifact Conflicts**:
- **PRD** (`prd-brujula-gui-2026-09-12/prd.md`): no conflict. That PRD's scope is exclusively the layering mechanism itself (FR-1 through FR-6); it explicitly treats "the six domains' actual business logic" as pre-existing and unchanged. New product features arriving is outside its stated Non-Goals/MVP boundary, not in conflict with it — this proposal does not modify that PRD.
- **Architecture** (`ARCHITECTURE-SPINE.md`): **one new decision required** — email sending via Resend is a third-party API integration that doesn't fit the existing two-layer (`db`/`managers`) model (AD-1/AD-2: `db/*` is specifically defined as the Supabase-removal seam; Resend calls construct no Supabase client and have no RLS/authorization dimension). **Decision (made with the user during planning): new `src/server/infra/email.ts` layer, documented as a new AD-12** — "Infrastructure-service integrations get their own `infra/` layer, called only from a manager, never from a page or db/* file." No other AD requires modification; AD-1 through AD-11 all hold unchanged for every other chunk.
- **UI/UX**: no existing DESIGN.md/EXPERIENCE.md conflict — Biblioteca, Onboarding360Wizard, and the dashboard section-split are new screens/flows with their own upstream-authored UX already implemented once (being ported, not designed from scratch). No accessibility regression expected; verify with the same Playwright-based live-check discipline used for Story 6.4.
- **Other artifacts**: `eslint.config.mjs` needs one addition (permit `src/server/infra/*` to import external SDKs the way `db/*` permits Supabase, and forbid `src/app/**`/`src/components/**` from importing `infra/*` directly — same boundary shape as the existing rule). `deferred-work.md` gets an entry closing the `src/lib/aiInterpretation.ts` ESLint-exemption debt (see §4, Chunk B). The `mvc-layering` skill (`.claude/skills/mvc-layering/SKILL.md`, both copies) needs a short addendum documenting the new `infra/` layer so it guides Chunk E correctly — tracked as part of Chunk E's own Definition of Done, not a separate story.

## 3. Recommended Approach

**Selected: Direct Adjustment (Option 1) — add a new epic within the current plan structure**, not a rollback (nothing to roll back — this is net-new scope) and not an MVP review (the existing PRD's MVP already shipped, per Story 6.4's closure).

**Effort estimate: High.** 28 SQL migrations, ~15 new/changed frontend files, one new architectural layer, one destructive-to-local-data migration, one new external service integration. Comparable to, or larger than, the combined size of Epics 3+6.

**Risk level: Medium.** Mitigated by: (a) the schema layer was independently verified to have zero real conflicts with `brujula-core`'s own migration 0067 (different tables/RPCs entirely) and every changed RPC keeps backward-compatible defaults for already-shipped manager wrappers; (b) the competency-model-v2 data wipe only affects local dev/test data in `brujula-core` (no production data exists here), the same risk class already accepted this session for `npx supabase db reset`; (c) every chunk gets the same `mvc-layering`-skill-guided implementation + proportional 3-expert audit already proven across Story 6.4's 4 domains.

**Rationale for Direct Adjustment over alternatives**: rollback is inapplicable (no prior story caused this). MVP review is inapplicable (the layering MVP is done and unaffected). Direct Adjustment — add Epic 7, sequence its stories per the dependency graph below, execute with the same Plan → mvc-layering-skill-guided-implement → verify → proportional-3-expert-audit → commit cycle already established — fits cleanly within "how this project already does things," which is itself a factor the checklist asks to weigh (team momentum/sustainability).

## 4. Detailed Change Proposals

### 4.1 New Epic

```
## Epic 7: Port Upstream Product Features onto the Layered Architecture

Ports real functionality built in parallel, directly against dabarcao/brujula
(the pre-refactor original repo) after brujula-core's initial snapshot
(commit 93b0e69), into brujula-core's now-complete db -> managers ->
API/pages layering (Epics 1-6). Originated via bmad-correct-course
(sprint-change-proposal-2026-09-16-upstream-port.md) after `git fetch`
against dabarcao/brujula.git's origin/main revealed 8 unpulled commits
(93b0e69..755c2e9) with real product work. Every story in this epic
follows the mvc-layering skill (.claude/skills/mvc-layering/SKILL.md) and
closes with that skill's proportional 3-expert compliance audit
(import-boundary / business-logic-leakage / manager-db-integrity, scoped
to that story's own touched files) as part of its own Definition of Done.
```

### 4.2 New Stories (one per chunk; full technical detail lives in the plan file, not restated in epics.md itself — epics.md gets AC-level acceptance criteria, matching this repo's existing style)

| # | Story | Depends on | Summary |
|---|---|---|---|
| 7.1 | Schema foundation: port 28 upstream migrations | — | Renumber upstream `0067`-`0094` → `0068`-`0095` (verified: no filename cross-references inside the SQL bodies, safe to renumber; no content conflict with `brujula-core`'s own `0067`). Apply atomically. Execute the competency-model-v2 data wipe as part of this story — **local dev/test data only, still requires the user's explicit in-the-moment go-ahead before running**, not a standing pre-approval. Update the 6 existing `scripts/seed-*.mjs` for the new 16-competency asymmetric model so the AD-9 characterization-testing safety net doesn't silently break. |
| 7.2 | Dashboard: en-curso/cerrado split + report-group task link | 7.1 | Port commit `1aa41c8` + the 2 orphaned `create_feedback_cycle` RPC bugfixes from commit `859f7fa`. The en-curso/cerrado split with real close date is a business rule — must land inside `feedbackManager`, not recomputed in `dashboard/page.tsx` (the exact class of bug Story 6.4 already fixed once in this file; do not regress). |
| 7.3 | Competency model v2: Biblioteca, thresholds, AI interpretation (3 parts) | 7.1 | Port the model/Biblioteca/AI-interpretation portions of commits `859f7fa`/`62e2ed8`/`b8a2857`/`0a5cd87`. Closes the `src/lib/aiInterpretation.ts` ESLint-exemption debt (the last of the 3 pre-existing exemptions in `eslint.config.mjs`) by splitting it into `db/aiInterpretations.ts` (reads) + `aiInterpretationManager.generateProfileInterpretation()` (orchestration), mirroring the existing `generateReportGroupInterpretation()` shape. Biblioteca's own read stays Server-Component-only (no Route Handler) per the same documented judgment call already used for other read-model-composition functions — state the reasoning inline. |
| 7.4 | Members domain: Invitado member type | 7.1 | Port the `is_guest` portion of commit `62e2ed8`. Extends `membersManager`/`db/members.ts` the same way `isSupervisor` already works. Explicit checklist for every frontend chokepoint that needs an Invitado branch (dashboard "Pedir feedback" button, mi-mapa link, etc.) — do not rely on review-by-inspection alone to catch a missed one. |
| 7.5 | Onboarding360Wizard + questionnaire changes | 7.3 | Port the remainder of commit `0a5cd87`: wizard component, questionnaire reorder + Presencia 3rd question, saboteador-question deactivation + its self-assessment-submission bugfix. |
| 7.6 | Email infrastructure (Resend) + responder intro/finalize UX | 7.1 | Port commit `255e265` in full. Introduces `src/server/infra/email.ts` (new AD-12 layer — see §2), updates `eslint.config.mjs` and the `mvc-layering` skill (both copies) to document it. Manual QA step required: `RESEND_API_KEY` absence degrades to a silent no-op, so the automated `tsc`/lint/test gate alone cannot confirm real email delivery. |
| 7.7 | Evaluator-email-only-new fix + ResponderWizard validation | 7.6 | Port commits `69f6495` + `755c2e9`. |

**Dependency graph**: 7.1 is prerequisite for everything. 7.2/7.4/7.6 are independently parallelizable once 7.1 lands. 7.3 depends only on 7.1. 7.5 depends on 7.3. 7.7 depends on 7.6.

### 4.3 PRD MVP Impact

None. The PRD's own MVP (report-groups POC) and north-star (SM-1, all 6 domains migrated) are both already satisfied (Story 6.4). This proposal adds scope entirely outside that PRD's stated boundary — a new epic, not a PRD amendment.

## 5. Implementation Handoff

**Scope classification: Major** (new architectural decision required — AD-12 — plus a destructive-data-adjacent migration and a new external dependency) for the epic as a whole, but **each individual story, once Epic 7 exists, is Minor/Direct-Adjustment-sized** and implementable by a developer agent following the already-proven Story 6.4 pattern (Plan → mvc-layering-skill-guided implementation → verification gate → proportional 3-expert audit → commit).

**Handoff**:
- This proposal itself (the Major-scope architectural decision, AD-12) is resolved by this document — no separate PM/Architect escalation needed, since the decision was already made collaboratively with the user during the planning-mode session that produced this course-correction.
- Stories 7.1-7.7: Developer-agent execution, this same session, following the dependency graph in §4.2.

**Success criteria**: each story's own AC (drawn from the plan file's chunk descriptions) plus its `mvc-layering`-skill-defined Definition of Done — `tsc`/lint clean (0 new `no-restricted-imports` violations, including the resolved `aiInterpretation.ts` exemption), full test suite green, proportional 3-expert audit's confirmed findings fixed, live verification for user-facing screens (Biblioteca, Onboarding360Wizard) and for the email flow specifically (manual, since the automated gate can't detect a missing API key).
