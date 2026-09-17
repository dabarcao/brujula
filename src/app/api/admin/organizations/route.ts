// Story 3.3 (_bmad-output/implementation-artifacts/
// spec-3-3-admin-members-route-handlers-client-fetch-integration.md):
// GET /api/admin/organizations -> adminManager.listAllOrganizations,
// POST /api/admin/organizations -> adminManager.createOrganization. Calls
// only adminManager (never @/server/db/* or Supabase directly), same shape
// as Story 1.5's report-groups routes.

import "server-only";
import { createOrganization, listAllOrganizations } from "@/server/managers/adminManager";
import { jsonError, requireAuthorizedRequest } from "../../_shared";

export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await listAllOrganizations();
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error("[admin] GET /api/admin/organizations unexpected non-Error throw:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}

const invalidBody = () =>
  jsonError(
    422,
    "validation_error",
    "Se requieren 'orgName', 'adminEmail' y 'adminFullName' (string)."
  );

export async function POST(request: Request): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    // Malformed JSON -- surface this story's friendly validation message,
    // never the raw SyntaxError text.
    return invalidBody();
  }
  if (typeof rawBody !== "object" || rawBody === null) {
    return invalidBody();
  }

  const { orgName, adminEmail, adminFullName } = rawBody as {
    orgName?: unknown;
    adminEmail?: unknown;
    adminFullName?: unknown;
  };
  if (
    typeof orgName !== "string" ||
    typeof adminEmail !== "string" ||
    typeof adminFullName !== "string"
  ) {
    return invalidBody();
  }

  try {
    const result = await createOrganization(orgName, adminEmail, adminFullName);
    return Response.json(result, { status: 201 });
  } catch (error) {
    // Manager-thrown business-rule rejections (e.g. non-platform-admin
    // caller) map uniformly to 422 with the error's own message, per this
    // story's Intent -- not finer-grained per message content.
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error("[admin] POST /api/admin/organizations unexpected non-Error throw:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
