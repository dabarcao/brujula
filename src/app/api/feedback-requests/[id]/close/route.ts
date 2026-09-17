// Story 3.15 (_bmad-output/implementation-artifacts/
// spec-3-15-feedback-route-handlers-client-fetch-integration.md):
// POST /api/feedback-requests/[id]/close -> feedbackManager.closeRequest.
// Takes no request body -- closeRequest(requestId) has one path param only.

import "server-only";
import { closeRequest } from "@/server/managers/feedbackManager";
import { isValidUuid, jsonError, requireAuthorizedRequest } from "../../../_shared";

const invalidId = () =>
  jsonError(422, "validation_error", "El identificador de la solicitud no es válido.");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!isValidUuid(id)) {
    return invalidId();
  }

  try {
    // closeRequest returns void -- unwrapped success body is `null`.
    await closeRequest(id);
    return Response.json(null, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error(
      "[feedback-requests] POST /api/feedback-requests/[id]/close unexpected non-Error throw:",
      error
    );
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
