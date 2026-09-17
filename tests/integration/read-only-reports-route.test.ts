// Story 3.27 (_bmad-output/implementation-artifacts/
// spec-3-27-read-only-reports-route-handlers-client-fetch-integration.md):
// exercises every row of the spec's I/O & Edge-Case Matrix by calling the
// exported Route Handler functions directly with constructed `Request`s,
// mirroring tests/integration/feedback-route.test.ts's and
// tests/integration/cycles-route.test.ts's shape (Stories 3.15/3.9) for the
// route/auth-gating pattern, and tests/characterization/
// read-only-reports-manager.test.ts's shape (Story 3.26) for the
// fixture/mocks/exact-RPC-error-message technique -- this file reuses that
// same fixture (org A 8-employee demo company + minimal org B) since it
// needs the identical render states (ad_hoc-only rows, open cycle, cycle-
// type request, report group, closed/no-closed 360, Supervisor/non-
// Supervisor org summary).
//
// What's real: every route handler under test, every manager/db function it
// calls, and every Postgres RPC underneath, run against the local
// `supabase start` instance. What's mocked, and why: only
// `@/lib/supabase/server` (so this suite can run requests "as" several
// different already-authenticated users without a real login/cookie
// ceremony per call) -- no `next/headers` mock is needed: none of these
// routes read/write cookies themselves. requireApiToken/signAppToken
// (Story 1.4) are NOT mocked -- this suite uses real signed app tokens
// throughout, exactly as Stories 3.9/3.15's own route suites do.

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
// Same platform admin email seed-demo-company.mjs bootstraps for itself
// (supabase/migrations/0016_platform_admin_org_creation.sql) -- needed here
// only for org B's own create_organization_as_admin call.
const PLATFORM_ADMIN_EMAIL = "david.abarca@gmail.com";

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY -- deben venir de " +
      ".env.test.local (npx supabase start). Ver vitest.config.ts."
  );
}
// Hard boundary carried over from every prior integration/characterization
// file: never run this suite against a remote Supabase project, dev or
// production -- only the local CLI instance.
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
// import of each manager (via its @/server/db/* file's own import of
// @/lib/supabase/server) picks up the mocked client factory.
import * as feedbackManager from "@/server/managers/feedbackManager";
import * as cyclesManager from "@/server/managers/cyclesManager";
import * as reportGroupsManager from "@/server/managers/reportGroupsManager";
import * as membersManager from "@/server/managers/membersManager";

import { GET as getAdHocRequestsRoute } from "@/app/api/feedback-requests/route";
import { GET as getCompetencyMapRoute } from "@/app/api/feedback-requests/competency-map/route";
import { GET as getOpenCyclesRoute } from "@/app/api/cycles/route";
import { GET as getCycleRequestsRoute } from "@/app/api/cycles/requests/route";
import { GET as getReportGroupsRoute } from "@/app/api/report-groups/route";
import { GET as getOrgCompetencySummaryRoute } from "@/app/api/members/organization-competency-summary/route";

import { APP_TOKEN_COOKIE, signAppToken } from "@/server/shared/auth";

// ---------------------------------------------------------------------------
// Small REST/RPC/auth helpers -- same anon-key-only pattern as
// scripts/seed-*.mjs and every prior integration/characterization suite.
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

/** Signs up if the account doesn't exist yet, else signs in -- same
 * fallback scripts/seed-demo-company.mjs's own signUpOrSignIn uses for the
 * platform admin account, which may already exist from a previous run. */
async function signUpOrSignIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (res.ok && data.access_token) return data.access_token as string;
  return login(email, password);
}

async function signUpWithInvite(email: string, password: string, inviteToken: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, data: { pending_invite_token: inviteToken } }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`signUp failed for ${email}: ${JSON.stringify(data)}`);
  if (!data.access_token) {
    throw new Error(`${email}: signup succeeded but requires email confirmation -- unexpected locally.`);
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

/**
 * Builds a constructed `Request` carrying (optionally) the app-token cookie,
 * per Story 1.4's requireApiToken() contract -- same helper shape as
 * tests/integration/feedback-route.test.ts and cycles-route.test.ts. None
 * of this story's 6 routes are mutating (GET-only), so no CSRF header is
 * ever needed here.
 */
function appRequest(url: string, init: { token?: string | null } = {}): Request {
  const headers = new Headers();
  if (init.token) {
    headers.set("cookie", `${APP_TOKEN_COOKIE}=${init.token}`);
  }
  return new Request(url, { method: "GET", headers });
}

// A single app token (Story 1.4), reused across requests in this suite --
// requireApiToken() never resolves or threads its `sub` into any manager, so
// which authenticated user it names doesn't affect any route's behavior
// (same note as every prior route suite).
let appToken: string;

beforeAll(() => {
  appToken = signAppToken("read-only-reports-route-test-user");
});

beforeEach(() => {
  acting.token = null;
});

afterAll(() => {
  acting.token = null;
});

// ---------------------------------------------------------------------------
// Fixture: org A -- one fresh 8-employee demo company via
// scripts/seed-demo-company.mjs, plus a minimal org B (Supervisor only,
// zero feedback_requests) -- same technique and same render-state mapping
// as tests/characterization/read-only-reports-manager.test.ts's own fixture
// (Story 3.26), reused here since this story's routes wrap the identical
// manager functions.
// ---------------------------------------------------------------------------

type SeededEmployee = { email: string; bucketLabel: string; token: string; id: string };

let supervisorToken: string;
let orgAEmployees: SeededEmployee[];
let seedCycleId: string;
let seedCycleName: string;
let seedOpensAt: string;
let seedClosesAt: string;
let today: string;

// dashboardEmployee: bucket "a medias" (never closes its own 360) -- used
// for GET /api/feedback-requests (ad_hoc-only rows), GET /api/cycles (open-
// cycle rows), GET /api/cycles/requests (cycle-type request rows), and
// doubles as GET /api/feedback-requests/competency-map's "no closed 360"
// state and GET /api/members/organization-competency-summary's non-
// Supervisor state.
let dashboardEmployee: SeededEmployee;
let adHocRequestId: string;
const AD_HOC_REQUEST_NAME = "Feedback de prueba (característica 3.27)";

// closedInvitee: bucket "cerrado" -- GET /api/feedback-requests/competency-map's
// "closed 360" state, and the sole invitee of the report-group fixture below.
let closedInvitee: SeededEmployee;
let reportGroupId: string;
let reportGroupCreator: SeededEmployee;

// Org B: a second, minimal company (Supervisor only, zero
// feedback_requests) -- built directly via create_organization_as_admin,
// never through the seed script.
let supervisorBToken: string;

const runId = Date.now();

beforeAll(async () => {
  const companyName = `Route Test ReadOnly Reports ${runId}`;
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

  const cycleIdMatch = seedOutput.match(/^ {3}cycle id: (\S+)$/m);
  if (!cycleIdMatch) {
    throw new Error(`no se pudo extraer el cycle id de la salida del seed:\n${seedOutput}`);
  }
  seedCycleId = cycleIdMatch[1];
  seedCycleName = `Ciclo 360 — ${companyName}`;

  const employeeRows: { email: string; bucketLabel: string }[] = [];
  const lineRe = /^ {2}- .+ <([^>]+)> — .+ — 360: (.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(seedOutput))) {
    employeeRows.push({ email: m[1], bucketLabel: m[2] });
  }
  if (employeeRows.length < 8) {
    throw new Error(
      `seed-demo-company.mjs no produjo los 8 empleados esperados (obtuvo ${employeeRows.length}). ` +
        `Salida completa:\n${seedOutput}`
    );
  }

  const memberRows = (await restGet(
    `members?select=id,email&email=in.(${employeeRows.map((e) => e.email).join(",")},${supervisorEmail})`,
    supervisorToken
  )) as { id: string; email: string }[];
  const idByEmail = Object.fromEntries(memberRows.map((r) => [r.email, r.id]));

  orgAEmployees = await Promise.all(
    employeeRows.map(async (e) => ({
      ...e,
      token: await login(e.email, PASSWORD),
      id: idByEmail[e.email],
    }))
  );

  const closedEmployees = orgAEmployees.filter((e) => e.bucketLabel === "cerrado");
  const halfDoneEmployees = orgAEmployees.filter((e) => e.bucketLabel === "a medias");
  const readyEmployees = orgAEmployees.filter((e) => e.bucketLabel === "listo (sin cerrar)");
  if (closedEmployees.length === 0 || halfDoneEmployees.length === 0 || readyEmployees.length === 0) {
    throw new Error(
      `seed-demo-company.mjs no produjo los 3 buckets esperados. Salida completa:\n${seedOutput}`
    );
  }

  dashboardEmployee = halfDoneEmployees[0];
  closedInvitee = closedEmployees[0];
  reportGroupCreator = readyEmployees[0];

  today = new Date().toISOString().slice(0, 10);
  seedOpensAt = today;
  seedClosesAt = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  // --- ad_hoc fixture: dashboardEmployee's own in-progress feedback
  // request, built directly via the already-characterized RPC, never
  // through feedbackManager itself.
  const adHocInvitees = orgAEmployees
    .filter((e) => e.id !== dashboardEmployee.id)
    .slice(0, 5)
    .map((e) => e.id);
  adHocRequestId = (await callRpc("create_ad_hoc_feedback_request", dashboardEmployee.token, {
    p_invitee_member_ids: adHocInvitees,
    p_subtype: "general",
    p_name: AD_HOC_REQUEST_NAME,
  })) as string;

  // --- report-group fixture: reportGroupCreator invites closedInvitee.
  // 0099_report_groups_membership_management_and_email.sql -- see the
  // identical note in read-only-reports.test.ts. Not fixed in this pass --
  // see REVIEW-NOTES.md.
  const createReportGroupRows = (await callRpc("create_report_group", reportGroupCreator.token, {
    p_name: "Grupo de prueba (característica 3.27)",
    p_member_ids: [closedInvitee.id],
  })) as { group_id: string }[];
  reportGroupId = createReportGroupRows[0].group_id;

  // --- org B fixture: a second, minimal company with zero
  // feedback_requests -- used only as this story's own auth-gating-adjacent
  // sanity fixture (not otherwise exercised beyond the Supervisor-only org
  // summary access-control test, which uses dashboardEmployee instead).
  const paToken = await signUpOrSignIn(PLATFORM_ADMIN_EMAIL, PASSWORD);
  const orgBName = `Route Test ReadOnly Empty ${runId}`;
  const orgBAdminEmail = `admin@route-test-readonly-empty-${runId}.brujula-fake.test`;
  const orgBInviteToken = (await callRpc("create_organization_as_admin", paToken, {
    p_org_name: orgBName,
    p_admin_email: orgBAdminEmail,
    p_admin_full_name: "Admin Empresa Vacía",
  })) as string;
  supervisorBToken = await signUpWithInvite(orgBAdminEmail, PASSWORD, orgBInviteToken);
  await callRpc("accept_member_invite", supervisorBToken, { p_token: orgBInviteToken });
});

// ---------------------------------------------------------------------------
// Auth gating: every route rejects a missing app token (401), manager never
// invoked. Mirrors Stories 3.9/3.15's suite shape, generalized to this
// story's 6 GET-only routes (no CSRF-header row -- GET is exempt, per this
// story's own Boundaries).
// ---------------------------------------------------------------------------

describe("auth gating -- manager is never invoked on rejection", () => {
  test("GET /api/feedback-requests: missing app token -> 401 unauthorized, getMyAdHocRequests never called", async () => {
    const spy = vi.spyOn(feedbackManager, "getMyAdHocRequests");
    const request = appRequest("https://example.test/api/feedback-requests", { token: null });
    const response = await getAdHocRequestsRoute(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: { code: "unauthorized", message: expect.any(String) } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("GET /api/feedback-requests/competency-map: missing app token -> 401 unauthorized, getMyCompetencyMap never called", async () => {
    const spy = vi.spyOn(feedbackManager, "getMyCompetencyMap");
    const request = appRequest("https://example.test/api/feedback-requests/competency-map", { token: null });
    const response = await getCompetencyMapRoute(request);

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("GET /api/cycles: missing app token -> 401 unauthorized, getMyOpenCycles never called", async () => {
    const spy = vi.spyOn(cyclesManager, "getMyOpenCycles");
    const request = appRequest("https://example.test/api/cycles", { token: null });
    const response = await getOpenCyclesRoute(request);

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("GET /api/cycles/requests: missing app token -> 401 unauthorized, getMyCycleRequests never called", async () => {
    const spy = vi.spyOn(cyclesManager, "getMyCycleRequests");
    const request = appRequest("https://example.test/api/cycles/requests", { token: null });
    const response = await getCycleRequestsRoute(request);

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("GET /api/report-groups: missing app token -> 401 unauthorized, getMyReportGroups never called", async () => {
    const spy = vi.spyOn(reportGroupsManager, "getMyReportGroups");
    const request = appRequest("https://example.test/api/report-groups", { token: null });
    const response = await getReportGroupsRoute(request);

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("GET /api/members/organization-competency-summary: missing app token -> 401 unauthorized, getOrganizationCompetencySummary never called", async () => {
    const spy = vi.spyOn(membersManager, "getOrganizationCompetencySummary");
    const request = appRequest("https://example.test/api/members/organization-competency-summary", {
      token: null,
    });
    const response = await getOrgCompetencySummaryRoute(request);

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// GET /api/feedback-requests -> feedbackManager.getMyAdHocRequests
// ---------------------------------------------------------------------------

describe("GET /api/feedback-requests -> feedbackManager.getMyAdHocRequests", () => {
  test("authenticated caller -> 200, ad_hoc-only rows (the caller's own open cycle request is excluded)", async () => {
    actingAs(dashboardEmployee.token);
    const request = appRequest("https://example.test/api/feedback-requests", { token: appToken });
    const response = await getAdHocRequestsRoute(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0]).toEqual({
      id: adHocRequestId,
      createdAt: data[0].createdAt,
      status: "open",
      name: AD_HOC_REQUEST_NAME,
      // Story 7.2: closesAt is never set for an ad_hoc request (see
      // AdHocRequestRow's own doc comment, db/feedback.ts).
      closesAt: null,
    });
  });

  test("in-process vs over HTTP, identical seeded state -> identical results", async () => {
    actingAs(dashboardEmployee.token);
    const inProcessResult = await feedbackManager.getMyAdHocRequests();

    actingAs(dashboardEmployee.token);
    const request = appRequest("https://example.test/api/feedback-requests", { token: appToken });
    const response = await getAdHocRequestsRoute(request);
    const httpResult = await response.json();

    expect(httpResult).toEqual(inProcessResult);
  });
});

// ---------------------------------------------------------------------------
// GET /api/feedback-requests/competency-map -> feedbackManager.getMyCompetencyMap
// ---------------------------------------------------------------------------

describe("GET /api/feedback-requests/competency-map -> feedbackManager.getMyCompetencyMap", () => {
  test("closed 360 -> 200, per-competency rows", async () => {
    const frameworkRows = (await restGet(
      "competency_frameworks?select=code",
      closedInvitee.token
    )) as { code: string }[];
    const expectedCodes = new Set(frameworkRows.map((r) => r.code));
    expect(expectedCodes.size).toBeGreaterThan(0);

    actingAs(closedInvitee.token);
    const request = appRequest("https://example.test/api/feedback-requests/competency-map", {
      token: appToken,
    });
    const response = await getCompetencyMapRoute(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(expectedCodes.size);
    expect(new Set(data.map((r: { competencyCode: string }) => r.competencyCode))).toEqual(expectedCodes);
    for (const row of data) {
      expect(typeof row.baseValue).toBe("number");
      expect(row.mentionDelta).toBe(0);
      expect(row.lastCycleClosedAt).toBe(today);
    }
  });

  test("no closed 360 -> 200, []", async () => {
    actingAs(dashboardEmployee.token);
    const request = appRequest("https://example.test/api/feedback-requests/competency-map", {
      token: appToken,
    });
    const response = await getCompetencyMapRoute(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  test("in-process vs over HTTP, identical seeded state -> identical results (closed-360 caller)", async () => {
    actingAs(closedInvitee.token);
    const inProcessResult = await feedbackManager.getMyCompetencyMap();

    actingAs(closedInvitee.token);
    const request = appRequest("https://example.test/api/feedback-requests/competency-map", {
      token: appToken,
    });
    const response = await getCompetencyMapRoute(request);
    const httpResult = await response.json();

    expect(httpResult).toEqual(inProcessResult);
  });
});

// ---------------------------------------------------------------------------
// GET /api/cycles -> cyclesManager.getMyOpenCycles
// ---------------------------------------------------------------------------

describe("GET /api/cycles -> cyclesManager.getMyOpenCycles", () => {
  test("authenticated caller -> 200, open-cycle rows", async () => {
    actingAs(dashboardEmployee.token);
    const request = appRequest("https://example.test/api/cycles", { token: appToken });
    const response = await getOpenCyclesRoute(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0]).toEqual({
      id: seedCycleId,
      name: seedCycleName,
      opensAt: seedOpensAt,
      closesAt: seedClosesAt,
    });
  });

  test("in-process vs over HTTP, identical seeded state -> identical results", async () => {
    actingAs(dashboardEmployee.token);
    const inProcessResult = await cyclesManager.getMyOpenCycles();

    actingAs(dashboardEmployee.token);
    const request = appRequest("https://example.test/api/cycles", { token: appToken });
    const response = await getOpenCyclesRoute(request);
    const httpResult = await response.json();

    expect(httpResult).toEqual(inProcessResult);
  });
});

// ---------------------------------------------------------------------------
// GET /api/cycles/requests -> cyclesManager.getMyCycleRequests
// ---------------------------------------------------------------------------

describe("GET /api/cycles/requests -> cyclesManager.getMyCycleRequests", () => {
  test("authenticated caller -> 200, cycle-type request rows", async () => {
    actingAs(dashboardEmployee.token);
    const request = appRequest("https://example.test/api/cycles/requests", { token: appToken });
    const response = await getCycleRequestsRoute(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0]).toEqual({
      id: data[0].id,
      cycleId: seedCycleId,
      createdAt: data[0].createdAt,
      status: "open",
      cycleName: seedCycleName,
      // Story 7.2: always set for a cycle request (the deadline chosen at
      // creation, later overwritten with the real close date once closed --
      // see CycleRequestRow's own doc comment, db/cycles.ts) -- not
      // deterministic here (depends on the seed script's own choice), same
      // "pull it from the response itself" treatment as id/createdAt above.
      closesAt: data[0].closesAt,
    });
    expect(typeof data[0].closesAt).toBe("string");
  });

  test("in-process vs over HTTP, identical seeded state -> identical results", async () => {
    actingAs(dashboardEmployee.token);
    const inProcessResult = await cyclesManager.getMyCycleRequests();

    actingAs(dashboardEmployee.token);
    const request = appRequest("https://example.test/api/cycles/requests", { token: appToken });
    const response = await getCycleRequestsRoute(request);
    const httpResult = await response.json();

    expect(httpResult).toEqual(inProcessResult);
  });
});

// ---------------------------------------------------------------------------
// GET /api/report-groups -> reportGroupsManager.getMyReportGroups
// ---------------------------------------------------------------------------

describe("GET /api/report-groups -> reportGroupsManager.getMyReportGroups", () => {
  test("authenticated caller -> 200, group rows", async () => {
    actingAs(closedInvitee.token);
    const request = appRequest("https://example.test/api/report-groups", { token: appToken });
    const response = await getReportGroupsRoute(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(1);
    expect(data[0]).toEqual({
      id: reportGroupId,
      name: "Grupo de prueba (característica 3.27)",
      status: "open",
      createdByMemberId: reportGroupCreator.id,
      isCreator: false,
      myStatus: "pending",
      acceptedCount: 0,
      totalCount: 1,
    });
  });

  test("in-process vs over HTTP, identical seeded state -> identical results", async () => {
    actingAs(closedInvitee.token);
    const inProcessResult = await reportGroupsManager.getMyReportGroups();

    actingAs(closedInvitee.token);
    const request = appRequest("https://example.test/api/report-groups", { token: appToken });
    const response = await getReportGroupsRoute(request);
    const httpResult = await response.json();

    expect(httpResult).toEqual(inProcessResult);
  });
});

// ---------------------------------------------------------------------------
// GET /api/members/organization-competency-summary ->
// membersManager.getOrganizationCompetencySummary
// ---------------------------------------------------------------------------

describe("GET /api/members/organization-competency-summary -> membersManager.getOrganizationCompetencySummary", () => {
  test("Supervisor caller -> 200, aggregate rows", async () => {
    actingAs(supervisorToken);
    const request = appRequest("https://example.test/api/members/organization-competency-summary", {
      token: appToken,
    });
    const response = await getOrgCompetencySummaryRoute(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.length).toBeGreaterThan(0);
    const row = data[0];
    expect(row).toHaveProperty("competencyCode");
    expect(row).toHaveProperty("competencyName");
    expect(row).toHaveProperty("principleCode");
    expect(row).toHaveProperty("principleName");
    expect(row).toHaveProperty("roleCode");
    expect(row).toHaveProperty("roleName");
    expect(typeof row.avgValue).toBe("number");
    expect(row.responseCount).toBeGreaterThanOrEqual(3);
  });

  test("non-Supervisor caller -> 422 validation_error, the RPC's own exact message, thrown-not-swallowed", async () => {
    actingAs(dashboardEmployee.token);
    const request = appRequest("https://example.test/api/members/organization-competency-summary", {
      token: appToken,
    });
    const response = await getOrgCompetencySummaryRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    // Recorded verbatim from get_organization_competency_summary's raised
    // exception (supabase/migrations/0054_expose_role_in_competency_reports.sql:83-).
    expect(data).toEqual({
      error: {
        code: "validation_error",
        message: "Solo el administrador de la empresa puede ver este informe.",
      },
    });
  });

  test("Supervisor, no revealed data org-wide (org B) -> 200, []", async () => {
    actingAs(supervisorBToken);
    const request = appRequest("https://example.test/api/members/organization-competency-summary", {
      token: appToken,
    });
    const response = await getOrgCompetencySummaryRoute(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  test("in-process vs over HTTP, identical seeded state -> identical results (Supervisor)", async () => {
    actingAs(supervisorToken);
    const inProcessResult = await membersManager.getOrganizationCompetencySummary();

    actingAs(supervisorToken);
    const request = appRequest("https://example.test/api/members/organization-competency-summary", {
      token: appToken,
    });
    const response = await getOrgCompetencySummaryRoute(request);
    const httpResult = await response.json();

    expect(httpResult).toEqual(inProcessResult);
  });
});
