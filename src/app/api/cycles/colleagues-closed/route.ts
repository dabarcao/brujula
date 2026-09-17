// Story 3.9 (_bmad-output/implementation-artifacts/
// spec-3-9-cycles-route-handlers-client-fetch-integration.md):
// GET /api/cycles/colleagues-closed -> cyclesManager.getColleaguesWithClosedCycle.
// Takes no request parameters -- getColleaguesWithClosedCycle() has none.

import "server-only";
import { getColleaguesWithClosedCycle } from "@/server/managers/cyclesManager";
import { jsonError, requireAuthorizedRequest } from "../../_shared";

export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await getColleaguesWithClosedCycle();
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error(
      "[cycles] GET /api/cycles/colleagues-closed unexpected non-Error throw:",
      error
    );
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
