// Story 3.3 (_bmad-output/implementation-artifacts/
// spec-3-3-admin-members-route-handlers-client-fetch-integration.md):
// POST /api/auth/signout -> authManager.signOut. Also CSRF-header-only (no
// requireApiToken() -- a caller with an expired/missing app token can still
// legitimately sign out of their Supabase session), checked manually here
// same as /api/auth/signin. Clears the brujula_app_token cookie after
// calling the manager, mirroring src/app/actions/auth.ts:117-118 exactly.

import "server-only";
import { cookies } from "next/headers";
import { signOut } from "@/server/managers/authManager";
import { APP_TOKEN_COOKIE, CSRF_HEADER } from "@/server/shared/auth";
import { jsonError } from "../../_shared";

export async function POST(request: Request): Promise<Response> {
  // No requireApiToken() here -- see file header. CSRF-header gating still
  // applies, same constant/shape as requireAuthorizedRequest's own 403
  // branch.
  if (!request.headers.get(CSRF_HEADER)) {
    return jsonError(403, "forbidden", "Prohibido: falta la cabecera anti-CSRF requerida.");
  }

  try {
    // signOut returns void and never throws (mirrors db/auth.ts's own
    // branch-free signOut) -- unwrapped success body is `null`.
    await signOut();

    const cookieStore = await cookies();
    cookieStore.delete(APP_TOKEN_COOKIE);

    return Response.json(null, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error("[auth] POST /api/auth/signout unexpected non-Error throw:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
