---
title: 'Invitación Accept/Decline Redesign'
type: 'feature'
created: '2026-09-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '241863502947d4a728d23c98b4fd0d26791dddfb'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Investigated, real mismatch between epics.md's literal text and the actual codebase — resolved before writing this spec, not guessed:** epics.md's Story 2.7 AC names the route `/invitacion/[token]` and asks for report-group accept/decline behavior there. Investigation shows this is wrong: `/invitacion/[token]` (confirmed via `supabase/migrations/0003_member_invites.sql`'s own comments, `get_invite_details`, `accept_member_invite`) is the **organization-member signup** page — a brand-new employee creating a password to join the company on Brújula. It has no accept/decline choice at all, just one "Crear cuenta" submit. Report-group accept/decline already exists at `/dashboard/groups/[id]`'s pending-invite section (Confirmar/Rechazar), already redesigned in Story 2.6 — but *without* the checkmark-acknowledgment/asymmetric treatment this story asks for.

EXPERIENCE.md independently and repeatedly (4 separate mentions: lines 30, 64, 94, plus the Inspiration & Anti-patterns section) describes exactly this story's behavior — "Invitación, accept/decline... shows the group name and inviter... accepting shows the Officevibe-style one-time checkmark acknowledgment... declining returns a plain confirmation" — as belonging to the **report-group invitation** flow, consistently and specifically enough that this reads as the true intent, with epics.md's route name being a copy-paste error inherited from EXPERIENCE.md's own (incorrect) use of the `/invitacion/[token]` route name for what is actually a different, already-built flow at `/dashboard/groups/[id]`. Building a brand-new accept/decline concept onto the actual `/invitacion/[token]` signup page would mean adding new backend/routing behavior, which contradicts Epic 2's whole scope (presentation-only, no new features — established by every prior Epic 2 story).

**Decision:** this story targets `/dashboard/groups/[id]`'s existing pending-invite section (Confirmar/Rechazar), adding the checkmark-acknowledgment/asymmetric treatment EXPERIENCE.md describes. `/invitacion/[token]` (the actual signup page) is not touched by this story.

**Approach (revised — see Spec Change Log):** the acknowledgment is signaled entirely client-side via `sessionStorage`, never by changing `respondToReportGroup`'s redirect target. A small Client Component (`PendingInviteActions.tsx`) replaces the pending-invite section's two inline `<form>`s: its accept form's `onSubmit` handler calls `sessionStorage.setItem("brujula:justAcceptedGroup:" + groupId, "1")` synchronously before the native form POST navigates away (the decline form gets no such handler — genuinely plain). A second small Client Component (`AcceptAcknowledgment.tsx`), rendered near the top of the detail page and given `isAccepted={group.my_status === "accepted"}` as a prop (the page already computes/has this server-side), checks the `sessionStorage` key on mount via `useEffect`; it shows the one-time checkmark acknowledgment only when **both** the key is present **and** `isAccepted` is true (guards against a dangling flag from a failed/abandoned accept attempt — the flag alone is never trusted, only combined with the server-confirmed status) — coral-deep icon + confirmation text, the same "reconfirmation" visual language Story 2.4's `AnonymityBadge` emphasis already established — and immediately clears the key so it never shows again (including on refresh). The transition/appearance is `motion-safe:`-gated (instant with reduced motion) — decorative, not load-bearing: the member's accepted status is already reflected in the member list regardless of whether the acknowledgment's animation plays, or even whether it shows at all (e.g. `sessionStorage` unavailable in a privacy mode — fails silently, never blocks the actual accept).

## Boundaries & Constraints

**Always:**
- Accept and decline stay visually asymmetric: accept gets the one-time checkmark acknowledgment, decline gets nothing beyond the existing plain redirect — by design, not an oversight.
- The acknowledgment is `motion-safe:`-gated; with `prefers-reduced-motion`, it still appears (the confirmation itself isn't decorative — only its transition is), just without an animated entrance.
- **`src/app/actions/reportGroups.ts` (`respondToReportGroup`) is NOT modified at all — confirmed via Story 1.1's frozen characterization suite, which asserts the exact unparameterized redirect URL for both the accept and decline paths (`tests/characterization/report-groups.test.ts:299,310,328`). Any change to this Server Action's redirect target is a real, test-caught regression against that frozen baseline, not a cosmetic no-op — see Spec Change Log.**

**Never:**
- Do not touch `/invitacion/[token]`'s actual page or `acceptInviteSignUp` — confirmed out of scope per the investigation above.
- Do not modify `src/app/actions/reportGroups.ts`, `reportGroupsManager.respondToGroup`, or any `src/server/*` file — the acknowledgment is signaled entirely client-side via `sessionStorage`, with zero change to the Server Action's observable behavior (redirect target, RPC calls, error handling all stay byte-for-byte identical to Story 1.6).
- Do not add a new reusable `src/components/ui/*` primitive for this acknowledgment — it's a one-off, page-specific element, not a pattern needed elsewhere yet (unlike Story 2.4's components, which were reused across multiple contexts from the start). `PendingInviteActions.tsx`/`AcceptAcknowledgment.tsx` live alongside the page, not in `src/components/ui/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Accept a pending invite | form submit, `accept=true` | `sessionStorage` flag set pre-navigation; redirect to `/dashboard/groups/[id]` (unchanged, no query param — matches Story 1.1's frozen assertion); page shows the checkmark acknowledgment once, flag cleared immediately | N/A |
| Decline a pending invite | form submit, `accept=false` | redirect to `/dashboard/groups/[id]` (unchanged); no `sessionStorage` write, no acknowledgment, page renders exactly as Story 2.6 left it | N/A |
| Accept, `prefers-reduced-motion: reduce` | OS setting | acknowledgment still appears, no animated entrance | N/A |
| Refresh the page after the acknowledgment already showed once | repeat visit, same session | acknowledgment does not reappear — the `sessionStorage` key was cleared on first read | N/A |
| `sessionStorage` unavailable (e.g. privacy mode) | browser restriction | write/read both fail silently (try/catch); no acknowledgment shown, but accept itself still succeeds — decorative, never load-bearing | N/A |
| Accept fails (manager throws), user abandons rather than retrying | existing error branch, dangling `sessionStorage` flag | on any later visit while still `pending`, the acknowledgment does NOT show — `isAccepted` (from the real, server-confirmed `my_status`) is false, so the flag alone is never sufficient | N/A |

</frozen-after-approval>

## Code Map

- `src/app/actions/reportGroups.ts` (Story 1.6) — `respondToReportGroup` reverted to its exact Story 1.6 form (unconditional `redirect(\`/dashboard/groups/${groupId}\`)`, no query param, no other change) — **not modified by this story at all** after the correction; confirmed against `git diff` that this file matches the pre-Story-2.7 baseline exactly.
- `tests/characterization/report-groups.test.ts:299,310,328` (Story 1.1, frozen) — the exact assertions that caught the original approach's regression (`expect(url).toBe(\`/dashboard/groups/${groupA}\`)`, no query param, for accept/decline/close). This suite must still pass unmodified — it's the reason the approach changed.
- `src/app/dashboard/groups/[id]/page.tsx` (Story 2.6) — replace the pending-invite `Card`'s two inline `<form>`s with `<PendingInviteActions groupId={id} />`; render `<AcceptAcknowledgment groupId={id} isAccepted={group.my_status === "accepted"} />` near the top of the page (server-computed `isAccepted` passed down, not re-derived client-side).
- `src/app/dashboard/groups/[id]/PendingInviteActions.tsx` (new, `"use client"`) — wraps the accept/decline forms; accept form's `onSubmit` sets the `sessionStorage` flag before the native POST; decline form unchanged/no handler.
- `src/app/dashboard/groups/[id]/AcceptAcknowledgment.tsx` (new, `"use client"`) — reads + clears the `sessionStorage` flag on mount, gated by the `isAccepted` prop; renders the checkmark acknowledgment or nothing.
- `src/components/ui/AnonymityBadge.tsx` (Story 2.4) — visual-language reference: `coral-wash`/`coral-deep` + checkmark icon is the established "reconfirmation" pattern; this story reuses the *pattern*, not the component itself (semantically wrong — AnonymityBadge's copy is anonymity-specific).
- `src/app/invitacion/[token]/page.tsx`, `src/app/actions/auth.ts`'s `acceptInviteSignUp` — read-only references confirming this is the org-member signup flow, not report groups; confirmed via `supabase/migrations/0003_member_invites.sql`'s function comments. Not modified.
- `_bmad-output/planning-artifacts/ux-designs/ux-brujula-gui-2026-09-11/EXPERIENCE.md` lines 30, 64, 94 — source of the checkmark-acknowledgment/asymmetric-treatment requirement, and of the route-name mismatch this spec resolves.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/actions/reportGroups.ts` -- revert to the exact Story 1.6 form, no query param, no other changes
- [x] `src/app/dashboard/groups/[id]/PendingInviteActions.tsx` (new) -- Client Component wrapping accept/decline forms, `onSubmit` sets the `sessionStorage` flag on accept only
- [x] `src/app/dashboard/groups/[id]/AcceptAcknowledgment.tsx` (new) -- Client Component reading/clearing the flag, gated by `isAccepted`, rendering the checkmark acknowledgment
- [x] `src/app/dashboard/groups/[id]/page.tsx` -- wire in both new components, remove the reverted `searchParams.accepted` reading
- [x] Verify: `npm run test` -- all 58 tests pass, **including Story 1.1's frozen characterization suite unmodified** (this is the acceptance bar this correction exists to satisfy); accept flow shows the acknowledgment, decline flow doesn't; `npm run build`/`lint`/`tsc` clean

**Acceptance Criteria:**
- Given the report-group pending-invite flow, when the user accepts, then a one-time checkmark-style acknowledgment appears, respecting `prefers-reduced-motion`.
- Given the same flow, when the user declines, then a plain confirmation appears with no celebration — the two outcomes are visually asymmetric by design.

## Implementation Notes

- `AcceptAcknowledgment.tsx` reads the `sessionStorage` flag via `useSyncExternalStore` (with a no-op `subscribe` and `getServerSnapshot() => false`) rather than a `useEffect` + `useState` pair. A first pass used the latter and tripped `eslint-config-next`'s `react-hooks/set-state-in-effect` rule (errors on calling `setState` directly in an effect body). `useSyncExternalStore` is the React-sanctioned way to read a client-only external store without a hydration mismatch and without a manual `setState` call; clearing the flag afterward is a separate `useEffect` that only calls `sessionStorage.removeItem` (no `setState`), so it doesn't trip the same rule. Behavior is unchanged from what this spec describes: the acknowledgment still shows exactly once and the flag is still cleared on first read.

## Spec Change Log

- **Triggering finding:** the first implementation pass added `?accepted=true` to `respondToReportGroup`'s success redirect on accept. Running `npm run test` (not just build/lint/tsc, which the implementation subagent's environment couldn't do — no local Supabase CLI access there) surfaced 3 failures in `tests/characterization/report-groups.test.ts`, Story 1.1's frozen baseline: `expect(url).toBe(\`/dashboard/groups/${groupA}\`)` (no query param) failed on the accept path, and the failure cascaded — the test's own accept-x5 loop aborted after the first failing assertion, leaving 4 of 5 members still `pending`, which then made the close-threshold test fail for real (only 1 accepted, below 5).
- **What was amended:** the entire mechanism, from a Server Action redirect-URL query param to a client-side `sessionStorage` signal (see revised Approach/Boundaries/Code Map/Tasks above). `respondToReportGroup` is now explicitly untouched.
- **Known-bad state avoided:** any mechanism that changes `respondToReportGroup`'s observable redirect behavior (URL, timing, or otherwise) — Story 1.1's frozen suite is the regression-safety net for the entire report-groups migration and asserts this exact string for all three response paths (accept/decline/close).
- **KEEP:** the visual design of the acknowledgment itself (coral-deep checkmark icon + confirmation text, `motion-safe:`-gated entrance, matching `AnonymityBadge`'s established "reconfirmation" visual language) is unchanged and should carry over — only the *signaling mechanism* was wrong, not the acknowledgment's actual appearance or asymmetric-treatment goal. The investigation resolving `/invitacion/[token]` vs. `/dashboard/groups/[id]` (this spec's original Intent section) also stands unchanged.

## Review Triage Log

*(This is the review of the corrected, second implementation pass — the first pass's regression against Story 1.1's frozen baseline is recorded above in Spec Change Log, not here.)*

- **`AcceptAcknowledgment`'s confirmation box has no `role="status"`/`aria-live`, so a screen-reader user isn't notified when it dynamically appears post-navigation** — Blind Hunter finding. Verdict: **medium**, real, and undercuts this story's own framing of this as "the product's single most trust-critical moment." Routes to **patch**: add `role="status"`.
- **`JUST_ACCEPTED_KEY_PREFIX` is independently re-declared in both `PendingInviteActions.tsx` and `AcceptAcknowledgment.tsx`, nothing keeps them in sync** — Blind Hunter finding. Verdict: **low**, real, trivial. Routes to **patch**: share one constant.
- **The flag-clearing `useEffect` only checks `hasFlag`, not `isAccepted` (unlike the sibling `show` calculation), so a failed-accept's flag is consumed on the very next render instead of persisting as the spec's own I/O matrix describes** — Edge Case Hunter finding, Blind Hunter finding (independently, same claim). Verdict: **low-medium**, real — confirmed reachable (the documented "accept fails" scenario), though not currently end-user-visible (a retry re-writes the flag fresh regardless). Worth fixing for consistency between the two guards and to make the code match its own documented behavior. Routes to **patch**: add the `isAccepted` check to the clearing effect too.
- **Comments describe "native form POST" navigation, but React 19/Next.js 16 Server Action form submissions are a single-roundtrip fetch, not a literal browser POST/full-page unload** — Blind Hunter finding. Verdict: **low**, real wording imprecision (the underlying timing guarantee — `onSubmit` fires before the action dispatches — was independently verified correct against `react-dom`'s actual source). Routes to **patch**: reword the comment.
- **No automated test coverage for the new sessionStorage/hook mechanism** — Blind Hunter finding. Verdict: **false/consistent-with-precedent**. Same manual-verification-only pattern already established for every prior Epic 2 UI story; no component-test harness (RTL/jsdom) exists anywhere in this repo, and adding one is a disproportionate new-dependency decision for this one component.
- **The sessionStorage key is scoped only by `groupId`, not by which member accepted — a flag left dangling by an interrupted attempt could theoretically produce a false acknowledgment for a different, already-accepted member sharing the same browser tab/session** — Blind Hunter finding. Verdict: **low**. Rejected: requires an unusual shared-browser-session scenario for an internal, authenticated B2B tool (not a public consumer product), and a proper fix (scoping the key by member identity) needs extra client-side plumbing beyond a trivial fix.
- **No progressive-enhancement (no-JS) story — without JavaScript, `onSubmit` never fires, so the acknowledgment silently never appears even though the accept itself still succeeds** — Blind Hunter finding. Verdict: **false/accepted-tradeoff**. This story's own frozen Intent explicitly designs the acknowledgment as "decorative, never load-bearing" specifically because touching the Server Action's redirect (the only server-side alternative) is what caused the original regression against Story 1.1's frozen baseline — a JS-dependent decorative enhancement is the deliberate, necessary tradeoff, not an oversight.
- **`getSnapshot` passed to `useSyncExternalStore` is a fresh inline closure every render rather than memoized** — Blind Hunter finding, explicitly self-qualified as only a hypothetical future concern. Verdict: **false/negligible**. The snapshot read is trivially cheap today; `useSyncExternalStore` doesn't require a memoized snapshot function, only a consistent return value for unchanged state, which this satisfies.
- **Review Triage Log was empty despite `status: in-review`** — Blind Hunter finding. Verdict: **false/moot**. Mid-review snapshot state, resolved by this same update.

## Verification

**Commands:**
- `npm run build` -- succeeds, same route list
- `npm run lint` -- no new violations
- `npx tsc --noEmit` -- no new errors
- Manual: exercise both accept and decline against a seeded pending invite, confirm the asymmetry
