// Story 3.2 (_bmad-output/implementation-artifacts/
// spec-3-2-db-access-manager-scaffolding-admin-members-auth.md): re-verifies
// a representative subset of Story 3.1's characterized baseline
// (tests/characterization/admin-members-auth.test.ts) directly against the
// new `db -> managers` layering (adminManager/membersManager/authManager),
// run UNMODIFIED source, against the same real, local `supabase start`
// instance -- mirroring Story 1.2's own "re-verify against Story 1.1's
// baseline" requirement.
//
// What's real: every manager function under test, every db/* function it
// calls, and every Postgres RPC underneath. What's mocked, and why: only
// `next/headers`'s `cookies()` (no request-scoped cookie store exists in a
// plain Vitest run) and `@/lib/supabase/server` (so this suite can run
// manager calls "as" several different already-authenticated users without
// a real login/cookie ceremony per call). Unlike Story 3.1's own test file,
// there is no `next/navigation`/`next/cache` mock needed here -- managers
// never call redirect()/revalidatePath(), that Next.js-specific glue stays
// one layer up in the Server Action (Story 3.4), untouched by this story.
//
// `@/lib/supabase/server`'s mock again has to do double duty, exactly as
// Story 3.1's own test explains:
//   - adminManager/membersManager only ever end up calling `supabase.rpc(...)`
//     (via db/admin.ts, db/members.ts), so they reuse the token-bearer
//     pattern (`actingAs()`) to run "as" several different
//     already-authenticated users.
//   - authManager calls db/auth.ts's `signInWithPassword`/`signOut`, which
//     go through the real `@supabase/ssr` server client so a successful
//     sign-in's session gets persisted the normal way (`setAll` writing to
//     the mocked cookie jar) -- `actingWithRealSession()`.

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireApiToken } from "@/server/shared/auth";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
// Same fixed password every scripts/seed-*.mjs script uses for every
// account it creates (see scripts/seed-demo-company.mjs).
const PASSWORD = "kairos123";
// Exactly one seeded row in platform_admins (supabase/migrations/
// 0016_platform_admin_org_creation.sql) -- same account Story 3.1's own
// suite uses, there is no other way to exercise
// create_organization_as_admin/update_organization_name's success path.
const PLATFORM_ADMIN_EMAIL = "david.abarca@gmail.com";

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY -- deben venir de " +
      ".env.test.local (npx supabase start). Ver vitest.config.ts."
  );
}
// Hard boundary, same as every other characterization suite: never run
// this against a remote Supabase project, dev or production -- only the
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

type CookieOptions = Record<string, unknown> | undefined;
type CookieEntry = { value: string; options: CookieOptions };

const state = vi.hoisted(() => ({
  token: null as string | null,
  mode: "token" as "token" | "cookies",
  jar: new Map<string, CookieEntry>(),
}));

/** Subsequent manager calls act as this already-authenticated user. */
function actingAs(token: string) {
  state.mode = "token";
  state.token = token;
}

/** Subsequent manager calls go through a real @supabase/ssr server client
 * wired to the mocked cookie jar -- for authManager, which needs a real
 * session-persisting client underneath signInWithPassword/signOut. */
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
      throw new Error("test bug: actingAs(token) must be called before invoking a manager function");
    }
    return createSupabaseJsClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${state.token}` } },
    });
  },
}));

// Imported after the mocks above are declared (Vitest hoists `vi.mock` to
// the top of the module regardless of source order) so that importing
// these, the unmodified manager modules, picks up the mocked
// `next/headers` and `@/lib/supabase/server`.
import {
  createOrganization,
  renameOrganization,
  listAllOrganizations,
  checkIsPlatformAdmin,
} from "@/server/managers/adminManager";
import {
  acceptInvite,
  createNewDepartment,
  inviteNewMember,
  getCurrentMember,
  listMyOrganizationMembers,
  listDepartments,
  countActiveOrganizationMembers,
  listCompetencyFrameworks,
  createIndividualAccount,
} from "@/server/managers/membersManager";
import {
  signIn,
  signOut,
  getCurrentUser,
  getCurrentUserWithMetadata,
  acceptInviteSignUp,
  individualSignUp,
} from "@/server/managers/authManager";

// ---------------------------------------------------------------------------
// Small REST/auth helpers -- same anon-key-only pattern as
// tests/characterization/admin-members-auth.test.ts.
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

/** signup-or-sign-in, same fallback scripts/seed-demo-company.mjs and
 * Story 3.1's own test use to bootstrap an account idempotently. */
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
// `listAllOrganizations()` (which always calls it zero-arg) is genuinely
// unbounded rather than coincidentally matching some default limit --
// `listAllOrganizations()`'s own OrganizationSummary type has no
// total_count field, so that comparison can't be done through the manager
// alone.
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Fixture: built from scratch through the manager functions under test
// themselves, chained in the same dependency order Story 3.1's own suite
// uses: org -> Supervisor accept -> department -> member invite -> member
// accept -> login/logout.
// ---------------------------------------------------------------------------

let platformAdminToken: string;
const runId = Date.now();
const orgName = `Char Test Manager ${runId}`;
const supervisorEmail = `admin@char-test-manager-${runId}.brujula-fake.test`;
const departmentName = `Departamento Char Test Manager ${runId}`;
const memberEmail = `empleado-${runId}@char-test-manager-${runId}.brujula-fake.test`;

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
// adminManager.createOrganization / renameOrganization
// ---------------------------------------------------------------------------

describe("adminManager.createOrganization", () => {
  test("non-admin caller -> throws the exact platform-admin-only message", async () => {
    const nonAdminEmail = `nonadmin-${runId}@brujula-fake.test`;
    const nonAdminToken = await signUpOrSignIn(nonAdminEmail, PASSWORD);

    actingAs(nonAdminToken);
    await expect(
      createOrganization("Empresa que nunca debería crearse", "nadie@ejemplo.test", "Nadie")
    ).rejects.toThrow("Solo el administrador de la plataforma puede crear empresas.");
  });

  test("as platform admin, valid input -> creates the org+first-Supervisor invite", async () => {
    actingAs(platformAdminToken);
    const { inviteToken } = await createOrganization(orgName, supervisorEmail, "Supervisor de Prueba");

    expect(inviteToken).toMatch(UUID_RE);
    orgInviteToken = inviteToken;
  });
});

// ---------------------------------------------------------------------------
// membersManager.acceptInvite -- the new org's first Supervisor.
// ---------------------------------------------------------------------------

describe("membersManager.acceptInvite (first Supervisor)", () => {
  test("valid invite token, matching email -> membership active, is_supervisor=true, returns organizationId", async () => {
    expect(orgInviteToken, "createOrganization must have run first").toBeDefined();

    supervisorToken = await signUpWithInvite(supervisorEmail, PASSWORD, orgInviteToken);

    actingAs(supervisorToken);
    const { organizationId } = await acceptInvite(orgInviteToken);
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

// ---------------------------------------------------------------------------
// adminManager.renameOrganization, as platform admin
// ---------------------------------------------------------------------------

describe("adminManager.renameOrganization", () => {
  test("as platform admin, valid org id + new name -> renames", async () => {
    expect(orgId, "the Supervisor must have accepted the invite first").toBeDefined();
    const newName = `${orgName} (renamed)`;

    actingAs(platformAdminToken);
    await renameOrganization(orgId, newName);

    const orgs = await listAllOrganizations();
    const updated = orgs.find((o) => o.id === orgId);
    expect(updated?.name).toBe(newName);
  });

  test("non-platform-admin caller -> throws the exact platform-admin-only message", async () => {
    expect(orgId, "the Supervisor must have accepted the invite first").toBeDefined();

    actingAs(supervisorToken);
    await expect(
      renameOrganization(orgId, "Nombre que nunca debería aplicarse")
    ).rejects.toThrow("Solo el administrador de la plataforma puede editar empresas.");
  });
});

// ---------------------------------------------------------------------------
// Story 6.1 (_bmad-output/implementation-artifacts/
// spec-6-1-paginate-admin-organizations-list.md): list_organizations()
// grew optional p_limit/p_offset/total_count -- this asserts
// listAllOrganizations() (which always calls it zero-arg, per db/admin.ts)
// keeps returning the complete, unpaginated set, unchanged from before.
// ---------------------------------------------------------------------------

describe("adminManager.listAllOrganizations, zero-argument backward compatibility (Story 6.1)", () => {
  test("as platform admin -> returns the complete unpaginated set, genuinely unbounded", async () => {
    expect(orgId, "the Supervisor must have accepted the invite first").toBeDefined();

    actingAs(platformAdminToken);
    const orgs = await listAllOrganizations();
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

// ---------------------------------------------------------------------------
// adminManager.checkIsPlatformAdmin -- error path (src/app/dashboard/
// page.tsx's flag-ON branch wraps this call in a try/catch specifically
// because it throws on RPC failure, unlike its old `result.data`-only
// path; this proves the manager really does throw so that fix is provably
// necessary).
// ---------------------------------------------------------------------------

describe("adminManager.checkIsPlatformAdmin", () => {
  test("RPC error (malformed auth token) -> throws", async () => {
    actingAs("not-a-real-jwt");
    await expect(checkIsPlatformAdmin()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// membersManager.createNewDepartment / inviteNewMember, as the Supervisor
// ---------------------------------------------------------------------------

describe("membersManager.createNewDepartment", () => {
  test("as the Supervisor, valid name -> creates the department", async () => {
    expect(supervisorToken, "the Supervisor must have accepted the invite first").toBeDefined();

    actingAs(supervisorToken);
    const { departmentId: newDepartmentId } = await createNewDepartment(departmentName);
    expect(newDepartmentId).toMatch(UUID_RE);
    departmentId = newDepartmentId;

    const rows = (await restGet(
      `departments?select=id&organization_id=eq.${orgId}&name=eq.${encodeURIComponent(departmentName)}`,
      supervisorToken
    )) as { id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(departmentId);
  });
});

describe("membersManager.inviteNewMember", () => {
  test("invalid department id -> throws the RPC's own exact message", async () => {
    expect(supervisorToken, "the Supervisor must have accepted the invite first").toBeDefined();

    actingAs(supervisorToken);
    await expect(
      inviteNewMember("alguien@ejemplo.test", "Alguien", "00000000-0000-0000-0000-000000000000")
    ).rejects.toThrow("Selecciona un departamento válido de tu organización.");
  });

  test("as the Supervisor, valid department -> invites the member", async () => {
    expect(departmentId, "createNewDepartment must have run first").toBeDefined();

    actingAs(supervisorToken);
    const { inviteToken } = await inviteNewMember(memberEmail, "Empleado de Prueba", departmentId);

    expect(inviteToken).toMatch(UUID_RE);
    memberInviteToken = inviteToken;
  });
});

// ---------------------------------------------------------------------------
// membersManager.acceptInvite -- the newly invited member (not a Supervisor).
// ---------------------------------------------------------------------------

describe("membersManager.acceptInvite (newly invited member)", () => {
  test("valid token, matching email -> membership active, is_supervisor=false", async () => {
    expect(memberInviteToken, "inviteNewMember must have run first").toBeDefined();

    memberToken = await signUpWithInvite(memberEmail, PASSWORD, memberInviteToken);

    actingAs(memberToken);
    const { organizationId } = await acceptInvite(memberInviteToken);
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
    await expect(acceptInvite(memberInviteToken)).rejects.toThrow(
      "Invitación no válida o ya utilizada."
    );
  });
});

// ---------------------------------------------------------------------------
// authManager.signIn / signOut -- a fresh login/logout pair for the member
// account just created above. Goes through `actingWithRealSession()` (see
// file header) so the real Supabase session cookie is actually persisted
// underneath, exactly as it is in production.
// ---------------------------------------------------------------------------

describe("authManager.signIn", () => {
  test("valid credentials -> returns a valid, requireApiToken-passing appToken", async () => {
    expect(memberToken, "the member must have accepted its invite first").toBeDefined();

    actingWithRealSession();
    const { appToken } = await signIn(memberEmail, PASSWORD);
    expect(typeof appToken).toBe("string");
    expect(appToken.length).toBeGreaterThan(0);

    const request = new Request("https://example.test/api/report-groups", {
      method: "GET",
      headers: { cookie: `brujula_app_token=${appToken}` },
    });
    expect(requireApiToken(request)).toEqual({ ok: true });
  });

  test("invalid credentials -> throws, matching db/auth.ts's signInWithPassword directly", async () => {
    expect(memberToken, "the member must have accepted its invite first").toBeDefined();

    actingWithRealSession();
    await expect(signIn(memberEmail, "definitely-the-wrong-password")).rejects.toThrow();
  });
});

describe("authManager.signOut", () => {
  test("logged-in session -> resolves without throwing", async () => {
    expect(memberToken, "the member must have accepted its invite first").toBeDefined();

    actingWithRealSession();
    await signIn(memberEmail, PASSWORD);

    await expect(signOut()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Story 6.3 (session-resolution completion, _bmad-output/
// implementation-artifacts/spec-6-3-*.md): authManager.getCurrentUser() /
// membersManager.getCurrentMember() -- the shared foundation every
// remaining page-level Supabase-direct read migrates onto.
// ---------------------------------------------------------------------------

describe("authManager.getCurrentUser", () => {
  test("logged-in session -> returns { id, email }", async () => {
    expect(supervisorToken, "the Supervisor must have accepted the invite first").toBeDefined();

    actingAs(supervisorToken);
    const user = await getCurrentUser();
    expect(user).not.toBeNull();
    expect(user?.id).toMatch(UUID_RE);
    expect(user?.email).toBe(supervisorEmail);
  });

  test("malformed/invalid token -> returns null, never throws", async () => {
    actingAs("not-a-real-jwt");
    await expect(getCurrentUser()).resolves.toBeNull();
  });
});

describe("membersManager.getCurrentMember", () => {
  test("logged-in Supervisor -> returns full row (id, isSupervisor, organizationId, status, organization)", async () => {
    expect(supervisorToken, "the Supervisor must have accepted the invite first").toBeDefined();
    expect(orgId, "createOrganization must have run first").toBeDefined();

    actingAs(supervisorToken);
    const member = await getCurrentMember();
    expect(member).not.toBeNull();
    expect(member?.id).toMatch(UUID_RE);
    expect(member?.isSupervisor).toBe(true);
    expect(member?.isGuest).toBe(false);
    expect(member?.organizationId).toBe(orgId);
    expect(member?.status).toBe("active");
    // adminManager.renameOrganization ran earlier in this same file's
    // shared-state sequence and left the org renamed -- assert the current
    // name, not the original orgName.
    expect(member?.organization).toEqual({ name: `${orgName} (renamed)`, kind: "company" });
  });

  test("malformed/invalid token -> returns null, never throws", async () => {
    actingAs("not-a-real-jwt");
    await expect(getCurrentMember()).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Members/self/reports domain migration (_bmad-output/implementation-
// artifacts/): the remaining new functions this migration added --
// dashboard/members/page.tsx's own org-roster/department reads,
// informe-empresa/page.tsx's member-count read, the mi-mapa/informe-empresa
// shared competency-frameworks catalog read, dashboard/page.tsx's
// individual-account bootstrap, and the two accept-invite/individual signUp
// wrappers plus getCurrentUserWithMetadata(). Reuses this same file's
// fixture: orgId/departmentId/supervisorToken/supervisorEmail (the
// Supervisor) and memberToken/memberEmail (the accepted, non-Supervisor
// member) from the sections above.
// ---------------------------------------------------------------------------

describe("membersManager.listMyOrganizationMembers", () => {
  test("as the Supervisor -> returns both fixture members, with department_id/invite_token", async () => {
    expect(orgId, "the fixture org must exist").toBeDefined();
    expect(departmentId, "createNewDepartment must have run first").toBeDefined();

    actingAs(supervisorToken);
    const members = await listMyOrganizationMembers();

    const supervisorRow = members.find((m) => m.email === supervisorEmail);
    const memberRow = members.find((m) => m.email === memberEmail);

    expect(supervisorRow).toBeDefined();
    expect(supervisorRow?.isSupervisor).toBe(true);
    expect(supervisorRow?.status).toBe("active");

    expect(memberRow).toBeDefined();
    expect(memberRow?.isSupervisor).toBe(false);
    expect(memberRow?.status).toBe("active");
    expect(memberRow?.departmentId).toBe(departmentId);
    expect(memberRow?.inviteToken).toMatch(UUID_RE);
  });
});

// ---------------------------------------------------------------------------
// Story 7.4 (ports the Invitado portion of upstream commit 62e2ed8, schema
// from supabase/migrations/0076_guest_member_type.sql): `isGuest` gained
// the same additive treatment as `isSupervisor` -- exercises the full
// invite -> accept -> getCurrentMember/listMyOrganizationMembers path
// entirely through membersManager (no raw RPC calls needed here, unlike
// the cross-domain guest-rejection fixtures in cycles-manager.test.ts/
// feedback-manager.test.ts, which need RPCs this file's own manager
// surface doesn't expose).
// ---------------------------------------------------------------------------

describe("membersManager Invitado (isGuest) handling (Story 7.4)", () => {
  const guestEmail = `invitado-${runId}@char-test-manager-${runId}.brujula-fake.test`;
  let guestInviteToken: string;
  let guestToken: string;

  test("inviteNewMember with isGuest=true -> creates a member with is_guest=true", async () => {
    expect(departmentId, "createNewDepartment must have run first").toBeDefined();

    actingAs(supervisorToken);
    const { inviteToken } = await inviteNewMember(guestEmail, "Invitado de Prueba", departmentId, true);
    expect(inviteToken).toMatch(UUID_RE);
    guestInviteToken = inviteToken;

    const rows = (await restGet(
      `members?select=is_guest,is_supervisor,status&email=eq.${encodeURIComponent(guestEmail)}`,
      supervisorToken
    )) as { is_guest: boolean; is_supervisor: boolean; status: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].is_guest).toBe(true);
    expect(rows[0].is_supervisor).toBe(false);
    expect(rows[0].status).toBe("invited");
  });

  test("accepted guest -> getCurrentMember returns isGuest=true", async () => {
    expect(guestInviteToken, "the previous test must have run first").toBeDefined();

    guestToken = await signUpWithInvite(guestEmail, PASSWORD, guestInviteToken);

    actingAs(guestToken);
    await acceptInvite(guestInviteToken);

    const member = await getCurrentMember();
    expect(member).not.toBeNull();
    expect(member?.isGuest).toBe(true);
    expect(member?.isSupervisor).toBe(false);
  });

  test("listMyOrganizationMembers (as the Supervisor) -> the guest row has isGuest=true", async () => {
    expect(guestToken, "the previous test must have run first").toBeDefined();

    actingAs(supervisorToken);
    const members = await listMyOrganizationMembers();
    const guestRow = members.find((m) => m.email === guestEmail);
    expect(guestRow).toBeDefined();
    expect(guestRow?.isGuest).toBe(true);
  });
});

describe("membersManager.listDepartments", () => {
  test("as the Supervisor -> includes the fixture department", async () => {
    expect(departmentId, "createNewDepartment must have run first").toBeDefined();

    actingAs(supervisorToken);
    const departments = await listDepartments();
    expect(departments.some((d) => d.id === departmentId && d.name === departmentName)).toBe(true);
  });
});

describe("membersManager.countActiveOrganizationMembers", () => {
  test("as the Supervisor -> counts both fixture members (Supervisor + accepted member)", async () => {
    expect(orgId, "the fixture org must exist").toBeDefined();

    actingAs(supervisorToken);
    const count = await countActiveOrganizationMembers(orgId);
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

describe("membersManager.listCompetencyFrameworks", () => {
  test("any authenticated caller -> returns the platform-wide VACC catalog", async () => {
    actingAs(memberToken);
    const frameworks = await listCompetencyFrameworks();
    expect(frameworks.length).toBeGreaterThan(0);
    for (const framework of frameworks) {
      expect(typeof framework.code).toBe("string");
      expect(typeof framework.name).toBe("string");
    }
  });
});

describe("membersManager.createIndividualAccount", () => {
  test("caller with no members row yet -> creates the individual org + Supervisor member", async () => {
    const email = `individual-${runId}@brujula-fake.test`;
    const token = await signUpOrSignIn(email, PASSWORD);

    actingAs(token);
    const created = await createIndividualAccount("Cuenta Individual de Prueba", email);

    expect(created.memberId).toMatch(UUID_RE);
    expect(created.organizationId).toMatch(UUID_RE);
    expect(created.organizationName).toBe("Cuenta Individual de Prueba");
    expect(created.organizationKind).toBe("individual");
    expect(created.isSupervisor).toBe(true);
  });

  test("caller already has a members row -> throws the RPC's own exact message", async () => {
    expect(supervisorToken, "the Supervisor must have accepted the invite first").toBeDefined();

    actingAs(supervisorToken);
    await expect(createIndividualAccount("No debería crearse", supervisorEmail)).rejects.toThrow(
      "Ya tienes una cuenta asociada."
    );
  });
});

describe("authManager.getCurrentUserWithMetadata", () => {
  test("logged-in session -> returns id/email plus the auth user's own signup-time user_metadata", async () => {
    expect(supervisorToken, "the Supervisor must have accepted the invite first").toBeDefined();
    expect(orgInviteToken, "createOrganization must have run first").toBeDefined();

    actingAs(supervisorToken);
    const user = await getCurrentUserWithMetadata();
    expect(user).not.toBeNull();
    expect(user?.email).toBe(supervisorEmail);
    // Supabase Auth's own user_metadata is set once at signUp time and
    // never cleared by accept_member_invite (a Postgres RPC -- it has no
    // reach into auth.users' raw_user_meta_data), so the Supervisor's
    // session still carries the pending_invite_token it signed up with
    // (signUpWithInviteToken, via this file's own signUpWithInvite
    // fixture helper) even though its invite is long since accepted.
    // dashboard/page.tsx only ever reads this field on the `!member`
    // branch, so this stale leftover value is harmless in practice.
    expect(user?.pendingInviteToken).toBe(orgInviteToken);
    expect(user?.pendingIndividualSignup).toBe(false);
  });

  test("malformed/invalid token -> returns null, never throws", async () => {
    actingAs("not-a-real-jwt");
    await expect(getCurrentUserWithMetadata()).resolves.toBeNull();
  });
});

describe("authManager.acceptInviteSignUp", () => {
  test("stashes pending_invite_token in user_metadata -- visible via getCurrentUserWithMetadata", async () => {
    const email = `signup-invite-${runId}@brujula-fake.test`;
    const fakeInviteToken = "11111111-1111-1111-1111-111111111111";

    actingWithRealSession();
    await acceptInviteSignUp(email, PASSWORD, fakeInviteToken);

    const user = await getCurrentUserWithMetadata();
    expect(user).not.toBeNull();
    expect(user?.email).toBe(email);
    expect(user?.pendingInviteToken).toBe(fakeInviteToken);
    expect(user?.pendingIndividualSignup).toBe(false);
  });
});

describe("authManager.individualSignUp", () => {
  test("stashes pending_individual_signup + full_name in user_metadata -- visible via getCurrentUserWithMetadata", async () => {
    const email = `signup-individual-${runId}@brujula-fake.test`;

    actingWithRealSession();
    await individualSignUp(email, PASSWORD, "Nombre De Prueba");

    const user = await getCurrentUserWithMetadata();
    expect(user).not.toBeNull();
    expect(user?.email).toBe(email);
    expect(user?.pendingIndividualSignup).toBe(true);
    expect(user?.fullName).toBe("Nombre De Prueba");
  });
});
