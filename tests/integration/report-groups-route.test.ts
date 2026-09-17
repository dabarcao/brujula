// Story 1.5 (_bmad-output/implementation-artifacts/
// spec-1-5-report-groups-route-handler-and-client-fetch-wrapper.md):
// exercises every row of the spec's I/O & Edge-Case Matrix by calling the
// exported Route Handler functions directly with constructed `Request`s
// (node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
// confirms Route Handlers are plain exported async functions -- no dev
// server needed), plus src/lib/api/client.ts's apiFetch()/ApiError against a
// stubbed global fetch.
//
// Same mocking shape as Story 1.2's tests/characterization/
// report-groups-manager.test.ts: only @/lib/supabase/server's createClient
// is mocked (acting-as a real logged-in Supabase user against the local
// `supabase start` instance), so every RPC the route -> manager -> db chain
// calls is real. requireApiToken (Story 1.4) is exercised for real too --
// its own APP_TOKEN_SECRET-signed tokens (signAppToken) are used to build
// each request's `brujula_app_token` cookie.

import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
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
// Hard boundary carried over from Stories 1.1/1.2: never run this suite
// against a remote Supabase project, dev or production -- only the local
// CLI instance.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(SUPABASE_URL)) {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL (${SUPABASE_URL}) no es la instancia local de \`supabase start\`. ` +
      "Estos tests nunca deben correr contra un proyecto remoto."
  );
}

// ---------------------------------------------------------------------------
// Mocks -- identical shape to tests/characterization/report-groups-manager.test.ts.
// requireApiToken/signAppToken (Story 1.4) are NOT mocked: this suite uses
// real signed tokens throughout.
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
// import of the manager (and the manager's own import of @/lib/supabase/server
// via @/server/db/*) picks up the mocked client factory.
import * as reportGroupsManager from "@/server/managers/reportGroupsManager";
import { POST as createGroupRoute } from "@/app/api/report-groups/route";
import { GET as getGroupRoute } from "@/app/api/report-groups/[id]/route";
import { POST as respondRoute } from "@/app/api/report-groups/[id]/respond/route";
import { POST as closeRoute } from "@/app/api/report-groups/[id]/close/route";
import { GET as summaryRoute } from "@/app/api/report-groups/[id]/summary/route";
import { APP_TOKEN_COOKIE, CSRF_HEADER, signAppToken } from "@/server/shared/auth";
import { apiFetch, ApiError } from "@/lib/api/client";

// ---------------------------------------------------------------------------
// Small REST helpers -- same anon-key-only pattern as scripts/seed-*.mjs and
// Stories 1.1/1.2's suites; used only for setup/assertions, never as the
// thing under test.
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

const GROUP_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Builds a constructed `Request` carrying (optionally) the app-token cookie
 * and/or the anti-CSRF header, per Story 1.4's requireApiToken() contract.
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

// ---------------------------------------------------------------------------
// Fixture: one fresh demo company per test run, same seed script/shape as
// Story 1.2's suite so results are directly comparable.
// ---------------------------------------------------------------------------

type SeededEmployee = { email: string; bucketLabel: string };

let supervisorEmail: string;
let supervisorToken: string;
let eligibleEmployees: SeededEmployee[];
let eligibleTokens: string[];
let eligibleIds: string[];
let ineligibleId: string;
// A single app token (Story 1.4), reused across requests in this suite --
// requireApiToken() never resolves or threads its `sub` into the manager
// (per spec-1-4's own note), so which authenticated user it names doesn't
// affect any route's behavior.
let appToken: string;

beforeAll(async () => {
  const companyName = `Route Test RG ${Date.now()}`;
  let seedOutput: string;
  try {
    seedOutput = execFileSync("node", [path.join("scripts", "seed-demo-company.mjs"), companyName, "18"], {
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

  const employees: SeededEmployee[] = [];
  const lineRe = /^ {2}- .+ <([^>]+)> — .+ — 360: (.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(seedOutput))) {
    employees.push({ email: m[1], bucketLabel: m[2] });
  }

  eligibleEmployees = employees.filter((e) => e.bucketLabel === "cerrado");
  const ineligiblePool = employees.filter((e) => e.bucketLabel !== "cerrado");
  if (eligibleEmployees.length < 6 || ineligiblePool.length === 0) {
    throw new Error(
      "seed-demo-company.mjs no produjo suficientes empleados elegibles/inelegibles " +
        `(elegibles=${eligibleEmployees.length}, inelegibles=${ineligiblePool.length}). Salida completa:\n${seedOutput}`
    );
  }
  const ineligibleEmployee = ineligiblePool[0];

  supervisorToken = await login(supervisorEmail, PASSWORD);
  eligibleTokens = await Promise.all(eligibleEmployees.map((e) => login(e.email, PASSWORD)));

  const allEmails = [...eligibleEmployees.map((e) => e.email), ineligibleEmployee.email];
  const rows = (await restGet(
    `members?select=id,email&email=in.(${allEmails.join(",")})`,
    supervisorToken
  )) as { id: string; email: string }[];
  const idByEmail = Object.fromEntries(rows.map((r) => [r.email, r.id]));
  eligibleIds = eligibleEmployees.map((e) => idByEmail[e.email]);
  ineligibleId = idByEmail[ineligibleEmployee.email];
  if (eligibleIds.some((id) => !id) || !ineligibleId) {
    throw new Error("no se pudieron resolver todos los member ids de los empleados sembrados");
  }

  appToken = signAppToken("route-test-user");
});

// ---------------------------------------------------------------------------
// Auth gating: every route rejects a missing/invalid token (401) or a
// missing CSRF header on a mutating route (403), and never invokes the
// manager in either case.
// ---------------------------------------------------------------------------

describe("auth gating -- manager is never invoked on rejection", () => {
  test("GET /api/report-groups/[id]: missing app token -> 401 unauthorized, getGroup never called", async () => {
    const spy = vi.spyOn(reportGroupsManager, "getGroup");
    const request = appRequest("https://example.test/api/report-groups/00000000-0000-0000-0000-000000000000", {
      method: "GET",
      token: null,
    });
    const response = await getGroupRoute(request, {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: { code: "unauthorized", message: expect.any(String) } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("GET /api/report-groups/[id]: tampered app token -> 401 unauthorized", async () => {
    const [payloadB64, signatureB64] = appToken.split(".");
    const flippedChar = signatureB64[0] === "a" ? "b" : "a";
    const tampered = `${payloadB64}.${flippedChar}${signatureB64.slice(1)}`;

    const request = appRequest("https://example.test/api/report-groups/00000000-0000-0000-0000-000000000000", {
      method: "GET",
      token: tampered,
    });
    const response = await getGroupRoute(request, {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });

    expect(response.status).toBe(401);
  });

  test("POST /api/report-groups: valid token, missing CSRF header -> 403 forbidden, createGroup never called", async () => {
    const spy = vi.spyOn(reportGroupsManager, "createGroup");
    const request = appRequest("https://example.test/api/report-groups", {
      method: "POST",
      token: appToken,
      csrf: false,
      body: { name: "no debería crearse", memberIds: eligibleIds },
    });
    const response = await createGroupRoute(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data).toEqual({ error: { code: "forbidden", message: expect.any(String) } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  const DUMMY_ID = "00000000-0000-0000-0000-000000000000";

  test("POST /api/report-groups/[id]/respond: missing app token -> 401 unauthorized, respondToGroup never called", async () => {
    const spy = vi.spyOn(reportGroupsManager, "respondToGroup");
    const request = appRequest(`https://example.test/api/report-groups/${DUMMY_ID}/respond`, {
      method: "POST",
      token: null,
      csrf: true,
      body: { accept: true },
    });
    const response = await respondRoute(request, { params: Promise.resolve({ id: DUMMY_ID }) });

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/report-groups/[id]/respond: valid token, missing CSRF header -> 403 forbidden, respondToGroup never called", async () => {
    const spy = vi.spyOn(reportGroupsManager, "respondToGroup");
    const request = appRequest(`https://example.test/api/report-groups/${DUMMY_ID}/respond`, {
      method: "POST",
      token: appToken,
      csrf: false,
      body: { accept: true },
    });
    const response = await respondRoute(request, { params: Promise.resolve({ id: DUMMY_ID }) });

    expect(response.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/report-groups/[id]/close: missing app token -> 401 unauthorized, closeGroup never called", async () => {
    const spy = vi.spyOn(reportGroupsManager, "closeGroup");
    const request = appRequest(`https://example.test/api/report-groups/${DUMMY_ID}/close`, {
      method: "POST",
      token: null,
      csrf: true,
    });
    const response = await closeRoute(request, { params: Promise.resolve({ id: DUMMY_ID }) });

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/report-groups/[id]/close: valid token, missing CSRF header -> 403 forbidden, closeGroup never called", async () => {
    const spy = vi.spyOn(reportGroupsManager, "closeGroup");
    const request = appRequest(`https://example.test/api/report-groups/${DUMMY_ID}/close`, {
      method: "POST",
      token: appToken,
      csrf: false,
    });
    const response = await closeRoute(request, { params: Promise.resolve({ id: DUMMY_ID }) });

    expect(response.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("GET /api/report-groups/[id]/summary: missing app token -> 401 unauthorized, getGroupCompetencySummary never called", async () => {
    const spy = vi.spyOn(reportGroupsManager, "getGroupCompetencySummary");
    const request = appRequest(`https://example.test/api/report-groups/${DUMMY_ID}/summary`, {
      method: "GET",
      token: null,
    });
    const response = await summaryRoute(request, { params: Promise.resolve({ id: DUMMY_ID }) });

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// POST /api/report-groups -> createGroup
// ---------------------------------------------------------------------------

let groupViaRoute: string;

describe("POST /api/report-groups", () => {
  test("valid token + CSRF, eligible members -> 201 { groupId }", async () => {
    actingAs(supervisorToken);
    const request = appRequest("https://example.test/api/report-groups", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { name: `Grupo elegible route ${Date.now()}`, memberIds: eligibleIds },
    });
    const response = await createGroupRoute(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.groupId).toMatch(GROUP_ID_RE);
    groupViaRoute = data.groupId;
  });

  test("ineligible member -> 422 validation_error, manager's exact message, never an unhandled 500", async () => {
    actingAs(supervisorToken);
    const request = appRequest("https://example.test/api/report-groups", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { name: `Grupo inelegible route ${Date.now()}`, memberIds: [ineligibleId] },
    });
    const response = await createGroupRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data).toEqual({
      error: {
        code: "validation_error",
        message: "Todos los invitados deben ser compañeros activos de tu empresa con al menos un 360 ya finalizado.",
      },
    });
  });

  test("invalid name (not a string) -> 422 validation_error, createGroup never called", async () => {
    const spy = vi.spyOn(reportGroupsManager, "createGroup");
    const request = appRequest("https://example.test/api/report-groups", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { name: 12345, memberIds: eligibleIds },
    });
    const response = await createGroupRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("invalid memberIds (contains a non-string element) -> 422 validation_error, createGroup never called", async () => {
    const spy = vi.spyOn(reportGroupsManager, "createGroup");
    const request = appRequest("https://example.test/api/report-groups", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { name: "Grupo con id inválido", memberIds: [eligibleIds[0], 42] },
    });
    const response = await createGroupRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("malformed JSON body -> 422 validation_error with the friendly message, not a raw parser error", async () => {
    const request = new Request("https://example.test/api/report-groups", {
      method: "POST",
      headers: {
        cookie: `${APP_TOKEN_COOKIE}=${appToken}`,
        [CSRF_HEADER]: "1",
        "content-type": "application/json",
      },
      body: "{not valid json",
    });
    const response = await createGroupRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data).toEqual({
      error: {
        code: "validation_error",
        message: "Se requieren 'name' (string) y 'memberIds' (string[]).",
      },
    });
  });
});

// ---------------------------------------------------------------------------
// GET /api/report-groups/[id] -> getGroup: not-found / no-access
// ---------------------------------------------------------------------------

describe("GET /api/report-groups/[id]: not found / no access", () => {
  test("non-existent group id -> 422 validation_error, manager's exact 'not found' message", async () => {
    actingAs(supervisorToken);
    const missingId = "00000000-0000-0000-0000-000000000000";
    const request = appRequest(`https://example.test/api/report-groups/${missingId}`, {
      method: "GET",
      token: appToken,
    });
    const response = await getGroupRoute(request, { params: Promise.resolve({ id: missingId }) });

    // get_report_group (supabase/migrations/0064_report_groups.sql) raises
    // 'Grupo no encontrado.' when no row matches -- a manager-thrown Error,
    // mapped to the same 422 validation_error bucket as any other
    // business-rule rejection per this story's simplified mapping.
    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data).toEqual({
      error: { code: "validation_error", message: "Grupo no encontrado." },
    });
  });
});

// ---------------------------------------------------------------------------
// respond / summary / close on groupViaRoute, over HTTP end to end -- same
// shape as Story 1.2's manager-level workflow.
// ---------------------------------------------------------------------------

describe("respond / summary / close on groupViaRoute", () => {
  test("respond: non-boolean 'accept' -> 422 validation_error, respondToGroup never called", async () => {
    expect(groupViaRoute, "creation test must run first").toBeDefined();
    const spy = vi.spyOn(reportGroupsManager, "respondToGroup");
    const request = appRequest(`https://example.test/api/report-groups/${groupViaRoute}/respond`, {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { accept: "yes" },
    });
    const response = await respondRoute(request, { params: Promise.resolve({ id: groupViaRoute }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data).toEqual({
      error: { code: "validation_error", message: "Se requiere 'accept' (boolean)." },
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("respond x5 accept -> 200, membership accepted", async () => {
    expect(groupViaRoute, "creation test must run first").toBeDefined();
    for (let i = 0; i < 5; i++) {
      actingAs(eligibleTokens[i]);
      const request = appRequest(`https://example.test/api/report-groups/${groupViaRoute}/respond`, {
        method: "POST",
        token: appToken,
        csrf: true,
        body: { accept: true },
      });
      const response = await respondRoute(request, { params: Promise.resolve({ id: groupViaRoute }) });
      expect(response.status).toBe(200);
    }
  });

  test("respond decline (6th invitee) -> 200, membership rejected", async () => {
    actingAs(eligibleTokens[5]);
    const request = appRequest(`https://example.test/api/report-groups/${groupViaRoute}/respond`, {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { accept: false },
    });
    const response = await respondRoute(request, { params: Promise.resolve({ id: groupViaRoute }) });
    expect(response.status).toBe(200);
  });

  test("GET /api/report-groups/[id]: membership state is 5 accepted, 1 rejected", async () => {
    actingAs(supervisorToken);
    const request = appRequest(`https://example.test/api/report-groups/${groupViaRoute}`, {
      method: "GET",
      token: appToken,
    });
    const response = await getGroupRoute(request, { params: Promise.resolve({ id: groupViaRoute }) });
    expect(response.status).toBe(200);
    const detail = await response.json();
    const statuses = detail.members.map((mbr: { status: string }) => mbr.status).sort();
    expect(statuses).toEqual(["accepted", "accepted", "accepted", "accepted", "accepted", "rejected"]);
  });

  test("GET /api/report-groups/[id]/summary before close -> 422 validation_error (RPC requires a closed group)", async () => {
    actingAs(supervisorToken);
    const request = appRequest(`https://example.test/api/report-groups/${groupViaRoute}/summary`, {
      method: "GET",
      token: appToken,
    });
    const response = await summaryRoute(request, { params: Promise.resolve({ id: groupViaRoute }) });
    // get_report_group_competency_summary (supabase/migrations/0064_report_groups.sql)
    // raises "El informe de grupo todavía no está cerrado." for an open
    // group -- a manager-thrown Error, mapped uniformly to 422 like any
    // other business-rule rejection, not a 500.
    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
  });

  test("POST /api/report-groups/[id]/close: at/above threshold -> 200, group closes", async () => {
    actingAs(eligibleTokens[0]); // one of the accepted members, not the creator
    const request = appRequest(`https://example.test/api/report-groups/${groupViaRoute}/close`, {
      method: "POST",
      token: appToken,
      csrf: true,
    });
    const response = await closeRoute(request, { params: Promise.resolve({ id: groupViaRoute }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    // Same baseline as Stories 1.1/1.2: both outcomes are valid depending on
    // whether ANTHROPIC_API_KEY happens to be set for this process.
    expect(data.aiInterpretation === null || typeof data.aiInterpretation === "string").toBe(true);

    actingAs(supervisorToken);
    const getRequest = appRequest(`https://example.test/api/report-groups/${groupViaRoute}`, {
      method: "GET",
      token: appToken,
    });
    const getResponse = await getGroupRoute(getRequest, { params: Promise.resolve({ id: groupViaRoute }) });
    const detail = await getResponse.json();
    expect(detail.status).toBe("closed");
  });

  test("GET /api/report-groups/[id]/summary after close -> 200, an array", async () => {
    actingAs(supervisorToken);
    const request = appRequest(`https://example.test/api/report-groups/${groupViaRoute}/summary`, {
      method: "GET",
      token: appToken,
    });
    const response = await summaryRoute(request, { params: Promise.resolve({ id: groupViaRoute }) });
    expect(response.status).toBe(200);
    const summary = await response.json();
    expect(Array.isArray(summary)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Story 1.8 (_bmad-output/implementation-artifacts/
// spec-1-8-new-path-verification-against-the-characterization-baseline.md):
// Story 1.1's 4th frozen fixture -- close-below-threshold -- was already
// proven at the Server Action layer (Story 1.1) and the manager layer
// (Story 1.2), but never through the Route Handler specifically. Closes
// that one remaining fixture/path combination.
// ---------------------------------------------------------------------------

describe("close-below-threshold via the route (Story 1.1's 4th frozen fixture)", () => {
  test("only 2 of 3 accepted -> 422 validation_error, exact baseline message, group stays open", async () => {
    actingAs(supervisorToken);
    const createRequest = appRequest("https://example.test/api/report-groups", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: {
        name: `Grupo bajo umbral route ${Date.now()}`,
        memberIds: eligibleIds.slice(0, 3),
      },
    });
    const createResponse = await createGroupRoute(createRequest);
    expect(createResponse.status).toBe(201);
    const { groupId } = await createResponse.json();
    expect(groupId).toMatch(GROUP_ID_RE);

    for (let i = 0; i < 2; i++) {
      actingAs(eligibleTokens[i]);
      const respondRequest = appRequest(`https://example.test/api/report-groups/${groupId}/respond`, {
        method: "POST",
        token: appToken,
        csrf: true,
        body: { accept: true },
      });
      const respondResponse = await respondRoute(respondRequest, { params: Promise.resolve({ id: groupId }) });
      expect(respondResponse.status).toBe(200);
    }

    actingAs(supervisorToken);
    const preCloseRequest = appRequest(`https://example.test/api/report-groups/${groupId}`, {
      method: "GET",
      token: appToken,
    });
    const preCloseResponse = await getGroupRoute(preCloseRequest, { params: Promise.resolve({ id: groupId }) });
    const preCloseDetail = await preCloseResponse.json();
    const preCloseStatuses = preCloseDetail.members
      .map((mbr: { status: string }) => mbr.status)
      .sort();
    expect(preCloseStatuses).toEqual(["accepted", "accepted", "pending"]);

    // eligibleTokens[0] is one of the two who just accepted -- close_report_group
    // requires the closer to already be an accepted member (supabase/migrations/
    // 0064_report_groups.sql), so this deliberately exercises the threshold
    // check, not the separate closer-eligibility check.
    actingAs(eligibleTokens[0]);
    const closeSpy = vi.spyOn(reportGroupsManager, "closeGroup");
    const closeRequest = appRequest(`https://example.test/api/report-groups/${groupId}/close`, {
      method: "POST",
      token: appToken,
      csrf: true,
    });
    const closeResponse = await closeRoute(closeRequest, { params: Promise.resolve({ id: groupId }) });

    expect(closeResponse.status).toBe(422);
    // Proves the route actually reached reportGroupsManager.closeGroup and
    // that IT threw -- not a coincidentally-matching 422 from some other
    // validation layer.
    expect(closeSpy).toHaveBeenCalledWith(groupId);
    closeSpy.mockRestore();
    const data = await closeResponse.json();
    // Recorded verbatim from tests/characterization/report-groups.test.ts,
    // itself verbatim from close_report_group's raised exception
    // (supabase/migrations/0064_report_groups.sql).
    expect(data).toEqual({
      error: {
        code: "validation_error",
        message: "Hacen falta al menos 5 personas aceptadas para cerrar el grupo.",
      },
    });

    actingAs(supervisorToken);
    const postCloseRequest = appRequest(`https://example.test/api/report-groups/${groupId}`, {
      method: "GET",
      token: appToken,
    });
    const postCloseResponse = await getGroupRoute(postCloseRequest, { params: Promise.resolve({ id: groupId }) });
    const postCloseDetail = await postCloseResponse.json();
    // The rejected close must not have mutated group state.
    expect(postCloseDetail.status).toBe("open");
  });
});

// ---------------------------------------------------------------------------
// AC 3: the same reportGroupsManager function, called in-process vs. via
// its Route Handler against the same seeded data, produces identical
// results -- proven directly rather than inferred from the two suites
// separately matching a shared baseline.
// ---------------------------------------------------------------------------

describe("AC 3: in-process vs. over-HTTP equivalence", () => {
  test("createGroup ineligible-member rejection: identical thrown-message text in-process and via the route", async () => {
    actingAs(supervisorToken);

    let inProcessMessage = "";
    try {
      await reportGroupsManager.createGroup(`Grupo inelegible equiv ${Date.now()}`, [ineligibleId]);
      throw new Error("expected reportGroupsManager.createGroup to reject");
    } catch (e) {
      inProcessMessage = (e as Error).message;
    }

    const request = appRequest("https://example.test/api/report-groups", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { name: `Grupo inelegible equiv route ${Date.now()}`, memberIds: [ineligibleId] },
    });
    const response = await createGroupRoute(request);
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.error.message).toBe(inProcessMessage);
  });

  test("getGroup: identical result shape in-process and via the route, same group", async () => {
    actingAs(supervisorToken);
    const inProcess = await reportGroupsManager.getGroup(groupViaRoute);

    const request = appRequest(`https://example.test/api/report-groups/${groupViaRoute}`, {
      method: "GET",
      token: appToken,
    });
    const response = await getGroupRoute(request, { params: Promise.resolve({ id: groupViaRoute }) });
    const viaRoute = await response.json();

    expect(response.status).toBe(200);
    expect(viaRoute).toEqual(inProcess);
  });

  // Story 1.8: same equivalence proof, for the one fixture that previously
  // had a plain route-level test (above) but no in-process comparison --
  // closeGroup's below-threshold rejection.
  test("closeGroup below-threshold rejection: identical thrown-message text in-process and via the route", async () => {
    async function belowThresholdGroupId(namePrefix: string): Promise<string> {
      actingAs(supervisorToken);
      const createRequest = appRequest("https://example.test/api/report-groups", {
        method: "POST",
        token: appToken,
        csrf: true,
        body: { name: `${namePrefix} ${Date.now()}`, memberIds: eligibleIds.slice(0, 3) },
      });
      const createResponse = await createGroupRoute(createRequest);
      const { groupId } = await createResponse.json();

      for (let i = 0; i < 2; i++) {
        actingAs(eligibleTokens[i]);
        const respondRequest = appRequest(`https://example.test/api/report-groups/${groupId}/respond`, {
          method: "POST",
          token: appToken,
          csrf: true,
          body: { accept: true },
        });
        await respondRoute(respondRequest, { params: Promise.resolve({ id: groupId }) });
      }

      return groupId;
    }

    const inProcessGroupId = await belowThresholdGroupId("Grupo bajo umbral equiv in-process");
    let inProcessMessage = "";
    try {
      await reportGroupsManager.closeGroup(inProcessGroupId);
      throw new Error("expected reportGroupsManager.closeGroup to reject");
    } catch (e) {
      inProcessMessage = (e as Error).message;
    }

    const routeGroupId = await belowThresholdGroupId("Grupo bajo umbral equiv route");
    actingAs(eligibleTokens[0]);
    const closeRequest = appRequest(`https://example.test/api/report-groups/${routeGroupId}/close`, {
      method: "POST",
      token: appToken,
      csrf: true,
    });
    const closeResponse = await closeRoute(closeRequest, { params: Promise.resolve({ id: routeGroupId }) });
    const data = await closeResponse.json();

    expect(closeResponse.status).toBe(422);
    expect(data.error.message).toBe(inProcessMessage);
  });
});

// ---------------------------------------------------------------------------
// src/lib/api/client.ts -- apiFetch()/ApiError, against a stubbed global
// fetch. No Supabase/manager involvement: this is purely the client-side
// contract (CSRF auto-attachment, typed ApiError on a failure envelope).
// ---------------------------------------------------------------------------

describe("apiFetch (src/lib/api/client.ts)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("mutating call (POST) -> x-brujula-csrf header attached automatically, credentials same-origin", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ groupId: "abc" }), { status: 201 }));
    global.fetch = fetchMock;

    const result = await apiFetch<{ groupId: string }>("/api/report-groups", {
      method: "POST",
      body: JSON.stringify({ name: "x", memberIds: [] }),
    });

    expect(result).toEqual({ groupId: "abc" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get(CSRF_HEADER)).toBe("1");
    expect(init?.credentials).toBe("same-origin");
  });

  test("GET call -> no CSRF header attached", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    global.fetch = fetchMock;

    await apiFetch("/api/report-groups/abc");

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.has(CSRF_HEADER)).toBe(false);
  });

  test("failure envelope -> throws a typed, catchable ApiError carrying code/message/status", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "validation_error", message: "Boom." } }), {
        status: 422,
      })
    );
    global.fetch = fetchMock;

    let caught: unknown;
    try {
      await apiFetch("/api/report-groups/abc");
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const error = caught as ApiError;
    expect(error.code).toBe("validation_error");
    expect(error.message).toBe("Boom.");
    expect(error.status).toBe(422);
  });
});
