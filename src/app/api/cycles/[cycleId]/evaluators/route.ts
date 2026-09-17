// Story 3.9 (_bmad-output/implementation-artifacts/
// spec-3-9-cycles-route-handlers-client-fetch-integration.md):
// POST /api/cycles/[cycleId]/evaluators -> cyclesManager.organizeEvaluators.

import "server-only";
import { organizeEvaluators } from "@/server/managers/cyclesManager";
import { isValidUuid, jsonError, requireAuthorizedRequest } from "../../../_shared";

const invalidBody = () =>
  jsonError(
    422,
    "validation_error",
    "Se requieren 'evaluatorMemberIds' (string[]) y 'evaluatorCategories' (string[])."
  );
const invalidId = () =>
  jsonError(422, "validation_error", "El identificador del ciclo no es válido.");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ cycleId: string }> }
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

  const { evaluatorMemberIds, evaluatorCategories } = rawBody as {
    evaluatorMemberIds?: unknown;
    evaluatorCategories?: unknown;
  };
  if (
    !Array.isArray(evaluatorMemberIds) ||
    !evaluatorMemberIds.every((id) => typeof id === "string" && isValidUuid(id)) ||
    !Array.isArray(evaluatorCategories) ||
    !evaluatorCategories.every((c) => typeof c === "string")
  ) {
    return invalidBody();
  }

  const { cycleId } = await params;
  if (!isValidUuid(cycleId)) {
    return invalidId();
  }

  try {
    const result = await organizeEvaluators(
      cycleId,
      evaluatorMemberIds,
      evaluatorCategories as Parameters<typeof organizeEvaluators>[2]
    );
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error(
      "[cycles] POST /api/cycles/[cycleId]/evaluators unexpected non-Error throw:",
      error
    );
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
