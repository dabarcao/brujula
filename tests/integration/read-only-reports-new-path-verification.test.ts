// Story 3.30 (_bmad-output/implementation-artifacts/
// spec-3-30-read-only-reports-new-path-verification.md): originally the
// sixth and final domain's own real-Supabase, flag-off-vs-flag-on
// equivalence check -- the same "worst possible outcome" gate every prior
// domain's own "-new-path-verification" file already established. That
// domain's rollback flag has since been deleted (spec-5-1b) and the
// manager-backed path below is now the only path, so this file continues
// to serve as the domain's own real-Supabase, real-manager, real-render
// re-verification against Story 3.25's characterization baseline -- a
// single render per scenario, asserted directly, rather than a flag-off-
// vs-flag-on comparison.
//
// What's real: the 3 page components, all 4 managers this domain composes
// (feedbackManager, cyclesManager, reportGroupsManager, membersManager),
// their db/*.ts files, and every Postgres RPC/table underneath, run
// against the local instance. What's mocked, and why: only
// `@/lib/supabase/server` (routed to the real local instance via a bearer
// token per `actingAs(token)`, identical to every prior new-path-
// verification file's own technique) and `next/navigation`'s `redirect`
// (a "throw a marker" mock, so an unexpected redirect surfaces as a clear
// assertion failure instead of Next.js's own out-of-request-scope
// behavior) -- no manager or RPC is ever mocked.
//
// Fixture technique: Story 3.25's own real-seed approach
// (scripts/seed-demo-company.mjs, org A 8-employee + minimal org B),
// reused verbatim for org/member/closed-cycle infrastructure, extended
// with a third minimal org (org C) -- see the "Investigated (not guessed)"
// note below for why.
//
// Investigated (not guessed): the frozen I/O matrix's dashboard row
// ("open ad-hoc + open cycle request, unorganized open cycle, pending
// report group") cannot be produced on ONE real member's dashboard at
// once, for two independent, confirmed-by-direct-read reasons:
//   1. create_feedback_cycle's own "one open cycle at a time" rule
//      (supabase/migrations/0023_one_open_cycle_at_a_time.sql) blocks a
//      member from ever becoming a participant of a second company cycle
//      while still a participant of one whose closes_at hasn't passed --
//      true for every org-A employee for this entire test run (the seed
//      cycle's closes_at is 30 days out) regardless of whether that
//      member's OWN cycle request is open or closed. So "open cycle
//      request" (a member who organized their evaluators for the sole
//      cycle they participate in) and "unorganized open cycle" (a member
//      who hasn't) can never both be true for the same member in the same
//      org during this test.
//   2. create_report_group's own guard (supabase/migrations/
//      0064_report_groups.sql:78-) only allows inviting a member who
//      already has a CLOSED cycle request -- mutually exclusive with
//      "open cycle request" for that same member too.
// Rather than force an impossible state, this file covers each element of
// that row as its own real, independently-meaningful scenario, just not
// crammed onto a single member's render the way Story 3.28's own MOCKED
// (not real-DB-constrained) fixture could. Org C exists solely to produce
// the "unorganized open cycle" state: a member who is a real cycle
// participant but has deliberately never called organize_cycle_evaluators.
//
// Investigated (not guessed): the non-Supervisor get_organization_
// competency_summary rejection is unreachable through informe-empresa/
// page.tsx itself (this spec's own frozen Intent) -- not re-tested here.

import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import type React from "react";
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
// here for org B/org C's own create_organization_as_admin calls, same as
// Story 3.25's own suite.
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

// ---------------------------------------------------------------------------
// Mocks -- @/lib/supabase/server routed to the real local instance (same
// technique as tests/integration/responder-invitation-new-path-
// verification.test.ts), next/navigation's redirect() as a marker-throw
// (same technique every prior suite in this repo uses).
// ---------------------------------------------------------------------------

const acting = vi.hoisted(() => ({ token: null as string | null, initialized: false }));

/** Subsequent page calls act as this already-logged-in member. Every
 * scenario in this file is a logged-in member (none of the 3 pages under
 * test has an anonymous-caller state), so this is the only acting helper
 * this file needs. */
function actingAs(token: string) {
  acting.token = token;
  acting.initialized = true;
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const err = new Error(`test redirect marker: ${url}`) as Error & { redirectUrl: string };
    err.redirectUrl = url;
    throw err;
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async (): Promise<SupabaseClient> => {
    if (!acting.initialized) {
      throw new Error("test bug: actingAs(token) must be called before rendering a page");
    }
    return createSupabaseJsClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: acting.token ? { headers: { Authorization: `Bearer ${acting.token}` } } : {},
    });
  },
}));

// Imported after the mocks above are declared (Vitest hoists `vi.mock` to
// the top of the module regardless of source order) so that importing
// these, the unmodified Story 3.28 files, picks up the mocked
// `next/navigation` and `@/lib/supabase/server`.
import DashboardPage from "@/app/dashboard/page";
import MiMapaDeCompetenciasPage from "@/app/dashboard/mi-mapa/page";
import InformeEmpresaPage from "@/app/dashboard/informe-empresa/page";

// ---------------------------------------------------------------------------
// Small REST/RPC/auth helpers -- same anon-key-only pattern every prior
// characterization/integration suite in this repo uses.
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

/** Direct RPC call, used only as fixture-building plumbing (never for the
 * pages actually under test) -- same investigated allowance every prior
 * new-path-verification/characterization file in this repo establishes. */
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

/** Renders a page function once against the already-built real state.
 * Replaces the old flag-off-vs-flag-on `renderOldAndNew` helper now that
 * the read-only-reports domain's rollback flag has been deleted
 * (spec-5-1b) -- there is no second branch left to compare against. */
async function renderPage(page: () => Promise<React.ReactElement>): Promise<string> {
  return renderToStaticMarkup(await page());
}

afterEach(() => {
  acting.token = null;
  acting.initialized = false;
});

// ---------------------------------------------------------------------------
// Fixture: org A -- one fresh 8-employee demo company via
// scripts/seed-demo-company.mjs, same technique and headcount as Story
// 3.25's own suite. Org B -- a second, minimal company (supervisor only,
// zero feedback_requests), same as Story 3.25's own "no revealed data"
// fixture. Org C -- a third, minimal company built solely to produce the
// "unorganized open cycle" dashboard state (see the "Investigated" note
// in the file header for why org A's own 8 employees can never reach it).
// ---------------------------------------------------------------------------

type SeededEmployee = { email: string; bucketLabel: string; token: string; id: string };

let supervisorToken: string; // org A
let orgAEmployees: SeededEmployee[];

// closedInvitee: bucket "cerrado" -- mi-mapa's "closed 360" state, and the
// sole invitee of the report-group fixture below (only a member with an
// already-closed 360 is eligible per create_report_group's own guard --
// see the file header's "Investigated" note).
let closedInvitee: SeededEmployee;
// neverClosedEmployee: bucket "a medias" -- mi-mapa's "never closed"
// state, and dashboard's "open ad-hoc + open cycle request" state (its own
// cycle request from the seed stays open, since only the "cerrado" bucket
// ever closes it).
let neverClosedEmployee: SeededEmployee;
// reportGroupCreator: bucket "listo (sin cerrar)" -- doesn't itself need a
// closed 360 to CREATE a group, only to be invited to one.
let reportGroupCreator: SeededEmployee;

let supervisorBToken: string; // org B
let supervisorCToken: string; // org C
let orgCEmployeeToken: string; // org C's sole employee -- the "unorganized open cycle" caller

const runId = Date.now();

beforeAll(async () => {
  // --- org A: 8-employee demo company (same script/technique as Story
  // 3.25's own beforeAll). ---
  const companyNameA = `New Path Verif Reports ${runId}`;
  let seedOutput: string;
  try {
    seedOutput = execFileSync("node", [path.join("scripts", "seed-demo-company.mjs"), companyNameA, "8"], {
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
    throw new Error(`seed-demo-company.mjs no produjo los 3 buckets esperados. Salida completa:\n${seedOutput}`);
  }

  closedInvitee = closedEmployees[0];
  neverClosedEmployee = halfDoneEmployees[0];
  reportGroupCreator = readyEmployees[0];

  // --- neverClosedEmployee's own open ad-hoc request (dashboard's "open
  // ad-hoc" state), built directly via the already-characterized RPC. ---
  const adHocInvitees1 = orgAEmployees
    .filter((e) => e.id !== neverClosedEmployee.id)
    .slice(0, 5)
    .map((e) => e.id);
  await callRpc("create_ad_hoc_feedback_request", neverClosedEmployee.token, {
    p_invitee_member_ids: adHocInvitees1,
    p_subtype: "general",
    p_name: "New path verif -- ad hoc (a medias)",
  });

  // --- closedInvitee's own open ad-hoc request (dashboard's "open ad-hoc"
  // state alongside its already-closed cycle request and the pending group
  // invite below). ---
  const adHocInvitees2 = orgAEmployees
    .filter((e) => e.id !== closedInvitee.id)
    .slice(0, 5)
    .map((e) => e.id);
  await callRpc("create_ad_hoc_feedback_request", closedInvitee.token, {
    p_invitee_member_ids: adHocInvitees2,
    p_subtype: "general",
    p_name: "New path verif -- ad hoc (cerrado)",
  });

  // --- report-group fixture: reportGroupCreator invites closedInvitee
  // (the only kind of member create_report_group's own guard allows --
  // must already have a closed 360), built directly via the
  // already-characterized RPC (dashboard's "pending report group" state).
  // 0099_report_groups_membership_management_and_email.sql: create_report_group
  // now also requires its OWN caller to have a closed 360 -- reportGroupCreator
  // below is readyEmployees[0] (bucket "listo, sin cerrar"), which this
  // guard now rejects. This call will throw where it didn't before. Not
  // fixed in this pass -- see REVIEW-NOTES.md next to this repo's
  // mvc-layering skill.
  await callRpc("create_report_group", reportGroupCreator.token, {
    p_name: "New path verif -- grupo",
    p_member_ids: [closedInvitee.id],
  });

  // --- org B: a second, minimal company with zero feedback_requests --
  // dashboard's empty state and informe-empresa's "no revealed data"
  // state. Built directly via create_organization_as_admin, never through
  // the seed script (which always closes at least one 360). Same
  // technique as Story 3.25's own suite.
  const paToken = await signUpOrSignIn(PLATFORM_ADMIN_EMAIL, PASSWORD);
  const orgBName = `New Path Verif Reports Empty ${runId}`;
  const orgBAdminEmail = `admin@new-path-verif-reports-empty-${runId}.brujula-fake.test`;
  const orgBInviteToken = (await callRpc("create_organization_as_admin", paToken, {
    p_org_name: orgBName,
    p_admin_email: orgBAdminEmail,
    p_admin_full_name: "Admin Empresa Vacía",
  })) as string;
  supervisorBToken = await signUpWithInvite(orgBAdminEmail, PASSWORD, orgBInviteToken);
  await callRpc("accept_member_invite", supervisorBToken, { p_token: orgBInviteToken });

  // --- org C: a third, minimal company built solely to reach dashboard's
  // "unorganized open cycle" state -- a real cycle participant who has
  // deliberately never called organize_cycle_evaluators. See the file
  // header's "Investigated" note for why org A's own 8 already-organized
  // employees can never produce this state.
  const orgCName = `New Path Verif Reports Cycle ${runId}`;
  const orgCAdminEmail = `admin@new-path-verif-reports-cycle-${runId}.brujula-fake.test`;
  const orgCInviteToken = (await callRpc("create_organization_as_admin", paToken, {
    p_org_name: orgCName,
    p_admin_email: orgCAdminEmail,
    p_admin_full_name: "Admin Empresa Ciclo",
  })) as string;
  supervisorCToken = await signUpWithInvite(orgCAdminEmail, PASSWORD, orgCInviteToken);
  await callRpc("accept_member_invite", supervisorCToken, { p_token: orgCInviteToken });

  const orgCDeptId = (await callRpc("create_department", supervisorCToken, {
    p_name: "Departamento Único",
  })) as string;
  const orgCEmployeeEmail = `empleado@new-path-verif-reports-cycle-${runId}.brujula-fake.test`;
  const orgCInviteMemberToken = (await callRpc("invite_member", supervisorCToken, {
    p_email: orgCEmployeeEmail,
    p_full_name: "Empleado Ciclo Sin Organizar",
    p_department_id: orgCDeptId,
  })) as string;
  orgCEmployeeToken = await signUpWithInvite(orgCEmployeeEmail, PASSWORD, orgCInviteMemberToken);
  await callRpc("accept_member_invite", orgCEmployeeToken, { p_token: orgCInviteMemberToken });

  const orgCEmployeeRows = (await restGet(
    `members?select=id&email=eq.${orgCEmployeeEmail}`,
    supervisorCToken
  )) as { id: string }[];
  const orgCEmployeeId = orgCEmployeeRows[0].id;

  const opensAt = new Date().toISOString().slice(0, 10);
  const closesAt = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  // Deliberately never followed by organize_cycle_evaluators for this
  // employee -- that omission itself is the fixture.
  await callRpc("create_feedback_cycle", supervisorCToken, {
    p_name: `Ciclo Sin Organizar ${runId}`,
    p_opens_at: opensAt,
    p_closes_at: closesAt,
    p_participant_member_ids: [orgCEmployeeId],
  });
}, 180_000);

afterAll(() => {
  acting.token = null;
  acting.initialized = false;
});

// ---------------------------------------------------------------------------
// dashboard/page.tsx
// ---------------------------------------------------------------------------

describe("dashboard/page.tsx (real Supabase)", () => {
  test("open ad-hoc + own open cycle request (org A, neverClosedEmployee)", async () => {
    actingAs(neverClosedEmployee.token);

    const html = await renderPage(() => DashboardPage());

    expect(html).toContain("Feedback ágil New path verif -- ad hoc (a medias)");
    expect(html).toContain("Ciclo 360");
    expect(html).not.toContain("Ciclos 360 abiertos"); // already organized -- not in cyclesToOrganize
  });

  test("open ad-hoc + closed cycle entry + pending report group invite (org A, closedInvitee)", async () => {
    actingAs(closedInvitee.token);

    const html = await renderPage(() => DashboardPage());

    expect(html).toContain("Feedback ágil New path verif -- ad hoc (cerrado)");
    // Rendered as a CardAccent "moment" card (eyebrow "Informe de grupo" +
    // title + "Esperando tu respuesta" meta) rather than the old single
    // "Te han invitado al grupo <name>" sentence.
    expect(html).toContain("Informe de grupo");
    expect(html).toContain("Esperando tu respuesta");
    expect(html).toContain("New path verif -- grupo");
  });

  // Review Triage Log: Edge Case Hunter found every caller above has at
  // most one feedback_requests row per type (ad_hoc/cycle) -- not enough
  // to distinguish a correct real-Postgres created_at-desc merge from a
  // lucky/stable per-type concat, unlike Story 3.28's own mock suite,
  // which deliberately fed 2+2 rows for exactly this reason. Closing
  // closedInvitee's existing open ad-hoc request and opening a second one
  // (create_ad_hoc_feedback_request's own "one open at a time" guard means
  // this is the only way to reach a genuine 2nd same-type row) gives this
  // caller 2 ad_hoc rows (one closed, one open) alongside its 1 cycle row
  // -- a real 3-row, real-timestamp merge to sort, returned by an actual
  // PostgREST `.order("created_at", { ascending: false })` call.
  test("2 ad-hoc rows (1 closed, 1 open) + 1 cycle row, real Postgres-returned order (org A, closedInvitee)", async () => {
    await callRpc("close_ad_hoc_feedback_request", closedInvitee.token, {
      p_request_id: (
        (await restGet(
          `feedback_requests?select=id&requester_member_id=eq.${closedInvitee.id}&request_type=eq.ad_hoc&status=eq.open`,
          closedInvitee.token
        )) as { id: string }[]
      )[0].id,
    });
    const secondAdHocInvitees = orgAEmployees
      .filter((e) => e.id !== closedInvitee.id)
      .slice(0, 5)
      .map((e) => e.id);
    await callRpc("create_ad_hoc_feedback_request", closedInvitee.token, {
      p_invitee_member_ids: secondAdHocInvitees,
      p_subtype: "general",
      p_name: "New path verif -- ad hoc #2 (cerrado)",
    });

    actingAs(closedInvitee.token);
    const html = await renderPage(() => DashboardPage());

    // Story 7.2: en-curso/cerrado split, not an inline " — cerrada" suffix
    // in one merged list -- the still-open 2nd ad_hoc request renders
    // under "Mis feedbacks en curso", the now-closed 1st one under "Mis
    // feedbacks cerrados" (feedbackManager.getMyFeedbackRequestsByStatus's
    // own real-Postgres-backed contract).
    const enCursoIdx = html.indexOf("Mis feedbacks en curso");
    const cerradosIdx = html.indexOf("Mis feedbacks cerrados");
    const openAdHocIdx = html.indexOf("New path verif -- ad hoc #2 (cerrado)");
    const closedAdHocIdx = html.indexOf("New path verif -- ad hoc (cerrado)");
    expect(enCursoIdx).toBeGreaterThanOrEqual(0);
    expect(cerradosIdx).toBeGreaterThan(enCursoIdx);
    expect(openAdHocIdx).toBeGreaterThan(enCursoIdx);
    expect(openAdHocIdx).toBeLessThan(cerradosIdx);
    expect(closedAdHocIdx).toBeGreaterThan(cerradosIdx);
    expect(html).not.toContain(" — cerrada");
  });

  test("unorganized open cycle (org C, sole employee)", async () => {
    actingAs(orgCEmployeeToken);

    const html = await renderPage(() => DashboardPage());

    expect(html).toContain("Ciclos 360 abiertos");
    expect(html).toContain(`Ciclo Sin Organizar ${runId}`);
    // Sanity: nothing else is seeded for this member -- both pending
    // sections stay empty, so this is genuinely isolating the
    // cyclesToOrganize branch.
    expect(html).toContain("Todavía no has pedido feedback.");
    expect(html).toContain("No tienes feedback pendiente de dar.");
  });

  test("empty state -- no pending items anywhere (org B, supervisor)", async () => {
    actingAs(supervisorBToken);

    const html = await renderPage(() => DashboardPage());

    expect(html).toContain("Todavía no has pedido feedback.");
    // Dashboard-empty (EXPERIENCE.md State Patterns): cyclesToOrganize,
    // pendingGroups and pendingInvitations are all empty here, so the
    // unified centered empty state replaces both moment sections.
    expect(html).toContain("Todavía no hay ciclos abiertos");
    expect(html).not.toContain("No tienes feedback pendiente de dar.");
    expect(html).not.toContain("Ciclos 360 abiertos");
  });
});

// ---------------------------------------------------------------------------
// mi-mapa/page.tsx
// ---------------------------------------------------------------------------

describe("dashboard/mi-mapa/page.tsx (real Supabase)", () => {
  test("caller closed a 360 (org A, closedInvitee)", async () => {
    actingAs(closedInvitee.token);

    const html = await renderPage(() => MiMapaDeCompetenciasPage());

    expect(html).not.toContain("todavía no tienes ninguno");
  });

  test("caller never closed a 360 (org A, neverClosedEmployee)", async () => {
    actingAs(neverClosedEmployee.token);

    const html = await renderPage(() => MiMapaDeCompetenciasPage());

    expect(html).toContain("todavía no tienes ninguno");
  });
});

// ---------------------------------------------------------------------------
// informe-empresa/page.tsx
// ---------------------------------------------------------------------------

describe("dashboard/informe-empresa/page.tsx (real Supabase)", () => {
  test("Supervisor, revealed data (org A)", async () => {
    actingAs(supervisorToken);

    const html = await renderPage(() => InformeEmpresaPage());

    expect(html).not.toContain("Todavía no hay suficiente feedback revelado");
  });

  test("Supervisor, no revealed data (org B)", async () => {
    actingAs(supervisorBToken);

    const html = await renderPage(() => InformeEmpresaPage());

    expect(html).toContain("Todavía no hay suficiente feedback revelado");
  });
});
