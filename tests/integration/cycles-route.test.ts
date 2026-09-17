// Story 3.9 (_bmad-output/implementation-artifacts/
// spec-3-9-cycles-route-handlers-client-fetch-integration.md): exercises
// every row of the spec's I/O & Edge-Case Matrix by calling the exported
// Route Handler functions directly with constructed `Request`s, mirroring
// tests/integration/admin-members-auth-route.test.ts's shape (Story 3.3)
// for the auth-gating matrix, and tests/characterization/
// cycles-manager.test.ts's shape (Story 3.8) for fixtures/mocks/exact RPC
// error messages.
//
// What's real: every route handler under test, every cyclesManager/db
// function it calls, and every Postgres RPC underneath, run against the
// local `supabase start` instance. What's mocked, and why: only
// `@/lib/supabase/server` (so this suite can run requests "as" several
// different already-authenticated users without a real login/cookie
// ceremony per call) -- unlike Story 3.3's suite, no `next/headers` mock is
// needed: none of these routes read/write cookies themselves.
// requireApiToken/signAppToken (Story 1.4) are NOT mocked -- this suite
// uses real signed app tokens throughout, exactly as Story 3.3's own route
// suite does.

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
// Same fixed password every scripts/seed-*.mjs script uses for every
// account it creates (see scripts/seed-demo-company.mjs).
const PASSWORD = "kairos123";

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY -- deben venir de " +
      ".env.test.local (npx supabase start). Ver vitest.config.ts."
  );
}
// Hard boundary carried over from Stories 1.1/3.3/3.7/3.8: never run this
// suite against a remote Supabase project, dev or production -- only the
// local CLI instance.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(SUPABASE_URL)) {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL (${SUPABASE_URL}) no es la instancia local de \`supabase start\`. ` +
      "Estos tests nunca deben correr contra un proyecto remoto."
  );
}
if (!process.env.APP_TOKEN_SECRET) {
  throw new Error(
    "Falta APP_TOKEN_SECRET -- debe venir de .env.test.local (spec-1-4-app-token-issuance-and-validation.md)."
  );
}

// ---------------------------------------------------------------------------
// Mocks -- see file header for what and why.
// ---------------------------------------------------------------------------

const acting = vi.hoisted(() => ({ token: null as string | null }));

function actingAs(token: string) {
  acting.token = token;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async (): Promise<SupabaseClient> => {
    if (!acting.token) {
      throw new Error("test bug: actingAs(token) must be called before invoking a route handler");
    }
    return createSupabaseJsClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${acting.token}` } },
    });
  },
}));

// Imported after the mock above is declared (Vitest hoists `vi.mock` to the
// top of the module regardless of source order) so every route file's own
// import of cyclesManager (via @/server/db/cycles's own import of
// @/lib/supabase/server) picks up the mocked client factory.
import * as cyclesManager from "@/server/managers/cyclesManager";

import { POST as createCycleRoute } from "@/app/api/cycles/route";
import { POST as organizeEvaluatorsRoute } from "@/app/api/cycles/[cycleId]/evaluators/route";
import { GET as getStatusRoute } from "@/app/api/cycles/[cycleId]/status/route";
import { GET as getColleaguesRoute } from "@/app/api/cycles/colleagues-closed/route";
import { POST as createIndividualRequestRoute } from "@/app/api/cycles/requests/route";
import { POST as closeRequestRoute } from "@/app/api/cycles/requests/[requestId]/close/route";
import { PATCH as updateRequestEvaluatorsRoute } from "@/app/api/cycles/requests/[requestId]/evaluators/route";
import { PATCH as updateIndividualRequestEvaluatorsRoute } from "@/app/api/cycles/requests/[requestId]/evaluators-by-email/route";

import { APP_TOKEN_COOKIE, CSRF_HEADER, signAppToken } from "@/server/shared/auth";

// ---------------------------------------------------------------------------
// Small REST/RPC/auth helpers -- same anon-key-only pattern as
// scripts/seed-*.mjs and Stories 3.3/3.7/3.8's suites.
// ---------------------------------------------------------------------------

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`login failed for ${email}: ${JSON.stringify(data)}`);
  return data.access_token as string;
}

async function signUp(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`signUp failed for ${email}: ${JSON.stringify(data)}`);
  }
  return data.access_token as string;
}

async function restGet(pathAndQuery: string, token: string): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`GET ${pathAndQuery} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

async function callRpc(name: string, token: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${name} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

/** Fresh individual-kind account (organizations.kind = 'individual'), via
 * create_individual_account -- the only way to reach
 * createIndividualRequest/updateIndividualRequestEvaluators's success path,
 * same helper as Story 3.8's suite. */
async function createFreshIndividualAccount(email: string): Promise<string> {
  const token = await signUp(email, PASSWORD);
  await callRpc("create_individual_account", token, {
    p_full_name: "Individual de Prueba",
    p_email: email,
  });
  return token;
}

const EVALUATOR_CATEGORIES = ["manager", "team", "team", "organization", "other"] as const;

function todayPlusDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DUMMY_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Builds a constructed `Request` carrying (optionally) the app-token cookie
 * and/or the anti-CSRF header, per Story 1.4's requireApiToken() contract --
 * same helper shape as tests/integration/admin-members-auth-route.test.ts.
 */
function appRequest(
  url: string,
  init: {
    method?: string;
    token?: string | null;
    csrf?: boolean;
    body?: unknown;
  } = {}
): Request {
  const headers = new Headers();
  if (init.token) {
    headers.set("cookie", `${APP_TOKEN_COOKIE}=${init.token}`);
  }
  if (init.csrf) {
    headers.set(CSRF_HEADER, "1");
  }
  let body: string | undefined;
  if (init.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.body);
  }
  return new Request(url, { method: init.method ?? "GET", headers, body });
}

// A single app token (Story 1.4), reused across requests in this suite --
// requireApiToken() never resolves or threads its `sub` into the manager, so
// which authenticated user it names doesn't affect any route's behavior
// (same note as Story 3.3's own suite).
let appToken: string;

beforeAll(() => {
  appToken = signAppToken("cycles-route-test-user");
});

beforeEach(() => {
  acting.token = null;
});

afterAll(() => {
  acting.token = null;
});

// ---------------------------------------------------------------------------
// Auth gating: every cycles route rejects a missing token (401), and every
// mutating cycles route rejects a valid token with no CSRF header (403) --
// manager never invoked in either case. Mirrors Story 3.3's suite shape,
// generalized to this story's 8 routes.
// ---------------------------------------------------------------------------

describe("auth gating -- manager is never invoked on rejection", () => {
  test("POST /api/cycles: missing app token -> 401 unauthorized, createCycle never called", async () => {
    const spy = vi.spyOn(cyclesManager, "createCycle");
    const request = appRequest("https://example.test/api/cycles", {
      method: "POST",
      token: null,
      csrf: true,
      body: { name: "x", opensAt: todayPlusDays(0), closesAt: todayPlusDays(30), participantMemberIds: [] },
    });
    const response = await createCycleRoute(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: { code: "unauthorized", message: expect.any(String) } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/cycles: valid token, missing CSRF header -> 403 forbidden, createCycle never called", async () => {
    const spy = vi.spyOn(cyclesManager, "createCycle");
    const request = appRequest("https://example.test/api/cycles", {
      method: "POST",
      token: appToken,
      csrf: false,
      body: { name: "x", opensAt: todayPlusDays(0), closesAt: todayPlusDays(30), participantMemberIds: [] },
    });
    const response = await createCycleRoute(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data).toEqual({ error: { code: "forbidden", message: expect.any(String) } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/cycles/[cycleId]/evaluators: missing app token -> 401 unauthorized, organizeEvaluators never called", async () => {
    const spy = vi.spyOn(cyclesManager, "organizeEvaluators");
    const request = appRequest(`https://example.test/api/cycles/${DUMMY_ID}/evaluators`, {
      method: "POST",
      token: null,
      csrf: true,
      body: { evaluatorMemberIds: [], evaluatorCategories: [] },
    });
    const response = await organizeEvaluatorsRoute(request, { params: Promise.resolve({ cycleId: DUMMY_ID }) });

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/cycles/[cycleId]/evaluators: valid token, missing CSRF header -> 403 forbidden, organizeEvaluators never called", async () => {
    const spy = vi.spyOn(cyclesManager, "organizeEvaluators");
    const request = appRequest(`https://example.test/api/cycles/${DUMMY_ID}/evaluators`, {
      method: "POST",
      token: appToken,
      csrf: false,
      body: { evaluatorMemberIds: [], evaluatorCategories: [] },
    });
    const response = await organizeEvaluatorsRoute(request, { params: Promise.resolve({ cycleId: DUMMY_ID }) });

    expect(response.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/cycles/[cycleId]/evaluators: malformed cycleId -> 422 validation_error, organizeEvaluators never called", async () => {
    const spy = vi.spyOn(cyclesManager, "organizeEvaluators");
    const request = appRequest("https://example.test/api/cycles/not-a-uuid/evaluators", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { evaluatorMemberIds: [], evaluatorCategories: [] },
    });
    const response = await organizeEvaluatorsRoute(request, { params: Promise.resolve({ cycleId: "not-a-uuid" }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(data.error.message).not.toMatch(/invalid input syntax/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("GET /api/cycles/[cycleId]/status: missing app token -> 401 unauthorized, getStatus never called", async () => {
    const spy = vi.spyOn(cyclesManager, "getStatus");
    const request = appRequest(`https://example.test/api/cycles/${DUMMY_ID}/status`, {
      method: "GET",
      token: null,
    });
    const response = await getStatusRoute(request, { params: Promise.resolve({ cycleId: DUMMY_ID }) });

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("GET /api/cycles/[cycleId]/status: malformed cycleId -> 422 validation_error, getStatus never called", async () => {
    const spy = vi.spyOn(cyclesManager, "getStatus");
    const request = appRequest("https://example.test/api/cycles/not-a-uuid/status", {
      method: "GET",
      token: appToken,
    });
    const response = await getStatusRoute(request, { params: Promise.resolve({ cycleId: "not-a-uuid" }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(data.error.message).not.toMatch(/invalid input syntax/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("GET /api/cycles/colleagues-closed: missing app token -> 401 unauthorized, getColleaguesWithClosedCycle never called", async () => {
    const spy = vi.spyOn(cyclesManager, "getColleaguesWithClosedCycle");
    const request = appRequest("https://example.test/api/cycles/colleagues-closed", {
      method: "GET",
      token: null,
    });
    const response = await getColleaguesRoute(request);

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/cycles/requests: missing app token -> 401 unauthorized, createIndividualRequest never called", async () => {
    const spy = vi.spyOn(cyclesManager, "createIndividualRequest");
    const request = appRequest("https://example.test/api/cycles/requests", {
      method: "POST",
      token: null,
      csrf: true,
      body: { evaluatorEmails: [], evaluatorCategories: [], closesAt: todayPlusDays(14), name: null },
    });
    const response = await createIndividualRequestRoute(request);

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/cycles/requests: valid token, missing CSRF header -> 403 forbidden, createIndividualRequest never called", async () => {
    const spy = vi.spyOn(cyclesManager, "createIndividualRequest");
    const request = appRequest("https://example.test/api/cycles/requests", {
      method: "POST",
      token: appToken,
      csrf: false,
      body: { evaluatorEmails: [], evaluatorCategories: [], closesAt: todayPlusDays(14), name: null },
    });
    const response = await createIndividualRequestRoute(request);

    expect(response.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/cycles/requests/[requestId]/close: missing app token -> 401 unauthorized, closeRequest never called", async () => {
    const spy = vi.spyOn(cyclesManager, "closeRequest");
    const request = appRequest(`https://example.test/api/cycles/requests/${DUMMY_ID}/close`, {
      method: "POST",
      token: null,
      csrf: true,
    });
    const response = await closeRequestRoute(request, { params: Promise.resolve({ requestId: DUMMY_ID }) });

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/cycles/requests/[requestId]/close: valid token, missing CSRF header -> 403 forbidden, closeRequest never called", async () => {
    const spy = vi.spyOn(cyclesManager, "closeRequest");
    const request = appRequest(`https://example.test/api/cycles/requests/${DUMMY_ID}/close`, {
      method: "POST",
      token: appToken,
      csrf: false,
    });
    const response = await closeRequestRoute(request, { params: Promise.resolve({ requestId: DUMMY_ID }) });

    expect(response.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/cycles/requests/[requestId]/close: malformed requestId -> 422 validation_error, closeRequest never called", async () => {
    const spy = vi.spyOn(cyclesManager, "closeRequest");
    const request = appRequest("https://example.test/api/cycles/requests/not-a-uuid/close", {
      method: "POST",
      token: appToken,
      csrf: true,
    });
    const response = await closeRequestRoute(request, { params: Promise.resolve({ requestId: "not-a-uuid" }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(data.error.message).not.toMatch(/invalid input syntax/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("PATCH /api/cycles/requests/[requestId]/evaluators: missing app token -> 401 unauthorized, updateRequestEvaluators never called", async () => {
    const spy = vi.spyOn(cyclesManager, "updateRequestEvaluators");
    const request = appRequest(`https://example.test/api/cycles/requests/${DUMMY_ID}/evaluators`, {
      method: "PATCH",
      token: null,
      csrf: true,
      body: { evaluatorMemberIds: [], evaluatorCategories: [] },
    });
    const response = await updateRequestEvaluatorsRoute(request, { params: Promise.resolve({ requestId: DUMMY_ID }) });

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("PATCH /api/cycles/requests/[requestId]/evaluators: valid token, missing CSRF header -> 403 forbidden, updateRequestEvaluators never called", async () => {
    const spy = vi.spyOn(cyclesManager, "updateRequestEvaluators");
    const request = appRequest(`https://example.test/api/cycles/requests/${DUMMY_ID}/evaluators`, {
      method: "PATCH",
      token: appToken,
      csrf: false,
      body: { evaluatorMemberIds: [], evaluatorCategories: [] },
    });
    const response = await updateRequestEvaluatorsRoute(request, { params: Promise.resolve({ requestId: DUMMY_ID }) });

    expect(response.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("PATCH /api/cycles/requests/[requestId]/evaluators: malformed requestId -> 422 validation_error, updateRequestEvaluators never called", async () => {
    const spy = vi.spyOn(cyclesManager, "updateRequestEvaluators");
    const request = appRequest("https://example.test/api/cycles/requests/not-a-uuid/evaluators", {
      method: "PATCH",
      token: appToken,
      csrf: true,
      body: { evaluatorMemberIds: [], evaluatorCategories: [] },
    });
    const response = await updateRequestEvaluatorsRoute(request, { params: Promise.resolve({ requestId: "not-a-uuid" }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(data.error.message).not.toMatch(/invalid input syntax/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("PATCH /api/cycles/requests/[requestId]/evaluators-by-email: missing app token -> 401 unauthorized, updateIndividualRequestEvaluators never called", async () => {
    const spy = vi.spyOn(cyclesManager, "updateIndividualRequestEvaluators");
    const request = appRequest(`https://example.test/api/cycles/requests/${DUMMY_ID}/evaluators-by-email`, {
      method: "PATCH",
      token: null,
      csrf: true,
      body: { evaluatorEmails: [], evaluatorCategories: [] },
    });
    const response = await updateIndividualRequestEvaluatorsRoute(request, {
      params: Promise.resolve({ requestId: DUMMY_ID }),
    });

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("PATCH /api/cycles/requests/[requestId]/evaluators-by-email: valid token, missing CSRF header -> 403 forbidden, updateIndividualRequestEvaluators never called", async () => {
    const spy = vi.spyOn(cyclesManager, "updateIndividualRequestEvaluators");
    const request = appRequest(`https://example.test/api/cycles/requests/${DUMMY_ID}/evaluators-by-email`, {
      method: "PATCH",
      token: appToken,
      csrf: false,
      body: { evaluatorEmails: [], evaluatorCategories: [] },
    });
    const response = await updateIndividualRequestEvaluatorsRoute(request, {
      params: Promise.resolve({ requestId: DUMMY_ID }),
    });

    expect(response.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Malformed body -> 422 validation_error before calling the manager (Always
// boundary), one representative case per body-taking route.
// ---------------------------------------------------------------------------

describe("malformed request body -- manager is never invoked", () => {
  test("POST /api/cycles: malformed JSON -> 422 validation_error, createCycle never called", async () => {
    const spy = vi.spyOn(cyclesManager, "createCycle");
    const request = new Request("https://example.test/api/cycles", {
      method: "POST",
      headers: {
        cookie: `${APP_TOKEN_COOKIE}=${appToken}`,
        [CSRF_HEADER]: "1",
        "content-type": "application/json",
      },
      body: "{not valid json",
    });
    const response = await createCycleRoute(request);

    expect(response.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/cycles/requests: well-formed but invalid body (missing closesAt) -> 422 validation_error, createIndividualRequest never called", async () => {
    const spy = vi.spyOn(cyclesManager, "createIndividualRequest");
    const request = appRequest("https://example.test/api/cycles/requests", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { evaluatorEmails: [], evaluatorCategories: [], name: null },
    });
    const response = await createIndividualRequestRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("PATCH /api/cycles/requests/[requestId]/evaluators: well-formed but invalid body (evaluatorCategories not an array) -> 422 validation_error, updateRequestEvaluators never called", async () => {
    const spy = vi.spyOn(cyclesManager, "updateRequestEvaluators");
    const request = appRequest(`https://example.test/api/cycles/requests/${DUMMY_ID}/evaluators`, {
      method: "PATCH",
      token: appToken,
      csrf: true,
      body: { evaluatorMemberIds: [], evaluatorCategories: "not-an-array" },
    });
    const response = await updateRequestEvaluatorsRoute(request, { params: Promise.resolve({ requestId: DUMMY_ID }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/cycles/[cycleId]/evaluators: well-formed but invalid body (evaluatorMemberIds missing) -> 422 validation_error, organizeEvaluators never called", async () => {
    const spy = vi.spyOn(cyclesManager, "organizeEvaluators");
    const request = appRequest(`https://example.test/api/cycles/${DUMMY_ID}/evaluators`, {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { evaluatorCategories: [...EVALUATOR_CATEGORIES] },
    });
    const response = await organizeEvaluatorsRoute(request, { params: Promise.resolve({ cycleId: DUMMY_ID }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("PATCH /api/cycles/requests/[requestId]/evaluators-by-email: well-formed but invalid body (evaluatorEmails missing) -> 422 validation_error, updateIndividualRequestEvaluators never called", async () => {
    const spy = vi.spyOn(cyclesManager, "updateIndividualRequestEvaluators");
    const request = appRequest(`https://example.test/api/cycles/requests/${DUMMY_ID}/evaluators-by-email`, {
      method: "PATCH",
      token: appToken,
      csrf: true,
      body: { evaluatorCategories: [...EVALUATOR_CATEGORIES] },
    });
    const response = await updateIndividualRequestEvaluatorsRoute(request, {
      params: Promise.resolve({ requestId: DUMMY_ID }),
    });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // ---------------------------------------------------------------------
  // UUID-format guards on array elements (isValidUuid per-element), added
  // alongside the string[]-only Array.isArray/every checks above -- proves
  // a malformed id in an otherwise well-formed array is caught by the
  // friendly validation_error path instead of reaching the RPC and leaking
  // Postgres's raw "invalid input syntax for type uuid" message.
  // ---------------------------------------------------------------------

  test("POST /api/cycles: participantMemberIds contains a malformed uuid -> 422 validation_error, createCycle never called", async () => {
    const spy = vi.spyOn(cyclesManager, "createCycle");
    const request = appRequest("https://example.test/api/cycles", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: {
        name: "x",
        opensAt: todayPlusDays(0),
        closesAt: todayPlusDays(30),
        participantMemberIds: ["not-a-uuid"],
      },
    });
    const response = await createCycleRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(data.error.message).not.toMatch(/invalid input syntax/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/cycles: opensAt is not a parseable date -> 422 validation_error, createCycle never called", async () => {
    const spy = vi.spyOn(cyclesManager, "createCycle");
    const request = appRequest("https://example.test/api/cycles", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: {
        name: "x",
        opensAt: "not-a-date",
        closesAt: todayPlusDays(30),
        participantMemberIds: [],
      },
    });
    const response = await createCycleRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/cycles/[cycleId]/evaluators: evaluatorMemberIds contains a malformed uuid -> 422 validation_error, organizeEvaluators never called", async () => {
    const spy = vi.spyOn(cyclesManager, "organizeEvaluators");
    const request = appRequest(`https://example.test/api/cycles/${DUMMY_ID}/evaluators`, {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { evaluatorMemberIds: ["not-a-uuid"], evaluatorCategories: ["manager"] },
    });
    const response = await organizeEvaluatorsRoute(request, { params: Promise.resolve({ cycleId: DUMMY_ID }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(data.error.message).not.toMatch(/invalid input syntax/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("PATCH /api/cycles/requests/[requestId]/evaluators: evaluatorMemberIds contains a malformed uuid -> 422 validation_error, updateRequestEvaluators never called", async () => {
    const spy = vi.spyOn(cyclesManager, "updateRequestEvaluators");
    const request = appRequest(`https://example.test/api/cycles/requests/${DUMMY_ID}/evaluators`, {
      method: "PATCH",
      token: appToken,
      csrf: true,
      body: { evaluatorMemberIds: ["not-a-uuid"], evaluatorCategories: ["manager"] },
    });
    const response = await updateRequestEvaluatorsRoute(request, { params: Promise.resolve({ requestId: DUMMY_ID }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(data.error.message).not.toMatch(/invalid input syntax/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/cycles/requests: closesAt is not a parseable date -> 422 validation_error, createIndividualRequest never called", async () => {
    const spy = vi.spyOn(cyclesManager, "createIndividualRequest");
    const request = appRequest("https://example.test/api/cycles/requests", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { evaluatorEmails: [], evaluatorCategories: [], closesAt: "not-a-date", name: null },
    });
    const response = await createIndividualRequestRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Happy-path / validation-error fixture chain -- one fresh demo company via
// scripts/seed-demo-company.mjs, same technique as Story 3.8's suite.
// Exercises every one of this story's 8 route handlers over at least one
// real, non-mocked-RPC path each.
// ---------------------------------------------------------------------------

type SeededEmployee = { email: string; bucketLabel: string };

let supervisorEmail: string;
let supervisorToken: string;
let supervisorMemberId: string;
let seedCycleId: string;
let closedEmployee: { token: string; id: string; requestId: string };
let readyEmployee: { token: string; id: string; requestId: string };
let halfDoneEmployee: { token: string; id: string; requestId: string };
let evaluatorPool: { id: string }[]; // >= 5 active, non-supervisor org employees

let freshCycleId: string;
let freshRequestId: string;

const runId = Date.now();

beforeAll(async () => {
  const companyName = `Route Test Cycles ${runId}`;
  let seedOutput: string;
  try {
    seedOutput = execFileSync("node", [path.join("scripts", "seed-demo-company.mjs"), companyName, "6"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      },
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string };
    throw new Error(
      `seed-demo-company.mjs failed: ${err.message}\n--- stdout ---\n${err.stdout}\n--- stderr ---\n${err.stderr}`
    );
  }

  const supervisorMatch = seedOutput.match(/^Supervisor: (\S+) \//m);
  if (!supervisorMatch) {
    throw new Error(`no se pudo extraer el email del Supervisor de la salida del seed:\n${seedOutput}`);
  }
  supervisorEmail = supervisorMatch[1];

  const cycleIdMatch = seedOutput.match(/^ {3}cycle id: (\S+)$/m);
  if (!cycleIdMatch) {
    throw new Error(`no se pudo extraer el cycle id de la salida del seed:\n${seedOutput}`);
  }
  seedCycleId = cycleIdMatch[1];

  const employees: SeededEmployee[] = [];
  const lineRe = /^ {2}- .+ <([^>]+)> — .+ — 360: (.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(seedOutput))) {
    employees.push({ email: m[1], bucketLabel: m[2] });
  }

  const closed = employees.find((e) => e.bucketLabel === "cerrado");
  const ready = employees.find((e) => e.bucketLabel === "listo (sin cerrar)");
  const halfDone = employees.find((e) => e.bucketLabel === "a medias");
  if (!closed || !ready || !halfDone) {
    throw new Error(
      `seed-demo-company.mjs no produjo los 3 buckets esperados. Salida completa:\n${seedOutput}`
    );
  }

  supervisorToken = await login(supervisorEmail, PASSWORD);

  const memberRows = (await restGet(
    `members?select=id,email,organization_id&email=in.(${employees.map((e) => e.email).join(",")},${supervisorEmail})`,
    supervisorToken
  )) as { id: string; email: string; organization_id: string }[];
  const idByEmail = Object.fromEntries(memberRows.map((r) => [r.email, r.id]));
  supervisorMemberId = idByEmail[supervisorEmail];

  async function resolve(e: SeededEmployee) {
    const token = await login(e.email, PASSWORD);
    const id = idByEmail[e.email];
    const requests = (await restGet(
      `feedback_requests?select=id&requester_member_id=eq.${id}&request_type=eq.cycle`,
      token
    )) as { id: string }[];
    return { token, id, requestId: requests[0].id };
  }

  closedEmployee = await resolve(closed);
  readyEmployee = await resolve(ready);
  halfDoneEmployee = await resolve(halfDone);

  evaluatorPool = employees.map((e) => ({ id: idByEmail[e.email] }));
  if (evaluatorPool.length < 5) {
    throw new Error(`evaluatorPool insuficiente (${evaluatorPool.length}); se necesitan >= 5.`);
  }
});

describe("POST /api/cycles -> cyclesManager.createCycle", () => {
  test("as the Supervisor, valid body -> 201 { cycleId }", async () => {
    // Same rationale as Story 3.8's suite: the Supervisor is the cycle's own
    // sole participant, sidestepping the seeded employees' existing "one
    // open cycle at a time" lock.
    actingAs(supervisorToken);
    const request = appRequest("https://example.test/api/cycles", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: {
        name: `Ciclo fresco route ${runId}`,
        opensAt: todayPlusDays(0),
        closesAt: todayPlusDays(30),
        participantMemberIds: [supervisorMemberId],
      },
    });
    const response = await createCycleRoute(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.cycleId).toMatch(UUID_RE);
    freshCycleId = data.cycleId;
  });

  test("RPC rejects (participant already has an open cycle) -> 422 validation_error, create_feedback_cycle's own exact message prefix", async () => {
    // Story 7.1 (schema port): create_feedback_cycle's "one open cycle at a
    // time" guard was fixed upstream (0070_fix_cycle_conflict_check_uses_status.sql)
    // to check the participant's own feedback_requests.status instead of the
    // existing cycle's calendar dates -- evaluatorPool[0] (whichever bucket
    // the seed produced first, e.g. already "cerrado") could now legitimately
    // join a new cycle. Use readyEmployee specifically -- resolved in
    // beforeAll with status still "open" at this point in the file (only
    // closed by a later test, well past this one) -- to genuinely exercise
    // the conflict case under the corrected rule.
    actingAs(supervisorToken);
    const request = appRequest("https://example.test/api/cycles", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: {
        name: `Ciclo conflictivo route ${runId}`,
        opensAt: todayPlusDays(0),
        closesAt: todayPlusDays(30),
        participantMemberIds: [readyEmployee.id],
      },
    });
    const response = await createCycleRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    // Recorded verbatim (static prefix) from create_feedback_cycle's raised
    // exception (supabase/migrations/0023_one_open_cycle_at_a_time.sql).
    expect(data.error.message).toMatch(
      /^Ya tienen un ciclo 360 abierto, no se les puede incluir en otro hasta que termine:/
    );
  });
});

describe("POST /api/cycles/[cycleId]/evaluators -> cyclesManager.organizeEvaluators", () => {
  test("as the Supervisor, valid body -> 201 { requestId }", async () => {
    expect(freshCycleId, "createCycle must have run first").toBeDefined();

    const evaluatorIds = evaluatorPool.slice(0, 5).map((e) => e.id);

    actingAs(supervisorToken);
    const request = appRequest(`https://example.test/api/cycles/${freshCycleId}/evaluators`, {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { evaluatorMemberIds: evaluatorIds, evaluatorCategories: [...EVALUATOR_CATEGORIES] },
    });
    const response = await organizeEvaluatorsRoute(request, { params: Promise.resolve({ cycleId: freshCycleId }) });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.requestId).toMatch(UUID_RE);
    freshRequestId = data.requestId;
  });
});

describe("GET /api/cycles/[cycleId]/status -> cyclesManager.getStatus", () => {
  test("as the Supervisor -> 200 array with 'completado' for participants who finished", async () => {
    actingAs(supervisorToken);
    const request = appRequest(`https://example.test/api/cycles/${seedCycleId}/status`, {
      method: "GET",
      token: appToken,
    });
    const response = await getStatusRoute(request, { params: Promise.resolve({ cycleId: seedCycleId }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    const closedRow = data.find((r: { memberId: string }) => r.memberId === closedEmployee.id);
    expect(closedRow?.status).toBe("completado");
  });

  test("as a non-supervisor -> 422 validation_error, get_cycle_status's own exact message", async () => {
    actingAs(readyEmployee.token);
    const request = appRequest(`https://example.test/api/cycles/${seedCycleId}/status`, {
      method: "GET",
      token: appToken,
    });
    const response = await getStatusRoute(request, { params: Promise.resolve({ cycleId: seedCycleId }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data).toEqual({
      error: {
        code: "validation_error",
        message: "Solo el administrador de la empresa puede ver el estado de un ciclo.",
      },
    });
  });
});

describe("GET /api/cycles/colleagues-closed -> cyclesManager.getColleaguesWithClosedCycle", () => {
  test("as an authenticated colleague -> 200 array including a colleague with a closed 360, excluding the caller", async () => {
    actingAs(readyEmployee.token);
    const request = appRequest("https://example.test/api/cycles/colleagues-closed", {
      method: "GET",
      token: appToken,
    });
    const response = await getColleaguesRoute(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((r: { id: string }) => r.id === closedEmployee.id)).toBe(true);
    expect(data.some((r: { id: string }) => r.id === readyEmployee.id)).toBe(false);
  });
});

let individualToken: string;
let individualRequestId: string;

describe("POST /api/cycles/requests -> cyclesManager.createIndividualRequest", () => {
  test("as a fresh individual account, valid body -> 201 { requestId }", async () => {
    const email = `individual-a-route-${runId}@brujula-fake.test`;
    individualToken = await createFreshIndividualAccount(email);

    const emails = ["ev1", "ev2", "ev3", "ev4", "ev5"].map((n) => `${n}-route-${runId}@brujula-fake.test`);

    actingAs(individualToken);
    const request = appRequest("https://example.test/api/cycles/requests", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: {
        evaluatorEmails: emails,
        evaluatorCategories: [...EVALUATOR_CATEGORIES],
        closesAt: todayPlusDays(14),
        name: "Mi 360 individual route",
      },
    });
    const response = await createIndividualRequestRoute(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.requestId).toMatch(UUID_RE);
    individualRequestId = data.requestId;
  });

  test("RPC rejects (malformed email) -> 422 validation_error, create_individual_cycle_request's own exact message", async () => {
    const email = `individual-b-route-${runId}@brujula-fake.test`;
    const token = await createFreshIndividualAccount(email);

    const emails = [
      `ev1-route-${runId}@brujula-fake.test`,
      `ev2-route-${runId}@brujula-fake.test`,
      `ev3-route-${runId}@brujula-fake.test`,
      `ev4-route-${runId}@brujula-fake.test`,
      "not-an-email",
    ];

    actingAs(token);
    const request = appRequest("https://example.test/api/cycles/requests", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { evaluatorEmails: emails, evaluatorCategories: [...EVALUATOR_CATEGORIES], closesAt: todayPlusDays(14), name: null },
    });
    const response = await createIndividualRequestRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data).toEqual({
      error: { code: "validation_error", message: "Algún email no es válido." },
    });
  });
});

describe("PATCH /api/cycles/requests/[requestId]/evaluators-by-email -> cyclesManager.updateIndividualRequestEvaluators", () => {
  test("as the individual account, valid body -> 200 null", async () => {
    expect(individualRequestId, "createIndividualRequest must have run first").toBeDefined();

    const newEmails = ["u1", "u2", "u3", "u4", "u5"].map((n) => `${n}-route-${runId}@brujula-fake.test`);

    actingAs(individualToken);
    const request = appRequest(`https://example.test/api/cycles/requests/${individualRequestId}/evaluators-by-email`, {
      method: "PATCH",
      token: appToken,
      csrf: true,
      body: { evaluatorEmails: newEmails, evaluatorCategories: [...EVALUATOR_CATEGORIES] },
    });
    const response = await updateIndividualRequestEvaluatorsRoute(request, {
      params: Promise.resolve({ requestId: individualRequestId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  test("malformed requestId -> 422 validation_error, friendly message (not Postgres's raw error), updateIndividualRequestEvaluators never called", async () => {
    const spy = vi.spyOn(cyclesManager, "updateIndividualRequestEvaluators");
    const request = appRequest("https://example.test/api/cycles/requests/not-a-uuid/evaluators-by-email", {
      method: "PATCH",
      token: appToken,
      csrf: true,
      body: { evaluatorEmails: [], evaluatorCategories: [] },
    });
    const response = await updateIndividualRequestEvaluatorsRoute(request, {
      params: Promise.resolve({ requestId: "not-a-uuid" }),
    });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(data.error.message).not.toMatch(/invalid input syntax/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("PATCH /api/cycles/requests/[requestId]/evaluators -> cyclesManager.updateRequestEvaluators", () => {
  test("as the Supervisor, valid evaluator set -> 200 null", async () => {
    expect(freshRequestId, "organizeEvaluators must have run first").toBeDefined();

    const evaluatorIds = evaluatorPool.slice(0, 5).map((e) => e.id);

    actingAs(supervisorToken);
    const request = appRequest(`https://example.test/api/cycles/requests/${freshRequestId}/evaluators`, {
      method: "PATCH",
      token: appToken,
      csrf: true,
      body: { evaluatorMemberIds: evaluatorIds, evaluatorCategories: [...EVALUATOR_CATEGORIES] },
    });
    const response = await updateRequestEvaluatorsRoute(request, { params: Promise.resolve({ requestId: freshRequestId }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  test("RPC rejects (request already closed) -> 422 validation_error, update_cycle_request_evaluators's own exact message", async () => {
    // closedEmployee's own request was already closed by
    // scripts/seed-demo-company.mjs (its "cerrado" bucket) -- same fixture
    // Story 3.8's suite uses for this scenario.
    actingAs(closedEmployee.token);
    const request = appRequest(`https://example.test/api/cycles/requests/${closedEmployee.requestId}/evaluators`, {
      method: "PATCH",
      token: appToken,
      csrf: true,
      body: { evaluatorMemberIds: [], evaluatorCategories: [] },
    });
    const response = await updateRequestEvaluatorsRoute(request, {
      params: Promise.resolve({ requestId: closedEmployee.requestId }),
    });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data).toEqual({
      error: { code: "validation_error", message: "Esta solicitud ya no está abierta." },
    });
  });
});

describe("POST /api/cycles/requests/[requestId]/close -> cyclesManager.closeRequest", () => {
  test("a request eligible to close -> 200 null; status becomes 'closed'", async () => {
    expect(readyEmployee, "the seed fixture must have produced a 'listo (sin cerrar)' employee").toBeDefined();

    actingAs(readyEmployee.token);
    const request = appRequest(`https://example.test/api/cycles/requests/${readyEmployee.requestId}/close`, {
      method: "POST",
      token: appToken,
      csrf: true,
    });
    const response = await closeRequestRoute(request, { params: Promise.resolve({ requestId: readyEmployee.requestId }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();

    const rows = (await restGet(
      `feedback_requests?select=status&id=eq.${readyEmployee.requestId}`,
      readyEmployee.token
    )) as { status: string }[];
    expect(rows[0].status).toBe("closed");
  });

  test("a request not eligible to close -> 422 validation_error, close_cycle_request's own exact message", async () => {
    expect(halfDoneEmployee, "the seed fixture must have produced an 'a medias' employee").toBeDefined();

    actingAs(halfDoneEmployee.token);
    const request = appRequest(`https://example.test/api/cycles/requests/${halfDoneEmployee.requestId}/close`, {
      method: "POST",
      token: appToken,
      csrf: true,
    });
    const response = await closeRequestRoute(request, { params: Promise.resolve({ requestId: halfDoneEmployee.requestId }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data).toEqual({
      error: {
        code: "validation_error",
        message: "Todavía no se puede finalizar: hace falta llegar al mínimo de respuestas y tu propia autoevaluación.",
      },
    });
  });
});
