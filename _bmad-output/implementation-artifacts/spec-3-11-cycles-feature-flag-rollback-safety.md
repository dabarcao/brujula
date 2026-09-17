---
title: 'Cycles Feature Flag and Rollback Safety'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1e26500'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.10 already built the `USE_NEW_API_CYCLES` flag mechanism (default off, old path byte-preserved, checked only in each of the 6 thin callers in `src/app/actions/cycles.ts`) and manually proved both branches pass the characterization suite once. That proof was a one-off manual run — the normal `npm run test` command never exercises the flag-ON path, so nothing guards against a future refactor silently breaking the toggle mechanism itself. Separately, `docs/feature-flags.md` and `.env.example` (both created by Story 3.5 as living documents future domains' equivalent stories extend) don't yet mention this domain's flag.

**Approach:** Three additive deliverables, mirroring Story 3.5's exact shape, no changes to any existing action/manager/route file's logic: (1) a new, small, permanent test file proving the flag-routing mechanism (not business-logic equivalence — that's Story 3.12's separate job) for a representative sample of 3 of the 6 call sites: `createFeedbackCycle` (a simple 1:1 delegate baseline), `updateCycleRequestEvaluators` (a distinct `/gestionar`-path redirect shape), and `finalizeCycleRequest` (the highest-risk function — its distinctive unmigrated `generateAiInterpretation`/`save_ai_interpretation` branch, which Story 3.10's own review scrutinized closely); (2) a new `## USE_NEW_API_CYCLES` section in `docs/feature-flags.md`, matching the exact subsection shape Story 3.5 established (Domain/Default/Where it's checked/New path/Old path/Regression test, then Manual QA checklist/Rollback procedure/Deletion eligibility) — the "Verified safe to flip" subsection is intentionally omitted for now, matching Story 3.5's own precedent of only adding it once the domain's New-Path-Verification story (3.12) actually lands; (3) add `USE_NEW_API_CYCLES=false` to `.env.example`, mirroring the existing `USE_NEW_API_ADMIN_MEMBERS` entry's comment style exactly.

**Investigated (not guessed): `finalizeCycleRequest`'s toggle test doesn't need special AI-interpretation handling.** `generateAiInterpretation` (`src/lib/aiInterpretation.ts`) returns `null` immediately if `process.env.ANTHROPIC_API_KEY` is unset, before making any Supabase call — and no test file in this repo sets that var. So in this story's flag-ON scenario, after `cyclesManager.closeRequest` (mocked) resolves, `generateAiInterpretation` short-circuits to `null` and `save_ai_interpretation` is never reached — the toggle test only needs to assert `cyclesManager.closeRequest` was called correctly; it does not need to fake the AI-interpretation RPCs.

## Boundaries & Constraints

**Always:**
- The new toggle test spies on `cyclesManager` (via `vi.mock`) to prove *which path was taken*, not business-logic correctness — assert call/no-call and argument shape, not deep output equivalence.
- For both flag states (`"true"` → manager called, `supabase.rpc` not called for that action; unset/`"false"`/any-other-string → `supabase.rpc` called, manager not called), covering the 3 chosen call sites.
- `docs/feature-flags.md`'s new section states the manual-QA-before-flip checklist and rollback procedure in the same shape/detail as the existing `USE_NEW_API_ADMIN_MEMBERS` section, adapted for cycles' 6 call sites and its higher-stakes framing (epics.md's own AC: "cycles are higher-stakes than report groups or admin").
- `.env.example`'s new entry documents default (`false`), where it's checked, and points to `docs/feature-flags.md`, matching the existing entry's comment style.

**Never:**
- Do not modify any existing logic in `src/app/actions/cycles.ts`, `src/server/managers/cyclesManager.ts`, `src/server/db/cycles.ts`, or `src/app/api/cycles/**` — this story is additive-only (new test file, new docs).
- Do not set `USE_NEW_API_CYCLES=true` anywhere in committed code, config, `.env.example`'s own default, or any CI-equivalent.
- Do not attempt deep old-vs-new business-logic equivalence testing — that is Story 3.12's scope, not this one's.
- Do not delete the old code path or write any rollback tooling that executes deletion — Epic 5's job, this story only documents the procedure.
- Do not add a "Verified safe to flip" subsection to the new `docs/feature-flags.md` section — that's added by Story 3.12, once it actually lands.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `createFeedbackCycle`, flag `"true"` | env var set | `cyclesManager.createCycle` spy called; `supabase.rpc` not called for this action | N/A |
| `createFeedbackCycle`, flag unset | env var absent | `supabase.rpc("create_feedback_cycle", ...)` called; manager spy not called | N/A |
| `updateCycleRequestEvaluators`, flag `"true"` | env var set | `cyclesManager.updateRequestEvaluators` spy called; `supabase.rpc` not called | N/A |
| `updateCycleRequestEvaluators`, flag unset | env var absent | `supabase.rpc("update_cycle_request_evaluators", ...)` called; manager spy not called | N/A |
| `finalizeCycleRequest`, flag `"true"` | env var set | `cyclesManager.closeRequest` spy called; `supabase.rpc("close_cycle_request", ...)` not called; `generateAiInterpretation` short-circuits to `null` (no `ANTHROPIC_API_KEY` in test env), `save_ai_interpretation` never reached | N/A |
| `finalizeCycleRequest`, flag unset | env var absent | `supabase.rpc("close_cycle_request", ...)` called; `cyclesManager.closeRequest` spy not called | N/A |
| Any of the above, flag `"false"` (string, not just unset) | env var literally `"false"` | same as unset -- old path runs | N/A |

</frozen-after-approval>

## Code Map

- `tests/integration/admin-members-auth-flag-toggle.test.ts` (Story 3.5) -- the exact technique to mirror: `vi.hoisted` manager mocks, hoisted fake `@/lib/supabase/server` client (`rpc` spy pushing call names to an array, `from()` minimal chainable builder, `auth.*` spies), `next/navigation`/`next/cache` mocks (redirect-throws-marker pattern), flag set/cleared per-test via `beforeEach`/`afterEach`.
- `src/app/actions/cycles.ts` (Story 3.10) -- exact `if (process.env.USE_NEW_API_CYCLES === "true") {...} else {...}` shape at all 6 call sites; the 4 chosen for this story: `createFeedbackCycle` (line ~34), `updateCycleRequestEvaluators` (line ~208), `finalizeCycleRequest` (line ~75, plus its unconditional `generateAiInterpretation`/`save_ai_interpretation` calls immediately after), `organizeCycleEvaluators` (line ~120, the AC's literal "organizes" scenario).
- `src/lib/aiInterpretation.ts` -- `generateAiInterpretation(supabase, requestId)`, confirmed to return `null` immediately when `ANTHROPIC_API_KEY` is unset, before any Supabase call -- this story's toggle test relies on this short-circuit, not a fake RPC response.
- `docs/feature-flags.md` (Story 3.5) -- exact structure to extend: `## USE_NEW_API_<DOMAIN>` subsections (Domain/Default/Where it's checked/New path/Old path/Regression test), then `### Manual QA checklist`/`### Rollback procedure`/`### Deletion eligibility`.
- `.env.example` (Story 3.5) -- exact comment style/format for the existing `USE_NEW_API_ADMIN_MEMBERS` entry, to mirror for `USE_NEW_API_CYCLES`.
- No `USE_NEW_API_CYCLES=true` anywhere in committed code/config (confirmed via repo-wide grep) -- stays that way after this story.

## Tasks & Acceptance

**Execution:**
- [x] `tests/integration/cycles-flag-toggle.test.ts` -- new -- proves flag routing for the 7 I/O-matrix scenarios above
- [x] `docs/feature-flags.md` -- extended -- new `## USE_NEW_API_CYCLES` section, same shape as the existing admin/members section
- [x] `.env.example` -- extended -- `USE_NEW_API_CYCLES=false`, same comment style as the existing entry

**Acceptance Criteria:**
- Given `npm run test` (no env var set beforehand), when it runs, then the new toggle test file's flag-unset scenarios pass, proving old-path routing is exercised by the normal test command.
- Given the same `npm run test` run, when the toggle test file sets `USE_NEW_API_CYCLES="true"` for its own flag-on scenarios (scoped to that file/test, not the whole suite), then those scenarios pass too.
- Given `docs/feature-flags.md` and `.env.example`, when read, then no instance sets or defaults the flag to `true`, and both are internally consistent about the flag's default (off).
- Given Stories 3.7-3.10's full test suites, when this story is complete, then they still pass unchanged.

## Implementation Notes

Three additive deliverables, exactly as scoped -- no line of `src/app/actions/cycles.ts`, `src/server/managers/cyclesManager.ts`, `src/server/db/cycles.ts`, or `src/app/api/cycles/**` touched (confirmed via `git status`/diff: only `.env.example`, `docs/feature-flags.md`, this spec file, `sprint-status.yaml`, and the new test file changed).

1. **`tests/integration/cycles-flag-toggle.test.ts`** (new) -- mirrors `tests/integration/admin-members-auth-flag-toggle.test.ts`'s (Story 3.5) technique: `vi.hoisted` mock of `@/server/managers/cyclesManager` (only the 4 exports the sampled call sites use: `createCycle`, `closeRequest`, `updateRequestEvaluators`, `organizeEvaluators`), a hoisted fake `@/lib/supabase/server` whose `rpc()` spy records call names into an array (no `.from()` needed -- none of the 4 sampled call sites' old or new paths read from a table), and the same "redirect-throws-a-marker" / no-op `revalidatePath` mocks for `next/navigation`/`next/cache`. 9 tests cover the full I/O matrix: `createFeedbackCycle` (flag `"true"`, unset, and literal `"false"` -- the third covering the matrix's "any of the above, flag false" row), `updateCycleRequestEvaluators` (flag `"true"`/unset), `finalizeCycleRequest` (flag `"true"`/unset), and `organizeCycleEvaluators` (flag `"true"`/unset -- the AC's literal "organizes" scenario). Confirmed the spec's own "Investigated" finding empirically: with `ANTHROPIC_API_KEY` deleted in `beforeEach`/`afterEach` (belt-and-suspenders, since no `.env.test.local` in this repo sets it either), `generateAiInterpretation` short-circuits to `null` before any RPC in both flag states, so `finalizeCycleRequest`'s tests assert `close_cycle_request`/`get_request_competency_comparison`/`save_ai_interpretation` were never reached by `supabase.rpc`, without needing to fake any AI-interpretation RPC response.
2. **`docs/feature-flags.md`** -- new `## USE_NEW_API_CYCLES` section added after the existing `USE_NEW_API_ADMIN_MEMBERS` section's Deletion eligibility subsection, same subsection order (Domain/Default/Where it's checked/New path/Old path/Regression test, then Manual QA checklist/Rollback procedure/Deletion eligibility). No "Verified safe to flip" subsection added, per the frozen Boundaries (that's Story 3.12's job). The Domain and Manual QA checklist subsections carry the higher-stakes framing epics.md's Story 3.11 AC calls for (cycles drive real invitations/responses and an irreversible finalize action), and the checklist explicitly calls out exercising all 6 call sites manually even though the automated toggle test only samples 4.
3. **`.env.example`** -- new `USE_NEW_API_CYCLES=false` entry appended immediately after the existing `USE_NEW_API_ADMIN_MEMBERS=false` entry, same comment style/structure (default, where checked, activation literal, pointer to `docs/feature-flags.md`).

Also updated `_bmad-output/implementation-artifacts/sprint-status.yaml`'s `3-11-cycles-feature-flag-and-rollback-safety` entry from `in-progress` to `done` (it had already been flipped to `in-progress` by the dispatch tooling before implementation started).

No deviations from the spec's frozen Intent/Boundaries/I-O matrix. No open questions.

## Spec Change Log

## Review Triage Log

**3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap):**

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | Spec's Implementation Notes claims `sprint-status.yaml` moved "from `in-progress` to `done`," but the actual diff shows `backlog` → `review`; frontmatter separately says `in-review` -- three different spellings of the same state | false | — | Self-referential timing artifact, identical to every prior story this session: the implementer's notes describe their own intermediate edit; the orchestrator subsequently reset the status before dispatching review, per this session's established convention. Independently flagged by both Blind Hunter and Verification Gap. |
| 2 | Only 3 of 6 flag-gated call sites get toggle coverage -- `organizeCycleEvaluators`, `createIndividualCycleRequest`, `updateIndividualCycleRequestEvaluators` rely solely on manual QA | n/a | defer | Deliberate, frozen-spec-scoped sampling ("a representative sample of 3 of the 6"), matching Story 3.5's own identical precedent (4 of 9 admin/members sites). Excluded by the intent itself, not an oversight. |
| 3 | `finalizeCycleRequest` (the "highest-risk function") never gets its literal-`"false"` behavior asserted, only `"true"`/unset | false | — | The `"false"` test proves the `=== "true"` string-comparison mechanism itself, which is identical code shape across all 6 functions -- testing it once (already done on `createFeedbackCycle`) provides no additional coverage value on a second function. Matches Story 3.5's own precedent of a single `"false"` spot-check, not one per sampled site. |
| 4 | epics.md's AC literally names "creates, organizes, or closes" as the 3 flag-on scenarios, but this story's second sample is `updateCycleRequestEvaluators`, not `organizeCycleEvaluators` -- the AC's own literal "organizes" case has no automated toggle coverage | medium | patch | Real, verified against epics.md's own AC text. Cheap to close: add `organizeCycleEvaluators` as a 4th sampled call site (keeping the existing 3, since `updateCycleRequestEvaluators` has its own value demonstrating the distinct `/gestionar` redirect shape). |
| 5 | The new `docs/feature-flags.md` section hands off equivalence verification to Story 3.12 via a cross-reference to "AD-3's documented cycle-specific list" (3 RPCs), but `db/cycles.ts` already wraps 8 -- doesn't flag that this staleness could trip up Story 3.12's own gate | low | rejected | Speculative concern about a future story's scope, not a defect in this diff's own deliverables -- Story 3.12 will be investigated fresh (same discipline as every prior story) when it's written, independent of what this doc says now. |
| 6 | Verification section's wording implies the new toggle test itself needs a live Supabase instance, when it's fully mocked -- the live-DB note actually applies to the other suites run in the same `npm run test` command | low | fixed directly | Real wording imprecision, non-frozen section, corrected directly. |
| 7 | New docs section calls closing a cycle request "the operator's" action, but the actual code/spec.md frame it as "quien pidió el 360" (the requester), not necessarily "the operator" in the platform-admin/Supervisor sense used elsewhere in the same doc | low | fixed directly | Real terminology imprecision, non-frozen section, corrected directly. |

No `intent_gap` or `bad_spec` entries -- no loopback triggered.

## Verification

**Commands:**
- `npm run test` -- **actual:** 14 test files, 243 tests, all passed (234 prior + 9 toggle tests, after the review's added `organizeCycleEvaluators` coverage). This story's own new file (`tests/integration/cycles-flag-toggle.test.ts`) is fully mocked and needs neither a live Supabase instance nor `ANTHROPIC_API_KEY` -- the local `npx supabase start` instance was needed only for the other, pre-existing suites that ran in the same `npm run test` invocation.
- `npm run lint` -- **actual:** 0 errors. 1 pre-existing warning in `scripts/seed-company-360.mjs` (`'idByEmail' is assigned a value but never used`), unrelated to this story and unchanged by it.
- `npx tsc --noEmit` -- **actual:** exit code 0, no output -- no type errors.
- Repo-wide grep for `USE_NEW_API_CYCLES=true` -- **actual:** only prose mentions in planning/spec docs and this story's own test file's scoped `process.env.USE_NEW_API_CYCLES = "true"` assignments inside individual `test()` bodies (cleared by `afterEach` every time); no committed `.env*`, config, or CI-equivalent file sets it to `true`.
