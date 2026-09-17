---
title: 'App Token Issuance and Validation'
type: 'feature'
created: '2026-09-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '88fc0da679d0c95c7c7d6dc2c3239082d667e2f6'
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The future API layer (Story 1.5's Route Handlers) has no way to authenticate the GUI as itself, independent of Supabase Auth — per AD-5, the API boundary must not depend on Supabase's session mechanism (Supabase is a planned future removal). Today, `signIn` (`src/app/actions/auth.ts`) only ever establishes the Supabase session cookie.

**Approach:** Add `src/server/shared/auth.ts` (the path AD-5 itself names) with a self-contained, stateless signed-token scheme — no new dependency, no new database table/migration: `signAppToken(authUserId)` builds a `base64url(JSON payload).base64url(HMAC-SHA256 signature)` token (Node's built-in `crypto` module, keyed by a new `APP_TOKEN_SECRET` env var), and `requireApiToken(request)` verifies it (signature, expiry, and — for mutating HTTP methods — the presence of a required anti-CSRF header) and returns ok/throws a typed rejection a Route Handler can turn into 401/403. `signIn` sets the resulting token as a second, `httpOnly`/`Secure`/`SameSite=Lax` cookie immediately alongside the existing (unchanged) Supabase session cookie. The DB-access layer keeps authenticating to Supabase exactly as it does today — this story adds a new credential, it does not touch or read the existing one.

**Design decisions this story settles (per AD-5's own note that issuance/refresh/rotation/CSRF detail is decided within this epic):**
- Token format: `{sub: authUserId, iat, exp}` payload, HMAC-SHA256 signed, no external JWT library — `sub` is carried for future auditability but nothing downstream consumes it yet (Story 1.5's Route Handler still authorizes purely through the existing Supabase-session-reading `db/*` calls, per AD-6; `requireApiToken` only gates "is this request carrying our own valid credential," it does not resolve or thread identity into managers).
- TTL: 7 days, no refresh/rotation mechanism in this story (issued fresh on every `signIn` call) — the simplest option satisfying every stated acceptance criterion; refresh/rotation stays an explicit non-goal here, revisitable later if a real need appears.
- CSRF defense: a required custom header (`x-brujula-csrf`, any non-empty value) on mutating methods (`POST`/`PUT`/`PATCH`/`DELETE`) — presence-only check (matching AD-5's literal wording, "a required custom header `requireApiToken()` verifies is present"), not a double-submit-cookie value match. A plain cross-site form cannot attach a custom header, so this alone defeats the classic CSRF vector `SameSite=Lax` doesn't fully cover.
- Cookie name: `brujula_app_token`.
- `APP_TOKEN_SECRET`: a new required env var (32-byte random hex). Missing/absent → `signAppToken`/`requireApiToken` throw a clear error immediately (fail loud, never silently issue an unsigned or per-process-random-keyed token).

## Boundaries & Constraints

**Always:**
- `src/server/shared/auth.ts` never imports `@/lib/supabase/*` or touches the Supabase session cookie — it only reads/writes its own `brujula_app_token` cookie and validates its own signature.
- `requireApiToken` returns 401-shaped rejection for a missing/invalid/expired/tampered token, and a distinct 403-shaped rejection for a mutating request missing the CSRF header — regardless of whatever Supabase session cookie state exists on the request.
- `signIn`'s existing Supabase-auth call and its existing error/redirect behavior stay byte-for-byte unchanged; the only addition is setting the new cookie after a successful sign-in.
- `APP_TOKEN_SECRET` is added to `.env.local` and `.env.test.local` (both already gitignored) as a freshly generated random value — never a hardcoded/committed default.

**Never:**
- Do not create `src/app/api/**` or any Route Handler in this story — that is Story 1.5. `requireApiToken` is built and unit-tested here without a real caller yet.
- Do not add a JWT library or any new runtime dependency — Node's built-in `crypto` is sufficient for this token shape.
- Do not add a database table, migration, or any DB-backed session store — the token is fully stateless/self-verifying.
- Do not modify `acceptInviteSignUp`/`individualSignUp` in `src/app/actions/auth.ts` — they never establish a live session themselves (the user must still call `signIn` afterward), so they have nothing to issue a token for.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Successful `signIn` | valid email/password | Supabase session cookie (unchanged) **and** `brujula_app_token` cookie both set (`httpOnly`, `Secure`, `SameSite=Lax`) | N/A |
| Failed `signIn` | invalid credentials | Existing redirect-with-error behavior only; no app token issued | unchanged from today |
| `requireApiToken`, valid token, non-mutating request | correctly signed, unexpired token; GET | resolves ok | N/A |
| `requireApiToken`, missing token | no `brujula_app_token` cookie on the request | rejects, 401 | rejection carries a clear reason, never throws an unhandled exception |
| `requireApiToken`, tampered/invalid-signature token | payload or signature altered | rejects, 401 | same as above |
| `requireApiToken`, expired token | `exp` in the past | rejects, 401 | same as above |
| `requireApiToken`, mutating method, valid token, missing CSRF header | POST with a valid token but no `x-brujula-csrf` header | rejects, 403 | distinct from the 401 cases |
| `requireApiToken`, mutating method, valid token, CSRF header present | POST with valid token and the header | resolves ok | N/A |

</frozen-after-approval>

## Code Map

- `src/app/actions/auth.ts:78-91` (`signIn`) — only site that establishes a live session today; gets the one-line addition (set the app-token cookie after `signInWithPassword` succeeds, using the session's own `data.user.id` as `sub`). `acceptInviteSignUp`/`individualSignUp` confirmed not to establish a session (comments explicitly say the user must still log in afterward) — out of this story's scope.
- `src/lib/supabase/server.ts`, `src/proxy.ts` — confirmed the only places touching the Supabase session cookie; neither is modified by this story. `src/proxy.ts` already refreshes the Supabase session on every request (resolves the stale "middleware" comment concern noted back in the architecture spine's AD-6 — no actual gap).
- No `src/app/api/**` directory exists yet; no JWT/crypto library (`jose`, `jsonwebtoken`) is installed; Node's built-in `crypto` module confirmed available (`createHmac`, `timingSafeEqual`) with no new dependency needed.
- `.env.local`, `.env.test.local` — currently hold only `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`; both gitignored. This story appends a freshly generated `APP_TOKEN_SECRET` to both.
- `vitest.config.ts` — already loads `.env.test.local` by hand (Story 1.1); no config change needed for the new test file to see `APP_TOKEN_SECRET`.
- `_bmad-output/planning-artifacts/architecture/architecture-brujula-gui-2026-09-11/ARCHITECTURE-SPINE.md` AD-5/AD-6 — source of the binding file path (`src/server/shared/auth.ts`), the cookie/CSRF-header shape, and the "RLS stays the backstop, this doesn't replace it" constraint.
- `_bmad-output/planning-artifacts/epics.md` Story 1.8 — confirms new auth-boundary tests are genuinely new-behavior tests (not characterization), and that full request-level (Route-Handler-integrated) auth-boundary testing is that later gate's job, not this story's — this story's own tests exercise `signAppToken`/`requireApiToken` directly as pure functions plus `signIn`'s cookie-setting against the local Supabase instance.

## Tasks & Acceptance

**Execution:**
- [x] `.env.local`, `.env.test.local` -- append a freshly generated random `APP_TOKEN_SECRET` (32-byte hex) to both
- [x] `src/server/shared/auth.ts` (new) -- `signAppToken(authUserId: string): string`, `requireApiToken(request: Request): { ok: true } | { ok: false; status: 401 | 403; reason: string }` (or equivalent typed result), `APP_TOKEN_COOKIE`/`CSRF_HEADER` constants, `import "server-only";` as first import
- [x] `src/app/actions/auth.ts` -- in `signIn`, after `signInWithPassword` succeeds, set the `brujula_app_token` cookie via `signAppToken` and `next/headers`'s `cookies()`
- [x] `tests/unit/app-token.test.ts` (new) -- covers every row of the I/O matrix for `requireApiToken`/`signAppToken` directly (no HTTP layer needed yet)
- [x] `tests/characterization/auth-signin.test.ts` (new, or extend an existing suite) -- confirms a real `signIn` call against the local Supabase instance sets both cookies on success and neither on failure

**Acceptance Criteria:**
- Given valid credentials, when `signIn` runs, then both the existing Supabase session cookie and the new `brujula_app_token` cookie (httpOnly, Secure, SameSite=Lax) are set.
- Given a request with no valid app token, when `requireApiToken` runs, then it rejects with 401, regardless of any Supabase session cookie present on the same request.
- Given a mutating-method request with a valid app token but no CSRF header, when `requireApiToken` runs, then it rejects with 403.
- Given the existing characterization suites (Stories 1.1-1.3, 14 tests), when this story is complete, then they all still pass unchanged.

## Implementation Notes

**Token construction, as built:** `signAppToken` builds `{ sub: authUserId, iat, exp }` (Unix seconds), JSON-serializes it, base64url-encodes that, then HMAC-SHA256-signs the base64url *payload string* (not the raw JSON) keyed by `APP_TOKEN_SECRET`, and joins `payload.signature` with a single `.`. `requireApiToken` re-derives the expected signature the same way and compares with `crypto.timingSafeEqual` (constant-time), rejecting on length mismatch before the comparison. `getSecret()` (reads `process.env.APP_TOKEN_SECRET`) is called unconditionally at the top of both `signAppToken` and `requireApiToken`, outside any try/catch, so a missing secret throws immediately and unhandled (the one deliberate exception to "never throws" — a deployment/config error, not a per-request one, per the frozen Design Decisions). Everything else inside `requireApiToken`'s per-token verification (`verifyAppToken`) is wrapped in try/catch and returns `null` on any failure (bad base64, malformed JSON, wrong field types, signature mismatch), which `requireApiToken` turns into a `401 invalid_token` rejection — never an unhandled exception.

**Cookie parsing:** `requireApiToken` takes a plain `Request` (per the frozen Tasks signature, not `NextRequest`) and reads the `brujula_app_token` value itself out of the raw `Cookie` header (no `next/headers` dependency), since a generic `Request` has no `.cookies` accessor. This keeps `src/server/shared/auth.ts` fully decoupled from any Next.js request-object specifics, ready for Story 1.5's Route Handler (which receives a `NextRequest`, itself a `Request`) to pass straight through.

**`signIn` diff, as built:** exactly the addition the frozen Code Map describes — destructure `data` (previously only `error` was destructured) from `signInWithPassword`'s result, and after the existing `if (error) redirect(...)` block, call `signAppToken(data.user.id)` and set the cookie via `(await cookies()).set(...)` with `httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: APP_TOKEN_TTL_SECONDS` (7 days, the same constant `signAppToken` uses for `exp`, exported from `auth.ts` so the two can't drift). No other line in the function changed.

**Test technique for `auth-signin.test.ts`:** rather than mocking `@/lib/supabase/server` away (as `report-groups.test.ts` does, since that suite isn't testing cookie behavior), this suite mocks only `next/headers`'s `cookies()` with an in-memory jar (`vi.hoisted`, same pattern the existing suite uses for its `redirect()` marker) and leaves `@/lib/supabase/server` and `@/server/shared/auth` completely real. This lets a real `supabase.auth.signInWithPassword` call against the local instance drive `@supabase/ssr`'s real `setAll` callback into the same mocked jar `signIn`'s own new cookie-set call uses, so the test can assert on the *actual* production code path end-to-end (both cookies landing in one jar) instead of a stubbed approximation. The Supabase session cookie assertion is intentionally name-agnostic (`nonAppTokenCookies().length > 0`) rather than checking a specific `sb-*` name, so the test doesn't couple to `@supabase/ssr`'s internal cookie-naming/chunking scheme.

**Deviation from Code Map — seed employee count:** the spec's Tasks list didn't pin a `seed-demo-company.mjs` employee count for the new characterization test. `organize_cycle_evaluators` (part of that script's cycle-creation step, which runs unconditionally) requires 5 *other* employees per employee as evaluators (never the Supervisor, per `0032_supervisor_cannot_be_evaluator.sql`), so `count=1` fails with "Datos de evaluadores incompletos." Used `count=6` (the minimum that satisfies the RPC) since this suite only needs one confirmed, loggable-in account (the Supervisor) — no report-groups domain data. Judged in-scope as a test-fixture sizing detail, not a functional change.

**Verification run (2026-09-13):**
- `npm run test` -- 26/26 passing: 14 prior (Stories 1.1–1.3) + 10 new (`tests/unit/app-token.test.ts`) + 2 new (`tests/characterization/auth-signin.test.ts`), all unchanged/passing.
- `npm run lint` -- 0 errors, same 1 pre-existing unrelated warning (`scripts/seed-company-360.mjs`, `idByEmail` unused). No new violations; `npx eslint` run individually against all four new/changed files also confirms 0 warnings/errors there.
- `npx tsc --noEmit` -- same 1 pre-existing, unrelated error (`src/app/layout.tsx(12,50): Cannot find name 'LayoutProps'`), independently confirmed pre-existing by stashing this story's changes and re-running against the clean baseline commit. No new type errors from any file this story touched.

## Spec Change Log

## Review Triage Log

- **`sprint-status.yaml` shows `1-4-...: in-progress`, not `review`, while the spec's own frontmatter says `in-review`** — Blind Hunter finding 1. Verdict: **false**. Expected mid-workflow state, same as Stories 1.2/1.3 at this exact point — step-05 (not yet reached) is what syncs it to `review`.
- **`requireApiToken`'s fail-loud-on-missing-`APP_TOKEN_SECRET` path is untested — only `signAppToken`'s identical path is** — Blind Hunter finding 2, Verification Gap main finding (independently confirmed: grepped every `requireApiToken` call site in `tests/`, none run with `APP_TOKEN_SECRET` unset). Verdict: **low**, real — both functions share the same `getSecret()` call and frozen contract, but only one direction is tested. Routes to **patch**.
- **No test proves `requireApiToken`'s result is independent of unrelated cookies (e.g. a Supabase session cookie) on the request, despite the code comment's explicit claim** — Blind Hunter finding 3. Verdict: **low**, real, trivial to add. Routes to **patch**.
- **CSRF header present-but-empty-string (`x-brujula-csrf: ""`) is untested** — Blind Hunter finding 4. Verdict: **low**. Confirmed the existing `!csrfHeader` check already correctly rejects an empty string (`!"" === true` in JS) — not a live bug, just an untested-but-already-correct path for a design decision explicitly documented as "any non-empty value." Routes to **patch** (cheap, closes the coverage gap).
- **No coverage for `signInWithPassword` succeeding but `signAppToken` then throwing (e.g. misconfigured `APP_TOKEN_SECRET` in production) — user left mid-login with an unhandled exception** — Blind Hunter finding 5. Verdict: **false**. This is the intended consequence of the frozen spec's own explicit fail-loud design ("never silently issue an unsigned or per-process-random-keyed token") — a misconfigured required secret blocking login loudly is the deliberate tradeoff, not an accidental gap. Softening it would contradict frozen intent, not fix a defect.
- **No `.env.example` or deployment/onboarding doc update for `APP_TOKEN_SECRET` in a real (staging/production) environment** — Blind Hunter finding 6. Verdict: **low**, real. Confirmed pre-existing and repo-wide, not introduced by this story: no `.env.example` exists anywhere in the repo, and neither of the project's pre-existing required env vars (`NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY`, present since the initial commit) has ever been documented for deployment either. Routes to **defer**.
- **Cookie is set with `secure: true` unconditionally, which will silently drop it on any non-HTTPS deployment target** — Blind Hunter finding 7. Verdict: **false**. Directly and correctly follows the frozen Intent/AC's explicit requirement ("`httpOnly`, `Secure`, `SameSite=Lax`") — weakening this would violate frozen intent, not fix a defect.
- **`tests/characterization/auth-signin.test.ts` declares a `CookieEntry` type but the cookie-jar map uses its own separate inline structural-equivalent type instead of reusing it** — Blind Hunter finding 8. Verdict: **low**, real, trivial. Routes to **patch**.
- **`signAppToken(authUserId)` doesn't validate `authUserId` is a non-empty string before signing** — Blind Hunter finding 9. Verdict: **low**. Confirmed the sole call site (`signIn`) always passes `data.user.id`, a guaranteed-valid UUID per the Supabase SDK's own type contract (see next finding) — unreachable in practice, but the guard is a trivial, zero-risk addition. Routes to **patch**.
- **Claim: `signInWithPassword` could resolve `error: null` with `data.user` null/undefined, causing an unhandled `TypeError` at `data.user.id`** — Edge Case Hunter finding 1. Verdict: **false**. Read `node_modules/@supabase/auth-js/dist/module/lib/types.d.ts`: `AuthTokenResponsePassword` uses `RequestResultSafeDestructure<{user: User, session: Session}>`, a discriminated union where `data.user` is typed as non-null `User` exactly when `error` is `null`, and both are null exactly when `error` is set. TypeScript's own strict narrowing already proves this can't happen in the branch reached after the `if (error)` check — confirmed by `npx tsc --noEmit` passing with no optional-chaining needed at that line.
- **Claim: Intent's "returns ok/throws a typed rejection" phrasing contradicts the actual never-throws-except-`getSecret` behavior** — Edge Case Hunter finding 2 (self-flagged low confidence). Verdict: **false**. The Tasks section states the exact, unambiguous return type (`{ ok: true } | { ok: false; status: 401 | 403; reason: string }`), which matches the implementation precisely; the Intent prose is loose shorthand, not a contradiction once the spec is read as a whole.
- **`signOut` doesn't clear the new `brujula_app_token` cookie — a signed-out user keeps a valid app token for the remainder of its 7-day TTL** — Verification Gap other finding. Verdict: **low**, real. Not excluded by the frozen intent (which never addresses `signOut` either way — silence, not exclusion) and the fix is trivial (clear the cookie alongside the existing `supabase.auth.signOut()` call), so per the "keep the finding, don't reject as scope-only" rule this is actionable now rather than deferred. Routes to **patch**.

## Verification

**Commands:**
- `npm run test` -- expected: all prior 14 tests plus this story's new tests pass
- `npm run lint` -- expected: no new violations
- `npx tsc --noEmit` -- expected: no new type errors
