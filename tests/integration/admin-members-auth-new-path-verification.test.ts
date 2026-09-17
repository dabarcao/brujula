// Story 3.6 (_bmad-output/implementation-artifacts/
// spec-3-6-admin-members-new-path-verification.md): originally the explicit
// gating condition before the admin/members/auth domain's rollback flag was
// ever flipped for real; that flag has since been deleted (spec-5-1b) and
// the manager-backed path below is now the only path -- this file continues
// to serve as the domain's own real-Supabase, real-manager re-verification
// against Story 3.1's characterization baseline. Three sections, all real
// (local Supabase, no manager/RPC mocking, unlike Story 3.5's routing-only
// spies, itself since deleted along with the flag):
//
// (1) re-runs Story 3.1's characterized scenarios
// (tests/characterization/admin-members-auth.test.ts) against the Server
// Actions with the flag forced ON, for all 7 characterized functions/RPCs
// (createOrganizationAsAdmin, updateOrganizationName, inviteMember,
// createDepartment, signIn, signOut, accept_member_invite), asserting the
// exact same redirect URLs / error messages that baseline already
// documents -- not just Story 3.5's 4-of-9 routing sample.
// `accept_member_invite` has no dedicated Server Action (same note Story
// 3.1 makes) -- its new-path equivalent is membersManager.acceptInvite,
// the exact function src/app/dashboard/page.tsx's flag-ON bootstrap branch
// calls, called directly here (exercising the full dashboard render is out
// of this story's scope, see below).
//
// (2) adds the missing non-Supervisor-rejected coverage at the Route
// Handler layer for renameOrganization/inviteMember/createDepartment --
// Story 3.3's own route suite only ever exercises the Supervisor's/admin's
// own successful calls.
//
// (3) one in-process-vs-HTTP equivalence check for createOrganizationAsAdmin,
// mirroring Story 1.8's technique
// (_bmad-output/implementation-artifacts/
// spec-1-8-new-path-verification-against-the-characterization-baseline.md):
// call the manager in-process and the Route Handler over HTTP for the same
// underlying operation against the same seed, and assert both produce the
// same resulting state.
//
// Out of scope (spec's frozen "Never" list): dashboard/page.tsx's
// checkIsPlatformAdmin/claimPendingInvitations branches -- not part of
// Story 3.1's characterized baseline.
//
// What's real: the Server Actions, Route Handlers, managers, db/* layer,
// and every Postgres RPC underneath, run against the local `supabase
// start` instance. What's mocked, and why: only the bits of Next.js
// plumbing that need a live request (`redirect`, `revalidatePath`,
// `next/headers`'s `cookies`) and the cookie-based Supabase client factory
// (`@/lib/supabase/server`) -- exactly Story 3.1's own mocks, needed here
// because Section 1 calls the same Server Actions Story 3.1 does, and
// those Server Actions' new-path branch reaches the same
// `@/lib/supabase/server` factory one layer down (through
// manager -> db/*).

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { APP_TOKEN_COOKIE, CSRF_HEADER, requireApiToken, signAppToken } from "@/server/shared/auth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
// Same fixed password every scripts/seed-*.mjs script uses for every
// account it creates (see scripts/seed-demo-company.mjs).
const PASSWORD = "kairos123";
// Exactly one seeded row in platform_admins (supabase/migrations/
// 0016_platform_admin_org_creation.sql) -- same account every prior
// admin/members/auth suite in this repo uses, there is no other way to
// exercise create_organization_as_admin/update_organization_name's
// success path.
const PLATFORM_ADMIN_EMAIL = "david.abarca@gmail.com";

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY -- deben venir de " +
      ".env.test.local (npx supabase start). Ver vitest.config.ts."
  );
}
// Hard boundary carried over from every prior characterization/integration
// suite in this repo: never run this against a remote Supabase project,
// dev or production -- only the local CLI instance.
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
// Mocks -- identical to tests/characterization/admin-members-auth.test.ts
// (Story 3.1), see file header for what and why.
// ---------------------------------------------------------------------------

type CookieOptions = Record<string, unknown> | undefined;
type CookieEntry = { value: string; options: CookieOptions };

const state = vi.hoisted(() => ({
  token: null as string | null,
  mode: "token" as "token" | "cookies",
  jar: new Map<string, CookieEntry>(),
}));

/** Subsequent Server Action / manager / route calls act as this
 * already-authenticated user (Story 1.1's report-groups pattern). */
function actingAs(token: string) {
  state.mode = "token";
  state.token = token;
}

/** Subsequent Server Action calls go through a real @supabase/ssr server
 * client wired to the mocked cookie jar (auth-signin.test.ts's pattern),
 * for signIn/signOut, which need to observe real cookie writes. */
function actingWithRealSession() {
  state.mode = "cookies";
  state.token = null;
}

function resetCookieJar() {
  state.jar.clear();
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const err = new Error(`test redirect marker: ${url}`) as Error & { redirectUrl: string };
    err.redirectUrl = url;
    throw err;
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

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
      throw new Error("test bug: actingAs(token) must be called before invoking a Server Action");
    }
    return createSupabaseJsClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${state.token}` } },
    });
  },
}));

// Imported after the mocks above are declared (Vitest hoists `vi.mock` to
// the top of the module regardless of source order) so that importing
// these, the unmodified Story 3.4 Server Actions and their unmodified
// Story 3.2/3.3 managers/routes, picks up the mocked `next/navigation`,
// `next/cache`, `next/headers` and `@/lib/supabase/server`.
import { createOrganizationAsAdmin, updateOrganizationName } from "@/app/actions/admin";
import { inviteMember, createDepartment } from "@/app/actions/members";
import { signIn, signOut } from "@/app/actions/auth";
import * as adminManager from "@/server/managers/adminManager";
import * as membersManager from "@/server/managers/membersManager";
import { POST as createOrgRoute } from "@/app/api/admin/organizations/route";
import { PATCH as renameOrgRoute } from "@/app/api/admin/organizations/[id]/route";
import { POST as inviteMemberRoute } from "@/app/api/members/invite/route";
import { POST as createDepartmentRoute } from "@/app/api/members/departments/route";

// ---------------------------------------------------------------------------
// Small REST/auth helpers -- same anon-key-only pattern as every prior
// admin/members/auth suite in this repo.
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

// Story 6.1 (_bmad-output/implementation-artifacts/
// spec-6-1-paginate-admin-organizations-list.md): used only to probe the
// raw `list_organizations` RPC with an explicit p_limit, to prove
// adminManager.listAllOrganizations() (which always calls it zero-arg) is
// genuinely unbounded rather than coincidentally matching some default
// limit -- its own OrganizationSummary type has no total_count field, so
// that comparison can't be done through the manager alone.
async function callRpc(name: string, token: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`RPC ${name} failed (${res.status}): ${JSON.stringify(data)}`);
  return data;
}

/** Calls a mocked Server Action and returns the URL it "redirected" to --
 * same helper Story 3.1's/3.5's own suites use. */
async function getRedirectUrl(action: () => Promise<void>): Promise<string> {
  try {
    await action();
  } catch (e) {
    const url = (e as { redirectUrl?: string }).redirectUrl;
    if (url) return url;
    throw e;
  }
  throw new Error("expected the Server Action to redirect, but it returned normally");
}

function errorFromRedirect(url: string, prefix: string): string {
  expect(url.startsWith(prefix)).toBe(true);
  return decodeURIComponent(url.slice(url.indexOf("error=") + "error=".length));
}

/** Builds a constructed `Request` carrying (optionally) the app-token
 * cookie and/or the anti-CSRF header, per Story 1.4's requireApiToken()
 * contract -- same helper tests/integration/admin-members-auth-route.test.ts
 * (Story 3.3) uses. */
function appRequest(
  url: string,
  init: { method?: string; token?: string | null; csrf?: boolean; body?: unknown } = {}
): Request {
  const headers = new Headers();
  if (init.token) headers.set("cookie", `${APP_TOKEN_COOKIE}=${init.token}`);
  if (init.csrf) headers.set(CSRF_HEADER, "1");
  let body: string | undefined;
  if (init.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(init.body);
  }
  return new Request(url, { method: init.method ?? "GET", headers, body });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let platformAdminToken: string;
let appToken: string;

beforeAll(async () => {
  platformAdminToken = await signUpOrSignIn(PLATFORM_ADMIN_EMAIL, PASSWORD);
  appToken = signAppToken("new-path-verification-user");
});

beforeEach(() => {
  resetCookieJar();
});

afterAll(() => {
  state.token = null;
  resetCookieJar();
});

// ---------------------------------------------------------------------------
// Section (1): Story 3.1's characterized scenarios, re-run against the
// Server Actions with the flag forced ON -- same fixture dependency chain
// Story 3.1 itself uses: org -> Supervisor accept -> rename -> department
// -> member invite -> member accept -> login/logout. Every assertion below
// is copied verbatim from tests/characterization/admin-members-auth.test.ts.
// ---------------------------------------------------------------------------

const runId = Date.now();
const orgName = `New Path Verif Admin ${runId}`;
const supervisorEmail = `admin@new-path-verif-${runId}.brujula-fake.test`;
const departmentName = `Departamento New Path Verif ${runId}`;
const memberEmail = `empleado-${runId}@new-path-verif-${runId}.brujula-fake.test`;

let orgInviteToken: string;
let orgId: string;
let supervisorToken: string;
let departmentId: string;
let memberInviteToken: string;
let memberToken: string;

describe("Section 1: createOrganizationAsAdmin (flag ON)", () => {
  test("non-admin caller -> redirects to /admin?error= with the exact platform-admin-only message", async () => {
    const nonAdminEmail = `nonadmin-${runId}@brujula-fake.test`;
    const nonAdminToken = await signUpOrSignIn(nonAdminEmail, PASSWORD);

    const fd = new FormData();
    fd.set("orgName", "Empresa que nunca debería crearse");
    fd.set("adminEmail", "nadie@ejemplo.test");
    fd.set("adminFullName", "Nadie");

    actingAs(nonAdminToken);
    const url = await getRedirectUrl(() => createOrganizationAsAdmin(fd));

    const message = errorFromRedirect(url, "/admin?error=");
    // Recorded verbatim in Story 3.1's baseline.
    expect(message).toBe("Solo el administrador de la plataforma puede crear empresas.");
  });

  test("as platform admin, valid input -> creates the org+first-Supervisor invite, redirects to /admin?created=", async () => {
    const fd = new FormData();
    fd.set("orgName", orgName);
    fd.set("adminEmail", supervisorEmail);
    fd.set("adminFullName", "Supervisor de Prueba");

    actingAs(platformAdminToken);
    const url = await getRedirectUrl(() => createOrganizationAsAdmin(fd));

    expect(url.startsWith("/admin?created=")).toBe(true);
    const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    const inviteToken = params.get("created")!;
    expect(inviteToken).toMatch(UUID_RE);
    expect(params.get("createdEmail")).toBe(supervisorEmail);
    expect(params.get("createdOrg")).toBe(orgName);

    orgInviteToken = inviteToken;
  });
});

// membersManager.acceptInvite -- accept_member_invite has no dedicated
// Server Action (same note Story 3.1's own suite makes); its new-path
// equivalent is this exact function, the one src/app/dashboard/page.tsx's
// flag-ON bootstrap branch calls. Exercising the full DashboardPage()
// render is Story 3.5's job (routing only) and out of this story's scope
// (spec's frozen "Never" list excludes dashboard/page.tsx's other
// branches) -- calling the manager function directly is the closest
// available new-path entry point for a function with no Server Action,
// mirroring Story 3.1's own choice to call the RPC directly.
describe("Section 1: membersManager.acceptInvite (first Supervisor) -- accept_member_invite's new-path equivalent", () => {
  test("valid invite token, matching email -> membership active, is_supervisor=true, returns organizationId", async () => {
    expect(orgInviteToken, "createOrganizationAsAdmin must have run first").toBeDefined();

    supervisorToken = await signUpWithInvite(supervisorEmail, PASSWORD, orgInviteToken);
    actingAs(supervisorToken);
    const { organizationId } = await membersManager.acceptInvite(orgInviteToken);

    expect(organizationId).toMatch(UUID_RE);
    orgId = organizationId;

    const rows = (await restGet(
      `members?select=status,is_supervisor,organization_id&email=eq.${encodeURIComponent(supervisorEmail)}`,
      supervisorToken
    )) as { status: string; is_supervisor: boolean; organization_id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("active");
    expect(rows[0].is_supervisor).toBe(true);
    expect(rows[0].organization_id).toBe(orgId);
  });
});

describe("Section 1: updateOrganizationName (flag ON)", () => {
  test("as platform admin, valid org id + new name -> renames, redirects to /admin/empresas/{id}?updated=1", async () => {
    expect(orgId, "the Supervisor must have accepted the invite first").toBeDefined();
    const newName = `${orgName} (renamed)`;

    const fd = new FormData();
    fd.set("orgId", orgId);
    fd.set("newName", newName);

    actingAs(platformAdminToken);
    const url = await getRedirectUrl(() => updateOrganizationName(fd));

    expect(url).toBe(`/admin/empresas/${orgId}?updated=1`);

    const orgs = await adminManager.listAllOrganizations();
    const updated = orgs.find((o) => o.id === orgId);
    expect(updated?.name).toBe(newName);
  });

  test("non-platform-admin caller -> redirects to /admin/empresas/{id}?error= with the exact platform-admin-only message", async () => {
    expect(orgId, "the Supervisor must have accepted the invite first").toBeDefined();
    expect(supervisorToken, "the Supervisor must have accepted the invite first").toBeDefined();

    const fd = new FormData();
    fd.set("orgId", orgId);
    fd.set("newName", "Nombre que nunca debería aplicarse");

    actingAs(supervisorToken);
    const url = await getRedirectUrl(() => updateOrganizationName(fd));

    const message = errorFromRedirect(url, `/admin/empresas/${orgId}?error=`);
    expect(message).toBe("Solo el administrador de la plataforma puede editar empresas.");
  });
});

// ---------------------------------------------------------------------------
// Story 6.1 (_bmad-output/implementation-artifacts/
// spec-6-1-paginate-admin-organizations-list.md): list_organizations()
// grew optional p_limit/p_offset/total_count -- this asserts
// adminManager.listAllOrganizations() (which always calls it zero-arg, per
// db/admin.ts) keeps returning the complete, unpaginated set, unchanged.
// ---------------------------------------------------------------------------

describe("Section 1: adminManager.listAllOrganizations, zero-argument backward compatibility (Story 6.1)", () => {
  test("as platform admin -> returns the complete unpaginated set, genuinely unbounded", async () => {
    expect(orgId, "the Supervisor must have accepted the invite first").toBeDefined();

    actingAs(platformAdminToken);
    const orgs = await adminManager.listAllOrganizations();
    expect(orgs.length).toBeGreaterThan(0);
    expect(orgs.some((o) => o.id === orgId)).toBe(true);

    // Confirms the manager's zero-arg call is genuinely unbounded (not
    // coincidentally matching some default limit) by comparing its count
    // against the raw RPC's own total_count under an explicit small
    // p_limit.
    const limited = (await callRpc("list_organizations", platformAdminToken, {
      p_limit: 1,
      p_offset: 0,
    })) as { total_count: number }[];
    expect(limited).toHaveLength(1);
    expect(Number(limited[0].total_count)).toBe(orgs.length);
  });
});

describe("Section 1: createDepartment (flag ON)", () => {
  test("as the Supervisor, valid name -> creates the department, redirects to /dashboard/members", async () => {
    expect(supervisorToken, "the Supervisor must have accepted the invite first").toBeDefined();

    const fd = new FormData();
    fd.set("name", departmentName);

    actingAs(supervisorToken);
    const url = await getRedirectUrl(() => createDepartment(fd));

    expect(url).toBe("/dashboard/members");

    const rows = (await restGet(
      `departments?select=id&organization_id=eq.${orgId}&name=eq.${encodeURIComponent(departmentName)}`,
      supervisorToken
    )) as { id: string }[];
    expect(rows).toHaveLength(1);
    departmentId = rows[0].id;
  });

  test("empty name -> redirects to /dashboard/members?error= with the exact pre-RPC validation message", async () => {
    expect(supervisorToken, "the Supervisor must have accepted the invite first").toBeDefined();

    const fd = new FormData();
    fd.set("name", "");

    // Reaches createDepartment's own client-side `if (!name)` check, which
    // is flag-independent (it runs before the flag branch) -- included
    // anyway for full parity with Story 3.1's baseline.
    actingAs(supervisorToken);
    const url = await getRedirectUrl(() => createDepartment(fd));

    const message = errorFromRedirect(url, "/dashboard/members?error=");
    expect(message).toBe("El nombre es obligatorio.");
  });
});

describe("Section 1: inviteMember (flag ON)", () => {
  test("missing department -> redirects to /dashboard/members?error= with the exact pre-RPC validation message", async () => {
    expect(supervisorToken, "the Supervisor must have accepted the invite first").toBeDefined();

    const fd = new FormData();
    fd.set("email", "alguien@ejemplo.test");
    fd.set("fullName", "Alguien");
    fd.set("departmentId", "");

    actingAs(supervisorToken);
    const url = await getRedirectUrl(() => inviteMember(fd));

    const message = errorFromRedirect(url, "/dashboard/members?error=");
    expect(message).toBe("El email y el departamento son obligatorios.");
  });

  test("as the Supervisor, valid department -> invites the member, redirects to /dashboard/members?invited=", async () => {
    expect(departmentId, "createDepartment must have run first").toBeDefined();

    const fd = new FormData();
    fd.set("email", memberEmail);
    fd.set("fullName", "Empleado de Prueba");
    fd.set("departmentId", departmentId);

    actingAs(supervisorToken);
    const url = await getRedirectUrl(() => inviteMember(fd));

    expect(url.startsWith("/dashboard/members?invited=")).toBe(true);
    const params = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    memberInviteToken = params.get("invited")!;
    expect(memberInviteToken).toMatch(UUID_RE);
    expect(params.get("invitedEmail")).toBe(memberEmail);
  });
});

describe("Section 1: membersManager.acceptInvite (newly invited member) -- accept_member_invite's new-path equivalent", () => {
  test("valid token, matching email -> membership active, is_supervisor=false", async () => {
    expect(memberInviteToken, "inviteMember must have run first").toBeDefined();

    memberToken = await signUpWithInvite(memberEmail, PASSWORD, memberInviteToken);
    actingAs(memberToken);
    const { organizationId } = await membersManager.acceptInvite(memberInviteToken);
    expect(organizationId).toBe(orgId);

    const rows = (await restGet(
      `members?select=status,is_supervisor&email=eq.${encodeURIComponent(memberEmail)}`,
      memberToken
    )) as { status: string; is_supervisor: boolean }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("active");
    expect(rows[0].is_supervisor).toBe(false);
  });

  test("already-used token -> throws the exact 'invalid or already used' message", async () => {
    expect(memberToken, "the previous test must have accepted the invite first").toBeDefined();

    actingAs(memberToken);
    await expect(membersManager.acceptInvite(memberInviteToken)).rejects.toThrow(
      "Invitación no válida o ya utilizada."
    );
  });
});

function formDataFor(email: string, password: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  return fd;
}

function nonAppTokenCookies(): [string, CookieEntry][] {
  return Array.from(state.jar.entries()).filter(([name]) => name !== APP_TOKEN_COOKIE);
}

describe("Section 1: signIn (flag ON)", () => {
  test("valid credentials -> redirects to /dashboard, sets both the Supabase session cookie(s) and brujula_app_token", async () => {
    expect(memberToken, "the member must have accepted its invite first").toBeDefined();

    actingWithRealSession();
    const url = await getRedirectUrl(() => signIn(formDataFor(memberEmail, PASSWORD)));
    expect(url).toBe("/dashboard");

    expect(nonAppTokenCookies().length).toBeGreaterThan(0);

    const appTokenEntry = state.jar.get(APP_TOKEN_COOKIE);
    expect(appTokenEntry).toBeDefined();
    expect(appTokenEntry!.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });

    const request = new Request("https://example.test/api/report-groups", {
      method: "GET",
      headers: { cookie: `${APP_TOKEN_COOKIE}=${appTokenEntry!.value}` },
    });
    expect(requireApiToken(request)).toEqual({ ok: true });
  });

  test("invalid credentials -> redirects to /login?error=, no app token issued", async () => {
    expect(memberToken, "the member must have accepted its invite first").toBeDefined();

    actingWithRealSession();
    const url = await getRedirectUrl(() => signIn(formDataFor(memberEmail, "definitely-the-wrong-password")));

    expect(url.startsWith("/login?error=")).toBe(true);
    expect(state.jar.has(APP_TOKEN_COOKIE)).toBe(false);
  });
});

describe("Section 1: signOut (flag ON)", () => {
  test("logged-in session -> redirects to /login, clears the app-token cookie", async () => {
    expect(memberToken, "the member must have accepted its invite first").toBeDefined();

    actingWithRealSession();
    await getRedirectUrl(() => signIn(formDataFor(memberEmail, PASSWORD)));
    expect(state.jar.has(APP_TOKEN_COOKIE)).toBe(true);

    const url = await getRedirectUrl(() => signOut());

    // Fixed: used to redirect to "/" (the marketing landing page), leaving
    // a signed-out user an extra click away from logging back in -- now
    // goes straight to /login.
    expect(url).toBe("/login");
    expect(state.jar.has(APP_TOKEN_COOKIE)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section (2): non-Supervisor-rejected coverage at the Route Handler layer
// for renameOrganization/inviteMember/createDepartment -- Story 3.3's own
// route suite (tests/integration/admin-members-auth-route.test.ts) never
// exercises a non-Supervisor/non-admin rejection on an org-management
// action, only the authorized caller's own successful path. Each assertion
// below is the exact rejection message already characterized/tested at the
// manager layer by Story 3.2 (tests/characterization/
// admin-members-auth-manager.test.ts) -- this story proves the Route
// Handler surfaces it correctly (thrown-not-swallowed, 422
// validation_error), not that the message itself is right. A `vi.spyOn`
// (calling through to the real implementation, never mocked) proves the
// route actually reached the manager and the manager threw, not a
// coincidentally-matching 422 from an earlier validation layer.
// ---------------------------------------------------------------------------

describe("Section 2: PATCH /api/admin/organizations/[id] -- non-platform-admin caller rejected", () => {
  test("as the Supervisor (not the platform admin) -> 422 validation_error, the RPC's own platform-admin-only message", async () => {
    expect(orgId, "Section 1's fixture chain must have run first").toBeDefined();
    expect(supervisorToken, "Section 1's fixture chain must have run first").toBeDefined();

    const spy = vi.spyOn(adminManager, "renameOrganization");
    try {
      actingAs(supervisorToken);
      const request = appRequest(`https://example.test/api/admin/organizations/${orgId}`, {
        method: "PATCH",
        token: appToken,
        csrf: true,
        body: { newName: "Nombre que nunca debería aplicarse (route)" },
      });
      const response = await renameOrgRoute(request, { params: Promise.resolve({ id: orgId }) });

      expect(response.status).toBe(422);
      const data = await response.json();
      expect(data).toEqual({
        error: {
          code: "validation_error",
          message: "Solo el administrador de la plataforma puede editar empresas.",
        },
      });
      expect(spy).toHaveBeenCalledWith(orgId, "Nombre que nunca debería aplicarse (route)");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("Section 2: POST /api/members/invite -- non-Supervisor caller rejected", () => {
  test("as a regular member (not a Supervisor of the org) -> 422 validation_error, the RPC's own not-authorized message", async () => {
    expect(departmentId, "Section 1's fixture chain must have run first").toBeDefined();
    expect(memberToken, "Section 1's fixture chain must have run first").toBeDefined();

    const spy = vi.spyOn(membersManager, "inviteNewMember");
    try {
      actingAs(memberToken);
      const request = appRequest("https://example.test/api/members/invite", {
        method: "POST",
        token: appToken,
        csrf: true,
        body: { email: "alguien@ejemplo.test", fullName: "Alguien", departmentId },
      });
      const response = await inviteMemberRoute(request);

      expect(response.status).toBe(422);
      const data = await response.json();
      expect(data).toEqual({
        error: {
          code: "validation_error",
          message: "Solo un administrador puede invitar empleados.",
        },
      });
      expect(spy).toHaveBeenCalledWith("alguien@ejemplo.test", "Alguien", departmentId);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("Section 2: POST /api/members/departments -- non-Supervisor caller rejected", () => {
  test("as a regular member (not a Supervisor of the org) -> 422 validation_error, the RPC's own not-authorized message", async () => {
    expect(memberToken, "Section 1's fixture chain must have run first").toBeDefined();

    const spy = vi.spyOn(membersManager, "createNewDepartment");
    try {
      actingAs(memberToken);
      const request = appRequest("https://example.test/api/members/departments", {
        method: "POST",
        token: appToken,
        csrf: true,
        body: { name: "Departamento que nunca debería crearse" },
      });
      const response = await createDepartmentRoute(request);

      expect(response.status).toBe(422);
      const data = await response.json();
      expect(data).toEqual({
        error: {
          code: "validation_error",
          message: "Solo un administrador puede crear departamentos.",
        },
      });
      expect(spy).toHaveBeenCalledWith("Departamento que nunca debería crearse");
    } finally {
      spy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Section (3): one in-process-vs-HTTP equivalence check for
// createOrganizationAsAdmin, mirroring Story 1.8's technique -- call the
// manager in-process and the Route Handler over HTTP for the same
// underlying operation (same platform admin, structurally identical
// input), then assert both produce the same resulting state: an
// `organizations` row (via listAllOrganizations/list_organizations, the
// platform admin's own read path) with the matching name and a Supervisor
// invite for the matching admin email.
// ---------------------------------------------------------------------------

describe("Section 3: createOrganizationAsAdmin in-process vs. POST /api/admin/organizations over HTTP", () => {
  test("same seed shape -> both produce an organizations row with the matching name/admin email", async () => {
    const inProcessOrgName = `Equiv InProcess ${runId}`;
    const inProcessAdminEmail = `equiv-inprocess-${runId}@brujula-fake.test`;

    actingAs(platformAdminToken);
    const { inviteToken: inProcessInviteToken } = await adminManager.createOrganization(
      inProcessOrgName,
      inProcessAdminEmail,
      "Equiv InProcess Admin"
    );
    expect(inProcessInviteToken).toMatch(UUID_RE);

    const routeOrgName = `Equiv Route ${runId}`;
    const routeAdminEmail = `equiv-route-${runId}@brujula-fake.test`;

    actingAs(platformAdminToken);
    const request = appRequest("https://example.test/api/admin/organizations", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: { orgName: routeOrgName, adminEmail: routeAdminEmail, adminFullName: "Equiv Route Admin" },
    });
    const response = await createOrgRoute(request);
    expect(response.status).toBe(201);
    const { inviteToken: routeInviteToken } = await response.json();
    expect(routeInviteToken).toMatch(UUID_RE);

    // Same resulting state: both created orgs exist, each with the
    // Supervisor invite pending for its own matching admin email -- the
    // two calls are structurally equivalent, not just superficially
    // returning a UUID each.
    actingAs(platformAdminToken);
    const orgs = await adminManager.listAllOrganizations();
    const inProcessOrg = orgs.find((o) => o.name === inProcessOrgName);
    const routeOrg = orgs.find((o) => o.name === routeOrgName);

    expect(inProcessOrg).toBeDefined();
    expect(routeOrg).toBeDefined();
    expect(inProcessOrg?.supervisorEmail).toBe(inProcessAdminEmail);
    expect(routeOrg?.supervisorEmail).toBe(routeAdminEmail);
    // Identical shape: both invites are freshly created and pending.
    expect(inProcessOrg?.supervisorStatus).toBe("invited");
    expect(routeOrg?.supervisorStatus).toBe(inProcessOrg?.supervisorStatus);
  });

  // Story 1.8 (the precedent this section mirrors) was itself patched during
  // its own review to add a rejection-path equivalence test alongside the
  // success-path one -- same gap here. Reuses Section 2's non-admin fixture
  // (the Supervisor token, not the platform admin) rather than building a
  // new one.
  test("same non-admin caller -> both surfaces reject with the same message/shape", async () => {
    expect(orgId, "Section 1's fixture chain must have run first").toBeDefined();
    expect(supervisorToken, "Section 1's fixture chain must have run first").toBeDefined();

    actingAs(supervisorToken);
    const fd = new FormData();
    fd.set("orgName", "Empresa que nunca debería crearse (equiv in-process)");
    fd.set("adminEmail", "nadie-equiv-inprocess@ejemplo.test");
    fd.set("adminFullName", "Nadie");
    const url = await getRedirectUrl(() => createOrganizationAsAdmin(fd));
    const inProcessMessage = errorFromRedirect(url, "/admin?error=");
    expect(inProcessMessage).toBe("Solo el administrador de la plataforma puede crear empresas.");

    actingAs(supervisorToken);
    const request = appRequest("https://example.test/api/admin/organizations", {
      method: "POST",
      token: appToken,
      csrf: true,
      body: {
        orgName: "Empresa que nunca debería crearse (equiv route)",
        adminEmail: "nadie-equiv-route@ejemplo.test",
        adminFullName: "Nadie",
      },
    });
    const response = await createOrgRoute(request);

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data).toEqual({
      error: {
        code: "validation_error",
        message: inProcessMessage,
      },
    });
  });
});
