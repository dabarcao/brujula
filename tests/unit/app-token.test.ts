// Story 1.4 (_bmad-output/implementation-artifacts/
// spec-1-4-app-token-issuance-and-validation.md): unit tests for
// signAppToken/requireApiToken (src/server/shared/auth.ts), exercised as
// pure functions -- no HTTP layer, no Supabase, no Next.js request
// context needed. Covers every row of the spec's I/O & Edge-Case Matrix.
// Relies on APP_TOKEN_SECRET coming from .env.test.local via
// vitest.config.ts's loadEnvTestLocal().

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  APP_TOKEN_COOKIE,
  CSRF_HEADER,
  requireApiToken,
  signAppToken,
} from "@/server/shared/auth";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";

function requestWithToken(
  token: string | null,
  init: { method?: string; csrfHeader?: string | null } = {}
): Request {
  const headers = new Headers();
  if (token !== null) {
    headers.set("cookie", `${APP_TOKEN_COOKIE}=${token}`);
  }
  if (init.csrfHeader) {
    headers.set(CSRF_HEADER, init.csrfHeader);
  }
  return new Request("https://example.test/api/report-groups", {
    method: init.method ?? "GET",
    headers,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("signAppToken / requireApiToken", () => {
  test("valid token, non-mutating request (GET) -> resolves ok", () => {
    const token = signAppToken(AUTH_USER_ID);
    const result = requireApiToken(requestWithToken(token, { method: "GET" }));
    expect(result).toEqual({ ok: true });
  });

  test("missing token -> rejects 401", () => {
    const result = requireApiToken(requestWithToken(null, { method: "GET" }));
    expect(result).toEqual({ ok: false, status: 401, reason: "missing_token" });
  });

  test("tampered/invalid-signature token -> rejects 401", () => {
    const token = signAppToken(AUTH_USER_ID);
    const [payloadB64, signatureB64] = token.split(".");
    // Flip the signature's first character so it no longer matches the
    // payload -- simulates a tampered or corrupted token without ever
    // constructing a validly-signed one.
    const flippedChar = signatureB64[0] === "a" ? "b" : "a";
    const tampered = `${payloadB64}.${flippedChar}${signatureB64.slice(1)}`;

    const result = requireApiToken(requestWithToken(tampered, { method: "GET" }));
    expect(result).toEqual({ ok: false, status: 401, reason: "invalid_token" });
  });

  test("malformed token (not two dot-separated parts) -> rejects 401, never throws", () => {
    const result = requireApiToken(requestWithToken("not-a-valid-token", { method: "GET" }));
    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(401);
  });

  test("expired token -> rejects 401", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = signAppToken(AUTH_USER_ID);

    // TTL is 7 days; advance 8 days so `exp` is in the past.
    vi.setSystemTime(new Date("2026-01-09T00:00:00Z"));

    const result = requireApiToken(requestWithToken(token, { method: "GET" }));
    expect(result).toEqual({ ok: false, status: 401, reason: "expired_token" });
  });

  test("mutating method, valid token, missing CSRF header -> rejects 403", () => {
    const token = signAppToken(AUTH_USER_ID);
    const result = requireApiToken(requestWithToken(token, { method: "POST" }));
    expect(result).toEqual({ ok: false, status: 403, reason: "missing_csrf_header" });
  });

  test("mutating method, valid token, CSRF header present -> resolves ok", () => {
    const token = signAppToken(AUTH_USER_ID);
    const result = requireApiToken(
      requestWithToken(token, { method: "POST", csrfHeader: "1" })
    );
    expect(result).toEqual({ ok: true });
  });

  test("mutating method rejection (403) is distinct from the 401 cases", () => {
    const token = signAppToken(AUTH_USER_ID);
    const missingCsrf = requireApiToken(requestWithToken(token, { method: "PATCH" }));
    const missingToken = requireApiToken(requestWithToken(null, { method: "PATCH" }));

    expect(missingCsrf.ok).toBe(false);
    expect(missingToken.ok).toBe(false);
    expect((missingCsrf as { status: number }).status).toBe(403);
    expect((missingToken as { status: number }).status).toBe(401);
  });

  test("PUT and DELETE are also treated as mutating methods", () => {
    const token = signAppToken(AUTH_USER_ID);
    expect(requireApiToken(requestWithToken(token, { method: "PUT" }))).toEqual({
      ok: false,
      status: 403,
      reason: "missing_csrf_header",
    });
    expect(requireApiToken(requestWithToken(token, { method: "DELETE" }))).toEqual({
      ok: false,
      status: 403,
      reason: "missing_csrf_header",
    });
  });

  test("mutating method, valid token, empty-string CSRF header -> rejects 403, same as missing", () => {
    const token = signAppToken(AUTH_USER_ID);
    const headers = new Headers();
    headers.set("cookie", `${APP_TOKEN_COOKIE}=${token}`);
    headers.set(CSRF_HEADER, "");
    const request = new Request("https://example.test/api/report-groups", {
      method: "POST",
      headers,
    });

    const result = requireApiToken(request);
    expect(result).toEqual({ ok: false, status: 403, reason: "missing_csrf_header" });
  });

  test("unrelated cookies don't affect the result: valid token alongside a Supabase-style cookie -> ok", () => {
    const token = signAppToken(AUTH_USER_ID);
    const headers = new Headers();
    headers.set("cookie", `sb-test-auth-token=some-supabase-session-value; ${APP_TOKEN_COOKIE}=${token}`);
    const request = new Request("https://example.test/api/report-groups", {
      method: "GET",
      headers,
    });

    expect(requireApiToken(request)).toEqual({ ok: true });
  });

  test("unrelated cookies don't affect the result: only a Supabase-style cookie, no app token -> rejects 401", () => {
    const headers = new Headers();
    headers.set("cookie", "sb-test-auth-token=some-supabase-session-value");
    const request = new Request("https://example.test/api/report-groups", {
      method: "GET",
      headers,
    });

    expect(requireApiToken(request)).toEqual({ ok: false, status: 401, reason: "missing_token" });
  });
});

describe("signAppToken", () => {
  test("throws immediately if APP_TOKEN_SECRET is missing (fail loud)", async () => {
    const previous = process.env.APP_TOKEN_SECRET;
    delete process.env.APP_TOKEN_SECRET;
    try {
      // Re-import isn't needed: signAppToken reads process.env.APP_TOKEN_SECRET
      // fresh on every call, not once at module load.
      expect(() => signAppToken(AUTH_USER_ID)).toThrow(/APP_TOKEN_SECRET/);
    } finally {
      process.env.APP_TOKEN_SECRET = previous;
    }
  });
});

describe("requireApiToken", () => {
  test("throws immediately if APP_TOKEN_SECRET is missing (fail loud)", async () => {
    const previous = process.env.APP_TOKEN_SECRET;
    delete process.env.APP_TOKEN_SECRET;
    try {
      // Same getSecret() call as signAppToken -- also called unconditionally,
      // before any per-request check, so this must throw immediately too.
      expect(() => requireApiToken(requestWithToken(null, { method: "GET" }))).toThrow(
        /APP_TOKEN_SECRET/
      );
    } finally {
      process.env.APP_TOKEN_SECRET = previous;
    }
  });
});
