// Story 1.5 (_bmad-output/implementation-artifacts/
// spec-1-5-report-groups-route-handler-and-client-fetch-wrapper.md): thin
// same-origin `fetch` wrapper Client Components (and any other non-browser
// client) use to reach `src/app/api/**` Route Handlers over HTTP -- the
// Client-Component half of AD-4's "managers exposed two ways" split
// (ARCHITECTURE-SPINE.md). No report-groups Client Component exists yet
// (confirmed during this story's investigation); this is verified at the
// fetch-wrapper level via tests, not a live UI integration.
//
// Deliberately client-safe: this file (and everything it imports) must
// never pull in a `server-only`-marked module, since it ships to the
// browser. That is why CSRF_HEADER is a local literal below rather than
// imported from src/server/shared/auth.ts (Story 1.4), which opens with
// `import "server-only";` -- importing it here would break the client
// bundle. Keep the two values in sync by hand if either ever changes.

const CSRF_HEADER = "x-brujula-csrf";

// Mirrors src/server/shared/auth.ts's own MUTATING_METHODS set exactly
// (Story 1.4's requireApiToken gates the identical set) -- per this
// story's "Always" boundary.
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type ApiErrorEnvelope = { error?: { code?: unknown; message?: unknown } };

/**
 * Thrown by apiFetch() whenever the server responds with a non-2xx status.
 * Carries the failure envelope's `code`/`message` (falling back to a
 * generic code/message if the body isn't a well-formed envelope) plus the
 * HTTP `status`, so callers can `catch` and read `.code`/`.message`.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Same-origin fetch wrapper for `src/app/api/**`. Always sends
 * `credentials: "same-origin"` explicitly (the httpOnly app-token cookie
 * travels automatically with any same-origin request -- no client code
 * needed for that part) and auto-attaches the `x-brujula-csrf` header for
 * `POST`/`PUT`/`PATCH`/`DELETE` requests. On a non-2xx response, parses the
 * `{error:{code,message}}` envelope and throws a typed, catchable
 * `ApiError`.
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();

  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (MUTATING_METHODS.has(method)) {
    headers.set(CSRF_HEADER, "1");
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      method,
      headers,
      credentials: "same-origin",
    });
  } catch {
    // Network-level failure (offline/DNS/CORS/etc.) -- never let a raw
    // TypeError escape apiFetch; callers should only ever catch ApiError.
    throw new ApiError(0, "network_error", "No se pudo conectar con el servidor.");
  }

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(
      response.status,
      "invalid_response",
      "La respuesta del servidor no es JSON válido."
    );
  }

  if (!response.ok) {
    const envelope = data as ApiErrorEnvelope | null;
    const code = typeof envelope?.error?.code === "string" ? envelope.error.code : "unknown_error";
    const message =
      typeof envelope?.error?.message === "string"
        ? envelope.error.message
        : `La solicitud falló con estado ${response.status}.`;
    throw new ApiError(response.status, code, message);
  }

  return data as T;
}
