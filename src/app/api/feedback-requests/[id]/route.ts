// Story 3.15 (_bmad-output/implementation-artifacts/
// spec-3-15-feedback-route-handlers-client-fetch-integration.md):
// GET /api/feedback-requests/[id] -> feedbackManager.getCompetencyNarrative.

import "server-only";
import { getCompetencyNarrative } from "@/server/managers/feedbackManager";
import { isValidUuid, jsonError, requireAuthorizedRequest } from "../../_shared";

const invalidId = () =>
  jsonError(422, "validation_error", "El identificador de la solicitud no es válido.");

export async function GET(
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
    const result = await getCompetencyNarrative(id);
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error(
      "[feedback-requests] GET /api/feedback-requests/[id] unexpected non-Error throw:",
      error
    );
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
