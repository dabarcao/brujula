// Story 3.28 (_bmad-output/implementation-artifacts/
// spec-3-28-read-only-reports-pages-thin-delegates.md): originally proved
// old-path-vs-new-path output equivalence for the read-only reports
// domain's rollback flag across all 3 pages (dashboard/page.tsx, mi-mapa/
// page.tsx, informe-empresa/page.tsx). That flag has since been deleted
// (spec-5-1b-delete-old-path-admin-reports.md) and the manager-backed path
// is now these pages' only path -- this file continues
// to serve as their own regression coverage: manager delegation, result
// mapping, sort order, date-filter boundaries, and per-read error-fallback
// behavior, each asserted directly against a single render rather than an
// old-vs-new comparison.
//
// Calls all 3 page components under test (dashboard/page.tsx, mi-mapa/
// page.tsx, informe-empresa/page.tsx) directly as plain async functions,
// extended with `react-dom/server`'s `renderToStaticMarkup` so rendered
// output can be asserted directly, not just "which dependency fired".
//
// What's real: the 3 page components themselves, run unmodified except by
// this story's own edits. What's mocked, and why: `@/server/managers/
// {feedback,cycles,reportGroups,members,admin,auth}Manager` are replaced
// with vi.fn() spies (this file proves the page calls the right manager
// functions and maps their result correctly -- not manager/RPC business
// logic, already covered by each manager's own characterization suite).
//
// Members/self/reports domain migration (_bmad-output/implementation-
// artifacts/): all 3 pages used to also make a handful of direct
// `@/lib/supabase/server` calls (the caller's own "members" row lookup, and
// competency_frameworks/activeMemberCount in mi-mapa/informe-empresa) --
// this file used to fake that client in-memory. Those pages are now fully
// migrated to go through authManager.getCurrentUser/getCurrentUserWithMetadata
// and membersManager.getCurrentMember/listCompetencyFrameworks/
// countActiveOrganizationMembers/createIndividualAccount, so none of the 3
// page components under test import `@/lib/supabase/server` any more -- the
// fake client is gone, replaced by mocking those manager functions directly,
// same as every other manager dependency here. adminManager.
// checkIsPlatformAdmin and membersManager.acceptInvite/claimPendingInvitations/
// createIndividualAccount are mocked even though this file's own scenarios
// never exercise their branches meaningfully -- dashboard/page.tsx calls
// checkIsPlatformAdmin/claimPendingInvitations unconditionally on every
// render once a member resolves, so the mocks must exist for the page's
// imports to resolve; their default no-op vi.fn() return (undefined, falsy)
// is enough to keep those branches inert. `next/navigation`'s redirect() is
// mocked the same "throw a marker" way every prior suite in this repo uses.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

// ---------------------------------------------------------------------------
// Manager mocks -- see file header. Only the exports the 3 pages under
// test actually import.
// ---------------------------------------------------------------------------

const managerMocks = vi.hoisted(() => ({
  feedbackManager: {
    // Dashboard audit fix (Finding 4) + Story 7.2: dashboard/page.tsx now
    // calls this one composed function instead of getMyAdHocRequests()
    // directly -- the ad_hoc/cycle merge/sort AND the en-curso/cerrado
    // split both moved into feedbackManager.getMyFeedbackRequestsByStatus()
    // (a thin sibling of getMyPendingRequestsSummary(), real-Postgres
    // characterization coverage: tests/characterization/
    // feedback-manager.test.ts), so this file only needs to prove the page
    // calls it and renders its already-split result, same "thin delegate"
    // scope as every other mock here.
    getMyFeedbackRequestsByStatus: vi.fn(),
    getMyCompetencyMap: vi.fn(),
    getMyPendingInvitations: vi.fn(),
  },
  cyclesManager: {
    // Dashboard audit fix (Finding 2): same story as
    // getMyPendingRequestsSummary above -- the open-cycles-minus-already-
    // organized cross-reference moved into
    // cyclesManager.getCyclesNeedingOrganization() (real-Postgres
    // characterization coverage: tests/characterization/
    // cycles-manager.test.ts).
    getCyclesNeedingOrganization: vi.fn(),
  },
  reportGroupsManager: {
    getMyReportGroups: vi.fn(),
  },
  membersManager: {
    getOrganizationCompetencySummary: vi.fn(),
    getCurrentMember: vi.fn(),
    listCompetencyFrameworks: vi.fn(),
    countActiveOrganizationMembers: vi.fn(),
    // dashboard/page.tsx's own admin/members bootstrap, called
    // unconditionally on every render -- mocked only so those calls resolve
    // without a real Supabase instance; this file's own scenarios never
    // exercise their branches meaningfully (see file header).
    acceptInvite: vi.fn(),
    claimPendingInvitations: vi.fn(),
    createIndividualAccount: vi.fn(),
  },
  adminManager: {
    checkIsPlatformAdmin: vi.fn(),
  },
  authManager: {
    getCurrentUser: vi.fn(),
    getCurrentUserWithMetadata: vi.fn(),
  },
}));

vi.mock("@/server/managers/feedbackManager", () => managerMocks.feedbackManager);
vi.mock("@/server/managers/cyclesManager", () => managerMocks.cyclesManager);
vi.mock("@/server/managers/reportGroupsManager", () => managerMocks.reportGroupsManager);
vi.mock("@/server/managers/membersManager", () => managerMocks.membersManager);
vi.mock("@/server/managers/adminManager", () => managerMocks.adminManager);
vi.mock("@/server/managers/authManager", () => managerMocks.authManager);

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const err = new Error(`test redirect marker: ${url}`) as Error & { redirectUrl: string };
    err.redirectUrl = url;
    throw err;
  },
}));

// Imported after the mocks above are declared (Vitest hoists `vi.mock` to
// the top of the module regardless of source order).
import DashboardPage from "@/app/dashboard/page";
import MiMapaDeCompetenciasPage from "@/app/dashboard/mi-mapa/page";
import InformeEmpresaPage from "@/app/dashboard/informe-empresa/page";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

async function renderPage(page: () => Promise<React.ReactElement>): Promise<string> {
  const el = await page();
  return renderToStaticMarkup(el);
}

function todayIso(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

const CALLER_ID = "11111111-1111-4111-8111-111111111111";

const SAMPLE_FRAMEWORKS = [
  {
    code: "COMP_A",
    name: "Competencia A",
    principleId: "p1",
    roleId: "r1",
    principle: { code: "P1", name: "Principio 1", position: 1 },
    role: { code: "R1", name: "Rol 1", position: 1 },
  },
];

beforeEach(() => {
  // resetAllMocks (not clearAllMocks): every scenario below sets its own
  // required mockResolvedValue/mockRejectedValue explicitly via the
  // setXCaller() helpers and/or the test body itself, so a implementation
  // left over from a previous test must never leak into the next one.
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// dashboard/page.tsx
// ---------------------------------------------------------------------------

function setDashboardCaller(orgKind: "company" | "individual" = "company") {
  managerMocks.authManager.getCurrentUserWithMetadata.mockResolvedValue({
    id: "user-dashboard",
    email: "caller@thin-delegate.test",
    pendingInviteToken: null,
    pendingIndividualSignup: false,
    fullName: null,
  });
  managerMocks.membersManager.getCurrentMember.mockResolvedValue({
    id: CALLER_ID,
    isSupervisor: false,
    organizationId: "org-1",
    status: "active",
    organization: { name: "Empresa de Prueba", kind: orgKind },
  });
  managerMocks.feedbackManager.getMyPendingInvitations.mockResolvedValue([]);
}

// Dashboard audit fix: the ad_hoc/cycle-request merge+sort (myRequests) and
// the open-cycles-minus-already-organized cross-reference (cyclesToOrganize)
// used to be built at the page itself, so this file used to feed raw
// getMyAdHocRequests/getMyCycleRequests/getMyOpenCycles rows and assert on
// the page's own merge/dedup/sort/date-filter logic (dedup-survives-partial-
// failure, true interleaved sort order, date-filter boundaries). That logic
// now genuinely lives in feedbackManager.getMyPendingRequestsSummary() and
// cyclesManager.getCyclesNeedingOrganization() (moved verbatim -- see each
// function's own doc comment), with its own real-Postgres characterization
// coverage in tests/characterization/feedback-manager.test.ts and
// tests/characterization/cycles-manager.test.ts respectively. This file's
// own stated scope (see file header) is proving the page calls the right
// manager functions and renders their result -- not manager business logic
// -- so the scenarios below now treat both functions as the page's atomic
// dependencies: already-composed/sorted results in, correctly rendered (or
// correctly falls back to empty on a throw) out.
describe("dashboard/page.tsx", () => {
  test("caller has pending items in every section: myRequests, cyclesToOrganize, pendingGroups", async () => {
    setDashboardCaller("company");

    // --- myRequests: already-merged/sorted/split, the page's own row shape
    // (feedbackManager.getMyFeedbackRequestsByStatus's own contract) ---
    managerMocks.feedbackManager.getMyFeedbackRequestsByStatus.mockResolvedValue({
      open: [
        {
          id: "cr-1",
          created_at: "2026-01-02T10:00:00Z",
          request_type: "cycle",
          status: "open",
          name: null,
          feedback_cycles: { name: "Ciclo 360 Organizado" },
          closesAt: null,
        },
        {
          id: "ah-1",
          created_at: "2026-01-01T10:00:00Z",
          request_type: "ad_hoc",
          status: "open",
          name: "Feedback ágil",
          feedback_cycles: null,
          closesAt: null,
        },
      ],
      closed: [],
    });

    // --- cyclesToOrganize: already-filtered (cyclesManager.
    // getCyclesNeedingOrganization's own contract -- no already-organized
    // cycle mixed in) ---
    managerMocks.cyclesManager.getCyclesNeedingOrganization.mockResolvedValue([
      { id: "cyc-open", name: "Ciclo 360 Nuevo", opensAt: todayIso(-1), closesAt: todayIso(30) },
    ]);

    // --- pending report group ---
    managerMocks.reportGroupsManager.getMyReportGroups.mockResolvedValue([
      {
        id: "rg-1",
        name: "Grupo Prueba",
        status: "open",
        createdByMemberId: "other-member",
        isCreator: false,
        myStatus: "pending",
        acceptedCount: 1,
        totalCount: 3,
      },
    ]);

    const html = await renderPage(() => DashboardPage());

    expect(managerMocks.feedbackManager.getMyFeedbackRequestsByStatus).toHaveBeenCalledTimes(1);
    expect(managerMocks.cyclesManager.getCyclesNeedingOrganization).toHaveBeenCalledTimes(1);
    expect(managerMocks.reportGroupsManager.getMyReportGroups).toHaveBeenCalledTimes(1);

    expect(html).toContain("Ciclo 360 Nuevo");
    expect(html).toContain("Grupo Prueba");
    expect(html).toContain("Feedback ágil");
    // "Mis feedbacks en curso" renders myRequests in the order the manager
    // already returned it (page-level rendering does no further sorting).
    expect(html.indexOf("Ciclo 360 Organizado")).toBeLessThan(html.indexOf("Feedback ágil"));
  });

  test("no pending feedback/cycles/groups (empty everywhere)", async () => {
    setDashboardCaller("company");
    managerMocks.feedbackManager.getMyFeedbackRequestsByStatus.mockResolvedValue({ open: [], closed: [] });
    managerMocks.cyclesManager.getCyclesNeedingOrganization.mockResolvedValue([]);
    managerMocks.reportGroupsManager.getMyReportGroups.mockResolvedValue([]);

    const html = await renderPage(() => DashboardPage());

    expect(html).toContain("Todavía no has pedido feedback.");
    // Dashboard-empty (EXPERIENCE.md State Patterns): with cyclesToOrganize,
    // pendingGroups and pendingInvitations all empty at once, the unified
    // centered empty state replaces both "Ciclos 360 abiertos" and "Tareas
    // pendientes" -- their per-section empty copy doesn't render.
    expect(html).toContain("Todavía no hay ciclos abiertos");
    expect(html).not.toContain("No tienes feedback pendiente de dar.");
  });

  test("individual account -> report groups never read", async () => {
    setDashboardCaller("individual");
    managerMocks.feedbackManager.getMyFeedbackRequestsByStatus.mockResolvedValue({ open: [], closed: [] });
    managerMocks.cyclesManager.getCyclesNeedingOrganization.mockResolvedValue([]);

    const html = await renderPage(() => DashboardPage());

    // Individual accounts don't get the "Informes de grupo" nav link or
    // section.
    expect(html).not.toContain("Informes de grupo");
    expect(html).toContain("Pedir feedback 360");

    expect(managerMocks.reportGroupsManager.getMyReportGroups).not.toHaveBeenCalled();
  });

  test("myRequests read throws -> falls back to the empty state, no crash", async () => {
    setDashboardCaller("company");
    managerMocks.feedbackManager.getMyFeedbackRequestsByStatus.mockRejectedValue(new Error("boom"));
    managerMocks.cyclesManager.getCyclesNeedingOrganization.mockResolvedValue([]);
    managerMocks.reportGroupsManager.getMyReportGroups.mockResolvedValue([]);

    const html = await renderPage(() => DashboardPage());

    expect(html).toContain("Todavía no has pedido feedback.");
  });

  test("cyclesToOrganize read throws -> falls back to empty (no 'Ciclos 360 abiertos' section), no crash", async () => {
    setDashboardCaller("company");
    managerMocks.feedbackManager.getMyFeedbackRequestsByStatus.mockResolvedValue({ open: [], closed: [] });
    managerMocks.cyclesManager.getCyclesNeedingOrganization.mockRejectedValue(new Error("boom"));
    managerMocks.reportGroupsManager.getMyReportGroups.mockResolvedValue([]);

    const html = await renderPage(() => DashboardPage());

    expect(html).not.toContain("Ciclos 360 abiertos");
  });

  test("pendingGroups read throws -> falls back to empty, no crash", async () => {
    setDashboardCaller("company");
    managerMocks.feedbackManager.getMyFeedbackRequestsByStatus.mockResolvedValue({ open: [], closed: [] });
    managerMocks.cyclesManager.getCyclesNeedingOrganization.mockResolvedValue([]);
    managerMocks.reportGroupsManager.getMyReportGroups.mockRejectedValue(new Error("boom"));

    const html = await renderPage(() => DashboardPage());

    // Every section is empty here too (myRequests/cyclesToOrganize empty,
    // pendingGroups fell back to [] on its own throw) -- the unified
    // dashboard-empty state renders instead of the per-section copy.
    expect(html).toContain("Todavía no hay ciclos abiertos");
  });
});

// ---------------------------------------------------------------------------
// mi-mapa/page.tsx
// ---------------------------------------------------------------------------

function setMiMapaCaller() {
  managerMocks.authManager.getCurrentUser.mockResolvedValue({
    id: "user-mimapa",
    email: "caller@thin-delegate.test",
  });
  managerMocks.membersManager.getCurrentMember.mockResolvedValue({
    id: CALLER_ID,
    isSupervisor: false,
    organizationId: "org-1",
    status: "active",
    organization: { name: "Empresa de Prueba", kind: "company" },
  });
  managerMocks.membersManager.listCompetencyFrameworks.mockResolvedValue(SAMPLE_FRAMEWORKS);
}

describe("dashboard/mi-mapa/page.tsx", () => {
  test("caller has a closed 360 (mapRows non-empty)", async () => {
    setMiMapaCaller();
    const mapRow = { competencyCode: "COMP_A", baseValue: 3.5, mentionDelta: 2, lastCycleClosedAt: "2026-01-15" };
    managerMocks.feedbackManager.getMyCompetencyMap.mockResolvedValue([mapRow]);

    const html = await renderPage(() => MiMapaDeCompetenciasPage());

    expect(managerMocks.feedbackManager.getMyCompetencyMap).toHaveBeenCalledTimes(1);
    expect(html).toContain("Competencia A");
  });

  test("caller has never closed a 360 (mapRows empty)", async () => {
    setMiMapaCaller();
    managerMocks.feedbackManager.getMyCompetencyMap.mockResolvedValue([]);

    const html = await renderPage(() => MiMapaDeCompetenciasPage());

    expect(html).toContain("todavía no tienes ninguno");
  });

  test("mapData read throws -> falls back to the empty ('no closed cycle') state, no crash", async () => {
    setMiMapaCaller();
    managerMocks.feedbackManager.getMyCompetencyMap.mockRejectedValue(new Error("boom"));

    const html = await renderPage(() => MiMapaDeCompetenciasPage());

    expect(html).toContain("todavía no tienes ninguno");
  });

  // Review Triage Log (Fix 5c): dedicated coverage for the "mi-mapa,
  // first-time" headline (EXPERIENCE.md State Patterns) and the radar's
  // absence, not just a fragment of the state's second paragraph.
  test("caller has never closed a 360 -> renders the mi-mapa-first-time headline instead of the radar", async () => {
    setMiMapaCaller();
    managerMocks.feedbackManager.getMyCompetencyMap.mockResolvedValue([]);

    const html = await renderPage(() => MiMapaDeCompetenciasPage());

    expect(html).toContain("Tu mapa aparecerá aquí después de tu primer ciclo 360 cerrado");
    // The radar is an inline <svg> -- absent entirely in this branch.
    expect(html).not.toContain("<svg");
  });

  // Review Triage Log (patch d): `frameworks` and `mapData` are read
  // separately -- an empty frameworks result exercises how those two reads
  // interact.
  test("frameworks empty (no competency framework rows)", async () => {
    setMiMapaCaller();
    managerMocks.membersManager.listCompetencyFrameworks.mockResolvedValue([]);
    const mapRow = { competencyCode: "COMP_A", baseValue: 3.5, mentionDelta: 2, lastCycleClosedAt: "2026-01-15" };
    managerMocks.feedbackManager.getMyCompetencyMap.mockResolvedValue([mapRow]);

    const html = await renderPage(() => MiMapaDeCompetenciasPage());

    // hasClosedCycle is driven by mapRows, not frameworks -- still true.
    expect(html).not.toContain("todavía no tienes ninguno");
    // But with no frameworks, buildCompetencyAxes has nothing to build --
    // no competency name can render.
    expect(html).not.toContain("Competencia A");
  });
});

// ---------------------------------------------------------------------------
// informe-empresa/page.tsx
// ---------------------------------------------------------------------------

function setInformeEmpresaCaller() {
  managerMocks.authManager.getCurrentUser.mockResolvedValue({
    id: "user-supervisor",
    email: "supervisor@thin-delegate.test",
  });
  managerMocks.membersManager.getCurrentMember.mockResolvedValue({
    id: CALLER_ID,
    isSupervisor: true,
    organizationId: "org-1",
    status: "active",
    organization: { name: "Empresa de Prueba", kind: "company" },
  });
  managerMocks.membersManager.listCompetencyFrameworks.mockResolvedValue(SAMPLE_FRAMEWORKS);
}

describe("dashboard/informe-empresa/page.tsx", () => {
  test("Supervisor with revealed data", async () => {
    setInformeEmpresaCaller();
    managerMocks.membersManager.getOrganizationCompetencySummary.mockResolvedValue([
      {
        competencyCode: "COMP_A",
        competencyName: "Competencia A",
        principleCode: "P1",
        principleName: "Principio 1",
        roleCode: "R1",
        roleName: "Rol 1",
        avgValue: 4.2,
        responseCount: 5,
      },
    ]);

    const html = await renderPage(() => InformeEmpresaPage());

    expect(managerMocks.membersManager.getOrganizationCompetencySummary).toHaveBeenCalledTimes(1);
    expect(html).toContain("Competencia A");
  });

  test("Supervisor, no revealed data", async () => {
    setInformeEmpresaCaller();
    managerMocks.membersManager.getOrganizationCompetencySummary.mockResolvedValue([]);

    const html = await renderPage(() => InformeEmpresaPage());

    expect(html).toContain("Todavía no hay suficiente feedback revelado");
  });

  test("summaryData read throws -> falls back to the empty ('no revealed data') state, no crash", async () => {
    setInformeEmpresaCaller();
    managerMocks.membersManager.getOrganizationCompetencySummary.mockRejectedValue(new Error("boom"));

    const html = await renderPage(() => InformeEmpresaPage());

    expect(html).toContain("Todavía no hay suficiente feedback revelado");
  });

  // Review Triage Log (Fix 5a): the non-supervisor permission-denied branch
  // (spec-4-5's own AC: shows PermissionDenied in place, not a redirect).
  // next/navigation's redirect() is mocked as a throw-a-marker (file
  // header) -- if this branch ever regressed back to a redirect, this test
  // would fail loudly on that thrown marker instead of silently passing.
  test("non-supervisor member reaching the route directly -> renders PermissionDenied's message in place, no redirect", async () => {
    managerMocks.authManager.getCurrentUser.mockResolvedValue({
      id: "user-non-supervisor",
      email: "member@thin-delegate.test",
    });
    managerMocks.membersManager.getCurrentMember.mockResolvedValue({
      id: CALLER_ID,
      isSupervisor: false,
      organizationId: "org-1",
      status: "active",
      organization: { name: "Empresa de Prueba", kind: "company" },
    });

    const html = await renderPage(() => InformeEmpresaPage());

    expect(html).toContain("Esta vista es solo para supervisores de tu organización.");
  });

  // Review Triage Log (Fix 5b): AggregateBadge's "Vista agregada — N
  // personas" text, independent of summaryData/the radar. Covers both the
  // plural and singular ("1 persona") copy branches, using
  // membersManager.countActiveOrganizationMembers's own mocked return value.
  test("Supervisor with revealed data and a real activeMemberCount -> AggregateBadge renders 'Vista agregada — N personas'", async () => {
    setInformeEmpresaCaller();
    managerMocks.membersManager.countActiveOrganizationMembers.mockResolvedValue(5);
    managerMocks.membersManager.getOrganizationCompetencySummary.mockResolvedValue([
      {
        competencyCode: "COMP_A",
        competencyName: "Competencia A",
        principleCode: "P1",
        principleName: "Principio 1",
        roleCode: "R1",
        roleName: "Rol 1",
        avgValue: 4.2,
        responseCount: 5,
      },
    ]);

    const html = await renderPage(() => InformeEmpresaPage());

    expect(html).toContain("Vista agregada — 5");
    expect(html).toContain("personas");
  });

  test("Supervisor with revealed data and activeMemberCount === 1 -> AggregateBadge renders the singular '1 persona'", async () => {
    setInformeEmpresaCaller();
    managerMocks.membersManager.countActiveOrganizationMembers.mockResolvedValue(1);
    managerMocks.membersManager.getOrganizationCompetencySummary.mockResolvedValue([
      {
        competencyCode: "COMP_A",
        competencyName: "Competencia A",
        principleCode: "P1",
        principleName: "Principio 1",
        roleCode: "R1",
        roleName: "Rol 1",
        avgValue: 4.2,
        responseCount: 5,
      },
    ]);

    const html = await renderPage(() => InformeEmpresaPage());

    expect(html).toContain("Vista agregada — 1");
    expect(html).toContain("1 persona<");
  });

  // Review Triage Log (patch d): same rationale as mi-mapa's own equivalent
  // test above -- `frameworks` and `summaryData` are read separately; an
  // empty frameworks result exercises how the two interact.
  test("frameworks empty (no competency framework rows)", async () => {
    setInformeEmpresaCaller();
    managerMocks.membersManager.listCompetencyFrameworks.mockResolvedValue([]);
    managerMocks.membersManager.getOrganizationCompetencySummary.mockResolvedValue([
      {
        competencyCode: "COMP_A",
        competencyName: "Competencia A",
        principleCode: "P1",
        principleName: "Principio 1",
        roleCode: "R1",
        roleName: "Rol 1",
        avgValue: 4.2,
        responseCount: 5,
      },
    ]);

    const html = await renderPage(() => InformeEmpresaPage());

    // hasAnyData is driven by axes (built from frameworks) -- with no
    // frameworks there are no axes, so it's false even though summaryData
    // itself has a row.
    expect(html).toContain("Todavía no hay suficiente feedback revelado");
    expect(html).not.toContain("Competencia A");
  });
});
