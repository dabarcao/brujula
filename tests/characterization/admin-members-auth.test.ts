// Story 3.1 (_bmad-output/implementation-artifacts/
// spec-3-1-characterization-tests-admin-members-auth-baseline.md):
// characterization tests for src/app/actions/{admin,auth,members}.ts and
// the direct `accept_member_invite` RPC call in src/app/dashboard/page.tsx,
// run UNMODIFIED against a real, local `supabase start` instance. This is
// the baseline Epic 3's admin/members/auth domain migration re-verifies
// against, the same discipline Story 1.1 established for report groups.
//
// What's real: the Server Actions themselves (createOrganizationAsAdmin,
// updateOrganizationName, inviteMember, createDepartment, signIn,
// signOut), every Postgres RPC they call, and -- for accept_member_invite,
// which has no dedicated Server Action -- the RPC itself, called the same
// way dashboard/page.tsx calls it.
//
// What's mocked, and why: only the bits of Next.js plumbing that need a
// live request (`redirect`, `revalidatePath`, `next/headers`'s `cookies`)
// and the cookie-based Supabase client factory (`@/lib/supabase/server`).
// `redirect()` is mocked the same "throw a marker carrying the target URL"
// way report-groups.test.ts uses.
//
// `@/lib/supabase/server`'s mock has to do double duty, because this one
// file exercises two different precedents at once:
//   - createOrganizationAsAdmin/updateOrganizationName/inviteMember/
//     createDepartment only ever call `supabase.rpc(...)`, and this suite
//     needs to run them "as" several different already-authenticated
//     users (the platform admin, a non-admin, the new Supervisor) without
//     a real login/cookie ceremony per call -- Story 1.1's report-groups
//     pattern: a bare @supabase/supabase-js client carrying the acting
//     user's access token as an Authorization header. See `actingAs()`.
//   - signIn/signOut do their own real `supabase.auth.*` login/logout and
//     the spec requires confirming the real Supabase session cookie(s)
//     actually get set/cleared -- that only happens through a real
//     @supabase/ssr server client wired to a cookie store, exactly
//     auth-signin.test.ts's pattern. See `actingWithRealSession()`.
// A plain `vi.mock` can't vary by caller, so the factory below switches
// behavior on an explicit mode flag instead of picking one pattern and
// forcing the other domain to fit it.

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { APP_TOKEN_COOKIE, requireApiToken } from "@/server/shared/auth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
// Same fixed password every scripts/seed-*.mjs script uses for every
// account it creates (see scripts/seed-demo-company.mjs).
const PASSWORD = "kairos123";
// Exactly one seeded row in platform_admins (supabase/migrations/
// 0016_platform_admin_org_creation.sql) -- there is no other way to
// exercise create_organization_as_admin/update_organization_name's
// success path, per this story's own Intent section.
const PLATFORM_ADMIN_EMAIL = "david.abarca@gmail.com";

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY -- deben venir de " +
      ".env.test.local (npx supabase start). Ver vitest.config.ts."
  );
}
// Hard boundary from the spec: never run this suite against a remote
// Supabase project, dev or production -- only the local CLI instance.
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

type CookieOptions = Record<string, unknown> | undefined;
type CookieEntry = { value: string; options: CookieOptions };

const state = vi.hoisted(() => ({
  token: null as string | null,
  mode: "token" as "token" | "cookies",
  jar: new Map<string, CookieEntry>(),
}));

/** Subsequent Server Action calls act as this already-authenticated user
 * (Story 1.1's report-groups pattern -- see file header). */
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
      // Real @supabase/ssr client, same wiring as the unmocked
      // src/lib/supabase/server.ts -- only its cookie store is swapped
      // for the in-memory jar above (via the mocked next/headers, imported
      // above -- closures resolve free variables at call time, so this is
      // safe regardless of module-evaluation order).
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
// these, the unmodified action modules, picks up the mocked
// `next/navigation`, `next/cache`, `next/headers` and
// `@/lib/supabase/server`.
import { createOrganizationAsAdmin, updateOrganizationName } from "@/app/actions/admin";
import { inviteMember, createDepartment } from "@/app/actions/members";
import { signIn, signOut } from "@/app/actions/auth";

// ---------------------------------------------------------------------------
// Small REST/RPC/auth helpers -- same anon-key-only pattern as
// scripts/seed-*.mjs and tests/characterization/report-groups.test.ts.
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

/** signup-or-sign-in, same fallback scripts/seed-demo-company.mjs uses to
 * bootstrap the platform admin's local auth account idempotently. */
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

/** signup carrying a pending invite token, same as scripts/seed-demo-company.mjs's
 * signUpWithInvite -- confirmations are disabled locally, so this returns
 * a usable access token immediately. */
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

/** Calls an RPC expected to raise, and returns its exact `raise exception`
 * text (PostgREST's `message` field) -- or throws if the call unexpectedly
 * succeeds. Same exact-string-match rigor as the redirect-based error
 * assertions below, for the one RPC (`accept_member_invite`) with no
 * Server Action wrapping it. */
async function callRpcExpectingError(
  name: string,
  token: string,
  body: Record<string, unknown>
): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (res.ok) throw new Error(`expected ${name} to fail, but it returned ${JSON.stringify(data)}`);
  return data.message as string;
}

/** Calls a mocked Server Action and returns the URL it "redirected" to. */
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Fixture: everything is built from scratch through the real actions/RPCs
// themselves, chained in dependency order, per the spec's Approach --
// unlike report-groups.test.ts / auth-signin.test.ts this suite does NOT
// shell out to scripts/seed-demo-company.mjs, since the whole point here
// is to characterize the org/department/member creation behaviors that
// script only uses as internal plumbing.
// ---------------------------------------------------------------------------

let platformAdminToken: string;
const runId = Date.now();
const orgName = `Char Test Admin ${runId}`;
const supervisorEmail = `admin@char-test-admin-${runId}.brujula-fake.test`;
const departmentName = `Departamento Char Test ${runId}`;
const memberEmail = `empleado-${runId}@char-test-admin-${runId}.brujula-fake.test`;

// State threaded through the chained describe blocks below, each one
// filled in by an earlier step in the dependency chain the spec lays out:
// org -> Supervisor accept -> department -> member invite -> member accept
// -> login/logout.
let orgInviteToken: string;
let orgId: string;
let supervisorToken: string;
let departmentId: string;
let memberInviteToken: string;
let memberToken: string;

beforeAll(async () => {
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
// createOrganizationAsAdmin
// ---------------------------------------------------------------------------

describe("createOrganizationAsAdmin", () => {
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
    // Recorded verbatim from create_organization_as_admin's raised
    // exception (supabase/migrations/0017_supervisor_and_admin_management.sql).
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

// ---------------------------------------------------------------------------
// accept_member_invite -- the new org's first Supervisor. No dedicated
// Server Action wraps this RPC; called directly, the same way
// src/app/dashboard/page.tsx does (see its ~lines 39-95).
// ---------------------------------------------------------------------------

describe("accept_member_invite (first Supervisor)", () => {
  test("valid invite token, matching email -> membership active, is_supervisor=true, returns organization_id", async () => {
    expect(orgInviteToken, "createOrganizationAsAdmin must have run first").toBeDefined();

    supervisorToken = await signUpWithInvite(supervisorEmail, PASSWORD, orgInviteToken);
    const result = await callRpc("accept_member_invite", supervisorToken, { p_token: orgInviteToken });

    expect(result).toMatch(UUID_RE);
    orgId = result as string;

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

// ---------------------------------------------------------------------------
// updateOrganizationName, as platform admin
// ---------------------------------------------------------------------------

describe("updateOrganizationName", () => {
  test("as platform admin, valid org id + new name -> renames, redirects to /admin/empresas/{id}?updated=1", async () => {
    expect(orgId, "the Supervisor must have accepted the invite first").toBeDefined();
    const newName = `${orgName} (renamed)`;

    const fd = new FormData();
    fd.set("orgId", orgId);
    fd.set("newName", newName);

    actingAs(platformAdminToken);
    const url = await getRedirectUrl(() => updateOrganizationName(fd));

    expect(url).toBe(`/admin/empresas/${orgId}?updated=1`);

    // organizations has no platform-admin SELECT policy (RLS scopes it to
    // members of the org) -- list_organizations() is the platform admin's
    // own security-definer read path (supabase/migrations/0017), same one
    // /admin's own list page uses.
    const orgs = (await callRpc("list_organizations", platformAdminToken, {})) as {
      id: string;
      name: string;
    }[];
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
    // Recorded verbatim from update_organization_name's raised exception
    // (supabase/migrations/0017_supervisor_and_admin_management.sql).
    expect(message).toBe("Solo el administrador de la plataforma puede editar empresas.");
  });
});

// ---------------------------------------------------------------------------
// Story 6.1 (_bmad-output/implementation-artifacts/
// spec-6-1-paginate-admin-organizations-list.md): list_organizations() grew
// optional p_limit/p_offset/total_count -- this asserts the zero-argument
// call every other call site still makes (admin/empresas/[id]/page.tsx,
// db/admin.ts's listOrganizations()) stays byte-identical to the pre-6.1
// unpaginated behavior: every organization, no total_count-driven limiting.
// ---------------------------------------------------------------------------

describe("list_organizations, zero-argument backward compatibility (Story 6.1)", () => {
  test("as platform admin, zero-arg call -> returns the complete unpaginated set, genuinely unbounded", async () => {
    expect(orgId, "the Supervisor must have accepted the invite first").toBeDefined();

    const orgs = (await callRpc("list_organizations", platformAdminToken, {})) as {
      id: string;
      total_count: number;
    }[];
    expect(orgs.length).toBeGreaterThan(0);
    const total = Number(orgs[0].total_count);
    // total_count is additive (present on every row, matches the full set
    // size) -- it never causes the zero-arg call to actually limit rows.
    expect(orgs).toHaveLength(total);

    // organizations has no platform-admin SELECT policy (RLS scopes it to
    // members of the org), so the REST API can't confirm this count
    // independently -- instead, confirm the zero-arg call is genuinely
    // unbounded (not coincidentally matching some default limit) by
    // comparing it against an explicit, small p_limit against the same
    // underlying total_count.
    const limited = (await callRpc("list_organizations", platformAdminToken, {
      p_limit: 1,
      p_offset: 0,
    })) as { total_count: number }[];
    expect(limited).toHaveLength(1);
    expect(Number(limited[0].total_count)).toBe(total);
  });

  test("non-platform-admin caller, zero-arg call -> empty array, unchanged (no error, no fabricated total_count)", async () => {
    expect(supervisorToken, "the Supervisor must have accepted the invite first").toBeDefined();

    // The Supervisor is not the platform admin -- is_platform_admin() gates
    // list_organizations() before count(*) over() ever runs.
    const orgs = await callRpc("list_organizations", supervisorToken, {});
    expect(orgs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createDepartment, as the accepted Supervisor
// ---------------------------------------------------------------------------

describe("createDepartment", () => {
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

    // Reaches createDepartment's own client-side `if (!name)` check
    // (src/app/actions/members.ts), which redirects before ever calling
    // the RPC -- same shape as inviteMember's already-tested missing-
    // department validation. This is NOT the RPC's own
    // 'El nombre del departamento es obligatorio.' message; that one only
    // fires if this client-side check is bypassed (e.g. a name of only
    // whitespace survives `.trim()` as empty client-side too, so there is
    // no call shape through this Server Action that reaches it).
    actingAs(supervisorToken);
    const url = await getRedirectUrl(() => createDepartment(fd));

    const message = errorFromRedirect(url, "/dashboard/members?error=");
    expect(message).toBe("El nombre es obligatorio.");
  });
});

// ---------------------------------------------------------------------------
// inviteMember, as the Supervisor
// ---------------------------------------------------------------------------

describe("inviteMember", () => {
  test("missing department -> redirects to /dashboard/members?error= with the exact pre-RPC validation message", async () => {
    expect(supervisorToken, "the Supervisor must have accepted the invite first").toBeDefined();

    const fd = new FormData();
    fd.set("email", "alguien@ejemplo.test");
    fd.set("fullName", "Alguien");
    fd.set("departmentId", "");

    actingAs(supervisorToken);
    const url = await getRedirectUrl(() => inviteMember(fd));

    const message = errorFromRedirect(url, "/dashboard/members?error=");
    // Recorded verbatim from inviteMember's own pre-RPC validation
    // (src/app/actions/members.ts) -- this never reaches the RPC.
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

// ---------------------------------------------------------------------------
// accept_member_invite -- the newly invited member (not a Supervisor).
// ---------------------------------------------------------------------------

describe("accept_member_invite (newly invited member)", () => {
  test("valid token, matching email -> membership active, is_supervisor=false", async () => {
    expect(memberInviteToken, "inviteMember must have run first").toBeDefined();

    memberToken = await signUpWithInvite(memberEmail, PASSWORD, memberInviteToken);
    const result = await callRpc("accept_member_invite", memberToken, { p_token: memberInviteToken });
    expect(result).toBe(orgId);

    const rows = (await restGet(
      `members?select=status,is_supervisor&email=eq.${encodeURIComponent(memberEmail)}`,
      memberToken
    )) as { status: string; is_supervisor: boolean }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("active");
    expect(rows[0].is_supervisor).toBe(false);
  });

  test("already-used token -> raises the exact 'invalid or already used' message", async () => {
    expect(memberToken, "the previous test must have accepted the invite first").toBeDefined();

    // Reuses the same token the previous test already consumed (that
    // member's status is no longer 'invited') -- accept_member_invite's own
    // "select ... where status = 'invited'" check (0045_claim_pending_email_invitations.sql)
    // finds no row and raises this exact message, the same path an
    // invalid/unknown token would hit.
    const message = await callRpcExpectingError("accept_member_invite", memberToken, {
      p_token: memberInviteToken,
    });
    expect(message).toBe("Invitación no válida o ya utilizada.");
  });
});

// ---------------------------------------------------------------------------
// signIn / signOut -- a fresh login/logout pair for the member account just
// created above. Unlike the other actions in this file, these go through
// `actingWithRealSession()` (see file header) so the real Supabase session
// cookie and Story 1.4 app-token cookie can both be observed, mirroring
// tests/characterization/auth-signin.test.ts's own pattern for the same
// action against a different seeded account.
// ---------------------------------------------------------------------------

function formDataFor(email: string, password: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  return fd;
}

function nonAppTokenCookies(): [string, CookieEntry][] {
  return Array.from(state.jar.entries()).filter(([name]) => name !== APP_TOKEN_COOKIE);
}

describe("signIn", () => {
  test("valid credentials -> redirects to /dashboard, sets both the Supabase session cookie(s) and brujula_app_token", async () => {
    expect(memberToken, "the member must have accepted its invite first").toBeDefined();

    actingWithRealSession();
    const url = await getRedirectUrl(() => signIn(formDataFor(memberEmail, PASSWORD)));
    expect(url).toBe("/dashboard");

    // The existing Supabase session cookie(s) -- set via @supabase/ssr's
    // own setAll callback, unmodified by this story. Asserting "at least
    // one non-app-token cookie exists" rather than a specific name keeps
    // this from being coupled to @supabase/ssr's internal
    // cookie-naming/chunking scheme (same choice auth-signin.test.ts makes).
    expect(nonAppTokenCookies().length).toBeGreaterThan(0);

    // The app token cookie, with the exact options Story 1.4 requires.
    const appTokenEntry = state.jar.get(APP_TOKEN_COOKIE);
    expect(appTokenEntry).toBeDefined();
    expect(appTokenEntry!.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });

    // The token itself is valid per requireApiToken -- a non-mutating
    // request carrying it resolves ok.
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

describe("signOut", () => {
  test("logged-in session -> redirects to /login, clears the app-token cookie", async () => {
    expect(memberToken, "the member must have accepted its invite first").toBeDefined();

    actingWithRealSession();
    // Fresh real login first (beforeEach cleared the jar) so signOut has an
    // actual session + app token cookie to clear.
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
