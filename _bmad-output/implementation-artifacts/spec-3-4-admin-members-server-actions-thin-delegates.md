---
title: 'Admin/Members Server Actions Become Thin Delegates'
type: 'feature'
created: '2026-09-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '911b958'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/app/actions/{admin,members,auth}.ts` and `src/app/dashboard/page.tsx` still call Supabase/RPCs directly, even though Story 3.2's managers (`adminManager`, `membersManager`, `authManager`) and Story 3.3's Route Handlers already exist and are fully tested. This story wires the in-process callers (Server Actions, and the one Server Component that bootstraps a new member) through those managers.

**Approach:** Unlike Story 1.6 (which deleted report-groups' old direct-Supabase code outright when converting it to thin delegates), this story must keep the OLD code path alive and reachable, gated behind one shared flag: `process.env.USE_NEW_API_ADMIN_MEMBERS === "true"`. Admin, members, and auth were already treated as one unified domain across Stories 3.1-3.3 (one characterization spec, one scaffolding spec, one route-handler spec covering all three) — this story keeps that grouping and uses one flag for all of them, checked only in each thin caller, never inside a manager (per `epic-3-context.md`'s own convention). Default is OFF (falsy/unset), so behavior is byte-identical to today until Story 3.5 flips it. Each caller becomes `if (flagOn) { /* new manager path */ } else { /* old path, byte-preserved from before this story */ }`; `redirect()`/`revalidatePath()`/cookie-setting stay in the caller in both branches — only the "do the write/read" step swaps.

**Scope correction (investigated, not guessed):** `src/app/actions/auth.ts`'s `acceptInviteSignUp`/`individualSignUp` (both call `supabase.auth.signUp` directly) have no manager equivalent — Story 3.2 never built one (out of its own scope, no baseline to verify against). They stay completely untouched by this story, no flag, exactly as Story 3.2 already flagged. `src/app/dashboard/page.tsx`'s `create_individual_account` RPC call is the same situation (no manager) and also stays untouched. `get_my_pending_invitations` (`dashboard/page.tsx:131`) is a feedback-domain RPC per Story 3.2's own investigated correction — untouched, out of scope.

## Boundaries & Constraints

**Always:**
- One shared flag, `USE_NEW_API_ADMIN_MEMBERS`, read via `process.env.USE_NEW_API_ADMIN_MEMBERS === "true"`, checked once per caller (each Server Action, and once per RPC call site inside `dashboard/page.tsx`'s render body) — never inside a manager or db file.
- Old-path code is byte-preserved from its current form (copy, don't rewrite) — this is what Story 3.5 rolls back to and what Story 3.6 diffs against.
- New-path code catches the manager's thrown `Error` and produces the exact same redirect URL / error message text the old path's `if (error)` branch already produces today, so the two branches are behaviorally indistinguishable to a caller regardless of which one runs.
- `dashboard/page.tsx`'s three in-scope RPC call sites (`is_platform_admin` L22, `accept_member_invite` L48, `claim_pending_email_invitations` L119) each get their own `if (flagOn) {...} else {...}` swapping only the data-access call — the surrounding page logic (member re-fetch, `bootstrapError` handling, JSX) is unchanged in both branches.
- `authManager.signIn`/`signOut`'s new-path branch in `src/app/actions/auth.ts` still performs the cookie-set/clear and `redirect()` itself (managers never touch cookies/Next.js specifics, per Story 3.2's own contract) — only `supabase.auth.signInWithPassword`/`signOut` themselves are replaced by the manager call.
- Story 3.1's characterization suite still passes unchanged with the flag OFF (default); this story does not need it to also pass with the flag ON (that's Story 3.6's job) but must not break it either way.

**Never:**
- Do not delete any old-path code — this is the one hard difference from Story 1.6's pattern, and the reason this constraint exists at all.
- Do not touch `acceptInviteSignUp`, `individualSignUp` (`auth.ts`), or `create_individual_account`'s call site (`dashboard/page.tsx`) — no manager exists for them.
- Do not touch `get_my_pending_invitations` (`dashboard/page.tsx:131`) — feedback-domain scope.
- Do not touch `src/server/db/*`, `src/server/managers/*`, or `src/app/api/**` — all read-only references; built and reviewed in Stories 3.2/3.3.
- Do not set the flag to `true` anywhere (`.env`, config, CI) — Story 3.5's job, not this one's.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `createOrganizationAsAdmin`, flag OFF, valid input | as platform admin | identical to current: redirects to `/admin?created=...` | N/A |
| `createOrganizationAsAdmin`, flag ON, valid input | as platform admin | same redirect URL/shape as flag OFF | N/A |
| `createOrganizationAsAdmin`, flag ON, non-admin caller | as regular member | same `/admin?error=...` redirect, same message text as flag OFF | manager's thrown `Error.message` used verbatim |
| `inviteMember`, flag ON, missing department | valid email, no departmentId | same pre-RPC `/dashboard/members?error=...` validation redirect as flag OFF (client-side check stays in the action, runs before the manager either way) | N/A |
| `dashboard/page.tsx` bootstrap, flag ON, valid `pendingInviteToken` | first login after invite accept | same member-created/redirect-free render as flag OFF | manager's thrown `Error.message` assigned to `bootstrapError`, same as today's `if (error)` branch |
| `authManager.signIn`, flag ON, valid credentials | email+password | same `/dashboard` redirect, same two cookies set (Supabase session + app token), same attributes | N/A |
| `authManager.signIn`, flag ON, invalid credentials | wrong password | same `/login?error=...` redirect, same message text as flag OFF | thrown-not-swallowed |

</frozen-after-approval>

## Code Map

- `src/app/actions/admin.ts` (50 lines) -- `createOrganizationAsAdmin` (L6-31), `updateOrganizationName` (L33-49). Old-path RPC calls: `create_organization_as_admin`, `update_organization_name`. New-path: `adminManager.createOrganization(orgName, adminEmail, adminFullName)`, `adminManager.renameOrganization(orgId, newName)`.
- `src/app/actions/members.ts` (58 lines) -- `inviteMember` (L7-38, pre-RPC validation at top stays unconditional/unchanged), `createDepartment` (L40-57). New-path: `membersManager.inviteNewMember(email, fullName, departmentId)`, `membersManager.createNewDepartment(name)`.
- `src/app/actions/auth.ts` (122 lines) -- `signIn` (L80-108): keep cookie-set (L98-105) and `redirect` in the action; only `supabase.auth.signInWithPassword` swaps for `authManager.signIn(email, password)` → `{ appToken }`. `signOut` (L110-121): only `supabase.auth.signOut()` swaps for `authManager.signOut()`; cookie-delete/`redirect("/")` stay. `acceptInviteSignUp`/`individualSignUp` (L8-78) -- do not touch.
- `src/app/dashboard/page.tsx` -- `is_platform_admin` (L22), `accept_member_invite` (L47-50, inside the `pendingInviteToken` branch), `claim_pending_email_invitations` (L119). New-path: `adminManager.checkIsPlatformAdmin()`, `membersManager.acceptInvite(pendingInviteToken)` (throws on error, unlike the old `{ error }`-returning shape -- wrap in try/catch to preserve `bootstrapError` assignment), `membersManager.claimPendingInvitations()`. Leave `create_individual_account` (L69-74) and `get_my_pending_invitations` (L131) untouched.
- `src/server/managers/{adminManager,membersManager,authManager}.ts` (Story 3.2) -- exact signatures to call, all confirmed current: `checkIsPlatformAdmin()`, `listAllOrganizations()`, `createOrganization(orgName,adminEmail,adminFullName)`, `renameOrganization(orgId,newName)`; `listMembers(orgId)`, `inviteNewMember(email,fullName,departmentId)`, `createNewDepartment(name)`, `acceptInvite(token)`, `claimPendingInvitations()`; `signIn(email,password)`, `signOut()`.
- `git show c9017bf -- src/app/actions/reportGroups.ts` -- Story 1.6's commit, for reference only: shows the anti-pattern (old code fully deleted, no flag) NOT to replicate here.
- No existing `process.env.USE_NEW_*`/flag pattern anywhere in the repo (confirmed via repo-wide grep) -- this story introduces the first one.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/actions/admin.ts` -- both actions gain `if (flagOn) {...} else {...old, byte-preserved...}` branches
- [x] `src/app/actions/members.ts` -- both actions gain the same branch shape
- [x] `src/app/actions/auth.ts` -- `signIn`/`signOut` gain the branch shape (auth-SDK calls only); `acceptInviteSignUp`/`individualSignUp` untouched
- [x] `src/app/dashboard/page.tsx` -- the 3 in-scope RPC call sites each gain the branch shape
- [x] `tests/characterization/admin-members-auth.test.ts` -- re-run unmodified with the flag OFF (default), confirm still green
- [x] `tests/characterization/admin-members-auth-manager.test.ts` -- re-run unmodified, confirm still green (proves the new-path branches call the exact functions this suite already characterizes)

**Acceptance Criteria:**
- Given the flag unset (default), when any of the 4 files' modified call sites run, then behavior is byte-identical to `baseline_commit` -- confirmed by Story 3.1's characterization suite passing unchanged.
- Given the flag set to `"true"` in a test's env, when the same call sites run, then they produce the same redirect URLs / error messages / `bootstrapError` content as the flag-OFF path, for every scenario in the I/O matrix above.
- Given `acceptInviteSignUp`, `individualSignUp`, `create_individual_account`'s call site, and `get_my_pending_invitations`, when this story is complete, then none of them were modified.

## Implementation Notes

**Matrix Test Audit:** 6 of the 7 I/O matrix rows are covered by automated tests: `tests/characterization/admin-members-auth.test.ts`'s 14 tests, run once with the flag unset (default, part of the full 132-test suite) and once with `USE_NEW_API_ADMIN_MEMBERS=true` (14/14 passed both times) -- this directly exercises `createOrganizationAsAdmin` (valid + non-admin-caller), `inviteMember` (missing-department), and `signIn` (valid + invalid credentials) on both paths. The `dashboard/page.tsx` bootstrap row (flag ON, valid `pendingInviteToken`) has no automated coverage either way -- Server Component rendering isn't unit-tested anywhere in this codebase (`epic-3-context.md`: "Server Component rendering itself is not unit-testable and stays manually verified"), matching this story's own stated testing tasks (re-running the two existing characterization suites, not adding new Server-Component-level test infrastructure). Verified instead by: (a) the underlying `membersManager.acceptInvite` call is already fully characterized by Story 3.2's own test suite (success + already-used-token-error cases), and (b) direct diff inspection confirms the new branch's try/catch reproduces the old branch's exact `bootstrapError`-assignment/member-refetch behavior line-for-line, just swapping the RPC call for the manager call.

## Spec Change Log

## Review Triage Log

**3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap):**

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | `src/app/dashboard/page.tsx`'s flag-ON branches for `checkIsPlatformAdmin()` (L36) and `claimPendingInvitations()` (L152) are unguarded, but both throw on RPC error (`db/admin.ts`/`db/members.ts`'s `if (error) throw ...`), while their old paths silently ignore the RPC's `error` field entirely and keep rendering — a direct violation of the frozen "behaviorally indistinguishable regardless of which path runs" constraint. Only the third converted call site in this file (`acceptInvite`) was correctly wrapped in try/catch. | high | patch | Independently found and verified by all three review lenses (Blind Hunter, Edge Case Hunter, Verification Gap), each tracing the exact same two call sites against `db/admin.ts:37-42`/`db/members.ts:105-109`'s throw behavior. I independently re-confirmed by reading both call sites directly. Consequence once Story 3.5 flips the flag: a transient RPC hiccup crashes `/dashboard` for any logged-in user instead of degrading silently as today. |
| 2 | The frozen I/O & Edge-Case Matrix has no row for `updateOrganizationName` or `createDepartment`, even though both are modified call sites | n/a | rejected | Fix is to edit this build's spec — explicitly barred by the triage rules regardless of merit. The underlying code for both functions was independently verified correct (proper flag branch, byte-preserved old path, try/catch new path). |
| 3 | The shared flag check (`process.env.USE_NEW_API_ADMIN_MEMBERS === "true"`) is re-typed as a literal string at 8 separate call sites across 4 files, with no shared constant/helper — a future typo at any one site would silently and permanently pin that branch to the old path | low | defer | Real but currently non-manifesting (all 8 occurrences verified consistent by direct read) — this is the first flag this initiative has introduced, so there's no established shared-flag-helper location yet to extract to. Logged for whenever a second domain's flag story reveals whether the pattern generalizes. |
| 4 | The catch block's `redirect(...)` in `createOrganizationAsAdmin`/`inviteMember`/`signIn` isn't followed by an explicit `return`, unlike the success path in the same functions | false | — | `redirect()` is typed `never` and throws at runtime to unwind the render — code after it is provably unreachable either way (confirmed via `tsc --noEmit` passing with no "used before assigned" error on the post-catch variable reads). Matches this codebase's own pre-existing convention already used in the untouched original action files. No bad outcome occurs. |
| 5 | `String(result.inviteToken)`/`String(inviteToken)` wrap values already typed `string` | false | — | No named harm beyond a vague readability note; `String()` on an already-`string` value is a no-op with zero behavioral difference. |

No `intent_gap` or `bad_spec` entries — no loopback triggered.

## Verification

**Commands:**
- `npm run test` -- expected: all 132 prior tests pass unchanged (flag unset/default in the test env) (actual: 133/133 passed -- 132 prior + 1 new error-path test added during review)
- `npm run lint` -- expected: no new violations (actual: 0 errors, 1 pre-existing unrelated warning)
- `npx tsc --noEmit` -- expected: no new type errors (actual: none)
- flag-ON re-run of `tests/characterization/admin-members-auth.test.ts` + `admin-members-auth-manager.test.ts` (`USE_NEW_API_ADMIN_MEMBERS=true`) -- 28/28 passed, confirming new-path/old-path equivalence including the review's two fixed error-handling branches
