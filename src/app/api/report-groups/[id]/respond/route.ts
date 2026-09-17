// Story 1.5 (_bmad-output/implementation-artifacts/
// spec-1-5-report-groups-route-handler-and-client-fetch-wrapper.md):
// POST /api/report-groups/[id]/respond -> reportGroupsManager.respondToGroup.

import "server-only";
import { respondToGroup } from "@/server/managers/reportGroupsManager";
import { jsonError, requireAuthorizedRequest } from "../../_shared";

const invalidBody = () => jsonError(422, "validation_error", "Se requiere 'accept' (boolean).");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
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

  const { accept } = rawBody as { accept?: unknown };
  if (typeof accept !== "boolean") {
    return invalidBody();
  }

  try {
    const { id } = await params;
    // respondToGroup returns void -- unwrapped success body is `null`.
    await respondToGroup(id, accept);
    return Response.json(null, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error(
      "[report-groups] POST /api/report-groups/[id]/respond unexpected non-Error throw:",
      error
    );
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
