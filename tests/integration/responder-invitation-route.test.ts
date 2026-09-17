// Story 3.21 (_bmad-output/implementation-artifacts/
// spec-3-21-responder-invitation-route-handlers-client-fetch-integration.md):
// exercises every row of the spec's I/O & Edge-Case Matrix by calling the
// exported Route Handler functions directly with constructed `Request`s,
// mirroring tests/integration/cycles-route.test.ts's shape (Story 3.9).
// Unlike that file, no `signAppToken()`/app-token cookie construction is
// needed to gate any of these routes -- this domain never calls
// requireApiToken()/requireAuthorizedRequest() at all (AD-7/FR4). A signed
// app token is still built and attached to some requests below, but only to
// prove the opposite: that it has zero bearing on this domain's routes,
// per this story's own frozen Intent and the epics.md AC these tests exist
// to satisfy.
//
// What's real: every route handler under test, responderManager, its
// src/server/db/responder.ts functions, and every Postgres RPC underneath,
// run against the local `supabase start` instance. What's mocked, and why:
// only `@/lib/supabase/server`, same as cycles-route.test.ts -- but with an
// added genuinely-anonymous mode (`actingAsAnon()`, no Authorization
// override at all), mirroring tests/characterization/
// responder-invitation.test.ts's own established technique, since several
// scenarios here (an anonymous responder, an unauthenticated
// /invitacion/[token] fetch) must run with no session at all rather than
// "as some already-authenticated user".

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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

const acting = vi.hoisted(() => ({ token: null as string | null, initialized: false }));

function actingAs(token: string) {
  acting.token = token;
  acting.initialized = true;
}

/** No session at all -- the individual/email-invite responder's actual
 * situation, and /invitacion/[token]'s own always-anonymous fetch. The
 * resulting client sends no Authorization override, so @supabase/supabase-js
 * falls back to the anon key itself, landing the call on Postgres's `anon`
 * role -- same technique tests/characterization/responder-invitation.test.ts
 * already established. */
function actingAsAnon() {
  acting.token = null;
  acting.initialized = true;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async (): Promise<SupabaseClient> => {
    if (!acting.initialized) {
      throw new Error(
        "test bug: actingAs(token)/actingAsAnon() must be called before invoking a route handler"
      );
    }
    return createSupabaseJsClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: acting.token ? { headers: { Authorization: `Bearer ${acting.token}` } } : {},
    });
  },
}));

// Imported after the mock above is declared (Vitest hoists `vi.mock` to the
// top of the module regardless of source order) so every route file's own
// import of responderManager (via @/server/db/responder's own import of
// @/lib/supabase/server) picks up the mocked client factory.
import * as responderManager from "@/server/managers/responderManager";

import { GET as getContextRoute } from "@/app/api/responder/[token]/route";
import { POST as submitRoute } from "@/app/api/responder/[token]/submit/route";
import { GET as getInviteDetailsRoute } from "@/app/api/invitacion/[token]/route";

import { APP_TOKEN_COOKIE, signAppToken } from "@/server/shared/auth";

// ---------------------------------------------------------------------------
// Small REST/RPC/auth helpers -- same anon-key-only pattern as
// scripts/seed-*.mjs and Stories 3.3/3.7/3.8/3.9/3.19's suites.
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

/**
 * Builds a constructed `Request` carrying, optionally, the app-token
 * cookie -- used deliberately in some scenarios below to prove it has zero
 * bearing on this domain's routes (per this story's frozen Intent), unlike
 * every other domain's own `appRequest()` helper (cycles-route.test.ts),
 * where the same cookie is the actual gate under test.
 */
function tokenRequest(
  url: string,
  init: { method?: string; appToken?: string | null; body?: unknown } = {}
): Request {
  const headers = new Headers();
  if (init.appToken) {
    headers.set("cookie", `${APP_TOKEN_COOKIE}=${init.appToken}`);
  }
  let body: string | undefined;
  if (init.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.body);
  }
  return new Request(url, { method: init.method ?? "GET", headers, body });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A single valid app token (Story 1.4), reused across the requests below
// that deliberately carry it to prove it's inert on this domain's routes.
let appToken: string;

beforeAll(() => {
  appToken = signAppToken("responder-route-test-user");
});

beforeEach(() => {
  acting.token = null;
  acting.initialized = false;
});

afterAll(() => {
  acting.token = null;
  acting.initialized = false;
});

// ---------------------------------------------------------------------------
// Structural check (Code Map): a grep-based static check that this domain's
// route files never import requireAuthorizedRequest()/requireApiToken()/
// CSRF_HEADER at all -- the one structural deviation this story extends
// from responderManager (Story 3.20) to the route layer (AD-7/FR4).
// ---------------------------------------------------------------------------

/** Strips line comments and block comments before the grep-based check
 * below runs, so these route files' own doc comments (which name
 * requireApiToken()/requireAuthorizedRequest() in prose, explaining exactly
 * why they're absent) don't produce a false positive -- only actual code
 * (an import or a call) should fail this check. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("structural: this domain's routes never gate on requireApiToken/CSRF", () => {
  test("route source files never import or call requireAuthorizedRequest, requireApiToken or CSRF_HEADER", () => {
    const files = [
      "src/app/api/responder/[token]/route.ts",
      "src/app/api/responder/[token]/submit/route.ts",
      "src/app/api/invitacion/[token]/route.ts",
    ];
    for (const relPath of files) {
      const contents = readFileSync(path.join(REPO_ROOT, relPath), "utf8");
      const code = stripComments(contents);
      expect(code).not.toMatch(/requireAuthorizedRequest|requireApiToken|CSRF_HEADER/);
    }
  });
});

// ---------------------------------------------------------------------------
// Malformed [token] path segment -- every route's isValidUuid() guard,
// manager never invoked.
// ---------------------------------------------------------------------------

describe("malformed [token] path segment -- manager is never invoked", () => {
  test("GET /api/responder/[token]: non-UUID token -> 422 validation_error, getContext never called", async () => {
    const spy = vi.spyOn(responderManager, "getContext");
    actingAsAnon();
    const response = await getContextRoute(tokenRequest("https://example.test/api/responder/not-a-uuid"), {
      params: Promise.resolve({ token: "not-a-uuid" }),
    });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/responder/[token]/submit: non-UUID token -> 422 validation_error, submitResponse never called", async () => {
    const spy = vi.spyOn(responderManager, "submitResponse");
    actingAsAnon();
    const response = await submitRoute(
      tokenRequest("https://example.test/api/responder/not-a-uuid/submit", {
        method: "POST",
        body: { answers: [] },
      }),
      { params: Promise.resolve({ token: "not-a-uuid" }) }
    );

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("GET /api/invitacion/[token]: non-UUID token -> 422 validation_error, getInviteDetails never called", async () => {
    const spy = vi.spyOn(responderManager, "getInviteDetails");
    actingAsAnon();
    const response = await getInviteDetailsRoute(
      tokenRequest("https://example.test/api/invitacion/not-a-uuid"),
      { params: Promise.resolve({ token: "not-a-uuid" }) }
    );

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Malformed body -- POST /api/responder/[token]/submit only (the sole
// body-taking route in this domain).
// ---------------------------------------------------------------------------

describe("POST /api/responder/[token]/submit: malformed body -- manager is never invoked", () => {
  test("answers is not an array -> 422 validation_error, submitResponse never called", async () => {
    const spy = vi.spyOn(responderManager, "submitResponse");
    actingAsAnon();
    const response = await submitRoute(
      tokenRequest(`https://example.test/api/responder/${randomUUID()}/submit`, {
        method: "POST",
        body: { answers: "not-an-array" },
      }),
      { params: Promise.resolve({ token: randomUUID() }) }
    );

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("malformed JSON body -> 422 validation_error, submitResponse never called", async () => {
    const spy = vi.spyOn(responderManager, "submitResponse");
    actingAsAnon();
    const request = new Request(`https://example.test/api/responder/${randomUUID()}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not valid json",
    });
    const response = await submitRoute(request, { params: Promise.resolve({ token: randomUUID() }) });

    expect(response.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Fixture: one fresh demo company via scripts/seed-demo-company.mjs, plus a
// peer ad_hoc feedback request built directly through the real RPC under
// test (create_ad_hoc_feedback_request), same technique tests/
// characterization/responder-invitation.test.ts already established --
// >= 5 invitees needed for that RPC's own min-invitees guard.
// ---------------------------------------------------------------------------

type SeededEmployee = { email: string; token: string; id: string };

let supervisorToken: string;
let departmentId: string;
let employees: SeededEmployee[];

let peerRequester: SeededEmployee;
let peerInvitees: SeededEmployee[];
let peerInvitationTokenById: Record<string, string>;

const runId = Date.now();
const companyName = `Route Test Responder ${runId}`;

beforeAll(async () => {
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
  supervisorToken = await login(supervisorEmail, PASSWORD);

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

  const departments = (await restGet("departments?select=id&limit=1", supervisorToken)) as { id: string }[];
  departmentId = departments[0].id;

  peerRequester = employees[0];
  const peerInviteeIds = employees
    .filter((e) => e.id !== peerRequester.id)
    .slice(0, 5)
    .map((e) => e.id);
  peerInvitees = employees.filter((e) => peerInviteeIds.includes(e.id));
  const peerRequestId = (await callRpc("create_ad_hoc_feedback_request", peerRequester.token, {
    p_invitee_member_ids: peerInviteeIds,
  })) as string;

  const invitationRows = (await restGet(
    `feedback_invitations?select=token,invitee_member_id&feedback_request_id=eq.${peerRequestId}`,
    peerRequester.token
  )) as { token: string; invitee_member_id: string }[];
  peerInvitationTokenById = Object.fromEntries(invitationRows.map((r) => [r.invitee_member_id, r.token]));
});

// ---------------------------------------------------------------------------
// GET /api/responder/[token] -- matrix rows: invalid/bogus token with no
// app token at all, valid app token present but bogus path token, member
// invite not logged in. Together these two directly satisfy epics.md's AC:
// a valid invitation token needs no app token to be accepted, and a valid
// app token cannot substitute for a missing/invalid invitation token.
// ---------------------------------------------------------------------------

describe("GET /api/responder/[token] -> responderManager.getContext", () => {
  test("invalid/bogus token, no cookies at all -> 200 {valid: false} (never gated by requireApiToken)", async () => {
    actingAsAnon();
    const bogusToken = randomUUID();
    const response = await getContextRoute(
      tokenRequest(`https://example.test/api/responder/${bogusToken}`, { appToken: null }),
      { params: Promise.resolve({ token: bogusToken }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: false });
  });

  test("valid app token present but path token bogus -> 200 {valid: false} (the app token is not interchangeable with the invitation token)", async () => {
    actingAsAnon();
    const bogusToken = randomUUID();
    const response = await getContextRoute(
      tokenRequest(`https://example.test/api/responder/${bogusToken}`, { appToken }),
      { params: Promise.resolve({ token: bogusToken }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: false });
  });

  test("member invite, not logged in -> 200 {valid: false, requiresLogin: true}", async () => {
    const invitee = peerInvitees[0];
    const token = peerInvitationTokenById[invitee.id];

    actingAsAnon();
    const response = await getContextRoute(
      tokenRequest(`https://example.test/api/responder/${token}`, { appToken: null }),
      { params: Promise.resolve({ token }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: false, requiresLogin: true });
  });

  test("valid unused, correct login -> 200 full context, is-process vs over-HTTP results are identical", async () => {
    const invitee = peerInvitees[0];
    const token = peerInvitationTokenById[invitee.id];

    actingAs(invitee.token);
    const inProcess = await responderManager.getContext(token);

    actingAs(invitee.token);
    const response = await getContextRoute(
      tokenRequest(`https://example.test/api/responder/${token}`, { appToken: null }),
      { params: Promise.resolve({ token }) }
    );
    expect(response.status).toBe(200);
    const overHttp = await response.json();

    expect(overHttp).toEqual(inProcess);
    expect(overHttp.valid).toBe(true);
    expect(overHttp.used).toBe(false);
    expect(Array.isArray(overHttp.questions)).toBe(true);
    expect(overHttp.questions.length).toBeGreaterThan(0);
  });

  test("logged in as a different peer member (not the invitation's own invitee, not anonymous) -> 200 {valid: false, requiresLogin: true}", async () => {
    // Per get_responder_context (supabase/migrations/0061_saboteadores.sql:
    // "if invitee.auth_user_id is distinct from auth.uid() then return
    // jsonb_build_object('valid', false, 'requires_login', true)"), the RPC
    // only checks whether the caller is logged in as this specific invitee
    // -- being logged in as some *other* real member gets exactly the same
    // {valid: false, requiresLogin: true} as being logged out entirely.
    const invitee = peerInvitees[3];
    const impostor = peerInvitees[4];
    const token = peerInvitationTokenById[invitee.id];

    actingAs(impostor.token);
    const response = await getContextRoute(
      tokenRequest(`https://example.test/api/responder/${token}`, { appToken: null }),
      { params: Promise.resolve({ token }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: false, requiresLogin: true });
  });
});

// ---------------------------------------------------------------------------
// POST /api/responder/[token]/submit -- the one mutating route. Accepted
// with no app token and no CSRF header at all (the AC's other half), and
// the RPC-rejects error path mapping to 422 with the RPC's own message.
// ---------------------------------------------------------------------------

describe("POST /api/responder/[token]/submit -> responderManager.submitResponse", () => {
  test("valid, no app token, no CSRF header -> 200 { responseId } -- accepted", async () => {
    const invitee = peerInvitees[0];
    const token = peerInvitationTokenById[invitee.id];

    // Same fixture invitee as the "valid unused, correct login" context
    // test above -- still unused at this point in the suite (that test only
    // reads the context, never submits).
    actingAs(invitee.token);
    const ctx = await responderManager.getContext(token);
    expect(ctx.valid, "invitation must still be unused").toBe(true);
    expect(ctx.used).toBe(false);

    // default_open_feedback template -- every question is type 'open' (see
    // tests/characterization/responder-invitation.test.ts's own recorded
    // note), so a plain answerText per question is a complete, valid
    // submission.
    const answers = ctx.questions!.map((q) => ({
      questionId: q.id,
      answerText: "Respuesta de prueba (route integration).",
    }));

    actingAs(invitee.token);
    const request = tokenRequest(`https://example.test/api/responder/${token}/submit`, {
      method: "POST",
      appToken: null,
      body: { answers },
    });
    // No x-brujula-csrf header set anywhere above -- deliberately, per this
    // story's frozen Intent: this mutating route requires none.
    expect(request.headers.has("x-brujula-csrf")).toBe(false);

    const response = await submitRoute(request, { params: Promise.resolve({ token }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.responseId).toMatch(UUID_RE);

    const rows = (await restGet(
      `feedback_invitations?select=used_at&token=eq.${token}`,
      invitee.token
    )) as { used_at: string | null }[];
    expect(rows[0].used_at).not.toBeNull();
  });

  test("RPC rejects (bogus token) -> 422 validation_error, submit_feedback_response's own exact message", async () => {
    const bogusToken = randomUUID();

    actingAsAnon();
    const request = tokenRequest(`https://example.test/api/responder/${bogusToken}/submit`, {
      method: "POST",
      appToken: null,
      body: { answers: [] },
    });
    const response = await submitRoute(request, { params: Promise.resolve({ token: bogusToken }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    // Recorded verbatim from submit_feedback_response's raised exception,
    // same message tests/characterization/responder-invitation.test.ts
    // already pinned (supabase/migrations/0061_saboteadores.sql).
    expect(data).toEqual({
      error: { code: "validation_error", message: "Invitación no válida o ya utilizada." },
    });
  });

  test("logged in as a different peer member (not the invitation's own invitee, not anonymous) -> 422 validation_error, submit_feedback_response's own exact identity-mismatch message", async () => {
    // Per submit_feedback_response (supabase/migrations/
    // 0061_saboteadores.sql: "if invitee.auth_user_id is distinct from
    // auth.uid() then raise exception 'Esta invitación no corresponde a tu
    // usuario.'"), this is the session-substitution case a CSRF-header-free
    // mutating route most needs direct evidence against: a *different*,
    // real, logged-in peer's own session cannot submit on another
    // invitee's invitation token. The RPC raises before touching
    // feedback_invitations.used_at, so this invitee's invitation is left
    // untouched for any later test.
    const invitee = peerInvitees[3];
    const impostor = peerInvitees[4];
    const token = peerInvitationTokenById[invitee.id];

    actingAs(impostor.token);
    const request = tokenRequest(`https://example.test/api/responder/${token}/submit`, {
      method: "POST",
      appToken: null,
      body: { answers: [] },
    });
    const response = await submitRoute(request, { params: Promise.resolve({ token }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data).toEqual({
      error: { code: "validation_error", message: "Esta invitación no corresponde a tu usuario." },
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/invitacion/[token] -- always fetched anonymously (matches
// src/app/invitacion/[token]/page.tsx, unmodified by this story).
// ---------------------------------------------------------------------------

describe("GET /api/invitacion/[token] -> responderManager.getInviteDetails", () => {
  test("valid member invite -> 200, array with { valid: true } row", async () => {
    const email = `invited-route-${runId}@brujula-fake.test`;
    const inviteToken = (await callRpc("invite_member", supervisorToken, {
      p_email: email,
      p_full_name: "Invitado Route",
      p_department_id: departmentId,
    })) as string;

    actingAsAnon();
    const inProcess = await responderManager.getInviteDetails(inviteToken);

    actingAsAnon();
    const response = await getInviteDetailsRoute(
      tokenRequest(`https://example.test/api/invitacion/${inviteToken}`),
      { params: Promise.resolve({ token: inviteToken }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual(inProcess);
    expect(data).toEqual([
      { organizationName: companyName, email, fullName: "Invitado Route", valid: true },
    ]);
  });

  test("bogus token -> 200, []", async () => {
    actingAsAnon();
    const response = await getInviteDetailsRoute(
      tokenRequest(`https://example.test/api/invitacion/${randomUUID()}`),
      { params: Promise.resolve({ token: randomUUID() }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
