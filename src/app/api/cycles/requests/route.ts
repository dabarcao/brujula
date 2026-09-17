// Story 3.9 (_bmad-output/implementation-artifacts/
// spec-3-9-cycles-route-handlers-client-fetch-integration.md):
// POST /api/cycles/requests -> cyclesManager.createIndividualRequest.
//
// Story 3.27 (_bmad-output/implementation-artifacts/
// spec-3-27-read-only-reports-route-handlers-client-fetch-integration.md):
// GET /api/cycles/requests -> cyclesManager.getMyCycleRequests. Takes no
// request parameters -- getMyCycleRequests() has none.

import "server-only";
import { createIndividualRequest, getMyCycleRequests } from "@/server/managers/cyclesManager";
import { jsonError, requireAuthorizedRequest } from "../../_shared";

const invalidBody = () =>
  jsonError(
    422,
    "validation_error",
    "Se requieren 'evaluatorEmails' (string[]), 'evaluatorCategories' (string[]), " +
      "'closesAt' (string) y 'name' (string o null)."
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

  const { evaluatorEmails, evaluatorCategories, closesAt, name } = rawBody as {
    evaluatorEmails?: unknown;
    evaluatorCategories?: unknown;
    closesAt?: unknown;
    name?: unknown;
  };
  if (
    !Array.isArray(evaluatorEmails) ||
    !evaluatorEmails.every((e) => typeof e === "string") ||
    !Array.isArray(evaluatorCategories) ||
    !evaluatorCategories.every((c) => typeof c === "string") ||
    typeof closesAt !== "string" ||
    isNaN(Date.parse(closesAt)) ||
    (typeof name !== "string" && name !== null)
  ) {
    return invalidBody();
  }

  try {
    const result = await createIndividualRequest(
      evaluatorEmails,
      evaluatorCategories as Parameters<typeof createIndividualRequest>[1],
      closesAt,
      name
    );
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error("[cycles] POST /api/cycles/requests unexpected non-Error throw:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await getMyCycleRequests();
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error("[cycles] GET /api/cycles/requests unexpected non-Error throw:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
