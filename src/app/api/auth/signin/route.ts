// Story 3.3 (_bmad-output/implementation-artifacts/
// spec-3-3-admin-members-route-handlers-client-fetch-integration.md):
// POST /api/auth/signin -> authManager.signIn. Structurally different auth
// model from every other route in this story: no requireApiToken() call
// (no app token exists yet -- this route is what issues one), but the
// anti-CSRF header is still required, checked manually here (same
// CSRF_HEADER constant, same 403 envelope shape as requireAuthorizedRequest's
// own rejection) to guard this state-changing request. On success, sets the
// brujula_app_token cookie itself, mirroring src/app/actions/auth.ts's
// existing signIn cookie-set code exactly.

import "server-only";
import { cookies } from "next/headers";
import { signIn } from "@/server/managers/authManager";
import { APP_TOKEN_COOKIE, APP_TOKEN_TTL_SECONDS, CSRF_HEADER } from "@/server/shared/auth";
import { jsonError } from "../../_shared";

const invalidBody = () =>
  jsonError(422, "validation_error", "Se requieren 'email' y 'password' (string).");

export async function POST(request: Request): Promise<Response> {
  // No requireApiToken() here -- see file header. CSRF-header gating still
  // applies to this state-changing request, checked manually with the same
  // constant/shape requireAuthorizedRequest's own 403 branch uses.
  if (!request.headers.get(CSRF_HEADER)) {
    return jsonError(403, "forbidden", "Prohibido: falta la cabecera anti-CSRF requerida.");
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

  const { email, password } = rawBody as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || typeof password !== "string") {
    return invalidBody();
  }

  try {
    // Mirrors src/app/actions/auth.ts:81's existing signIn Server Action,
    // which trims email before calling supabase.auth.signInWithPassword.
    const { appToken } = await signIn(email.trim(), password);

    // Mirrors src/app/actions/auth.ts:98-105's existing cookie-set code
    // exactly.
    const cookieStore = await cookies();
    cookieStore.set(APP_TOKEN_COOKIE, appToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: APP_TOKEN_TTL_SECONDS,
    });

    // Return the manager's result verbatim, matching every other route's
    // convention, in addition to setting the cookie.
    return Response.json({ appToken }, { status: 200 });
  } catch (error) {
    // Invalid credentials -> Supabase Auth's own exact error message,
    // thrown-not-swallowed, mapped to the same 422 bucket as any other
    // manager rejection.
    if (error instanceof Error) {
      return jsonError(422, "validation_error", error.message);
    }
    console.error("[auth] POST /api/auth/signin unexpected non-Error throw:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
}
