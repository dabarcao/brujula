// Story 3.21 (_bmad-output/implementation-artifacts/
// spec-3-21-responder-invitation-route-handlers-client-fetch-integration.md):
// POST /api/responder/[token]/submit -> responderManager.submitResponse.
//
// The one mutating route in this domain, and structurally different from
// every other domain's mutating routes: no requireAuthorizedRequest()/
// requireApiToken() call, and no `x-brujula-csrf` header required. The
// single-use invitation token passed as the path param is this domain's
// sole credential -- an attacker who doesn't already know the token's value
// cannot construct a matching malicious request, the same reasoning that
// makes a password-reset/magic-link URL inherently CSRF-resistant (see this
// story's frozen Intent for the full investigated rationale).

import "server-only";
import { submitResponse, type FeedbackAnswerInput } from "@/server/managers/responderManager";
import { isValidUuid, jsonError } from "../../../_shared";

const invalidBody = () =>
  jsonError(
    422,
    "validation_error",
    "Se requiere 'answers' (array), cada elemento con 'questionId' (string)."
  );

function isValidAnswer(value: unknown): value is FeedbackAnswerInput {
  if (typeof value !== "object" || value === null) return false;
  const a = value as Record<string, unknown>;
  if (typeof a.questionId !== "string" || !isValidUuid(a.questionId)) return false;
  if (a.answerText !== undefined && typeof a.answerText !== "string") return false;
  if (a.answerValue !== undefined && a.answerValue !== null && typeof a.answerValue !== "number") {
    return false;
  }
  if (a.competencyCode !== undefined && typeof a.competencyCode !== "string") return false;
  return true;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await params;
  if (!isValidUuid(token)) {
    return jsonError(422, "validation_error", "El token de invitación no es válido.");
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return invalidBody();
  }
  if (typeof rawBody !== "object" || rawBody === null) {
    return invalidBody();
  }

  const { answers } = rawBody as { answers?: unknown };
  if (!Array.isArray(answers) || answers.length > 50 || !answers.every(isValidAnswer)) {
    return invalidBody();
  }

  try {
    const result = await submitResponse(token, answers);
    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error(
      "[responder] POST /api/responder/[token]/submit unexpected non-Error throw:",
      error
    );
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
