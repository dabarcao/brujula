---
title: 'Report Groups Route Handler and Client Fetch Wrapper'
type: 'feature'
created: '2026-09-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '89d80281466b6f3d5e2f234841eec596bb6e9499'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `reportGroupsManager` (Story 1.2) and `requireApiToken` (Story 1.4) both exist but nothing connects them yet — there is no HTTP path a Client Component (or any non-browser client) could use to reach report-groups data, and no proof the same manager function produces identical results whether called in-process or over HTTP.

**Approach:** Expose `reportGroupsManager`'s full surface as Route Handlers under `src/app/api/report-groups/**`, each gated by `requireApiToken` before calling the manager, returning the `{error:{code,message}}` envelope on failure (per AD-5's status-code convention: 401/403 from `requireApiToken` itself, 422 for a manager-thrown business-rule rejection, 500 for anything else unexpected). Add `src/lib/api/client.ts` (the path AD-4 names) — a thin same-origin `fetch` wrapper Client Components will use going forward (none exist yet for report groups; confirmed via investigation — see Code Map), auto-attaching the CSRF header on mutating requests (the httpOnly app-token cookie itself travels automatically with any same-origin request, no client code needed for that part) and throwing a typed `ApiError` on a failure envelope. A new test proves the third acceptance criterion directly: the same `reportGroupsManager` function, called in-process and by invoking the Route Handler's exported function with a constructed `Request`, produces identical results against the same seeded data — no running dev server needed, since Next.js Route Handlers are just plain async functions.

**Route shape decided in this story** (epics.md names only the collection-level `route.ts` as an example; the User Story text itself — "create/respond-to/close a report group through the new API" — establishes the full surface is in scope, not just create):
- `POST /api/report-groups` → `createGroup`
- `GET /api/report-groups/[id]` → `getGroup`
- `POST /api/report-groups/[id]/respond` → `respondToGroup`
- `POST /api/report-groups/[id]/close` → `closeGroup`
- `GET /api/report-groups/[id]/summary` → `getGroupCompetencySummary`
- `src/app/api/report-groups/_shared.ts` (Next.js's `_`-prefix convention excludes it from routing) — a small helper used by all five files: gate the request through `requireApiToken`, return early with its 401/403 envelope on rejection, and a `jsonError(status, code, message)` builder. Scoped to this one route group for now, not a cross-domain shared module yet — Epic 3 generalizes on first real reuse, matching this initiative's established extract-on-reuse pattern.
- Manager-thrown `Error`s (Story 1.2's business-rule rejections, e.g. an ineligible invitee or below-threshold close) map uniformly to 422 `validation_error` with the error's own message — not finer-grained per message content (e.g. "not found" → 404), since that would need brittle message-string-sniffing; documented as a deferred refinement, not required by this story's AC.

## Boundaries & Constraints

**Always:**
- Every route file calls `requireApiToken(request)` before touching `reportGroupsManager`; a rejection short-circuits with the matching 401/403 envelope and the manager is never invoked.
- Every failure response body is `{ error: { code: string, message: string } }`; every success body is the manager's own return value, unwrapped (no envelope).
- `src/app/api/report-groups/**/route.ts` files call only `reportGroupsManager` (never `@/server/db/*` or `@/lib/supabase/*` directly) — already enforced by Story 1.3's ESLint boundary, verified here by an actual passing `npm run lint`, not just trusted.
- `src/lib/api/client.ts` sends `credentials: "same-origin"` explicitly and adds the CSRF header only for `POST`/`PUT`/`PATCH`/`DELETE` — matching `requireApiToken`'s own mutating-method set exactly.

**Never:**
- Do not modify `src/app/actions/reportGroups.ts` — it keeps calling Supabase directly, unchanged; delegating it to the manager is Story 1.6.
- Do not add a "list my report groups" route — no manager method exists for it (Story 1.2 never wrapped that RPC; the list page still queries Supabase directly and stays that way until a later story addresses it).
- Do not build or wire up any real Client Component UI — no Client Component in this codebase currently handles report groups (confirmed: `groups/page.tsx`, `groups/nuevo/page.tsx`, `groups/[id]/page.tsx` are all Server Components using Server Actions; `EvaluatorPicker`, the one Client Component involved, is a pure form-input picker with no report-groups data logic). The "Client Component" acceptance criterion is verified at the fetch-wrapper level via tests, not a live UI integration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `POST /api/report-groups`, valid token, eligible members | valid app token, JSON body `{name, memberIds}` | 200/201, `{ groupId }` | N/A |
| `POST /api/report-groups`, valid token, ineligible member | same as above but an ineligible member id | 422, `{error:{code:"validation_error", message: <RPC message>}}` | manager's `Error` caught, never an unhandled 500 |
| Any route, missing/invalid app token | no `brujula_app_token` cookie, or tampered one | 401, `{error:{code:"unauthorized", message}}` | manager never invoked |
| `POST`/mutating route, valid token, missing CSRF header | valid token, no `x-brujula-csrf` header | 403, `{error:{code:"forbidden", message}}` | manager never invoked |
| Same operation, in-process vs. over HTTP | same seeded fixtures (Story 1.1/1.2's) | identical result (same `groupId` shape, same thrown-message text, same `getGroup` output) | proves AC 3 directly |
| `apiFetch` on a mutating call | any `POST`/`PUT`/`PATCH`/`DELETE` | request carries `x-brujula-csrf` header automatically | N/A |
| `apiFetch` on a failure envelope | server responds with `{error:{code,message}}` and a non-2xx status | throws `ApiError` carrying `code`/`message`/`status` | caller can `catch` and read `.code`/`.message` |

</frozen-after-approval>

## Code Map

- `src/server/managers/reportGroupsManager.ts` (Story 1.2) — `createGroup(name, memberIds)`, `respondToGroup(groupId, accept)`, `closeGroup(groupId)`, `getGroup(groupId)`, `getGroupCompetencySummary(groupId)`. All five get a route.
- `src/server/shared/auth.ts` (Story 1.4) — `requireApiToken(request: Request): ApiTokenResult` (`{ok:true} | {ok:false, status:401|403, reason:string}`), `APP_TOKEN_COOKIE`. Confirmed it accepts a plain `Request`, so a `NextRequest` (what Route Handlers receive) works unchanged, and a constructed `Request` (for tests) works too.
- No `src/app/api/**` directory exists yet — this story creates it for the first time.
- No Client Component anywhere in the repo currently handles report groups (confirmed via `grep -rln '"use client"' src/components src/app`, then checking each report-groups page's imports — all three are Server Components; `EvaluatorPicker.tsx` has no `fetch`/action/report-groups reference at all).
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — confirms Route Handlers are plain exported async functions per HTTP method taking the Web `Request`, directly callable in a test with a constructed `Request` — no dev server needed to exercise them.
- `_bmad-output/implementation-artifacts/spec-1-1-characterization-tests-report-groups-baseline.md`, `spec-1-4-app-token-issuance-and-validation.md` — seeding/login helper patterns and `signAppToken`-based cookie construction this story's new test reuses.
- `supabase/migrations/0064_report_groups.sql` — `get_report_group` raises `'Grupo no encontrado.'`/`'No tienes acceso a este grupo.'` on not-found/no-access; confirmed these currently fold into the same 422 bucket as any other manager error in this story's simplified mapping (documented limitation, not a bug).

## Tasks & Acceptance

**Execution:**
- [x] `src/app/api/report-groups/_shared.ts` (new) -- `requireAuthorizedRequest(request)` (gates via `requireApiToken`, returns either a pass-through signal or the 401/403 `Response`), `jsonError(status, code, message)` -- `import "server-only";` first
- [x] `src/app/api/report-groups/route.ts` (new) -- `POST` → `createGroup`
- [x] `src/app/api/report-groups/[id]/route.ts` (new) -- `GET` → `getGroup`
- [x] `src/app/api/report-groups/[id]/respond/route.ts` (new) -- `POST` → `respondToGroup`
- [x] `src/app/api/report-groups/[id]/close/route.ts` (new) -- `POST` → `closeGroup`
- [x] `src/app/api/report-groups/[id]/summary/route.ts` (new) -- `GET` → `getGroupCompetencySummary`
- [x] `src/lib/api/client.ts` (new) -- `apiFetch<T>(path, options)`, `ApiError` class (`code`/`message`/`status`), CSRF header auto-attached on mutating methods, `credentials: "same-origin"`
- [x] `tests/integration/report-groups-route.test.ts` (new) -- exercises every I/O-matrix row by calling the exported route functions directly with constructed `Request`s (valid token via `signAppToken`, seeded fixtures reused from Stories 1.1/1.2's pattern), including the in-process-vs-HTTP equivalence proof

**Acceptance Criteria:**
- Given `src/app/api/report-groups/**`, when a valid app-token request calls any route, then it invokes the matching `reportGroupsManager` function and returns the `{error:{code,message}}` envelope on failure.
- Given `src/lib/api/client.ts`, when `apiFetch` is called for a mutating operation, then the CSRF header is attached automatically and a failure envelope is surfaced as a typed, catchable `ApiError`.
- Given the same manager function, when called in-process versus through its Route Handler (same seeded fixtures), then both produce identical results.
- Given the existing 30 tests (Stories 1.1-1.4), when this story is complete, then they all still pass unchanged, and `npm run lint` shows zero violations for the new `src/app/api/**` files.

## Implementation Notes

**Error mapping, as built:** each route wraps its body-parse + manager call in one `try/catch`; any caught `Error` (a manager-thrown business-rule rejection, per the frozen Intent, but also a malformed-JSON `request.json()` parse failure -- the frozen spec's I/O matrix has no dedicated row for that case, and folding it into the same 422 `validation_error` bucket was judged the natural, lowest-complexity reading of "manager-thrown `Error`s ... map uniformly to 422," not a scope expansion) becomes 422 `validation_error` with the error's own `message`; a non-`Error` throw (not currently reachable from any manager or JSON.parse, but kept as a safety net) becomes 500 `internal_error`. `createGroup`'s route additionally checks `typeof name === "string" && Array.isArray(memberIds)` before calling the manager and returns 422 directly (not via the catch) on a shape mismatch, rather than letting a `TypeError` reach the manager.

**Status codes for success:** `POST /api/report-groups` returns **201** (the I/O matrix allows "200/201"; 201 was chosen as more precisely RESTful for a creation endpoint). `GET` routes and the two `POST .../respond` / `.../close` mutation routes return 200. `respondToGroup` returns `void`; its route represents that unwrapped success body as a JSON `null` (`Response.json(null)`), the natural encoding of "no value" that still round-trips through `response.json()` on the client side without a special empty-body case.

**`src/lib/api/client.ts`, as built:** `CSRF_HEADER` is redeclared as a local string literal in `client.ts` rather than imported from `src/server/shared/auth.ts` -- that file opens with `import "server-only"`, and `client.ts` is shipped to the browser (Client Components), so importing it would break the client bundle. Documented in a comment at the top of `client.ts` to keep the two constants from silently drifting. `apiFetch` does not auto-serialize a JS-object body (spec left this unspecified beyond "CSRF header auto-attached on mutating methods" and "credentials: same-origin"); it passes `options.body` straight through to `fetch` like a thin wrapper, matching "thin ... fetch wrapper" from the Intent, and only sets a default `content-type: application/json` header when a body is present and the caller hasn't already set one.

**Route param typing:** used the same manually-typed `{ params }: { params: Promise<{ id: string }> }` convention already used by the existing `[id]`/`[token]` dynamic pages (e.g. `src/app/admin/empresas/[id]/page.tsx`) rather than the doc's `RouteContext<'/users/[id]'>` helper, since that helper's types are only generated by `next dev`/`next build`/`next typegen` having already run for this exact route shape -- manual typing works identically at runtime and doesn't depend on codegen having occurred, which also keeps the route functions safely callable from a plain Vitest constructed-`Request` test with a hand-built `{ params: Promise.resolve({ id }) }`.

**Discovered during testing, not a defect:** `get_report_group_competency_summary` (`supabase/migrations/0064_report_groups.sql`) raises `"El informe de grupo todavía no está cerrado."` for an open group -- the summary route correctly maps this to 422 `validation_error` like any other manager-thrown rejection. The integration test's workflow calls `GET .../summary` once before close (asserting the 422) and once after (asserting 200 + an array), rather than assuming it's callable at any time.

**Test technique (`tests/integration/report-groups-route.test.ts`):** same mocking shape as Story 1.2's `tests/characterization/report-groups-manager.test.ts` -- only `@/lib/supabase/server`'s `createClient` is mocked (an `actingAs(token)` module-level acting-user pattern), so the manager's real RPC calls run against the local `supabase start` instance. `requireApiToken`/`signAppToken` (Story 1.4) are **not** mocked -- every request in the suite carries a real HMAC-signed `brujula_app_token` cookie built via `signAppToken`, so the auth-gating layer is exercised for real, not stubbed. The AC-3 in-process-vs-HTTP equivalence proof has two parts: (1) calling `reportGroupsManager.createGroup` in-process with an ineligible member and asserting its thrown message string equals the route's `error.message` for the identical input; (2) calling `reportGroupsManager.getGroup` in-process for a group and asserting it deep-equals the same route's JSON body for the same `id`. `tests/unit/app-token.test.ts` (Story 1.4) already covers `requireApiToken`'s pure-function edge cases exhaustively, so this suite's own auth-gating tests are intentionally a smaller representative subset (one 401 missing-token, one 401 tampered-token, one 403 missing-CSRF case) rather than a full re-run of that matrix at the route layer, plus a manager-not-invoked (`vi.spyOn`) assertion on each. `apiFetch`/`ApiError` are tested in the same file (matching the Tasks list's single new test file) against a stubbed `global.fetch` (`vi.fn<typeof fetch>()`), with no Supabase/manager involvement -- purely the client-side contract.

**Deviation -- lint warnings:** `npx eslint` on the new files alone is clean; the one pre-existing warning (`scripts/seed-company-360.mjs`, unrelated) is the only output from a full `npm run lint` run.

**Verification run (2026-09-13):**
- `npm run test` -- 46/46 passing: 30 prior (Stories 1.1-1.4) + 16 new (`tests/integration/report-groups-route.test.ts`), all unchanged/passing.
- `npm run lint` -- 0 errors; the single pre-existing, unrelated warning (`scripts/seed-company-360.mjs`, `idByEmail` unused) is the only output. No violations in any new `src/app/api/**` or `src/lib/api/**` file, confirming Story 1.3's import-boundary rule holds (every route file imports only `@/server/managers/reportGroupsManager`).
- `npx tsc --noEmit` -- one pre-existing, unrelated error (`src/app/layout.tsx(12,50): Cannot find name 'LayoutProps'`), independently confirmed pre-existing by stashing this story's new/changed files and re-running against the clean baseline. No new type errors from any file this story touched.

## Spec Change Log

## Review Triage Log

- **`requireApiToken()`'s throw (missing `APP_TOKEN_SECRET`) escapes `_shared.ts`'s `requireAuthorizedRequest` unhandled, since it's called outside any try/catch in every route** — Edge Case Hunter findings 1 & 7 (claim). Verdict: **medium**. Confirmed: `requireAuthorizedRequest(request)` is called before each route's own `try` block, so a config-error throw from `getSecret()` (Story 1.4's deliberate fail-loud behavior) propagates as an unhandled exception, not this story's own frozen "Always" rule ("Every failure response body is `{error:{code,message}}`"). A real production misconfiguration would break the documented envelope contract this story exists to establish. Smallest fix is trivial (wrap the one call in `_shared.ts`, mapping any throw to a 500 envelope) and fixes all five routes at once since they share this helper. Routes to **patch**.
- **No server-side logging on unexpected 500s, and `requireApiToken`'s specific rejection `reason` is discarded in favor of two canned messages** — Blind Hunter findings 1 & 2. Verdict: **low**, real. Trivial (`console.error`/`console.warn` calls, no behavior change to the client-facing response). Routes to **patch**.
- **`createGroup`'s route validates `Array.isArray(memberIds)` but casts to `string[]` without checking each element is actually a string** — Blind Hunter finding 3. Verdict: **low**, real, trivial fix (`.every(id => typeof id === "string")`). Routes to **patch**.
- **Malformed or literal-`null` JSON request bodies produce raw, English, JS-internal error text (a `SyntaxError` or `TypeError` message) instead of the intended Spanish validation message, in both `create` and `respond` routes — and this path is untested** — Blind Hunter findings 5 & 6, Edge Case Hunter findings 4 & 5. Verdict: **low**, real. Consolidated: validate the parsed body is a non-null object before reading its fields, and catch JSON-parse failures specifically, in both routes; add a test for each. Routes to **patch**.
- **`apiFetch`'s fallback error message ("Request failed with status …") is in English, inconsistent with this codebase's Spanish-only user-facing text convention** — Blind Hunter finding 7. Verdict: **low**, real, trivial one-string fix. Routes to **patch**.
- **`apiFetch`'s `JSON.parse(text)` isn't wrapped — a non-JSON response body throws a raw `SyntaxError` instead of the documented typed `ApiError`** — Blind Hunter finding 8, Edge Case Hunter finding 2. Verdict: **low**, real, breaks the file's own documented contract ("throws a typed ApiError"). Routes to **patch**.
- **`apiFetch`'s `fetch()` call isn't wrapped — a network-level failure (offline/DNS/CORS) rejects with a raw `TypeError`, not `ApiError`** — Edge Case Hunter finding 3. Verdict: **low**, real, trivial (wrap in try/catch, rethrow as `ApiError`). Routes to **patch**.
- **No test exercises the request-shape-validation 422 branches (`create`'s name/memberIds check, `respond`'s `accept`-must-be-boolean check)** — Blind Hunter finding 4. Verdict: **low**, real coverage gap for a reachable code path this diff introduces. Routes to **patch**.
- **No 401/403 test coverage for `respond`, `close`, or `summary` routes — only `getGroup`/`createGroup` have a negative auth-gating test** — Blind Hunter finding 9, Verification Gap main finding (independently confirmed via a full line-by-line trace of the 537-line test file: every call to these three routes uses a valid token, and for the mutating two, `csrf: true`). Verdict: **medium** — Verification Gap's demonstration is concrete: a regression that silently dropped the auth guard from `respond`/`close` would let an unauthenticated request mutate group membership or trigger the AI-interpretation side effect, and no test in the suite would catch it. Routes to **patch**.
- **No test for the "not found"/"no access" 422 paths (`'Grupo no encontrado.'`/`'No tienes acceso a este grupo.'`), despite the Code Map explicitly flagging this as a documented limitation** — Blind Hunter finding 10. Verdict: **low**, real coverage gap for an already-acknowledged behavior. Routes to **patch**.
- **Route param `id` passed straight to the manager with no shape/format validation, unlike the validated request bodies** — Blind Hunter finding 11. Verdict: **false**. A malformed id (non-UUID, empty, etc.) reaches Postgres's own type-cast check, which raises an exception surfaced as a plain `Error` — the exact same generic `catch (error) { ... jsonError(422, ...) }` path every other manager-thrown error already takes, already exercised by multiple existing tests. Not a different, untested path — just an untested *variant* of an already-covered one.
- **No API reference/documentation artifact for `src/lib/api/client.ts` consumers** — Blind Hunter finding 12. Verdict: **low**. Rejected: no real consumer exists yet (confirmed no report-groups Client Component exists anywhere in this codebase — explicitly out of this story's own frozen scope), and writing full API docs is more than a direct correction.
- **Folding "not found," "no access," and genuine business-rule rejections into one uniform `422 validation_error` will hurt future UX/error-state design** — Blind Hunter finding 13. Verdict: **false**. This is exactly the frozen Intent's own deliberate, explicitly-documented simplification ("not finer-grained per message content... documented as a deferred refinement, not required by this story's AC") — reopening it here would override an already-approved frozen design decision, not fix an accidental defect.
- **`closeGroup` can throw after `closeReportGroup` already succeeded (a `saveReportGroupInterpretation` failure, per Story 1.2's own reviewed fix removing its try/catch) — the route then returns 422 even though the group actually closed** — Edge Case Hunter finding 6. Verdict: **medium**, real: a state-changing operation partially succeeded but the client is told it failed. Not routed to patch: the underlying throw behavior is Story 1.2's own deliberately-reviewed fix (removing the try/catch was itself a prior review's patch), and fixing the status-code mismatch well requires `reportGroupsManager.closeGroup` to return a richer result distinguishing "closed, save also succeeded" from "closed, save failed" — a manager-level return-type change touching Story 1.2's already-committed, frozen contract, bigger than this story's own file-scoped patch budget. Routes to **defer**.

## Verification

**Commands:**
- `npm run test` -- expected: all 30 prior tests plus this story's new tests pass
- `npm run lint` -- expected: no new violations (confirms the import-boundary rule holds for the new route files too)
- `npx tsc --noEmit` -- expected: no new type errors
