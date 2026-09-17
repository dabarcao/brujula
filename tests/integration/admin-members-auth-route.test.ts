// Story 3.3 (_bmad-output/implementation-artifacts/
// spec-3-3-admin-members-route-handlers-client-fetch-integration.md):
// exercises every row of the spec's I/O & Edge-Case Matrix by calling the
// exported Route Handler functions directly with constructed `Request`s,
// mirroring tests/integration/report-groups-route.test.ts's shape (Story
// 1.5) for the auth-gating matrix, and
// tests/characterization/admin-members-auth-manager.test.ts's shape (Story
// 3.2) for mocks/fixture-seeding.
//
// What's real: every route handler under test, every manager/db function it
// calls, and every Postgres RPC underneath, run against the local
// `supabase start` instance. What's mocked, and why: only `next/headers`'s
// `cookies()` (no request-scoped cookie store exists in a plain Vitest run
// -- needed by the two /api/auth routes, which read/write the app-token
// cookie themselves) and `@/lib/supabase/server` (so this suite can run
// requests "as" several different already-authenticated users without a
// real login/cookie ceremony per call, and so authManager.signIn/signOut
// can run through a real @supabase/ssr client wired to the mocked cookie
// jar). requireApiToken/signAppToken (Story 1.4) are NOT mocked -- this
// suite uses real signed app tokens throughout, exactly as Story 1.5's own
// route suite does.

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
// Same fixed password every scripts/seed-*.mjs script uses for every
// account it creates (see scripts/seed-demo-company.mjs).
const PASSWORD = "kairos123";
// Exactly one seeded row in platform_admins (supabase/migrations/
// 0016_platform_admin_org_creation.sql) -- same account Story 3.1's/3.2's
// suites use, there is no other way to exercise
// create_organization_as_admin/update_organization_name's success path.
const PLATFORM_ADMIN_EMAIL = "david.abarca@gmail.com";

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY -- deben venir de " +
      ".env.test.local (npx supabase start). Ver vitest.config.ts."
  );
}
// Hard boundary carried over from Stories 1.1/1.2/3.1/3.2: never run this
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
// Mocks -- same shape as tests/characterization/admin-members-auth-manager.test.ts
// (Story 3.2), see file header for what and why.
// ---------------------------------------------------------------------------

type CookieOptions = Record<string, unknown> | undefined;
type CookieEntry = { value: string; options: CookieOptions };

const state = vi.hoisted(() => ({
  token: null as string | null,
  mode: "token" as "token" | "cookies",
  jar: new Map<string, CookieEntry>(),
}));

/** Subsequent manager calls (via the routes under test) act as this
 * already-authenticated user. */
function actingAs(token: string) {
  state.mode = "token";
  state.token = token;
}

/** Subsequent manager calls go through a real @supabase/ssr server client
 * wired to the mocked cookie jar -- for /api/auth/signin's underlying
 * authManager.signIn, which needs a real session-persisting client
 * underneath signInWithPassword. */
function actingWithRealSession() {
  state.mode = "cookies";
  state.token = null;
}

function resetCookieJar() {
  state.jar.clear();
}

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => Array.from(state.jar.entries()).map(([name, { value }]) => ({ name, value })),
    get: (name: string) => {
      const entry = state.jar.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    has: (name: string) => state.jar.has(name),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      state.jar.set(name, { value, options });
    },
    delete: (name: string) => {
      state.jar.delete(name);
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async (): Promise<SupabaseClient> => {
    if (state.mode === "cookies") {
      const cookieStore = await cookies();
      return createServerClient(SUPABASE_URL, ANON_KEY, {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) =>
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
        },
      });
    }
    if (!state.token) {
      throw new Error("test bug: actingAs(token) must be called before invoking a route handler");
    }
    return createSupabaseJsClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${state.token}` } },
    });
  },
}));

// Imported after the mocks above are declared (Vitest hoists `vi.mock` to
// the top of the module regardless of source order) so every route file's
// own import of the manager (and the manager's own import of
// @/lib/supabase/server) picks up the mocked client factory.
import * as adminManager from "@/server/managers/adminManager";
import * as membersManager from "@/server/managers/membersManager";
import * as authManager from "@/server/managers/authManager";

import { GET as adminStatusRoute } from "@/app/api/admin/status/route";
import { GET as listOrgsRoute, POST as createOrgRoute } from "@/app/api/admin/organizations/route";
import { PATCH as renameOrgRoute } from "@/app/api/admin/organizations/[id]/route";
import { GET as listMembersRoute } from "@/app/api/members/route";
import { POST as inviteMemberRoute } from "@/app/api/members/invite/route";
import { POST as createDepartmentRoute } from "@/app/api/members/departments/route";
import { POST as acceptInviteRoute } from "@/app/api/members/accept-invite/route";
import { POST as claimPendingRoute } from "@/app/api/members/claim-pending/route";
import { POST as signinRoute } from "@/app/api/auth/signin/route";
import { POST as signoutRoute } from "@/app/api/auth/signout/route";

import { APP_TOKEN_COOKIE, APP_TOKEN_TTL_SECONDS, CSRF_HEADER, signAppToken } from "@/server/shared/auth";

// ---------------------------------------------------------------------------
// Small REST/auth helpers -- same anon-key-only pattern as
// tests/characterization/admin-members-auth-manager.test.ts.
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

/** signup-or-sign-in, same fallback scripts/seed-demo-company.mjs and the
 * Story 3.1/3.2 suites use to bootstrap an account idempotently. */
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Builds a constructed `Request` carrying (optionally) the app-token cookie
 * and/or the anti-CSRF header, per Story 1.4's requireApiToken() contract --
 * same helper shape as tests/integration/report-groups-route.test.ts.
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
// (same note as Story 1.5's own suite).
let appToken: string;
let platformAdminToken: string;

beforeAll(async () => {
  appToken = signAppToken("route-test-user");
  platformAdminToken = await signUpOrSignIn(PLATFORM_ADMIN_EMAIL, PASSWORD);
});

beforeEach(() => {
  resetCookieJar();
});

afterAll(() => {
  state.token = null;
  resetCookieJar();
});

// ---------------------------------------------------------------------------
// Auth gating: every admin/members route rejects a missing token (401) or a
// missing CSRF header on a mutating route (403), and never invokes the
// manager in either case. Mirrors Story 1.5's 9-test shape, generalized to
// this story's 9 auth-gated route functions.
// ---------------------------------------------------------------------------

const DUMMY_ID = "00000000-0000-0000-0000-000000000000";

describe("auth gating -- manager is never invoked on rejection", () => {
  test("GET /api/admin/status: missing app token -> 401 unauthorized, checkIsPlatformAdmin never called", async () => {
    const spy = vi.spyOn(adminManager, "checkIsPlatformAdmin");
    const request = appRequest("https://example.test/api/admin/status", { method: "GET", token: null });
    const response = await adminStatusRoute(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data).toEqual({ error: { code: "unauthorized", message: expect.any(String) } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("GET /api/admin/organizations: missing app token -> 401 unauthorized, listAllOrganizations never called", async () => {
    const spy = vi.spyOn(adminManager, "listAllOrganizations");
    const request = appRequest("https://example.test/api/admin/organizations", { method: "GET", token: null });
    const response = await listOrgsRoute(request);

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/admin/organizations: missing app token -> 401 unauthorized, createOrganization never called", async () => {
    const spy = vi.spyOn(adminManager, "createOrganization");
    const request = appRequest("https://example.test/api/admin/organizations", {
      method: "POST",
      token: null,
      csrf: true,
      body: { orgName: "x", adminEmail: "x@example.test", adminFullName: "X" },
    });
    const response = await createOrgRoute(request);

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/admin/organizations: valid token, missing CSRF header -> 403 forbidden, createOrganization never called", async () => {
    const spy = vi.spyOn(adminManager, "createOrganization");
    const request = appRequest("https://example.test/api/admin/organizations", {
      method: "POST",
      token: appToken,
      csrf: false,
      body: { orgName: "x", adminEmail: "x@example.test", adminFullName: "X" },
    });
    const response = await createOrgRoute(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data).toEqual({ error: { code: "forbidden", message: expect.any(String) } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("PATCH /api/admin/organizations/[id]: missing app token -> 401 unauthorized, renameOrganization never called", async () => {
    const spy = vi.spyOn(adminManager, "renameOrganization");
    const request = appRequest(`https://example.test/api/admin/organizations/${DUMMY_ID}`, {
      method: "PATCH",
      token: null,
      csrf: true,
      body: { newName: "x" },
    });
    const response = await renameOrgRoute(request, { params: Promise.resolve({ id: DUMMY_ID }) });

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("PATCH /api/admin/organizations/[id]: valid token, missing CSRF header -> 403 forbidden, renameOrganization never called", async () => {
    const spy = vi.spyOn(adminManager, "renameOrganization");
    const request = appRequest(`https://example.test/api/admin/organizations/${DUMMY_ID}`, {
      method: "PATCH",
      token: appToken,
      csrf: false,
      body: { newName: "x" },
    });
    const response = await renameOrgRoute(request, { params: Promise.resolve({ id: DUMMY_ID }) });

    expect(response.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("GET /api/members: missing app token -> 401 unauthorized, listMembers never called", async () => {
    const spy = vi.spyOn(membersManager, "listMembers");
    const request = appRequest(`https://example.test/api/members?orgId=${DUMMY_ID}`, {
      method: "GET",
      token: null,
    });
    const response = await listMembersRoute(request);

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/members/invite: missing app token -> 401 unauthorized, inviteNewMember never called", async () => {
    const spy = vi.spyOn(membersManager, "inviteNewMember");
    const request = appRequest("https://example.test/api/members/invite", {
      method: "POST",
      token: null,
      csrf: true,
      body: { email: "x@example.test", fullName: "X", departmentId: DUMMY_ID },
    });
    const response = await inviteMemberRoute(request);

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/members/invite: valid token, missing CSRF header -> 403 forbidden, inviteNewMember never called", async () => {
    const spy = vi.spyOn(membersManager, "inviteNewMember");
    const request = appRequest("https://example.test/api/members/invite", {
      method: "POST",
      token: appToken,
      csrf: false,
      body: { email: "x@example.test", fullName: "X", departmentId: DUMMY_ID },
    });
    const response = await inviteMemberRoute(request);

    expect(response.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/members/departments: missing app token -> 401 unauthorized, createNewDepartment never called", async () => {
    const spy = vi.spyOn(membersManager, "createNewDepartment");
    const request = appRequest("https://example.test/api/members/departments", {
      method: "POST",
      token: null,
      csrf: true,
      body: { name: "x" },
    });
    const response = await createDepartmentRoute(request);

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/members/departments: valid token, missing CSRF header -> 403 forbidden, createNewDepartment never called", async () => {
    const spy = vi.spyOn(membersManager, "createNewDepartment");
    const request = appRequest("https://example.test/api/members/departments", {
      method: "POST",
      token: appToken,
      csrf: false,
      body: { name: "x" },
    });
    const response = await createDepartmentRoute(request);

    expect(response.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/members/accept-invite: missing app token -> 401 unauthorized, acceptInvite never called", async () => {
    const spy = vi.spyOn(membersManager, "acceptInvite");
    const request = appRequest("https://example.test/api/members/accept-invite", {
      method: "POST",
      token: null,
      csrf: true,
      body: { token: "x" },
    });
    const response = await acceptInviteRoute(request);

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/members/accept-invite: valid token, missing CSRF header -> 403 forbidden, acceptInvite never called", async () => {
    const spy = vi.spyOn(membersManager, "acceptInvite");
    const request = appRequest("https://example.test/api/members/accept-invite", {
      method: "POST",
      token: appToken,
      csrf: false,
      body: { token: "x" },
    });
    const response = await acceptInviteRoute(request);

    expect(response.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/members/claim-pending: missing app token -> 401 unauthorized, claimPendingInvitations never called", async () => {
    const spy = vi.spyOn(membersManager, "claimPendingInvitations");
    const request = appRequest("https://example.test/api/members/claim-pending", {
      method: "POST",
      token: null,
      csrf: true,
    });
    const response = await claimPendingRoute(request);

    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/members/claim-pending: valid token, missing CSRF header -> 403 forbidden, claimPendingInvitations never called", async () => {
    const spy = vi.spyOn(membersManager, "claimPendingInvitations");
    const request = appRequest("https://example.test/api/members/claim-pending", {
      method: "POST",
      token: appToken,
      csrf: false,
    });
    const response = await claimPendingRoute(request);

    expect(response.status).toBe(403);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Auth routes' own CSRF-only gating (no requireApiToken() -- see each
// route's file header): missing CSRF header -> 403 forbidden, manager never
// invoked.
// ---------------------------------------------------------------------------

describe("auth routes -- CSRF-only gating (no app token required)", () => {
  test("POST /api/auth/signin: missing CSRF header -> 403 forbidden, authManager.signIn never called", async () => {
    const spy = vi.spyOn(authManager, "signIn");
    const request = appRequest("https://example.test/api/auth/signin", {
      method: "POST",
      csrf: false,
      body: { email: "nadie@example.test", password: "whatever" },
    });
    const response = await signinRoute(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data).toEqual({ error: { code: "forbidden", message: expect.any(String) } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("POST /api/auth/signout: missing CSRF header -> 403 forbidden, authManager.signOut never called", async () => {
    const spy = vi.spyOn(authManager, "signOut");
    const request = appRequest("https://example.test/api/auth/signout", {
      method: "POST",
      csrf: false,
    });
    const response = await signoutRoute(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data).toEqual({ error: { code: "forbidden", message: expect.any(String) } });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Happy-path / validation-error fixture chain, built from scratch through
// the route handlers themselves -- same dependency order as Story 3.2's own
// manager-level suite: org -> Supervisor accept -> rename -> department ->
// member invite -> member accept -> claim-pending -> signin -> signout.
// Exercises every one of this story's 11 new route handlers over at least
// one real, non-mocked-RPC path each.
// ---------------------------------------------------------------------------

const runId = Date.now();
const orgName = `Route Test AMA ${runId}`;
const supervisorEmail = `admin@route-test-ama-${runId}.brujula-fake.test`;
const departmentName = `Departamento Route Test AMA ${runId}`;
const memberEmail = `empleado-${runId}@route-test-ama-${runId}.brujula-fake.test`;

let orgInviteToken: string;
let orgId: string;
let supervisorToken: string;
let departmentId: string;
let memberInviteToken: string;
let memberToken: string;

describe("adminManager.createOrganization -- POST /api/admin/organizations", () => {
  test("non-admin caller -> 422 validation_error, RPC's own platform-admin-only message", async () => {
    const nonAdminEmail = `nonadmin-${runId}@brujula-fake.test`;
    const nonAdminToken = await signUpOrSignIn(nonAdminEmail, PASSWORD);

    actingAs(nonAdminToken);
    const request = appRequest("https://example.test/api/admin/organizations", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { orgName: "Empresa que nunca debería crearse", adminEmail: "nadie@ejemplo.test", adminFullName: "Nadie" },
    });
    const response = await createOrgRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data).toEqual({
      error: {
        code: "validation_error",
        message: "Solo el administrador de la plataforma puede crear empresas.",
      },
    });
  });

  test("malformed body -> 422 validation_error, createOrganization never called", async () => {
    const spy = vi.spyOn(adminManager, "createOrganization");
    const request = new Request("https://example.test/api/admin/organizations", {
      method: "POST",
      headers: {
        cookie: `${APP_TOKEN_COOKIE}=${appToken}`,
        [CSRF_HEADER]: "1",
        "content-type": "application/json",
      },
      body: "{not valid json",
    });
    const response = await createOrgRoute(request);

    expect(response.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("well-formed but invalid body (missing adminFullName) -> 422 validation_error, createOrganization never called", async () => {
    const spy = vi.spyOn(adminManager, "createOrganization");
    const request = appRequest("https://example.test/api/admin/organizations", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { orgName: "x", adminEmail: "x@example.test" },
    });
    const response = await createOrgRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("as platform admin, valid body -> 201 { inviteToken }", async () => {
    actingAs(platformAdminToken);
    const request = appRequest("https://example.test/api/admin/organizations", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { orgName, adminEmail: supervisorEmail, adminFullName: "Supervisor de Prueba" },
    });
    const response = await createOrgRoute(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.inviteToken).toMatch(UUID_RE);
    orgInviteToken = data.inviteToken;
  });
});

describe("membersManager.acceptInvite (first Supervisor) -- POST /api/members/accept-invite", () => {
  test("well-formed but invalid body (missing token) -> 422 validation_error, acceptInvite never called", async () => {
    const spy = vi.spyOn(membersManager, "acceptInvite");
    const request = appRequest("https://example.test/api/members/accept-invite", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: {},
    });
    const response = await acceptInviteRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("valid invite token -> 200 { organizationId }", async () => {
    expect(orgInviteToken, "createOrganization must have run first").toBeDefined();

    supervisorToken = await signUpWithInvite(supervisorEmail, PASSWORD, orgInviteToken);
    actingAs(supervisorToken);
    const request = appRequest("https://example.test/api/members/accept-invite", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { token: orgInviteToken },
    });
    const response = await acceptInviteRoute(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.organizationId).toMatch(UUID_RE);
    orgId = data.organizationId;
  });
});

describe("GET /api/admin/status", () => {
  test("as platform admin -> 200 true", async () => {
    actingAs(platformAdminToken);
    const request = appRequest("https://example.test/api/admin/status", { method: "GET", token: appToken });
    const response = await adminStatusRoute(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toBe(true);
  });

  test("as a regular member -> 200 false", async () => {
    expect(supervisorToken, "the Supervisor must have accepted the invite first").toBeDefined();
    actingAs(supervisorToken);
    const request = appRequest("https://example.test/api/admin/status", { method: "GET", token: appToken });
    const response = await adminStatusRoute(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toBe(false);
  });
});

describe("GET /api/admin/organizations", () => {
  test("as platform admin -> 200 array containing the created org", async () => {
    actingAs(platformAdminToken);
    const request = appRequest("https://example.test/api/admin/organizations", { method: "GET", token: appToken });
    const response = await listOrgsRoute(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((o: { id: string }) => o.id === orgId)).toBe(true);
  });

  test("as a non-admin caller -> 200 [] (list_organizations() is gated by is_platform_admin() internally)", async () => {
    const nonAdminToken = await signUpOrSignIn(`nonadmin-list-${runId}@brujula-fake.test`, PASSWORD);

    actingAs(nonAdminToken);
    const request = appRequest("https://example.test/api/admin/organizations", { method: "GET", token: appToken });
    const response = await listOrgsRoute(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});

describe("PATCH /api/admin/organizations/[id]", () => {
  test("well-formed but invalid body (missing newName) -> 422 validation_error, renameOrganization never called", async () => {
    const spy = vi.spyOn(adminManager, "renameOrganization");
    const request = appRequest(`https://example.test/api/admin/organizations/${DUMMY_ID}`, {
      method: "PATCH",
      token: appToken,
      csrf: true,
      body: {},
    });
    const response = await renameOrgRoute(request, { params: Promise.resolve({ id: DUMMY_ID }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("malformed org id (not a UUID) -> 422 validation_error, friendly message (not Postgres's raw error), renameOrganization never called", async () => {
    const spy = vi.spyOn(adminManager, "renameOrganization");
    const request = appRequest("https://example.test/api/admin/organizations/not-a-uuid", {
      method: "PATCH",
      token: appToken,
      csrf: true,
      body: { newName: "x" },
    });
    const response = await renameOrgRoute(request, { params: Promise.resolve({ id: "not-a-uuid" }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(data.error.message).not.toMatch(/invalid input syntax/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("valid but nonexistent org id -> 422 validation_error, the RPC's own 'Empresa no encontrada' message", async () => {
    actingAs(platformAdminToken);
    const request = appRequest(`https://example.test/api/admin/organizations/${DUMMY_ID}`, {
      method: "PATCH",
      token: appToken,
      csrf: true,
      body: { newName: "x" },
    });
    const response = await renameOrgRoute(request, { params: Promise.resolve({ id: DUMMY_ID }) });

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data).toEqual({
      error: { code: "validation_error", message: "Empresa no encontrada." },
    });
  });

  test("as platform admin, valid newName -> 200 null, renames the org", async () => {
    expect(orgId, "the Supervisor must have accepted the invite first").toBeDefined();
    const newName = `${orgName} (renamed)`;

    actingAs(platformAdminToken);
    const request = appRequest(`https://example.test/api/admin/organizations/${orgId}`, {
      method: "PATCH",
      token: appToken,
      csrf: true,
      body: { newName },
    });
    const response = await renameOrgRoute(request, { params: Promise.resolve({ id: orgId }) });

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();

    const listRequest = appRequest("https://example.test/api/admin/organizations", { method: "GET", token: appToken });
    const listResponse = await listOrgsRoute(listRequest);
    const orgs = await listResponse.json();
    expect(orgs.find((o: { id: string }) => o.id === orgId)?.name).toBe(newName);
  });
});

describe("membersManager.createNewDepartment -- POST /api/members/departments", () => {
  test("well-formed but invalid body (missing name) -> 422 validation_error, createNewDepartment never called", async () => {
    const spy = vi.spyOn(membersManager, "createNewDepartment");
    const request = appRequest("https://example.test/api/members/departments", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: {},
    });
    const response = await createDepartmentRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("as the Supervisor, valid name -> 201 { departmentId }", async () => {
    expect(supervisorToken, "the Supervisor must have accepted the invite first").toBeDefined();

    actingAs(supervisorToken);
    const request = appRequest("https://example.test/api/members/departments", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { name: departmentName },
    });
    const response = await createDepartmentRoute(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.departmentId).toMatch(UUID_RE);
    departmentId = data.departmentId;
  });
});

describe("membersManager.inviteNewMember -- POST /api/members/invite", () => {
  test("well-formed but invalid body (missing departmentId) -> 422 validation_error, inviteNewMember never called", async () => {
    const spy = vi.spyOn(membersManager, "inviteNewMember");
    const request = appRequest("https://example.test/api/members/invite", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { email: "alguien@ejemplo.test", fullName: "Alguien" },
    });
    const response = await inviteMemberRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("invalid department id -> 422 validation_error, the RPC's own exact message", async () => {
    expect(supervisorToken, "the Supervisor must have accepted the invite first").toBeDefined();

    actingAs(supervisorToken);
    const request = appRequest("https://example.test/api/members/invite", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { email: "alguien@ejemplo.test", fullName: "Alguien", departmentId: DUMMY_ID },
    });
    const response = await inviteMemberRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data).toEqual({
      error: {
        code: "validation_error",
        message: "Selecciona un departamento válido de tu organización.",
      },
    });
  });

  test("as the Supervisor, valid department -> 201 { inviteToken }", async () => {
    expect(departmentId, "createNewDepartment must have run first").toBeDefined();

    actingAs(supervisorToken);
    const request = appRequest("https://example.test/api/members/invite", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { email: memberEmail, fullName: "Empleado de Prueba", departmentId },
    });
    const response = await inviteMemberRoute(request);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.inviteToken).toMatch(UUID_RE);
    memberInviteToken = data.inviteToken;
  });
});

describe("GET /api/members", () => {
  test("missing orgId query param -> 422 validation_error, listMembers never called", async () => {
    const spy = vi.spyOn(membersManager, "listMembers");
    actingAs(supervisorToken);
    const request = appRequest("https://example.test/api/members", { method: "GET", token: appToken });
    const response = await listMembersRoute(request);

    expect(response.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("malformed orgId (not a UUID) -> 422 validation_error, friendly message (not Postgres's raw error), listMembers never called", async () => {
    const spy = vi.spyOn(membersManager, "listMembers");
    actingAs(supervisorToken);
    const request = appRequest("https://example.test/api/members?orgId=not-a-uuid", {
      method: "GET",
      token: appToken,
    });
    const response = await listMembersRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(data.error.message).not.toMatch(/invalid input syntax/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("valid orgId, as platform admin -> 200 array including the Supervisor", async () => {
    // list_organization_members (supabase/migrations/0019/0020) is gated by
    // is_platform_admin() internally -- same "Admin general" read-only
    // access pattern as listAllOrganizations, not a Supervisor-facing RPC.
    // A non-admin caller gets an empty array back, not an error (confirmed
    // just below with the Supervisor's own token).
    actingAs(platformAdminToken);
    const request = appRequest(`https://example.test/api/members?orgId=${orgId}`, {
      method: "GET",
      token: appToken,
    });
    const response = await listMembersRoute(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((m: { email: string }) => m.email === supervisorEmail)).toBe(true);
  });

  test("valid orgId, as the Supervisor of that org -> 200 [] (list_organization_members is not a Supervisor-facing RPC)", async () => {
    actingAs(supervisorToken);
    const request = appRequest(`https://example.test/api/members?orgId=${orgId}`, {
      method: "GET",
      token: appToken,
    });
    const response = await listMembersRoute(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});

describe("membersManager.acceptInvite (newly invited member) -- POST /api/members/accept-invite", () => {
  test("valid token, matching email -> 200 { organizationId }", async () => {
    expect(memberInviteToken, "inviteNewMember must have run first").toBeDefined();

    memberToken = await signUpWithInvite(memberEmail, PASSWORD, memberInviteToken);
    actingAs(memberToken);
    const request = appRequest("https://example.test/api/members/accept-invite", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { token: memberInviteToken },
    });
    const response = await acceptInviteRoute(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.organizationId).toBe(orgId);
  });

  test("already-used token -> 422 validation_error, exact 'invalid or already used' message", async () => {
    expect(memberToken, "the previous test must have accepted the invite first").toBeDefined();

    actingAs(memberToken);
    const request = appRequest("https://example.test/api/members/accept-invite", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { token: memberInviteToken },
    });
    const response = await acceptInviteRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data).toEqual({
      error: { code: "validation_error", message: "Invitación no válida o ya utilizada." },
    });
  });
});

describe("membersManager.claimPendingInvitations -- POST /api/members/claim-pending", () => {
  test("as the member -> 200 null", async () => {
    actingAs(memberToken);
    const request = appRequest("https://example.test/api/members/claim-pending", {
      method: "POST",
      token: appToken,
      csrf: true,
    });
    const response = await claimPendingRoute(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// /api/auth/signin, /api/auth/signout -- real cookie set/clear via the
// mocked next/headers jar, real @supabase/ssr session underneath.
// ---------------------------------------------------------------------------

describe("POST /api/auth/signin", () => {
  test("well-formed but invalid body (missing password) -> 422 validation_error, authManager.signIn never called", async () => {
    const spy = vi.spyOn(authManager, "signIn");
    const request = appRequest("https://example.test/api/auth/signin", {
      method: "POST",
      csrf: true,
      body: { email: "alguien@example.test" },
    });
    const response = await signinRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("invalid credentials -> 422 validation_error, Supabase Auth's own exact error message", async () => {
    actingWithRealSession();
    const request = appRequest("https://example.test/api/auth/signin", {
      method: "POST",
      csrf: true,
      body: { email: memberEmail, password: "definitely-the-wrong-password" },
    });
    const response = await signinRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error.code).toBe("validation_error");
    expect(typeof data.error.message).toBe("string");
    expect(data.error.message.length).toBeGreaterThan(0);
  });

  test("valid credentials -> 200 { appToken }, sets the brujula_app_token cookie", async () => {
    expect(memberToken, "the member must have accepted its invite first").toBeDefined();

    actingWithRealSession();
    const request = appRequest("https://example.test/api/auth/signin", {
      method: "POST",
      csrf: true,
      body: { email: memberEmail, password: PASSWORD },
    });
    const response = await signinRoute(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(typeof data.appToken).toBe("string");
    expect(data.appToken.length).toBeGreaterThan(0);

    expect(state.jar.has(APP_TOKEN_COOKIE)).toBe(true);
    const cookieEntry = state.jar.get(APP_TOKEN_COOKIE)!;
    expect(cookieEntry.value).toBe(data.appToken);
    expect(cookieEntry.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: APP_TOKEN_TTL_SECONDS,
    });

    // The issued token itself passes requireApiToken() end to end.
    const gatedRequest = new Request("https://example.test/api/admin/status", {
      method: "GET",
      headers: { cookie: `${APP_TOKEN_COOKIE}=${data.appToken}` },
    });
    const { requireApiToken } = await import("@/server/shared/auth");
    expect(requireApiToken(gatedRequest)).toEqual({ ok: true });
  });
});

describe("POST /api/auth/signout", () => {
  test("any session -> 200 null, clears the brujula_app_token cookie", async () => {
    actingWithRealSession();
    // Prime the jar the way a real signed-in browser would have it.
    state.jar.set(APP_TOKEN_COOKIE, { value: appToken, options: { httpOnly: true } });

    const request = appRequest("https://example.test/api/auth/signout", {
      method: "POST",
      csrf: true,
    });
    const response = await signoutRoute(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
    expect(state.jar.has(APP_TOKEN_COOKIE)).toBe(false);
  });
});
