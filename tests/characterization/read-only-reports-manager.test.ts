// Story 3.26 (_bmad-output/implementation-artifacts/
// spec-3-26-read-model-composition-for-read-only-reports.md): new-path
// re-verification of Story 3.25's characterization baseline (tests/
// characterization/read-only-reports.test.ts, left unmodified and re-run
// as-is alongside this file) against the NEW manager functions, called
// directly -- not through the still-unmodified dashboard/page.tsx,
// mi-mapa/page.tsx or informe-empresa/page.tsx (Story 3.28's concern, not
// this one). Same fixture (scripts/seed-demo-company.mjs), same mocking
// shape as Story 3.20's own responder-invitation-manager.test.ts
// precedent: only `@/lib/supabase/server`'s `createClient` needs mocking
// here -- none of the 4 manager files touched by this story import
// next/navigation or next/cache.
//
// What's real: every Postgres RPC/table read the manager functions call,
// run against the same local `supabase start` instance.
//
// Coverage: every row of the spec's own I/O & Edge-Case Matrix --
// feedbackManager.getMyAdHocRequests, cyclesManager.getMyCycleRequests,
// cyclesManager.getMyOpenCycles, reportGroupsManager.getMyReportGroups
// (pending + none + creator + accept-flow), feedbackManager.getMyCompetencyMap
// (closed 360 + none), membersManager.getOrganizationCompetencySummary
// (Supervisor + non-Supervisor). Fixture-building RPC calls
// (create_ad_hoc_feedback_request, create_report_group,
// close_ad_hoc_feedback_request, respond_to_report_group,
// create_organization_as_admin) are called directly via the same raw
// callRpc helper read-only-reports.test.ts's own fixture already
// established, never through the managers themselves.
//
// Plus (added after a 3-lens review, see the spec's own Review Triage Log):
// per-caller scoping proof for the 3 non-RPC reads' duplicated
// getCallerMemberId() helper (db/feedback.ts, db/cycles.ts) -- a different
// caller's own token must return its own scoped result, never
// dashboardEmployee's -- and that helper's own "no members row" error path.

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
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
// (supabase/migrations/0016_platform_admin_org_creation.sql) -- needed
// here only for org B's own create_organization_as_admin call.
const PLATFORM_ADMIN_EMAIL = "david.abarca@gmail.com";

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY -- deben venir de " +
      ".env.test.local (npx supabase start). Ver vitest.config.ts."
  );
}
// Hard boundary carried over from every prior characterization file: never
// run this suite against a remote Supabase project, dev or production --
// only the local CLI instance.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(SUPABASE_URL)) {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL (${SUPABASE_URL}) no es la instancia local de \`supabase start\`. ` +
      "Estos tests nunca deben correr contra un proyecto remoto."
  );
}

// ---------------------------------------------------------------------------
// Mocks -- see file header for what and why. No next/navigation or
// next/cache mock needed: none of the 4 manager files call
// redirect()/revalidatePath().
// ---------------------------------------------------------------------------

const acting = vi.hoisted(() => ({ token: null as string | null, initialized: false }));

function actingAs(token: string) {
  acting.token = token;
  acting.initialized = true;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async (): Promise<SupabaseClient> => {
    if (!acting.initialized) {
      throw new Error("test bug: actingAs(token) must be called before invoking a manager function");
    }
    return createSupabaseJsClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: acting.token ? { headers: { Authorization: `Bearer ${acting.token}` } } : {},
    });
  },
}));

// Imported after the mock above is declared (Vitest hoists `vi.mock` to the
// top of the module regardless of source order) so each manager's own
// import of `@/lib/supabase/server` (via its `@/server/db/*` file) picks
// up the mocked client factory.
import * as feedbackManager from "@/server/managers/feedbackManager";
import * as cyclesManager from "@/server/managers/cyclesManager";
import * as reportGroupsManager from "@/server/managers/reportGroupsManager";
import * as membersManager from "@/server/managers/membersManager";

// ---------------------------------------------------------------------------
// Small REST/RPC/auth helpers -- same anon-key-only pattern as every prior
// characterization file; used only for setup here, never as the thing
// under test.
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

// ---------------------------------------------------------------------------
// Fixture: one fresh 8-employee demo company via scripts/seed-demo-
// company.mjs, same technique read-only-reports.test.ts's own fixture
// already established (see that file's header for the full rationale).
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
// for getMyAdHocRequests/getMyCycleRequests/getMyOpenCycles (it's a cycle
// participant with its own not-yet-closed cycle request, matching "caller
// organized evaluators for an open cycle" / "caller is a participant in an
// open cycle") plus a fresh ad_hoc request built directly through
// create_ad_hoc_feedback_request, plus doubles as getMyCompetencyMap's "no
// closed 360" state and getMyReportGroups's "none" state (never invited to
// anything) and getOrganizationCompetencySummary's "non-Supervisor" state.
let dashboardEmployee: SeededEmployee;
let adHocRequestId: string;
const AD_HOC_REQUEST_NAME = "Feedback de prueba (característica 3.26)";

// closedInvitee: bucket "cerrado" -- getMyCompetencyMap's "closed 360"
// state, and the sole invitee of the report-group fixture below (only a
// member with an already-closed 360 is eligible per create_report_group's
// own guard) -- getMyReportGroups's "pending" state.
let closedInvitee: SeededEmployee;
let reportGroupId: string;
let reportGroupCreator: SeededEmployee;

// Org B: a second, minimal company (supervisor only, zero
// feedback_requests) -- getOrganizationCompetencySummary's "no revealed
// data" state, built directly via create_organization_as_admin (never
// through the seed script, which always closes at least one 360).
let supervisorBToken: string;

const runId = Date.now();

beforeAll(async () => {
  const companyName = `Char Test ReadOnly Reports Manager ${runId}`;
  let seedOutput: string;
  try {
    seedOutput = execFileSync("node", [path.join("scripts", "seed-demo-company.mjs"), companyName, "8"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      // Pin the subprocess to the exact URL/key this file already verified
      // is local-only -- seed-demo-company.mjs's own loadEnvLocal() would
      // otherwise re-read .env.local independently.
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
  // identical note in read-only-reports.test.ts (this file's own raw-RPC
  // fixture, same mismatch: reportGroupCreator = readyEmployees[0] no
  // longer has a closed 360, which create_report_group now requires of
  // its own caller too. Not fixed in this pass -- see REVIEW-NOTES.md.
  const createReportGroupRows = (await callRpc("create_report_group", reportGroupCreator.token, {
    p_name: "Grupo de prueba (característica 3.26)",
    p_member_ids: [closedInvitee.id],
  })) as { group_id: string }[];
  reportGroupId = createReportGroupRows[0].group_id;

  // --- org B fixture: a second, minimal company with zero
  // feedback_requests -- getOrganizationCompetencySummary's "no revealed
  // data" state.
  const paToken = await signUpOrSignIn(PLATFORM_ADMIN_EMAIL, PASSWORD);
  const orgBName = `Char Test ReadOnly Manager Empty ${runId}`;
  const orgBAdminEmail = `admin@char-test-readonly-mgr-empty-${runId}.brujula-fake.test`;
  const orgBInviteToken = (await callRpc("create_organization_as_admin", paToken, {
    p_org_name: orgBName,
    p_admin_email: orgBAdminEmail,
    p_admin_full_name: "Admin Empresa Vacía",
  })) as string;
  supervisorBToken = await signUpWithInvite(orgBAdminEmail, PASSWORD, orgBInviteToken);
  await callRpc("accept_member_invite", supervisorBToken, { p_token: orgBInviteToken });
});

afterAll(() => {
  acting.token = null;
  acting.initialized = false;
});

// ---------------------------------------------------------------------------
// feedbackManager.getMyAdHocRequests
// ---------------------------------------------------------------------------

describe("feedbackManager.getMyAdHocRequests", () => {
  test("caller has an open and a closed ad_hoc request -> both rows (ad_hoc only, cycle excluded), created_at desc", async () => {
    // Close the seed's own ad_hoc request, then open a second one -- gives
    // dashboardEmployee one open + one closed ad_hoc row, alongside its
    // still-untouched cycle request (which must NOT appear here).
    await callRpc("close_ad_hoc_feedback_request", dashboardEmployee.token, {
      p_request_id: adHocRequestId,
    });
    const secondAdHocInvitees = orgAEmployees
      .filter((e) => e.id !== dashboardEmployee.id)
      .slice(0, 5)
      .map((e) => e.id);
    const secondAdHocName = "Segunda solicitud (característica 3.26)";
    const secondAdHocRequestId = (await callRpc(
      "create_ad_hoc_feedback_request",
      dashboardEmployee.token,
      { p_invitee_member_ids: secondAdHocInvitees, p_subtype: "general", p_name: secondAdHocName }
    )) as string;

    actingAs(dashboardEmployee.token);
    const rows = await feedbackManager.getMyAdHocRequests();

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      id: secondAdHocRequestId,
      createdAt: rows[0].createdAt,
      status: "open",
      name: secondAdHocName,
      // Story 7.2: never set for an ad_hoc request (see AdHocRequestRow's
      // own doc comment, db/feedback.ts).
      closesAt: null,
    });
    expect(rows[1]).toEqual({
      id: adHocRequestId,
      createdAt: rows[1].createdAt,
      status: "closed",
      name: AD_HOC_REQUEST_NAME,
      closesAt: null,
    });
  });
});

// ---------------------------------------------------------------------------
// cyclesManager.getMyCycleRequests
// ---------------------------------------------------------------------------

describe("cyclesManager.getMyCycleRequests", () => {
  test("caller organized evaluators for an open cycle -> its own cycle request row (ad_hoc excluded)", async () => {
    actingAs(dashboardEmployee.token);
    const rows = await cyclesManager.getMyCycleRequests();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: rows[0].id,
      cycleId: seedCycleId,
      createdAt: rows[0].createdAt,
      status: "open",
      cycleName: seedCycleName,
      // Story 7.2: always set for a cycle request -- not deterministic
      // here (depends on the seed script's own choice), same "pull it from
      // the response itself" treatment as id/createdAt above.
      closesAt: rows[0].closesAt,
    });
    expect(typeof rows[0].closesAt).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// cyclesManager.getMyOpenCycles
// ---------------------------------------------------------------------------

describe("cyclesManager.getMyOpenCycles", () => {
  test("caller is a participant in an open cycle -> the cycle's id/name/opensAt/closesAt", async () => {
    actingAs(dashboardEmployee.token);
    const rows = await cyclesManager.getMyOpenCycles();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: seedCycleId,
      name: seedCycleName,
      opensAt: seedOpensAt,
      closesAt: seedClosesAt,
    });
  });
});

// ---------------------------------------------------------------------------
// Per-caller scoping (Review Triage Log, finding 1): getMyAdHocRequests/
// getMyCycleRequests/getMyOpenCycles are the codebase's first non-RPC reads,
// each newly backed by a duplicated getCallerMemberId() helper (db/feedback.ts,
// db/cycles.ts) that replaces a page's own inline `member.id` filter. Every
// test above only ever calls these as dashboardEmployee -- a wrong lookup or
// a hardcoded id in that helper would go completely undetected. These three
// tests prove a genuinely different caller gets its OWN scoped result, not
// dashboardEmployee's.
// ---------------------------------------------------------------------------

describe("per-caller scoping (getCallerMemberId)", () => {
  test("getMyAdHocRequests -- a different org-A employee's own token returns [] (only dashboardEmployee has ad_hoc fixtures)", async () => {
    // otherEmployee: "listo (sin cerrar)" bucket, distinct from
    // reportGroupCreator (readyEmployees[0] there) -- never created an
    // ad_hoc request of its own, unlike dashboardEmployee.
    const otherEmployee = orgAEmployees.filter((e) => e.bucketLabel === "listo (sin cerrar)")[1];
    actingAs(otherEmployee.token);
    const rows = await feedbackManager.getMyAdHocRequests();

    expect(rows).toEqual([]);
  });

  test("getMyCycleRequests -- a different org-A employee's own token returns its OWN cycle-request row, never dashboardEmployee's", async () => {
    // Unlike ad_hoc requests, seed-demo-company.mjs has every employee (not
    // just dashboardEmployee) organize its own evaluators for the shared
    // seeded cycle -- so otherEmployee legitimately has its own cycle-
    // request row too. Scoping is proven here by the returned row being
    // otherEmployee's own (a distinct id), never dashboardEmployee's, not
    // by emptiness.
    actingAs(dashboardEmployee.token);
    const dashboardRows = await cyclesManager.getMyCycleRequests();
    expect(dashboardRows).toHaveLength(1);

    const otherEmployee = orgAEmployees.filter((e) => e.bucketLabel === "listo (sin cerrar)")[1];
    actingAs(otherEmployee.token);
    const rows = await cyclesManager.getMyCycleRequests();

    expect(rows).toHaveLength(1);
    expect(rows[0].id).not.toBe(dashboardRows[0].id);
    expect(rows[0].cycleId).toBe(seedCycleId);
    expect(rows[0].status).toBe("open");
  });

  test("getMyOpenCycles -- a caller who is not a participant (the Supervisor) returns [], not dashboardEmployee's open cycle", async () => {
    // Every org-A employee participates in the single seeded cycle
    // (create_feedback_cycle's own p_participant_member_ids is every
    // employee), so a different EMPLOYEE's own call would legitimately
    // return the identical cycle row -- content equality alone couldn't
    // distinguish correct per-caller scoping from a hardcoded-to-
    // dashboardEmployee bug. The Supervisor proves it instead:
    // seed-demo-company.mjs's own participant list never includes it (the
    // Supervisor can never be an evaluator, 0032_supervisor_cannot_be_
    // evaluator.sql), so a correctly-scoped call as the Supervisor must
    // return [], while a caller-id bug that silently fell back to
    // dashboardEmployee's own membership would wrongly return the seeded
    // cycle.
    actingAs(supervisorToken);
    const rows = await cyclesManager.getMyOpenCycles();

    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// reportGroupsManager.getMyReportGroups
// ---------------------------------------------------------------------------

describe("reportGroupsManager.getMyReportGroups", () => {
  test("caller invited to an unaccepted group -> the group, myStatus: pending", async () => {
    actingAs(closedInvitee.token);
    const rows = await reportGroupsManager.getMyReportGroups();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: reportGroupId,
      name: "Grupo de prueba (característica 3.26)",
      status: "open",
      createdByMemberId: reportGroupCreator.id,
      isCreator: false,
      myStatus: "pending",
      acceptedCount: 0,
      totalCount: 1,
    });
  });

  test("caller has no report groups -> []", async () => {
    actingAs(dashboardEmployee.token);
    const rows = await reportGroupsManager.getMyReportGroups();

    expect(rows).toEqual([]);
  });

  // Review Triage Log, finding 2: read-only-reports.test.ts (3.25,
  // tests/characterization/read-only-reports.test.ts:580-608) already
  // proved the creator's own view against the raw RPC -- re-verified here
  // against the new manager function. Must run before the accept-flow test
  // below, which mutates reportGroupId's own accepted_count.
  test("caller is the creator -> isCreator: true, myStatus: null", async () => {
    // create_report_group never inserts the creator itself into
    // report_group_members (only invitees) -- get_my_report_groups's own
    // rgm_self left join then has no matching row for the creator, so
    // myStatus is null, not "pending" (matches read-only-reports.test.ts's
    // own equivalent assertion against the raw RPC).
    actingAs(reportGroupCreator.token);
    const rows = await reportGroupsManager.getMyReportGroups();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: reportGroupId,
      name: "Grupo de prueba (característica 3.26)",
      status: "open",
      createdByMemberId: reportGroupCreator.id,
      isCreator: true,
      myStatus: null,
      acceptedCount: 0,
      totalCount: 1,
    });
  });

  // Review Triage Log, finding 2: read-only-reports.test.ts (3.25,
  // tests/characterization/read-only-reports.test.ts:613-end) already
  // proved the accept-flow transition against the raw RPC -- re-verified
  // here against the new manager function. Runs last in this describe
  // block -- mutates closedInvitee's own report_group_members row, so it
  // must come after the "has pending" and "is the creator" tests above,
  // both of which depend on reportGroupId's own accepted_count still being 0.
  test("caller accepts the invitation -> myStatus becomes 'accepted', acceptedCount increments", async () => {
    // respond_to_report_group (supabase/migrations/0064_report_groups.sql:
    // 181-218; wrapped, unflagged, in src/server/db/reportGroups.ts) --
    // called directly via the raw RPC, same fixture technique as every
    // other fixture-building call in this file, never through the manager
    // under test itself.
    await callRpc("respond_to_report_group", closedInvitee.token, {
      p_group_id: reportGroupId,
      p_accept: true,
    });

    actingAs(closedInvitee.token);
    const rows = await reportGroupsManager.getMyReportGroups();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: reportGroupId,
      name: "Grupo de prueba (característica 3.26)",
      status: "open",
      createdByMemberId: reportGroupCreator.id,
      isCreator: false,
      myStatus: "accepted",
      acceptedCount: 1,
      totalCount: 1,
    });

    // dashboard/page.tsx's own pendingOnly-style filter (only myStatus ===
    // "pending" rows surface as "Tareas pendientes") now genuinely excludes
    // this group, matching read-only-reports.test.ts's own equivalent
    // assertion.
    const pendingOnly = rows.filter((g) => g.myStatus === "pending");
    expect(pendingOnly).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// feedbackManager.getMyCompetencyMap
// ---------------------------------------------------------------------------

describe("feedbackManager.getMyCompetencyMap", () => {
  test("caller closed a cycle -> per-competency rows, competencyCode/baseValue/mentionDelta/lastCycleClosedAt", async () => {
    const frameworkRows = (await restGet(
      "competency_frameworks?select=code",
      closedInvitee.token
    )) as { code: string }[];
    const expectedCodes = new Set(frameworkRows.map((r) => r.code));
    expect(expectedCodes.size).toBeGreaterThan(0);

    actingAs(closedInvitee.token);
    const rows = await feedbackManager.getMyCompetencyMap();

    expect(rows).toHaveLength(expectedCodes.size);
    expect(new Set(rows.map((r) => r.competencyCode))).toEqual(expectedCodes);
    for (const row of rows) {
      expect(typeof row.baseValue).toBe("number");
      expect(row.mentionDelta).toBe(0);
      expect(row.lastCycleClosedAt).toBe(today);
    }
  });

  test("caller never closed a cycle -> []", async () => {
    actingAs(dashboardEmployee.token);
    const rows = await feedbackManager.getMyCompetencyMap();

    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// membersManager.getOrganizationCompetencySummary
// ---------------------------------------------------------------------------

describe("membersManager.getOrganizationCompetencySummary", () => {
  test("Supervisor, revealed data org-wide -> per-competency aggregate rows (camelCase)", async () => {
    actingAs(supervisorToken);
    const rows = await membersManager.getOrganizationCompetencySummary();

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];
    expect(row).toHaveProperty("competencyCode");
    expect(row).toHaveProperty("competencyName");
    expect(row).toHaveProperty("principleCode");
    expect(row).toHaveProperty("principleName");
    expect(row).toHaveProperty("roleCode");
    expect(row).toHaveProperty("roleName");
    expect(typeof row.avgValue).toBe("number");
    expect(row.responseCount).toBeGreaterThanOrEqual(3);
  });

  test("Supervisor, no revealed data org-wide (org B) -> []", async () => {
    actingAs(supervisorBToken);
    const rows = await membersManager.getOrganizationCompetencySummary();

    expect(rows).toEqual([]);
  });

  test("non-Supervisor caller -> throws the RPC's own exact message, not swallowed", async () => {
    actingAs(dashboardEmployee.token);
    await expect(membersManager.getOrganizationCompetencySummary()).rejects.toThrow(
      // Recorded verbatim from get_organization_competency_summary's raised
      // exception (supabase/migrations/0054_expose_role_in_competency_reports.sql:83-).
      "Solo el administrador de la empresa puede ver este informe."
    );
  });
});

// ---------------------------------------------------------------------------
// membersManager.listCompetencyFrameworks -- the shared `competency_
// frameworks` catalog read reused by both mi-mapa/page.tsx and
// informe-empresa/page.tsx (members/self/reports domain migration). Not
// org-scoped or Supervisor-gated: `competency_frameworks readable by anyone
// authenticated` (0001_initial_schema.sql:195-197), so any signed-in
// caller, Supervisor or not, sees the same platform-wide catalog.
// ---------------------------------------------------------------------------

describe("membersManager.listCompetencyFrameworks", () => {
  test("any authenticated caller -> returns the full VACC catalog (camelCase)", async () => {
    actingAs(dashboardEmployee.token);
    const rows = await membersManager.listCompetencyFrameworks();

    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];
    expect(typeof row.code).toBe("string");
    expect(typeof row.name).toBe("string");
    // principle/role are null for Plenitud competencies (they don't live
    // inside any VACC role) -- assert the shape only, not non-null.
    expect(row).toHaveProperty("principleId");
    expect(row).toHaveProperty("roleId");
    expect(row).toHaveProperty("principle");
    expect(row).toHaveProperty("role");
  });

  test("a Supervisor from a different org sees the identical catalog (not org-scoped)", async () => {
    actingAs(supervisorToken);
    const asSupervisor = await membersManager.listCompetencyFrameworks();

    actingAs(supervisorBToken);
    const asSupervisorB = await membersManager.listCompetencyFrameworks();

    expect(asSupervisorB.map((r) => r.code).sort()).toEqual(asSupervisor.map((r) => r.code).sort());
  });

  // Story 7.3 (Biblioteca + AI-interpretation thresholds): this function now
  // also selects description/threshold_high/threshold_low (migrations
  // 0068/0079) -- every one of the 16 v2 competencies has all 3 populated
  // per those migrations' own UPDATE statements (no competency left with a
  // null description or threshold), so this asserts real string content,
  // not just the shape.
  test("every row also carries a non-empty description, thresholdHigh and thresholdLow (Story 7.3)", async () => {
    actingAs(dashboardEmployee.token);
    const rows = await membersManager.listCompetencyFrameworks();

    expect(rows.length).toBe(16);
    for (const row of rows) {
      expect(typeof row.description).toBe("string");
      expect((row.description as string).length).toBeGreaterThan(0);
      expect(typeof row.thresholdHigh).toBe("string");
      expect((row.thresholdHigh as string).length).toBeGreaterThan(0);
      expect(typeof row.thresholdLow).toBe("string");
      expect((row.thresholdLow as string).length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// membersManager.listCompetencyPrinciples / listCompetencyRoles -- Story 7.3
// (Biblioteca page): the 2 other platform-wide catalogs the diagram reads,
// same "readable by anyone authenticated", not org-scoped shape as
// listCompetencyFrameworks above.
// ---------------------------------------------------------------------------

describe("membersManager.listCompetencyPrinciples", () => {
  test("any authenticated caller -> includes 'wholeness' (Plenitud) and 'organizacion_teal', both with a description", async () => {
    actingAs(dashboardEmployee.token);
    const rows = await membersManager.listCompetencyPrinciples();

    const wholeness = rows.find((r) => r.code === "wholeness");
    const teal = rows.find((r) => r.code === "organizacion_teal");
    expect(wholeness).toBeDefined();
    expect(teal).toBeDefined();
    expect(wholeness!.description?.length).toBeGreaterThan(0);
    expect(teal!.description?.length).toBeGreaterThan(0);
  });
});

describe("membersManager.listCompetencyRoles", () => {
  test("any authenticated caller -> returns the 4 VACC roles, 'visionario' renamed to 'Visión' (model v2), each with a description", async () => {
    actingAs(dashboardEmployee.token);
    const rows = await membersManager.listCompetencyRoles();

    expect(rows.map((r) => r.code).sort()).toEqual(["arquitecto", "catalizador", "coach", "visionario"]);
    const vision = rows.find((r) => r.code === "visionario");
    expect(vision?.name).toBe("Visión");
    for (const row of rows) {
      expect(row.description?.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// getCallerMemberId() error path (Review Triage Log, finding 3): the
// duplicated helper in db/feedback.ts and db/cycles.ts throws "Debes
// iniciar sesión." when the caller's auth_user_id has no matching `members`
// row -- genuinely new code, never exercised elsewhere in this file (every
// other test's caller is a seeded, invite-accepted member). Exercised once
// here via getMyAdHocRequests; the identical helper in db/cycles.ts isn't
// re-tested separately (same body, same guard).
// ---------------------------------------------------------------------------

describe("getCallerMemberId() error path", () => {
  test("an auth user with no members row -> throws 'Debes iniciar sesión.'", async () => {
    // Signed up directly, skipping accept_member_invite/any invite flow --
    // this account is never linked to a members row in any organization.
    const orphanToken = await signUpOrSignIn(`orphan-3-26-${runId}@brujula-fake.test`, PASSWORD);

    actingAs(orphanToken);
    await expect(feedbackManager.getMyAdHocRequests()).rejects.toThrow("Debes iniciar sesión.");
  });
});
