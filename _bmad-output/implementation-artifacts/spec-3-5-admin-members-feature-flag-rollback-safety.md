---
title: 'Admin/Members Feature Flag and Rollback Safety'
type: 'feature'
created: '2026-09-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1d19c57'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.4 already built the `USE_NEW_API_ADMIN_MEMBERS` flag mechanism (default off, old path byte-preserved, checked only in each thin caller) and manually proved both branches pass the characterization suite once. But that flag-ON proof was a one-off manual run (`USE_NEW_API_ADMIN_MEMBERS=true npx vitest run ...`) — the normal `npm run test` command never exercises the flag-ON path, so nothing guards against a future refactor silently breaking the toggle mechanism itself. Separately, no rollback/QA procedure or env-var documentation exists anywhere in the repo for operating this flag safely, a real, pre-existing repo-wide gap (first flagged in Story 1.4's deferred-work.md entry, never resolved since).

**Scope correction (investigated, not guessed):** unlike Story 1.7 (report-groups' equivalent story, resolved as "not applicable, no code" because Story 1.6 deleted the old path outright), this story has real content: Story 3.4 deliberately kept both paths alive and reachable, per the binding forward-guidance `spec-1-7` itself recorded for Epic 3. epics.md's own AC for this story (`Given flag off, old path runs unchanged` / `Given flag on, new path runs, checked only in the thin caller` / `Given one full production cycle with flag on, old path becomes eligible for deletion — executed in Epic 5`) is already functionally satisfied by Story 3.4's implementation; this story's job is to make that fact durable (a permanent regression test, not a manual proof) and operational (a rollback/QA doc, since none exists). It explicitly does **not** attempt full old-vs-new business-logic equivalence — that is Story 3.6's separate, dedicated job (deep verification against the Story 3.1 characterization baseline). It also does not flip the flag or delete the old path (Epic 5's job).

**Naming note:** epics.md names the flag `USE_NEW_API_ADMINMEMBERS` (no separating underscore); Story 3.4's shipped, reviewed, already-tested code uses `USE_NEW_API_ADMIN_MEMBERS` (readable, matches the underscore convention `epic-3-context.md` itself documents as `USE_NEW_API_<DOMAIN>`). Kept as-is — renaming already-shipped code purely for cosmetic match to a planning doc's own inconsistent spelling is not worth the churn or re-review risk.

**Approach:** Three additive deliverables, no changes to any existing action/manager/route file's logic: (1) a new, small, permanent test file that proves the flag-routing mechanism itself (not full business equivalence) for a representative sample of call sites, run by the normal `npm run test`; (2) `docs/feature-flags.md`, a new living doc (first of its kind — future domains' equivalent stories extend it) recording this flag's default, the manual-QA-before-flip checklist, and the rollback procedure, per the architecture spine's AD-10; (3) the repo's first `.env.example`, documenting `USE_NEW_API_ADMIN_MEMBERS` alongside the other previously-undocumented required vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `APP_TOKEN_SECRET`) — resolving Story 1.4's long-standing deferred-work.md gap as a natural side effect of documenting this flag correctly.

## Boundaries & Constraints

**Always:**
- The new toggle test spies on the manager functions (`adminManager`, `membersManager`, `authManager`) and on `supabase.rpc`/`supabase.auth.*` to prove *which path was taken*, not to re-verify business-logic correctness (that's Story 3.6's job) — assert call/no-call, not deep output equivalence.
- Cover a representative sample across all 4 touched files (at least one call site each from `admin.ts`, `members.ts`, `auth.ts`, `dashboard/page.tsx`), for both flag states (`"true"` → manager called, Supabase not called directly; unset/`"false"`/any-other-string → Supabase called, manager not called).
- `docs/feature-flags.md` states, near-verbatim from AD-10: one domain, one flag, one deploy at a time (never batched); manual QA against a seeded scratch DB precedes every flip; the old path is deleted only after the new path survives one full production cycle (one Ciclo 360 lifecycle or 14 calendar days, whichever is longer — matching the phrasing epics.md/epic-3-context.md established).
- `.env.example` documents every var it lists with a one-line comment (purpose, default, where it's read) — no live secrets, only variable names and non-secret example/default values.

**Never:**
- Do not modify any existing logic in `src/app/actions/{admin,members,auth}.ts`, `src/app/dashboard/page.tsx`, `src/server/db/*`, `src/server/managers/*`, or `src/app/api/**` — this story is additive-only (new test file, new docs).
- Do not set `USE_NEW_API_ADMIN_MEMBERS=true` anywhere in committed code, config, `.env.example`'s own default, or any CI-equivalent — it must default off/unset everywhere this story touches.
- Do not attempt deep old-vs-new business-logic equivalence testing — that is Story 3.6's scope, not this one's; duplicating it here would be redundant.
- Do not delete the old code path or write any rollback tooling that executes deletion — Epic 5's job, this story only documents the procedure.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `createOrganizationAsAdmin`, flag `"true"` | env var set | `adminManager.createOrganization` spy called; `supabase.rpc` not called for this action | N/A |
| `createOrganizationAsAdmin`, flag unset | env var absent | `supabase.rpc("create_organization_as_admin", ...)` called; manager spy not called | N/A |
| `inviteMember`, flag `"true"` | env var set | `membersManager.inviteNewMember` spy called; `supabase.rpc` not called | N/A |
| `signIn`, flag `"true"` | env var set | `authManager.signIn` spy called; `supabase.auth.signInWithPassword` not called | N/A |
| `dashboard/page.tsx` bootstrap, flag `"true"` | env var set, `pendingInviteToken` present | `membersManager.acceptInvite` spy called; `supabase.rpc("accept_member_invite", ...)` not called | N/A |
| Any of the above, flag `"false"` (string, not just unset) | env var literally `"false"` | same as unset -- old path runs (only the literal string `"true"` activates the new path) | N/A |

</frozen-after-approval>

## Code Map

- `src/app/actions/admin.ts`, `members.ts`, `auth.ts`, `src/app/dashboard/page.tsx` (Story 3.4) -- read-only reference: exact `if (process.env.USE_NEW_API_ADMIN_MEMBERS === "true") {...} else {...}` shape at all 9 call sites to spy on.
- `tests/characterization/admin-members-auth-manager.test.ts` (Story 3.2/3.4) -- mocking pattern to reuse: `vi.mock("@/lib/supabase/server", ...)`, `vi.mock("next/headers", ...)` token-bearer/real-session dual mode. This story's new test file should additionally `vi.mock` (or `vi.spyOn`) the manager modules themselves, which existing suites don't do (they call the real managers against the real local Supabase instance) -- this story specifically needs to prove *routing*, so spying on the manager entry points (not letting them run for real) is appropriate and different from prior suites' approach.
- `_bmad-output/implementation-artifacts/epic-3-context.md` -- `USE_NEW_API_<DOMAIN>` naming convention, flag rules (Technical Decisions section).
- `_bmad-output/planning-artifacts/architecture/architecture-brujula-gui-2026-09-11/ARCHITECTURE-SPINE.md` -- AD-10 (rollback safety via per-domain feature flags), verbatim rule to reproduce in `docs/feature-flags.md`.
- `_bmad-output/implementation-artifacts/spec-1-7-report-groups-feature-flag-and-rollback-safety.md` -- precedent for this story's shape and the source of the binding Epic 3 forward-guidance this story's Intent references; the "one full production cycle" phrasing itself originates in epics.md/epic-3-context.md, not here.
- `_bmad-output/implementation-artifacts/deferred-work.md` (Story 1.4 entry) -- the pre-existing `.env.example` gap this story's third deliverable resolves as a side effect.
- No `docs/feature-flags.md` or `.env.example` exists yet anywhere in the repo (confirmed via repo-wide search) -- both are net-new.

## Tasks & Acceptance

**Execution:**
- [x] `tests/integration/admin-members-auth-flag-toggle.test.ts` -- new -- proves flag routing for the 6 I/O-matrix scenarios above
- [x] `docs/feature-flags.md` -- new -- documents `USE_NEW_API_ADMIN_MEMBERS`: default, manual-QA-before-flip checklist, rollback procedure, deletion-eligibility timeline
- [x] `.env.example` -- new -- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `APP_TOKEN_SECRET`, `USE_NEW_API_ADMIN_MEMBERS` (default `false`), each with a one-line purpose comment

**Acceptance Criteria:**
- Given `npm run test` (no env var set beforehand), when it runs, then the new toggle test file's flag-unset scenarios pass, proving old-path routing is exercised by the normal test command.
- Given the same `npm run test` run, when the toggle test file sets `USE_NEW_API_ADMIN_MEMBERS="true"` for its own flag-on scenarios (scoped to that file/test, not the whole suite), then those scenarios pass too, proving new-path routing without requiring a manual external env var.
- Given `docs/feature-flags.md` and `.env.example`, when read, then no instance sets or defaults the flag to `true`, and both are internally consistent about the flag's default (off).
- Given Stories 3.1-3.4's full test suites, when this story is complete, then they still pass unchanged (133/133 plus this story's new tests).

## Implementation Notes

Three additive deliverables, exactly as scoped -- no existing action/manager/route/db file was touched:

- `tests/integration/admin-members-auth-flag-toggle.test.ts` (new, 9 tests): proves routing for all 6 I/O-matrix scenarios plus 3 extra symmetric "flag unset" checks (inviteMember/signIn/dashboard-bootstrap each got an explicit unset-side test too, not just createOrganizationAsAdmin's three-way true/unset/"false" set). Managers (`adminManager`, `membersManager`, `authManager`) are `vi.mock()`-replaced with `vi.fn()` spies -- unlike every prior admin/members/auth suite, this one does not run managers for real against local Supabase, since the point is routing, not behavior (Story 3.6's job). `@/lib/supabase/server` is replaced with an in-memory fake client (rpc-call-name recorder + auth.* spies + a minimal chainable/thenable `from()` query builder), so this file needs no real `supabase start` instance and no `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY`. One exception: the `signIn` flag-unset test exercises the real old-path `signAppToken()` call, which throws if `APP_TOKEN_SECRET` is unset -- that var must still be present in the environment (supplied globally by `.env.test.local`, same as every other suite in this repo). `next/navigation`, `next/cache`, `next/headers` are mocked with the same "throw a redirect marker" / in-memory-cookie-jar pattern `tests/characterization/admin-members-auth.test.ts` already established. `USE_NEW_API_ADMIN_MEMBERS` is set/deleted per-test (`beforeEach`/`afterEach`), never at module or file scope, so no leakage into other test files.
- `docs/feature-flags.md` (new): reproduces AD-10's rule near-verbatim, then documents `USE_NEW_API_ADMIN_MEMBERS` specifically (default, where it's checked, new/old path, the regression test), a manual-QA-before-flip checklist against a local seeded DB, a rollback procedure (unset the var, redeploy, no code/migration change needed), and the deletion-eligibility timeline (one full Ciclo 360 lifecycle or 14 days, whichever is longer -- epics.md/epic-3-context.md's phrasing).
- `.env.example` (new, first in the repo): documents `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (both with the fixed, publicly-known local `supabase start` values -- not secrets), `APP_TOKEN_SECRET` (blank, with a one-line `node -e crypto.randomBytes` generation command, no live secret), and `USE_NEW_API_ADMIN_MEMBERS=false`, each with a one-line purpose/default/where-read comment. Resolves Story 1.4's deferred-work.md gap as a side effect, per this spec's Intent.
- `.gitignore`: added a single `!.env.example` exception under the existing `.env*` rule (which already carries an explicit "(can opt-in for committing if needed)" comment) -- otherwise the new `.env.example` would itself be silently gitignored and never committed. No other line changed.

Not touched, as the frozen "Never" list requires: `src/app/actions/{admin,members,auth}.ts`, `src/app/dashboard/page.tsx`, `src/server/db/*`, `src/server/managers/*`, `src/app/api/**`. The flag is not set to `"true"` by default anywhere; `.env.example` ships `false`.

## Spec Change Log

## Review Triage Log

**3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap):**

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | Flag set to a non-`"true"`/non-`"false"` string (e.g. `"1"`) is never exercised by a dedicated test | false | — | No distinct code branch exists for any non-`"true"` value — the `=== "true"` check routes every other string identically to the already-tested `"false"` case. No additional risk the existing test misses. |
| 2 | The fake Supabase client's `rpc()` fixture doesn't implement `.single()` for the `create_individual_account` branch, unlike `dashboard/page.tsx`'s real call | low | patch | Real latent bug in test fixture code, but currently unreached — no test in this file exercises the `pendingIndividualSignup` branch. Would throw a confusing `TypeError` if a future test tried to. Trivial fix. |
| 3 | Both dashboard-bootstrap tests execute the `checkIsPlatformAdmin`/`claimPendingInvitations` flag branches but never assert which path was taken for either | medium | patch | Independently found by both Edge Case Hunter (2 separate findings) and corroborated by Blind Hunter's "thin coverage" note. Real gap at a file already within this story's chosen coverage — these are exactly the two call sites Story 3.4's own review found unguarded/buggy, making leaving them unasserted here a real, cheaply-closable risk. |
| 4 | `updateOrganizationName`, `createDepartment`, `signOut`, and the dashboard's 2 branches above have no toggle coverage at all — only 4 of the domain's 9 flag sites are tested | n/a | defer | The frozen Intent/Boundaries explicitly scoped this story to "a representative sample... at least one call site each" across the 4 files, deliberately not exhaustive coverage (full equivalence testing is Story 3.6's separate job). Excluded by the intent itself, not just the spec's scope section — logged for awareness, not a gap this story's frozen scope calls for closing. |
| 5 | Spec and `docs/feature-flags.md` say the flag is checked at "8 call sites"; actual count is 9 (2+2+2+3) | low | patch | Verified via direct grep: `admin.ts`(2) + `members.ts`(2) + `auth.ts`(2) + `dashboard/page.tsx`(3) = 9. Repeats a miscount already present in Story 3.4's own (historical, unedited) deferred-work.md entry. |
| 6 | The "one full Ciclo 360 lifecycle or 14 calendar days" phrasing is credited to Story 1.7 three times, but `spec-1-7` (resolved "not applicable, no code") never contains that phrase — it originates in epics.md/prd.md/epic-3-context.md | low | patch | Verified: `spec-1-7`'s actual content has no numeric timeline (it has no code/content beyond the resolution decision). Mis-citation, not a substantive error — the rule itself is correctly stated. |
| 7 | `README.md:19` still instructs "Copia `.env.local.example` a `.env.local`" — a filename that has never existed; this story adds the repo's first such file but names it `.env.example` and doesn't touch the README | low | patch | Real, verified stale instruction that would confuse a new contributor. Pre-existing staleness, but this story is uniquely positioned to close it now that a real file exists, and doing so directly serves this story's own onboarding-documentation goal. |
| 8 | `deferred-work.md`'s Story 1.4 and Story 3.4 entries aren't annotated/closed even though this story resolves/partially-mitigates them | false | — | `deferred-work.md` is an established append-only historical log in this project (confirmed by the workflow's own defer-routing rule: "do not modify existing entries") — not a live tracker with resolution annotations. Matches how every other resolved-by-later-work entry has been left untouched all session. |
| 9 | `.env.example`'s `NEXT_PUBLIC_SUPABASE_ANON_KEY` comment overstates the key's specificity ("this repo's project id") when it's actually the Supabase CLI's universal local-dev default | low | patch | Verified: `supabase/config.toml` sets no custom `auth.jwt_secret`, so the key is the CLI's generic demo default, not repo-specific. Zero functional consequence (the value is correct either way) — wording-only. |
| 10 | `docs/feature-flags.md`'s manual QA checklist doesn't mention restarting the local dev server between flag flips | low | patch | Real usability gap in an ops runbook meant to be actually followable — Next.js dev server needs a restart to pick up a changed env var. Trivial one-line addition. |
| 11 | The new test file's header comment and the spec's Implementation Notes both claim it "needs no real `supabase start` instance, no `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY`/`APP_TOKEN_SECRET`" — inaccurate for the `signIn` flag-unset test, which exercises the real old-path `signAppToken()` call and throws without `APP_TOKEN_SECRET` (currently supplied only by `.env.test.local`, not by anything in this file) | low | patch | Independently verified by Verification Gap via careful call-chain tracing (`auth.ts` old-path → real `signAppToken` → `getSecret()` throws if unset). Confirmed non-masking (a routing regression would still correctly fail the assertion) — comment-accuracy only, not a functional gap. |

No `intent_gap` or `bad_spec` entries — no loopback triggered.

## Verification

**Commands run:**
- `npm run test` -- 9 test files, 142 tests passed (133 prior + this story's 9 new toggle tests), no external env var set beforehand. Ran against the repo's local `supabase start` instance (containers already up per environment notes) for the pre-existing suites; the new toggle-test file itself needed none.
- `npm run lint` -- 0 errors, 1 pre-existing warning in `scripts/seed-company-360.mjs` (`idByEmail` unused), unrelated to this story and not introduced by it.
- `npx tsc --noEmit` -- clean, no output, exit 0.
- `grep -rn "USE_NEW_API_ADMIN_MEMBERS.*=.*true" --include=*.ts --include=*.tsx --include=*.env* .` -- hits only in (a) the 9 pre-existing `=== "true"` comparisons in `src/app/actions/{admin,members,auth}.ts`/`src/app/dashboard/page.tsx` (Story 3.4, unchanged, a comparison not an assignment) and (b) this story's own new test file's scoped `process.env.USE_NEW_API_ADMIN_MEMBERS = "true"` test setup (4 occurrences, one per new-path scenario) plus its header-comment prose. No default/assignment to `"true"` anywhere else; `.env.example` ships `USE_NEW_API_ADMIN_MEMBERS=false`.
