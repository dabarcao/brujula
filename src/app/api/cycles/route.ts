// Story 3.9 (_bmad-output/implementation-artifacts/
// spec-3-9-cycles-route-handlers-client-fetch-integration.md):
// POST /api/cycles -> cyclesManager.createCycle.
//
// Story 3.27 (_bmad-output/implementation-artifacts/
// spec-3-27-read-only-reports-route-handlers-client-fetch-integration.md):
// GET /api/cycles -> cyclesManager.getMyOpenCycles. Takes no request
// parameters -- getMyOpenCycles() has none.

import "server-only";
import { createCycle, getMyOpenCycles } from "@/server/managers/cyclesManager";
import { isValidUuid, jsonError, requireAuthorizedRequest } from "../_shared";

const invalidBody = () =>
  jsonError(
    422,
    "validation_error",
    "Se requieren 'name', 'opensAt', 'closesAt' (string) y 'participantMemberIds' (string[])."
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

  const { name, opensAt, closesAt, participantMemberIds } = rawBody as {
    name?: unknown;
    opensAt?: unknown;
    closesAt?: unknown;
    participantMemberIds?: unknown;
  };
  if (
    typeof name !== "string" ||
    typeof opensAt !== "string" ||
    typeof closesAt !== "string" ||
    isNaN(Date.parse(opensAt)) ||
    isNaN(Date.parse(closesAt)) ||
    !Array.isArray(participantMemberIds) ||
    !participantMemberIds.every((id) => typeof id === "string" && isValidUuid(id))
  ) {
    return invalidBody();
  }

  try {
    const result = await createCycle(name, opensAt, closesAt, participantMemberIds);
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error("[cycles] POST /api/cycles unexpected non-Error throw:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await getMyOpenCycles();
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error("[cycles] GET /api/cycles unexpected non-Error throw:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
