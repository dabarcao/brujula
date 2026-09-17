// Story 3.15 (_bmad-output/implementation-artifacts/
// spec-3-15-feedback-route-handlers-client-fetch-integration.md):
// GET /api/feedback-requests/pending-invitations -> feedbackManager.getMyPendingInvitations.
// Takes no request parameters -- getMyPendingInvitations() has none.

import "server-only";
import { getMyPendingInvitations } from "@/server/managers/feedbackManager";
import { jsonError, requireAuthorizedRequest } from "../../_shared";

export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await getMyPendingInvitations();
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error(
      "[feedback-requests] GET /api/feedback-requests/pending-invitations unexpected non-Error throw:",
      error
    );
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
