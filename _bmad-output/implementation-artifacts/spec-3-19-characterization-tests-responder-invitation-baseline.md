---
title: 'Characterization Tests for Responder/Invitation (Current Behavior Baseline)'
type: 'chore'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2268d6fab938bed2e515c216c323c5a3e687c37f'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/responder/[token]` and `/invitacion/[token]` (Server Components) plus `submitFeedbackResponse` (`src/app/actions/feedback.ts`, the only Server Action in this domain) have zero test coverage. This is the first story of Epic 3's responder/invitation domain (3.19-3.24) — deliberately migrated last of the 5 backend domains, since it is the external, unauthenticated, highest-stakes-to-break surface. Before any refactor, its exact current behavior must be captured as a frozen baseline.

**Approach:** Since Server Component rendering itself is not unit-testable in this repo (per `epic-3-context.md`'s own established constraint — no prior domain story has attempted it), this story characterizes the 3 underlying RPCs directly via real HTTP calls against a local `supabase start` instance (`get_responder_context`, `get_invite_details`, both anon-grantable reads the two page components call) plus `submitFeedbackResponse` itself as a real Server Action (same technique every prior characterization suite uses). Fixtures: `scripts/seed-demo-company.mjs` for org/member infrastructure, then ad-hoc feedback requests/invitations and a member invite created directly via the real RPCs under test.

**Scope corrections (investigated, not guessed):**
- `acceptInviteSignUp` (`src/app/actions/auth.ts`) — the action `/invitacion/[token]`'s form actually submits to — calls `supabase.auth.signUp()` directly, never an RPC, and already has "no manager equivalent" per Story 3.2's own investigated scope correction (its own header comment states this explicitly). Not characterized here as an RPC-level flow; only `get_invite_details`' read behavior (what the page renders/redirects on) is in scope, matching epics.md's Story 3.20 AC, which lists `get_invite_details` but not `accept_member_invite`/`claim_pending_email_invitations` for `db/responder.ts` (those two are already owned by `membersManager`, Story 3.2 — confirmed via direct grep, zero overlap).
- epics.md's Story 3.19 AC phrase "accepting/declining a group invitation" has no literal code counterpart: `/invitacion/[token]` has no decline mechanism anywhere in the codebase (confirmed via repo-wide search) — only an accept (complete-signup) path exists. This story characterizes `get_invite_details`' actual valid/invalid/already-used states instead of a non-existent decline flow.
- `get_responder_context`'s `requires_login: true` state (member-linked invitation, caller not logged in as that member) is a 4th real state beyond the AC's named 3 ("valid token, expired/invalid token, already-used token") — confirmed via direct read of the RPC's source (`supabase/migrations/0061_saboteadores.sql:93-153`) and included, since it's this domain's most distinctive trait (the auth-model split between individual/email invites, which need no login at all, and member-linked invites, which do).

## Boundaries & Constraints

**Always:** Real Supabase throughout (no RPC/manager mocking), exact-string assertions on RPC output shapes/error messages, same technique every prior characterization file in this repo uses. Cover both invitee account types: individual/email invite (`feedback_invitations.invitee_member_id is null`, fully anonymous, `anon` role, no bearer token) and member-linked invite (requires the invitee's own login).

**Never:** Do not characterize `acceptInviteSignUp`/`individualSignUp` (`src/app/actions/auth.ts`) — already investigated and excluded by Story 3.2, calls `supabase.auth.signUp()` directly, not an RPC. Do not characterize `accept_member_invite`/`claim_pending_email_invitations` — already owned by `membersManager` (Story 3.2), not this domain. Do not attempt to render `/responder/[token]` or `/invitacion/[token]` as React components — not unit-testable in this repo, per established constraint.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `get_responder_context`, invalid token | bogus/nonexistent token | `{valid: false}` | N/A |
| `get_responder_context`, member invite, not logged in as invitee | valid token, no/wrong session | `{valid: false, requires_login: true}` | N/A |
| `get_responder_context`, valid unused (peer) | member invite, correct login | `{valid: true, used: false, is_self: false, questions, scale_levels, competencies}` | N/A |
| `get_responder_context`, valid unused (individual/anon, self) | individual account's own self-evaluation invite, anon | `{valid: true, used: false, is_self: true, ...}` | N/A |
| `get_responder_context`, already used | invitation already submitted | `{valid: true, used: true}` | N/A |
| `submitFeedbackResponse`, valid (peer, logged in) | complete required answers | redirects to `/dashboard?responded=1`, invitation marked used | N/A |
| `submitFeedbackResponse`, valid (individual/anon) | complete required answers, no session | redirects to `/responder/{token}` (no dashboard to return to) | N/A |
| `submitFeedbackResponse`, invalid/already-used token | reused or bogus token | redirects to `/responder/{token}?error=` with the RPC's own exact message | thrown-not-swallowed |
| `submitFeedbackResponse`, missing required answers | incomplete submission | redirects with RPC's own exact "Faltan respuestas obligatorias." message | thrown-not-swallowed |
| `get_invite_details`, valid (status = 'invited') | fresh member invite | `[{organization_name, email, full_name, valid: true}]` | N/A |
| `get_invite_details`, already accepted | member status now 'active' | `[{..., valid: false}]` | N/A |
| `get_invite_details`, bogus token | nonexistent invite_token | `[]` (empty array, no row) | N/A |

</frozen-after-approval>

## Code Map

- `tests/characterization/feedback.test.ts` (Story 3.13) -- exact shape to mirror: mock only `next/navigation`/`next/cache`; real Supabase throughout; `login`/`actingAs(token)` helper; exact-string assertions. `submitFeedbackResponse` was used there only as anon fixture-building plumbing (`respondAsEvaluator` helper) — this story is the first to characterize it as the actual subject under test, from the invitee's own perspective.
- `src/app/responder/[token]/page.tsx` -- read-only reference: exact `get_responder_context` call shape and the 3 rendered states (`requires_login` → redirect to `/login`; `!valid` → "No encontrada"; `used` → "Ya has respondido").
- `src/app/invitacion/[token]/page.tsx` -- read-only reference: exact `get_invite_details` call shape and the `!invite || !invite.valid` → "Invitación no válida" state.
- `src/app/actions/auth.ts` -- `acceptInviteSignUp` (lines ~20-51) -- read-only reference confirming its own header comment's "no manager equivalent" claim (Story 3.2), and its exact `supabase.auth.signUp()` call shape with `pending_invite_token` metadata.
- `src/app/actions/feedback.ts` -- `submitFeedbackResponse` (lines 109-165, unmodified since Story 3.13/3.16 — no `USE_NEW_API_FEEDBACK` flag check, confirmed) -- the Server Action to characterize as this story's primary subject.
- `src/server/managers/membersManager.ts`, `src/server/db/members.ts` -- confirmed via grep to already own `acceptMemberInvite`/`claimPendingEmailInvitations` (Story 3.2) -- zero overlap with this domain's scope.
- `supabase/migrations/0061_saboteadores.sql:93-274` -- latest `get_responder_context`/`submit_feedback_response` definitions (both redefined since `0038_anonymous_responder.sql`, which is where the `anon`-role grants were added).
- `supabase/migrations/0003_member_invites.sql:84-98` -- `get_invite_details`'s only-ever definition, `anon`-granted.
- `scripts/seed-demo-company.mjs` -- org/member infrastructure; builds zero ad-hoc requests or member invites itself (same confirmed-empty baseline every prior ad-hoc-domain story has established).

## Tasks & Acceptance

**Execution:**
- [x] `tests/characterization/responder-invitation.test.ts` -- new -- characterizes `get_responder_context` (5 states), `submitFeedbackResponse` (valid peer/individual paths + representative error paths), and `get_invite_details` (3 states), covering every I/O & Edge-Case Matrix row above

**Acceptance Criteria:**
- Given the current `/responder/[token]` and `/invitacion/[token]` page implementations, untouched, when characterization tests are written against seeded demo data (valid token, expired/invalid token, already-used token), then they capture viewing the wizard context and submitting a full response, both with and without login, plus `get_invite_details`' valid/invalid/already-used states
- Given these tests, when run against today's implementation, then all pass, including the invalid/expired/already-used token rejection cases

## Implementation Notes

**New file:** `tests/characterization/responder-invitation.test.ts` (13 `test()` blocks across 3 `describe` groups -- `get_responder_context`, `submitFeedbackResponse`, `get_invite_details` -- against the local `supabase start` instance, no application source touched).

**Accurate mock list (same investigated shape every prior Story 3.1x characterization file uses):** only `next/navigation`, `next/cache` and `@/lib/supabase/server` -- confirmed by reading `submitFeedbackResponse` (the only Server Action in scope) that it never touches cookies directly. One addition beyond `feedback.test.ts`'s own mock: `actingAsAnon()`, a second mode on the same mocked client factory that sends no `Authorization` override at all (so `@supabase/supabase-js` falls back to its own default -- the anon key itself -- landing the call on Postgres's `anon` role), needed for the individual/email-invite responder, who never logs in.

**Fixture:** one fresh demo company per run via `scripts/seed-demo-company.mjs` (`node scripts/seed-demo-company.mjs "Char Test Responder <runId>" 8`), same `execFileSync` + stdout-regex-parsing technique every prior characterization file uses, for org/member/department infrastructure only. Every feedback invitation, member invite and individual account actually under test is built directly through the real RPCs/actions under test (`create_ad_hoc_feedback_request`, `create_ad_hoc_feedback_request_for_individual`, `create_individual_cycle_request`, `create_individual_account`, `invite_member`, `accept_member_invite`, and `submitFeedbackResponse` itself), never through the seed script's own internal calls (confirmed-empty for ad-hoc/individual/member-invite fixtures, same as every prior ad-hoc-domain story).

**Fixture reuse (deliberate, one dedicated purpose per invitee, to hold the employee count to 8):** a single peer `ad_hoc` request (5 invitees, `general` subtype -- `default_open_feedback` template, 5 `open` questions) is built once and its 3 first invitees each carry exactly one job through the file: `peerInvitees[0]` walks the full peer lifecycle in dependency order (not-logged-in check -> valid-unused check -> valid submission via the real Server Action, which marks it used -> reused-token error check, in that order across two `describe` blocks); `peerInvitees[1]` stays untouched until the dedicated "missing required answers" scenario; `peerInvitees[2]` is answered directly via `submit_feedback_response` (fixture-building plumbing, the same investigated allowance `feedback.test.ts`'s own `respondAsEvaluator` established), purely to produce an already-used invitation for `get_responder_context`, self-contained within its own `describe` block rather than depending on `submitFeedbackResponse`'s tests having already run.

**Scope corrections confirmed during implementation, not guessed:**
- `create_individual_cycle_request`'s signature has changed since Story 3.19's own scope-correction bullet was written against 0042's original 1-arg version -- its current, latest definition (`0057_feedback_request_name.sql:212-` -- confirmed via `grep` across every migration) takes `p_evaluator_emails`, `p_evaluator_categories` (matching length, values in `manager`/`team`/`organization`/`other`), a future `p_closes_at` date, and optional `p_name`. The test calls the current signature.
- `get_invite_details` is a *member*-invite token (`members.invite_token`, "join this organization"), a completely different table/flow from every `feedback_invitations.token` scenario in the rest of the file -- fixtures built via `invite_member` (requires an `is_supervisor` caller + valid `department_id`, confirmed via `0020_remove_manager_role.sql`) called directly on the seeded Supervisor, never through a Server Action (none wraps it for this purpose; `inviteMember` in `src/app/actions/members.ts` is Story 3.2/3.4's own admin/members-domain action, out of scope here).

**RPC exact messages (confirmed against final/authoritative migration source, matching each RPC's *current* definition, same technique every prior characterization file uses):**
- `submit_feedback_response` (`0061_saboteadores.sql`, latest -- text unchanged since `0001_initial_schema.sql`) -- invalid/already-used token: `'Invitación no válida o ya utilizada.'`; missing required answers: `'Faltan respuestas obligatorias.'`.

**Nothing left incomplete or risky.** No file under `src/app/responder/[token]/page.tsx`, `src/app/invitacion/[token]/page.tsx`, `src/app/actions/feedback.ts` or `src/app/actions/auth.ts` was modified -- only the new test file, this spec, `_bmad-output/implementation-artifacts/sprint-status.yaml` and `epic-3-context.md` (marking Story 3.19 done, same finalize-step precedent Story 3.13's own review triage established). No review lens was run against this diff (not requested); a future `bmad-review`/`bmad-retrospective` pass over this story remains available if desired.

## Spec Change Log

## Review Triage Log

3-lens review (Blind Hunter, Edge Case Hunter, Verification Gap) run against the diff at baseline `2268d6fab938bed2e515c216c323c5a3e687c37f`.

- **[patch, low]** Blind Hunter (confirmed via direct grep against the real migration file, not taken on faith): the test file's inline comments cite `supabase/migrations/0061_saboteadores.sql:186` for `"Invitación no válida o ya utilizada."` (actual: line 184) and `:222` for `"Faltan respuestas obligatorias."` (actual: line 253, off by 31). Patched: both citations corrected.
- **[false, self-correcting]** Blind Hunter: claimed the test file's header comment (`submitFeedbackResponse` at `src/app/actions/feedback.ts:200-256`) disagreed with this spec's own Code Map (`lines 109-165`). Re-verified directly (`grep -n "submitFeedbackResponse" src/app/actions/feedback.ts` → line 200 only): the test file's `200-256` citation is correct: `109-165` was this spec's own Code Map error (that range is actually `updateFeedbackRequestEvaluators`'s flag-check code). No test-file change needed; noting here so this spec's own Code Map isn't trusted uncorrected in a future story.
- **[patch, medium]** Verification Gap: the anon/individual `submitFeedbackResponse` success test never re-queries `feedback_invitations.used_at` after the call, unlike its peer/logged-in sibling test three lines above it, which does. The anonymous path is this domain's architecturally distinctive one and the one most likely to diverge once Stories 3.20-3.24 move it off a direct RPC call -- a future regression where anonymous submissions stop persisting `used_at` while the redirect URL still looks correct would ship past this baseline undetected. Patched: added the same `used_at` assertion.
- **[patch, medium]** Blind Hunter: `submit_feedback_response` raises `"Esta invitación no corresponde a tu usuario."` when a member-linked invitation is submitted under the wrong login -- the one error path most specific to this domain's distinctive auth-model split, and previously uncharacterized. Patched: added a dedicated test.
- **[patch, low]** Blind Hunter: `get_responder_context`'s check order returns `requires_login: true` for a not-logged-in caller on a member-linked invitation *before* checking `used_at` -- meaning an already-used member-linked invitation queried without login yields `requires_login: true`, not `used: true`. This RPC-branch-priority interaction was never exercised. Patched: added a dedicated test reusing the "already used" fixture's token, queried with `ANON_KEY` instead of the invitee's own token.
- **[defer]** Blind Hunter: `submit_feedback_response`'s two remaining unexercised error paths (foreign question ids, competency-count/existence validation) are generic input-shape guards, less specific to this domain's own distinguishing traits than the identity-mismatch guard already patched above.
- **[defer]** Blind Hunter: `buildAnswersFormData`'s `"competency"` branch is unexercised in this file (no fixture here pairs a competency-bearing template with `submitFeedbackResponse` as the primary subject) -- but the RPC-level competency-answer submission path is already exercised elsewhere in this suite (`tests/characterization/feedback.test.ts`, `feedback-manager.test.ts`, `feedback-new-path-verification.test.ts` all call `submit_feedback_response` directly with competency answers as fixture-building plumbing), just never through this specific Server Action.
- **[rejected]** Blind Hunter: the I/O matrix's self-evaluation row is labeled "individual/anon, self" but the actual RPC requires login for that case (individual accounts still get a `members` row, so `invitee_member_id is not null` applies) -- a real wording imprecision, but the fix is editing this build's frozen I/O matrix, rejected per that explicit rule regardless of merit.
- **[defer]** Edge Case Hunter's 6 test-helper defensive-guard findings (no explicit throw if `login()` gets no `access_token`, a redirect URL is missing `error=`, the departments query returns empty, a seeded email has no matching member id, `invitationRows` returns fewer than 5 rows, or `ctx.competencies` is empty for a competency question): the same class of test-helper hardening gap already logged repeatedly across this initiative.
- **[defer]** Edge Case Hunter's claim finding: epics.md's AC phrase "expired/invalid token" has no literal `expires_at`/time-based mechanism anywhere in the schema (confirmed: `feedback_invitations` has only `used_at`, no expiry column) -- "expired" and "invalid" are the same tested state in this codebase. The suite's actual coverage (bogus-UUID + already-used) is correct; only the AC's own paraphrase is imprecise, already partially addressed by this spec's own frozen "Scope corrections" section for the adjacent "declining" phrase.
- **[false]** Blind Hunter's claims that `package.json` has no `test` script, `vitest`/`vitest.config.ts` don't exist, `tests/`/`src/server/` don't exist, `sprint-status.yaml` lists every epic-3 story as `backlog`, and `baseline_commit` doesn't resolve in git history: all directly refuted by re-verification against the actual repository at `/home/oski/workspace/kairosexperience/brujula-core` (`vitest.config.ts` exists, `package.json`'s `test` script is `vitest run`, `git show` resolves the baseline commit cleanly, `sprint-status.yaml` has 18 epic-3 stories already `done`) -- this lens appears to have investigated the wrong repository for these specific checks.
- **[defer]** Blind Hunter: no teardown/cleanup for seeded companies/accounts. Pre-existing, already logged for Story 1.1 and repeatedly since -- not introduced by this story.
- **[defer]** Blind Hunter: `seed-demo-company.mjs`'s `platform_admins` bootstrap precondition isn't documented in this story's own artifacts. Pre-existing requirement of the shared seed script, not introduced by this story.

## Verification

**Commands run:**
- `docker ps` confirmed `supabase_db_brujula`/`supabase_auth_brujula`/`supabase_rest_brujula`/`supabase_kong_brujula` all healthy while `npx supabase status` reported the CLI-tracked realtime/storage/etc. services "stopped" -- the same known-normal state prior characterization stories already documented for this repo; no restart needed.
- `npx vitest run tests/characterization/responder-invitation.test.ts` -- 13/13 passed, run twice back-to-back for idempotency (the `Date.now()`-suffixed company name/emails avoid cross-run collisions, same convention every characterization file in this repo uses).
- `npm run test` -- 21 files, 380 tests passed (365 prior + 15 new, after review-triage patches added 2 tests).
- `npm run lint` -- 0 errors; the 1 pre-existing warning (`scripts/seed-company-360.mjs`, unrelated, untouched) is unchanged.
- `npx tsc --noEmit` -- no output, no type errors.
