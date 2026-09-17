// Story 3.3 (_bmad-output/implementation-artifacts/
// spec-3-3-admin-members-route-handlers-client-fetch-integration.md):
// PATCH /api/admin/organizations/[id] -> adminManager.renameOrganization.

import "server-only";
import { renameOrganization } from "@/server/managers/adminManager";
import { isValidUuid, jsonError, requireAuthorizedRequest } from "../../../_shared";

const invalidBody = () => jsonError(422, "validation_error", "Se requiere 'newName' (string).");
const invalidId = () =>
  jsonError(422, "validation_error", "El identificador de la empresa no es válido.");

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

  const { newName } = rawBody as { newName?: unknown };
  if (typeof newName !== "string") {
    return invalidBody();
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return invalidId();
  }

  try {
    // renameOrganization returns void -- unwrapped success body is `null`.
    await renameOrganization(id, newName);
    return Response.json(null, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error(
      "[admin] PATCH /api/admin/organizations/[id] unexpected non-Error throw:",
      error
    );
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
