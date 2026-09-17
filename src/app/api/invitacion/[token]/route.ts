// Story 3.21 (_bmad-output/implementation-artifacts/
// spec-3-21-responder-invitation-route-handlers-client-fetch-integration.md):
// GET /api/invitacion/[token] -> responderManager.getInviteDetails.
//
// Same domain, same structural deviation as src/app/api/responder/[token]/
// route.ts (AD-7/FR4): no requireAuthorizedRequest()/requireApiToken() call
// -- the invitation token itself, passed as this path param, is this
// domain's sole credential. A bogus/nonexistent token is a normal `[]`
// result, not an error -- returned directly as the 200 body, same
// treatment the page component (src/app/invitacion/[token]/page.tsx,
// unmodified by this story) already gives it.

import "server-only";
import { getInviteDetails } from "@/server/managers/responderManager";
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
    const result = await getInviteDetails(token);
    return Response.json(result, { status: 200 });
  } catch (error) {
    // getInviteDetails (src/server/db/responder.ts) never throws for a
    // bogus/nonexistent token -- that's the `[]` result above, not this
    // catch. Reaching here is a genuine RPC-call failure, not a user-input
    // validation problem, so this maps to 500 rather than this codebase's
    // usual 422 validation_error.
    console.error("[invitacion] GET /api/invitacion/[token] unexpected error:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
