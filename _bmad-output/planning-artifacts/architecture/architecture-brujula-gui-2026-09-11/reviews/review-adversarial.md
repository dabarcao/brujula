---
name: 'Adversarial review — Brújula backend/GUI decoupling spine'
type: architecture-review
reviews: architecture-brujula-gui-2026-09-11/ARCHITECTURE-SPINE.md
created: '2026-09-11'
---

# Adversarial Review — ARCHITECTURE-SPINE.md

## Verdict

Two spine-compliant implementers working one level down (e.g. the cycles-domain story and the feedback-domain story) can still produce code that is individually correct and mutually incompatible, because the spine leaves four things unpinned: who owns the shared `feedback_requests` entity, what shape a manager returns, where a feature flag is evaluated, and which manager owns the not-yet-assigned "responder" domain — so this spine needs one more pass before two people can build against it in parallel.

Method: read ARCHITECTURE-SPINE.md in full, then cross-checked its claims against the live schema (`supabase/migrations/*.sql`), the existing `src/app/actions/cycles.ts` and `src/app/actions/feedback.ts` (today's pre-migration "old path"), `eslint.config.mjs`, and `docs/spec.md`, to ground each finding in what the two hypothetical implementers would actually be looking at.

---

## Critical

### C1 — The stated ESLint rule doesn't cover the gap it's supposed to close

**AD:** AD-1 (Rule), AD-3 (Rule), Consistency Conventions → "State mutation: Writes only through a manager function; no direct `supabase.rpc()`/`.from().insert()` outside `db/*`."

**The literal text:** AD-3's Rule is precise about the *mechanism*: "An ESLint `no-restricted-imports` rule forbids `src/app/**` and `src/components/**` from importing `@/lib/supabase/*`." That is the only enforcement mechanism named anywhere in the spine for the whole layering discipline.

**The gap:** the rule as written restricts one import path (`@/lib/supabase/*`). It says nothing about `@/server/db/*`. Nothing in AD-1, AD-3, or the Consistency Conventions table extends `no-restricted-imports` (or any other check) to forbid `src/app/**`/`src/components/**` from importing `@/server/db/*` directly.

**Concrete incompatible-but-compliant scenario:** the cycles-domain implementer writes the migrated `finalizeCycleRequest` Server Action as a thin delegate to `cyclesManager.closeCycleRequest()`, per AD-3/AD-4 — fully compliant. The feedback-domain implementer, migrating `closeFeedbackRequest` in parallel, imports `closeAdHocFeedbackRequest` from `@/server/db/feedback` straight into the Server Action, skipping `feedbackManager` entirely (maybe to "save a hop," maybe because nothing told them not to). `eslint.config.mjs` today is just `nextVitals` + `nextTs` with default ignores — no `no-restricted-imports` config exists yet, and even once added per AD-3's literal text, this second file passes it cleanly: it never imports `@/lib/supabase/*`. Both PRs are spine-compliant by the letter of AD-1/AD-3. Only one of them actually keeps managers as the sole business-logic owner and the sole point where AD-9's feature flag or AD-8's golden-output test can intercept a write.

**Fix:** tighten AD-1's Rule (or add a new AD) to state explicitly: *the `no-restricted-imports` ESLint rule forbids `src/app/**` and `src/components/**` from importing `@/lib/supabase/*` **and** `@/server/db/*`; only `src/server/managers/*` may import `@/server/db/*`.* This is a one-line addition to an existing rule, not a new mechanism, and it's the difference between "writes only through a manager" being an enforced invariant versus a convention people can quietly skip.

### C2 — `feedback_requests` is one shared entity with no assigned manager owner

**AD:** AD-3 (Rule: "One manager per domain: `cyclesManager`, `feedbackManager`...")

**Ground truth from the schema:** `feedback_requests` (migration `0001_initial_schema.sql`) is a *single* table for both flows, discriminated by `request_type in ('ad_hoc', 'cycle')`. Today's pre-migration code confirms both domains read/write it: `finalizeCycleRequest` in `src/app/actions/cycles.ts` calls RPC `close_cycle_request` and redirects to `/dashboard/feedback/${requestId}` — the *feedback* detail route, for a *cycle* request. `closeFeedbackRequest` in `src/app/actions/feedback.ts` calls a sibling RPC, `close_ad_hoc_feedback_request`, on the same table. Both "close a request" operations mutate `feedback_requests.status`; `close_cycle_request` additionally triggers AI-interpretation generation (`generateAiInterpretation` + `save_ai_interpretation` RPC) which `closeFeedbackRequest` does not.

**The gap:** AD-3 assigns "one manager per domain" and lists `cyclesManager` and `feedbackManager` as siblings, each presumably backed by its own `db/cycles.ts` / `db/feedback.ts` (per the Structural Seed). But the entity they both act on is the same table, and the read path (fetch-a-request-by-id for the shared `/dashboard/feedback/[id]` detail page) isn't assigned to either one explicitly. Nothing stops the two implementers from each writing their own `getFeedbackRequestById`-shaped function in their own manager, with their own idea of what fields to select, whether to join `feedback_invitations`/`feedback_responses`, and what "closed" validation to run before allowing a close — two independently-evolving copies of logic against one table, exactly the "two managers independently implementing overlapping 'close a request' logic" scenario the task asked me to check for. This is real, not hypothetical: it's visible today in the two separate RPCs already doing overlapping things inconsistently (one generates AI interpretation on close, one doesn't) — the migration is on track to encode that inconsistency into two permanently-diverging manager files rather than surface and resolve it.

**Fix:** add an AD (or extend AD-3) that names `feedback_requests` explicitly as a shared entity and assigns single ownership of its cross-cutting read/query logic — e.g. "`db/feedback.ts` is the single db file for all `feedback_requests` row access regardless of `request_type`; `cyclesManager` and `feedbackManager` both call into it, and any shared 'close a request' validation (invariants that must hold regardless of type) lives in one place, not duplicated per manager." This is a five-minute addition now versus a two-PR merge conflict in behavior later.

---

## High

### H1 — The "responder" domain has no assigned manager

**AD:** AD-3 (Rule: fixed manager list), AD-7 (Rule: domain migration order names "(5) responder/invitation")

**The gap:** AD-7 names six migration-order domains, the fifth being "responder/invitation." The Structural Seed lists a `db/responder.ts` file. But AD-3's manager list — `cyclesManager`, `feedbackManager`, `reportGroupsManager`, `membersManager`, `adminManager`, `authManager`, `aiInterpretationManager` — has no `responderManager`. The RPC this domain wraps, `submit_feedback_response`, is invoked today from the token-based `/responder/[token]` flow and is used by *both* cycle-based and ad-hoc invitations (same RPC, same `feedback_invitations.token` mechanism, per `supabase/migrations/0005_ad_hoc_feedback_flow.sql` and `0038_anonymous_responder.sql`).

**Concrete incompatible-but-compliant scenario:** whoever picks up the domain-5 story could reasonably conclude, from AD-3's "one manager per domain" phrasing plus AD-7 naming "responder/invitation" as its own domain, that a new `responderManager.ts` is required — file-naming convention (`managers/<domain>Manager.ts`) supports it, nothing forbids it. Meanwhile, whoever did the domain-4 feedback story earlier may have already folded `submitFeedbackResponse` into `feedbackManager` (it's plausible, arguably natural, since the RPC lives conceptually next to `feedback_requests`/`feedback_invitations`, which `feedbackManager` already owns). Both choices are individually AD-3-compliant. Now there are two live entry points for the same write (`submit_feedback_response`), and the anonymous-responder page (an unauthenticated, token-only route with no `requireApiToken()` session per AD-5 — a genuinely distinct auth shape from every other domain) either gets wired to whichever one the responder-domain author happened to find first, or worse, both get built and diverge.

**Fix:** resolve this now, in AD-3 or AD-7, rather than leaving it to story time — either add `responderManager` to the explicit list (cleanest, since its auth shape is genuinely different from every other domain: token-in-URL, no session, no `requireApiToken()`), or state explicitly that responder/invitation submission is owned by `feedbackManager` and domain 5's story is UI/route-handler work only, not a new manager.

### H2 — Feature-flag evaluation point (AD-9) isn't pinned to a layer, and the two consumption paths (AD-4) can end up inconsistently gated

**AD:** AD-9 (Rule + Consistency Conventions row), AD-4 (Rule: "Both paths call the *same* manager functions — managers are the single source of truth.")

**The gap:** AD-9 and the Consistency Conventions table specify the flag's *name*, *default*, and that it's *read server-side* — not *where in the call chain* it's evaluated. AD-4 promises the in-process path (Server Components/Actions → manager) and the HTTP path (Client Components → Route Handler → manager) are equivalent because "both paths call the same manager functions." That equivalence only holds if the flag is checked at a point both paths pass through.

**Concrete incompatible-but-compliant scenario:** the cycles implementer puts the `USE_NEW_API_CYCLES` check *inside* `cyclesManager`'s functions themselves (old-path logic and new-path `db/cycles.ts` logic both live inside the manager, switched by the flag) — this is AD-9-compliant and keeps AD-4's equivalence intact, since every caller, in-process or via Route Handler, goes through the manager and gets the same gating. The feedback implementer instead puts the `USE_NEW_API_FEEDBACK` check in the *outer* layer — the thin `'use server'` delegate checks the flag and either runs the old inline `supabase.rpc()` body (today's code) or calls `feedbackManager`; the Route Handler independently does the same check-and-branch. This is also AD-9-compliant read literally ("old and new code paths coexist per domain behind a simple env flag" — doesn't say which layer). But now the two domains behave differently under test: for feedback, a Server Component that (per AD-4) is allowed to call `feedbackManager` directly, in-process, bypassing the Server Action delegate and the Route Handler entirely, always gets new-path behavior regardless of the flag — while a Client Component hitting the Route Handler can still get old-path behavior. Same domain, flag set to `false`, two different behaviors depending on which surface asked. AD-8's golden-output test ("old path vs new path, identical output") also now needs a different harness per domain, since it can't assume a single interception point.

**Fix:** tighten AD-9's Rule to pin the evaluation point: *the flag check lives inside the manager function itself, as the single branch point for both the old inline logic and the new `db/*`-backed logic; Route Handlers and Server Action delegates never branch on the flag themselves.* This is consistent with AD-4's "managers are the single source of truth" and makes AD-8's golden-output tests uniform across domains for free.

---

## Medium

### M1 — No canonical DTO shape for manager return values

**AD:** AD-2 (Rule: "no Supabase-shaped types in their signatures (plain TS types/interfaces only)")

**The gap:** AD-2 rules out *Supabase*-specific types (e.g. `PostgrestSingleResponse<T>`) leaking out, which closes the most obvious leak, but says nothing about the *shape* of the plain TS type itself. Postgres/Supabase returns snake_case columns (`request_type`, `closes_at`, `ai_interpretation_generated_at`); nothing requires normalizing to camelCase, converting `timestamptz`/`date` columns to `Date` vs. leaving them as ISO strings, or converting `null` (Postgres) to `undefined` (idiomatic optional TS) consistently.

**Concrete incompatible-but-compliant scenario:** `cyclesManager.getCycleRequest()` returns the RPC/select row close to verbatim (snake_case, `closes_at: string`, absent AI fields as `null`) — satisfies AD-2 literally, it's a plain TS interface, no Supabase types. `feedbackManager.getFeedbackRequest()` (built by a different implementer, possibly on a different day) normalizes to camelCase and coerces `null` optional fields to `undefined` — also AD-2-compliant. Both are legal. But `src/app/dashboard/feedback/[id]/page.tsx` — the page shown for *both* request types today — now needs to branch its rendering/prop logic on which manager it called, or any shared component under `src/components/ui/*` (AD-10) that's meant to render "a feedback request card" generically can't, because the two domains hand it differently-shaped objects for what's structurally the same underlying row.

**Fix:** either fold this into the C2 fix (one shared `db/feedback.ts` naturally forces one shape for `feedback_requests` rows) or add a one-line Consistency Conventions row: "Manager return types: camelCase field names, ISO 8601 strings for all timestamps, `null` (never `undefined`) for absent optional DB columns." Low cost, removes an entire class of integration bugs at the boundary between two domains' output and any shared component consuming it.

### M2 — The identity/actor parameter shape passed into managers isn't specified

**AD:** Consistency Conventions → "Auth/session: ... identity is passed in as a parameter."

**The gap:** the convention states *that* identity flows in as a parameter, not its type. `requireApiToken()` presumably returns something — but AD-5 doesn't say what (a member id string? `{ memberId, organizationId, role }`? the full member row?).

**Concrete scenario:** the cycles Route Handler's glue code passes `cyclesManager.closeCycleRequest(requestId, memberId)` (a bare string) while the feedback Route Handler's glue code passes `feedbackManager.closeFeedbackRequest(requestId, { actorMemberId, organizationId })` (an object) — both satisfy the literal convention ("identity is passed in as a parameter"), both are reasonable, and both are now permanently different call shapes that any shared middleware or the AD-8 test harness (which needs to impersonate an actor identically across domains for its auth-boundary-rejection test) has to special-case per domain.

**Fix:** define a shared `AuthenticatedActor` (or similarly named) type in `src/server/shared/auth.ts`, returned by `requireApiToken()`, and state that every manager's identity parameter is exactly that type. Small, mechanical, worth doing alongside AD-5 rather than after seven managers have already picked their own shape.

---

## Low

### L1 — Token wire format (AD-5/AD-6): genuinely fine, not a gap

The task brief specifically asked me to check whether two Route Handler implementers could disagree on cookie-vs-header for the new token, since AD-5's Rule only says "authenticate via `requireApiToken()`." Checked and this is **not** a real gap, for a structural reason rather than a documentation one: AD-5's `[ASSUMPTION]` already pins the wire format tightly ("carried as a separate httpOnly + Secure + SameSite=Lax cookie, not a browser-stored bearer token"), and — more importantly — the Consistency Conventions table centralizes the check in exactly one function ("`requireApiToken()` in `src/server/shared/auth.ts` is the single place Route Handlers check identity"). Two Route Handler implementers don't each write their own token-reading code; they both call the same function. A browser also attaches an httpOnly cookie automatically, so `src/lib/api/client.ts`'s `apiFetch<T>` needs no per-caller token-attachment logic either. There's no seam here for two people to diverge through. No new AD needed — leave as-is.

### L2 — Structural Seed's route list is asymmetric between cycles and feedback (symptom, not separate root cause)

The Structural Seed lists `cycles/[id]/close/route.ts` explicitly but no equivalent `feedback-requests/[id]/close/route.ts`, even though `closeFeedbackRequest` (today, via `close_ad_hoc_feedback_request`) is a real, separate operation from cycle closing. This is downstream of C2 (no assigned owner for the shared entity's operations) rather than an independent problem — once C2 is fixed, the missing route should fall out naturally. Flagging separately only so it isn't missed as "the seed already covers this."
