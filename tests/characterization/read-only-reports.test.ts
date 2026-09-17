// Story 3.25 (_bmad-output/implementation-artifacts/
// spec-3-25-characterization-tests-read-only-reports-baseline.md):
// characterization tests for the read-only reports domain --
// src/app/dashboard/page.tsx, mi-mapa/page.tsx and informe-empresa/page.tsx
// -- run UNMODIFIED against a real, local `supabase start` instance,
// mirroring every prior characterization file's own proven technique. This
// is Epic 3's final domain block's first story (3.25-3.30), the
// lowest-risk domain (purely read), migrated last since it composes every
// other domain's own data. Captures the frozen baseline any future
// thin-delegate migration of these 3 pages must re-verify against.
//
// What's characterized, and how -- every genuinely in-scope, still-
// unmigrated read in the 3 pages above, called directly the exact same way
// each page calls it (no Server Action wraps any of it; none of these
// pages is rendered as a React component here -- not unit-testable in this
// repo, per the frozen Intent's own established constraint):
// - dashboard/page.tsx's 3 direct-table queries (no existing RPC or
//   manager wraps any of them): the caller's own in-progress ad-hoc/cycle
//   feedback requests (feedback_requests), the caller's open company
//   cycles (feedback_cycle_participants joined to feedback_cycles), and
//   the cycle-request dedup read (feedback_requests filtered to
//   request_type = 'cycle') -- via REST GET with the identical
//   select/filter/order PostgREST query string supabase-js builds for each
//   .from(...).select(...) call in the page (same restGet helper pattern
//   every prior characterization file uses for embedded selects).
// - get_my_report_groups (dashboard/page.tsx) -- confirmed via repo-wide
//   grep to have no existing manager wrapper (not even reportGroupsManager,
//   despite the name similarity) -- genuinely new, unlike
//   get_my_pending_invitations (see "deliberately excluded" below).
// - get_my_competency_map (mi-mapa/page.tsx), both render states (with and
//   without a closed 360).
// - get_organization_competency_summary (informe-empresa/page.tsx), all 3
//   states: Supervisor with revealed data, Supervisor with no revealed
//   data, and the RPC's own Supervisor-only access-control rejection (a
//   distinct check from the page's own separate redirect("/dashboard")
//   gate for the same case, which is a Next.js page-level concern, not
//   this RPC's own behavior, and isn't itself re-characterized here).
//
// Deliberately excluded (see the spec's frozen Intent for the investigated
// reasoning behind each):
// - is_platform_admin, accept_member_invite, claim_pending_email_invitations
//   (dashboard/page.tsx's own flag-gated bootstrap logic) -- already
//   Story 3.4's (adminManager/membersManager).
// - create_individual_account (the pendingIndividualSignup bootstrap
//   branch) -- a mutation with no manager equivalent, already excluded by
//   Story 3.2's own investigated scope correction; used here only as
//   fixture-building plumbing (createFreshIndividualAccount), same
//   allowance every prior domain story has taken for it.
// - get_my_pending_invitations (dashboard/page.tsx's pending-tasks list)
//   -- already frozen by Story 3.19's own characterization baseline
//   (responder-invitation.test.ts), the identical RPC, already wrapped by
//   feedbackManager.getMyPendingInvitations() (Story 3.14).
// - Rendering any of the 3 pages as React components -- not unit-testable
//   in this repo, per established constraint (no prior domain story has
//   attempted it either).
//
// Fixture: one fresh 8-employee demo company (org A) via
// scripts/seed-demo-company.mjs (same execFileSync + stdout-regex-parsing
// technique every prior domain story already established) for org/member/
// closed-cycle infrastructure -- seed-demo-company.mjs's own 3-bucket
// split ("cerrado"/"listo (sin cerrar)"/"a medias") already gives us both
// get_my_competency_map states (a closed employee, a not-yet-closed one)
// for free, so no extra cycle fixture-building is needed for that RPC.
// Every ad-hoc request and report group actually under test is built
// directly through the real, already-characterized RPCs from prior
// domains (create_ad_hoc_feedback_request, create_report_group -- never
// through the seed script's own internal calls, confirmed-empty for both,
// same baseline every prior domain story has established). A second,
// minimal org (org B, supervisor only, zero feedback_requests) is built
// directly via create_organization_as_admin -- the only way to reach
// get_organization_competency_summary's "no revealed data" state, since
// seed-demo-company.mjs always closes at least one employee's 360
// (bucket 0 is always "cerrado", even at employee count 1) and so can
// never produce a company with zero closed cycles.

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
// Hard boundary from the spec: never run this suite against a remote
// Supabase project, dev or production -- only the local CLI instance.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(SUPABASE_URL)) {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL (${SUPABASE_URL}) no es la instancia local de \`supabase start\`. ` +
      "Estos tests nunca deben correr contra un proyecto remoto."
  );
}

// ---------------------------------------------------------------------------
// Small REST/RPC/auth helpers -- same anon-key-only pattern every prior
// characterization file in this repo uses. No Server Action / Next.js
// mocking needed at all in this file: every read characterized here is a
// direct RPC or direct-table REST call, exactly as each page calls it --
// none of it goes through a Server Action.
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

async function expectRpcRejects(name: string, token: string, body: Record<string, unknown>, message: string) {
  await expect(callRpc(name, token, body)).rejects.toThrow(message);
}

// ---------------------------------------------------------------------------
// Fixture: org A -- one fresh 8-employee demo company via
// scripts/seed-demo-company.mjs (>= 5 needed for create_ad_hoc_feedback_request's
// min-invitees guard, plus a couple spare across the 3 realism buckets).
// See the file header for what's built by the seed script vs. directly by
// this file.
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
// for every dashboard direct-table read below (it's a cycle participant
// with its own not-yet-closed cycle request, matching the "open company
// cycles" / "cycle-request dedup" scenarios) plus gets a fresh ad_hoc
// request built directly through create_ad_hoc_feedback_request, plus
// doubles as get_my_competency_map's "without closed 360" state and
// get_my_report_groups's "none" state (it's never invited to anything).
let dashboardEmployee: SeededEmployee;
let adHocRequestId: string;
const AD_HOC_REQUEST_NAME = "Feedback de prueba (característica 3.25)";

// closedInvitee: bucket "cerrado" -- get_my_competency_map's "with closed
// 360" state, and the sole invitee of the report-group fixture below (only
// a member with an already-closed 360 is eligible per create_report_group's
// own guard).
let closedInvitee: SeededEmployee;
let reportGroupId: string;
let reportGroupCreator: SeededEmployee;

// Org B: a second, minimal company (supervisor only, zero feedback_requests
// of any kind) -- get_organization_competency_summary's "no revealed data"
// state. Built directly via create_organization_as_admin, never through
// the seed script (which always closes at least one 360).
let supervisorBToken: string;

const runId = Date.now();

beforeAll(async () => {
  const companyName = `Char Test ReadOnly Reports ${runId}`;
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
  // Mirrors create_feedback_cycle's own opens_at/closes_at, computed the
  // same way seed-demo-company.mjs computes them (same wall-clock day).
  seedOpensAt = today;
  seedClosesAt = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  // --- ad_hoc fixture: dashboardEmployee's own in-progress feedback
  // request, built directly via the already-characterized RPC, never
  // through the seed script. >= 5 invitees, excluding itself.
  const adHocInvitees = orgAEmployees
    .filter((e) => e.id !== dashboardEmployee.id)
    .slice(0, 5)
    .map((e) => e.id);
  adHocRequestId = (await callRpc("create_ad_hoc_feedback_request", dashboardEmployee.token, {
    p_invitee_member_ids: adHocInvitees,
    p_subtype: "general",
    p_name: AD_HOC_REQUEST_NAME,
  })) as string;

  // --- report-group fixture: reportGroupCreator (active, doesn't itself
  // need a closed 360) invites closedInvitee (the only kind of member
  // create_report_group's own guard allows -- must already have a closed
  // 360), built directly via the already-characterized RPC.
  // 0099_report_groups_membership_management_and_email.sql: create_report_group
  // changed from `returns uuid` to `returns table(...)` -- one row per
  // invitee, group_id repeated on each. NOT otherwise updated for that
  // migration's other 2 changes (creator now needs their own closed 360;
  // creator is now auto-inserted as an accepted member) -- see
  // REVIEW-NOTES.md next to this repo's mvc-layering skill, "reportGroupCreator
  // now needs a real closed 360" -- reportGroupCreator below is
  // readyEmployees[0] (bucket "listo, sin cerrar"), which this migration's
  // new guard now rejects outright. Flagged, not fixed, in this pass.
  const createReportGroupRows = (await callRpc("create_report_group", reportGroupCreator.token, {
    p_name: "Grupo de prueba (característica 3.25)",
    p_member_ids: [closedInvitee.id],
  })) as { group_id: string }[];
  reportGroupId = createReportGroupRows[0].group_id;

  // --- org B fixture: a second, minimal company with zero feedback_requests
  // -- get_organization_competency_summary's "no revealed data" state.
  const paToken = await signUpOrSignIn(PLATFORM_ADMIN_EMAIL, PASSWORD);
  const orgBName = `Char Test ReadOnly Empty ${runId}`;
  const orgBAdminEmail = `admin@char-test-readonly-empty-${runId}.brujula-fake.test`;
  const orgBInviteToken = (await callRpc("create_organization_as_admin", paToken, {
    p_org_name: orgBName,
    p_admin_email: orgBAdminEmail,
    p_admin_full_name: "Admin Empresa Vacía",
  })) as string;
  supervisorBToken = await signUpWithInvite(orgBAdminEmail, PASSWORD, orgBInviteToken);
  await callRpc("accept_member_invite", supervisorBToken, { p_token: orgBInviteToken });
});

afterAll(() => {
  // Nothing to reset -- this file never mocks any Server Action/Next.js
  // module (see file header), so there's no shared `acting` state like
  // every other characterization file's own afterAll resets.
});

// ---------------------------------------------------------------------------
// dashboard/page.tsx's 3 direct-table queries -- called directly with the
// identical select/filter/order PostgREST query string supabase-js builds
// for each (src/app/dashboard/page.tsx:193-229).
// ---------------------------------------------------------------------------

describe("dashboard: in-progress feedback requests read (feedback_requests)", () => {
  test("caller has an open ad-hoc request and an open cycle request -> both rows, exact shape", async () => {
    const rows = (await restGet(
      `feedback_requests?select=id,created_at,request_type,status,name,feedback_cycles(name)` +
        `&requester_member_id=eq.${dashboardEmployee.id}&order=created_at.desc`,
      dashboardEmployee.token
    )) as {
      id: string;
      created_at: string;
      request_type: string;
      status: string;
      name: string | null;
      feedback_cycles: { name: string } | null;
    }[];

    expect(rows).toHaveLength(2);

    const adHocRow = rows.find((r) => r.request_type === "ad_hoc");
    expect(adHocRow).toEqual({
      id: adHocRequestId,
      created_at: adHocRow!.created_at,
      request_type: "ad_hoc",
      status: "open",
      name: AD_HOC_REQUEST_NAME,
      feedback_cycles: null,
    });

    const cycleRow = rows.find((r) => r.request_type === "cycle");
    expect(cycleRow).toEqual({
      id: cycleRow!.id,
      created_at: cycleRow!.created_at,
      request_type: "cycle",
      status: "open",
      name: null,
      feedback_cycles: { name: seedCycleName },
    });
  });

  // The page's own query (dashboard/page.tsx:193-197) has no
  // .eq("status", ...) clause -- it returns both open AND closed
  // feedback_requests, and the page renders a closed one with a distinct
  // " — cerrada" suffix (dashboard/page.tsx:~422,
  // request.status === "closed" && !isCycle). Runs after the test above so
  // its own 2-row/open-ad-hoc assertions are captured first, unmutated.
  test("closing the ad-hoc request adds a 3rd (closed) row, in created_at.desc order", async () => {
    // close_ad_hoc_feedback_request (supabase/migrations/
    // 0014_close_completed_ad_hoc_request.sql; wrapped, unflagged, in
    // src/app/actions/feedback.ts) -- closes the original open ad_hoc
    // request from beforeAll.
    await callRpc("close_ad_hoc_feedback_request", dashboardEmployee.token, {
      p_request_id: adHocRequestId,
    });

    // create_ad_hoc_feedback_request's own "one open at a time" guard
    // (0057_feedback_request_name.sql) means a 2nd one can only be created
    // now that the 1st is closed -- this is genuinely the 3rd distinct
    // feedback_requests row for dashboardEmployee (the other being the
    // seed's own cycle request).
    const secondAdHocInvitees = orgAEmployees
      .filter((e) => e.id !== dashboardEmployee.id)
      .slice(0, 5)
      .map((e) => e.id);
    const secondAdHocName = "Segunda solicitud (característica 3.25)";
    const secondAdHocRequestId = (await callRpc(
      "create_ad_hoc_feedback_request",
      dashboardEmployee.token,
      { p_invitee_member_ids: secondAdHocInvitees, p_subtype: "general", p_name: secondAdHocName }
    )) as string;

    const rows = (await restGet(
      `feedback_requests?select=id,created_at,request_type,status,name,feedback_cycles(name)` +
        `&requester_member_id=eq.${dashboardEmployee.id}&order=created_at.desc`,
      dashboardEmployee.token
    )) as {
      id: string;
      created_at: string;
      request_type: string;
      status: string;
      name: string | null;
      feedback_cycles: { name: string } | null;
    }[];

    expect(rows).toHaveLength(3);

    // created_at.desc, asserted by array index (not just .find()): newest
    // first is the just-created 2nd ad_hoc (open), then the now-closed
    // original ad_hoc, then the cycle request -- the seed script's own
    // organize_cycle_evaluators call created it before this file's
    // beforeAll ever touched an ad_hoc request.
    expect(rows[0]).toEqual({
      id: secondAdHocRequestId,
      created_at: rows[0].created_at,
      request_type: "ad_hoc",
      status: "open",
      name: secondAdHocName,
      feedback_cycles: null,
    });
    expect(rows[1]).toEqual({
      id: adHocRequestId,
      created_at: rows[1].created_at,
      request_type: "ad_hoc",
      status: "closed",
      name: AD_HOC_REQUEST_NAME,
      feedback_cycles: null,
    });
    expect(rows[2]).toEqual({
      id: rows[2].id,
      created_at: rows[2].created_at,
      request_type: "cycle",
      status: "open",
      name: null,
      feedback_cycles: { name: seedCycleName },
    });
  });

  // feedback_requests's RLS policy (supabase/migrations/
  // 0001_initial_schema.sql:220-223) is `organization_id in (select
  // auth_member_organization_ids())` -- organization-scoped only, unlike
  // e.g. feedback_cycle_participants's own per-member policy
  // (0017_supervisor_and_admin_management.sql:194-196, `member_id in
  // (select id from members where auth_user_id = auth.uid())`). The
  // account boundary in dashboard/page.tsx's own query (line 196,
  // .eq("requester_member_id", member.id)) is therefore enforced entirely
  // by that query's own filter clause -- NOT backed by RLS. This locks in
  // that current reality: a DIFFERENT org-A employee's own token, with the
  // identical filter still targeting dashboardEmployee's id, successfully
  // reads dashboardEmployee's own rows -- proving the account boundary
  // today lives only in the page's own filter, never in the database.
  test("RLS scopes feedback_requests to the organization only, not per-member -- another org-A employee's token can still read dashboardEmployee's own rows when the filter targets them", async () => {
    const otherEmployee = orgAEmployees.find((e) => e.id !== dashboardEmployee.id)!;

    const rows = (await restGet(
      `feedback_requests?select=id,requester_member_id&requester_member_id=eq.${dashboardEmployee.id}`,
      otherEmployee.token
    )) as { id: string; requester_member_id: string }[];

    // RLS does not reject this request, and it returns dashboardEmployee's
    // own rows to a different member's token -- the page itself never
    // constructs a query like this (its own supabase client always filters
    // by the CALLER's own member.id), but if that .eq() clause were ever
    // dropped or loosened, RLS alone would not catch it.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.requester_member_id === dashboardEmployee.id)).toBe(true);
  });
});

describe("dashboard: open company cycles read (feedback_cycle_participants -> feedback_cycles)", () => {
  test("caller is a participant in an open cycle -> the cycle's id/name/opens_at/closes_at", async () => {
    const rows = (await restGet(
      `feedback_cycle_participants?select=feedback_cycles(id,name,opens_at,closes_at)&member_id=eq.${dashboardEmployee.id}`,
      dashboardEmployee.token
    )) as { feedback_cycles: { id: string; name: string; opens_at: string; closes_at: string } | null }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].feedback_cycles).toEqual({
      id: seedCycleId,
      name: seedCycleName,
      opens_at: seedOpensAt,
      closes_at: seedClosesAt,
    });
  });
});

describe("dashboard: cycle-request dedup read (feedback_requests, request_type = cycle)", () => {
  test("caller already organized evaluators for this cycle -> its own cycle request id/cycle_id", async () => {
    const rows = (await restGet(
      `feedback_requests?select=id,cycle_id&requester_member_id=eq.${dashboardEmployee.id}&request_type=eq.cycle`,
      dashboardEmployee.token
    )) as { id: string; cycle_id: string }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].cycle_id).toBe(seedCycleId);
  });
});

// ---------------------------------------------------------------------------
// get_my_report_groups -- direct RPC, exactly as dashboard/page.tsx calls
// it (line ~245). Confirmed via repo-wide grep to have no existing manager
// wrapper.
// ---------------------------------------------------------------------------

describe("get_my_report_groups", () => {
  test("caller invited to an unaccepted report group -> the group, my_status: pending", async () => {
    const rows = (await callRpc("get_my_report_groups", closedInvitee.token, {})) as {
      id: string;
      name: string;
      status: string;
      created_by_member_id: string;
      is_creator: boolean;
      my_status: string | null;
      accepted_count: number;
      total_count: number;
    }[];

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: reportGroupId,
      name: "Grupo de prueba (característica 3.25)",
      status: "open",
      created_by_member_id: reportGroupCreator.id,
      is_creator: false,
      my_status: "pending",
      accepted_count: 0,
      total_count: 1,
    });

    // dashboard/page.tsx's own filter (line ~249): only 'pending' rows
    // surface as "Tareas pendientes".
    const pendingOnly = rows.filter((g) => g.my_status === "pending").map((g) => ({ id: g.id, name: g.name }));
    expect(pendingOnly).toEqual([{ id: reportGroupId, name: "Grupo de prueba (característica 3.25)" }]);
  });

  test("caller has no report groups -> []", async () => {
    const rows = await callRpc("get_my_report_groups", dashboardEmployee.token, {});

    expect(rows).toEqual([]);
  });

  test("caller is the creator -> is_creator: true, my_status: null", async () => {
    // create_report_group never inserts the creator itself into
    // report_group_members (only invitees -- supabase/migrations/
    // 0064_report_groups.sql:136-145) -- get_my_report_groups's own
    // rgm_self left join then has no matching row for the creator, so
    // my_status is null, not "pending" (0065_fix_get_my_report_groups.sql).
    const rows = (await callRpc("get_my_report_groups", reportGroupCreator.token, {})) as {
      id: string;
      name: string;
      status: string;
      created_by_member_id: string;
      is_creator: boolean;
      my_status: string | null;
      accepted_count: number;
      total_count: number;
    }[];

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: reportGroupId,
      name: "Grupo de prueba (característica 3.25)",
      status: "open",
      created_by_member_id: reportGroupCreator.id,
      is_creator: true,
      my_status: null,
      accepted_count: 0,
      total_count: 1,
    });
  });

  // Runs last in this describe block -- mutates closedInvitee's own
  // report_group_members row, so it must come after the "has pending" test
  // above, which depends on that row still being 'pending'.
  test("caller accepts the invitation -> my_status becomes 'accepted', and the page's own pendingOnly filter now excludes it", async () => {
    // respond_to_report_group (supabase/migrations/0064_report_groups.sql:
    // 181-218; wrapped, unflagged, in src/server/db/reportGroups.ts).
    await callRpc("respond_to_report_group", closedInvitee.token, {
      p_group_id: reportGroupId,
      p_accept: true,
    });

    const rows = (await callRpc("get_my_report_groups", closedInvitee.token, {})) as {
      id: string;
      name: string;
      status: string;
      created_by_member_id: string;
      is_creator: boolean;
      my_status: string | null;
      accepted_count: number;
      total_count: number;
    }[];

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: reportGroupId,
      name: "Grupo de prueba (característica 3.25)",
      status: "open",
      created_by_member_id: reportGroupCreator.id,
      is_creator: false,
      my_status: "accepted",
      accepted_count: 1,
      total_count: 1,
    });

    // dashboard/page.tsx's own filter (line ~249): only 'pending' rows
    // surface as "Tareas pendientes" -- now that closedInvitee has
    // accepted, the filter genuinely excludes this group, not just happens
    // to include the one pending one.
    const pendingOnly = rows.filter((g) => g.my_status === "pending").map((g) => ({ id: g.id, name: g.name }));
    expect(pendingOnly).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// get_my_competency_map -- direct RPC, exactly as mi-mapa/page.tsx calls
// it (line 42), both render states (mapRows.length > 0 / === 0).
// ---------------------------------------------------------------------------

describe("get_my_competency_map", () => {
  test("caller has a closed cycle request -> per-competency rows, base_value/mention_delta/last_cycle_closed_at", async () => {
    const frameworkRows = (await restGet("competency_frameworks?select=code", closedInvitee.token)) as {
      code: string;
    }[];
    const expectedCodes = new Set(frameworkRows.map((r) => r.code));
    expect(expectedCodes.size).toBeGreaterThan(0);

    const rows = (await callRpc("get_my_competency_map", closedInvitee.token, {})) as {
      competency_code: string;
      base_value: number | null;
      mention_delta: number;
      last_cycle_closed_at: string;
    }[];

    // One row per competency framework (left join), regardless of whether
    // every one has data -- mi-mapa/page.tsx's own hasClosedCycle check
    // (mapRows.length > 0) is what this non-empty result drives.
    expect(rows).toHaveLength(expectedCodes.size);
    expect(new Set(rows.map((r) => r.competency_code))).toEqual(expectedCodes);

    // closedInvitee's own 360 was closed by seed-demo-company.mjs's
    // "cerrado" bucket, with all 5 evaluators answering every competency
    // question -- every row has a real, numeric base_value.
    for (const row of rows) {
      expect(typeof row.base_value).toBe("number");
      // No ad_hoc requests exist for closedInvitee after its 360 closed
      // (only the seed's own cycle flow touched this member) -> zero
      // mentions on every competency.
      expect(row.mention_delta).toBe(0);
      // close_cycle_request sets closes_at = current_date (supabase/
      // migrations/0060_finalize_cycle_request.sql:49) -- the same day
      // this suite's own beforeAll ran.
      expect(row.last_cycle_closed_at).toBe(today);
    }
  });

  test("caller has never closed a cycle -> [] (the RPC's own early return)", async () => {
    // dashboardEmployee is in the "a medias" bucket -- its own cycle
    // request is still open, never closed.
    const rows = await callRpc("get_my_competency_map", dashboardEmployee.token, {});

    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// get_organization_competency_summary -- direct RPC, exactly as
// informe-empresa/page.tsx calls it (line 42). All 3 states: Supervisor
// with revealed data, Supervisor with no revealed data (org B), and the
// RPC's own Supervisor-only access-control rejection.
// ---------------------------------------------------------------------------

describe("get_organization_competency_summary", () => {
  test("Supervisor, closed/threshold-met requests exist org-wide -> per-competency aggregate rows", async () => {
    const rows = (await callRpc("get_organization_competency_summary", supervisorToken, {})) as {
      competency_code: string;
      competency_name: string;
      principle_code: string | null;
      principle_name: string | null;
      role_code: string | null;
      role_name: string | null;
      avg_value: number;
      response_count: number;
    }[];

    // org A has 3 closed employees (the "cerrado" bucket), each with 5
    // peer evaluator responses per competency -- well past the default
    // min_responses_to_reveal threshold (3).
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];
    expect(row).toHaveProperty("competency_code");
    expect(row).toHaveProperty("competency_name");
    expect(row).toHaveProperty("principle_code");
    expect(row).toHaveProperty("principle_name");
    expect(row).toHaveProperty("role_code");
    expect(row).toHaveProperty("role_name");
    expect(typeof row.avg_value).toBe("number");
    expect(row.response_count).toBeGreaterThanOrEqual(3);
  });

  test("Supervisor, no request meets the reveal threshold org-wide (org B: zero feedback_requests) -> []", async () => {
    const rows = await callRpc("get_organization_competency_summary", supervisorBToken, {});

    expect(rows).toEqual([]);
  });

  test("non-Supervisor caller -> throws the RPC's own exact access-control message", async () => {
    await expectRpcRejects(
      "get_organization_competency_summary",
      dashboardEmployee.token,
      {},
      // Recorded verbatim from get_organization_competency_summary's raised
      // exception (supabase/migrations/0054_expose_role_in_competency_reports.sql:83-).
      "Solo el administrador de la empresa puede ver este informe."
    );
  });
});
