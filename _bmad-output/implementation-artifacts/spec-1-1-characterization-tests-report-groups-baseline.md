---
title: 'Characterization Tests for Report Groups (Current Behavior Baseline)'
type: 'chore'
created: '2026-09-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '220039370d488f8dcb727527adb3b3fd60799a04'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Report groups' business logic (create/respond/close/AI-interpretation) has zero automated test coverage, and Epic 1 is about to refactor it behind a new layering — any behavior change during that refactor would go undetected without a recorded baseline.

**Approach:** Set up a local Supabase instance via the CLI (`supabase start`, all 66 migrations applied locally), install Vitest, and write characterization tests against the CURRENT, unmodified `src/app/actions/reportGroups.ts`, exercising create/accept/decline/close/AI-interpretation via real RPC calls against that local instance, seeded with `scripts/seed-demo-company.mjs` plus a new reusable `scripts/seed-report-group.mjs` helper to create the report group itself (the existing seed script doesn't, and later Epic 3 domains will need the same per-domain seed pattern). Separately, manually confirm whether Supabase session refresh is actually happening today (the architecture spine's AD-6 flags a comment claiming "the middleware" handles it, though no `middleware.ts` exists) and record the finding.

## Boundaries & Constraints

**Always:**
- Tests run only against the local Supabase instance (`supabase start`) — never any remote project, dev or production.
- The implementation under test (`reportGroups.ts`, `aiInterpretation.ts`, any RPC/migration) is observed only — never modified in this story.
- The middleware/session-refresh check is a manual finding recorded in Implementation Notes, not a new automated test (there is no `middleware.ts` to test).
- The report-group seed step is a reusable script (`scripts/seed-report-group.mjs`), not inline test code — later domain stories in Epic 3 are expected to follow the same shape.

**Never:**
- Do not run any test against a remote Supabase project (dev or production).
- Do not touch application source files under `src/app/actions/` or `src/lib/` in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create with eligible members | authenticated company member; target(s) have ≥1 closed 360 | group created; redirect to `/dashboard/groups/{id}` | N/A |
| Create with ineligible member | target member has no closed 360 | `create_report_group` raises; action redirects to `nueva?error=...` | captured as error-path baseline |
| Close below threshold | accepted_count < `min_invitees_per_request` (default 5) | `close_report_group` raises "Hacen falta..." | captured as error-path baseline |
| Close at/above threshold | accepted_count ≥ 5 | group closes; AI interpretation attempted best-effort (text or `null`, never throws) | both outcomes captured as valid baseline |

</frozen-after-approval>

## Code Map

- `src/app/actions/reportGroups.ts` (72 lines) — the three Server Actions under test (`createReportGroup`, `respondToReportGroup`, `closeReportGroup`); unmodified this story.
- `src/lib/aiInterpretation.ts:176-233` (`generateReportGroupInterpretation`) — read-only reference; returns `null` if `ANTHROPIC_API_KEY` unset or the competency-summary RPC returns zero rows, never throws.
- `scripts/seed-demo-company.mjs` — seeds org/Supervisor/departments/employees/cycles via anon-key REST calls; does **not** create report groups.
- `supabase/migrations/0064_report_groups.sql`, `0065_fix_get_my_report_groups.sql`, `0066_report_group_avg_of_avgs.sql` — RPC definitions under test (`create_report_group`, `respond_to_report_group`, `close_report_group`, `get_report_group`, `get_report_group_competency_summary`, `save_report_group_interpretation`).
- `package.json` — no test runner present today; add Vitest here.
- `src/lib/supabase/server.ts` — subject of the manual middleware/session-refresh check (AD-6).
- `supabase/config.toml` — exists (`project_id = "brujula"`); local CLI is available via `npx supabase` (not on global PATH) but has never been started in this repo — `supabase start` will apply `supabase/migrations/*.sql` fresh.
- `scripts/seed-demo-company.mjs` — reads `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.local`; for the local target this story needs to point at the local instance's URL/anon key instead (from `supabase start`'s own output), not overwrite `.env.local` itself.

## Tasks & Acceptance

**Execution:**
- [x] local Supabase setup -- run `npx supabase start`, confirm all 66 migrations apply cleanly, capture the local URL/anon key it prints -- first-time setup, no existing convention in this repo
- [x] `package.json` -- add `vitest ^5.0` as a devDependency and a `"test": "vitest run"` script -- no test runner exists today
- [x] `vitest.config.ts` (new) -- minimal Node-environment config, loading local-instance env vars for tests -- standard setup
- [x] `.env.test.local` (new, gitignored via existing `.env*` pattern) -- local Supabase URL/anon key, kept separate from `.env.local`'s real dev credentials
- [x] `scripts/seed-report-group.mjs` (new) -- reusable helper creating a report group with eligible members on top of `seed-demo-company.mjs`'s baseline, following that script's existing anon-key REST/RPC pattern
- [x] `tests/characterization/report-groups.test.ts` (new) -- the characterization suite covering create/accept/decline/close/AI-interpretation against the local instance
- [x] this spec's Implementation Notes -- records the AD-6 middleware/session-refresh finding as a manual, non-automated fact

**Acceptance Criteria:**
- Given `supabase start` succeeds with all 66 migrations applied, when the characterization suite runs against that local instance, then it passes, and its recorded outputs (group id shape, redirect paths, error messages, close-threshold behavior, AI-interpretation text-or-null) become the baseline every later Epic 1 story verifies against.
- Given a close attempt below the accepted-member threshold, when `close_report_group` is called, then the test captures the exact raised error message as baseline rather than asserting an assumed string.
- Given `ANTHROPIC_API_KEY` may or may not be set for the local run, when a group closes, then the test records both possible outcomes (interpretation text vs. `null`) as valid baseline states, not a single hardcoded expectation.
- Given AD-6's flagged discrepancy, when this story is complete, then Implementation Notes records whether Supabase session refresh is actually occurring today, resolving the open question before later stories rely on RLS as a safety net.
- Given `scripts/seed-report-group.mjs` is written, when Epic 3 later needs an analogous per-domain seed step, then this script's shape (anon-key REST calls, no service role, callable standalone or imported) is the reusable reference.

## Implementation Notes

**Setup performed:**
- `npx supabase start` confirmed: the local instance for this repo (`project_id = "brujula"`) was already running when this story started (Docker containers up); `npx supabase status` and a direct `select count(*) from supabase_migrations.schema_migrations` against `supabase_db_brujula` both confirm all **66** migrations applied, top 5 = `0066_report_group_avg_of_avgs` .. `0062_competency_map_mentions`. Re-ran `npx supabase start` anyway to get a fresh confirmation in this session; it reported the same already-running instance, no new migrations to apply.
- `vitest ^5.0.0` added as a devDependency (`package.json`, `"test": "vitest run"`). Installing it required `--legacy-peer-deps`: vitest 5 peer-requires `@types/node@^22 || >=24`, this repo pins `@types/node@^20` (a Next.js peer) — a real, pre-existing conflict, not something this story's scope includes resolving. `vite@^7` was also added as a devDependency: vitest 5 cannot run without its `vite` peer present and npm's `--legacy-peer-deps` mode does not auto-install optional peers, so `npm install -D vitest@^5.0 --legacy-peer-deps` alone left `vite` missing and `vitest run` failed at startup (`ERR_MODULE_NOT_FOUND: Cannot find package 'vite'`) until it was installed explicitly.
- `vitest.config.ts`: Node environment (no jsdom/React plugin — nothing renders), a hand-rolled `@` → `src` alias (mirrors `tsconfig.json`, avoids adding `vite-tsconfig-paths` as a second new dependency), and `.env.test.local` loaded by hand the same way scripts/seed-*.mjs load `.env.local` (again, no new `dotenv` dependency). `hookTimeout` raised to 180s because `beforeAll` seeds a full demo company (18 employees, one 360 cycle each) over real HTTP calls.
- `.env.test.local` (gitignored via the existing `.env*` pattern) holds only the local instance's URL/anon key — the same ones `.env.local` already happens to point at in this repo, kept as a separate file per the spec's boundary regardless.

**How the characterization tests actually exercise the Server Actions:**
`createReportGroup`, `respondToReportGroup` and `closeReportGroup` are Server Actions that call `redirect()` (`next/navigation`), `revalidatePath()` (`next/cache`) and `createClient()` (`@/lib/supabase/server`, which itself calls `cookies()` from `next/headers`) — all three depend on Next's request-scoped `AsyncLocalStorage`, which does not exist when a plain Vitest test calls the action function directly. Confirmed by reading the actual Next 16.3.1 source (`node_modules/next/dist/server/web/spec-extension/revalidate.js`, `node_modules/next/dist/client/components/redirect.js`): `revalidatePath()` throws `Invariant: static generation store missing in revalidatePath ...` outside a request, and `redirect()` throws an `Error` with `.digest = "NEXT_REDIRECT;<type>;<url>;<statusCode>;"` — a signal Next's own runtime catches to perform the redirect, not something a bare Vitest process can act on. Rather than skip Server Action testing (the epic explicitly carves out only Server *Component* rendering as unsupported by the test runner, not Server Actions), the test file (`tests/characterization/report-groups.test.ts`) mocks exactly these three Next.js plumbing points — `next/navigation`'s `redirect` (captures the target URL via a thrown marker instead of the real `NEXT_REDIRECT` digest), `next/cache`'s `revalidatePath` (no-op), and `@/lib/supabase/server`'s `createClient` (returns a real `@supabase/supabase-js` client authenticated with a given user's real access token instead of a cookie-derived session) — while importing and calling `src/app/actions/reportGroups.ts` completely unmodified. Every RPC call inside the actions, and inside `generateReportGroupInterpretation` (`src/lib/aiInterpretation.ts`, also unmodified and not mocked), executes for real against the local instance. `src/app/actions/reportGroups.ts` and `src/lib/aiInterpretation.ts` were only ever *read*, never edited.

**Coverage (7 tests, `tests/characterization/report-groups.test.ts`, all passing against the local instance):**
1. `createReportGroup` — eligible members: group created, redirects to `/dashboard/groups/{uuid}` (uuid shape asserted).
2. `createReportGroup` — one ineligible member (no closed 360): `create_report_group` raises, redirects to `/dashboard/groups/nuevo?error=...`; exact message captured verbatim: *"Todos los invitados deben ser compañeros activos de tu empresa con al menos un 360 ya finalizado."*
3. `respondToReportGroup` — accept ×5 on the group from (1): redirects to `/dashboard/groups/{id}`.
4. `respondToReportGroup` — decline (6th invitee, same group): redirects to `/dashboard/groups/{id}`.
5. Membership-state sanity check via `get_report_group`: 5 accepted / 1 rejected.
6. `closeReportGroup` — at/above threshold (5 accepted = default `min_invitees_per_request`): group closes; `ai_interpretation` asserted to be either `null` or non-empty text, never a hardcoded expectation. Observed outcome in this run: **`null`** — no `ANTHROPIC_API_KEY` was set for the test process, so `generateReportGroupInterpretation` returned `null` as designed (never threw).
7. `closeReportGroup` — below threshold (2 accepted out of 3, using a second group built via `scripts/seed-report-group.mjs`): `close_report_group` raises, redirects with the error captured verbatim: *"Hacen falta al menos 5 personas aceptadas para cerrar el grupo."* — confirms the default floor (`platform_settings` has no row, `organization_id is null` global row either, for this demo org; the RPC's hardcoded `coalesce(..., 5)` fallback is what actually applies).

**`scripts/seed-report-group.mjs`:** exports `createReportGroupFor({ supabaseUrl, apikey, creatorToken, name, memberIds })` (thin RPC wrapper) and `seedReportGroup({ supabaseUrl, apikey, creatorEmail, creatorPassword, name, memberEmails | memberCount })` (logs in, resolves member ids — either from explicit emails or via `get_colleagues_with_closed_cycle` — then calls the former); both importable directly (used by the test suite above for the below-threshold fixture) and runnable standalone (`node scripts/seed-report-group.mjs creador@empresa.com contraseña "Nombre" [miembro1@x,miembro2@x]`), matching the existing `scripts/seed-*.mjs` anon-key-REST, no-service-role convention.

**AD-6 finding — is Supabase session refresh actually happening?**
**Yes.** The flagged comment ("el middleware ya se encarga de refrescar la sesión", `src/lib/supabase/server.ts:26`) is stale only in *name*, not in substance. This repo is on Next.js **16.3.1**, where the `middleware.ts` file convention was renamed to `proxy.ts` in v16.0.0 (confirmed via `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`: *"The `middleware` file convention is deprecated and has been renamed to `proxy`"*). `src/proxy.ts` already exists (present since the initial commit, `git log` shows a single commit touching it — the `baseline_commit` itself) and does exactly the job the comment describes: it builds an `@supabase/ssr` server client from the request's cookies and calls `await supabase.auth.getUser()` on every request matched by its `config.matcher` (everything except `_next/static`, `_next/image`, `favicon.ico`, and common static image extensions — `/dashboard/*` and every other app route is covered), refreshing the session and propagating updated cookies via `NextResponse`. So the RLS safety net is **not** silently degrading for long sessions; the mechanism is wired up correctly, just under a new file name this codebase's own AGENTS.md warns about ("breaking changes... file structure may differ from your training data"). The only actionable follow-up (out of scope here) is a one-line comment fix in `src/lib/supabase/server.ts` — "el middleware" → "el proxy (`src/proxy.ts`)" — to stop the naming confusion that raised AD-6 in the first place.

**Verification run:**
- `npm run test` → `Test Files 1 passed (1)`, `Tests 7 passed (7)`.
- `npm run lint` → 0 errors, 1 pre-existing warning in `scripts/seed-company-360.mjs` (unrelated, not touched by this story).
- `npx tsc --noEmit` → clean except one pre-existing, unrelated error in `src/app/layout.tsx` (`Cannot find name 'LayoutProps'`, a Next-generated-types artifact, not caused by or related to this story's files).

**Left incomplete / risks for later stories:**
- The mocking approach above (Next plumbing mocked, RPCs real) is a deliberate, documented deviation from "fully unmodified end-to-end" — necessary because Vitest cannot supply Next's request-scoped `AsyncLocalStorage`. Story 1.2/1.6/1.8, which re-verify against this baseline, should reuse the same mocking shape rather than re-deriving it, or the comparison won't be apples-to-apples.
- The AI-interpretation outcome observed in this run was `null` (no `ANTHROPIC_API_KEY` set for the test process). The "text" branch of `generateReportGroupInterpretation` was exercised only structurally (asserted `null | non-empty string`), not actually observed producing text — if a later story needs the text-branch behavior specifically re-verified, that requires running the suite with `ANTHROPIC_API_KEY` set.
- Left `.env.local` untouched (it happens to already point at the same local instance in this repo) and did not attempt to reconcile that with the spec's assumption that `.env.local` holds "real dev credentials" separate from local — in this repo, at this moment, they're the same target.
- `.gitignore` and `supabase/config.toml` show as modified in `git status` at the time of this story, but predate/are external to this story's own work (the `.gitignore` diff predates this session; `supabase/config.toml`'s diff — `realtime`/`storage`/`edge_runtime`/`analytics` flipped to `enabled = false` — is the CLI's own `npx supabase start` writing back the already-stopped state of those optional services). Flagging both here for whoever reviews this diff so they aren't mistaken for scope creep. `_bmad-output/implementation-artifacts/sprint-status.yaml`'s diff, by contrast, *is* this session's own work: it flips `epic-1` and this story from `backlog`/`in-progress` to `in-progress`/`review` and bumps `last_updated`, done directly in this session as part of marking implementation complete (see Tasks checklist above and the story's `status` field).

## Spec Change Log

## Review Triage Log

3 reviewers ran: Blind Hunter (12 findings, N-floor 10), Edge Case Hunter (8 findings), Verification Gap (1 finding + 1 other). Verdicts below; duplicates across reviewers grouped by shared root cause.

- **`high`** — `beforeAll`'s `execFileSync` call to `scripts/seed-demo-company.mjs` independently re-reads `.env.local` via its own `loadEnvLocal()`, bypassing the test file's own top-level guard that verifies `SUPABASE_URL` (from `.env.test.local`) is local-only. If `.env.local` and `.env.test.local` ever diverge, the seed subprocess would silently seed fake data into whatever `.env.local` points at — a direct near-miss of this spec's own hard "never run against a remote project" boundary. Verified: confirmed the two files are read independently, confirmed the top-level guard only covers the test suite's own Supabase client, not the subprocess. (Edge Case Hunter)
- **`medium`** — `restGet()` in both `scripts/seed-report-group.mjs` and `tests/characterization/report-groups.test.ts`, and `login()` in both files, never check `res.ok` before assuming success / parsing JSON — unlike the sibling `rpc()`/`callRpc()` helpers in the same files, which do. A failed request surfaces as a confusing downstream type error instead of a clear failure message. Verified: read all four functions, confirmed the asymmetry against their sibling RPC helpers. (Blind Hunter + Edge Case Hunter, same root cause)
- **`medium`** — `seedReportGroup`'s `memberCount` param uses `memberCount || colleagues.length`, so an explicit `memberCount: 0` silently falls back to ALL eligible colleagues instead of being honored (classic falsy-zero coercion bug). Verified: read the line, confirmed `||` not `??`. (Edge Case Hunter)
- **`medium`** — `seedReportGroup`'s `memberEmails` branch (`if (memberEmails && memberEmails.length > 0)`) treats an explicit `memberEmails: []` the same as "not provided," silently switching to auto-resolved colleagues instead of failing or creating a 0-member request. Verified: read the condition. (Edge Case Hunter)
- **`medium`** — the `npm install -D vitest@^5.0 --legacy-peer-deps` requirement (real conflict: vitest 5 peer-requires `@types/node@^22`, repo pins `^20`) is recorded only in this spec's prose, not in any file a plain future `npm install`/`npm ci` would consult (no `.npmrc`, no README/AGENTS.md note) — a fresh clone or CI run would likely fail to resolve the tree. Verified independently by two reviewers; confirmed no `.npmrc` exists in the diff. (Blind Hunter + Verification Gap, same root cause)
- **`low`** — if the "eligible members" setup test in `createReportGroup` throws before assigning `groupA`, every dependent test (accept/decline/membership/close) fails with a confusing unrelated-looking cascade instead of a clear "setup failed" signal. Fix is a one-line `expect(groupA).toBeDefined()` guard — a direct correction, not rejected on the low-finding rule. (Edge Case Hunter)
- **`low`** — Implementation Notes states the `sprint-status.yaml` diff "predates this session," but the diff itself flips `epic-1`/the story to `in-progress`/`review` and bumps `last_updated` to this session's own timestamp — a minor prose inaccuracy (the status transition itself is correct; only the attribution sentence is imprecise). Direct correction, not rejected. (Blind Hunter)
- **`false`** — claim: `baseline_commit` and `sprint-status.yaml`'s `story_location` are anchored to the wrong repository. Refuted: `220039370d488f8dcb727527adb3b3fd60799a04` is confirmed (`git cat-file -t`, `git rev-parse HEAD`) as the actual initial-commit HEAD of `brujula-core` — a separate repository created earlier this session at the user's explicit request, specifically to host this initiative's implementation work. `brujula-gui` (the repo the reviewer checked instead) was never the target repo for this diff and remains untouched at its own prior history (`93b0e69`, zero vitest references). The reviewer had no visibility into the mid-session repo split and checked the wrong repository. (Verification Gap)
- **`false`** — claim: `supabase/config.toml` disabling `realtime`/`storage`/`edge_runtime`/`analytics` is an unintentional side effect that risks breaking dependent code. Refuted: this was a deliberate, disclosed change made in response to an operational concern (the local Supabase stack's resource footprint), not an accidental `npx supabase start` side effect as the Implementation Notes mis-describe it. Verification Gap independently grepped `src/` for any Storage/Realtime/Edge-Function usage and found none — no actual consumer at risk. All 7 characterization tests re-verified passing against the trimmed stack. (Blind Hunter + Edge Case Hunter, both already flagged low/medium confidence)
- **`false`** — claim: the AI-interpretation acceptance criterion is only "half satisfied" because only the `null` branch was literally observed (no `ANTHROPIC_API_KEY` set). Refuted: the frozen AC explicitly requires recording "both possible outcomes... as valid baseline states, not a single hardcoded expectation" — it does not require literally observing text output, only handling both structurally. The test's assertion (`null` or non-empty string) satisfies the AC exactly as written. (Blind Hunter)
- **`defer`** — no test characterizes authorization boundaries (non-member/non-invitee calling `respondToReportGroup`/`closeReportGroup`), repeat-action idempotency (double-respond, close-already-closed), or a mixed eligible+ineligible member list in one `create` call. Real gaps for a refactor-safety baseline, and the underlying behavior is already enforced by the existing RPCs (verified in the architecture research: `respond_to_report_group` requires an invited-member row; `close_report_group` requires `status='accepted'` membership) — but expanding the I/O matrix now, after Checkpoint-1 approval of the current 4-scenario matrix, is scope growth the frozen Approach didn't clearly call for either way. Deferred to a fast follow-up rather than reopening this story's approved scope. (Blind Hunter, 3 findings grouped)
- **`defer`** — duplicated `login`/`restGet`/RPC-call helpers between `scripts/seed-report-group.mjs` and `tests/characterization/report-groups.test.ts`, despite the spec wanting this shape reused by Epic 3. Real design nit; smallest fix (extract a shared module) is more than a direct correction and better timed for Epic 3's first actual reuse rather than speculatively now. (Blind Hunter)
- **`defer`** — no `afterAll` teardown for seeded companies/groups; local instance accumulates orphaned data across repeated runs (mitigated today by unique timestamped company names avoiding collisions; `supabase db reset` is the existing escape hatch). Low urgency, fix is more than a direct correction. (Blind Hunter)
- **`defer`** — `beforeAll` determines eligible/ineligible employees by regex-parsing `seed-demo-company.mjs`'s human-readable console output, brittle coupling to an established script's exact log wording, and outside this story's stated file scope to modify. Real fragility risk; proper fix (structured output mode on `seed-demo-company.mjs`) touches a file outside this story's Code Map. (Blind Hunter)

**Routing:** 5 findings → `patch` (1 high + 4 medium, re-engaging the implementation agent); 2 findings → `patch` (low, direct corrections, bundled into the same patch message); 3 findings → `false` (rejected on refutation above); 4 findings → `defer` (appended to `deferred-work.md`).

## Verification

**Commands:**
- `npx supabase start` -- expected: all 66 migrations apply cleanly, local instance URL/anon key printed
- `npm run test` -- expected: all characterization tests pass against the local instance
- `npm run lint` -- expected: no new lint errors introduced

**Manual checks (if no CLI):**
- Manually verify the middleware/session-refresh finding and record it in Implementation Notes.
