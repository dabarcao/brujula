// Story 3.3 (_bmad-output/implementation-artifacts/
// spec-3-3-admin-members-route-handlers-client-fetch-integration.md):
// GET /api/members?orgId=... -> membersManager.listMembers.

import "server-only";
import { listMembers } from "@/server/managers/membersManager";
import { isValidUuid, jsonError, requireAuthorizedRequest } from "../_shared";

export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  const orgId = new URL(request.url).searchParams.get("orgId");
  if (!orgId) {
    return jsonError(422, "validation_error", "Se requiere el parámetro de consulta 'orgId'.");
  }
  if (!isValidUuid(orgId)) {
    return jsonError(422, "validation_error", "El parámetro 'orgId' no es un identificador válido.");
  }

  try {
    const result = await listMembers(orgId);
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error("[members] GET /api/members unexpected non-Error throw:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
