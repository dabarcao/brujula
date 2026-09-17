// Story 1.5 (_bmad-output/implementation-artifacts/
// spec-1-5-report-groups-route-handler-and-client-fetch-wrapper.md):
// POST /api/report-groups -> reportGroupsManager.createGroup. Calls only
// reportGroupsManager (never @/server/db/* or @/lib/supabase/* directly),
// per Story 1.3's import-boundary lint rule.
//
// Story 3.27 (_bmad-output/implementation-artifacts/
// spec-3-27-read-only-reports-route-handlers-client-fetch-integration.md):
// GET /api/report-groups -> reportGroupsManager.getMyReportGroups. Takes no
// request parameters -- getMyReportGroups() has none.

import "server-only";
import { createGroup, getMyReportGroups } from "@/server/managers/reportGroupsManager";
import { jsonError, requireAuthorizedRequest } from "./_shared";

const invalidBody = () =>
  jsonError(422, "validation_error", "Se requieren 'name' (string) y 'memberIds' (string[]).");

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

  const { name, memberIds } = rawBody as { name?: unknown; memberIds?: unknown };
  if (
    typeof name !== "string" ||
    !Array.isArray(memberIds) ||
    !memberIds.every((id) => typeof id === "string")
  ) {
    return invalidBody();
  }

  try {
    const result = await createGroup(name, memberIds);
    return Response.json(result, { status: 201 });
  } catch (error) {
    // Manager-thrown business-rule rejections (Story 1.2) map uniformly to
    // 422 with the error's own message, per this story's Intent -- not
    // finer-grained per message content.
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error("[report-groups] POST /api/report-groups unexpected non-Error throw:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await getMyReportGroups();
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error("[report-groups] GET /api/report-groups unexpected non-Error throw:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
