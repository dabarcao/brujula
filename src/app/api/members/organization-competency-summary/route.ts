// Story 3.27 (_bmad-output/implementation-artifacts/
// spec-3-27-read-only-reports-route-handlers-client-fetch-integration.md):
// GET /api/members/organization-competency-summary ->
// membersManager.getOrganizationCompetencySummary. Takes no request
// parameters -- getOrganizationCompetencySummary() has none. A sibling file
// rather than a `GET` added to members/route.ts: that bare path already has
// an unrelated `GET` (Story 3.3, ?orgId=... -> listMembers).

import "server-only";
import { getOrganizationCompetencySummary } from "@/server/managers/membersManager";
import { jsonError, requireAuthorizedRequest } from "../../_shared";

export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await getOrganizationCompetencySummary();
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error(
      "[members] GET /api/members/organization-competency-summary unexpected non-Error throw:",
      error
    );
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
