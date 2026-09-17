// Story 3.15 (_bmad-output/implementation-artifacts/
// spec-3-15-feedback-route-handlers-client-fetch-integration.md):
// PATCH /api/feedback-requests/[id]/evaluators -> feedbackManager.updateRequestEvaluators.

import "server-only";
import { updateRequestEvaluators } from "@/server/managers/feedbackManager";
import { isValidUuid, jsonError, requireAuthorizedRequest } from "../../../_shared";

const invalidBody = () =>
  jsonError(422, "validation_error", "Se requiere 'inviteeMemberIds' (string[]).");
const invalidId = () =>
  jsonError(422, "validation_error", "El identificador de la solicitud no es válido.");

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return invalidBody();
  }
  if (typeof rawBody !== "object" || rawBody === null) {
    return invalidBody();
  }

  const { inviteeMemberIds } = rawBody as { inviteeMemberIds?: unknown };
  if (
    !Array.isArray(inviteeMemberIds) ||
    !inviteeMemberIds.every((id) => typeof id === "string" && isValidUuid(id))
  ) {
    return invalidBody();
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return invalidId();
  }

  try {
    // updateRequestEvaluators returns void -- unwrapped success body is `null`.
    await updateRequestEvaluators(id, inviteeMemberIds);
    return Response.json(null, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error(
      "[feedback-requests] PATCH /api/feedback-requests/[id]/evaluators unexpected non-Error throw:",
      error
    );
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
