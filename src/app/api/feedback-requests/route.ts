// Story 3.15 (_bmad-output/implementation-artifacts/
// spec-3-15-feedback-route-handlers-client-fetch-integration.md):
// POST /api/feedback-requests -> feedbackManager.createRequest.
//
// Story 3.27 (_bmad-output/implementation-artifacts/
// spec-3-27-read-only-reports-route-handlers-client-fetch-integration.md):
// GET /api/feedback-requests -> feedbackManager.getMyAdHocRequests. Takes no
// request parameters -- getMyAdHocRequests() has none.

import "server-only";
import { createRequest, getMyAdHocRequests, type FeedbackSubtype } from "@/server/managers/feedbackManager";
import { isValidUuid, jsonError, requireAuthorizedRequest } from "../_shared";

// Matches create_ad_hoc_feedback_request's own check constraint on
// p_subtype (see src/server/db/feedback.ts's FeedbackSubtype comment).
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
    "Se requiere 'inviteeMemberIds' (string[]). 'subtype' y 'name' son opcionales."
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

  const { inviteeMemberIds, subtype, name } = rawBody as {
    inviteeMemberIds?: unknown;
    subtype?: unknown;
    name?: unknown;
  };
  if (
    !Array.isArray(inviteeMemberIds) ||
    !inviteeMemberIds.every((id) => typeof id === "string" && isValidUuid(id)) ||
    (subtype !== undefined && !FEEDBACK_SUBTYPES.includes(subtype as FeedbackSubtype)) ||
    (name !== undefined && typeof name !== "string" && name !== null)
  ) {
    return invalidBody();
  }

  try {
    const result = await createRequest(
      inviteeMemberIds,
      subtype === undefined ? undefined : (subtype as FeedbackSubtype),
      name === undefined ? undefined : (name as string | null)
    );
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error("[feedback-requests] POST /api/feedback-requests unexpected non-Error throw:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireAuthorizedRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await getMyAdHocRequests();
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error("[feedback-requests] GET /api/feedback-requests unexpected non-Error throw:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
