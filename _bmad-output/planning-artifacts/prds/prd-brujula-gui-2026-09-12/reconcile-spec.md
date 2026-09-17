---
title: SPEC.md → PRD reconciliation
input: _bmad-output/specs/spec-brujula-core/SPEC.md
output: _bmad-output/planning-artifacts/prds/prd-brujula-gui-2026-09-12/prd.md
date: 2026-09-12
---

# Reconciliation: SPEC-brujula-core vs PRD

## Landed cleanly (all 5 capabilities, 4 non-goals, success signal, 2 open questions)

- **CAP-1** (GUI-only-via-managers/API, ESLint 0-violations) → §4.1, FR-1.
- **CAP-2** (one manager/domain, in-process + HTTP, identical results) → §4.2, FR-2.
- **CAP-3** (app token issued alongside Supabase session, RLS still enforces, 401 without token) → §4.3, FR-3.
- **CAP-4** (invitee flows keep their own token, untouched by app-token scheme) → §4.4, FR-5.
- **CAP-5** (per-domain flag, safety net before flip, old path removed only after one full prod cycle) → §4.5, FR-6/FR-7 — including the specific 2–3-test triad (auth-boundary, anonymity-threshold, golden-output) preserved verbatim.
- **Non-goal 1** (RLS→app-level auth deferred until Supabase actually scheduled for removal) → §5 bullet 1, reasoning intact.
- **Non-goal 2** (seam only, not the actual Supabase→Postgres swap) → §5 bullet 2, reasoning intact.
- **Non-goal 3** (no CI/staging commitment; revisit as open question before POC done) → §5 bullet 3, correctly cross-referenced to §8 OQ-1.
- **Non-goal 4** (Brújula Segura redesign out of scope, touchpoint = shared fetch wrapper) → §5 bullet 4.
- **Success signal** → split faithfully into SM-1 (long-term, all-six-domains, carried forward explicitly) and SM-2 (POC-scoped: create/respond/close/AI-interpretation against seeded data).
- **Open Question 1** (CI decision timing) → §8 item 1, verbatim "decide before POC is considered done," attributed to SPEC.
- **Open Question 2** (token issuance/refresh/CSRF mechanism, scoped to scaffolding epic) → §8 item 2, attributed to SPEC + AD-5.
- **Constraint 1** (zero test coverage/no CI/staging → local-Vitest-tripwire + per-domain flags) → distributed across §2.1 JTBD, FR-7 consequences, SM-C1, and §5 bullet 3. Rationale intact.

## Gaps found

1. **Dropped evidentiary rationale for Constraint 3** (RPC wrapping). SPEC's justification for wrapping the ~35 RPCs as-is instead of porting logic to TypeScript is explicitly "battle-tested (two prior RLS-recursion bugs already fixed)." The PRD (Vision §1, Glossary "DB-access layer") keeps the *rule* ("wraps... does not reimplement their logic") but drops the *why* — the RLS-recursion-bug history that makes "don't touch it" a risk-based decision rather than a laziness shortcut. A reader of the PRD alone would not know this constraint is evidence-based.

2. **Dropped evidentiary rationale for Constraint 4** (rollout discipline). SPEC grounds "strict risk-ascending, one-domain-at-a-time rollout" in the team's existing track record: "66 migrations to date." The PRD keeps the resulting behavior (§1 "one bounded domain at a time... smallest and lowest-traffic first"; FR-6 "at most one domain's flag per deploy"; §6.2 risk-ascending order) but never states the historical evidence behind it. Same pattern as gap 1 — mechanism/outcome survives, the "why we trust this approach" evidence does not.

3. **Minor: mechanism specifics of Constraint 2 thinned.** SPEC names the RLS mechanism precisely — "23 policies, 9 migrations... keyed off Supabase `auth.uid()` inside `SECURITY DEFINER` RPCs." The PRD Glossary keeps "23 policies, keyed off Supabase's `auth.uid()`" but drops "9 migrations" and "`SECURITY DEFINER`" entirely. Lower severity than gaps 1–2 since the core rationale (why the app token is issued *alongside*, not instead of, the Supabase session) is fully preserved in FR-3 — this is a lost mechanism detail, not a lost reason.

No capability, non-goal, success-signal clause, or open question was dropped outright — the 3 gaps above are all the same shape: quantitative/historical *evidence* behind a constraint's "why" thinned out while the constraint's resulting rule/behavior was carried forward faithfully. Consider folding the two evidentiary gaps (RLS-recursion history, 66-migrations discipline) into the PRD's Vision (§1) or a new "Constraints Rationale" subsection if a reader who hasn't seen SPEC.md needs to trust these constraints rather than just follow them.
