// Story 3.3 (_bmad-output/implementation-artifacts/
// spec-3-3-admin-members-route-handlers-client-fetch-integration.md):
// POST /api/members/invite -> membersManager.inviteNewMember.

import "server-only";
import { inviteNewMember } from "@/server/managers/membersManager";
import { jsonError, requireAuthorizedRequest } from "../../_shared";

const invalidBody = () =>
  jsonError(
    422,
    "validation_error",
    "Se requieren 'email', 'fullName' y 'departmentId' (string)."
  );

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

  const { email, fullName, departmentId } = rawBody as {
    email?: unknown;
    fullName?: unknown;
    departmentId?: unknown;
  };
  if (
    typeof email !== "string" ||
    typeof fullName !== "string" ||
    typeof departmentId !== "string"
  ) {
    return invalidBody();
  }

  try {
    const result = await inviteNewMember(email, fullName, departmentId);
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error("[members] POST /api/members/invite unexpected non-Error throw:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
