// Story 3.9 (_bmad-output/implementation-artifacts/
// spec-3-9-cycles-route-handlers-client-fetch-integration.md):
// PATCH /api/cycles/requests/[requestId]/evaluators ->
// cyclesManager.updateRequestEvaluators.

import "server-only";
import { updateRequestEvaluators } from "@/server/managers/cyclesManager";
import { isValidUuid, jsonError, requireAuthorizedRequest } from "../../../../_shared";

const invalidBody = () =>
  jsonError(
    422,
    "validation_error",
    "Se requieren 'evaluatorMemberIds' (string[]) y 'evaluatorCategories' (string[])."
  );
const invalidId = () =>
  jsonError(422, "validation_error", "El identificador de la solicitud no es válido.");

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> }
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

  const { evaluatorMemberIds, evaluatorCategories } = rawBody as {
    evaluatorMemberIds?: unknown;
    evaluatorCategories?: unknown;
  };
  if (
    !Array.isArray(evaluatorMemberIds) ||
    !evaluatorMemberIds.every((id) => typeof id === "string" && isValidUuid(id)) ||
    !Array.isArray(evaluatorCategories) ||
    !evaluatorCategories.every((c) => typeof c === "string")
  ) {
    return invalidBody();
  }

  const { requestId } = await params;
  if (!isValidUuid(requestId)) {
    return invalidId();
  }

  try {
    // updateRequestEvaluators returns void -- unwrapped success body is `null`.
    await updateRequestEvaluators(
      requestId,
      evaluatorMemberIds,
      evaluatorCategories as Parameters<typeof updateRequestEvaluators>[2]
    );
    return Response.json(null, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error(
      "[cycles] PATCH /api/cycles/requests/[requestId]/evaluators unexpected non-Error throw:",
      error
    );
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
