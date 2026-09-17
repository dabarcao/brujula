// Story 3.15 (_bmad-output/implementation-artifacts/
// spec-3-15-feedback-route-handlers-client-fetch-integration.md): exercises
// every row of the spec's I/O & Edge-Case Matrix by calling the exported
// Route Handler functions directly with constructed `Request`s, mirroring
// tests/integration/cycles-route.test.ts's shape (Story 3.9) for the
// route/auth-gating pattern, and tests/characterization/
// feedback-manager.test.ts's shape (Story 3.14) for fixtures/mocks/exact
// RPC error messages.
//
// What's real: every route handler under test, every feedbackManager/db
// function it calls, and every Postgres RPC underneath, run against the
// local `supabase start` instance. What's mocked, and why: only
// `@/lib/supabase/server` (so this suite can run requests "as" several
// different already-authenticated users without a real login/cookie
// ceremony per call) -- no `next/headers` mock is needed: none of these
// routes read/write cookies themselves. requireApiToken/signAppToken
// (Story 1.4) are NOT mocked -- this suite uses real signed app tokens
// throughout, exactly as Story 3.9's own route suite does.

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
// Hard boundary carried over from Stories 1.1/3.3/3.7/3.8/3.9: never run
// this suite against a remote Supabase project, dev or production -- only
// the local CLI instance.
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
// import of feedbackManager (via @/server/db/feedback's own import of
// @/lib/supabase/server) picks up the mocked client factory.
import * as feedbackManager from "@/server/managers/feedbackManager";

import { POST as createRequestRoute } from "@/app/api/feedback-requests/route";
import { POST as createIndividualRequestRoute } from "@/app/api/feedback-requests/individual/route";
import { GET as pendingInvitationsRoute } from "@/app/api/feedback-requests/pending-invitations/route";
import { GET as getCompetencyNarrativeRoute } from "@/app/api/feedback-requests/[id]/route";
import { PATCH as updateRequestEvaluatorsRoute } from "@/app/api/feedback-requests/[id]/evaluators/route";
import { POST as cancelRequestRoute } from "@/app/api/feedback-requests/[id]/cancel/route";
import { POST as closeRequestRoute } from "@/app/api/feedback-requests/[id]/close/route";

import { APP_TOKEN_COOKIE, CSRF_HEADER, signAppToken } from "@/server/shared/auth";

// ---------------------------------------------------------------------------
// Small REST/RPC/auth helpers -- same anon-key-only pattern as
// scripts/seed-*.mjs and Stories 3.9/3.14's suites.
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
 * createIndividualRequest's success path, same helper Story 3.14's suite
 * uses. */
async function createFreshIndividualAccount(email: string): Promise<string> {
  const token = await signUp(email, PASSWORD);
  await callRpc("create_individual_account", token, {
    p_full_name: "Individual de Prueba",
    p_email: email,
  });
  return token;
}

type PendingInvitationRaw = {
  token: string;
  created_at: string;
  evaluator_category: string | null;
  requester_member_id: string;
  requester_full_name: string | null;
  requester_email: string;
};

type ResponderQuestion = {
  id: string;
  question_type: string;
  max_selections: number | null;
};

type ResponderContext = {
  valid: boolean;
  used?: boolean;
  questions?: ResponderQuestion[];
  competencies?: { code: string; name: string }[];
};

/** Fetches the caller's pending invitation from a specific requester, then
 * submits a full answer set via submit_feedback_response -- fixture-building
 * infrastructure only (to produce a specific response count ahead of the
 * threshold/has-responses scenarios below), same technique/allowance
 * tests/characterization/feedback-manager.test.ts's own respondAsEvaluator
 * helper already established. Called directly via RPC, never through
 * feedbackManager or a route (out of this story's scope). */
async function respondAsEvaluator(evaluatorToken: string, requesterMemberId: string): Promise<void> {
  const pending = (await callRpc("get_my_pending_invitations", evaluatorToken, {})) as PendingInvitationRaw[];
  const invite = pending.find((p) => p.requester_member_id === requesterMemberId);
  if (!invite) {
    throw new Error(`test bug: no pending invitation found from requester ${requesterMemberId}`);
  }

  const ctx = (await callRpc("get_responder_context", evaluatorToken, {
    p_token: invite.token,
  })) as ResponderContext;
  if (!ctx.valid || !ctx.questions) {
    throw new Error(`get_responder_context returned invalid context: ${JSON.stringify(ctx)}`);
  }

  const competencyCode = ctx.competencies?.[0]?.code;
  const answers = ctx.questions.map((q) => {
    if (q.question_type === "competency") {
      return {
        question_id: q.id,
        competency_code: competencyCode,
        answer_value: 4,
        answer_text: "Comentario de prueba.",
      };
    }
    if (q.question_type === "scale") {
      return { question_id: q.id, answer_value: 4 };
    }
    return { question_id: q.id, answer_text: "Respuesta de prueba." };
  });

  await callRpc("submit_feedback_response", evaluatorToken, { p_token: invite.token, p_answers: answers });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DUMMY_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Builds a constructed `Request` carrying (optionally) the app-token cookie
 * and/or the anti-CSRF header, per Story 1.4's requireApiToken() contract --
 * same helper shape as tests/integration/cycles-route.test.ts.
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
// (same note as Story 3.9's own suite).
let appToken: string;

beforeAll(() => {
  appToken = signAppToken("feedback-route-test-user");
});

beforeEach(() => {
  acting.token = null;
});

afterAll(() => {
  acting.token = null;
});

// ---------------------------------------------------------------------------
// Auth gating: every feedback-requests route rejects a missing token (401),
// and every mutating route rejects a valid token with no CSRF header (403)
// -- manager never invoked in either case. Mirrors Story 3.9's suite shape,
// generalized to this story's 7 routes.
// ---------------------------------------------------------------------------

describe("auth gating -- manager is never invoked on rejection", () => {
  test("POST /api/feedback-requests: missing app token -> 401 unauthorized, createRequest never called", async () => {
    const spy = vi.spyOn(feedbackManager, "createRequest");
    const request = appRequest("https://example.test/api/feedback-requests", {
      method: "POST",
      token: null,
      csrf: true,
      body: { inviteeMemberIds: [] },
    });
    const response = await createRequestRoute(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: { code: "unauthorized", message: expect.any(String) } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/feedback-requests: valid token, missing CSRF header -> 403 forbidden, createRequest never called", async () => {
    const spy = vi.spyOn(feedbackManager, "createRequest");
    const request = appRequest("https://example.test/api/feedback-requests", {
      method: "POST",
      token: appToken,
      csrf: false,
      body: { inviteeMemberIds: [] },
    });
    const response = await createRequestRoute(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data).toEqual({ error: { code: "forbidden", message: expect.any(String) } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/feedback-requests/individual: missing app token -> 401 unauthorized, createIndividualRequest never called", async () => {
    const spy = vi.spyOn(feedbackManager, "createIndividualRequest");
    const request = appRequest("https://example.test/api/feedback-requests/individual", {
      method: "POST",
      token: null,
      csrf: true,
      body: { inviteeEmails: [] },
    });
    const response = await createIndividualRequestRoute(request);

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/feedback-requests/individual: valid token, missing CSRF header -> 403 forbidden, createIndividualRequest never called", async () => {
    const spy = vi.spyOn(feedbackManager, "createIndividualRequest");
    const request = appRequest("https://example.test/api/feedback-requests/individual", {
      method: "POST",
      token: appToken,
      csrf: false,
      body: { inviteeEmails: [] },
    });
    const response = await createIndividualRequestRoute(request);

    expect(response.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("GET /api/feedback-requests/pending-invitations: missing app token -> 401 unauthorized, getMyPendingInvitations never called", async () => {
    const spy = vi.spyOn(feedbackManager, "getMyPendingInvitations");
    const request = appRequest("https://example.test/api/feedback-requests/pending-invitations", {
      method: "GET",
      token: null,
    });
    const response = await pendingInvitationsRoute(request);

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("GET /api/feedback-requests/[id]: missing app token -> 401 unauthorized, getCompetencyNarrative never called", async () => {
    const spy = vi.spyOn(feedbackManager, "getCompetencyNarrative");
    const request = appRequest(`https://example.test/api/feedback-requests/${DUMMY_ID}`, {
      method: "GET",
      token: null,
    });
    const response = await getCompetencyNarrativeRoute(request, { params: Promise.resolve({ id: DUMMY_ID }) });

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("GET /api/feedback-requests/[id]: malformed id -> 422 validation_error, getCompetencyNarrative never called", async () => {
    const spy = vi.spyOn(feedbackManager, "getCompetencyNarrative");
    const request = appRequest("https://example.test/api/feedback-requests/not-a-uuid", {
      method: "GET",
      token: appToken,
    });
    const response = await getCompetencyNarrativeRoute(request, {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(data.error.message).not.toMatch(/invalid input syntax/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("PATCH /api/feedback-requests/[id]/evaluators: missing app token -> 401 unauthorized, updateRequestEvaluators never called", async () => {
    const spy = vi.spyOn(feedbackManager, "updateRequestEvaluators");
    const request = appRequest(`https://example.test/api/feedback-requests/${DUMMY_ID}/evaluators`, {
      method: "PATCH",
      token: null,
      csrf: true,
      body: { inviteeMemberIds: [] },
    });
    const response = await updateRequestEvaluatorsRoute(request, {
      params: Promise.resolve({ id: DUMMY_ID }),
    });

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("PATCH /api/feedback-requests/[id]/evaluators: valid token, missing CSRF header -> 403 forbidden, updateRequestEvaluators never called", async () => {
    const spy = vi.spyOn(feedbackManager, "updateRequestEvaluators");
    const request = appRequest(`https://example.test/api/feedback-requests/${DUMMY_ID}/evaluators`, {
      method: "PATCH",
      token: appToken,
      csrf: false,
      body: { inviteeMemberIds: [] },
    });
    const response = await updateRequestEvaluatorsRoute(request, {
      params: Promise.resolve({ id: DUMMY_ID }),
    });

    expect(response.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("PATCH /api/feedback-requests/[id]/evaluators: malformed id -> 422 validation_error, updateRequestEvaluators never called", async () => {
    const spy = vi.spyOn(feedbackManager, "updateRequestEvaluators");
    const request = appRequest("https://example.test/api/feedback-requests/not-a-uuid/evaluators", {
      method: "PATCH",
      token: appToken,
      csrf: true,
      body: { inviteeMemberIds: [] },
    });
    const response = await updateRequestEvaluatorsRoute(request, {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(data.error.message).not.toMatch(/invalid input syntax/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/feedback-requests/[id]/cancel: missing app token -> 401 unauthorized, cancelRequest never called", async () => {
    const spy = vi.spyOn(feedbackManager, "cancelRequest");
    const request = appRequest(`https://example.test/api/feedback-requests/${DUMMY_ID}/cancel`, {
      method: "POST",
      token: null,
      csrf: true,
    });
    const response = await cancelRequestRoute(request, { params: Promise.resolve({ id: DUMMY_ID }) });

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/feedback-requests/[id]/cancel: valid token, missing CSRF header -> 403 forbidden, cancelRequest never called", async () => {
    const spy = vi.spyOn(feedbackManager, "cancelRequest");
    const request = appRequest(`https://example.test/api/feedback-requests/${DUMMY_ID}/cancel`, {
      method: "POST",
      token: appToken,
      csrf: false,
    });
    const response = await cancelRequestRoute(request, { params: Promise.resolve({ id: DUMMY_ID }) });

    expect(response.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/feedback-requests/[id]/cancel: malformed id -> 422 validation_error, cancelRequest never called", async () => {
    const spy = vi.spyOn(feedbackManager, "cancelRequest");
    const request = appRequest("https://example.test/api/feedback-requests/not-a-uuid/cancel", {
      method: "POST",
      token: appToken,
      csrf: true,
    });
    const response = await cancelRequestRoute(request, { params: Promise.resolve({ id: "not-a-uuid" }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(data.error.message).not.toMatch(/invalid input syntax/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/feedback-requests/[id]/close: missing app token -> 401 unauthorized, closeRequest never called", async () => {
    const spy = vi.spyOn(feedbackManager, "closeRequest");
    const request = appRequest(`https://example.test/api/feedback-requests/${DUMMY_ID}/close`, {
      method: "POST",
      token: null,
      csrf: true,
    });
    const response = await closeRequestRoute(request, { params: Promise.resolve({ id: DUMMY_ID }) });

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/feedback-requests/[id]/close: valid token, missing CSRF header -> 403 forbidden, closeRequest never called", async () => {
    const spy = vi.spyOn(feedbackManager, "closeRequest");
    const request = appRequest(`https://example.test/api/feedback-requests/${DUMMY_ID}/close`, {
      method: "POST",
      token: appToken,
      csrf: false,
    });
    const response = await closeRequestRoute(request, { params: Promise.resolve({ id: DUMMY_ID }) });

    expect(response.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/feedback-requests/[id]/close: malformed id -> 422 validation_error, closeRequest never called", async () => {
    const spy = vi.spyOn(feedbackManager, "closeRequest");
    const request = appRequest("https://example.test/api/feedback-requests/not-a-uuid/close", {
      method: "POST",
      token: appToken,
      csrf: true,
    });
    const response = await closeRequestRoute(request, { params: Promise.resolve({ id: "not-a-uuid" }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(data.error.message).not.toMatch(/invalid input syntax/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Malformed body -> 422 validation_error before calling the manager (Always
// boundary), one representative case per body-taking route.
// ---------------------------------------------------------------------------

describe("malformed request body -- manager is never invoked", () => {
  test("POST /api/feedback-requests: inviteeMemberIds not an array of strings -> 422 validation_error, createRequest never called", async () => {
    const spy = vi.spyOn(feedbackManager, "createRequest");
    const request = appRequest("https://example.test/api/feedback-requests", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { inviteeMemberIds: "not-an-array" },
    });
    const response = await createRequestRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/feedback-requests: inviteeMemberIds contains a malformed uuid -> 422 validation_error, createRequest never called", async () => {
    const spy = vi.spyOn(feedbackManager, "createRequest");
    const request = appRequest("https://example.test/api/feedback-requests", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { inviteeMemberIds: ["not-a-uuid"] },
    });
    const response = await createRequestRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(data.error.message).not.toMatch(/invalid input syntax/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/feedback-requests: malformed JSON -> 422 validation_error, createRequest never called", async () => {
    const spy = vi.spyOn(feedbackManager, "createRequest");
    const request = new Request("https://example.test/api/feedback-requests", {
      method: "POST",
      headers: {
        cookie: `${APP_TOKEN_COOKIE}=${appToken}`,
        [CSRF_HEADER]: "1",
        "content-type": "application/json",
      },
      body: "{not valid json",
    });
    const response = await createRequestRoute(request);

    expect(response.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/feedback-requests: subtype out of enum -> 422 validation_error, createRequest never called", async () => {
    const spy = vi.spyOn(feedbackManager, "createRequest");
    const request = appRequest("https://example.test/api/feedback-requests", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { inviteeMemberIds: [], subtype: "not-a-real-subtype" },
    });
    const response = await createRequestRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/feedback-requests/individual: inviteeEmails not an array of strings -> 422 validation_error, createIndividualRequest never called", async () => {
    const spy = vi.spyOn(feedbackManager, "createIndividualRequest");
    const request = appRequest("https://example.test/api/feedback-requests/individual", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { inviteeEmails: "not-an-array" },
    });
    const response = await createIndividualRequestRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/feedback-requests/individual: subtype out of enum -> 422 validation_error, createIndividualRequest never called", async () => {
    const spy = vi.spyOn(feedbackManager, "createIndividualRequest");
    const request = appRequest("https://example.test/api/feedback-requests/individual", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { inviteeEmails: [], subtype: "not-a-real-subtype" },
    });
    const response = await createIndividualRequestRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("PATCH /api/feedback-requests/[id]/evaluators: inviteeMemberIds missing -> 422 validation_error, updateRequestEvaluators never called", async () => {
    const spy = vi.spyOn(feedbackManager, "updateRequestEvaluators");
    const request = appRequest(`https://example.test/api/feedback-requests/${DUMMY_ID}/evaluators`, {
      method: "PATCH",
      token: appToken,
      csrf: true,
      body: {},
    });
    const response = await updateRequestEvaluatorsRoute(request, {
      params: Promise.resolve({ id: DUMMY_ID }),
    });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Happy-path / validation-error fixture chain -- one fresh demo company via
// scripts/seed-demo-company.mjs (8 employees), same technique as Story
// 3.14's suite. Every ad-hoc feedback request/response actually under test
// is built directly through the real route handlers/RPCs under test, never
// through the seed script (whose own fixture-building only ever touches
// the 360-cycle flow).
// ---------------------------------------------------------------------------

type SeededEmployee = { email: string; token: string; id: string };

let employees: SeededEmployee[]; // all 8 seeded employees, logged in

const runId = Date.now();

function inviteesExcluding(requesterId: string, count = 5): string[] {
  return employees
    .filter((e) => e.id !== requesterId)
    .slice(0, count)
    .map((e) => e.id);
}

beforeAll(async () => {
  const companyName = `Route Test Feedback ${runId}`;
  let seedOutput: string;
  try {
    seedOutput = execFileSync("node", [path.join("scripts", "seed-demo-company.mjs"), companyName, "8"], {
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
  const supervisorEmail = supervisorMatch[1];
  const supervisorToken = await login(supervisorEmail, PASSWORD);

  const employeeEmails: string[] = [];
  const lineRe = /^ {2}- .+ <([^>]+)> — .+ — 360: .+$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(seedOutput))) {
    employeeEmails.push(m[1]);
  }
  if (employeeEmails.length < 8) {
    throw new Error(
      `seed-demo-company.mjs no produjo los 8 empleados esperados (obtuvo ${employeeEmails.length}). ` +
        `Salida completa:\n${seedOutput}`
    );
  }

  const memberRows = (await restGet(
    `members?select=id,email&email=in.(${employeeEmails.join(",")},${supervisorEmail})`,
    supervisorToken
  )) as { id: string; email: string }[];
  const idByEmail = Object.fromEntries(memberRows.map((r) => [r.email, r.id]));

  employees = await Promise.all(
    employeeEmails.map(async (email) => ({
      email,
      token: await login(email, PASSWORD),
      id: idByEmail[email],
    }))
  );
});

describe("POST /api/feedback-requests -> feedbackManager.createRequest", () => {
  test("as an employee, valid body (>= 5 invitees) -> 201 { requestId }", async () => {
    const requester = employees[0];
    const inviteeIds = inviteesExcluding(requester.id, 5);

    actingAs(requester.token);
    const request = appRequest("https://example.test/api/feedback-requests", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { inviteeMemberIds: inviteeIds },
    });
    const response = await createRequestRoute(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.requestId).toMatch(UUID_RE);
  });

  test("RPC rejects (< 5 invitees) -> 422 validation_error, create_ad_hoc_feedback_request's own exact message", async () => {
    // A fresh requester with no open ad_hoc request yet -- the RPC's
    // "already have one open" check runs BEFORE the invitee-count check.
    const requester = employees[1];
    const inviteeIds = inviteesExcluding(requester.id, 2);

    actingAs(requester.token);
    const request = appRequest("https://example.test/api/feedback-requests", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { inviteeMemberIds: inviteeIds },
    });
    const response = await createRequestRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    // Recorded verbatim from create_ad_hoc_feedback_request's raised
    // exception (see tests/characterization/feedback-manager.test.ts).
    expect(data).toEqual({
      error: { code: "validation_error", message: "Tienes que invitar al menos a 5 personas." },
    });
  });
});

describe("POST /api/feedback-requests/individual -> feedbackManager.createIndividualRequest", () => {
  test("as a fresh individual account, valid body -> 201 { requestId }", async () => {
    const email = `individual-a-route-${runId}@brujula-fake.test`;
    const individualToken = await createFreshIndividualAccount(email);

    const emails = ["ev1", "ev2", "ev3", "ev4", "ev5"].map((n) => `${n}-route-${runId}@brujula-fake.test`);

    actingAs(individualToken);
    const request = appRequest("https://example.test/api/feedback-requests/individual", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { inviteeEmails: emails },
    });
    const response = await createIndividualRequestRoute(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.requestId).toMatch(UUID_RE);
  });

  test("RPC rejects (malformed email) -> 422 validation_error, create_ad_hoc_feedback_request_for_individual's own exact message", async () => {
    const email = `individual-b-route-${runId}@brujula-fake.test`;
    const individualToken = await createFreshIndividualAccount(email);

    const emails = [
      `ev1-route-${runId}@brujula-fake.test`,
      `ev2-route-${runId}@brujula-fake.test`,
      `ev3-route-${runId}@brujula-fake.test`,
      `ev4-route-${runId}@brujula-fake.test`,
      "not-an-email",
    ];

    actingAs(individualToken);
    const request = appRequest("https://example.test/api/feedback-requests/individual", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { inviteeEmails: emails },
    });
    const response = await createIndividualRequestRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    // Recorded verbatim from create_ad_hoc_feedback_request_for_individual's
    // raised exception (see tests/characterization/feedback-manager.test.ts).
    expect(data).toEqual({
      error: { code: "validation_error", message: "Algún email no es válido." },
    });
  });
});

describe("PATCH /api/feedback-requests/[id]/evaluators -> feedbackManager.updateRequestEvaluators", () => {
  test("valid (open, zero-response request), new invitee list before any response -> 200 null", async () => {
    const requester = employees[7];
    const inviteeIds = inviteesExcluding(requester.id, 5);

    actingAs(requester.token);
    const createResponse = await createRequestRoute(
      appRequest("https://example.test/api/feedback-requests", {
        method: "POST",
        token: appToken,
        csrf: true,
        body: { inviteeMemberIds: inviteeIds },
      })
    );
    expect(createResponse.status).toBe(201);
    const { requestId } = await createResponse.json();

    const newInviteeIds = inviteesExcluding(requester.id, 6).slice(1);

    actingAs(requester.token);
    const request = appRequest(`https://example.test/api/feedback-requests/${requestId}/evaluators`, {
      method: "PATCH",
      token: appToken,
      csrf: true,
      body: { inviteeMemberIds: newInviteeIds },
    });
    const response = await updateRequestEvaluatorsRoute(request, { params: Promise.resolve({ id: requestId }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  test("RPC rejects (has responses) -> 422 validation_error, update_ad_hoc_feedback_request_evaluators's own exact message", async () => {
    const requester = employees[2];
    const inviteeIds = inviteesExcluding(requester.id, 5);

    actingAs(requester.token);
    const createResponse = await createRequestRoute(
      appRequest("https://example.test/api/feedback-requests", {
        method: "POST",
        token: appToken,
        csrf: true,
        body: { inviteeMemberIds: inviteeIds },
      })
    );
    expect(createResponse.status).toBe(201);
    const { requestId } = await createResponse.json();

    const invitee = employees.find((e) => e.id === inviteeIds[0])!;
    await respondAsEvaluator(invitee.token, requester.id);

    const newInviteeIds = inviteesExcluding(requester.id, 6).slice(1);

    actingAs(requester.token);
    const request = appRequest(`https://example.test/api/feedback-requests/${requestId}/evaluators`, {
      method: "PATCH",
      token: appToken,
      csrf: true,
      body: { inviteeMemberIds: newInviteeIds },
    });
    const response = await updateRequestEvaluatorsRoute(request, { params: Promise.resolve({ id: requestId }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    // Recorded verbatim from update_ad_hoc_feedback_request_evaluators's
    // raised exception (see tests/characterization/feedback-manager.test.ts).
    expect(data).toEqual({
      error: { code: "validation_error", message: "No se puede modificar: ya hay respuestas." },
    });
  });
});

describe("GET /api/feedback-requests/[id] -> feedbackManager.getCompetencyNarrative", () => {
  let requester: SeededEmployee;
  let requestId: string;
  let invitees: SeededEmployee[];

  beforeAll(async () => {
    requester = employees[3];
    const inviteeIds = inviteesExcluding(requester.id, 5);
    invitees = employees.filter((e) => inviteeIds.includes(e.id));
    expect(invitees).toHaveLength(5);

    actingAs(requester.token);
    const createResponse = await createRequestRoute(
      appRequest("https://example.test/api/feedback-requests", {
        method: "POST",
        token: appToken,
        csrf: true,
        body: { inviteeMemberIds: inviteeIds, subtype: "competencias" },
      })
    );
    expect(createResponse.status).toBe(201);
    ({ requestId } = await createResponse.json());

    // Below min_responses_to_reveal (3): only 2 of 5 invitees respond.
    await respondAsEvaluator(invitees[0].token, requester.id);
    await respondAsEvaluator(invitees[1].token, requester.id);
  });

  test("below threshold -> 200, [] (the RPC's own early-return, no partial content)", async () => {
    actingAs(requester.token);
    const request = appRequest(`https://example.test/api/feedback-requests/${requestId}`, {
      method: "GET",
      token: appToken,
    });
    const response = await getCompetencyNarrativeRoute(request, { params: Promise.resolve({ id: requestId }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  test("non-requester caller -> 422 validation_error, get_request_competency_narrative's own exact access-control message", async () => {
    // One of the request's own invitees -- a real participant, but never
    // the requester itself, which is the only caller this RPC allows.
    actingAs(invitees[0].token);
    const request = appRequest(`https://example.test/api/feedback-requests/${requestId}`, {
      method: "GET",
      token: appToken,
    });
    const response = await getCompetencyNarrativeRoute(request, { params: Promise.resolve({ id: requestId }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data).toEqual({
      error: { code: "validation_error", message: "No tienes acceso a esta solicitud." },
    });
  });

  test("in-process vs over HTTP, identical seeded state -> identical results, including below-threshold []", async () => {
    actingAs(requester.token);
    const inProcessResult = await feedbackManager.getCompetencyNarrative(requestId);

    actingAs(requester.token);
    const request = appRequest(`https://example.test/api/feedback-requests/${requestId}`, {
      method: "GET",
      token: appToken,
    });
    const response = await getCompetencyNarrativeRoute(request, { params: Promise.resolve({ id: requestId }) });
    const httpResult = await response.json();

    expect(inProcessResult).toEqual([]);
    expect(httpResult).toEqual(inProcessResult);
  });
});

describe("GET /api/feedback-requests/pending-invitations -> feedbackManager.getMyPendingInvitations", () => {
  test("as an invitee with a pending invitation -> 200, array including that invitation", async () => {
    const requester = employees[4];
    const inviteeIds = inviteesExcluding(requester.id, 5);
    const invitees = employees.filter((e) => inviteeIds.includes(e.id));
    expect(invitees).toHaveLength(5);

    actingAs(requester.token);
    const createResponse = await createRequestRoute(
      appRequest("https://example.test/api/feedback-requests", {
        method: "POST",
        token: appToken,
        csrf: true,
        body: { inviteeMemberIds: inviteeIds },
      })
    );
    expect(createResponse.status).toBe(201);

    // None of this fresh request's invitees have responded yet -- any of
    // them has a pending (unused) invitation from this requester.
    const unresponded = invitees[0];

    actingAs(unresponded.token);
    const request = appRequest("https://example.test/api/feedback-requests/pending-invitations", {
      method: "GET",
      token: appToken,
    });
    const response = await pendingInvitationsRoute(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    const row = data.find((r: { requesterMemberId: string }) => r.requesterMemberId === requester.id);
    expect(row).toBeDefined();
    expect(row.token).toBeTruthy();
    expect(row.requesterEmail).toBe(requester.email);
    expect(typeof row.createdAt).toBe("string");
    // Ad-hoc invitations never set this column (see
    // tests/characterization/feedback-manager.test.ts).
    expect(row.evaluatorCategory).toBeNull();

    // In-process vs over HTTP parity, same seeded state.
    actingAs(unresponded.token);
    const inProcessRows = await feedbackManager.getMyPendingInvitations();
    expect(data).toEqual(inProcessRows);
  });
});

describe("POST /api/feedback-requests/[id]/cancel -> feedbackManager.cancelRequest", () => {
  test("valid (open, zero-response request) -> 200 null; status becomes 'closed'", async () => {
    const requester = employees[5];
    const inviteeIds = inviteesExcluding(requester.id, 5);

    actingAs(requester.token);
    const createResponse = await createRequestRoute(
      appRequest("https://example.test/api/feedback-requests", {
        method: "POST",
        token: appToken,
        csrf: true,
        body: { inviteeMemberIds: inviteeIds },
      })
    );
    expect(createResponse.status).toBe(201);
    const { requestId } = await createResponse.json();

    actingAs(requester.token);
    const request = appRequest(`https://example.test/api/feedback-requests/${requestId}/cancel`, {
      method: "POST",
      token: appToken,
      csrf: true,
    });
    const response = await cancelRequestRoute(request, { params: Promise.resolve({ id: requestId }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();

    const rows = (await restGet(
      `feedback_requests?select=status&id=eq.${requestId}`,
      requester.token
    )) as { status: string }[];
    expect(rows[0].status).toBe("closed");
  });
});

describe("POST /api/feedback-requests/[id]/close -> feedbackManager.closeRequest", () => {
  test("valid (open, zero-response request) -> 200 null; then a second close -> 422 validation_error, close_ad_hoc_feedback_request's own exact message", async () => {
    const requester = employees[6];
    const inviteeIds = inviteesExcluding(requester.id, 5);

    actingAs(requester.token);
    const createResponse = await createRequestRoute(
      appRequest("https://example.test/api/feedback-requests", {
        method: "POST",
        token: appToken,
        csrf: true,
        body: { inviteeMemberIds: inviteeIds },
      })
    );
    expect(createResponse.status).toBe(201);
    const { requestId } = await createResponse.json();

    actingAs(requester.token);
    const firstClose = await closeRequestRoute(
      appRequest(`https://example.test/api/feedback-requests/${requestId}/close`, {
        method: "POST",
        token: appToken,
        csrf: true,
      }),
      { params: Promise.resolve({ id: requestId }) }
    );
    expect(firstClose.status).toBe(200);
    expect(await firstClose.json()).toBeNull();

    actingAs(requester.token);
    const secondClose = await closeRequestRoute(
      appRequest(`https://example.test/api/feedback-requests/${requestId}/close`, {
        method: "POST",
        token: appToken,
        csrf: true,
      }),
      { params: Promise.resolve({ id: requestId }) }
    );

    expect(secondClose.status).toBe(422);
    const data = await secondClose.json();
    expect(data).toEqual({
      error: { code: "validation_error", message: "Esta solicitud ya no está abierta." },
    });
  });
});
