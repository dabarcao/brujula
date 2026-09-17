"use client";

import { respondToReportGroup } from "@/app/actions/reportGroups";
import ButtonPrimary from "@/components/ui/ButtonPrimary";
import ButtonSecondary from "@/components/ui/ButtonSecondary";

// spec-2-7-invitacion-accept-decline-redesign.md (revised approach, see its
// Spec Change Log): the acknowledgment can no longer be signaled through
// `respondToReportGroup`'s redirect URL -- Story 1.1's frozen
// characterization suite asserts that redirect stays exactly
// `/dashboard/groups/${groupId}`, no query param, for every response path.
// So the accept form's `onSubmit` sets a `sessionStorage` flag itself,
// synchronously, before the action's request is dispatched -- no change to
// the Server Action at all. The decline form gets no handler: genuinely
// plain, no signal written anywhere.
//
// Exported so AcceptAcknowledgment.tsx (the reader/clearer) imports the
// same constant instead of independently declaring it -- keeps the two
// files' key in sync by construction.
export const JUST_ACCEPTED_KEY_PREFIX = "brujula:justAcceptedGroup:";

export default function PendingInviteActions({ groupId }: { groupId: string }) {
  function handleAcceptSubmit() {
    try {
      sessionStorage.setItem(JUST_ACCEPTED_KEY_PREFIX + groupId, "1");
    } catch {
      // sessionStorage unavailable (e.g. privacy mode) -- decorative flag
      // only, never blocks the actual accept submission below.
    }
  }

  return (
    <div className="flex gap-3">
      <form action={respondToReportGroup} onSubmit={handleAcceptSubmit}>
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="accept" value="true" />
        <ButtonPrimary type="submit">Confirmar</ButtonPrimary>
      </form>
      <form action={respondToReportGroup}>
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="accept" value="false" />
        <ButtonSecondary type="submit">Rechazar</ButtonSecondary>
      </form>
    </div>
  );
}
