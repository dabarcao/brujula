// Story 1.5 (_bmad-output/implementation-artifacts/
// spec-1-5-report-groups-route-handler-and-client-fetch-wrapper.md): small
// helper shared by every route.ts under src/app/api/report-groups/**.
// Next.js's `_`-prefix convention excludes this file from routing (see
// node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md).
//
// Scoped to this one route group for now, not a cross-domain shared module
// yet -- Epic 3 generalizes on first real reuse, per this initiative's
// established extract-on-reuse pattern.

import "server-only";
import { requireApiToken } from "@/server/shared/auth";

/**
 * Builds a `{ error: { code, message } }` envelope Response, per AD-5's
 * shared error-envelope shape (epic-1-context.md, Technical Decisions).
 */
export function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * Gates `request` through requireApiToken() (Story 1.4). Returns the 401/403
 * envelope Response to return immediately when the request is not
 * authorized; returns null when the caller should proceed to invoke
 * reportGroupsManager. The manager must never be invoked when this returns
 * non-null.
 */
export function requireAuthorizedRequest(request: Request): Response | null {
  let result: ReturnType<typeof requireApiToken>;
  try {
    result = requireApiToken(request);
  } catch (error) {
    // e.g. a missing APP_TOKEN_SECRET (requireApiToken's one deliberate
    // fail-loud, non-per-request throw) -- must still surface as this
    // story's envelope, never an unhandled exception escaping the route.
    console.error("[report-groups] requireApiToken threw unexpectedly:", error);
    return jsonError(500, "internal_error", "Error inesperado.");
  }
  if (result.ok) return null;

  console.warn(
    `[report-groups] requireApiToken rejected: status=${result.status} reason=${result.reason}`
  );

  if (result.status === 401) {
    return jsonError(401, "unauthorized", "No autorizado: falta un token de aplicación válido.");
  }
  return jsonError(403, "forbidden", "Prohibido: falta la cabecera anti-CSRF requerida.");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guards a route param/query value that is passed straight to a Postgres
 * `uuid`-typed RPC argument. Without this, a malformed value reaches
 * Postgres and its raw "invalid input syntax for type uuid: ..." error
 * message leaks to the client instead of this story's friendly
 * `validation_error` convention -- a well-formed-but-nonexistent id is left
 * to the RPC itself (e.g. "Empresa no encontrada."), only the format is
 * checked here.
 */
export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}
