# Review — ARCHITECTURE-SPINE.md (Brújula backend/GUI decoupling)

**Reviewer:** rubric-walker (independent, checklist-driven)
**Date:** 2026-09-11

## Verdict

The spine's layering (AD-1/AD-2/AD-3) is sound and correctly ratifies the brownfield RPC/RLS pattern, but its own two auth ADs (AD-5 own-token vs. AD-6 RLS-as-backstop) are not reconciled against the codebase's actual `SECURITY DEFINER` + `auth.uid()`-dependent RPCs and the fully-unauthenticated invitee-token flow — a real, verified divergence risk for the domain-migration epics, not a nitpick — so this needs one more pass before it's safe to build epics on.

---

## Critical

### C1 — AD-5 ("decoupled from Supabase session") is not reconciled with AD-6's actual mechanism, and the codebase proves the gap is real

AD-5's rule says Route Handlers authenticate via a **new, own** `requireApiToken()`, "not by reading the Supabase session cookie directly," and frames this token as **replacing** that cookie ("own API-key/token scheme, decoupled from Supabase session"). AD-6 requires `db/*` to keep authenticating to Supabase "under the hood" so existing RLS keeps enforcing authorization.

I read the actual RPCs this depends on. `get_responder_context` and `submit_feedback_response` (`supabase/schema-dump.sql:1871`, `:2293`) are both `SECURITY DEFINER` — they do **not** rely on declarative RLS policies at all; they run with elevated privilege and do their own manual checks against `auth.uid()` inside the function body, e.g.:

```sql
if invitee.auth_user_id is distinct from auth.uid() then
  return jsonb_build_object('valid', false, 'requires_login', true);
```

`auth.uid()` only resolves correctly if the Postgres session executing the call still carries the caller's live Supabase JWT — i.e., if `db/*` is still constructing its Supabase client from the **actual Supabase session cookie**. AD-5, read literally ("decoupled," "replacing the Supabase cookie"), gives an implementer no reason to keep minting/forwarding that cookie once `requireApiToken()` exists. If a future scaffolding-epic implementer drops it, every `auth.uid()`-dependent check (which is most of the write path, given how much authorization already lives in `SECURITY DEFINER` functions rather than pure RLS — see C1a below) silently breaks or starts behaving as "anonymous."

This is exactly the "two independently-built units diverge in a way that matters now" failure the checklist asks about: the scaffolding epic (mints the new token) and each domain-migration epic (relies on `auth.uid()`/RLS working) can easily be built with inconsistent assumptions about whether the Supabase session cookie still exists, because the spine never says it must.

**Fix:** Add an explicit rule (extend AD-5 or AD-6, don't leave it implicit): the login action mints **both** the Supabase session (as today, via `supabase.auth.signInWithPassword`) **and** the new first-party token, in parallel, for the whole transition. `db/*` always builds its Supabase client from the Supabase session, unchanged — so RLS and `auth.uid()`-dependent `SECURITY DEFINER` functions keep working exactly as today. `requireApiToken()` is an **additional** gate at the `app/api/**` boundary, never a replacement for what `db/*` uses internally. Say this in AD-5 explicitly, not just in the deferred "issuance detail."

**C1a (fold-in, same root cause):** AD-2's description that the ~35 RPCs' "logic runs RLS-scoped inside Postgres" is imprecise for the `SECURITY DEFINER` ones — those explicitly *bypass* RLS and hand-roll their own `auth.uid()` checks. That's not wrong to keep wrapping as-is (AD-2's actual rule is fine), but the rationale text misstates the security model of what's being preserved, which is exactly the kind of imprecision that lets an implementer conclude (wrongly) that "RLS is the safety net, so the auth.uid() plumbing doesn't matter much." Correct the description so C1's fix is easier for a reader to accept.

### C2 — The invitee-token responder path can never obtain the "session token issued at login" AD-5 assumes, and the spine's own Structural Seed puts it behind the same gate anyway

AD-5's rule binds `src/app/api/**/route.ts` generally and assumes the token is "issued at login." But a real, currently-shipping user class never logs in at all: an ad-hoc email invitee. The code says so explicitly (`src/app/responder/[token]/page.tsx:45-49`):

> "Una invitación por email (cuenta individual, sin ningún miembro registrado detrás) no exige sesión: el token es la única credencial."

These invitees hit `submitFeedbackResponse` with **no Supabase session and no login event ever** — the single-use invitation token in the URL *is* their entire credential. Yet the spine's own Structural Seed lists `feedback-requests/[id]/submit/route.ts` under `app/api/**`, i.e., the exact surface AD-5 says is gated by `requireApiToken()`, with no carve-out. AD-7 even sequences this domain last specifically because it's the highest-risk/most anonymity-critical — which makes it worse, not better, that the auth model for it is undefined: whoever builds domain (5) has to invent, unguided, whether/how a never-logged-in invitee passes `requireApiToken()`.

**Fix:** Add an explicit second class of Route Handler auth to AD-5 (and a row in Consistency Conventions): routes gated by a single-use invitation/response token carried in the request body (validated inside the manager/RPC itself, exactly as today) are **exempt** from `requireApiToken()` by design — name them ("public token-gated routes") so it's decided once, not per-domain.

---

## High

### H1 — AD-3's actual enforcement mechanism doesn't encode AD-1's rule; Client Components can still import managers directly

AD-1's rule states `src/app/**` and `src/components/**` "may only import from `src/server/managers/*` (in-process) **or** call `src/app/api/**` over HTTP." But that's not a real choice for Client Components — they can't safely import a manager module in-process at all (managers sit on top of `db/*`, which holds service-shaped Supabase calls; bundling that into a client chunk is a worse failure mode than the one this initiative exists to stop). AD-4 correctly narrows this in prose ("Server Components/Actions call managers in-process; Client Components... call route handlers"), but AD-3's actual enforcement — the only enforcement mechanism named anywhere in the spine — is an ESLint `no-restricted-imports` rule that forbids **only** `@/lib/supabase/*` imports from `app/**`/`components/**`. Nothing forbids a `"use client"` file from importing `@/server/managers/*` or `@/server/db/*` directly. The rule people will actually run doesn't check the boundary AD-1 claims to guarantee.

**Fix:** Extend the ESLint rule (or add a second `no-restricted-imports` entry, or a `"server-only"` import at the top of every `managers/*` and `db/*` file) to also forbid `@/server/managers/*` / `@/server/db/*` from anything under `src/components/**` and from any file containing `"use client"`.

### H2 — Zero CI is named as the risk driver for AD-9 but never decided for AD-3/AD-8 themselves

Confirmed: no `.github/workflows`, no CI config anywhere in the repo. AD-9 explicitly cites "no CI to catch regressions" as the reason feature flags + manual QA are the chosen mitigation — good, that's decided. But AD-3's import-boundary lint rule and AD-8's new Vitest integration tests are exactly the two mechanisms meant to keep future epics from diverging, and **neither AD says whether they run anywhere but a developer's own machine**. Given the starting state this spine itself calls out (zero test coverage, no CI, no staging), "run `npm run lint`/`npm test` before you merge" is a weak assumption to leave unstated, not a safe default.

**Fix:** Decide explicitly — either add a minimal CI job (lint + the new Vitest suite on PR, no infra needed beyond what AD-8 already requires) as in-scope for this initiative, or add one line to Deferred explicitly punting on CI with a reason, the same way staging is already (correctly) deferred. Silence here is the actual gap, not the choice either way.

### H3 — `aiInterpretationManager`'s named "reference shape" violates the layering it's supposed to model

AD-3 says `aiInterpretationManager` "moves near-verbatim from `src/lib/aiInterpretation.ts` as the reference shape" for how managers should look. I read that file: its exported functions take a `SupabaseClient` as a parameter and call `supabase.rpc(...)` directly (`src/lib/aiInterpretation.ts:57,65-67,177,183`). That's a Supabase-shaped type in the function signature and a direct DB call from what's supposed to become manager code — exactly what AD-2 forbids for `db/*` and what AD-1's one-directional dependency forbids for anything above `db/*`. Naming this file "the reference shape" for every future manager tells implementers the antipattern is the template. It's also consistent with a smaller omission: the Structural Seed's `db/` list has no `aiInterpretations.ts`, even though `managers/aiInterpretationManager.ts` exists — there's nowhere for the `.rpc()` calls to land once split correctly.

**Fix:** Correct AD-3's wording: `aiInterpretationManager` keeps the interpretation-building/prompt logic, but its `supabase.rpc()` calls move into a new `db/aiInterpretations.ts` (add it to the Structural Seed) with a plain-TS-typed signature, same as every other domain. Drop "near-verbatim" — say "adapted to the standard db/manager split."

---

## Medium

### M1 — Consistency Conventions has no idempotency rule, and the one path that most needs it is the anonymity-critical one

`submit_feedback_response` is a state-changing, single-use RPC (guarded by `used_at`) reachable from a **public, unauthenticated, token-only** endpoint — the exact shape most prone to double-submit (retry, double-click, or a future `src/lib/api/client.ts` retry-on-failure default). The 5-row Consistency Conventions table doesn't mention idempotency or duplicate-submit handling anywhere, for this or any other state-changing endpoint.

**Fix:** Add a row: state-changing endpoints rely on the underlying RPC's own uniqueness guard (e.g. `used_at`); a duplicate submit returns a defined status (e.g. 409, or a 200 with an "already submitted" body) rather than surfacing the RPC's raw error text to the caller.

### M2 — No pagination or list-response-shape convention

`list_organization_members`, `get_my_report_groups`, `get_my_pending_invitations` and similar are plausibly-growing lists. Once they're exposed through `app/api/**` for Client Components (AD-4), two independently-built Route Handlers have nothing telling them whether to paginate, what query params to use, or what a list-success envelope looks like — the table's one shape row covers errors only, not success/list responses.

**Fix:** Even "no pagination yet, lists return complete arrays under `{ data: [...] }`" is fine — just say it, since two developers guessing independently is the actual risk, not the specific choice.

### M3 — No timezone/date-format convention for the new JSON boundary

Today, Server Actions pass JS `Date`s straight through to `supabase.rpc()` calls with no JSON serialization step. AD-4 introduces a real JSON boundary (`app/api/**` + `src/lib/api/client.ts`) for the first time. Nothing says whether dates cross that boundary as ISO-8601 UTC strings, epoch numbers, or raw `timestamptz` passthrough — a genuine two-Route-Handler divergence point that didn't exist before this initiative and isn't addressed by it.

**Fix:** One line: dates cross the JSON boundary as ISO-8601 UTC strings; conversion to local display time happens client-side.

### M4 — AD-9's feature-flag check-point isn't located anywhere in the layering

AD-9 says old/new paths coexist "behind a simple env flag," one per domain — but doesn't say **where** the branch lives: inside the Server Action / Route Handler entry point, inside the manager, or duplicated in both. Given AD-4 already has two entry points per domain (action delegate + route handler) that are supposed to converge on one manager, an unstated flag location is a real place for two domains (built at different times, possibly by different people) to end up structured differently — which then makes AD-9's own promise ("old path deleted once new path survives one cycle") harder to execute uniformly.

**Fix:** State it: the flag check lives at the top of each entry point (action file and route handler), each one dispatching to either the legacy inline Supabase call or the new manager call — not inside the manager itself, since the manager *is* the new path.

---

## Low

### L1 — AD-2's "~35 total" RPC count undercounts

A direct `grep` of `.rpc(` call sites in `src/` finds **42** distinct RPC names, not ~35 (the 25-file and 23-policy counts elsewhere in the spine check out exactly, for comparison). Doesn't change AD-2's rule, but the scaffolding epic needs a complete, accurate inventory to know "wrap every one" is actually done — worth a quick recount, not a re-architecture.

---

## What's genuinely fine to leave in Deferred

- Full RLS → application-level authorization rewrite, direct-Postgres client swap, token issuance/refresh/rotation detail, API versioning, and whether a staging environment gets introduced are all correctly scoped out — each has a stated reason and none of them lets two domain-migration epics diverge from each other *now* (they're genuinely later decisions, gated on events — Supabase removal, an external client — that haven't happened). No change requested here.
