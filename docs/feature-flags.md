# Feature Flags

Per-domain rollback safety for the `db → managers → API` migration (Epic 1/3),
per `ARCHITECTURE-SPINE.md`'s AD-10. This is the first domain's flag
documented here; every later domain's own "Feature Flag and Rollback Safety"
story extends this file with its own section below, following the same
shape.

## Rule (AD-10, verbatim)

- Old and new code paths coexist per domain behind a simple env flag (e.g.
  `USE_NEW_API_CYCLES`, default off), **checked in exactly one place: the
  thin caller** (the Server Action delegate or Route Handler), never inside
  a manager -- managers stay flag-agnostic.
- **One domain, one flag, one deploy at a time -- never batched.**
- **Manual QA against a seeded scratch DB precedes every flip.**
- **The old path is deleted only after the new path survives one full
  production cycle** -- one complete Ciclo 360 lifecycle or 14 calendar
  days, whichever is longer (same phrasing epics.md/epic-3-context.md
  established).

## `USE_NEW_API_ADMIN_MEMBERS`

- **Domain:** admin/members/auth (org creation and rename, department
  creation, member invite/accept, sign in/out).
- **Default:** off/unset. Any value other than the exact literal string
  `"true"` (including `"false"`, empty, or absent) takes the old path.
- **Where it's checked:** once per call site, only in the thin caller --
  `src/app/actions/admin.ts`, `src/app/actions/members.ts`,
  `src/app/actions/auth.ts` (Server Actions), and
  `src/app/dashboard/page.tsx` (Server Component bootstrap). Never inside
  `src/server/managers/{admin,members,auth}Manager.ts` or
  `src/server/db/{admin,members,auth}.ts`.
- **New path:** calls `adminManager` / `membersManager` / `authManager`.
- **Old path:** calls Supabase directly (`supabase.rpc(...)`,
  `supabase.auth.*`), byte-preserved from before Story 3.4's thin-delegate
  refactor.
- **Regression test:** `tests/integration/admin-members-auth-flag-toggle.test.ts`
  (Story 3.5) -- proves the routing mechanism itself for a representative
  call site in each of the 4 touched files, both flag states, run by the
  normal `npm run test`. It does not verify old-vs-new business-logic
  equivalence; that is `tests/characterization/admin-members-auth-manager.test.ts`
  (Story 3.2, re-verified by Story 3.6) and
  `tests/characterization/admin-members-auth.test.ts` (Story 3.1's
  baseline).
- **Verified safe to flip:** Story 3.6 added
  `tests/integration/admin-members-auth-new-path-verification.test.ts`, which
  runs with the flag forced on against the local `supabase start` instance
  (no manager/RPC mocking) and covers both characterization-equivalence
  (Story 3.1's baseline re-run against the Server Actions/managers with the
  flag on) and auth/access-boundary rejection (non-admin and non-Supervisor
  callers rejected identically at both the Server Action and Route Handler
  layers). Both pass as of Story 3.6's completion -- this is the operational
  milestone AC3 describes, and the flag is now verified safe to flip per the
  manual QA checklist below.

### Manual QA checklist (before flipping to `true` anywhere)

Run against a local, seeded scratch DB only (`npx supabase start` +
`scripts/seed-demo-company.mjs`) -- never a shared/staging/production
database.

1. `npm run test` passes in full (characterization suites re-verified,
   plus this domain's toggle test) and `npx tsc --noEmit` / `npm run lint`
   are clean.
2. With `USE_NEW_API_ADMIN_MEMBERS=true` set for a local `npm run dev`
   process (Next.js only reads env vars at process start, so stop and
   restart `npm run dev` after setting/changing the var -- editing
   `.env.local` alone is not enough):
   - As the platform admin: create an organization from `/admin`, confirm
     the invite link/redirect matches the old path's shape, then rename
     the organization from `/admin/empresas/[id]`.
   - As a Supervisor: create a department and invite a member from
     `/dashboard/members`; confirm the invite redirect/query params match.
   - Sign up the invited member, accept the invite via `/dashboard`
     (bootstrap's `pendingInviteToken` branch), confirm membership is
     created correctly.
   - Sign in and sign out as that member; confirm both the Supabase
     session cookie and the `brujula_app_token` cookie are set/cleared as
     expected.
   - As a non-admin/non-Supervisor caller, confirm the platform-admin-only
     and Supervisor-only error messages still surface unchanged.
3. Repeat step 2 once more with the env var unset/`false` (again
   restarting `npm run dev` so the change takes effect), confirming the
   old path still behaves identically (this is the rollback path -- it
   must never have silently regressed while the new path was being built).

### Rollback procedure

If a problem is found with the new path after flipping
`USE_NEW_API_ADMIN_MEMBERS=true` in a real deployment:

1. Set `USE_NEW_API_ADMIN_MEMBERS` back to `false` (or unset it) in that
   deployment's environment configuration and redeploy/restart. No code
   change, no migration, no data fix is required -- the old direct-Supabase
   path is untouched and immediately live again at every one of the 9 call
   sites.
2. Confirm the rollback by exercising the manual QA checklist's step 2
   flows again against the now-old path.
3. File/record what broke before attempting to re-flip; do not re-flip
   until the underlying issue in the new path is fixed and re-verified
   per the checklist above.

### Deletion eligibility

The old path (the `else` branch at each of the 9 call sites, and this
flag check itself) becomes eligible for deletion only after the new path
has run in production with the flag on for one full Ciclo 360 lifecycle or
14 calendar days, whichever is longer, with no rollback needed in that
window. Deleting it is Epic 5's job, not any Epic 3 story's.

## `USE_NEW_API_CYCLES`

- **Domain:** cycle lifecycle (creating a 360 feedback cycle, organizing/
  updating its evaluators including the individual-account path, and
  finalizing/closing a cycle request -- the latter also unconditionally
  triggers AI-interpretation generation, unaffected by this flag either
  way). Cycles are higher-stakes than report groups or admin: a cycle,
  once created and organized, drives real invitations and real people's
  360 responses, and closing a request is an explicit, irreversible action
  taken by whoever requested the 360 -- "El usuario es el dueño de su
  proceso" (spec.md sección 4.1), not necessarily an "operator" in the
  platform-admin/Supervisor sense used elsewhere in this doc -- there is
  no batch process to silently retry it.
- **Default:** off/unset. Any value other than the exact literal string
  `"true"` (including `"false"`, empty, or absent) takes the old path.
- **Where it's checked:** once per call site, only in the thin caller --
  all 6 Server Actions in `src/app/actions/cycles.ts`
  (`createFeedbackCycle`, `finalizeCycleRequest`, `organizeCycleEvaluators`,
  `createIndividualCycleRequest`, `updateCycleRequestEvaluators`,
  `updateIndividualCycleRequestEvaluators`). Never inside
  `src/server/managers/cyclesManager.ts`, `src/server/db/cycles.ts`, or any
  `src/app/api/cycles/**` route handler.
- **New path:** calls `cyclesManager`'s matching function
  (`createCycle`/`closeRequest`/`organizeEvaluators`/
  `createIndividualRequest`/`updateRequestEvaluators`/
  `updateIndividualRequestEvaluators`).
- **Old path:** calls Supabase directly (`supabase.rpc(...)`),
  byte-preserved from before Story 3.10's thin-delegate refactor.
  `finalizeCycleRequest`'s AI-interpretation orchestration
  (`generateAiInterpretation`/`save_ai_interpretation`,
  `src/lib/aiInterpretation.ts`) is a deliberately unmigrated cross-domain
  helper that runs unconditionally, identically, in BOTH flag branches --
  it is not itself gated by this flag.
- **Regression test:** `tests/integration/cycles-flag-toggle.test.ts`
  (Story 3.11) -- proves the routing mechanism itself for a representative
  sample of 4 of the 6 call sites (`createFeedbackCycle`,
  `updateCycleRequestEvaluators`, `finalizeCycleRequest`,
  `organizeCycleEvaluators`), both flag states, run by the normal
  `npm run test`. It does not verify old-vs-new business-logic
  equivalence; that is Story 3.12's job, re-running Story 3.7's
  characterization baseline against the new path.

### Manual QA checklist (before flipping to `true` anywhere)

Run against a local, seeded scratch DB only (`npx supabase start` +
`scripts/seed-demo-company.mjs`) -- never a shared/staging/production
database. Given cycles' higher stakes, exercise every one of the 6 call
sites, not just the 3 this story's automated toggle test samples.

1. `npm run test` passes in full (characterization suites re-verified,
   plus this domain's toggle test) and `npx tsc --noEmit` / `npm run lint`
   are clean.
2. With `USE_NEW_API_CYCLES=true` set for a local `npm run dev` process
   (Next.js only reads env vars at process start, so stop and restart
   `npm run dev` after setting/changing the var -- editing `.env.local`
   alone is not enough):
   - As a Supervisor: create a new feedback cycle from
     `/dashboard/cycles/nueva` with at least one participant; confirm the
     redirect and the cycle/participants appear correctly on `/dashboard`.
   - Organize evaluators for a cycle participant; confirm the redirect and
     that the resulting request's evaluators match what was submitted.
   - Create an individual (self-service) 360 request via
     `/dashboard/feedback/nueva-360`; confirm the redirect and evaluator
     invites are created.
   - Update evaluators on both a company-cycle request (`/gestionar`) and
     an individual request; confirm both redirects and the updated
     evaluator lists.
   - Finalize (close) a cycle request; confirm the redirect, that the
     request's status flips to closed, and -- if `ANTHROPIC_API_KEY` is
     set locally -- that an AI interpretation is generated and saved (this
     side effect is identical in both flag states, so it is not itself
     evidence the flag worked, only that finalizing didn't break it).
   - As a non-Supervisor caller, confirm access is still correctly denied
     at every one of the 6 call sites.
3. Repeat step 2 once more with the env var unset/`false` (again
   restarting `npm run dev` so the change takes effect), confirming the
   old path still behaves identically (this is the rollback path -- it
   must never have silently regressed while the new path was being built).

### Rollback procedure

If a problem is found with the new path after flipping
`USE_NEW_API_CYCLES=true` in a real deployment:

1. Set `USE_NEW_API_CYCLES` back to `false` (or unset it) in that
   deployment's environment configuration and redeploy/restart. No code
   change, no migration, no data fix is required -- the old direct-Supabase
   path is untouched and immediately live again at every one of the 6 call
   sites.
2. Confirm the rollback by exercising the manual QA checklist's step 2
   flows again against the now-old path.
3. File/record what broke before attempting to re-flip; do not re-flip
   until the underlying issue in the new path is fixed and re-verified
   per the checklist above. Given cycles' higher stakes, treat any
   in-flight cycle or request created while the new path was live as
   needing manual verification that its data is consistent before
   resuming normal operation -- the old and new paths write through the
   same RPCs/tables, so no data migration is expected to be needed, but
   this should still be confirmed rather than assumed.

### Deletion eligibility

The old path (the `else` branch at each of the 6 call sites, and this
flag check itself) becomes eligible for deletion only after the new path
has run in production with the flag on for one full Ciclo 360 lifecycle or
14 calendar days, whichever is longer, with no rollback needed in that
window. Deleting it is Epic 5's job, not any Epic 3 story's.

## `USE_NEW_API_FEEDBACK`

- **Domain:** ad-hoc feedback requests (creating a request for a teammate
  or for oneself as an individual account, managing/updating its
  evaluators, canceling a request, and closing a request). This is the
  rollout sequence's anonymity-critical domain
  (`_bmad-output/planning-artifacts/architecture/architecture-brujula-gui-2026-09-11/.memlog.md`'s
  ADOPTED rollout-sequencing decision: report groups →
  admin/members+auth → cycles → **feedback (anonymity-critical)** →
  responder/invitation) -- epics.md's own Story 3.17 AC states the reason
  directly: "so that I can validate this anonymity-critical domain
  especially carefully before committing." The anonymity-threshold logic
  itself (spec.md §6: minimum 5 invitees, minimum 3 responses before any
  narrative content is shown) lives entirely inside the RPCs on both sides
  of this flag, unchanged and unduplicated by either path -- this flag
  only ever governs which layer *calls* those RPCs, never the threshold
  rule itself.
- **Default:** off/unset. Any value other than the exact literal string
  `"true"` (including `"false"`, empty, or absent) takes the old path.
- **Where it's checked:** once per call site, only in the thin caller --
  all 5 Server Actions in `src/app/actions/feedback.ts` that have a flag
  check (`createFeedbackRequest`, `createFeedbackRequestForIndividual`,
  `cancelFeedbackRequest`, `closeFeedbackRequest`,
  `updateFeedbackRequestEvaluators`). Never inside
  `src/server/managers/feedbackManager.ts`, `src/server/db/feedback.ts`, or
  any `src/app/api/feedback-requests/**` route handler.
  `submitFeedbackResponse` (the same file) has no flag check and is
  untouched -- it belongs to the responder/invitation domain (Stories
  3.19-3.24), a never-logged-in invitee's single-use-token path, not this
  domain.
- **New path:** calls `feedbackManager`'s matching function
  (`createRequest`/`createIndividualRequest`/`cancelRequest`/
  `closeRequest`/`updateRequestEvaluators`).
- **Old path:** calls Supabase directly (`supabase.rpc(...)`),
  byte-preserved from before Story 3.16's thin-delegate refactor.
- **Regression test:** `tests/integration/feedback-flag-toggle.test.ts`
  (Story 3.17) -- proves the routing mechanism itself for **all 5** of the
  5 call sites (feedback has only 5, small enough to sample fully rather
  than partially -- unlike cycles' own toggle test, which samples 4 of 6),
  both flag states, run by the normal `npm run test`. It does not verify
  old-vs-new business-logic equivalence, and does not touch the
  anonymity-threshold behavior at all; that full equivalence check --
  with explicit extra scrutiny on the threshold behavior specifically,
  per epics.md's Story 3.18 framing as "the highest-stakes verification
  in the whole migration" -- is Story 3.18's job, re-running Story 3.13's
  characterization baseline against the new path.
- **Verified safe to flip:** Story 3.18 added
  `tests/integration/feedback-new-path-verification.test.ts`, which runs
  with the flag forced on against the local `supabase start` instance (no
  manager/RPC mocking) and re-runs every one of Story 3.13's characterized
  scenarios against the new path, with explicit extra scrutiny on the
  anonymity-threshold behavior (dedicated exactly-2-responses/below-floor
  and exactly-3-responses/at-floor scenarios) -- the product's core trust
  guarantee, provably unchanged. It also statically confirms
  `db/feedback.ts` and `db/cycles.ts` never cross-call each other's RPCs
  (the complete set both ways, not a named subset), completing the
  symmetric AD-3 ownership-split check Story 3.12 could only do one-sided.
  All checks pass as of Story 3.18's completion -- this is the operational
  milestone the epics.md AC describes, and the flag is now verified safe
  to flip per the manual QA checklist below.

### Manual QA checklist (before flipping to `true` anywhere)

Run against a local, seeded scratch DB only (`npx supabase start` +
`scripts/seed-demo-company.mjs`) -- never a shared/staging/production
database. Given this domain's anonymity-critical stakes, exercise every
one of the 5 call sites, and pay particular attention to the
anonymity-threshold boundary (spec.md §6: minimum 5 invitees, minimum 3
responses) on both sides of the flag, not just the happy path.

1. `npm run test` passes in full (characterization suites re-verified,
   plus this domain's toggle test) and `npx tsc --noEmit` / `npm run lint`
   are clean.
2. With `USE_NEW_API_FEEDBACK=true` set for a local `npm run dev` process
   (Next.js only reads env vars at process start, so stop and restart
   `npm run dev` after setting/changing the var -- editing `.env.local`
   alone is not enough):
   - Create an ad-hoc feedback request for a teammate from
     `/dashboard/feedback/nueva`; confirm the redirect and that the
     request appears correctly on `/dashboard`.
   - Create an individual (self-service) ad-hoc request for oneself;
     confirm the redirect and evaluator invites are created.
   - Update evaluators on a request; confirm the redirect and that the
     resulting evaluator list matches what was submitted.
   - Cancel a request; confirm the redirect and that the request no
     longer accepts responses.
   - With fewer than 5 invitees or fewer than 3 responses, close a
     request and confirm the narrative report still correctly shows the
     "esperando más respuestas" state rather than any content -- then
     repeat at/above the threshold and confirm the narrative renders.
     This boundary must behave identically to the old path; it is the
     product's core trust guarantee for this domain.
   - As a caller without access to the request, confirm access is still
     correctly denied at every one of the 5 call sites.
3. Repeat step 2 once more with the env var unset/`false` (again
   restarting `npm run dev` so the change takes effect), confirming the
   old path still behaves identically (this is the rollback path -- it
   must never have silently regressed while the new path was being
   built), including the same anonymity-threshold boundary checks.

### Rollback procedure

If a problem is found with the new path after flipping
`USE_NEW_API_FEEDBACK=true` in a real deployment:

1. Set `USE_NEW_API_FEEDBACK` back to `false` (or unset it) in that
   deployment's environment configuration and redeploy/restart. No code
   change, no migration, no data fix is required -- the old direct-Supabase
   path is untouched and immediately live again at every one of the 5 call
   sites.
2. Confirm the rollback by exercising the manual QA checklist's step 2
   flows again against the now-old path, including the anonymity-threshold
   boundary checks.
3. File/record what broke before attempting to re-flip; do not re-flip
   until the underlying issue in the new path is fixed and re-verified
   per the checklist above. Given this domain's anonymity-critical stakes,
   treat any in-flight request created or evaluators changed while the new
   path was live as needing manual verification that its data -- and in
   particular its threshold-boundary behavior -- is consistent before
   resuming normal operation -- the old and new paths write through the
   same RPCs/tables, so no data migration is expected to be needed, but
   this should still be confirmed rather than assumed.

### Deletion eligibility

The old path (the `else` branch at each of the 5 call sites, and this
flag check itself) becomes eligible for deletion only after the new path
has run in production with the flag on for one full Ciclo 360 lifecycle or
14 calendar days, whichever is longer, with no rollback needed in that
window. Deleting it is Epic 5's job, not any Epic 3 story's.

## `USE_NEW_API_RESPONDER`

- **Domain:** responder/invitation -- the single-use-token flow an
  anonymous, never-logged-in evaluator uses to answer a feedback request
  (`/responder/[token]` and `/invitacion/[token]`, plus
  `submitFeedbackResponse` in `src/app/actions/feedback.ts`, the one
  Server Action in this domain). This is the most cautious rollout of any
  domain in this migration -- external, anonymous, customer-facing, and
  migrated last on purpose (epics.md's Story 3.23 AC). Per
  `epic-3-context.md`: "Responder/invitation's flag (3.23, gated by 3.24)
  is explicitly sequenced last: it flips only after admin/members, cycles,
  and feedback have each already survived their own full production cycle
  -- not simply after its own tests pass." Story 3.24's own AC states it
  even more plainly: "this domain does not go first under any
  circumstance," regardless of how quickly its own tests pass.
- **Default:** off/unset. Any value other than the exact literal string
  `"true"` (including `"false"`, empty, or absent) takes the old path.
- **Where it's checked:** once per call site, only in the thin caller --
  all 3 call sites: `submitFeedbackResponse` (`src/app/actions/feedback.ts`,
  a Server Action), and the two Server Components
  `src/app/responder/[token]/page.tsx` and
  `src/app/invitacion/[token]/page.tsx`. Never inside
  `src/server/managers/responderManager.ts`, `src/server/db/responder.ts`,
  or any `src/app/api/responder/**`/`src/app/api/invitacion/**` route
  handler.
- **New path:** calls `responderManager`'s matching function
  (`submitResponse`/`getContext`/`getInviteDetails`).
- **Old path:** calls Supabase directly (`supabase.rpc(...)`,
  `supabase.from(...)`), byte-preserved from before Story 3.22's
  thin-delegate refactor.
- **Regression test:**
  `tests/integration/responder-invitation-flag-toggle.test.ts` (Story
  3.23) -- proves the routing mechanism itself for all 3 call sites, both
  flag states plus a literal-`"false"` spot-check, run by the normal
  `npm run test`. The two page components are Server Components, not
  Server Actions, but their flag routing IS automatable: calling the
  exported async function directly and asserting on which dependency
  fired, without rendering JSX -- the same technique already proven by
  `DashboardPage()` in `tests/integration/admin-members-auth-flag-toggle.test.ts`
  (discovered during this story's own review, correcting an earlier,
  now-refuted assumption that Server Components "stay manually verified").
  This regression test does not verify old-vs-new business-logic
  equivalence and does not touch token-validity edge cases at all; that
  full re-run against Story 3.19's characterization baseline, with
  explicit extra scrutiny on token validity, is Story 3.24's job.
- **Verified safe to flip:** Story 3.24 added
  `tests/integration/responder-invitation-new-path-verification.test.ts`,
  which runs with the flag forced on against the local `supabase start`
  instance (no manager/RPC mocking) and re-runs every one of Story 3.19's
  characterized scenarios against the new path -- `responderManager`'s
  `getContext`/`getInviteDetails` called in-process and
  `submitFeedbackResponse` through the real Server Action -- asserting the
  exact same values/redirects/error messages the baseline recorded,
  including the wrong-user and malformed-token rejection paths and the
  RPC's own `requires_login`-before-`used_at` branch-priority behavior. It
  also calls `RespondPage`/`InvitationPage` directly (the same technique
  the regression test above uses, but against real seeded data instead of
  mocks) across their full range of states -- valid, invalid, malformed
  token, member-invite-not-logged-in, and (for `RespondPage`) the used
  and valid-unused states that exercise the new path's field-adapter
  mapping inside the page component itself -- confirming each completes
  without an unexpected throw and that `redirect()` fires with the
  correct target where applicable. All checks pass as of Story 3.24's
  completion. Given this domain's exceptional stakes, this is necessary
  but not sufficient on its own: per epics.md's own AC, the flag is not
  considered safe to actually flip until report groups, admin/members,
  cycles, and feedback have each also survived their own full production
  cycle, per the sequencing gate in the Manual QA checklist below.

### Manual QA checklist (before flipping to `true` anywhere)

Run against a local, seeded scratch DB only (`npx supabase start` +
`scripts/seed-demo-company.mjs`) -- never a shared/staging/production
database. This domain does not go first under any circumstance: do not
flip `USE_NEW_API_RESPONDER=true` anywhere -- including a local scratch DB
walkthrough beyond this checklist, let alone any real deployment -- until
report groups (Epic 1's POC domain, already fully migrated -- no flag
remains to check), `USE_NEW_API_ADMIN_MEMBERS`, `USE_NEW_API_CYCLES`, and
`USE_NEW_API_FEEDBACK` have each already survived their own full
production cycle (one complete Ciclo 360 lifecycle or 14 calendar days,
whichever is longer, with no rollback needed), and Story 3.24's re-run of
Story 3.19's characterization baseline against the new path has passed
with no discrepancy, including every token-validity edge case (valid,
expired, invalid, already-used).

1. `npm run test` passes in full (characterization suites re-verified,
   plus this domain's toggle test) and `npx tsc --noEmit` / `npm run lint`
   are clean.
2. With `USE_NEW_API_RESPONDER=true` set for a local `npm run dev` process
   (Next.js only reads env vars at process start, so stop and restart
   `npm run dev` after setting/changing the var -- editing `.env.local`
   alone is not enough):
   - As an anonymous evaluator (no session), open `/responder/{token}` for
     a valid, unused, non-expired token; confirm the questions render
     identically to the old path, submit a response, and confirm the
     redirect lands back on `/responder/{token}` showing the "gracias por
     tu feedback" state.
   - Open `/invitacion/{token}` for a token issued through a fresh
     member invite (not the ad-hoc responder flow -- this page is a
     sign-up entry point, not a feedback-submission page); confirm the
     sign-up form renders identically to the old path -- organization
     name, the invitee's read-only email, and a password field --
     sourced from this page's own `getInviteDetails` call. Its own form
     submission goes through `acceptInviteSignUp`
     (`src/app/actions/auth.ts`), which has no flag and is out of scope
     for this checklist entirely.
   - As an evaluator who signed in (has a session) before submitting,
     submit a response and confirm the redirect lands on
     `/dashboard?responded=1` instead.
   - Exercise every token-validity edge case manually on both page
     components: an expired token, an invalid/unknown token, and an
     already-used token -- confirm each shows the same messaging as the
     old path.
   - Confirm `submitFeedbackResponse`'s own flag routing (already proven
     automatically by this domain's toggle test) also holds end-to-end
     through `/responder/{token}`'s submit form -- the only one of the
     two page components whose submission goes through it.
3. Repeat step 2 once more with the env var unset/`false` (again
   restarting `npm run dev` so the change takes effect), confirming the
   old path still behaves identically (this is the rollback path -- it
   must never have silently regressed while the new path was being
   built), including the same token-validity edge cases.

### Rollback procedure

If a problem is found with the new path after flipping
`USE_NEW_API_RESPONDER=true` in a real deployment:

1. Set `USE_NEW_API_RESPONDER` back to `false` (or unset it) in that
   deployment's environment configuration and redeploy/restart. No code
   change, no migration, no data fix is required -- the old direct-Supabase
   path is untouched and immediately live again at every one of the 3 call
   sites.
2. Confirm the rollback by exercising the manual QA checklist's step 2
   flows again against the now-old path, including the token-validity
   edge cases.
3. File/record what broke before attempting to re-flip; do not re-flip
   until the underlying issue in the new path is fixed and re-verified
   per the checklist above. Given this domain's external, anonymous,
   customer-facing stakes -- the worst possible outcome in this whole
   migration, per Story 3.24's own framing -- treat any in-flight
   responses submitted while the new path was live as needing manual
   verification that they were recorded consistently before resuming
   normal operation -- the old and new paths write through the same
   RPCs/tables, so no data migration is expected to be needed, but this
   should still be confirmed rather than assumed.

### Deletion eligibility

The old path (the flag check and old branch at each of the 3 call sites)
becomes eligible for deletion only after the new path has run in
production with the flag on for one full Ciclo 360 lifecycle or 14
calendar days, whichever is longer, with no rollback needed in that
window -- and only after this domain's own flip, which per this section's
sequencing constraint cannot happen until admin/members, cycles, and
feedback have each already completed this same cycle. Deleting it is
Epic 5's job, not any Epic 3 story's.

## `USE_NEW_API_REPORTS`

- **Domain:** read-only reports -- the 3 read-only Server Component pages a
  signed-in member views: the dashboard home (`/dashboard`),
  `/dashboard/mi-mapa` (the caller's own competency map), and
  `/dashboard/informe-empresa` (a Supervisor's organization-wide
  competency summary). No Server Actions are in this domain, only
  page-level reads. Unlike every other domain migrated so far, this one
  composes reads from **4 separate managers** (`feedbackManager`,
  `cyclesManager`, `reportGroupsManager`, `membersManager`) across **6
  total flag-gated reads**: `dashboard/page.tsx`'s own 4 (`myRequests`'s
  ad-hoc half via `feedbackManager.getMyAdHocRequests`, its cycle half via
  `cyclesManager.getMyCycleRequests` -- also reused for
  `cycleRequestByCycleId`, `openCycles` via
  `cyclesManager.getMyOpenCycles`, `pendingGroups` via
  `reportGroupsManager.getMyReportGroups`), `mi-mapa/page.tsx`'s 1
  (`mapData` via `feedbackManager.getMyCompetencyMap`), and
  `informe-empresa/page.tsx`'s 1 (`summaryData` via
  `membersManager.getOrganizationCompetencySummary`). Each page's own
  `frameworkData` read (`competency_frameworks`) stays an unconditional
  direct Supabase call in both branches, out of this flag's scope, per
  Story 3.28's own Implementation Notes. This is a low-risk domain --
  read-only, no writes, no anonymity-sensitive threshold logic -- so it
  carries no cross-domain sequencing gate the way responder/invitation
  does: epics.md's own Story 3.29 AC frames it as "this low-risk domain
  still gets the same rollback safety as every other domain, for
  consistency", a materially different framing from responder/
  invitation's explicit "does not go first under any circumstance"
  (Story 3.23/3.24's own AC text).
- **Default:** off/unset. Any value other than the exact literal string
  `"true"` (including `"false"`, empty, or absent) takes the old path.
- **Where it's checked:** once per read, only in the thin caller --
  `src/app/dashboard/page.tsx` (4 checks), `src/app/dashboard/mi-mapa/page.tsx`
  (1 check), `src/app/dashboard/informe-empresa/page.tsx` (1 check). Never
  inside `src/server/managers/{feedback,cycles,reportGroups,members}Manager.ts`
  or `src/server/db/*.ts`.
- **New path:** calls `feedbackManager.getMyAdHocRequests`/
  `getMyCompetencyMap`, `cyclesManager.getMyCycleRequests`/
  `getMyOpenCycles`, `reportGroupsManager.getMyReportGroups`,
  `membersManager.getOrganizationCompetencySummary`, mapping each
  manager's camelCase rows back to each page's own pre-existing
  snake_case local shape so every downstream render stays untouched.
- **Old path:** calls Supabase directly (`supabase.rpc(...)`,
  `supabase.from(...)`), byte-preserved from before Story 3.28's
  thin-delegate refactor.
- **Regression test:** `tests/integration/read-only-reports-flag-toggle.test.ts`
  (Story 3.29) -- proves the routing mechanism itself for all 3 pages,
  across all 3 flag states (`"true"`, unset, and the literal string
  `"false"`), run by the normal `npm run test`. It does not verify
  old-vs-new business-logic/output equivalence; that is
  `tests/integration/read-only-reports-thin-delegate.test.ts` (Story 3.28,
  18 tests, including explicit manager-call-count assertions and
  rendered-HTML equivalence for every I/O edge case) and, re-run against
  the frozen characterization baseline, Story 3.30's job.
- **Verified safe to flip:** Story 3.30 added
  `tests/integration/read-only-reports-new-path-verification.test.ts`,
  which runs with the flag toggled (per-page-call, old then new, against
  the identical seeded state) against the local `supabase start` instance
  -- no manager/RPC mocking -- and re-runs Story 3.25's characterized
  scenarios across all 3 pages using the same `renderToStaticMarkup`
  equivalence technique Story 3.28 already proved, asserting the two
  renders are byte-identical. This is the first time this domain's new
  path was exercised end-to-end against genuinely real, unmocked Supabase.
  One investigated finding along the way: dashboard/page.tsx's own richest
  render state (open ad-hoc + open cycle request + unorganized open cycle
  + pending report group, all at once) cannot occur on any single real
  member's dashboard, because `create_feedback_cycle`'s "one open cycle at
  a time" rule (`supabase/migrations/0023_one_open_cycle_at_a_time.sql`)
  and `create_report_group`'s closed-cycle-only invitee guard
  (`supabase/migrations/0064_report_groups.sql`) are mutually exclusive
  with "open cycle request" for the same member -- so the equivalence
  check covers each element of that state as its own real, independently
  seeded scenario instead (a third minimal org built solely to reach the
  "unorganized open cycle" state, since every org-A employee is already
  organized by the time `scripts/seed-demo-company.mjs` finishes). All
  checks pass as of Story 3.30's completion -- this is the operational
  milestone epics.md's own Story 3.30 AC describes ("all six domains have
  independently proven old-vs-new equivalence, and Epic 5 can begin"), and
  the flag is now verified safe to flip per the manual QA checklist below.

### Manual QA checklist (before flipping to `true` anywhere)

Run against a local, seeded scratch DB only (`npx supabase start` +
`scripts/seed-demo-company.mjs`) -- never a shared/staging/production
database.

1. `npm run test` passes in full (characterization suites re-verified,
   plus this domain's toggle test) and `npx tsc --noEmit` / `npm run lint`
   are clean.
2. With `USE_NEW_API_REPORTS=true` set for a local `npm run dev` process
   (Next.js only reads env vars at process start, so stop and restart
   `npm run dev` after setting/changing the var -- editing `.env.local`
   alone is not enough):
   - As a member with at least one open ad-hoc request, one open cycle
     request, an unorganized open cycle, and a pending report-group
     invite: open `/dashboard` and confirm every section ("Tareas
     pendientes", "Mis feedbacks en curso", "Ciclos 360 abiertos") matches
     the old path exactly.
   - As a member who has closed at least one 360: open
     `/dashboard/mi-mapa` and confirm the competency radar and
     highlighted/challenged mentions match the old path.
   - As a Supervisor with revealed organization feedback: open
     `/dashboard/informe-empresa` and confirm the aggregate radar matches
     the old path.
   - Repeat each of the three pages once more for its corresponding
     empty/edge state (no pending items, never-closed 360, no revealed
     data) and confirm the empty-state messaging matches.
3. Repeat step 2 once more with the env var unset/`false` (again
   restarting `npm run dev` so the change takes effect), confirming the
   old path still behaves identically (this is the rollback path -- it
   must never have silently regressed while the new path was being
   built).

### Rollback procedure

If a problem is found with the new path after flipping
`USE_NEW_API_REPORTS=true` in a real deployment:

1. Set `USE_NEW_API_REPORTS` back to `false` (or unset it) in that
   deployment's environment configuration and redeploy/restart. No code
   change, no migration, no data fix is required -- the old direct-Supabase
   path is untouched and immediately live again at every one of the 6
   flag-gated reads across all 3 pages.
2. Confirm the rollback by exercising the manual QA checklist's step 2
   flows again against the now-old path.
3. File/record what broke before attempting to re-flip; do not re-flip
   until the underlying issue in the new path is fixed and re-verified
   per the checklist above. Since this domain is entirely read-only, no
   in-flight write is at risk -- there is nothing to reconcile beyond
   confirming the pages themselves render correctly again.

### Deletion eligibility

The old path (the flag check and old branch at each of the 6 reads across
the 3 pages) becomes eligible for deletion only after the new path has run
in production with the flag on for one full Ciclo 360 lifecycle or 14
calendar days, whichever is longer, with no rollback needed in that
window. Deleting it is Epic 5's job, not any Epic 3 story's.
