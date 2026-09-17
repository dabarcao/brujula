---
title: 'Characterization Tests for Admin/Members/Auth (Current Behavior Baseline)'
type: 'chore'
created: '2026-09-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ac42368225394a0e37b8fd12dfefcf96c6574e44'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/app/actions/{admin,auth,members}.ts` (and `dashboard/page.tsx`'s direct `accept_member_invite` call) have zero test coverage. Before Epic 3's admin/members/auth domain migrates to the `db → managers → API` layering, its actual pre-refactor behavior must be captured as a recorded baseline — the same discipline Story 1.1 established for report groups.

**Approach:** New `tests/characterization/admin-members-auth.test.ts`, mirroring Story 1.1's exact pattern (mock only `next/navigation`/`next/cache`/`@/lib/supabase/server`; every RPC call is real, against the local `supabase start` instance; `login()`/`restGet()`/`getRedirectUrl()` helpers; exact-message assertions on RPC errors). Covers the 6 behaviors epics.md names, chained in a realistic sequence since they're causally dependent: platform-admin org creation → accept that org's first Supervisor invite → Supervisor creates a department → Supervisor invites a new member → that member accepts → login/logout. Plus a representative error case per RPC family (not every possible validation branch — matching Story 1.1's "baseline, not exhaustive" scope), since Epic 3's own later "New-Path Verification" stories, not this one, are where exhaustive coverage growth belongs if ever needed.

**Platform admin:** `create_organization_as_admin`/`update_organization_name` require the caller to be in the hardcoded `platform_admins` allowlist (`supabase/migrations/0016_platform_admin_org_creation.sql`) — exactly one seeded row, `david.abarca@gmail.com`. This suite logs in as that exact email (same password convention every seed script uses, `kairos123`) — there is no other way to test these two RPCs' success path, since the allowlist can't be extended without a migration, which is out of this story's scope.

## Boundaries & Constraints

**Always:**
- Every characterized behavior is exercised through the real, unmodified Server Action (`createOrganizationAsAdmin`, `updateOrganizationName`, `inviteMember`, `createDepartment`, `signIn`, `signOut`) or, for `accept_member_invite`, the real RPC called the same way `dashboard/page.tsx` calls it (no dedicated Server Action wraps it).
- Error message assertions are exact-string matches against the RPC's own `raise exception` text (verbatim Spanish), not substring/pattern matches — same rigor as Story 1.1.
- This suite runs only against the local `supabase start` instance (`.env.test.local`), never a remote project — same hard guard Story 1.1's suite already enforces, copied verbatim.
- `signIn`'s test also confirms both the Supabase session cookie and the Story 1.4 app-token cookie are set (mirroring `tests/characterization/auth-signin.test.ts`'s existing pattern for the same action, from a different seeded account — this suite doesn't duplicate that file, it adds the org-creation/member/department chain around a fresh login/logout pair).

**Never:**
- Do not modify `src/app/actions/{admin,auth,members}.ts` or `dashboard/page.tsx` — read-only baseline capture, no refactor in this story.
- Do not attempt to extend the `platform_admins` allowlist or otherwise touch that table — use the one existing seeded row as-is.
- Do not characterize `create_individual_account` or the `pending_individual_signup` path — epics.md's Story 3.1 scope names organization/member/department/login behaviors specifically, not the individual-account signup flow (a separate, already-out-of-scope feature per this domain's own story list).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `createOrganizationAsAdmin`, logged in as platform admin | valid org name/admin email/name | redirect `/admin?created=<token>&createdEmail=...&createdOrg=...` | N/A |
| `createOrganizationAsAdmin`, logged in as a non-admin | any input | redirect `/admin?error=` + exact `'Solo el administrador de la plataforma puede crear empresas.'` | thrown, not swallowed |
| `accept_member_invite`, the new org's first Supervisor accepts | valid invite token, matching email | membership becomes `active`, `is_supervisor=true`, returns `organization_id` | N/A |
| `updateOrganizationName`, as platform admin | valid org id + new name | redirect `/admin/empresas/<id>?updated=1` | N/A |
| `createDepartment`, as the accepted Supervisor | valid name | redirect `/dashboard/members` | N/A |
| `inviteMember`, as the Supervisor, valid department | valid email + that department id | redirect `/dashboard/members?invited=<token>&invitedEmail=...` | N/A |
| `inviteMember`, missing department | valid email, empty department id | redirect `/dashboard/members?error=` + exact `'El email y el departamento son obligatorios.'` | thrown, not swallowed |
| `accept_member_invite`, the newly invited member accepts | valid token, matching email | membership becomes `active`, `is_supervisor=false` | N/A |
| `signIn`, valid credentials | any account created above | redirect `/dashboard`; Supabase session cookie **and** app-token cookie both set | N/A |
| `signIn`, invalid credentials | wrong password | redirect `/login?error=...` | thrown, not swallowed |
| `signOut` | logged-in session | redirect `/`; app-token cookie cleared | N/A |

</frozen-after-approval>

## Code Map

- `src/app/actions/admin.ts` (49 lines) — `createOrganizationAsAdmin`, `updateOrganizationName`. Both call `redirect()` on error (never return an error value) — same pattern as `reportGroups.ts`, needs the same `getRedirectUrl()` capture-without-navigating helper Story 1.1 built.
- `src/app/actions/members.ts` (57 lines) — `inviteMember`, `createDepartment`. Same redirect-on-error pattern; `inviteMember` also does its own pre-RPC validation (`if (!email || !departmentId)`) before ever calling Supabase, and `createDepartment` has the identically-shaped pre-RPC check `if (!name)` → redirects with `"El nombre es obligatorio."` before ever calling the RPC (distinct from the RPC's own `'El nombre del departamento es obligatorio.'`, which only fires if that client-side check is bypassed).
- `src/app/actions/auth.ts` (121 lines) — `signIn` (sets both cookies per Story 1.4), `signOut` (clears the app-token cookie per Story 1.4's own follow-up), `acceptInviteSignUp`/`individualSignUp` (out of this story's scope per Boundaries).
- `src/app/dashboard/page.tsx` lines ~39-61 — the actual `accept_member_invite` call site: reads `user.user_metadata.pending_invite_token`, calls `supabase.rpc("accept_member_invite", { p_token })` directly (Server Component, not a Server Action). This suite calls the RPC the same way, not through this page. (The `pending_individual_signup`/`create_individual_account` branch immediately follows, lines ~62-94 — out of scope per Boundaries, not part of this citation.)
- RPC exact signatures/messages (confirmed via migration source, final/authoritative versions):
  - `create_organization_as_admin(p_org_name, p_admin_email, p_admin_full_name) returns uuid` (`0017_supervisor_and_admin_management.sql`) — `'Solo el administrador de la plataforma puede crear empresas.'` / `'El nombre de la empresa es obligatorio.'` / `'El email del primer administrador es obligatorio.'`
  - `accept_member_invite(p_token uuid) returns uuid` (`0045_claim_pending_email_invitations.sql`, supersedes `0003`) — `'Debes iniciar sesión para aceptar la invitación.'` / `'Invitación no válida o ya utilizada.'` / `'Esta invitación fue enviada a otro email.'`
  - `invite_member(p_email, p_full_name, p_department_id) returns uuid` (`0020_remove_manager_role.sql`) — `'Debes iniciar sesión para invitar a un empleado.'` / `'Solo un administrador puede invitar empleados.'` / `'El email es obligatorio.'` / `'Selecciona un departamento válido de tu organización.'` / `'Ya existe un empleado con ese email en tu organización.'`
  - `create_department(p_name) returns uuid` (`0017`) — `'Solo un administrador puede crear departamentos.'` / `'El nombre del departamento es obligatorio.'`
  - `update_organization_name(p_org_id, p_new_name) returns void` (`0017`) — `'Solo el administrador de la plataforma puede editar empresas.'` / `'El nombre de la empresa es obligatorio.'` / `'Empresa no encontrada.'`
- `platform_admins` table (`0016`) — exactly one row, `david.abarca@gmail.com`; RLS-locked, read only via `security definer` `is_platform_admin()`. `scripts/seed-demo-company.mjs` already logs in as this exact email/password (`kairos123`) to bootstrap its own demo org — this suite reuses the same login, doesn't invent a new admin.
- `scripts/seed-demo-company.mjs` — full pipeline (admin login → create org → accept as Supervisor → create 4 departments → invite+accept employees → a 360 cycle) already exercises 4 of these 6 behaviors as setup plumbing. This suite calls the RPCs/actions directly and asserts on them itself (Story 1.1's own approach), rather than relying on the seed script's side effects as the test — the seed script's own `Supervisor: ${email} / ${password}` console-output pattern (already regex-parsed by Story 1.1's test) is available for reuse if a smaller fixture (e.g. `--employees 0`) is convenient, but not required.
- `tests/characterization/report-groups.test.ts`, `tests/characterization/auth-signin.test.ts` — direct structural precedent for this new file's helpers/mocking shape; `auth-signin.test.ts` specifically for `signIn`'s dual-cookie assertion pattern.

## Tasks & Acceptance

**Execution:**
- [x] `tests/characterization/admin-members-auth.test.ts` (new) -- covers every I/O-matrix row, chained in dependency order (org → Supervisor accept → department → member invite → member accept → login/logout)
- [x] Verify: `npm run test` — all prior 58 tests plus this suite's new tests pass (11 new tests; 69 total)

**Acceptance Criteria:**
- Given the current `src/app/actions/{admin,auth,members}.ts` implementations, untouched, when characterization tests are written against seeded demo data, then they capture: creating an organization as platform admin, inviting a member, accepting/claiming an invitation, creating a department, updating an organization name, and login/logout.
- Given these tests, when run against today's implementation, then all pass.

## Implementation Notes

**New file:** `tests/characterization/admin-members-auth.test.ts` (11 tests, all against the local `supabase start` instance, no application source touched).

**Mocking shape -- a synthesis of two existing precedents, not a straight copy of either:**
- `createOrganizationAsAdmin`/`updateOrganizationName`/`inviteMember`/`createDepartment` only ever call `supabase.rpc(...)`, so they reuse Story 1.1's report-groups pattern: `@/lib/supabase/server` mocked to hand back a bare `@supabase/supabase-js` client carrying the acting user's access token as an `Authorization` header (`actingAs(token)`), letting the suite run the same action "as" the platform admin, a throwaway non-admin, and the new Supervisor without a real per-call login/cookie ceremony.
- `signIn`/`signOut` do their own real `supabase.auth.*` login/logout, and the spec requires observing the real Supabase session cookie(s) actually get set/cleared -- that only happens through a real `@supabase/ssr` server client. So the same `@/lib/supabase/server` mock has a second mode (`actingWithRealSession()`) that builds a real `createServerClient` wired to an in-memory cookie jar via a mocked `next/headers`, exactly `auth-signin.test.ts`'s existing pattern. A single `vi.mock` factory can't vary by caller, so it switches on an explicit mode flag instead of forcing both domains through one shape.
- This hybrid was necessary and deliberate, not a shortcut: the spec's own Boundaries explicitly ask for both "mock only `@/lib/supabase/server`, Story 1.1's pattern" (for the admin/members RPC actions) and "confirm the real Supabase session cookie is set" for `signIn` (which only Story 1.4's `auth-signin.test.ts` pattern can do) in the same file.

**Fixture:** unlike `report-groups.test.ts`/`auth-signin.test.ts`, this suite does **not** shell out to `scripts/seed-demo-company.mjs`. It builds the org/Supervisor/department/member entirely through the real actions/RPCs under test themselves (per the spec's own "chained in a realistic sequence" approach) -- that script's org-creation/invite/accept steps are exactly what this story characterizes, so using it as setup would mean not exercising the code under test as the actual assertions.

**Platform admin bootstrap:** `signUpOrSignIn(david.abarca@gmail.com, kairos123)` in `beforeAll`, same signup-with-password-grant-fallback idempotent pattern `seed-demo-company.mjs` already uses -- works whether or not that seeded row's auth account already exists locally.

**`updateOrganizationName` verification:** `organizations` has no platform-admin SELECT policy (RLS scopes reads to members of that org), so the rename is verified by re-calling `list_organizations()` (the same security-definer RPC `/admin`'s own list page uses) rather than a direct REST read.

**Verification performed:**
- `npx supabase status` showed the local stack stopped at the start of this session; ran `npx supabase start` (idempotent, all migrations already applied) before writing any test.
- `npm run test` -- 6 files, 69 tests passed (58 prior + 11 new), run twice for idempotency (unique `Date.now()`-suffixed emails/org names avoid collisions across runs).
- `npm run lint` -- 0 errors; the 1 pre-existing warning (`scripts/seed-company-360.mjs`, unrelated, untouched) is unchanged.
- `npx tsc --noEmit` -- no output, no type errors.

**Nothing left incomplete.** No application source under `src/app/actions/` or `src/app/dashboard/page.tsx` was modified.

**Complete, accurate mock list** (the frozen Intent's "mock only `next/navigation`/`next/cache`/`@/lib/supabase/server`" undercounts by one): the test file mocks **`next/navigation`**, **`next/cache`**, **`next/headers`**, and **`@/lib/supabase/server`**. `next/headers`'s `cookies()` is mocked with the same in-memory-jar technique `auth-signin.test.ts` already uses — required so `signIn`'s test can observe the real app-token cookie (and, via the real `@supabase/ssr` client in `actingWithRealSession()` mode, the real Supabase session cookie) instead of the framework throwing on a missing request-scoped cookie store. Every RPC call itself remains real, against the local instance, as the Intent states.

## Spec Change Log

## Review Triage Log

- **`type: 'test'` isn't a valid spec-template enum value (`feature | bugfix | refactor | chore`); Story 1.1's own equivalent characterization spec used `chore`** — Blind Hunter finding. Verdict: **low**, real, trivial. Routes to **patch**.
- **Code Map's line counts for `admin.ts`/`members.ts`/`auth.ts` (50/58/122) are each off by one (actual 49/57/121)** — Blind Hunter finding. Verdict: **low**, real, cosmetic, trivial. Routes to **patch**.
- **The frozen Intent's "a representative error case per RPC family" claim isn't actually delivered — only `create_organization_as_admin` gets a real RPC-level error test; `accept_member_invite`, `create_department`, and `update_organization_name` have zero error-path coverage despite their exact messages being cataloged in the Code Map** — Blind Hunter finding. Verdict: **medium**, real. This is more than a wording overclaim: these three RPCs' error-handling has no safety-net coverage before Epic 3's migration touches them, which is exactly what this story exists to prevent. Routes to **patch**: add one focused error-path test per RPC, following the exact pattern already established for the two existing error tests.
- **`createDepartment`'s own client-side pre-RPC validation (empty name) is undocumented and untested, asymmetric with `inviteMember`'s identically-shaped, already-tested validation** — Blind Hunter finding. Verdict: **low**, real. Folded into the same patch as the finding above — `create_department`'s new error test uses this exact client-side-validation path (mirroring `inviteMember`'s own precedent), and the Code Map/Boundaries gain a note about it.
- **Code Map's `dashboard/page.tsx` line-range citation for the `accept_member_invite` call site ("lines ~39-95") also spans the unrelated, explicitly out-of-scope `pending_individual_signup` branch** — Blind Hunter finding. Verdict: **low**, real, trivial. Routes to **patch**: narrow the cited range.
- **`signIn`'s "valid/invalid credentials" tests are near-verbatim duplicates of `auth-signin.test.ts`'s existing tests, understating the Boundaries' "doesn't duplicate" claim** — Blind Hunter finding. Verdict: **low**. Rejected: harmless redundancy — both independently and correctly verify the same real `signIn` behavior from different seeded accounts, which isn't a functional or coverage defect, just belt-and-suspenders duplication.
- **No test for `signOut()` called without an active session** — Blind Hunter finding. Verdict: **low**. Rejected: `signOut`'s implementation is straight-line, unconditional (no branching on session state), so this edge case is unlikely to reveal anything a happy-path test wouldn't already show.
- **The platform-admin bootstrap's signup-falls-back-to-login pattern could produce an unhelpful generic error if the seeded account's password ever drifted from `kairos123`, undocumented in this story's Boundaries** — Blind Hunter finding. Verdict: **false/not-caused-by-this-story**. This exact pattern (same email, same password convention, same fallback logic) is inherited from `scripts/seed-demo-company.mjs`'s already-established bootstrap approach, not something this story introduces.
- **The `signIn`/`signOut` describe block uses `memberEmail`/`PASSWORD` without asserting the prior member-creation step actually ran, so running it in isolation would fail with a confusing login-mismatch error rather than a clear precondition message** — Edge Case Hunter finding. Verdict: **low**, real, trivial, matches the existing `toBeDefined()`-guard pattern already used elsewhere in Story 1.1's own suite for the identical reason. Routes to **patch**.
- **Claim: Intent says the suite mocks only `next/navigation`/`next/cache`/`@/lib/supabase/server`, but the test file also mocks `next/headers`** — Edge Case Hunter finding (claim). Verdict: **low**, real — confirmed the test file does mock `next/headers` (needed for the `signIn` cookie-assertion path, mirroring `auth-signin.test.ts`'s own established need to do the same). The frozen Intent's mock list is incomplete, but per triage rules a frozen-block wording fix isn't done via patch — noted in Implementation Notes instead as the accurate, complete mock list for any future reader.
- Verification Gap independently confirmed 69/69 tests pass, every assertion matches its source's actual literal behavior (exact error strings, redirect URLs, cookie option values), and each RPC-chained step re-verifies state via REST/RPC rather than trusting redirect params alone — a regression in any characterized RPC would surface as a failed assertion.

## Verification

**Commands:**
- `npm run test` -- expected: all prior 58 tests plus this story's new tests pass (actual: 69/69 passed)
- `npm run lint` -- expected: no new violations (actual: 0 errors, 1 pre-existing unrelated warning)
- `npx tsc --noEmit` -- expected: no new type errors (actual: none)
