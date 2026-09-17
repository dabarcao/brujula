---
name: mvc-layering
description: >
  Use this before and after writing ANY new feature, behavior change, or bug
  fix that touches src/app/**, src/components/**, src/server/**, or
  src/lib/** in brujula-core. Enforces the mandatory db -> managers ->
  API/pages layering (ARCHITECTURE-SPINE.md AD-1..AD-11, machine-enforced by
  eslint.config.mjs): business logic must live in an existing or new
  src/server/managers/*.ts (backed by src/server/db/*.ts for all
  Supabase/Postgres access), and new functionality must be reachable via an
  src/app/api/**/route.ts Route Handler unless it is provably
  Server-Component-only. Ends non-trivial changes with a proportional
  3-expert compliance audit. Triggers on requests like "add a feature",
  "implement X", "fix this bug", "change the behavior of Y" for this repo.
---

# db → managers → API/pages layering (MVC)

This is a **mandatory, non-negotiable** architecture rule for `brujula-core` — not a per-story migration target. It was established as AD-1 through AD-11 in `_bmad-output/planning-artifacts/architecture/architecture-brujula-gui-2026-09-11/ARCHITECTURE-SPINE.md`, and the whole repo was brought into compliance with it (Stories 6.3/6.4) after the user asked, mid-session: *"se supone que hemos metido todas las lecturas de negocio en los managers, por qué el getUser es distinto?"* Every piece of new work must keep it that way.

**If anything below conflicts with `ARCHITECTURE-SPINE.md`, `eslint.config.mjs`, `src/app/api/_shared.ts`, `src/lib/api/client.ts`, or `src/server/shared/auth.ts` — those files win. Re-read them; this skill is a summary, not the source of truth.**

Also see `REVIEW-NOTES.md` in this same folder: field notes from a Claude review session (David, testing this repo against production data) — real bugs found and fixed, false alarms ruled out, and known gaps still open. Not authoritative, not a rule set — just worth reading before touching a screen it already covers.

## The rule

- `src/server/db/*.ts` is the **only** code allowed to import `@/lib/supabase/*` or `@supabase/supabase-js` (AD-1, AD-2). Every exported function is plain-TypeScript typed — never `PostgrestError`, `SupabaseClient`, or a raw Postgres row shape in a signature. Convention: `if (error) throw new Error(error.message)`; snake_case RPC/row fields mapped to camelCase DTOs before returning.
- `src/server/managers/*.ts` may only import from `src/server/db/*` and other managers (cross-domain composition is fine — e.g. `reportGroupsManager` already calls `aiInterpretationManager`). A manager **never** calls `redirect()`, `revalidatePath()`, `cookies()`, or `headers()` — those stay one layer up, in the Server Action/page. This is where business logic (permission checks, status/eligibility derivation, ranking/analytics, composing multiple reads into one result) belongs — not in a page, not in a Route Handler (AD-3).
- `src/app/**` and `src/components/**` may only import from `src/server/managers/*` — **never** `@/lib/supabase/*` or `@/server/db/*` directly. Machine-enforced by `eslint.config.mjs`'s `no-restricted-imports` rule.
- Both `db/*.ts` and `managers/*.ts` files open with `import "server-only";` — defense in depth, breaks the client bundle build if one ever leaks into browser code.

The 8 existing managers — reuse one if the new work fits its domain, don't invent a 9th for something that already has a home:
`adminManager`, `aiInterpretationManager`, `authManager`, `cyclesManager`, `feedbackManager`, `membersManager`, `reportGroupsManager`, `responderManager` (all in `src/server/managers/`, each backed by the matching `src/server/db/<domain>.ts`).

If nothing fits, create a new pair: `src/server/db/<domain>.ts` + `src/server/managers/<domain>Manager.ts`, mirroring an existing pair's shape exactly (e.g. `db/members.ts` + `membersManager.ts`).

### A third layer: `src/server/infra/*` (AD-12)

Not every piece of new work is Supabase-shaped. A third-party API integration with no Supabase client and no RLS/authorization dimension (Story 7.6's example: sending email via Resend) doesn't fit `db/*` (nothing to wrap — no Postgres/RPC call) or `managers/*` (a manager should orchestrate the side effect, not construct the SDK client that performs it). That gets its own `src/server/infra/<name>.ts` file instead, documented as AD-12 in `ARCHITECTURE-SPINE.md`:

- `src/server/infra/*` is the **only** code allowed to import an infrastructure-service SDK (`resend`, and any future one of the same shape) — mirroring how `src/server/db/*` is the only code allowed to import `@/lib/supabase/*`/`@supabase/supabase-js`. It opens with `import "server-only";`, same as `db/*`/`managers/*`.
- It is called **only from a manager**, never from a page, Route Handler, or `db/*` file. `src/app/**`/`src/components/**` are forbidden from importing `@/server/infra/*` directly — same `no-restricted-imports` shape in `eslint.config.mjs` as the existing `@/server/db/*` restriction (every exemption block for that restriction re-lists the infra pattern too, or the exempted file silently loses it — see that file's own comments).
- An `infra/*` file never constructs a Supabase client and never reads/writes application data itself. The calling manager resolves whatever it needs via `db/*` first (recipients, templates, ids), then hands `infra/*` only the already-resolved primitives (an address, a rendered subject/body) needed to perform the side effect.
- Same graceful-degradation contract as `aiInterpretationManager`'s `ANTHROPIC_API_KEY` handling: a missing service credential (e.g. `RESEND_API_KEY`) makes every export a silent no-op, never a thrown error that breaks the calling manager's flow. Passing automated tests (no key configured in any test/dev env) is explicitly **not** proof of real delivery — that needs a manual QA pass with a real key configured.

Reuse `src/server/infra/email.ts` (Story 7.6) for any new email-sending need rather than inventing a second Resend wrapper.

## Exposing it: API vs. in-process only

AD-4: managers are exposed **two ways** — Server Components/Server Actions call them in-process, directly (never a self-`fetch()` to the app's own API — that's a pointless round trip on the same serverless boundary). Client Components and any external/non-browser caller reach them via `src/app/api/**/route.ts` Route Handlers, called through `apiFetch<T>()` (`src/lib/api/client.ts`) — never a Server Action, never a hand-rolled `fetch()`.

**Default: new functionality gets a matching Route Handler.** Skip it only when the read/write is provably Server-Component-only with no realistic Client-Component or external-caller need — and if you skip it, say so explicitly in a comment on the manager function (same style as the Story 3.26 read-model-composition functions), so the omission reads as a decision, not an oversight.

### Writing the Route Handler

Follow the exact, already-established pattern (37 route files across 9 domains already do this — `src/app/api/members/route.ts` is a clean example to model against):

1. **First line, always:** `const unauthorized = requireAuthorizedRequest(request); if (unauthorized) return unauthorized;` — import `requireAuthorizedRequest`/`jsonError`/`isValidUuid` from the **root** `src/app/api/_shared.ts` (relative import, e.g. `"../_shared"` or `"../../_shared"` depending on depth). Do **not** create a new per-domain `_shared.ts` — `src/app/api/report-groups/_shared.ts` is a stale, superseded duplicate from before the root one existed; don't repeat that pattern.
   - `requireAuthorizedRequest` wraps `requireApiToken()` (`src/server/shared/auth.ts`): a first-party HMAC-signed `brujula_app_token` cookie, deliberately decoupled from the Supabase session cookie (AD-5) — RLS via the real session remains the authorization backstop underneath (AD-6). Mutating methods (`POST`/`PUT`/`PATCH`/`DELETE`) additionally require the `x-brujula-csrf` header.
   - **Exception (AD-7):** anonymous invitee flows (`responder/[token]`, `invitacion/[token]`) do **not** use `requireApiToken()` — they validate a single-use invitation token via `db/responder.ts` instead. This is a documented, deliberate second credential type, not a gap to "fix" by adding the app-token check there.
2. Parse/validate the request (query params or `request.json()`); a malformed/missing value → `jsonError(422, "validation_error", "...")` before ever calling the manager. Use `isValidUuid()` from `_shared.ts` to guard any id passed straight into a `uuid`-typed RPC argument.
3. `try { const result = await someManager.fn(...); return Response.json(result, { status }); } catch (error) { if (error instanceof Error) return jsonError(422, "validation_error", error.message); return jsonError(500, "internal_error", "Error inesperado."); }`
4. **Response envelope, always:** success = the manager's return value, **unwrapped** (no `{data: ...}` wrapper); `void`-returning manager → `Response.json(null)`. Failure = `{ error: { code: string, message: string } }` via `jsonError`. Status codes: `401 unauthorized` / `403 forbidden` (from `requireAuthorizedRequest`), `422 validation_error` (bad input, or any manager-thrown `Error`), `500 internal_error` (non-`Error` throw), `201` for a creating `POST`, `200` otherwise.
5. URL shape: kebab-case segments, collection root for create (`POST /api/<domain>`), `[id]` for one resource (`GET /api/<domain>/[id]`), `[id]/<verb>` for sub-actions (`POST /api/<domain>/[id]/close`).

### Consuming it

- Server Component / Server Action → import the manager, call it directly. No `apiFetch`.
- Client Component → `apiFetch<T>(path, options)` from `src/lib/api/client.ts`; catch `ApiError` (has `.status`/`.code`/`.message`).

## The verification gate — always, every change regardless of size

Before considering any task done:

- `npx tsc --noEmit` clean.
- `npm run lint` clean — **0** `no-restricted-imports` violations beyond the pre-existing, individually-commented exemptions in `eslint.config.mjs` (currently exactly 3 files: `src/app/admin/page.tsx`, `src/app/admin/empresas/[id]/page.tsx` — both a deliberately deferred, pre-existing gap tracked in `deferred-work.md`/Epic 6 backlog — and `src/app/actions/cycles.ts`, which still needs a raw client for the unmigrated `src/lib/aiInterpretation.ts` helper). **New code never adds a 4th exemption without stopping and getting the user's explicit, informed sign-off first** — the same standard applied this session before waiving the AD-10 rollback gate. If you think you need one, that's a stop-and-ask moment, not a judgment call to make alone.
- The relevant test suite passes, and the full `npm test` suite passes before declaring the task complete (this repo's characterization tests run against a real local `supabase start` instance — mocks are the exception, not the rule, for anything touching `db/*`/`managers/*`).

## The 3-expert compliance audit — proportional to the change

For **new functionality or a behavior change with real surface area** (not a one-line bug fix — use judgment, and say explicitly which bucket a change falls into rather than silently picking one): dispatch 3 independent subagents in parallel, scoped to the files this change touched (not the whole repo — that full-repo version already ran once, in Story 6.4, at the user's explicit request; re-running it at that scope for every change would be disproportionate). This mirrors the user's own closing instruction for Story 6.4, verbatim: *"revisa con 3 expertos que toda la funcionalidad de negocio está en managers y la diferentes páginas sólo hacen uso de los managers para todo."*

1. **Expert 1 — import-boundary compliance.** On the files this change touched: any raw `@/lib/supabase/*`/`@supabase/supabase-js`/`@/server/db/*` import (aliased or relative-path) outside `src/server/db/*.ts`? Any raw infra-SDK import (e.g. `resend`) or `@/server/infra/*` import outside `src/server/managers/*.ts` (AD-12) — in particular, is `@/server/infra/*` ever imported from a page/component, not just a manager? Any dynamic `import(...)` that could dodge ESLint's static check? Does the new code need a new `eslint.config.mjs` exemption it doesn't have (flag, don't add) — or, conversely, is an exemption now stale?
2. **Expert 2 — business logic leaked into pages/Route Handlers.** Does a page, Server Action, or Route Handler compute something with domain meaning beyond "call a manager, then render/redirect on the plain result" — a permission/eligibility check, a status/threshold derivation, a ranking/aggregation, a merge of two manager results? If so, it belongs in the manager, not where it landed.
3. **Expert 3 — manager/db-layer integrity.** Does every new `db/*.ts` function construct its own Supabase client (not delegate the real query to something outside `src/server/db/`)? Does every new manager function only call `db/*`/other managers, never Next.js-specifics? Any cross-domain leak (one domain's `db/*.ts` directly querying a table that conceptually belongs to another domain, instead of calling that domain's own manager)?

Every **CONFIRMED** finding gets fixed before the task is done — not just logged in `deferred-work.md`. A finding that's a deliberate, pre-existing, already-documented exception (the 3 ESLint exemptions above, the AD-7 invitee-token carve-out) is not a new violation — don't re-litigate those unless the change actually touches them.

## What "done" looks like

`tsc`/lint clean, tests green, business logic lives in a manager, DB access lives in `db/*`, new functionality has a Route Handler (or an explicit, commented reason it doesn't), and — for anything beyond a trivial fix — the 3-expert audit ran and its confirmed findings are fixed. That's the same bar Story 6.4 was held to; nothing new work does should be held to less.
