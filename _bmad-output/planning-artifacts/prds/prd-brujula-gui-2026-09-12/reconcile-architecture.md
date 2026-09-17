# Reconciliation: PRD vs. ARCHITECTURE-SPINE (11 ADs)

## Correctly reflected (no restatement drift)
- **AD-7 invitee-token carve-out**: FR-5 + UJ-2 correctly state `requireApiToken()` never gates `/responder/[token]` / `/invitacion/[token]`, and that the responder domain migrates last. Matches the spine exactly.
- **AD-8 rollout order**: §6.2 and the Glossary list the remaining five domains in the spine's exact risk-ascending order (admin/members → cycles → feedback → responder/invitation → read-only reports), with report groups as POC. No reordering drift.
- **AD-5/AD-6 token-RLS relationship**: FR-3 correctly frames `requireApiToken()` as gating the API layer while RLS (via the still-issued Supabase session cookie) keeps enforcing authorization underneath — dual-issuance, neither replacing the other. No contradiction.
- **AD-10 feature flags**: FR-6 correctly restates "one place, the thin caller, never the manager," one domain/flag/deploy at a time, and old-path deletion gated on one full production cycle.

No inconsistencies with the spine were found — the PRD does not contradict rollout order, the token/RLS relationship, or the invitee carve-out anywhere it touches them.

## Product-relevant gaps

1. **AD-9's test-scope caveat is dropped.** The spine explicitly notes Vitest can't test async Server Components, so "Server Component rendering correctness stays manually/QA-checklist verified, not unit-tested." FR-7 lists what the 2-3 Vitest tests *do* cover (auth-boundary rejection, anonymity-threshold, golden-output) but never says what they *don't* — a story-writer could read FR-7 as full coverage and skip writing an explicit manual-QA-checklist step/story for Server Component rendering per domain.

2. **AD-6's "known discrepancy" verification step is dropped.** The spine flags a concrete, product-relevant risk: `src/lib/supabase/server.ts` claims session refresh happens "in the middleware," but no `middleware.ts` exists — meaning the RLS safety net could silently degrade for long-lived sessions. The spine says this must be checked "before the report-groups POC is considered proven." The PRD's POC scope (§6.1, SM-2) and UJ-1's edge case never mention this check, so it risks being missed as an acceptance criterion for the POC epic.

3. **AD-8's UI-redesign sequencing rule is dropped.** The spine states per-domain UI redesign work must follow that domain's backend migration, while global/additive redesign (tokens, fonts, shared chrome) may proceed anytime in parallel. The PRD's only touchpoint with the parallel "Brújula Segura" redesign (§5) is the shared fetch-wrapper note — it omits this sequencing constraint, which matters for coordinating the two concurrent initiatives the same builder is running.

## File
/home/oski/workspace/kairosexperience/brujula-gui/_bmad-output/planning-artifacts/prds/prd-brujula-gui-2026-09-12/reconcile-architecture.md
