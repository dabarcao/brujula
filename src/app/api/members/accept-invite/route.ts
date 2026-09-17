// Story 3.3 (_bmad-output/implementation-artifacts/
// spec-3-3-admin-members-route-handlers-client-fetch-integration.md):
// POST /api/members/accept-invite -> membersManager.acceptInvite.

import "server-only";
import { acceptInvite } from "@/server/managers/membersManager";
import { jsonError, requireAuthorizedRequest } from "../../_shared";

const invalidBody = () => jsonError(422, "validation_error", "Se requiere 'token' (string).");

export async function POST(request: Request): Promise<Response> {
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

  const { token } = rawBody as { token?: unknown };
  if (typeof token !== "string") {
    return invalidBody();
  }

  try {
    const result = await acceptInvite(token);
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error(
      "[members] POST /api/members/accept-invite unexpected non-Error throw:",
      error
    );
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
