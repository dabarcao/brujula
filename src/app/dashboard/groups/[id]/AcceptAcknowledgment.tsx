"use client";

import { useEffect, useSyncExternalStore } from "react";
import { JUST_ACCEPTED_KEY_PREFIX } from "./PendingInviteActions";

// spec-2-7-invitacion-accept-decline-redesign.md (revised approach): the
// one-time checkmark acknowledgment is signaled entirely client-side via a
// `sessionStorage` flag `PendingInviteActions.tsx` sets right before the
// action's request is dispatched -- `respondToReportGroup` itself is
// untouched (Story 1.1's frozen characterization suite pins its redirect
// to the unparameterized URL for every response path).
//
// Shown only when BOTH the flag is present AND the server-computed
// `isAccepted` prop is true -- the flag alone is never trusted (a dangling
// flag from a failed/abandoned accept attempt must not show a false
// acknowledgment while `my_status` is still "pending"). Read+clear happens
// on mount so it never reappears on refresh. Visual language (coral-wash/
// coral-deep + checkmark, `motion-safe:`-gated entrance) reuses the pattern
// `AnonymityBadge`'s `emphasized` state established (Story 2.4), not the
// component itself -- its copy is anonymity-specific.

// No real external event to subscribe to -- the flag is written once
// (by PendingInviteActions, before the page navigation that mounts this
// component) and never changes again during this component's lifetime.
// A no-op unsubscribe satisfies useSyncExternalStore's contract without
// manufacturing a fake event source.
function subscribe() {
  return () => {};
}

// SSR/first-hydration-pass snapshot: sessionStorage doesn't exist on the
// server, so this is never true there -- useSyncExternalStore defers to
// the real client snapshot automatically right after hydration, which is
// exactly the supported way to read a client-only store without a
// hydration mismatch (no manual `useEffect` + `setState` needed for the
// read itself, per react-hooks/set-state-in-effect).
function getServerSnapshot() {
  return false;
}

export default function AcceptAcknowledgment({
  groupId,
  isAccepted,
}: {
  groupId: string;
  isAccepted: boolean;
}) {
  const key = JUST_ACCEPTED_KEY_PREFIX + groupId;

  const hasFlag = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return sessionStorage.getItem(key) !== null;
      } catch {
        // sessionStorage unavailable (e.g. privacy mode) -- treat as
        // absent, decorative only.
        return false;
      }
    },
    getServerSnapshot
  );

  // Clearing the flag is a genuine one-time side effect on the external
  // store, not a React state update -- it never calls setState itself, so
  // it doesn't trigger react-hooks/set-state-in-effect. Guarded by the same
  // `hasFlag && isAccepted` condition as `show` below (not `hasFlag` alone):
  // a dangling flag from a failed/abandoned accept must survive until a
  // real accept succeeds, not get consumed by an unrelated render where
  // `my_status` is still "pending".
  useEffect(() => {
    if (!hasFlag || !isAccepted) return;
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore -- same decorative-only guarantee as the read above.
    }
  }, [hasFlag, isAccepted, key]);

  const show = hasFlag && isAccepted;

  if (!show) return null;

  return (
    <div
      role="status"
      className="mb-6 flex items-center gap-3 rounded-brujula-md bg-coral-wash p-4 text-coral-deep motion-safe:animate-[brujula-ack-in_0.4s_ease-out_both]"
    >
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
      >
        <polyline points="4 12 9 17 20 6" />
      </svg>
      <p className="text-sm font-medium">Confirmado — ya formas parte de este grupo.</p>
    </div>
  );
}
