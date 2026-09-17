// Story 3.9 (_bmad-output/implementation-artifacts/
// spec-3-9-cycles-route-handlers-client-fetch-integration.md):
// GET /api/cycles/[cycleId]/status -> cyclesManager.getStatus.

import "server-only";
import { getStatus } from "@/server/managers/cyclesManager";
import { isValidUuid, jsonError, requireAuthorizedRequest } from "../../../_shared";

const invalidId = () =>
  jsonError(422, "validation_error", "El identificador del ciclo no es válido.");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ cycleId: string }> }
): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  const { cycleId } = await params;
  if (!isValidUuid(cycleId)) {
    return invalidId();
  }

  try {
    const result = await getStatus(cycleId);
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error(
      "[cycles] GET /api/cycles/[cycleId]/status unexpected non-Error throw:",
      error
    );
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
