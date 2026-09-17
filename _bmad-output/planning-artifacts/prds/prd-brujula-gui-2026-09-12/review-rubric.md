# PRD Quality Review — Brújula Core — Backend/GUI Decoupling

## Overall verdict

This is a well-earned PRD for its shape: an infrastructure-facing, brownfield, single-operator initiative with unusually concrete, testable FRs and honest scope boundaries — it reads like it was actually distilled from finished upstream work, not padded out to fill a template. The two real risks are structural, not substantive: the PRD promises inline traceability to SPEC.md's CAP-N capabilities (§0) but never delivers a single such cross-reference, and two ID sequences have unexplained gaps (FR-4, §2.2) that a downstream consumer will stumble on. Fix those and this is ready to feed `bmad-create-epics-and-stories` as-is.

## Decision-readiness — strong

Decisions are stated as decisions, not softened into considerations: FR-3 flatly requires rejecting requests "even if a valid Supabase session cookie is present"; FR-6 flatly forbids checking the flag "inside a manager"; the FR-2 NFR flatly disallows a Server Component calling its own HTTP API. Open Questions (§8) are genuinely open — OQ-2 (token rotation/CSRF mechanism) has no answer buried in the next sentence, it's explicitly deferred to post-POC scaffolding work. The `[NOTE FOR PM]` under FR-7 sits at a real tension (test automatically via CI vs. run locally before each flag flip) rather than a safe checkpoint. Non-Goals (§5) name what's given up, not just what's chosen — e.g., RLS replacement is deferred "only once Supabase itself is actually scheduled for removal," which is a real constraint, not a hedge.

### Findings
- **low** Dual-auth maintenance cost not named as a cost (§4.3, §5) — FR-3 keeps RLS as a "safety net" underneath the new app token, meaning two authorization mechanisms run in parallel for the life of the migration. The PRD states this design choice clearly but never names the ongoing maintenance/debugging cost of keeping both consistent as a trade-off given up. *Fix:* add one clause to §4.3's description or §5 naming this as an accepted cost, not just a mechanism.

## Substance over theater — strong

No theater detected. Only two personas (the operator, and Diego the anonymous evaluator) — appropriate for a single-operator internal tool, not persona padding. No differentiation/innovation section exists to pad — correctly absent for an infra initiative. No NFR boilerplate: the FR-2 "no added network hop" NFR and FR-6/FR-7's flag/test requirements are product-specific and falsifiable, not "must be scalable/secure" filler. The Vision (§1) is not swappable into another PRD — it cites "25 files," "~35 Postgres functions and 23 row-level-security policies," and the specific coupling failure mode ("a change to how a screen looks... can't be made independently, or even always be told apart").

## Strategic coherence — strong

The thesis is explicit and singular: decouple GUI from backend via a `db → managers → API` seam so future changes (redesign, Supabase removal) become contained, proven via the smallest/lowest-risk domain first. Feature order follows the thesis (risk-ascending rollout, POC-first) rather than "what's easy first" dressed up as strategy. SM-C1 is a real counter-metric tied to the thesis's central risk (velocity pressure undermining the safety net), not a boilerplate caveat.

### Findings
- **medium** Primary/Secondary success metrics invert relative to MVP scope (§7) — SM-1 (labeled **Primary**) validates all six domains migrated and flags removed, which §7 itself flags as "beyond this MVP's scope"; SM-2 (labeled **Secondary**) is the metric that actually gates this MVP's completion. A reader skimming only "Primary" success metric could conclude the MVP is bigger than §6 defines. *Fix:* either relabel SM-2 as Primary-for-MVP / SM-1 as Primary-for-initiative, or add a one-line note at SM-1 clarifying it is the initiative's north star, not this PRD's gate.

## Done-ness clarity — strong

This is the PRD's strongest dimension. Every FR has a "Consequences (testable)" block with verifiable conditions rather than adjectives: FR-1's ESLint rule "fails `npm run lint` / CI," FR-3's 401 response "regardless of Supabase session cookie state," FR-7's "2-3 passing integration tests... covering: auth-boundary rejection, anonymity-threshold enforcement, and a golden-output check." No instances of "handles gracefully," "reasonable performance," or "user-friendly" found anywhere in the document.

### Findings
- **medium** "one full production cycle" is undefined (§4.5, FR-6) — FR-6's rollback safety condition is "the old code path for a domain is deleted only after its new path has survived one full production cycle with the flag on." Neither the Glossary nor FR-6 defines what a production cycle is (a calendar period? one full feedback/assessment cycle through the product's own "Cycle" domain concept? a deploy window?), so an engineer can't tell when this condition is actually met. *Fix:* define "production cycle" in §3 Glossary or restate FR-6's consequence with a concrete unit (e.g., "N calendar days" or "one full customer feedback cycle, whichever is longer").

## Scope honesty — strong

§5 Non-Goals does real work — each of its four bullets explains *why* the omission is safe, not just that it's omitted (e.g., CI/staging explicitly framed as "not a commitment of this initiative," with the safety net designed to work without it). §6.2 Out of Scope for MVP is explicit about deferring five of six domains, sequenced per the architecture spine rather than silently assumed. Two inline `[ASSUMPTION]` tags (§2.1, §2.3 UJ-2) mark real inferences rather than over-tagging routine text. Open-items density (2 Open Questions, 3 assumptions, 1 NOTE FOR PM) is proportionate to an internal-tool Fast-path PRD — not alarming for these stakes.

## Downstream usability — thin

This PRD is chain-top for `bmad-create-epics-and-stories` per its own §0, so this dimension carries real weight — and it has two structural gaps that matter more than everything else in the document combined.

First, §0 makes an explicit commitment: "Every FR traces back to one of the SPEC's CAP-N capabilities, kept as an inline cross-reference." No FR in §4 (FR-1, FR-2, FR-3, FR-5, FR-6, FR-7) actually carries a CAP-N reference — only "Realizes UJ-N" tags appear. A reader cannot verify that all 5 of SPEC.md's capabilities are covered by these FRs, or map any FR back to its source capability, despite the PRD promising exactly that traceability.

Second, the FR and section numbering has two unexplained gaps: FR-4 is absent (the sequence runs FR-1, FR-2, FR-3, FR-5, FR-6, FR-7 — §4.3 "App-Owned API Authentication" ends at FR-3 and §4.4 "Anonymous Invitee Continuity" begins at FR-5), and §2.2 is absent (§2 runs 2.1 Jobs To Be Done directly to 2.3 Key User Journeys). Neither gap is explained or flagged as intentional.

### Findings
- **high** CAP-N traceability promised but never delivered (§0 vs. §4) — breaks the PRD's own stated cross-reference mechanism back to SPEC.md's 5 capabilities. *Fix:* add a `(CAP-N)` tag to each FR's description line, and confirm all 5 SPEC capabilities are covered by the 6 FRs (or explain any gap in §5 Non-Goals).
- **high** FR-4 and §2.2 numbering gaps unexplained (§4.3–§4.4, §2) — a downstream reader or the epics-and-stories workflow may treat this as a dropped requirement/section rather than a renumbering artifact, and either silently skip coverage or stall asking for clarification. *Fix:* renumber contiguously, or if FR-4/§2.2 were deliberately removed during editing, leave a one-line note saying so (e.g., "FR-4 removed during review, folded into FR-3" — or renumber down).

## Shape fit — strong

Correctly shaped as a capability spec for an internal, single-operator, brownfield initiative rather than forced into consumer-PRD form. Only two UJs, both load-bearing (UJ-1 proves the pattern; UJ-2 is the invariant the whole invitee-facing surface must preserve) — no UJ padding. Success Metrics are operational (flag removal, POC completion) rather than manufactured user-facing metrics. Brownfield references are specific and plausible (`src/app/actions/reportGroups.ts` at "71 lines," "~35 Postgres functions and 23 row-level-security policies," `USE_NEW_API_<DOMAIN>` naming) rather than vague gestures at "the existing code." This PRD correctly leans on its architecture-spine companion for mechanism and stays at requirements altitude throughout, per its own §0 charter.

## Mechanical notes

- **ID continuity**: FR-4 missing (FR-3 → FR-5 jump, §4.3/§4.4); §2.2 missing (2.1 → 2.3 jump, §2). No other ID gaps found — UJ-1/UJ-2, SM-1/SM-2/SM-C1, OQ-1/OQ-2 are all contiguous. (See high-severity finding above under Downstream usability.)
- **Assumptions Index roundtrip**: partial gap. §9 lists three entries: §2.1 and §2.3-UJ-2 both have matching inline `[ASSUMPTION]` tags in the body. The third entry ("§1, §0 — Vision and Document Purpose paragraphs are elaborated distillations...") has no corresponding inline `[ASSUMPTION]` tag anywhere in §0 or §1 — it's indexed but not marked at the point of occurrence. *Fix:* add an inline `[ASSUMPTION]` marker in §1 or §0, or drop it from the index and note it as a distillation-method disclosure instead (it's a different kind of claim than the other two).
- **Glossary drift**: none found. "Domain," "Manager," "App token," "RLS," "Feature flag," and "POC" are used consistently (case and form) across §3, §4, §6, and §7.
- **UJ protagonist naming**: UJ-2 has a named protagonist (Diego) carrying context inline. UJ-1's protagonist is "the product owner/developer" — unnamed, but this is the PRD's own author/reader in a self-referential capability spec, so a fictitious name would add nothing; acceptable for this shape.
- **Required sections**: all present for this stakes/type — Document Purpose, Vision, Target User (JTBD + UJs), Glossary, Features/FRs, Non-Goals, MVP Scope, Success Metrics, Open Questions, Assumptions Index. Nothing missing.
