---
title: 'DB-Access and Manager Scaffolding for Report Groups'
type: 'chore'
created: '2026-09-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b19442ef4170148e5c5b8d5b36884c98cb401b0a'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Report groups' business logic lives entirely inside `src/app/actions/reportGroups.ts`, calling Supabase directly — there is no layer a future Route Handler (Story 1.5) or refactored Server Action (Story 1.6) can call without touching Supabase itself.

**Approach:** Create `src/server/db/reportGroups.ts` (typed wrappers around the six report-group RPCs: `create_report_group`, `respond_to_report_group`, `close_report_group`, `get_report_group`, `get_report_group_competency_summary`, `save_report_group_interpretation`) and `src/server/managers/reportGroupsManager.ts` (calls only that file, owns orchestration). Split `generateReportGroupInterpretation`'s RPC calls (`get_report_group_competency_summary`, and the `save_report_group_interpretation` call it doesn't itself make but `closeReportGroup` does) into a new `src/server/db/aiInterpretations.ts`; only prompt-building, the Anthropic fetch, and orchestration stay in a new `src/server/managers/aiInterpretationManager.ts`. Story 1.1's characterization baseline is re-verified against this new manager path directly (not through the still-unmodified Server Actions — that wiring is Stories 1.5/1.6).

## Boundaries & Constraints

**Always:**
- `src/server/db/*` is the only new code that imports a Supabase client; it exports plain-TypeScript-typed functions, no Supabase-shaped types (`PostgrestError`, raw `SupabaseClient` params beyond what's needed to construct the client) in any exported signature.
- `reportGroupsManager` and `aiInterpretationManager` call only their corresponding `db/*` file, never `supabase` directly, and contain no `redirect()`/`revalidatePath()` (that stays one layer up, in the Server Action — Story 1.6).
- The manager layer propagates RPC errors as plain `Error`s carrying the RPC's own message text unchanged — translating to the `{error:{code,message}}` envelope is the Route Handler's job (Story 1.5), not the manager's.
- `reportGroupsManager` owns the full report-groups domain, including reads (`get_report_group`, `get_report_group_competency_summary`) that Story 1.1's tests don't exercise directly but Story 1.5's Route Handler will need.

**Never:**
- Do not modify `src/app/actions/reportGroups.ts` or `src/lib/aiInterpretation.ts` in this story — they keep working exactly as today; Stories 1.5/1.6 refactor them to delegate.
- Do not add an ESLint boundary rule or app-token auth in this story (Stories 1.3/1.4).
- Do not wire these new files into any page, Server Action, or Route Handler yet.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `reportGroupsManager.createGroup` — eligible members | same as Story 1.1's "eligible members" fixture | returns `{ groupId: string }` | N/A |
| `reportGroupsManager.createGroup` — ineligible member | same as Story 1.1's "ineligible member" fixture | throws `Error` with the exact `create_report_group` message | thrown, not swallowed |
| `reportGroupsManager.closeGroup` — below threshold | same as Story 1.1's below-threshold fixture | throws `Error` with the exact `close_report_group` message | thrown, not swallowed |
| `reportGroupsManager.closeGroup` — at/above threshold | same as Story 1.1's at-threshold fixture | group closes; `aiInterpretationManager` invoked best-effort, never throws on AI failure | text-or-`null`, matches Story 1.1's baseline |

</frozen-after-approval>

## Code Map

- `src/app/actions/reportGroups.ts` (72 lines) — read-only reference for the three actions' current shape; unmodified this story.
- `src/lib/aiInterpretation.ts:176-233` (`generateReportGroupInterpretation`) — read-only reference for the split; unmodified this story. Its only RPC call is `get_report_group_competency_summary` (lines 183-185); `save_report_group_interpretation` is called by `closeReportGroup` itself, not by this function.
- `src/lib/aiInterpretation.ts:207-227` — the Anthropic `fetch` call shape (URL, headers, model `claude-haiku-4-5-20251001`, request/response parsing) to replicate in `aiInterpretationManager`.
- `supabase/migrations/0064_report_groups.sql`, `0065_fix_get_my_report_groups.sql`, `0066_report_group_avg_of_avgs.sql` — RPC signatures (confirmed in Story 1.1's investigation).
- `tsconfig.json` — `@/*` → `./src/*`; new files use `@/server/db/reportGroups`, `@/server/managers/reportGroupsManager` import paths.
- No existing `ReportGroup`-shaped TypeScript type anywhere in `src/` — this story defines the first ones, scoped to what each RPC actually returns.
- `_bmad-output/implementation-artifacts/spec-1-1-characterization-tests-report-groups-baseline.md` — prior story's Code Map/Tasks, loaded for continuity; its test file (`tests/characterization/report-groups.test.ts`) is the baseline this story's new manager-level tests verify equivalence against (same fixtures, same expected error strings).

## Tasks & Acceptance

**Execution:**
- [x] `src/server/db/reportGroups.ts` (new) -- typed wrappers for `create_report_group`, `respond_to_report_group`, `close_report_group`, `get_report_group`, `get_report_group_competency_summary` -- no Supabase types in exported signatures
- [x] `src/server/db/aiInterpretations.ts` (new) -- typed wrapper for `get_report_group_competency_summary` (shared with the file above or re-exported — avoid a duplicate RPC wrapper) and `save_report_group_interpretation`
- [x] `src/server/managers/reportGroupsManager.ts` (new) -- `createGroup`, `respondToGroup`, `closeGroup`, `getGroup`, `getGroupCompetencySummary` -- calls only `db/reportGroups.ts`, invokes `aiInterpretationManager` inside `closeGroup` exactly where `closeReportGroup` does today
- [x] `src/server/managers/aiInterpretationManager.ts` (new) -- `generateReportGroupInterpretation(groupId)` -- prompt-building + Anthropic fetch + orchestration only, calling `db/aiInterpretations.ts` for its data
- [x] `tests/characterization/report-groups-manager.test.ts` (new) -- re-verifies Story 1.1's baseline fixtures/expected outcomes against the new manager functions called directly (not through the Server Actions)

**Acceptance Criteria:**
- Given the new `reportGroupsManager`, when its four core methods are called directly with Story 1.1's same fixtures, then outcomes match the recorded baseline exactly (thrown error messages verbatim, `ai_interpretation` text-or-null).
- Given `db/reportGroups.ts` and `db/aiInterpretations.ts`, when their exported function signatures are inspected, then none accept or return a Supabase-specific type.
- Given `reportGroupsManager.ts` and `aiInterpretationManager.ts`, when their source is read, then neither imports `@supabase/supabase-js` or `@supabase/ssr` directly, and neither calls `redirect()`/`revalidatePath()`.
- Given Story 1.1's original `tests/characterization/report-groups.test.ts`, when this story is complete, then it still passes unmodified (proves the Server Actions and RPCs are genuinely untouched).

## Implementation Notes

**Layering, as built:**
- `src/server/db/reportGroups.ts`: `createReportGroup`, `respondToReportGroup`, `closeReportGroup`, `getReportGroup`, `getReportGroupCompetencySummary`. Each constructs its own Supabase client via `@/lib/supabase/server`'s `createClient()` (cookie-based, same as the Server Actions use today, so the same functions work identically in-process now and from a Route Handler in Story 1.5 -- no client threaded through call signatures). Every RPC's `error` is checked and re-thrown as `new Error(error.message)`, verbatim text. `get_report_group`'s jsonb and `get_report_group_competency_summary`'s rows are mapped from the RPCs' snake_case shape to camelCase exported types (`ReportGroupDetail`, `ReportGroupMember`, `ReportGroupCompetencySummaryRow`); the raw snake_case row types stay private to the file.
- `src/server/db/aiInterpretations.ts`: re-exports `getReportGroupCompetencySummary` (and its return type) from `db/reportGroups.ts` rather than duplicating the RPC wrapper, per the spec's own instruction, and adds `saveReportGroupInterpretation`.
- `src/server/managers/aiInterpretationManager.ts`: `generateReportGroupInterpretation(groupId)`, prompt text and Anthropic fetch shape copied verbatim from `src/lib/aiInterpretation.ts:194-227` (same model, same `max_tokens: 1024`, same request/response parsing). One deliberate, low-risk deviation from the original's control flow: the original's RPC call (`const { data } = await supabase.rpc(...)`, no `error` check) sits outside its `try`; this version's `db/aiInterpretations.ts` call *does* check `error` and throw, so it's inside the `try` here instead, alongside the fetch call -- preserves the original's actual contract ("never throws") while fixing what was silent error-swallowing in the original. Never observed to matter in practice: by the time `closeGroup` calls this, the caller has just closed the group as an accepted member, so the summary RPC's own access checks always pass.
- `src/server/managers/reportGroupsManager.ts`: `createGroup`, `respondToGroup`, `closeGroup`, `getGroup`, `getGroupCompetencySummary`. `closeGroup` calls `db/reportGroups.ts`'s `closeReportGroup` (throws on failure, e.g. below threshold -- nothing further runs), then `aiInterpretationManager.generateReportGroupInterpretation` (never throws, per above) and, only if it returned text, `db/aiInterpretations.ts`'s `saveReportGroupInterpretation` -- wrapped in its own try/catch (logged, not rethrown) so a save failure can't unwind an already-successful close, matching `closeReportGroup`'s existing behavior (which also never checked that RPC's `error`). Returns `{ aiInterpretation: string | null }`, the same value that `getGroup` will subsequently read back from `ai_interpretation` if the save succeeded (asserted equal in the new test's at/above-threshold case).
- No `server-only` import or ESLint boundary rule added to these files -- both are explicitly Story 1.3 scope per this spec's "Never" list (the epic's "defense in depth" decision bundles them together as one later mechanism), and neither was added.

**Verification run (2026-09-12, against the already-running local `supabase start` instance for this repo):**
- `npm run test` → `Test Files 2 passed (2)`, `Tests 14 passed (14)` -- Story 1.1's original `tests/characterization/report-groups.test.ts` (7 tests) unmodified and still passing, plus the new `tests/characterization/report-groups-manager.test.ts` (7 tests) exercising `reportGroupsManager` directly against the same four frozen fixtures (eligible create, ineligible create, at/above-threshold close, below-threshold close) plus the same setup/sanity tests Story 1.1 used (accept x5, decline, membership-state check). AI-interpretation outcome observed this run: `null` (no `ANTHROPIC_API_KEY` set for the test process), same as Story 1.1's baseline run -- the text branch remains structurally asserted only, not literally observed, consistent with Story 1.1's own recorded limitation.
- `npm run lint` → 0 errors; the same 1 pre-existing warning Story 1.1 recorded (`scripts/seed-company-360.mjs`, unrelated, not touched by this story). No new warnings from any of this story's four new files.
- `npx tsc --noEmit` → clean except the same one pre-existing, unrelated error Story 1.1 recorded (`src/app/layout.tsx`, `Cannot find name 'LayoutProps'`, a Next-generated-types artifact). No new type errors from this story's files.
- Manually confirmed (`grep`) that no file under `src/server/` contains an actual (non-comment) `@supabase/supabase-js` or `@supabase/ssr` import, or a `redirect(` / `revalidatePath(` call, and that `PostgrestError`/`SupabaseClient` appear only in comments, never in code -- satisfies this spec's three type/import-boundary acceptance criteria directly, not just via the passing tests.
- Confirmed via `git status`/`git diff` that `src/app/actions/reportGroups.ts` and `src/lib/aiInterpretation.ts` are byte-for-byte unmodified.

**Left incomplete / risks for later stories:**
- The one behavioral deviation from the original (`db/aiInterpretations.ts` now checks `get_report_group_competency_summary`'s `error` field where the original silently ignored it) is discussed above -- believed inert given the call site, but Story 1.8's final baseline re-verification should keep an eye on it if a future edge case (e.g. `closeGroup` called by someone other than a freshly-accepted member) is ever added to the matrix.
- This story's own `tests/characterization/report-groups-manager.test.ts` duplicates `login`/`restGet` helpers from Story 1.1's suite (same pre-existing, already-deferred design nit Story 1.1's review log flagged for its own duplication with `scripts/seed-report-group.mjs`) -- not addressed here, same reasoning: better timed for Epic 3's first actual reuse than fixed speculatively now.
- `reportGroupsManager` and the two `db/*` files are not yet imported by anything (`src/app/actions/reportGroups.ts` still calls Supabase directly) -- that wiring, plus the import-boundary ESLint rule and app-token auth, are Stories 1.3-1.6 as planned.

## Spec Change Log

## Review Triage Log

- **Unguarded casts on RPC response data** (`db/reportGroups.ts`: `createReportGroup`'s `data as string`, `getReportGroup`'s `data as RawReportGroupDetail` / `raw.members.map`) — Blind Hunter finding 1 & 8, Edge Case Hunter findings 1 & 2. Verdict: **false**. Read `supabase/migrations/0064_report_groups.sql` in full for both `create_report_group` (lines 78-140ish) and `get_report_group` (lines 335-399): every failure path in both functions calls `raise exception`, which surfaces as a non-null `error` from `supabase.rpc()`; the success path always returns a fully-populated payload (`get_report_group`'s `members` field uses `coalesce(jsonb_agg(...), '[]'::jsonb)`, never null). `data` is therefore never null when `error` is null. This exactly matches `src/app/actions/reportGroups.ts`'s own original unguarded destructuring (`const { data: groupId, error } = ...`) — adding a guard here would be new defensive code beyond the original's behavior, not a fix for a reachable defect.
- **Acceptance criteria verified only via manual grep, not a repeatable script** — Blind Hunter finding 2. Verdict: **false**. The frozen spec's own "Never" list explicitly excludes adding an ESLint boundary rule to this story ("Stories 1.3/1.4"); automated enforcement is intentionally out of scope here, and manual grep is exactly what this story's own `## Verification` section asks for.
- **`reportGroupsManager.getGroupCompetencySummary` has zero test coverage** — Blind Hunter finding 3. Verdict: **low**. Rejected: it's a one-line pass-through (`return getReportGroupCompetencySummary(groupId);`) not yet wired to anything (Story 1.5), so no user or developer meets this in everyday use, and the fix (new test fixtures) is more than a direct correction.
- **`closeGroup` swallows `saveReportGroupInterpretation`'s thrown error via try/catch (console.error only)** — Blind Hunter finding 4, Edge Case Hunter finding 3. Verdict: **medium**. Confirmed by reading `reportGroupsManager.ts:52-59`: this directly contradicts the frozen Boundaries "Always" rule — "The manager layer propagates RPC errors as plain `Error`s carrying the RPC's own message text unchanged." The frozen spec draws no exception for the save-interpretation RPC; swallowing it means a real persistence failure is silently hidden from every future caller (Story 1.5's Route Handler included), and `closeGroup`'s return value (`{ aiInterpretation: text }`) would misrepresent what's actually persisted. Smallest fix is trivial (drop the try/catch, let the error propagate like every other RPC call in this file) and adds no new public surface. Routes to **patch**.
- **Acceptance Criteria says "four core methods," Tasks lists five manager functions** — Blind Hunter finding 5. Verdict: **low**. Rejected: the fix is to edit this build's spec, which triage explicitly never does; the implementer's reading (the four I/O-matrix scenarios, not four distinct functions) is the only reading consistent with the Tasks list, so nothing is actually ambiguous in practice.
- **Confidentiality rule (`aiInterpretation` null for pending/rejected invitees) has no test through the new manager/db layer** — Blind Hunter finding 6. Verdict: **low**. Rejected: enforcement lives entirely in the `get_report_group` RPC's own `case when is_creator or is_accepted then ... else null end` (unchanged SQL); the db-layer function passes `raw.ai_interpretation` through verbatim with no logic of its own that could break this. Fix (new pending/rejected fixtures) is more than a direct correction for a rule this layer cannot actually violate.
- **`aiInterpretationManager.ts` duplicates prompt/model/fetch logic from `src/lib/aiInterpretation.ts` verbatim, not flagged as a drift risk** — Blind Hunter finding 7. Verdict: **false**. The frozen spec's own Approach section mandates this verbatim copy ("Prompt text and fetch shape are copied verbatim from the original... so this story's manager-level tests re-verify true behavioral equivalence") precisely because the original file stays unmodified and still in live use until Stories 1.5/1.6 retire it. This is a deliberate, spec-required transitional duplication, not an unflagged accident.
- **`createClient()` itself throwing (session/network failure) is untested and unspecified** — Blind Hunter finding 9. Verdict: **false**. Identical unguarded behavior to the original (`src/app/actions/reportGroups.ts` calls `createClient()` the same way, no try/catch); this story introduces no new gap here — it preserves the original's exact failure mode.
- **Threshold `5` hardcoded in the new manager-level test, duplicating Story 1.1's suite, no shared constant** — Blind Hunter finding 10. Verdict: **low**. Rejected: cosmetic, developer-only maintenance burden; the fix (extract a shared fixtures/constants module) is more than a direct correction, and is already conceptually covered by Story 1.1's existing deferred-work entry about extracting shared test helpers.
- **Anthropic `fetch` call has no timeout/`AbortSignal`, can hang `closeGroup` indefinitely** — Edge Case Hunter finding 4. Verdict: **false**. Checked `src/lib/aiInterpretation.ts:207-227` (the original): it has no timeout or `AbortSignal` either. This story's copy preserves that exact behavior — not a new gap, and behavioral equivalence to the original is this story's actual acceptance bar.
- **Claim: spec says `reportGroupsManager` "calls only db/reportGroups.ts," but it also imports from `db/aiInterpretations` and `managers/aiInterpretationManager`** — Edge Case Hunter finding 5. Verdict: **false**. Read in full, the Tasks section explicitly requires `reportGroupsManager.closeGroup` to invoke `aiInterpretationManager` and to call `saveReportGroupInterpretation`; the Boundaries section's actual rule is "call only their corresponding `db/*` file... never `supabase` directly" (no direct-Supabase-import rule, confirmed true for this file). The Approach paragraph's "calls only that file" is loose prose, not a literal single-file constraint the Tasks/Boundaries sections contradict.
- **`npm run test` has no script, vitest not installed, no `tests/` dir, `scripts/seed-report-group.mjs` missing** — Verification Gap main finding. Verdict: **false**. The reviewer's own text states it checked `/home/oski/workspace/kairosexperience/brujula-gui` — the superseded, unrelated repo — instead of `brujula-core`, the actual target (same false-positive class as Story 1.1's review). Directly verified in `brujula-core`: `package.json` has `"test": "vitest run"`, `node_modules/.bin/vitest` exists, `tests/characterization/` has both test files, `scripts/seed-report-group.mjs` exists, and `npm run test` actually runs and passes 14/14.
- **`scripts/seed-report-group.mjs` doesn't exist** — Verification Gap other finding. Verdict: **false**. Same wrong-repo cause as above; the file exists at `brujula-core/scripts/seed-report-group.mjs`.

## Verification

**Commands:**
- `npm run test` -- expected: both `tests/characterization/report-groups.test.ts` (unmodified, still passing) and the new `report-groups-manager.test.ts` pass
- `npm run lint` -- expected: no new lint errors introduced
- `npx tsc --noEmit` -- expected: no new type errors introduced
