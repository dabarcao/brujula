// Story 1.4 (_bmad-output/implementation-artifacts/
// spec-1-4-app-token-issuance-and-validation.md): first-party app-token
// auth mechanism, issued alongside (never replacing) the Supabase session
// cookie -- see ARCHITECTURE-SPINE.md AD-5/AD-6. This file never imports
// @/lib/supabase/* and never touches the Supabase session cookie; it only
// reads/writes its own `brujula_app_token` cookie and validates its own
// HMAC signature.
//
// Token shape: `${base64url(JSON payload)}.${base64url(HMAC-SHA256
// signature)}`, payload `{ sub, iat, exp }`. No JWT library, no DB-backed
// session store -- fully stateless/self-verifying using Node's built-in
// `crypto`. `sub` is carried for future auditability only: nothing
// downstream consumes it yet (Story 1.5's Route Handler still authorizes
// purely through the existing Supabase-session-reading db/* calls, per
// AD-6 -- requireApiToken() only gates "is this request carrying our own
// valid credential," it does not resolve or thread identity into
// managers).

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const APP_TOKEN_COOKIE = "brujula_app_token";
export const CSRF_HEADER = "x-brujula-csrf";

// 7 days, no refresh/rotation in this story -- a fresh token is issued on
// every signIn() call. Revisitable later if a real need appears.
export const APP_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type AppTokenPayload = {
  sub: string;
  iat: number;
  exp: number;
};

export type ApiTokenResult =
  | { ok: true }
  | { ok: false; status: 401 | 403; reason: string };

/**
 * Reads APP_TOKEN_SECRET from the environment. Missing/absent -> throws
 * immediately (fail loud, never silently issue an unsigned or
 * per-process-random-keyed token -- per this story's design decisions).
 */
function getSecret(): string {
  const secret = process.env.APP_TOKEN_SECRET;
  if (!secret) {
    throw new Error(
      "APP_TOKEN_SECRET no está configurado. Añádelo a .env.local/" +
        ".env.test.local (ver spec-1-4-app-token-issuance-and-validation.md)."
    );
  }
  return secret;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64url");
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function signPayload(payloadB64: string, secret: string): string {
  return base64UrlEncode(createHmac("sha256", secret).update(payloadB64).digest());
}

/**
 * Builds a signed, stateless app token for `authUserId`. Used by
 * `signIn` (src/app/actions/auth.ts) to issue the `brujula_app_token`
 * cookie alongside the (unchanged) Supabase session cookie.
 */
export function signAppToken(authUserId: string): string {
  if (!authUserId) {
    throw new Error("signAppToken: authUserId must be a non-empty string.");
  }
  const secret = getSecret();
  const iat = Math.floor(Date.now() / 1000);
  const payload: AppTokenPayload = {
    sub: authUserId,
    iat,
    exp: iat + APP_TOKEN_TTL_SECONDS,
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signatureB64 = signPayload(payloadB64, secret);
  return `${payloadB64}.${signatureB64}`;
}

function parseCookieHeader(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    const rawValue = trimmed.slice(eq + 1).trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }
  return cookies;
}

/**
 * Verifies signature, shape, and expiry of a token string. Never throws
 * on a malformed/tampered token -- returns null instead, so
 * requireApiToken() can turn that into a typed 401 rejection rather than
 * an unhandled exception.
 */
function verifyAppToken(token: string, secret: string): AppTokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, signatureB64] = parts;
    if (!payloadB64 || !signatureB64) return null;

    const expected = base64UrlDecode(signPayload(payloadB64, secret));
    const actual = base64UrlDecode(signatureB64);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return null;
    }

    const parsed = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
    if (
      !parsed ||
      typeof parsed.sub !== "string" ||
      typeof parsed.iat !== "number" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    return parsed as AppTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Verifies that `request` carries a valid `brujula_app_token` cookie and,
 * for mutating HTTP methods, the required anti-CSRF header. Resolves ok
 * or returns a typed rejection a Route Handler can turn into 401/403 --
 * it never throws for a per-request validation failure (a missing
 * APP_TOKEN_SECRET is the one exception: that is a deployment/config
 * error, not a per-request one, and fails loud immediately).
 *
 * This function does not read the Supabase session cookie and its
 * result does not depend on whatever Supabase session state exists on
 * the request (per AD-5/AD-6 -- the two credentials are decoupled).
 */
export function requireApiToken(request: Request): ApiTokenResult {
  const secret = getSecret();

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies[APP_TOKEN_COOKIE];
  if (!token) {
    return { ok: false, status: 401, reason: "missing_token" };
  }

  const payload = verifyAppToken(token, secret);
  if (!payload) {
    return { ok: false, status: 401, reason: "invalid_token" };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp <= nowSeconds) {
    return { ok: false, status: 401, reason: "expired_token" };
  }

  if (MUTATING_METHODS.has(request.method.toUpperCase())) {
    const csrfHeader = request.headers.get(CSRF_HEADER);
    if (!csrfHeader) {
      return { ok: false, status: 403, reason: "missing_csrf_header" };
    }
  }

  return { ok: true };
}
