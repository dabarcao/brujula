// Story 3.15 (_bmad-output/implementation-artifacts/
// spec-3-15-feedback-route-handlers-client-fetch-integration.md):
// POST /api/feedback-requests/individual -> feedbackManager.createIndividualRequest.

import "server-only";
import { createIndividualRequest, type FeedbackSubtype } from "@/server/managers/feedbackManager";
import { jsonError, requireAuthorizedRequest } from "../../_shared";

const FEEDBACK_SUBTYPES: readonly FeedbackSubtype[] = [
  "meeting",
  "collaboration",
  "leadership_initiative",
  "general",
  "competencias",
];

const invalidBody = () =>
  jsonError(
    422,
    "validation_error",
    "Se requiere 'inviteeEmails' (string[]). 'subtype' y 'name' son opcionales."
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

  const { inviteeEmails, subtype, name } = rawBody as {
    inviteeEmails?: unknown;
    subtype?: unknown;
    name?: unknown;
  };
  if (
    !Array.isArray(inviteeEmails) ||
    !inviteeEmails.every((e) => typeof e === "string") ||
    (subtype !== undefined && !FEEDBACK_SUBTYPES.includes(subtype as FeedbackSubtype)) ||
    (name !== undefined && typeof name !== "string" && name !== null)
  ) {
    return invalidBody();
  }

  try {
    const result = await createIndividualRequest(
      inviteeEmails,
      subtype === undefined ? undefined : (subtype as FeedbackSubtype),
      name === undefined ? undefined : (name as string | null)
    );
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error(
      "[feedback-requests] POST /api/feedback-requests/individual unexpected non-Error throw:",
      error
    );
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
