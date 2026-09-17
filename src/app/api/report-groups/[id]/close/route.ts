// Story 1.5 (_bmad-output/implementation-artifacts/
// spec-1-5-report-groups-route-handler-and-client-fetch-wrapper.md):
// POST /api/report-groups/[id]/close -> reportGroupsManager.closeGroup.

import "server-only";
import { closeGroup } from "@/server/managers/reportGroupsManager";
import { jsonError, requireAuthorizedRequest } from "../../_shared";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await params;
    const result = await closeGroup(id);
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error(
      "[report-groups] POST /api/report-groups/[id]/close unexpected non-Error throw:",
      error
    );
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
