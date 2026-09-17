// Story 3.9 (_bmad-output/implementation-artifacts/
// spec-3-9-cycles-route-handlers-client-fetch-integration.md):
// POST /api/cycles/requests/[requestId]/close -> cyclesManager.closeRequest.
// Takes no request body -- closeRequest(requestId) has one path param only.

import "server-only";
import { closeRequest } from "@/server/managers/cyclesManager";
import { isValidUuid, jsonError, requireAuthorizedRequest } from "../../../../_shared";

const invalidId = () =>
  jsonError(422, "validation_error", "El identificador de la solicitud no es válido.");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> }
): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  const { requestId } = await params;
  if (!isValidUuid(requestId)) {
    return invalidId();
  }

  try {
    // closeRequest returns void -- unwrapped success body is `null`.
    await closeRequest(requestId);
    return Response.json(null, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error(
      "[cycles] POST /api/cycles/requests/[requestId]/close unexpected non-Error throw:",
      error
    );
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
