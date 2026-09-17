---
title: 'Admin/Members New-Path Verification Against the Characterization Baseline'
type: 'chore'
created: '2026-09-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'eb9f3a2'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** epics.md's Story 3.6 AC requires (1) Story 3.1's characterization baseline to match exactly when run against the new path with the flag on, permanently, and (2) new auth/access-boundary rejections (non-admin, non-Supervisor) to be proven correct on the new path — both as the explicit gating condition before the flag is ever flipped for real. Neither is currently a permanent, automated fact: Story 3.1's suite has only been run against the flag-ON path manually, twice, by hand during Stories 3.4/3.5's own development — never as part of `npm run test`. Story 3.5's toggle test proves routing (which branch runs) for 4 of 9 flag-gated call sites, but never proves behavioral equivalence (same redirect URL/error message as baseline) for any of them, by its own explicit, deliberate scope decision. Separately, investigation confirms no test in this domain proves in-process (Server Action) and HTTP (Route Handler) behavior are equivalent for the same underlying action — the exact gap Story 1.8 closed for report groups.

**Scope correction (investigated, not guessed):** unlike Story 1.7, this domain kept both paths alive, so this story is not "not applicable" — real, specific gaps exist, identified by direct investigation rather than assumed from the title: (a) no permanent flag-ON equivalence proof exists for any of the 7 functions Story 3.1 characterized; (b) AC2's non-Supervisor-rejected-on-an-org-management-action case has zero test coverage anywhere (Story 3.3's route suite only exercises the Supervisor's own successful calls); (c) no in-process-vs-HTTP equivalence check exists for this domain, mirroring Story 1.8's own closed gap for report groups.

**Approach:** One new test file, `tests/integration/admin-members-auth-new-path-verification.test.ts`, three sections, all real (local Supabase, no manager/RPC mocking — this story proves genuine equivalence, unlike Story 3.5's routing-only spies): (1) re-run Story 3.1's characterized scenarios against the Server Actions with the flag forced on for the file's duration, asserting the exact same redirect URLs/error messages Story 3.1's baseline documents, for all 7 characterized functions (not just Story 3.5's 4-of-9 sample); (2) add the missing non-Supervisor-rejected coverage at the Route Handler layer for `renameOrganization`/`inviteMember`/`createDepartment`; (3) one in-process-vs-HTTP equivalence test (mirroring Story 1.8's technique) proving `createOrganizationAsAdmin`'s Server-Action-layer outcome and the equivalent Route Handler's JSON response describe the same underlying state change. Story 3.1's frozen characterization file itself is never touched or duplicated wholesale — this file reuses its scenarios' *assertions*, not its file.

## Boundaries & Constraints

**Always:**
- The flag is set to `"true"` once, for this file's duration only (`beforeAll`/`afterAll`), never left set for any other test file — confirm via a full `npm run test` run that no other suite's behavior changes.
- Every assertion in section (1) asserts the exact same redirect URL shape / error message text Story 3.1's baseline already documents for that scenario — copy the assertion, not just the intent, so a real regression (not just "some path ran") would fail this test.
- Section (2)'s non-Supervisor tests assert the exact rejection message the underlying RPC/manager already throws (already characterized/tested at the manager layer by Story 3.2) — this story proves the Route Handler surfaces it correctly, not that the message itself is right.
- Section (3)'s equivalence check is a single, representative scenario (mirroring Story 1.8's own minimal scope, not exhaustive per-function re-proof) — call both the Server Action (flag on) and the Route Handler for the same underlying operation against the same seed, assert both produce the same resulting state (e.g., the same organization row exists afterward with the same name).

**Never:**
- Do not modify `tests/characterization/admin-members-auth.test.ts` (Story 3.1's frozen baseline) — read-only reference for its exact scenarios/assertions, never edited or duplicated wholesale.
- Do not modify `tests/characterization/admin-members-auth-manager.test.ts`, `tests/integration/admin-members-auth-route.test.ts`, or `tests/integration/admin-members-auth-flag-toggle.test.ts` — all already-shipped, reviewed story deliverables; this story adds one new file, not edits to prior ones.
- Do not modify any file under `src/` — this story is test-only, no production code changes.
- Do not flip the flag to `"true"` anywhere outside this one test file's own scoped `beforeAll`/`afterAll`.
- Do not attempt to prove equivalence for `dashboard/page.tsx`'s `checkIsPlatformAdmin`/`claimPendingInvitations` branches — those aren't part of Story 3.1's characterized baseline (Story 3.1 characterizes Server Actions/`accept_member_invite`, not the platform-admin-check or claim-invitations reads) and are out of this story's AC1 scope.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `createOrganizationAsAdmin`, flag on, as platform admin | valid org/admin fields | same `/admin?created=...&createdEmail=...&createdOrg=...` shape as Story 3.1's baseline | N/A |
| `createOrganizationAsAdmin`, flag on, non-admin caller | as regular member | same `/admin?error=...` message as baseline | thrown-not-swallowed |
| `updateOrganizationName`, flag on, valid input | as platform admin | same `/admin/empresas/{id}?updated=1` as baseline | N/A |
| `inviteMember`, flag on, valid input | as the Supervisor | same `/dashboard/members?invited=...&invitedEmail=...` as baseline | N/A |
| `createDepartment`, flag on, valid name | as the Supervisor | same `/dashboard/members` redirect as baseline | N/A |
| `signIn`/`signOut`, flag on | valid/invalid credentials | same redirect + cookie shape as baseline | N/A |
| `POST /api/admin/organizations/[id]` (rename), non-Supervisor caller | valid token, not this org's Supervisor | 422, the RPC's own not-authorized message, `renameOrganization` still runs but the underlying RPC rejects (or is rejected earlier if RLS-scoped) | thrown-not-swallowed |
| `POST /api/members/invite`, non-Supervisor caller | valid token, caller not a Supervisor of the target org | 422, the RPC's own not-authorized message | thrown-not-swallowed |
| `createOrganizationAsAdmin` in-process vs. `POST /api/admin/organizations` over HTTP, same seed | identical valid input | both produce an `organizations` row with the same name/admin email afterward | N/A |

</frozen-after-approval>

## Code Map

- `tests/characterization/admin-members-auth.test.ts` (Story 3.1, frozen) -- read-only: exact scenario fixtures and assertion strings (redirect URLs, error messages) to reproduce against the flag-ON path.
- `tests/characterization/admin-members-auth-manager.test.ts` (Story 3.2) -- read-only: confirms manager-layer correctness already proven; this story doesn't re-prove the manager, only that the Server Action/Route Handler correctly reach it.
- `tests/integration/admin-members-auth-route.test.ts` (Story 3.3) -- read-only: existing Route Handler test shape/mocking pattern to reuse; confirmed only exercises Supervisor's own successful calls, never a non-Supervisor rejection on an org-management action -- the gap section (2) closes.
- `tests/integration/admin-members-auth-flag-toggle.test.ts` (Story 3.5) -- read-only: proves routing only (spied managers), for 4 of 9 call sites; this story proves real behavioral equivalence instead, for all 7 characterized functions.
- `src/app/actions/{admin,members,auth}.ts`, `src/app/dashboard/page.tsx` (Story 3.4) -- read-only: exact flag-branch shape to exercise with `USE_NEW_API_ADMIN_MEMBERS="true"`.
- `_bmad-output/implementation-artifacts/spec-1-8-new-path-verification-against-the-characterization-baseline.md` -- precedent for this story's shape and the in-process-vs-HTTP equivalence technique (section 3).
- `_bmad-output/planning-artifacts/epics.md` (Story 3.6 AC, lines ~556-574) -- verbatim AC this spec satisfies.

## Tasks & Acceptance

**Execution:**
- [x] `tests/integration/admin-members-auth-new-path-verification.test.ts` -- new -- section (1): flag-on equivalence for all 7 characterized functions
- [x] same file -- section (2): non-Supervisor rejection coverage for `renameOrganization`/`inviteMember`/`createDepartment` at the Route Handler layer
- [x] same file -- section (3): one in-process-vs-HTTP equivalence check for `createOrganizationAsAdmin`

**Acceptance Criteria:**
- Given Story 3.1's characterization tests' recorded outputs, when the same scenarios run against the new path (flag on) in this story's new file, then every recorded output matches exactly.
- Given the new path, when a non-admin attempts a platform-admin-only action or a non-Supervisor attempts an organization-management action, then both are correctly rejected, matching today's RLS-backed behavior exactly.
- Given both test sets pass, when this story is complete, then the flag is considered safe to flip -- the explicit gating condition for this domain's eventual rollout.
- Given the full `npm run test` suite, when this story's new file runs, then no other test file's behavior changes (the flag is not leaked outside this file's own scope).

## Implementation Notes

Added one new file, `tests/integration/admin-members-auth-new-path-verification.test.ts` (18 tests), test-only, no `src/` changes. Reused Story 3.1's exact mock shape (`next/navigation`/`next/cache`/`next/headers`/`@/lib/supabase/server`, `actingAs()`/`actingWithRealSession()`) since Section 1 exercises the same Server Actions Story 3.1 does, with `USE_NEW_API_ADMIN_MEMBERS` forced to `"true"` for the file's duration only (`beforeAll`/`afterAll`, restoring the prior value, never a bare delete when a value pre-existed).

**Section 1** reproduces Story 3.1's full fixture chain (org → Supervisor accept → rename → department → member invite → member accept → login/logout) against the flag-ON Server Actions, copying every assertion verbatim. `accept_member_invite` has no dedicated Server Action (same note Story 3.1 makes); its new-path equivalent — `membersManager.acceptInvite`, the exact function `dashboard/page.tsx`'s flag-ON bootstrap branch calls — is exercised directly, since replicating the full `DashboardPage()` render is Story 3.5's routing job and out of this story's scope per the spec's frozen "Never" list.

**Section 2** adds non-Supervisor/non-platform-admin rejection coverage at the Route Handler layer for `renameOrganization` (as the Supervisor, not the platform admin), `inviteMember` and `createDepartment` (as a regular member, not a Supervisor) — confirmed each RPC's current exact rejection message by reading the live migrations (`invite_member`: `0020_remove_manager_role.sql`; `create_department`: `0017_supervisor_and_admin_management.sql`; `update_organization_name`/rename: `0017`). Each test adds a `vi.spyOn` (calling through to the real implementation, never mocked) proving the route actually reached the manager and the manager threw — not a coincidentally-matching 422 from an earlier validation layer — mirroring the review finding Story 1.8 patched in for report groups.

**Section 3** proves `createOrganizationAsAdmin` in-process (`adminManager.createOrganization`) vs. `POST /api/admin/organizations` over HTTP produce structurally equivalent resulting state (matching org name, admin email, and `"invited"` Supervisor status via `listAllOrganizations`/`list_organizations`), mirroring Story 1.8's technique.

## Spec Change Log

## Review Triage Log

**3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap):**

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | The frozen I/O & Edge-Case Matrix omits several scenarios the file actually implements (`accept_member_invite`'s 3 scenarios, `updateOrganizationName`'s non-admin rejection, `createDepartment`'s route-level rejection, 2 pre-RPC validation edge cases) | n/a | rejected | Fix is to edit this build's frozen spec table only — explicitly barred regardless of merit. The underlying tests themselves are correct and were independently verified by Verification Gap line-by-line against baseline assertions. |
| 2 | The Intent's "AC2's non-Supervisor-rejected case has zero test coverage anywhere" overstates the gap — Story 3.3's route suite already tests `POST /api/admin/organizations`'s non-admin rejection (only rename/invite/department's rejections were genuinely untested) | n/a | rejected | Fix is to edit this build's spec prose only. Verified true (Story 3.3's suite does cover the create-org non-admin case) but doesn't affect code correctness — the new tests don't duplicate 3.3's existing coverage. |
| 3 | Code Map lists only test files as read-only references, not the actual production Route Handlers/managers/`src/server/shared/auth.ts` this story's new tests import and exercise | n/a | rejected | Fix is to edit this build's spec's Code Map only. |
| 4 | `type: 'feature'` frontmatter is inconsistent with this repo's established convention for pure-verification/characterization stories (`spec-1-1`, `spec-3-1`, `spec-1-8` all use `'chore'`) | low | fixed directly | Trivial metadata correction outside the frozen block; applied directly rather than routed through the implementer. |
| 5 | `docs/feature-flags.md` (Story 3.5) already anticipates this story by name ("re-verified by Story 3.6") but is never updated to point at the new test file or record the flag as verified-safe-to-flip | medium | patch | Real, verified — the one operational doc someone reads before flipping the flag says nothing about this story's completion, even though AC3 is precisely that milestone. |
| 6 | AC2's "matching today's RLS-backed behavior exactly" phrasing (copied verbatim from epics.md) mischaracterizes the mechanism — these are `RAISE EXCEPTION` checks inside `SECURITY DEFINER` RPC functions, not RLS policies | low | rejected | Faithfully reproducing epics.md's own AC text verbatim is this initiative's established convention (every prior story's Tasks & Acceptance does the same); the inaccuracy originates in epics.md itself, not this story's own investigation. |
| 7 | Section 3's in-process-vs-HTTP equivalence check only proves the success path equivalent — Story 1.8, which this section explicitly claims to mirror, was itself patched to add a *rejection*-path equivalence test, and Section 2 already builds the exact non-admin fixtures needed to add one cheaply here | medium | patch | Real, verified against `spec-1-8`'s own Review Triage Log. Directly strengthens AC2's "both are correctly rejected... exactly" requirement; low-cost given existing fixtures. |
| 8 | `login()`/`signUpOrSignIn()` test helpers (copied from Story 3.1's baseline) lack guards for a few edge cases (no `access_token` in response, signup failing for a reason other than already-registered) | low | defer | Real but pre-existing, inherited boilerplate present in every test file in this domain — not introduced by this story. Matches Story 1.1's own already-logged deferred-work.md entry about extracting these shared helpers. |
| 9 | Three `vi.spyOn(...)...mockRestore()` blocks (Section 2's rename/invite/department rejection tests) have no `try/finally` — an assertion throwing between spy setup and restore would leave the spy active for later tests | low | patch | Real test-hygiene gap; practical risk is minimal (each spied method is unique to its own test, no cross-test collision currently possible), but the fix is cheap and genuinely improves hygiene. |

No `intent_gap` or `bad_spec` entries — no loopback triggered.

## Verification

**Commands run:**
- `npx vitest run tests/integration/admin-members-auth-new-path-verification.test.ts` -- 19/19 passing (18 original + 1 added during review)
- `npm run test` -- 161/161 passing (142 prior + 19 new), confirming no other suite's behavior changed with the flag scoped to this file only
- `npm run lint` -- 0 errors, 1 pre-existing warning (`scripts/seed-company-360.mjs`, unrelated to this story) -- no new violations
- `npx tsc --noEmit` -- clean, no output, exit 0
