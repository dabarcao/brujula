// Story 3.8 (_bmad-output/implementation-artifacts/
// spec-3-8-db-access-manager-scaffolding-cycles.md): re-verifies a
// representative subset of Story 3.7's characterization baseline
// (tests/characterization/cycles.test.ts) against the NEW `cyclesManager`
// functions, called directly -- not through the still-unmodified
// src/app/actions/cycles.ts Server Actions (that wiring is Story 3.10).
// Same fixtures (scripts/seed-demo-company.mjs), same expected error
// strings, same mocking shape as Story 1.2's reportGroupsManager
// precedent (tests/characterization/report-groups-manager.test.ts): only
// `@/lib/supabase/server`'s `createClient` needs mocking here --
// `cyclesManager` never imports `next/navigation` or `next/cache`, unlike
// the Server Actions it will eventually back.
//
// What's real: every Postgres RPC the manager functions call (the same 8
// RPCs `db/cycles.ts` wraps), run against the same local `supabase start`
// instance.
//
// Deliberate behavior difference from the Server Action baseline:
// `cyclesManager.closeRequest` wraps ONLY `close_cycle_request` -- it does
// not generate/save an AI interpretation the way `finalizeCycleRequest`
// (src/app/actions/cycles.ts) does today (see this story's own Boundaries:
// that orchestration is cross-domain and not migrated by this story). The
// close-request test below asserts `ai_interpretation` stays null through
// the manager path, unlike Story 3.7's own assertion for the same RPC.

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

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY -- deben venir de " +
      ".env.test.local (npx supabase start). Ver vitest.config.ts."
  );
}
// Hard boundary carried over from Story 3.7: never run this suite against a
// remote Supabase project, dev or production -- only the local CLI instance.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(SUPABASE_URL)) {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL (${SUPABASE_URL}) no es la instancia local de \`supabase start\`. ` +
      "Estos tests nunca deben correr contra un proyecto remoto."
  );
}

// ---------------------------------------------------------------------------
// Mocks -- see file header for what and why. Unlike Story 3.7's suite, no
// next/navigation or next/cache mock is needed: the manager layer never
// calls redirect()/revalidatePath() (that stays one layer up, in the Server
// Action -- Story 3.10).
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
// of `@/lib/supabase/server` (via `@/server/db/cycles`) picks up the mocked
// client factory.
import * as cyclesManager from "@/server/managers/cyclesManager";
// Story 7.3: aiInterpretationManager.generateProfileInterpretation/
// saveProfileInterpretation/getSavedProfileInterpretation -- exercised
// below against this file's own closedEmployee fixture, same mocked
// `@/lib/supabase/server` client (the manager's db calls go through
// `@/server/db/feedback` and `@/server/db/aiInterpretations`, both of
// which import that same module).
import * as aiInterpretationManager from "@/server/managers/aiInterpretationManager";

// ---------------------------------------------------------------------------
// Small REST/RPC/auth helpers -- same anon-key-only pattern as
// scripts/seed-*.mjs and Story 3.7's suite; used only for setup/assertions
// here, never as the thing under test.
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

async function signUp(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`signUp failed for ${email}: ${JSON.stringify(data)}`);
  }
  return data.access_token as string;
}

/** Story 7.4: signup carrying a pending_invite_token, same technique as
 * tests/characterization/admin-members-auth-manager.test.ts's own
 * signUpWithInvite -- used only to accept the fresh Invitado invite the
 * guest-exclusion fixture below creates. */
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

/** Fresh individual-kind account (organizations.kind = 'individual'), via
 * create_individual_account -- the only way to reach
 * createIndividualRequest/updateIndividualRequestEvaluators's success path,
 * same helper as Story 3.7's suite. */
async function createFreshIndividualAccount(email: string): Promise<string> {
  const token = await signUp(email, PASSWORD);
  await callRpc("create_individual_account", token, {
    p_full_name: "Individual de Prueba",
    p_email: email,
  });
  return token;
}

const EVALUATOR_CATEGORIES = ["manager", "team", "team", "organization", "other"] as const;

function todayPlusDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Fixture: one fresh demo company via scripts/seed-demo-company.mjs, same
// technique as Story 3.7's suite.
// ---------------------------------------------------------------------------

type SeededEmployee = { email: string; bucketLabel: string };

let supervisorEmail: string;
let supervisorToken: string;
let supervisorMemberId: string;
let orgId: string;
let seedCycleId: string;
let closedEmployee: { token: string; id: string; requestId: string };
let readyEmployee: { token: string; id: string; requestId: string };
let halfDoneEmployee: { token: string; id: string; requestId: string };
let evaluatorPool: { id: string }[]; // >= 5 active, non-supervisor org employees

// Shared across the createCycle / organizeEvaluators / updateRequestEvaluators
// describe blocks below (siblings, run sequentially in source order): each
// stage's fixture (the cycle, then its request) is produced by the stage
// before it.
let freshCycleId: string;
let freshRequestId: string;

const runId = Date.now();

beforeAll(async () => {
  const companyName = `Char Test Cycles Manager ${runId}`;
  let seedOutput: string;
  try {
    seedOutput = execFileSync("node", [path.join("scripts", "seed-demo-company.mjs"), companyName, "6"], {
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
  supervisorEmail = supervisorMatch[1];

  const cycleIdMatch = seedOutput.match(/^ {3}cycle id: (\S+)$/m);
  if (!cycleIdMatch) {
    throw new Error(`no se pudo extraer el cycle id de la salida del seed:\n${seedOutput}`);
  }
  seedCycleId = cycleIdMatch[1];

  const employees: SeededEmployee[] = [];
  const lineRe = /^ {2}- .+ <([^>]+)> — .+ — 360: (.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(seedOutput))) {
    employees.push({ email: m[1], bucketLabel: m[2] });
  }

  const closed = employees.find((e) => e.bucketLabel === "cerrado");
  const ready = employees.find((e) => e.bucketLabel === "listo (sin cerrar)");
  const halfDone = employees.find((e) => e.bucketLabel === "a medias");
  if (!closed || !ready || !halfDone) {
    throw new Error(
      `seed-demo-company.mjs no produjo los 3 buckets esperados. Salida completa:\n${seedOutput}`
    );
  }

  supervisorToken = await login(supervisorEmail, PASSWORD);

  const memberRows = (await restGet(
    `members?select=id,email,organization_id&email=in.(${employees.map((e) => e.email).join(",")},${supervisorEmail})`,
    supervisorToken
  )) as { id: string; email: string; organization_id: string }[];
  const idByEmail = Object.fromEntries(memberRows.map((r) => [r.email, r.id]));
  orgId = memberRows.find((r) => r.email === supervisorEmail)!.organization_id;
  supervisorMemberId = idByEmail[supervisorEmail];

  async function resolve(e: SeededEmployee) {
    const token = await login(e.email, PASSWORD);
    const id = idByEmail[e.email];
    const requests = (await restGet(
      `feedback_requests?select=id&requester_member_id=eq.${id}&request_type=eq.cycle`,
      token
    )) as { id: string }[];
    return { token, id, requestId: requests[0].id };
  }

  closedEmployee = await resolve(closed);
  readyEmployee = await resolve(ready);
  halfDoneEmployee = await resolve(halfDone);

  evaluatorPool = employees.map((e) => ({ id: idByEmail[e.email] }));
  if (evaluatorPool.length < 5) {
    throw new Error(`evaluatorPool insuficiente (${evaluatorPool.length}); se necesitan >= 5.`);
  }
});

afterAll(() => {
  acting.token = null;
});

// ---------------------------------------------------------------------------
// cyclesManager.createCycle
// ---------------------------------------------------------------------------

describe("cyclesManager.createCycle", () => {
  test("as the Supervisor, valid input -> returns { cycleId }, creates the cycle row", async () => {
    // Same rationale as Story 3.7's suite: the Supervisor is the cycle's
    // own sole participant, sidestepping the seeded employees' existing
    // "one open cycle at a time" lock (0023_one_open_cycle_at_a_time.sql).
    const cycleName = `Ciclo fresco manager ${runId}`;

    actingAs(supervisorToken);
    const { cycleId } = await cyclesManager.createCycle(
      cycleName,
      todayPlusDays(0),
      todayPlusDays(30),
      [supervisorMemberId]
    );

    expect(cycleId).toBeTruthy();
    freshCycleId = cycleId;

    const rows = (await restGet(`feedback_cycles?select=id&id=eq.${cycleId}`, supervisorToken)) as {
      id: string;
    }[];
    expect(rows).toHaveLength(1);
  });

  test("RPC rejects (participant already has an open cycle) -> throws create_feedback_cycle's own exact message prefix", async () => {
    // Story 7.1 (schema port): the "one open cycle at a time" guard was
    // fixed upstream (renumbered 0070_fix_cycle_conflict_check_uses_status.sql)
    // to check the participant's own feedback_requests.status instead of
    // calendar-date overlap -- evaluatorPool[0] (whichever bucket the seed
    // produced first) may already be closed and no longer conflict. Use
    // readyEmployee, still "open" at this point in the file, to genuinely
    // exercise the conflict case under the corrected rule.
    actingAs(supervisorToken);
    await expect(
      cyclesManager.createCycle(`Ciclo conflictivo manager ${runId}`, todayPlusDays(0), todayPlusDays(30), [
        readyEmployee.id,
      ])
    ).rejects.toThrow(
      // Recorded verbatim (static prefix) from create_feedback_cycle's raised
      // exception (supabase/migrations/0023_one_open_cycle_at_a_time.sql:71-72).
      "Ya tienen un ciclo 360 abierto, no se les puede incluir en otro hasta que termine:"
    );
  });
});

// ---------------------------------------------------------------------------
// cyclesManager.getCyclesNeedingOrganization -- dashboard audit fix
// (Finding 2): composes getMyOpenCycles()/getMyCycleRequests() to surface
// only cycles this member participates in that don't yet have their own
// organized request. Exercised at two points against freshCycleId/
// freshRequestId (createCycle/organizeEvaluators, sibling suites, run in
// source order): here, right after createCycle and before
// organizeEvaluators has run -- the fresh cycle has no organized request
// yet, so it must be included.
// ---------------------------------------------------------------------------

describe("cyclesManager.getCyclesNeedingOrganization (before organizing)", () => {
  test("right after createCycle, before organizing evaluators -> the fresh cycle is included", async () => {
    expect(freshCycleId, "createCycle must have run first").toBeDefined();
    expect(
      freshRequestId,
      "organizeEvaluators must NOT have run yet for this assertion to be meaningful"
    ).toBeUndefined();

    actingAs(supervisorToken);
    const rows = await cyclesManager.getCyclesNeedingOrganization();

    expect(rows.some((r) => r.id === freshCycleId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cyclesManager.organizeEvaluators -- uses the fresh cycle createCycle
// produced above (sibling suite, runs first in source order).
// ---------------------------------------------------------------------------

// Story 7.6: `organizeEvaluators`/`createIndividualRequest` (below) now
// also call `responderManager.sendInvitationEmails(requestId)` internally
// right after the RPC succeeds (cyclesManager.ts's own comment on that
// import explains why it lives here, not in src/app/actions/cycles.ts).
// That call is unguarded by its own try/catch here because
// `sendInvitationEmails` itself never throws (best-effort internally,
// same contract as infra/email.ts's own no-RESEND_API_KEY no-op) -- these
// existing "valid input" tests already prove that end-to-end for the
// member-based-invitee path (no separate test needed): if the email
// trigger ever started throwing, these would fail outright instead of
// returning { requestId }.
describe("cyclesManager.organizeEvaluators", () => {
  test("as the Supervisor, valid input -> returns { requestId }, creates the cycle request", async () => {
    expect(freshCycleId, "createCycle must have run first").toBeDefined();

    const evaluatorIds = evaluatorPool.slice(0, 5).map((e) => e.id);

    actingAs(supervisorToken);
    const { requestId } = await cyclesManager.organizeEvaluators(
      freshCycleId,
      evaluatorIds,
      [...EVALUATOR_CATEGORIES]
    );

    expect(requestId).toBeTruthy();
    freshRequestId = requestId;

    const rows = (await restGet(
      `feedback_requests?select=id&cycle_id=eq.${freshCycleId}&requester_member_id=eq.${supervisorMemberId}`,
      supervisorToken
    )) as { id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(requestId);
  });

  test("RPC rejects (already organized for this cycle) -> throws organize_cycle_evaluators's own exact message", async () => {
    expect(freshCycleId, "the previous test must have run first").toBeDefined();

    const evaluatorIds = evaluatorPool.slice(0, 5).map((e) => e.id);

    actingAs(supervisorToken);
    await expect(
      cyclesManager.organizeEvaluators(freshCycleId, evaluatorIds, [...EVALUATOR_CATEGORIES])
    ).rejects.toThrow(
      // Recorded verbatim from organize_cycle_evaluators's raised exception
      // (supabase/migrations/0050_cycle_closing_date_and_edit_rules.sql).
      "Ya has organizado tus evaluadores para este ciclo."
    );
  });
});

// ---------------------------------------------------------------------------
// cyclesManager.getCyclesNeedingOrganization -- other half of the pair
// above: once organizeEvaluators has run for the fresh cycle, it must drop
// out (already organized). Also sanity-checks readyEmployee, who already
// organized the seeded cycle in the beforeAll fixture itself, the same way.
// ---------------------------------------------------------------------------

describe("cyclesManager.getCyclesNeedingOrganization (after organizing)", () => {
  test("once organizeEvaluators has run for the fresh cycle -> it's excluded, already organized", async () => {
    expect(freshRequestId, "organizeEvaluators must have run first").toBeDefined();

    actingAs(supervisorToken);
    const rows = await cyclesManager.getCyclesNeedingOrganization();

    expect(rows.some((r) => r.id === freshCycleId)).toBe(false);
  });

  test("readyEmployee already organized the seeded cycle -> it's excluded for them too", async () => {
    actingAs(readyEmployee.token);
    const rows = await cyclesManager.getCyclesNeedingOrganization();

    expect(rows.some((r) => r.id === seedCycleId)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cyclesManager.updateRequestEvaluators -- same fresh request from
// organizeEvaluators above, still zero responses, so this exercises the
// "full replace" branch.
// ---------------------------------------------------------------------------

describe("cyclesManager.updateRequestEvaluators", () => {
  test("as the Supervisor, valid evaluator set -> resolves undefined", async () => {
    expect(freshRequestId, "organizeEvaluators must have run first").toBeDefined();

    const evaluatorIds = evaluatorPool.slice(0, 5).map((e) => e.id);

    actingAs(supervisorToken);
    await expect(
      cyclesManager.updateRequestEvaluators(freshRequestId, evaluatorIds, [...EVALUATOR_CATEGORIES])
    ).resolves.toBeUndefined();
  });

  test("RPC rejects (request already closed) -> throws update_cycle_request_evaluators's own exact message", async () => {
    // closedEmployee's own request was already closed by
    // scripts/seed-demo-company.mjs (its "cerrado" bucket) -- same
    // fixture Story 3.7's suite uses for this scenario.
    actingAs(closedEmployee.token);
    await expect(cyclesManager.updateRequestEvaluators(closedEmployee.requestId, [], [])).rejects.toThrow(
      // Recorded verbatim from update_cycle_request_evaluators's raised
      // exception (supabase/migrations/0050_cycle_closing_date_and_edit_rules.sql:284).
      "Esta solicitud ya no está abierta."
    );
  });

  // Story 7.7 (ports upstream `69f6495`): `update_cycle_request_evaluators`'s
  // final redefinition (renumbered 0094_fix_ambiguous_returning_column.sql)
  // is add-only -- passing the same 5 already-organized evaluators again
  // (the test just above) is a genuine no-op RPC-side, 0 new rows, so
  // `sendInvitationEmailsForNewInvitees` never even attempts a send (its own
  // `invitees.length === 0` early return). This test instead adds one
  // genuinely new evaluator (evaluatorPool[5], never passed to
  // organizeEvaluators/updateRequestEvaluators before in this file) to prove
  // the "at least one new row" path -- db/cycles.ts's own
  // `updateCycleRequestEvaluators` resolving the new invitee_member_id to an
  // email and cyclesManager.updateRequestEvaluators handing it to
  // `sendInvitationEmailsForNewInvitees` -- still resolves undefined (no
  // RESEND_API_KEY in this test env, so the send itself is a no-op; see
  // infra/email.ts's own contract) and genuinely adds the new invitation
  // row, without touching the 5 already there.
  test("adding one genuinely new evaluator (add-only) -> resolves undefined, new invitation row created, existing 5 untouched", async () => {
    expect(freshRequestId, "organizeEvaluators must have run first").toBeDefined();
    expect(evaluatorPool.length, "evaluatorPool must have a 6th member beyond the already-organized 5").toBeGreaterThanOrEqual(6);

    const beforeRows = (await restGet(
      `feedback_invitations?select=invitee_member_id&feedback_request_id=eq.${freshRequestId}`,
      supervisorToken
    )) as { invitee_member_id: string }[];

    const evaluatorIds = [...evaluatorPool.slice(0, 5).map((e) => e.id), evaluatorPool[5].id];

    actingAs(supervisorToken);
    await expect(
      cyclesManager.updateRequestEvaluators(freshRequestId, evaluatorIds, [...EVALUATOR_CATEGORIES, "other"])
    ).resolves.toBeUndefined();

    const afterRows = (await restGet(
      `feedback_invitations?select=invitee_member_id&feedback_request_id=eq.${freshRequestId}`,
      supervisorToken
    )) as { invitee_member_id: string }[];

    expect(afterRows).toHaveLength(beforeRows.length + 1);
    expect(afterRows.map((r) => r.invitee_member_id)).toEqual(
      expect.arrayContaining([...beforeRows.map((r) => r.invitee_member_id), evaluatorPool[5].id])
    );
  });
});

// ---------------------------------------------------------------------------
// cyclesManager.createIndividualRequest / cyclesManager.updateIndividualRequestEvaluators
// -- same 'individual'-kind-organization fixture as Story 3.7's suite.
// ---------------------------------------------------------------------------

describe("cyclesManager.createIndividualRequest", () => {
  test("as a fresh individual account, valid input -> returns { requestId }; updateIndividualRequestEvaluators then resolves undefined", async () => {
    const email = `individual-a-manager-${runId}@brujula-fake.test`;
    const token = await createFreshIndividualAccount(email);

    const emails = ["ev1", "ev2", "ev3", "ev4", "ev5"].map((n) => `${n}-manager-${runId}@brujula-fake.test`);

    actingAs(token);
    const { requestId } = await cyclesManager.createIndividualRequest(
      emails,
      [...EVALUATOR_CATEGORIES],
      todayPlusDays(14),
      "Mi 360 individual manager"
    );

    expect(requestId).toBeTruthy();

    const rows = (await restGet(`feedback_requests?select=id&id=eq.${requestId}`, token)) as { id: string }[];
    expect(rows).toHaveLength(1);

    // ---------------------------------------------------------------
    // updateIndividualRequestEvaluators, valid input -- same fresh
    // request (zero responses, still open, closesAt in the future).
    // ---------------------------------------------------------------
    const newEmails = ["u1", "u2", "u3", "u4", "u5"].map((n) => `${n}-manager-${runId}@brujula-fake.test`);

    actingAs(token);
    await expect(
      cyclesManager.updateIndividualRequestEvaluators(requestId, newEmails, [...EVALUATOR_CATEGORIES])
    ).resolves.toBeUndefined();
  });

  test("RPC rejects (malformed email) -> throws create_individual_cycle_request's own exact message", async () => {
    const email = `individual-b-manager-${runId}@brujula-fake.test`;
    const token = await createFreshIndividualAccount(email);

    const emails = [
      `ev1-manager-${runId}@brujula-fake.test`,
      `ev2-manager-${runId}@brujula-fake.test`,
      `ev3-manager-${runId}@brujula-fake.test`,
      `ev4-manager-${runId}@brujula-fake.test`,
      "not-an-email",
    ];

    actingAs(token);
    await expect(
      cyclesManager.createIndividualRequest(emails, [...EVALUATOR_CATEGORIES], todayPlusDays(14), null)
    ).rejects.toThrow(
      // Recorded verbatim from create_individual_cycle_request's raised
      // exception (supabase/migrations/0050_cycle_closing_date_and_edit_rules.sql).
      "Algún email no es válido."
    );
  });

  test("updateIndividualRequestEvaluators RPC rejects (inviting self) -> throws its own exact message", async () => {
    const email = `individual-c-manager-${runId}@brujula-fake.test`;
    const token = await createFreshIndividualAccount(email);

    const emails = ["ev1", "ev2", "ev3", "ev4", "ev5"].map((n) => `${n}-c-manager-${runId}@brujula-fake.test`);

    actingAs(token);
    const { requestId } = await cyclesManager.createIndividualRequest(
      emails,
      [...EVALUATOR_CATEGORIES],
      todayPlusDays(14),
      `Mi 360 individual C manager ${runId}`
    );

    // Same 5 valid, distinct emails as above, except the first one is
    // swapped for the account's own email -- reaches
    // update_individual_cycle_request_evaluators's self-invite guard.
    actingAs(token);
    await expect(
      cyclesManager.updateIndividualRequestEvaluators(
        requestId,
        [email, ...emails.slice(1)],
        [...EVALUATOR_CATEGORIES]
      )
    ).rejects.toThrow(
      "No puedes invitarte a ti mismo como evaluador: tu autoevaluación ya está incluida aparte."
    );
  });

  // Story 7.7 (ports upstream `69f6495`), individual-account counterpart of
  // the member-id add-only test in the `updateRequestEvaluators` describe
  // block above: `update_individual_cycle_request_evaluators`'s final
  // redefinition already returns `{invitee_email, token}` rows -- no
  // `members` lookup needed for this variant (db/cycles.ts's own doc
  // comment) -- so this checks the genuinely-new emails actually get their
  // invitation row, and repeated emails don't duplicate one.
  test("updateIndividualRequestEvaluators, repeated + genuinely new emails (add-only) -> resolves undefined, only the new ones are added", async () => {
    const email = `individual-d-manager-${runId}@brujula-fake.test`;
    const token = await createFreshIndividualAccount(email);

    const originalEmails = ["ev1", "ev2", "ev3", "ev4", "ev5"].map(
      (n) => `${n}-d-manager-${runId}@brujula-fake.test`
    );

    actingAs(token);
    const { requestId } = await cyclesManager.createIndividualRequest(
      originalEmails,
      [...EVALUATOR_CATEGORIES],
      todayPlusDays(14),
      `Mi 360 individual D manager ${runId}`
    );

    const newEmails = [
      originalEmails[0],
      originalEmails[1],
      `new1-d-manager-${runId}@brujula-fake.test`,
      `new2-d-manager-${runId}@brujula-fake.test`,
      `new3-d-manager-${runId}@brujula-fake.test`,
    ];

    actingAs(token);
    await expect(
      cyclesManager.updateIndividualRequestEvaluators(requestId, newEmails, [...EVALUATOR_CATEGORIES])
    ).resolves.toBeUndefined();

    // Excludes the requester's own "self" invitation row (invitee_email is
    // null for it, evaluator_category = 'self', invitee_member_id set
    // instead -- create_individual_cycle_request's own self-assessment row,
    // unrelated to the evaluator emails this test is about).
    actingAs(token);
    const rows = (await restGet(
      `feedback_invitations?select=invitee_email&feedback_request_id=eq.${requestId}&invitee_email=not.is.null`,
      token
    )) as { invitee_email: string }[];
    const invitedEmails = rows.map((r) => r.invitee_email).sort();
    expect(invitedEmails).toEqual([...new Set([...originalEmails, ...newEmails])].sort());
  });
});

// ---------------------------------------------------------------------------
// cyclesManager.closeRequest -- see file header: deliberately does NOT
// generate/save an AI interpretation, unlike finalizeCycleRequest.
// ---------------------------------------------------------------------------

describe("cyclesManager.closeRequest", () => {
  test("a request eligible to close -> resolves undefined; status becomes 'closed'; ai_interpretation stays null (manager doesn't orchestrate it)", async () => {
    expect(readyEmployee, "the seed fixture must have produced a 'listo (sin cerrar)' employee").toBeDefined();

    actingAs(readyEmployee.token);
    await expect(cyclesManager.closeRequest(readyEmployee.requestId)).resolves.toBeUndefined();

    const rows = (await restGet(
      `feedback_requests?select=status,ai_interpretation&id=eq.${readyEmployee.requestId}`,
      readyEmployee.token
    )) as { status: string; ai_interpretation: string | null }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("closed");
    // Deliberate behavior difference from the Server Action baseline (see
    // file header) -- the manager path never calls generateAiInterpretation/
    // save_ai_interpretation, so this stays null regardless of
    // ANTHROPIC_API_KEY.
    expect(rows[0].ai_interpretation).toBeNull();
  });

  test("a request not eligible to close -> throws close_cycle_request's own exact message", async () => {
    expect(halfDoneEmployee, "the seed fixture must have produced an 'a medias' employee").toBeDefined();

    actingAs(halfDoneEmployee.token);
    await expect(cyclesManager.closeRequest(halfDoneEmployee.requestId)).rejects.toThrow(
      // Recorded verbatim from close_cycle_request's raised exception
      // (supabase/migrations/0060_finalize_cycle_request.sql).
      "Todavía no se puede finalizar: hace falta llegar al mínimo de respuestas y tu propia autoevaluación."
    );
  });
});

// ---------------------------------------------------------------------------
// cyclesManager.getStatus / cyclesManager.getColleaguesWithClosedCycle
// ---------------------------------------------------------------------------

describe("cyclesManager.getStatus", () => {
  test("closed cycle -> returns rows with status: 'completado' for participants who finished", async () => {
    actingAs(supervisorToken);
    const rows = await cyclesManager.getStatus(seedCycleId);

    expect(rows.length).toBeGreaterThan(0);
    const closedRow = rows.find((r) => r.memberId === closedEmployee.id);
    expect(closedRow).toBeDefined();
    expect(closedRow!.status).toBe("completado");
  });

  test("as a non-supervisor, rejects with get_cycle_status's own exact message", async () => {
    actingAs(readyEmployee.token);
    await expect(cyclesManager.getStatus(seedCycleId)).rejects.toThrow(
      // Recorded verbatim from get_cycle_status's raised exception
      // (supabase/migrations/0035_cycle_status_for_supervisor.sql:28).
      "Solo el administrador de la empresa puede ver el estado de un ciclo."
    );
  });
});

describe("cyclesManager.getColleaguesWithClosedCycle", () => {
  test("returns colleagues in the same company who have a closed 360, excluding the caller", async () => {
    actingAs(readyEmployee.token);
    const rows = await cyclesManager.getColleaguesWithClosedCycle();

    expect(rows.some((r) => r.id === closedEmployee.id)).toBe(true);
    expect(rows.some((r) => r.id === readyEmployee.id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cyclesManager.getMyOpenCycles -- Cycles-domain audit fix: this function
// now filters to currently-open cycles server-side (today between
// opens_at/closes_at inclusive) instead of returning every cycle the
// caller participates in regardless of date. This suite's own seed fixture
// (scripts/seed-demo-company.mjs) always opens seedCycleId today and
// closes it 30 days out, so there's no non-open cycle available here to
// exercise the exclusion side directly -- that's covered instead by
// tests/characterization/read-only-reports-manager.test.ts's own
// getMyOpenCycles suite (per-caller scoping, not date filtering, but the
// same function). This test just confirms the still-open seeded cycle
// keeps coming back, unaffected by the new date filter.
// ---------------------------------------------------------------------------

describe("cyclesManager.getMyOpenCycles", () => {
  test("caller participates in the currently-open seeded cycle -> returns it", async () => {
    actingAs(readyEmployee.token);
    const rows = await cyclesManager.getMyOpenCycles();

    expect(rows.some((r) => r.id === seedCycleId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Story 6.4 (cycles-domain migration): new manager functions wrapping
// dashboard/cycles/page.tsx, nueva/page.tsx, [id]/page.tsx,
// [id]/estado/page.tsx and actions/cycles.ts's remaining direct Supabase
// calls. Same fixtures as above (seedCycleId/supervisorMemberId/orgId from
// beforeAll; freshCycleId/freshRequestId from the createCycle/
// organizeEvaluators describe blocks above, which run first in file order).
// ---------------------------------------------------------------------------

describe("cyclesManager.listOrganizationCycles", () => {
  test("as the Supervisor, returns the org's cycles including the seeded one", async () => {
    actingAs(supervisorToken);
    const rows = await cyclesManager.listOrganizationCycles(orgId);

    const seeded = rows.find((r) => r.id === seedCycleId);
    expect(seeded).toBeDefined();
    expect(seeded!.requestStatuses.length).toBeGreaterThan(0);
    // Cycles-domain audit fix: `isClosed` is now computed server-side (the
    // same rule the removed dashboard/cycles/page.tsx `isCycleClosed`
    // helper used). The seeded cycle has a mix of closed/open/half-done
    // requests (closedEmployee/readyEmployee/halfDoneEmployee buckets),
    // so not every request is closed yet -- `isClosed` must be false, and
    // must always agree with the same rule applied to `requestStatuses`.
    expect(seeded!.isClosed).toBe(false);
    expect(seeded!.isClosed).toBe(
      seeded!.requestStatuses.length > 0 && seeded!.requestStatuses.every((s) => s === "closed")
    );
  });
});

describe("cyclesManager.getCycleById", () => {
  test("existing id, currently within its date range -> returns the cycle with isOpen: true", async () => {
    actingAs(supervisorToken);
    const cycle = await cyclesManager.getCycleById(seedCycleId);

    expect(cycle).not.toBeNull();
    expect(cycle!.id).toBe(seedCycleId);
    // Cycles-domain audit fix: `isOpen` is now computed server-side (the
    // same rule the removed cycles/[id]/page.tsx inline `isOpen` check
    // used). scripts/seed-demo-company.mjs opens the seeded cycle today
    // and closes it in 30 days, so it's always open at test time.
    expect(cycle!.isOpen).toBe(true);
  });

  test("nonexistent id -> returns null", async () => {
    actingAs(supervisorToken);
    const cycle = await cyclesManager.getCycleById("00000000-0000-0000-0000-000000000000");
    expect(cycle).toBeNull();
  });
});

describe("cyclesManager.isCycleParticipant", () => {
  test("caller is a participant of the seeded cycle -> true", async () => {
    actingAs(closedEmployee.token);
    const isParticipant = await cyclesManager.isCycleParticipant(seedCycleId, closedEmployee.id);
    expect(isParticipant).toBe(true);
  });

  test("querying another member's participation -> false (RLS scopes reads to the caller's own row)", async () => {
    actingAs(closedEmployee.token);
    const isParticipant = await cyclesManager.isCycleParticipant(seedCycleId, readyEmployee.id);
    expect(isParticipant).toBe(false);
  });
});

describe("cyclesManager.getExistingCycleRequestId", () => {
  test("caller already organized evaluators for the fresh cycle -> returns that request's id", async () => {
    expect(freshCycleId, "createCycle must have run first").toBeDefined();
    expect(freshRequestId, "organizeEvaluators must have run first").toBeDefined();

    actingAs(supervisorToken);
    const requestId = await cyclesManager.getExistingCycleRequestId(freshCycleId, supervisorMemberId);
    expect(requestId).toBe(freshRequestId);
  });

  test("no request organized yet for that cycle/member pair -> returns null", async () => {
    expect(freshCycleId, "createCycle must have run first").toBeDefined();

    actingAs(supervisorToken);
    const requestId = await cyclesManager.getExistingCycleRequestId(freshCycleId, evaluatorPool[0].id);
    expect(requestId).toBeNull();
  });
});

describe("cyclesManager.listCycleParticipantCandidates / listEvaluatorCandidates", () => {
  test("both return active colleagues excluding the caller", async () => {
    actingAs(supervisorToken);

    const participantCandidates = await cyclesManager.listCycleParticipantCandidates(supervisorMemberId);
    expect(participantCandidates.some((c) => c.id === supervisorMemberId)).toBe(false);
    expect(participantCandidates.some((c) => c.id === closedEmployee.id)).toBe(true);
    expect(participantCandidates.some((c) => c.id === readyEmployee.id)).toBe(true);

    const evaluatorCandidates = await cyclesManager.listEvaluatorCandidates(supervisorMemberId);
    expect(evaluatorCandidates.some((c) => c.id === supervisorMemberId)).toBe(false);
    expect(evaluatorCandidates.some((c) => c.id === closedEmployee.id)).toBe(true);
    expect(evaluatorCandidates.some((c) => c.id === readyEmployee.id)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Story 7.4: an Invitado can never be a company 360 cycle's subject (never
// evaluated, only evaluates) -- `listCycleParticipantCandidates` must never
// offer one as a pickable participant, `create_feedback_cycle` itself must
// reject one if somehow submitted anyway (supabase/migrations/
// 0076_guest_member_type.sql). An Invitado CAN still be picked as someone
// else's evaluator, so `listEvaluatorCandidates` must keep including them.
// ---------------------------------------------------------------------------

describe("cyclesManager guest (Invitado) handling (Story 7.4)", () => {
  let guestMemberId: string;

  test("setup: invite and accept a fresh Invitado in this same company", async () => {
    expect(supervisorToken, "the beforeAll seed must have run first").toBeDefined();

    const depts = (await restGet("departments?select=id&limit=1", supervisorToken)) as { id: string }[];
    expect(depts.length, "seed-demo-company.mjs must have created at least one department").toBeGreaterThan(0);

    const guestEmail = `invitado-cm-${runId}@char-test-cycles-manager-${runId}.brujula-fake.test`;
    const inviteToken = (await callRpc("invite_member", supervisorToken, {
      p_email: guestEmail,
      p_full_name: "Invitado de Prueba",
      p_department_id: depts[0].id,
      p_is_guest: true,
    })) as string;

    const guestToken = await signUpWithInvite(guestEmail, PASSWORD, inviteToken);
    await callRpc("accept_member_invite", guestToken, { p_token: inviteToken });

    const rows = (await restGet(
      `members?select=id,is_guest&email=eq.${encodeURIComponent(guestEmail)}`,
      supervisorToken
    )) as { id: string; is_guest: boolean }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].is_guest).toBe(true);
    guestMemberId = rows[0].id;
  });

  test("listCycleParticipantCandidates excludes the guest, listEvaluatorCandidates still includes them", async () => {
    expect(guestMemberId, "the setup test above must have run first").toBeDefined();

    actingAs(supervisorToken);
    const participantCandidates = await cyclesManager.listCycleParticipantCandidates(supervisorMemberId);
    expect(participantCandidates.some((c) => c.id === guestMemberId)).toBe(false);

    const evaluatorCandidates = await cyclesManager.listEvaluatorCandidates(supervisorMemberId);
    expect(evaluatorCandidates.some((c) => c.id === guestMemberId)).toBe(true);
  });

  test("createCycle with the guest as a participant -> throws create_feedback_cycle's own exact rejection message", async () => {
    expect(guestMemberId, "the setup test above must have run first").toBeDefined();

    actingAs(supervisorToken);
    await expect(
      cyclesManager.createCycle(
        `Ciclo con invitado ${runId}`,
        todayPlusDays(0),
        todayPlusDays(30),
        [guestMemberId]
      )
    ).rejects.toThrow(
      "Todos los participantes deben ser empleados activos de tu organización (un Invitado nunca puede ser evaluado)."
    );
  });
});

describe("cyclesManager.getMinInviteesPerRequest", () => {
  // Cycles-domain audit fix: the manager now resolves the page-level `?? 5`
  // fallback itself (moved out of cycles/[id]/page.tsx's own call site),
  // so this org (no platform_settings row) returns the plain number 5, not
  // null. db/cycles.ts's own getMinInviteesPerRequest is unchanged and
  // still returns null for "no org-specific setting" -- that distinct
  // fact isn't lost, just resolved one layer up, in the manager.
  test("org has no platform_settings row -> returns the resolved default of 5 (not null)", async () => {
    actingAs(supervisorToken);
    const minInvitees = await cyclesManager.getMinInviteesPerRequest(orgId);
    expect(minInvitees).toBe(5);
  });
});

describe("cyclesManager.saveAiInterpretation", () => {
  test("closed request, caller is the requester -> resolves undefined, updates ai_interpretation", async () => {
    actingAs(readyEmployee.token);
    await expect(
      cyclesManager.saveAiInterpretation(readyEmployee.requestId, "Interpretación de prueba manager")
    ).resolves.toBeUndefined();

    const rows = (await restGet(
      `feedback_requests?select=ai_interpretation&id=eq.${readyEmployee.requestId}`,
      readyEmployee.token
    )) as { ai_interpretation: string | null }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].ai_interpretation).toBe("Interpretación de prueba manager");
  });

  test("request not eligible (not closed) -> resolves undefined without throwing, and leaves ai_interpretation unchanged", async () => {
    actingAs(halfDoneEmployee.token);
    await expect(
      cyclesManager.saveAiInterpretation(halfDoneEmployee.requestId, "no debería guardarse")
    ).resolves.toBeUndefined();

    const rows = (await restGet(
      `feedback_requests?select=ai_interpretation&id=eq.${halfDoneEmployee.requestId}`,
      halfDoneEmployee.token
    )) as { ai_interpretation: string | null }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].ai_interpretation).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// aiInterpretationManager.generateProfileInterpretation / saveProfileInterpretation /
// getSavedProfileInterpretation -- Story 7.3. Closes the 3rd and last
// eslint.config.mjs exemption (src/app/actions/cycles.ts used to hand a raw
// Supabase client to src/lib/aiInterpretation.ts's generateAiInterpretation);
// this re-verifies the ported logic behaves the same against the real
// local Supabase instance, same "never throws" contract as
// reportGroupsManager.closeGroup's own AI-interpretation test
// (tests/characterization/report-groups-manager.test.ts).
// ---------------------------------------------------------------------------

describe("aiInterpretationManager.generateProfileInterpretation / saveProfileInterpretation / getSavedProfileInterpretation", () => {
  test("closed request with comparison data -> null or a 3-part result, never throws; a non-null result round-trips through save + read-back", async () => {
    expect(closedEmployee, "the seed fixture must have produced a 'cerrado' employee").toBeDefined();

    actingAs(closedEmployee.token);
    const result = await aiInterpretationManager.generateProfileInterpretation(closedEmployee.requestId);

    // Same baseline as reportGroupsManager's own AI-interpretation test:
    // both outcomes are valid depending on whether ANTHROPIC_API_KEY
    // happens to be set for this process -- never a single hardcoded
    // expectation.
    expect(result === null || typeof result === "object").toBe(true);

    if (result) {
      expect(typeof result.competencias).toBe("string");
      expect(result.competencias.length).toBeGreaterThan(0);
      expect(result.saboteadores === null || typeof result.saboteadores === "string").toBe(true);
      expect(result.resumenAbiertas === null || typeof result.resumenAbiertas === "string").toBe(true);

      await aiInterpretationManager.saveProfileInterpretation(closedEmployee.requestId, result);

      const saved = await aiInterpretationManager.getSavedProfileInterpretation(closedEmployee.requestId);
      expect(saved).not.toBeNull();
      expect(saved!.competencias).toBe(result.competencias);
      expect(saved!.saboteadores).toBe(result.saboteadores);
      expect(saved!.resumenAbiertas).toBe(result.resumenAbiertas);
    }

    console.log(
      `[characterization] AI profile interpretation outcome for closedEmployee: ${
        result === null ? "null (no ANTHROPIC_API_KEY or no comparison data)" : "3-part text generated"
      }`
    );
  });

  test("no ANTHROPIC_API_KEY configured -> resolves null without throwing (documented graceful-degradation path)", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      actingAs(closedEmployee.token);
      await expect(
        aiInterpretationManager.generateProfileInterpretation(closedEmployee.requestId)
      ).resolves.toBeNull();
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  test("a request with no saved interpretation yet -> getSavedProfileInterpretation resolves an object with null fields, never throws", async () => {
    expect(halfDoneEmployee, "the seed fixture must have produced an 'a medias' employee").toBeDefined();
    actingAs(halfDoneEmployee.token);
    const saved = await aiInterpretationManager.getSavedProfileInterpretation(halfDoneEmployee.requestId);
    expect(saved).not.toBeNull();
    expect(saved!.competencias).toBeNull();
    expect(saved!.saboteadores).toBeNull();
    expect(saved!.resumenAbiertas).toBeNull();
  });
});
