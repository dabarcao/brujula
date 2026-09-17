// Story 3.3 (_bmad-output/implementation-artifacts/
// spec-3-3-admin-members-route-handlers-client-fetch-integration.md):
// GET /api/admin/status -> adminManager.checkIsPlatformAdmin. Calls only
// adminManager (never @/server/db/* or Supabase directly), same shape as
// Story 1.5's report-groups routes.

import "server-only";
import { checkIsPlatformAdmin } from "@/server/managers/adminManager";
import { jsonError, requireAuthorizedRequest } from "../../_shared";

export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await checkIsPlatformAdmin();
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error("[admin] GET /api/admin/status unexpected non-Error throw:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
