// Story 3.21 (_bmad-output/implementation-artifacts/
// spec-3-21-responder-invitation-route-handlers-client-fetch-integration.md):
// GET /api/responder/[token] -> responderManager.getContext.
//
// Structurally different from every other domain's routes (AD-7/FR4): this
// domain's sole credential is the single-use invitation token itself,
// passed explicitly as this path param -- requireAuthorizedRequest()/
// requireApiToken() is never called here. A bogus/foreign/already-used
// token is a normal `{valid: false}` result, not an error -- returned
// directly as the 200 body, same treatment the page component
// (src/app/responder/[token]/page.tsx, unmodified by this story) already
// gives it.

import "server-only";
import { getContext } from "@/server/managers/responderManager";
import { isValidUuid, jsonError } from "../../_shared";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await params;
  if (!isValidUuid(token)) {
    return jsonError(422, "validation_error", "El token de invitación no es válido.");
  }

  try {
    const result = await getContext(token);
    return Response.json(result, { status: 200 });
  } catch (error) {
    // getResponderContext (src/server/db/responder.ts) never throws for an
    // invalid/foreign/used token -- that's the `{valid: false}` result
    // above, not this catch. Reaching here is a genuine RPC-call failure,
    // not a user-input validation problem, so this maps to 500 rather than
    // this codebase's usual 422 validation_error.
    console.error("[responder] GET /api/responder/[token] unexpected error:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
