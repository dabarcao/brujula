// Story 3.3 (_bmad-output/implementation-artifacts/
// spec-3-3-admin-members-route-handlers-client-fetch-integration.md):
// POST /api/members/claim-pending -> membersManager.claimPendingInvitations.
// Takes no request body -- claimPendingInvitations() has no parameters.

import "server-only";
import { claimPendingInvitations } from "@/server/managers/membersManager";
import { jsonError, requireAuthorizedRequest } from "../../_shared";

export async function POST(request: Request): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  try {
    // claimPendingInvitations returns void -- unwrapped success body is `null`.
    await claimPendingInvitations();
    return Response.json(null, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error(
      "[members] POST /api/members/claim-pending unexpected non-Error throw:",
      error
    );
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
