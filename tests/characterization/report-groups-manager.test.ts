// Story 1.2 (_bmad-output/implementation-artifacts/
// spec-1-2-db-access-manager-scaffolding-report-groups.md): re-verifies
// Story 1.1's characterization baseline
// (tests/characterization/report-groups.test.ts) against the NEW
// `reportGroupsManager` functions, called directly -- not through the
// still-unmodified Server Actions (that wiring is Stories 1.5/1.6). Same
// fixtures, same expected error strings, same mocking shape as the
// original (only `@/lib/supabase/server`'s `createClient` needs mocking
// here: reportGroupsManager never imports `next/navigation` or
// `next/cache`, unlike the Server Actions it will eventually back).
//
// What's real: every Postgres RPC the manager functions call, run against
// the same local `supabase start` instance, plus aiInterpretationManager's
// real Anthropic call (best-effort, same as baseline).
//
// 2026-09-17: rewritten for 0099_report_groups_membership_management_and_
// email.sql's 3 real behavior changes (user-requested after reviewing the
// feature against their own spec, not a refactor):
//   1. create_report_group now also requires the CALLER (not just each
//      invitee) to have their own closed 360 -- the Supervisor this
//      company's seed gives NEVER has one (never a cycle participant,
//      0032_supervisor_cannot_be_evaluator.sql's own spirit extended to
//      groups: "el supervisor no puede... como participante en un grupo",
//      the user's own words), so every group in this file is now created
//      by an ELIGIBLE EMPLOYEE, never supervisorToken -- that's the
//      biggest structural change from Story 1.1/1.2's original fixture.
//   2. close_report_group now requires every CURRENT member accepted (not
//      a minimum count while others sit pending/rejected) -- so
//      "createGroup / closeGroup" no longer closes above a 6th, declined
//      invitee; it must be removed first via the new removeMember.
//   3. add_report_group_members (removeMember's sibling) can re-invite a
//      rejected member -- covered in its own small describe block below.
// `hasMinAcceptedToClose` is gone from ReportGroupDetail -- replaced by
// `allAccepted` (everyone currently in the group has accepted) and
// `meetsMinimumSize` (the old anonymity floor, now independent of
// acceptance state), combined into `readyToClose`.
//
// Not run against a real database in this session -- no local `supabase
// start` instance is set up yet (see REVIEW-NOTES.md next to this repo's
// mvc-layering skill). Rewritten by careful reading of the new RPCs, not
// by executing this file. Run it for real the moment that environment
// exists, before trusting this file over manual verification.

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
// scripts/seed-report-group.mjs: Story 1.1's reusable per-domain seed-group
// helper, reused here (as intended) for the below-threshold fixture.
import { seedReportGroup } from "../../scripts/seed-report-group.mjs";

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
// Hard boundary carried over from Story 1.1: never run this suite against a
// remote Supabase project, dev or production -- only the local CLI instance.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(SUPABASE_URL)) {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL (${SUPABASE_URL}) no es la instancia local de \`supabase start\`. ` +
      "Estos tests nunca deben correr contra un proyecto remoto."
  );
}

// ---------------------------------------------------------------------------
// Mocks -- see file header for what and why. Unlike Story 1.1's suite, no
// next/navigation or next/cache mock is needed: the manager layer never
// calls redirect()/revalidatePath() (that stays one layer up, in the
// Server Action -- Story 1.6).
// ---------------------------------------------------------------------------

const acting = vi.hoisted(() => ({ token: null as string | null }));

function actingAs(token: string) {
  acting.token = token;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async (): Promise<SupabaseClient> => {
    if (!acting.token) {
      throw new Error("test bug: actingAs(token) must be called before invoking a manager function");
    }
    return createSupabaseJsClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${acting.token}` } },
    });
  },
}));

// Imported after the mock above is declared (Vitest hoists `vi.mock` to the
// top of the module regardless of source order) so the manager's own import
// of `@/lib/supabase/server` (via `@/server/db/reportGroups` and
// `@/server/db/aiInterpretations`) picks up the mocked client factory.
import * as reportGroupsManager from "@/server/managers/reportGroupsManager";

// ---------------------------------------------------------------------------
// Small REST/RPC helpers -- same anon-key-only pattern as scripts/seed-*.mjs
// and Story 1.1's suite; used only for setup/assertions here, never as the
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

// ---------------------------------------------------------------------------
// Fixture: one fresh demo company per test run, mirroring Story 1.1's
// suite exactly (same seed script, same shape) so results are directly
// comparable.
// ---------------------------------------------------------------------------

type SeededEmployee = { email: string; bucketLabel: string };

let supervisorEmail: string;
let supervisorToken: string;
// The eligible (closed-360) pool, split: [0] is always the CREATOR for
// every group in this file (never supervisorToken -- see file header,
// change 1), the rest are the invitee pool, reused freely across
// different groups (report_group_members's uniqueness is per-group, not
// global, so the same person can be invited to two different groups).
let eligibleEmployees: SeededEmployee[];
let eligibleTokens: string[];
let eligibleIds: string[];
let ineligibleId: string;

function creatorEmail() {
  return eligibleEmployees[0].email;
}
function creatorToken() {
  return eligibleTokens[0];
}
/** Invitee pool for a group: `count` people from the pool, starting at `offset` (default 1, skipping the creator at [0]). */
function inviteePool(count: number, offset = 1) {
  return {
    emails: eligibleEmployees.slice(offset, offset + count).map((e) => e.email),
    tokens: eligibleTokens.slice(offset, offset + count),
    ids: eligibleIds.slice(offset, offset + count),
  };
}

beforeAll(async () => {
  const companyName = `Char Test RG Manager ${Date.now()}`;
  let seedOutput: string;
  try {
    // 24, not 18: needs >= 1 (creator) + 6 (groupA's invitees) = 7 people
    // in the "cerrado" bucket; seed-demo-company.mjs's bucket split is
    // `i % 3 === 0` (its own comment), so 24 employees -> 8 eligible, one
    // spare.
    seedOutput = execFileSync("node", [path.join("scripts", "seed-demo-company.mjs"), companyName, "24"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      // Pin the subprocess to the exact URL/key this file already verified
      // is local-only -- see the guard above and Story 1.1's own note on
      // why seed-demo-company.mjs's own loadEnvLocal() must not be allowed
      // to diverge from .env.test.local.
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
  if (eligibleEmployees.length < 7 || ineligiblePool.length === 0) {
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
});

afterAll(() => {
  acting.token = null;
});

// ---------------------------------------------------------------------------
// reportGroupsManager.createGroup
// ---------------------------------------------------------------------------

describe("reportGroupsManager.createGroup", () => {
  let groupA: string;
  let groupAInvitees: ReturnType<typeof inviteePool>;

  test("creator with no closed 360 of their own (the Supervisor) -> throws create_report_group's new eligibility message", async () => {
    actingAs(supervisorToken);
    const invitees = inviteePool(1);
    await expect(
      reportGroupsManager.createGroup(`Grupo creado por supervisor ${Date.now()}`, invitees.ids)
    ).rejects.toThrow("Necesitas tener tu propio 360 finalizado antes de poder crear un grupo.");
  });

  test("eligible creator, eligible invitees -> returns { groupId }", async () => {
    actingAs(creatorToken());
    groupAInvitees = inviteePool(6);
    const { groupId } = await reportGroupsManager.createGroup(
      `Grupo elegible manager ${Date.now()}`,
      groupAInvitees.ids
    );

    expect(groupId).toMatch(GROUP_ID_RE);
    groupA = groupId;
  });

  test("ineligible member (no closed 360) -> throws create_report_group's exact message", async () => {
    actingAs(creatorToken());
    await expect(
      reportGroupsManager.createGroup(`Grupo inelegible manager ${Date.now()}`, [ineligibleId])
    ).rejects.toThrow(
      "Todos los invitados deben ser compañeros activos de tu empresa con al menos un 360 ya finalizado."
    );
  });

  // --------------------------------------------------------------------
  // respondToGroup / closeGroup on groupA: 5 of 6 accept, 1 declines --
  // 2026-09-17's real behavior change is that this is no longer enough to
  // close (the old "5 is above the minimum" reading), the declined
  // member has to be removed first. Covers removeMember too, since that's
  // the only way this group can ever reach a closable state now.
  // --------------------------------------------------------------------

  describe("respondToGroup / removeMember / closeGroup on that same group", () => {
    test("accept x5 -> membership accepted, does not throw", async () => {
      expect(groupA, "setup test must have created the group first").toBeDefined();
      for (let i = 0; i < 5; i++) {
        actingAs(groupAInvitees.tokens[i]);
        await expect(reportGroupsManager.respondToGroup(groupA, true)).resolves.toBeUndefined();
      }
    });

    test("decline (6th invitee) -> membership rejected, does not throw", async () => {
      expect(groupA, "setup test must have created the group first").toBeDefined();
      actingAs(groupAInvitees.tokens[5]);
      await expect(reportGroupsManager.respondToGroup(groupA, false)).resolves.toBeUndefined();
    });

    test("membership state after responses: creator + 5 accepted, 1 rejected -- not ready to close yet", async () => {
      expect(groupA, "setup test must have created the group first").toBeDefined();
      actingAs(creatorToken());
      const detail = await reportGroupsManager.getGroup(groupA);
      const statuses = detail.members.map((m) => m.status).sort();
      // 7 rows, not 6: create_report_group (0099_report_groups_membership_
      // management_and_email.sql) now inserts the CREATOR as an accepted
      // member of their own group too, alongside the 6 invitees -- the
      // "at least 5" floor is meant to count real people in the group,
      // creator included, not "creator + 5 invitees" (6 total).
      expect(statuses).toEqual([
        "accepted",
        "accepted",
        "accepted",
        "accepted",
        "accepted",
        "accepted",
        "rejected",
      ]);

      // Computed fields (src/server/db/reportGroups.ts), creator's
      // perspective: the creator's own membership row is accepted from
      // creation, so myStatus is 'accepted' and canClose is already true
      // even before responding to anything themselves -- unlike the old
      // behavior (no row at all, canClose always false for the creator).
      expect(detail.acceptedCount).toBe(6); // creator + 5 of the 6 invitees
      expect(detail.meetsMinimumSize).toBe(true);
      // The real 2026-09-17 change: 5+ accepted used to be enough
      // regardless of the 6th's rejection. Now a lingering rejected member
      // blocks closing entirely, no matter how many others accepted.
      expect(detail.allAccepted).toBe(false);
      expect(detail.readyToClose).toBe(false);
      expect(detail.canClose).toBe(true);
      expect(detail.canSeeReport).toBe(true);
    });

    test("attempting to close with the rejected member still present -> throws close_report_group's new 'todavía hay invitados' message", async () => {
      expect(groupA, "setup test must have created the group first").toBeDefined();
      actingAs(groupAInvitees.tokens[0]); // an accepted member, not the creator
      await expect(reportGroupsManager.closeGroup(groupA)).rejects.toThrow(
        "Todavía hay invitados que no han aceptado. Espera a que respondan, o quítalos del grupo si hace falta."
      );
    });

    test("creator removes the rejected (6th) member -> group now ready to close", async () => {
      expect(groupA, "setup test must have created the group first").toBeDefined();
      actingAs(creatorToken());
      await expect(
        reportGroupsManager.removeMember(groupA, groupAInvitees.ids[5])
      ).resolves.toBeUndefined();

      const detail = await reportGroupsManager.getGroup(groupA);
      // creator + the 5 who accepted -- the rejected 6th is gone now.
      expect(detail.members).toHaveLength(6);
      expect(detail.acceptedCount).toBe(6);
      expect(detail.allAccepted).toBe(true);
      expect(detail.meetsMinimumSize).toBe(true);
      expect(detail.readyToClose).toBe(true);
    });

    test("close now that everyone remaining has accepted -> group closes; AI interpretation is text or null, never throws", async () => {
      expect(groupA, "setup test must have created the group first").toBeDefined();
      actingAs(groupAInvitees.tokens[0]); // one of the accepted members, not the creator
      const { aiInterpretation } = await reportGroupsManager.closeGroup(groupA);

      // Baseline per Story 1.1: both outcomes are valid depending on
      // whether ANTHROPIC_API_KEY happens to be set for this process --
      // never a single hardcoded expectation.
      expect(aiInterpretation === null || typeof aiInterpretation === "string").toBe(true);
      if (typeof aiInterpretation === "string") {
        expect(aiInterpretation.length).toBeGreaterThan(0);
      }

      const detail = await reportGroupsManager.getGroup(groupA);
      expect(detail.status).toBe("closed");
      // What closeGroup returned and what get_report_group now persists
      // must agree -- confirms save_report_group_interpretation actually
      // ran (or was correctly skipped) inside closeGroup.
      expect(detail.aiInterpretation).toBe(aiInterpretation);
      // Once closed, canClose is false for everyone regardless of prior
      // eligibility (report_groups.status <> 'open' is close_report_group's
      // own first check) -- groupAInvitees.tokens[0] was canClose:true
      // pre-close.
      expect(detail.canClose).toBe(false);
      expect(detail.canSeeReport).toBe(true);

      console.log(
        `[characterization] AI interpretation outcome for groupA (manager path): ${
          aiInterpretation === null ? "null (no ANTHROPIC_API_KEY or empty summary)" : "text generated"
        }`
      );
    });
  });
});

// ---------------------------------------------------------------------------
// reportGroupsManager.closeGroup: below the anonymity floor, everyone
// accepted -- isolates `meetsMinimumSize` from `allAccepted` (both must
// hold to close; groupA's describe block above already covers the reverse
// case, allAccepted:false with meetsMinimumSize:true).
// ---------------------------------------------------------------------------

describe("reportGroupsManager.closeGroup: below the minimum group size, even with 100% acceptance", () => {
  test("3 members, all 3 accept -> still throws close_report_group's 'Hacen falta...' message", async () => {
    const three = inviteePool(3);

    const { groupId } = await seedReportGroup({
      supabaseUrl: SUPABASE_URL,
      apikey: ANON_KEY,
      creatorEmail: creatorEmail(),
      creatorPassword: PASSWORD,
      name: `Grupo bajo umbral manager ${Date.now()}`,
      memberEmails: three.emails,
    });
    expect(groupId).toMatch(GROUP_ID_RE);

    // All 3 accept -- isolates the size floor from the "everyone must
    // accept" rule (0 pending/rejected here, on purpose).
    for (let i = 0; i < 3; i++) {
      actingAs(three.tokens[i]);
      await reportGroupsManager.respondToGroup(groupId, true);
    }

    actingAs(three.tokens[0]);
    const belowThresholdDetail = await reportGroupsManager.getGroup(groupId);
    expect(belowThresholdDetail.acceptedCount).toBe(3);
    expect(belowThresholdDetail.allAccepted).toBe(true);
    expect(belowThresholdDetail.meetsMinimumSize).toBe(false);
    expect(belowThresholdDetail.readyToClose).toBe(false);
    expect(belowThresholdDetail.canClose).toBe(true);

    // Recorded verbatim from close_report_group's raised exception
    // (0099_report_groups_membership_management_and_email.sql):
    // "Hacen falta al menos % personas en el grupo para poder cerrarlo."
    // with min_invitees_per_request (5, no per-org override seeded by
    // seed-demo-company.mjs) substituted in. Wording changed from "...
    // personas aceptadas para cerrar el grupo." (pre-2026-09-17): with
    // 100% acceptance now required to even reach this check, "aceptadas"
    // was misleading -- everyone present already has.
    await expect(reportGroupsManager.closeGroup(groupId)).rejects.toThrow(
      "Hacen falta al menos 5 personas en el grupo para poder cerrarlo."
    );
  });
});

// ---------------------------------------------------------------------------
// reportGroupsManager.addMembers: invite someone new to an open group, and
// re-invite someone who had rejected -- the two behaviors
// add_report_group_members covers (0099_report_groups_membership_
// management_and_email.sql).
// ---------------------------------------------------------------------------

describe("reportGroupsManager.addMembers", () => {
  test("invites a new person, and re-invites (resets to pending) someone who had rejected -- never touches someone already pending/accepted", async () => {
    const initial = inviteePool(2);
    const { groupId } = await seedReportGroup({
      supabaseUrl: SUPABASE_URL,
      apikey: ANON_KEY,
      creatorEmail: creatorEmail(),
      creatorPassword: PASSWORD,
      name: `Grupo addMembers manager ${Date.now()}`,
      memberEmails: initial.emails,
    });
    expect(groupId).toMatch(GROUP_ID_RE);

    // initial[0] accepts, initial[1] rejects.
    actingAs(initial.tokens[0]);
    await reportGroupsManager.respondToGroup(groupId, true);
    actingAs(initial.tokens[1]);
    await reportGroupsManager.respondToGroup(groupId, false);

    const extra = inviteePool(1, 6); // a third person, not in `initial`
    actingAs(creatorToken());
    // Re-invite the rejecter (initial[1]) plus one brand-new person
    // (extra[0]); initial[0] (already accepted) is passed too, to confirm
    // it's silently skipped rather than erroring or resetting their status.
    await reportGroupsManager.addMembers(groupId, [initial.ids[1], extra.ids[0], initial.ids[0]]);

    const detail = await reportGroupsManager.getGroup(groupId);
    expect(detail.members).toHaveLength(3);
    const statusByEmail = Object.fromEntries(detail.members.map((m) => [m.email, m.status]));
    expect(statusByEmail[initial.emails[0]]).toBe("accepted"); // untouched
    expect(statusByEmail[initial.emails[1]]).toBe("pending"); // reset from 'rejected'
    expect(statusByEmail[extra.emails[0]]).toBe("pending"); // brand new
  });
});
