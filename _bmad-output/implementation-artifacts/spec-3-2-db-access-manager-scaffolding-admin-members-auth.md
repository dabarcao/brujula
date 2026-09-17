---
title: 'DB-Access and Manager Scaffolding for Admin/Members/Auth'
type: 'chore'
created: '2026-09-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '9ae4b4470fd2e2b999d313dd335b8158bab81974'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/app/actions/{admin,members,auth}.ts` still call Supabase directly. Story 3.1 already captured their pre-refactor baseline; this story builds the `db → managers` layering for this domain, mirroring Story 1.2's already-proven pattern exactly.

**Scope correction (investigated, not guessed):** epics.md's Story 3.2 AC lists `get_my_pending_invitations` among the RPCs to wrap, but investigation shows this is a **feedback-domain RPC** (joins `feedback_invitations`/`feedback_requests` — peer 360 feedback requests), not an admin/members RPC — it has nothing to do with organization membership. It's called once, at `dashboard/page.tsx:131`, immediately followed by a `feedback_requests` query for the same "Tareas pendientes" list. This is a miscategorization in epics.md, the same class of issue already found and corrected in Stories 1.6/1.7 (flag sequencing) and 2.7 (route-name mismatch). **Excluded from this story's scope**; belongs in Epic 3's feedback domain (Stories 3.13-3.18) instead — noted for whoever plans that story.

**Approach:** Six new files, mirroring `src/server/db/reportGroups.ts`/`src/server/managers/reportGroupsManager.ts`'s established shape (thin typed wrappers, no Supabase-shaped types in exported signatures, camelCase mapping from RPC snake_case, `import "server-only";` first):
- `src/server/db/admin.ts` — `isPlatformAdmin()`, `listOrganizations()`, `createOrganizationAsAdmin(orgName, adminEmail, adminFullName)`, `updateOrganizationName(orgId, newName)`.
- `src/server/db/members.ts` — `listOrganizationMembers(orgId)`, `inviteMember(email, fullName, departmentId)`, `createDepartment(name)`, `acceptMemberInvite(token)`, `claimPendingEmailInvitations()`.
- `src/server/db/auth.ts` (new, not explicitly named in epics.md's AC but architecturally required — see Boundaries) — `signInWithPassword(email, password)`, `signOut()`, wrapping the two Supabase Auth SDK calls `signIn`/`signOut` actually make (confirmed via `grep supabase.auth.` — only `signInWithPassword`/`signOut`/`getUser`/`signUp` exist anywhere; `signUp` belongs to `acceptInviteSignUp`/`individualSignUp`, which Story 3.1 never characterized and this story doesn't migrate either — out of scope, same as Story 1.2 leaving `src/lib/aiInterpretation.ts`'s untouched half alone).
- `src/server/managers/adminManager.ts` — calls only `db/admin.ts`.
- `src/server/managers/membersManager.ts` — calls only `db/members.ts`.
- `src/server/managers/authManager.ts` — calls `db/auth.ts` for the Supabase Auth half, and `signAppToken` (not `requireApiToken` — that's Route-Handler-side only, per Story 1.4/1.5's own established split) from `@/server/shared/auth.ts` to issue the app token on successful login. Returns the token string to the caller; cookie-setting and `redirect()` stay one layer up in the Server Action (Story 3.4), matching every prior manager's "no Next.js specifics" rule.

## Boundaries & Constraints

**Always:**
- Every `db/*` function exports plain-TypeScript-typed functions, no Supabase-shaped types in any signature — same rule as Story 1.2.
- `adminManager`/`membersManager`/`authManager` call only their corresponding `db/*` file(s), never `supabase` directly, never `redirect()`/`revalidatePath()`/cookies.
- `authManager.signIn` returns `{ appToken: string }` (or throws) — it does not set cookies itself; `authManager.signOut` returns `void` — cookie-clearing stays in the Server Action too.
- Story 3.1's characterization suite still passes, now additionally exercised against the new manager path for at least the RPCs it characterizes (mirroring Story 1.2's own "re-verify against Story 1.1's baseline" requirement).

**Never:**
- Do not touch `src/app/actions/{admin,members,auth}.ts` or `dashboard/page.tsx` — they keep calling Supabase directly, unchanged; delegating them is Story 3.4.
- Do not wrap `get_my_pending_invitations` here — feedback-domain scope, not this story's (see Intent).
- Do not wrap `signUp` (used by `acceptInviteSignUp`/`individualSignUp`) — Story 3.1 never characterized those flows, so there's no baseline to verify a wrapped version against; out of scope for both this story and Story 3.1.
- Do not add the ESLint boundary rule or app-token issuance mechanism — both already exist (Stories 1.3/1.4), reused as-is, not rebuilt per-domain.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `adminManager` create-org, in-process | same fixtures as Story 3.1's platform-admin test | identical to the characterized baseline (same invite token shape, same thrown message on non-admin) | thrown, not swallowed |
| `membersManager` invite-member, in-process | same fixtures as Story 3.1's Supervisor-invite test | identical to baseline (same token shape, same thrown message on missing department) | thrown, not swallowed |
| `membersManager` accept-invite, in-process | same fixtures as Story 3.1's accept tests | identical to baseline (`active` status, correct `is_supervisor`) | N/A |
| `authManager.signIn`, valid credentials | same fixtures as Story 3.1's signIn test | returns `{ appToken: string }`; a valid, `requireApiToken`-passing token | N/A |
| `authManager.signIn`, invalid credentials | wrong password | throws with the exact Supabase Auth error message, matching Story 3.1's baseline | thrown, not swallowed |
| `authManager.signOut` | any session | resolves, no error (mirrors `signOut`'s own unconditional, branch-free shape) | N/A |

</frozen-after-approval>

## Code Map

- `src/server/db/reportGroups.ts`, `src/server/managers/reportGroupsManager.ts` (Story 1.2) — the exact pattern to mirror: `import "server-only";` first, `createClient()` per function, `if (error) throw new Error(error.message)`, camelCase mapping, private snake_case row types.
- `src/server/shared/auth.ts` (Story 1.4) — `signAppToken(authUserId): string`, `APP_TOKEN_COOKIE`, `APP_TOKEN_TTL_SECONDS`. `requireApiToken` confirmed Route-Handler-side only, not used by `authManager`.
- `_bmad-output/implementation-artifacts/spec-3-1-characterization-tests-admin-members-auth-baseline.md`, `tests/characterization/admin-members-auth.test.ts` — the recorded baseline this story's own verification re-runs against; exact RPC signatures/error messages for `create_organization_as_admin`/`invite_member`/`create_department`/`update_organization_name`/`accept_member_invite` already confirmed there.
- RPCs newly investigated for this story (exact signatures/shapes):
  - `is_platform_admin() returns boolean` (`0016_platform_admin_org_creation.sql`) — no params, no exceptions, called directly at `admin/page.tsx:37`, `admin/empresas/[id]/page.tsx:40`, `dashboard/page.tsx:22`.
  - `list_organizations() returns table(id uuid, name text, created_at timestamptz, supervisor_email text, supervisor_status text)` (`0017_supervisor_and_admin_management.sql`) — gated internally by `is_platform_admin()` (empty result, not an error, for non-admins). Called at `admin/page.tsx:60`, `admin/empresas/[id]/page.tsx:55`; local type at `admin/page.tsx:8-14`.
  - `list_organization_members(p_org_id uuid) returns table(id uuid, email text, full_name text, status text, is_supervisor boolean, department_name text, created_at timestamptz)` (`0020_remove_manager_role.sql`, final version). Called at `admin/empresas/[id]/page.tsx:60`; local type at lines 6-13.
  - `claim_pending_email_invitations() returns void` (`0046_claim_on_every_dashboard_load.sql`) — no params, silently no-ops if caller has no `members` row, never raises. Called once, `dashboard/page.tsx:119`, return value discarded.
- `src/app/actions/auth.ts` — `signIn`/`signOut`'s exact Supabase SDK calls (`signInWithPassword`, `signOut`) confirmed via `grep supabase.auth.` as the only ones relevant here.
- No `src/server/db/auth.ts` or `authManager.ts` exists yet — both net-new.

## Tasks & Acceptance

**Execution:**
- [x] `src/server/db/admin.ts` (new) -- `isPlatformAdmin`, `listOrganizations`, `createOrganizationAsAdmin`, `updateOrganizationName`
- [x] `src/server/db/members.ts` (new) -- `listOrganizationMembers`, `inviteMember`, `createDepartment`, `acceptMemberInvite`, `claimPendingEmailInvitations`
- [x] `src/server/db/auth.ts` (new) -- `signInWithPassword`, `signOut`
- [x] `src/server/managers/adminManager.ts` (new) -- calls only `db/admin.ts`
- [x] `src/server/managers/membersManager.ts` (new) -- calls only `db/members.ts`
- [x] `src/server/managers/authManager.ts` (new) -- calls `db/auth.ts` + `signAppToken`; `signIn` returns `{ appToken }`, `signOut` returns `void`
- [x] `tests/characterization/admin-members-auth-manager.test.ts` (new) -- re-verifies a representative subset of Story 3.1's fixtures directly against the new manager functions

**Acceptance Criteria:**
- Given the 9 in-scope RPCs (`is_platform_admin`, `list_organizations`, `list_organization_members`, `create_organization_as_admin`, `invite_member`, `create_department`, `update_organization_name`, `accept_member_invite`, `claim_pending_email_invitations`), when `db/admin.ts`/`db/members.ts` are created, then each exports typed functions wrapping the relevant RPCs, no Supabase-shaped types in their signatures.
- Given `adminManager.ts`/`membersManager.ts`/`authManager.ts`, when built, then each calls only its corresponding `db/*` file, never `supabase` directly; `authManager` additionally owns login/logout/session-token-issuance glue on top of `signAppToken`.
- Given Story 3.1's characterization tests, when this story is complete, then they still pass unchanged, and the new manager-level test proves equivalence to that same baseline.

## Implementation Notes

**Six new files, exactly as scoped:**
- `src/server/db/admin.ts` -- `isPlatformAdmin`, `listOrganizations`, `createOrganizationAsAdmin`, `updateOrganizationName`. Camelcase-mapped `OrganizationSummary` type; no Supabase-shaped types in any signature.
- `src/server/db/members.ts` -- `listOrganizationMembers`, `inviteMember`, `createDepartment`, `acceptMemberInvite`, `claimPendingEmailInvitations`. Camelcase-mapped `OrganizationMember` type.
- `src/server/db/auth.ts` (net-new) -- `signInWithPassword(email, password): Promise<string>` (returns the auth user id, not a token) and `signOut(): Promise<void>`. `signOut` is deliberately branch-free (no `if (error) throw`), matching `src/app/actions/auth.ts`'s own signOut, which never checks the SDK call's error return -- this was a judgment call made explicit in the file's own comment, since Story 1.2's "always throw on error" rule would otherwise have introduced a behavioral difference from the characterized baseline.
- `src/server/managers/adminManager.ts` -- `checkIsPlatformAdmin`, `listAllOrganizations`, `createOrganization` (returns `{ inviteToken }`), `renameOrganization`. Calls only `db/admin.ts`.
- `src/server/managers/membersManager.ts` -- `listMembers`, `inviteNewMember` (returns `{ inviteToken }`), `createNewDepartment` (returns `{ departmentId }`), `acceptInvite` (returns `{ organizationId }`), `claimPendingInvitations`. Calls only `db/members.ts`.
- `src/server/managers/authManager.ts` -- `signIn(email, password): Promise<{ appToken: string }>` (calls `db/auth.ts`'s `signInWithPassword` then `signAppToken` from `@/server/shared/auth.ts`) and `signOut(): Promise<void>`. No cookies, no `redirect()`, no Next.js specifics.
- `tests/characterization/admin-members-auth-manager.test.ts` (new, 13 tests) -- re-runs the same org -> Supervisor-accept -> rename -> department -> member-invite -> member-accept -> login/logout chain from Story 3.1's baseline, this time calling the manager functions directly instead of the Server Actions. Simpler mocking than Story 3.1's own suite: no `next/navigation`/`next/cache` mocks needed since managers never call `redirect()`/`revalidatePath()` -- only `next/headers` (cookie jar) and `@/lib/supabase/server` (token-bearer `actingAs()` for admin/members RPCs, real-session `actingWithRealSession()` for auth) are mocked, same technique as Story 3.1.

**One deliberate scope note beyond the frozen Intent:** `membersManager.inviteNewMember`'s "missing department" error test asserts against `invite_member`'s own RPC message (`'Selecciona un departamento válido de tu organización.'`), not `src/app/actions/members.ts`'s pre-RPC client-side validation message (`'El email y el departamento son obligatorios.'`) -- that client-side check lives in the Server Action (untouched, Story 3.4's domain), not in the manager, so calling the manager directly with an invalid department id reaches the RPC's own validation instead. This is the correct behavior for this layer, not a gap.

**Verification performed:**
- `npx supabase status` showed only some non-essential services (realtime/storage/imgproxy/edge-runtime/analytics/vector/pooler) reporting stopped; confirmed the services this story's tests actually need (`db`, `auth`, `rest`, `kong`) were up and healthy via `docker ps` and a direct `curl` against the REST endpoint (200) before running any test.
- `npm run test` -- 7 files, 85 tests passed (72 prior + 13 new), run twice for idempotency (unique `Date.now()`-suffixed emails/org/department names avoid collisions across runs).
- `npm run lint` -- 0 errors; the 1 pre-existing warning (`scripts/seed-company-360.mjs`, unrelated, untouched) is unchanged.
- `npx tsc --noEmit` -- no output, no type errors.

**Nothing left incomplete.** `src/app/actions/{admin,members,auth}.ts` and `src/app/dashboard/page.tsx` were not modified -- they still call Supabase directly, as required (delegating them is Story 3.4). `get_my_pending_invitations` and `signUp` were not wrapped, per the frozen Intent/Boundaries. The ESLint import-boundary rule (Story 1.3) and app-token issuance mechanism (Story 1.4) were reused as-is, not rebuilt.

## Spec Change Log

## Review Triage Log

**3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap) — all three independently converged on the same two points:**

1. **Test-count claim was wrong (patch, applied).** Implementation Notes/Verification originally claimed "16 new tests" / "69 prior + 16 new". Actual count (grep-verified `test(` blocks, cross-checked against `npm run test`'s verbose per-file output): the new file has **13** tests, prior suite has **72** — the aggregate (85) was right, both addends were wrong and happened to cancel out. Fixed in place in this spec (Implementation Notes + both Verification lines).
2. **`checkIsPlatformAdmin`/`listMembers`/`claimPendingInvitations` have no direct test coverage (defer, logged).** All three are one-line pass-through delegates to already-tested `db/*` functions, matching the proven `reportGroups.ts` shape; not required by the frozen I/O matrix's 6 scenarios. Logged to `deferred-work.md` — real exercise happens when Story 3.4 wires them into the Server Actions.

No boundary violations, no type leaks, no RPC signature mismatches, no forbidden wrapping (`get_my_pending_invitations`/`signUp`), no untouched-file violations, no functional/error-handling/null-handling gaps found. All RPC parameter names/shapes verified against the actual migration SQL by two independent lenses.

## Verification

**Commands:**
- `npm run test` -- expected: all 72 prior tests plus this story's new tests pass (actual: 85/85 passed -- 72 prior + 13 new, matching Story 3.1's confirmed baseline exactly)
- `npm run lint` -- expected: no new violations (actual: 0 errors, 1 pre-existing unrelated warning)
- `npx tsc --noEmit` -- expected: no new type errors (actual: none)
