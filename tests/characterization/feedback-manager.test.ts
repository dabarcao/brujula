// Story 3.14 (_bmad-output/implementation-artifacts/
// spec-3-14-db-access-manager-scaffolding-feedback.md): re-verifies a
// representative subset of Story 3.13's characterization baseline
// (tests/characterization/feedback.test.ts) against the NEW
// `feedbackManager` functions, called directly -- not through the
// still-unmodified src/app/actions/feedback.ts Server Actions. Same
// fixture (scripts/seed-demo-company.mjs), same expected error strings,
// same mocking shape as Story 3.8's cyclesManager precedent
// (tests/characterization/cycles-manager.test.ts): only
// `@/lib/supabase/server`'s `createClient` needs mocking here --
// `feedbackManager` never imports `next/navigation` or `next/cache`.
//
// What's real: every Postgres RPC the manager functions call (the same 7
// RPCs `db/feedback.ts` wraps), run against the same local
// `supabase start` instance.
//
// Coverage: every row of the spec's own I/O & Edge-Case Matrix --
// createRequest (valid, below-min-invitees), createIndividualRequest
// (malformed email), updateRequestEvaluators (has responses),
// getCompetencyNarrative (below threshold, non-requester caller),
// getMyPendingInvitations (valid). submit_feedback_response/
// get_responder_context are called directly as fixture-building plumbing
// only (to produce a specific response count ahead of the threshold
// scenarios), same explicit allowance and technique feedback.test.ts's own
// respondAsEvaluator helper already established -- never through
// feedbackManager itself (out of this story's scope, responder/
// invitation-domain, Story 3.19-3.24).

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
// Hard boundary carried over from Story 3.7/3.13: never run this suite
// against a remote Supabase project, dev or production -- only the local
// CLI instance.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(SUPABASE_URL)) {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL (${SUPABASE_URL}) no es la instancia local de \`supabase start\`. ` +
      "Estos tests nunca deben correr contra un proyecto remoto."
  );
}

// ---------------------------------------------------------------------------
// Mocks -- see file header for what and why. No next/navigation or
// next/cache mock needed: the manager layer never calls
// redirect()/revalidatePath() (that stays one layer up, in the Server
// Action, unmodified by this story).
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
// of `@/lib/supabase/server` (via `@/server/db/feedback`) picks up the
// mocked client factory.
import * as feedbackManager from "@/server/managers/feedbackManager";
import type { CompetencyComparisonRow, CompetencyNarrativeRow } from "@/server/managers/feedbackManager";
// Fixture-building only, for the individual-account cycle-invitations test
// below (getFeedbackRequestEmailInvitations) -- composing managers across
// domains inside a test is fine (only raw Supabase access is forbidden),
// same allowance the task instructions themselves called out.
import * as cyclesManager from "@/server/managers/cyclesManager";

// ---------------------------------------------------------------------------
// Small REST/RPC/auth helpers -- same anon-key-only pattern as
// scripts/seed-*.mjs and Story 3.13's suite; used only for setup/assertions
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
 * guest-rejection fixture below creates. */
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
 * createIndividualRequest's success/failure paths (raises 'Esta función
 * es solo para cuentas individuales.' for any org-kind member). Same
 * helper feedback.test.ts already established. */
async function createFreshIndividualAccount(email: string): Promise<string> {
  const token = await signUp(email, PASSWORD);
  await callRpc("create_individual_account", token, {
    p_full_name: "Individual de Prueba",
    p_email: email,
  });
  return token;
}

type PendingInvitationRaw = {
  token: string;
  created_at: string;
  evaluator_category: string | null;
  requester_member_id: string;
  requester_full_name: string | null;
  requester_email: string;
};

type ResponderQuestion = {
  id: string;
  question_type: string;
  max_selections: number | null;
};

type ResponderContext = {
  valid: boolean;
  used?: boolean;
  questions?: ResponderQuestion[];
  competencies?: { code: string; name: string }[];
};

/** Fetches the caller's pending invitation from a specific requester, then
 * submits a full answer set via submit_feedback_response -- fixture-building
 * infrastructure only (to produce a specific response count ahead of the
 * threshold/has-responses scenarios below), same technique/allowance
 * feedback.test.ts's own respondAsEvaluator helper already established.
 * Called directly via RPC, never through feedbackManager (out of this
 * story's scope). */
async function respondAsEvaluator(evaluatorToken: string, requesterMemberId: string): Promise<void> {
  const pending = (await callRpc("get_my_pending_invitations", evaluatorToken, {})) as PendingInvitationRaw[];
  const invite = pending.find((p) => p.requester_member_id === requesterMemberId);
  if (!invite) {
    throw new Error(`test bug: no pending invitation found from requester ${requesterMemberId}`);
  }

  const ctx = (await callRpc("get_responder_context", evaluatorToken, {
    p_token: invite.token,
  })) as ResponderContext;
  if (!ctx.valid || !ctx.questions) {
    throw new Error(`get_responder_context returned invalid context: ${JSON.stringify(ctx)}`);
  }

  const competencyCode = ctx.competencies?.[0]?.code;
  const answers = ctx.questions.map((q) => {
    if (q.question_type === "competency") {
      return {
        question_id: q.id,
        competency_code: competencyCode,
        answer_value: 4,
        answer_text: "Comentario de prueba.",
      };
    }
    if (q.question_type === "scale") {
      return { question_id: q.id, answer_value: 4 };
    }
    return { question_id: q.id, answer_text: "Respuesta de prueba." };
  });

  await callRpc("submit_feedback_response", evaluatorToken, { p_token: invite.token, p_answers: answers });
}

// ---------------------------------------------------------------------------
// Fixture: one fresh demo company via scripts/seed-demo-company.mjs (8
// employees -- plenty for the 5 distinct ad-hoc requesters this suite
// needs, each requiring >= 5 invitees excluding themselves). Every ad-hoc
// feedback request/response actually under test is built directly through
// the real manager functions/RPCs under test, never through the seed
// script (whose own fixture-building only ever touches the 360-cycle
// flow) -- same technique as feedback.test.ts.
// ---------------------------------------------------------------------------

type SeededEmployee = { email: string; token: string; id: string };

let employees: SeededEmployee[]; // all 8 seeded employees, logged in
// Story 7.4: lifted out of beforeAll's own local scope so the Invitado
// fixture below (createRequest-as-guest) can invite a fresh guest member
// as this same company's Supervisor.
let supervisorToken: string;

const runId = Date.now();

function inviteesExcluding(requesterId: string, count = 5): string[] {
  return employees
    .filter((e) => e.id !== requesterId)
    .slice(0, count)
    .map((e) => e.id);
}

beforeAll(async () => {
  const companyName = `Char Test Feedback Manager ${runId}`;
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

  const employeeEmails: string[] = [];
  const lineRe = /^ {2}- .+ <([^>]+)> — .+ — 360: .+$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(seedOutput))) {
    employeeEmails.push(m[1]);
  }
  if (employeeEmails.length < 8) {
    throw new Error(
      `seed-demo-company.mjs no produjo los 8 empleados esperados (obtuvo ${employeeEmails.length}). ` +
        `Salida completa:\n${seedOutput}`
    );
  }

  const memberRows = (await restGet(
    `members?select=id,email&email=in.(${employeeEmails.join(",")},${supervisorEmail})`,
    supervisorToken
  )) as { id: string; email: string }[];
  const idByEmail = Object.fromEntries(memberRows.map((r) => [r.email, r.id]));

  employees = await Promise.all(
    employeeEmails.map(async (email) => ({
      email,
      token: await login(email, PASSWORD),
      id: idByEmail[email],
    }))
  );
});

afterAll(() => {
  acting.token = null;
});

// ---------------------------------------------------------------------------
// feedbackManager.createRequest
// ---------------------------------------------------------------------------

describe("feedbackManager.createRequest", () => {
  test("valid invitees (>= 5) -> returns { requestId }, creates the open ad_hoc request", async () => {
    const requester = employees[0];
    const inviteeIds = inviteesExcluding(requester.id, 5);

    actingAs(requester.token);
    const { requestId } = await feedbackManager.createRequest(inviteeIds);

    expect(requestId).toBeTruthy();

    const rows = (await restGet(
      `feedback_requests?select=id&requester_member_id=eq.${requester.id}&request_type=eq.ad_hoc&status=eq.open`,
      requester.token
    )) as { id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(requestId);
  });

  test("below min-invitees (< 5) -> throws create_ad_hoc_feedback_request's own exact message", async () => {
    // A fresh requester with no open ad_hoc request yet -- the RPC's
    // "already have one open" check runs BEFORE the invitee-count check,
    // so this must be a requester who hasn't succeeded above.
    const requester = employees[1];
    const inviteeIds = inviteesExcluding(requester.id, 2);

    actingAs(requester.token);
    await expect(feedbackManager.createRequest(inviteeIds)).rejects.toThrow(
      // Recorded verbatim from create_ad_hoc_feedback_request's raised
      // exception (supabase/migrations/0057_feedback_request_name.sql:64,
      // latest redefinition -- text unchanged since 0005). min_invitees
      // defaults to 5 (supabase/migrations/0001_initial_schema.sql:50).
      "Tienes que invitar al menos a 5 personas."
    );
  });
});

// ---------------------------------------------------------------------------
// feedbackManager.createIndividualRequest -- requires an 'individual'-kind
// organization, which scripts/seed-demo-company.mjs's own org never is.
// Fixture: a fresh individual account via create_individual_account, used
// only as plumbing.
// ---------------------------------------------------------------------------

describe("feedbackManager.createIndividualRequest", () => {
  test("malformed email -> throws create_ad_hoc_feedback_request_for_individual's own exact message", async () => {
    const email = `individual-manager-${runId}@brujula-fake.test`;
    const token = await createFreshIndividualAccount(email);

    const emails = [
      `ev1-manager-${runId}@brujula-fake.test`,
      `ev2-manager-${runId}@brujula-fake.test`,
      `ev3-manager-${runId}@brujula-fake.test`,
      `ev4-manager-${runId}@brujula-fake.test`,
      "not-an-email",
    ];

    actingAs(token);
    await expect(feedbackManager.createIndividualRequest(emails)).rejects.toThrow(
      // Recorded verbatim from create_ad_hoc_feedback_request_for_individual's
      // raised exception (supabase/migrations/0057_feedback_request_name.sql:180,
      // latest redefinition -- text unchanged since 0037).
      "Algún email no es válido."
    );
  });

  test("company account (non-individual org) -> throws the RPC's own exact account-kind message", async () => {
    // A regular seeded-company employee, not a fresh individual account --
    // the account-kind check (organizations.kind <> 'individual') is the
    // RPC's very first guard (supabase/migrations/0057_feedback_request_name.sql:143),
    // running before email validation or the invitee-count check, so a
    // malformed-email-shaped list is irrelevant here.
    const requester = employees[7];

    const emails = [
      `ev1-kind-${runId}@brujula-fake.test`,
      `ev2-kind-${runId}@brujula-fake.test`,
      `ev3-kind-${runId}@brujula-fake.test`,
      `ev4-kind-${runId}@brujula-fake.test`,
      `ev5-kind-${runId}@brujula-fake.test`,
    ];

    actingAs(requester.token);
    await expect(feedbackManager.createIndividualRequest(emails)).rejects.toThrow(
      // Recorded verbatim from create_ad_hoc_feedback_request_for_individual's
      // raised exception (supabase/migrations/0057_feedback_request_name.sql:144,
      // latest redefinition -- text unchanged since 0037_individual_accounts.sql:98).
      "Esta función es solo para cuentas individuales."
    );
  });
});

// ---------------------------------------------------------------------------
// feedbackManager.updateRequestEvaluators, has responses
// ---------------------------------------------------------------------------

describe("feedbackManager.updateRequestEvaluators", () => {
  test("RPC rejects (has responses) -> throws update_ad_hoc_feedback_request_evaluators's own exact message", async () => {
    const requester = employees[2];
    const inviteeIds = inviteesExcluding(requester.id, 5);

    actingAs(requester.token);
    const { requestId } = await feedbackManager.createRequest(inviteeIds, "general");

    const invitee = employees.find((e) => e.id === inviteeIds[0])!;
    await respondAsEvaluator(invitee.token, requester.id);

    const newInviteeIds = inviteesExcluding(requester.id, 6).slice(1);

    actingAs(requester.token);
    await expect(feedbackManager.updateRequestEvaluators(requestId, newInviteeIds)).rejects.toThrow(
      // Recorded verbatim (supabase/migrations/0032_supervisor_cannot_be_
      // evaluator.sql:126-128).
      "No se puede modificar: ya hay respuestas."
    );
  });
});

// ---------------------------------------------------------------------------
// feedbackManager.updateRequestEvaluatorsForIndividual (Story 7.6 follow-up,
// closes the gap its own report flagged: update_ad_hoc_feedback_request_
// evaluators_for_individual, supabase/migrations/0090_ad_hoc_individual_add_only.sql
// renumbered in Story 7.1, had no app-code wrapper until now). The RPC's
// final redefinition (renumbered 0094_fix_ambiguous_returning_column.sql)
// is add-only -- `insert ... where not exists (...)`, same shape as its
// member-id sibling -- so a "new" email list only ever adds emails not
// already invited; it never removes an existing invitee. Matches this
// file's own db/feedback.ts doc comment on the member-id sibling.
// ---------------------------------------------------------------------------

describe("feedbackManager.updateRequestEvaluatorsForIndividual", () => {
  test("valid email list including already-invited ones, zero responses -> only the genuinely new emails get added (add-only)", async () => {
    const email = `individual-update-${runId}@brujula-fake.test`;
    const token = await createFreshIndividualAccount(email);

    const originalEmails = [
      `orig1-${runId}@brujula-fake.test`,
      `orig2-${runId}@brujula-fake.test`,
      `orig3-${runId}@brujula-fake.test`,
      `orig4-${runId}@brujula-fake.test`,
      `orig5-${runId}@brujula-fake.test`,
    ];
    actingAs(token);
    const { requestId } = await feedbackManager.createIndividualRequest(originalEmails);

    // A "new" list that repeats 2 of the original emails plus 3 genuinely
    // new ones -- the add-only RPC keeps the originals (repeats are
    // no-ops) and adds only the 3 new ones, so the final set is the union.
    const newEmails = [
      originalEmails[0],
      originalEmails[1],
      `new1-${runId}@brujula-fake.test`,
      `new2-${runId}@brujula-fake.test`,
      `new3-${runId}@brujula-fake.test`,
    ];
    actingAs(token);
    await expect(
      feedbackManager.updateRequestEvaluatorsForIndividual(requestId, newEmails)
    ).resolves.toBeUndefined();

    actingAs(token);
    const invitations = await feedbackManager.getFeedbackRequestEmailInvitations(requestId);
    const invitedEmails = invitations.map((i) => i.email).sort();
    expect(invitedEmails).toEqual([...new Set([...originalEmails, ...newEmails])].sort());
  });

  test("company account (non-individual org) -> throws the RPC's own exact account-kind message", async () => {
    // The RPC's account-kind check (organizations.kind <> 'individual') is
    // its very first guard, running before it even looks up
    // feedback_requests by id (supabase/migrations/0090_ad_hoc_individual_add_only.sql)
    // -- a bogus request id is enough, no need to create a real request (and
    // no risk of colliding with another test's "one open request at a time"
    // fixture state on a shared employee).
    const requester = employees[6];

    actingAs(requester.token);
    await expect(
      feedbackManager.updateRequestEvaluatorsForIndividual("00000000-0000-0000-0000-000000000000", [
        `x1-${runId}@brujula-fake.test`,
        `x2-${runId}@brujula-fake.test`,
        `x3-${runId}@brujula-fake.test`,
        `x4-${runId}@brujula-fake.test`,
        `x5-${runId}@brujula-fake.test`,
      ])
    ).rejects.toThrow(
      // Recorded verbatim (supabase/migrations/0090_ad_hoc_individual_add_only.sql).
      "Esta función es solo para cuentas individuales."
    );
  });
});

// ---------------------------------------------------------------------------
// feedbackManager.getCompetencyNarrative -- below threshold, and
// non-requester access. Both share the same fixture: a fresh request with
// only 2 of 5 invitees responding (below the min_responses_to_reveal
// default of 3).
// ---------------------------------------------------------------------------

describe("feedbackManager.getCompetencyNarrative", () => {
  let requester: SeededEmployee;
  let requestId: string;
  let invitees: SeededEmployee[];

  beforeAll(async () => {
    requester = employees[3];
    const inviteeIds = inviteesExcluding(requester.id, 5);
    invitees = employees.filter((e) => inviteeIds.includes(e.id));
    expect(invitees).toHaveLength(5);

    actingAs(requester.token);
    const created = await feedbackManager.createRequest(inviteeIds, "competencias");
    requestId = created.requestId;

    await respondAsEvaluator(invitees[0].token, requester.id);
    await respondAsEvaluator(invitees[1].token, requester.id);
  });

  test("below threshold -> returns [] (the RPC's own early-return, no partial content)", async () => {
    actingAs(requester.token);
    const rows = await feedbackManager.getCompetencyNarrative(requestId);

    expect(rows).toEqual([]);
  });

  test("non-requester caller -> throws get_request_competency_narrative's own exact access-control message", async () => {
    // One of the request's own invitees -- a real participant, but never
    // the requester itself, which is the only caller this RPC allows.
    actingAs(invitees[0].token);
    await expect(feedbackManager.getCompetencyNarrative(requestId)).rejects.toThrow(
      // Recorded verbatim from get_request_competency_narrative's raised
      // exception (supabase/migrations/0058_competency_narrative_report.sql:50).
      "No tienes acceso a esta solicitud."
    );
  });
});

// ---------------------------------------------------------------------------
// feedbackManager.cancelRequest
// ---------------------------------------------------------------------------

describe("feedbackManager.cancelRequest", () => {
  test("valid (open, zero responses) -> cancels the request (status becomes 'closed')", async () => {
    const requester = employees[5];
    const inviteeIds = inviteesExcluding(requester.id, 5);

    actingAs(requester.token);
    const { requestId } = await feedbackManager.createRequest(inviteeIds);

    await feedbackManager.cancelRequest(requestId);

    const rows = (await restGet(
      `feedback_requests?select=status&id=eq.${requestId}`,
      requester.token
    )) as { status: string }[];
    expect(rows).toHaveLength(1);
    // Recorded verbatim from cancel_ad_hoc_feedback_request's own UPDATE
    // (supabase/migrations/0011_ad_hoc_request_lifecycle.sql:114): despite
    // the RPC's name, it sets status = 'closed', not 'cancelled' -- the
    // feedback_requests.status check constraint
    // (supabase/migrations/0001_initial_schema.sql:108) only ever allows
    // 'open' or 'closed'; there is no 'cancelled' value anywhere in the
    // schema.
    expect(rows[0].status).toBe("closed");
  });
});

// ---------------------------------------------------------------------------
// feedbackManager.closeRequest -- per the header comment on
// closeAdHocFeedbackRequest (src/server/db/feedback.ts), this RPC has no
// response-count/threshold check, so closing a fresh zero-response request
// succeeds; its only error path is the same "not open anymore" guard,
// exercised here via a second close of the same (now-closed) request.
// ---------------------------------------------------------------------------

describe("feedbackManager.closeRequest", () => {
  let requester: SeededEmployee;
  let requestId: string;

  test("valid (open, zero responses) -> closes the request (status becomes 'closed')", async () => {
    requester = employees[6];
    const inviteeIds = inviteesExcluding(requester.id, 5);

    actingAs(requester.token);
    const created = await feedbackManager.createRequest(inviteeIds);
    requestId = created.requestId;

    await feedbackManager.closeRequest(requestId);

    const rows = (await restGet(
      `feedback_requests?select=status&id=eq.${requestId}`,
      requester.token
    )) as { status: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("closed");
  });

  test("second close rejects -> throws close_ad_hoc_feedback_request's own exact message", async () => {
    expect(requestId, "the previous test must have run first").toBeDefined();

    actingAs(requester.token);
    await expect(feedbackManager.closeRequest(requestId)).rejects.toThrow(
      // Recorded verbatim from close_ad_hoc_feedback_request's raised
      // exception (supabase/migrations/0014_close_completed_ad_hoc_request.sql:33
      // -- this RPC has only ever had this one definition).
      "Esta solicitud ya no está abierta."
    );
  });
});

// ---------------------------------------------------------------------------
// feedbackManager.getMyPendingInvitations
// ---------------------------------------------------------------------------

describe("feedbackManager.getMyPendingInvitations", () => {
  test("valid -> returns rows including token/requesterEmail/evaluatorCategory for an unused invitation", async () => {
    const requester = employees[4];
    const inviteeIds = inviteesExcluding(requester.id, 5);
    const invitees = employees.filter((e) => inviteeIds.includes(e.id));
    expect(invitees).toHaveLength(5);

    actingAs(requester.token);
    await feedbackManager.createRequest(inviteeIds);

    // None of this fresh request's invitees have responded yet -- any of
    // them has a pending (unused) invitation from this requester.
    const unresponded = invitees[0];

    actingAs(unresponded.token);
    const rows = await feedbackManager.getMyPendingInvitations();

    const row = rows.find((r) => r.requesterMemberId === requester.id);
    expect(row).toBeDefined();
    expect(row!.token).toBeTruthy();
    expect(row!.requesterEmail).toBe(requester.email);
    expect(typeof row!.createdAt).toBe("string");
    // Ad-hoc invitations never set this column -- confirmed:
    // create_ad_hoc_feedback_request's own feedback_invitations insert
    // (supabase/migrations/0057_feedback_request_name.sql:100-101) omits
    // evaluator_category entirely, unlike the cycle-flow insert path.
    expect(row!.evaluatorCategory).toBeNull();
    // Story 7.4 (pending-invitations-subtype): createRequest above used its
    // own default subtype ("general", feedbackManager.createRequest's own
    // default param) -- get_my_pending_invitations must surface both the
    // real request_type and subtype now, not just token/requester fields.
    expect(row!.requestType).toBe("ad_hoc");
    expect(row!.subtype).toBe("general");
  });
});

// ---------------------------------------------------------------------------
// Page-migration follow-up (this file's own extension for the new
// db/feedback.ts + feedbackManager.ts functions added to finish migrating
// dashboard/feedback/nueva/page.tsx, nueva-360/page.tsx, [id]/page.tsx and
// [id]/gestionar/page.tsx off direct Supabase access). Reuses the same
// `employees` fixture above wherever possible -- including the 360 cycle
// scripts/seed-demo-company.mjs already builds for every one of the 8
// employees (its own steps 7-9): each employee ends up with their own
// 'cycle'-type feedback_requests row (5 member-based evaluator invitations
// + one automatic self-invitation), split across 3 realism buckets by
// `i % 3`:
//   i % 3 === 0 -> closed (all evaluators + self answered, then closed)
//   i % 3 === 1 -> open, all evaluators + self answered (revealed, not closed)
//   i % 3 === 2 -> open, only 2 of 5 evaluators answered (below the default
//                  reveal threshold of 3 -- self is still answered, the
//                  seed script always submits that one first)
// ---------------------------------------------------------------------------

async function seededCycleRequestId(employee: SeededEmployee): Promise<string> {
  const rows = (await restGet(
    `feedback_requests?select=id&requester_member_id=eq.${employee.id}&request_type=eq.cycle`,
    employee.token
  )) as { id: string }[];
  expect(rows, `${employee.email} should have the seed script's own cycle request`).toHaveLength(1);
  return rows[0].id;
}

describe("feedbackManager.getMyOpenRequestId / getFeedbackRequestInviteeMemberIds", () => {
  let requester: SeededEmployee;
  let requestId: string;
  let inviteeIds: string[];

  beforeAll(async () => {
    // employees[1] never succeeded at creating an ad_hoc request earlier in
    // this file (its own test used it for the below-min-invitees failure),
    // so it has no open ad_hoc request yet -- free to use here.
    requester = employees[1];
    inviteeIds = inviteesExcluding(requester.id, 5);

    actingAs(requester.token);
    const created = await feedbackManager.createRequest(inviteeIds);
    requestId = created.requestId;
  });

  test("ad_hoc -> returns the new request's id; cycle -> returns the seed's own open cycle request (a different type, not confused with the ad_hoc one)", async () => {
    const openAdHoc = await feedbackManager.getMyOpenRequestId(requester.id, "ad_hoc");
    expect(openAdHoc).toBe(requestId);

    const cycleRequestId = await seededCycleRequestId(requester); // i % 3 === 1 -> open
    const openCycle = await feedbackManager.getMyOpenRequestId(requester.id, "cycle");
    expect(openCycle).toBe(cycleRequestId);
  });

  test("no open request of that type -> returns null", async () => {
    // employees[0] is the seed script's own "cerrado" bucket (i % 3 === 0):
    // its cycle request is closed, so nothing should come back for "cycle".
    const closedCycleOwner = employees[0];
    const openCycle = await feedbackManager.getMyOpenRequestId(closedCycleOwner.id, "cycle");
    expect(openCycle).toBeNull();
  });

  test("getFeedbackRequestInviteeMemberIds -> returns exactly the invited member ids", async () => {
    const ids = await feedbackManager.getFeedbackRequestInviteeMemberIds(requestId);
    expect([...ids].sort()).toEqual([...inviteeIds].sort());
  });
});

describe("feedbackManager.getMinInviteesPerRequest", () => {
  test("org with no custom platform_settings row -> resolves the manager's own fallback of 5 (db/feedback.ts's getMinInviteesPerRequest still returns null; the manager applies `?? 5` itself now, so no page needs its own fallback anymore)", async () => {
    const member = employees[0];
    const rows = (await restGet(
      `members?select=organization_id&id=eq.${member.id}`,
      member.token
    )) as { organization_id: string }[];
    const organizationId = rows[0].organization_id;

    actingAs(member.token);
    const minInvitees = await feedbackManager.getMinInviteesPerRequest(organizationId);
    expect(minInvitees).toBe(5);
  });
});

describe("feedbackManager.getPlatformText", () => {
  test("unknown key -> returns the caller's own fallback text unchanged", async () => {
    actingAs(employees[0].token);
    const fallback = `fallback de prueba ${runId}`;
    const text = await feedbackManager.getPlatformText(`clave-inexistente-${runId}`, fallback);
    expect(text).toBe(fallback);
  });
});

describe("feedbackManager.getEvaluatorCandidates", () => {
  test("returns active, non-supervisor colleagues, excluding the caller and the Supervisor, ordered by email", async () => {
    const caller = employees[0];
    actingAs(caller.token);
    const candidates = await feedbackManager.getEvaluatorCandidates(caller.id);

    // All 7 other seeded employees, never the caller itself and never the
    // Supervisor account (is_supervisor = true, excluded by the underlying
    // query -- confirmed by reading the RPC-less direct read before wrapping
    // it, see db/feedback.ts's own getEvaluatorCandidates doc comment).
    expect(candidates).toHaveLength(employees.length - 1);
    expect(candidates.some((c) => c.id === caller.id)).toBe(false);
    expect(candidates.every((c) => c.email.endsWith(`.brujula-fake.test`))).toBe(true);
    const emails = candidates.map((c) => c.email);
    expect(emails).toEqual([...emails].sort());
  });
});

describe("feedbackManager.getFeedbackRequestById", () => {
  test("valid cycle request id -> returns the matching detail", async () => {
    const owner = employees[1]; // i % 3 === 1 -> open
    actingAs(owner.token);
    const cycleRequestId = await seededCycleRequestId(owner);

    const detail = await feedbackManager.getFeedbackRequestById(cycleRequestId);

    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(cycleRequestId);
    expect(detail!.requesterMemberId).toBe(owner.id);
    expect(detail!.requestType).toBe("cycle");
    expect(detail!.status).toBe("open");
    expect(detail!.cycleName).toBeTruthy();
  });

  test("unknown id -> returns null", async () => {
    actingAs(employees[1].token);
    const detail = await feedbackManager.getFeedbackRequestById("00000000-0000-0000-0000-000000000000");
    expect(detail).toBeNull();
  });
});

describe("feedbackManager.getFeedbackRequestProgress", () => {
  test("cycle request with only 2 of 5 evaluators answered -> responseCount 2, selfResponded true, revealed false (below the default reveal threshold of 3)", async () => {
    const owner = employees[2]; // i % 3 === 2 -> "a medias"
    actingAs(owner.token);
    const requestId = await seededCycleRequestId(owner);

    const progress = await feedbackManager.getFeedbackRequestProgress(requestId);

    expect(progress).not.toBeNull();
    expect(progress!.responseCount).toBe(2);
    expect(progress!.threshold).toBe(3);
    expect(progress!.selfResponded).toBe(true);
    expect(progress!.revealed).toBe(false);
  });
});

describe("feedbackManager.getFeedbackInvitationsCount", () => {
  test("cycle request -> 5 evaluator invitations + 1 self invitation = 6", async () => {
    const owner = employees[1];
    actingAs(owner.token);
    const requestId = await seededCycleRequestId(owner);

    const count = await feedbackManager.getFeedbackInvitationsCount(requestId);
    expect(count).toBe(6);
  });
});

describe("feedbackManager.getFeedbackRequestMemberInvitations", () => {
  test("cycle request -> the 5 evaluator invitations, excluding the requester's own self-assessment invitation", async () => {
    const owner = employees[1];
    actingAs(owner.token);
    const requestId = await seededCycleRequestId(owner);

    const invitations = await feedbackManager.getFeedbackRequestMemberInvitations(requestId);

    expect(invitations).toHaveLength(5);
    expect(invitations.every((i) => i.evaluatorCategory !== "self")).toBe(true);
    expect(invitations.every((i) => i.memberId !== owner.id)).toBe(true);
  });
});

describe("feedbackManager.getFeedbackRequestEmailInvitations", () => {
  test("individual-account cycle request -> returns the invited emails with their categories", async () => {
    const email = `individual-followup-${runId}@brujula-fake.test`;
    const token = await createFreshIndividualAccount(email);

    const evaluatorEmails = [
      `ev1-followup-${runId}@brujula-fake.test`,
      `ev2-followup-${runId}@brujula-fake.test`,
      `ev3-followup-${runId}@brujula-fake.test`,
      `ev4-followup-${runId}@brujula-fake.test`,
      `ev5-followup-${runId}@brujula-fake.test`,
    ];
    const categories = ["manager", "team", "team", "organization", "other"];

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const closesAt = tomorrow.toISOString().slice(0, 10);

    actingAs(token);
    const { requestId } = await cyclesManager.createIndividualRequest(
      evaluatorEmails,
      categories as never,
      closesAt,
      "Seguimiento de prueba"
    );

    const invitations = await feedbackManager.getFeedbackRequestEmailInvitations(requestId);

    expect(invitations.map((i) => i.email).sort()).toEqual([...evaluatorEmails].sort());
    expect(invitations.every((i) => Boolean(i.evaluatorCategory))).toBe(true);
  });
});

describe("feedbackManager.getRequestCompetencyComparison / getRequestCompetencyByCategory / getRequestSaboteadores", () => {
  // Siblings of getCompetencyNarrative (same requester-only access check,
  // same [id]/page.tsx call site) -- same fixture technique as that
  // describe block above, on a fresh ad_hoc request so as not to disturb
  // the seed script's own cycle-request buckets other describes here read.
  let requester: SeededEmployee;
  let requestId: string;
  let invitees: SeededEmployee[];

  beforeAll(async () => {
    // employees[7] never succeeded at creating an ad_hoc request earlier
    // (its own test used createIndividualRequest, which fails before
    // creating anything for a non-individual account) -- free to use here.
    requester = employees[7];
    const inviteeIds = inviteesExcluding(requester.id, 5);
    invitees = employees.filter((e) => inviteeIds.includes(e.id));
    expect(invitees).toHaveLength(5);

    actingAs(requester.token);
    const created = await feedbackManager.createRequest(inviteeIds, "competencias");
    requestId = created.requestId;
  });

  test("zero responses yet -> all three return [] (comparison/by-category's own below-threshold early-return; saboteadores has nothing to average yet)", async () => {
    actingAs(requester.token);
    expect(await feedbackManager.getRequestCompetencyComparison(requestId)).toEqual([]);
    expect(await feedbackManager.getRequestCompetencyByCategory(requestId)).toEqual([]);
    expect(await feedbackManager.getRequestSaboteadores(requestId)).toEqual([]);
  });

  test("non-requester caller -> all three throw the RPC's own exact access-control message", async () => {
    actingAs(invitees[0].token);
    await expect(feedbackManager.getRequestCompetencyComparison(requestId)).rejects.toThrow(
      "No tienes acceso a esta solicitud."
    );
    await expect(feedbackManager.getRequestCompetencyByCategory(requestId)).rejects.toThrow(
      "No tienes acceso a esta solicitud."
    );
    await expect(feedbackManager.getRequestSaboteadores(requestId)).rejects.toThrow(
      "No tienes acceso a esta solicitud."
    );
  });
});

// ---------------------------------------------------------------------------
// Business-logic-in-the-manager fixes: getRequestState (finding 1 -- the
// status/eligibility facts [id]/page.tsx's own isFinal and
// [id]/gestionar/page.tsx's own canManageCycle/canFullyEditCycle used to
// each independently re-derive) and getRequestHeadlineSummary (finding 2 --
// the reveal-gate headline/growth-area ranking, previously a page-level
// reduce over manager-returned rows).
// ---------------------------------------------------------------------------

/**
 * Submits a full answer set for one specific invitee on one specific
 * request, fetching that invitation's token directly by (requestId,
 * inviteeMemberId) rather than through get_my_pending_invitations (the
 * technique respondAsEvaluator above uses) -- deliberately, since by this
 * point in the file most employees already have an older, unused
 * (cancelled/closed) ad_hoc invitation from the very same requester
 * sitting in feedback_invitations too (cancelling/closing a request never
 * deletes its invitations), and get_my_pending_invitations orders by
 * created_at with no request-status filter, so a "find the first pending
 * invitation from this requester" lookup could resolve to the wrong
 * (stale) request. Requires the caller to already own/be the requester of
 * `requestId` (same RLS as getFeedbackRequestMemberInvitations).
 */
async function respondToRequestAsInvitee(
  requesterToken: string,
  requestId: string,
  invitee: SeededEmployee
): Promise<void> {
  const rows = (await restGet(
    `feedback_invitations?select=token&feedback_request_id=eq.${requestId}&invitee_member_id=eq.${invitee.id}`,
    requesterToken
  )) as { token: string }[];
  expect(rows, `expected exactly one invitation for ${invitee.email} on request ${requestId}`).toHaveLength(1);
  const token = rows[0].token;

  const ctx = (await callRpc("get_responder_context", invitee.token, { p_token: token })) as ResponderContext;
  if (!ctx.valid || !ctx.questions) {
    throw new Error(`get_responder_context returned invalid context: ${JSON.stringify(ctx)}`);
  }
  const competencyCode = ctx.competencies?.[0]?.code;
  const answers = ctx.questions.map((q) => {
    if (q.question_type === "competency") {
      return {
        question_id: q.id,
        competency_code: competencyCode,
        answer_value: 4,
        answer_text: "Comentario de prueba.",
      };
    }
    if (q.question_type === "scale") {
      return { question_id: q.id, answer_value: 4 };
    }
    return { question_id: q.id, answer_text: "Respuesta de prueba." };
  });

  await callRpc("submit_feedback_response", invitee.token, { p_token: token, p_answers: answers });
}

describe("feedbackManager.getRequestState", () => {
  test("unknown id -> returns null", async () => {
    actingAs(employees[0].token);
    const state = await feedbackManager.getRequestState("00000000-0000-0000-0000-000000000000");
    expect(state).toBeNull();
  });

  test("ad_hoc, open, zero responses -> isFinal false, canManageCycle true, canFullyEditCycle true", async () => {
    // employees[6] closed its earlier ad_hoc request in the closeRequest
    // describe above -- free to create a new one here.
    const requester = employees[6];
    const inviteeIds = inviteesExcluding(requester.id, 5);

    actingAs(requester.token);
    const { requestId } = await feedbackManager.createRequest(inviteeIds);

    const state = await feedbackManager.getRequestState(requestId);
    expect(state).not.toBeNull();
    expect(state!.isCycle).toBe(false);
    expect(state!.totalInvitees).toBe(5);
    expect(state!.totalResponseCount).toBe(0);
    expect(state!.isFinal).toBe(false);
    expect(state!.canManageCycle).toBe(true);
    expect(state!.canFullyEditCycle).toBe(true);
  });

  test("ad_hoc, still open but every invitee has responded -> isFinal true (threshold met without being closed)", async () => {
    // employees[5] closed its earlier ad_hoc request (via cancelRequest) in
    // the cancelRequest describe above -- free to create a new one here.
    const requester = employees[5];
    const inviteeIds = inviteesExcluding(requester.id, 5);
    const invitees = employees.filter((e) => inviteeIds.includes(e.id));
    expect(invitees).toHaveLength(5);

    actingAs(requester.token);
    const { requestId } = await feedbackManager.createRequest(inviteeIds);

    for (const invitee of invitees) {
      await respondToRequestAsInvitee(requester.token, requestId, invitee);
    }

    const state = await feedbackManager.getRequestState(requestId);
    expect(state).not.toBeNull();
    expect(state!.request.status).toBe("open"); // never explicitly closed
    expect(state!.totalInvitees).toBe(5);
    expect(state!.totalResponseCount).toBe(5);
    expect(state!.isFinal).toBe(true);
  });

  test("cycle, closed -> isFinal true, canManageCycle false, canFullyEditCycle false", async () => {
    const owner = employees[0]; // i % 3 === 0 -> seed script's own "cerrado" bucket
    actingAs(owner.token);
    const requestId = await seededCycleRequestId(owner);

    const state = await feedbackManager.getRequestState(requestId);
    expect(state).not.toBeNull();
    expect(state!.isCycle).toBe(true);
    expect(state!.request.status).toBe("closed");
    expect(state!.isFinal).toBe(true);
    expect(state!.canManageCycle).toBe(false);
    expect(state!.canFullyEditCycle).toBe(false);
  });

  test("cycle, open and every evaluator + self already answered -> isFinal still false (a 360 never auto-finalizes at 100%, only status = 'closed' does)", async () => {
    const owner = employees[1]; // i % 3 === 1 -> open, fully answered
    actingAs(owner.token);
    const requestId = await seededCycleRequestId(owner);

    const state = await feedbackManager.getRequestState(requestId);
    expect(state).not.toBeNull();
    expect(state!.request.status).toBe("open");
    expect(state!.totalResponseCount).toBe(state!.totalInvitees); // 100% answered
    expect(state!.isFinal).toBe(false);
    expect(state!.canManageCycle).toBe(true);
    expect(state!.canFullyEditCycle).toBe(false); // responses already exist
  });

  test("cycle, open with zero responses -> canFullyEditCycle true", async () => {
    const email = `individual-state-${runId}@brujula-fake.test`;
    const token = await createFreshIndividualAccount(email);

    const evaluatorEmails = [
      `ev1-state-${runId}@brujula-fake.test`,
      `ev2-state-${runId}@brujula-fake.test`,
      `ev3-state-${runId}@brujula-fake.test`,
      `ev4-state-${runId}@brujula-fake.test`,
      `ev5-state-${runId}@brujula-fake.test`,
    ];
    const categories = ["manager", "team", "team", "organization", "other"];

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const closesAt = tomorrow.toISOString().slice(0, 10);

    actingAs(token);
    const { requestId } = await cyclesManager.createIndividualRequest(
      evaluatorEmails,
      categories as never,
      closesAt,
      "Estado de prueba"
    );

    const state = await feedbackManager.getRequestState(requestId);
    expect(state).not.toBeNull();
    expect(state!.isCycle).toBe(true);
    expect(state!.totalResponseCount).toBe(0);
    expect(state!.isFinal).toBe(false);
    expect(state!.canManageCycle).toBe(true);
    expect(state!.canFullyEditCycle).toBe(true);
  });
});

describe("feedbackManager.getRequestHeadlineSummary", () => {
  test("cycle: picks the actual max/min peerAvgValue row, not just the first or last in array order", () => {
    const rows: CompetencyComparisonRow[] = [
      {
        competencyCode: "c1",
        competencyName: "Comunicación",
        principleCode: null,
        principleName: null,
        roleCode: null,
        roleName: null,
        selfValue: 4,
        peerAvgValue: 3.2,
        peerResponseCount: 5,
      },
      {
        competencyCode: "c2",
        competencyName: "Liderazgo",
        principleCode: null,
        principleName: null,
        roleCode: null,
        roleName: null,
        selfValue: 4,
        peerAvgValue: 4.8,
        peerResponseCount: 5,
      },
      {
        competencyCode: "c3",
        competencyName: "Foco",
        principleCode: null,
        principleName: null,
        roleCode: null,
        roleName: null,
        selfValue: 3,
        peerAvgValue: 2.1,
        peerResponseCount: 5,
      },
    ];

    const summary = feedbackManager.getRequestHeadlineSummary(true, rows, []);
    expect(summary.headlineStrength).toBe("Liderazgo · 4.8 / 5");
    expect(summary.growthArea).toBe("Foco · 2.1 / 5");
  });

  test("cycle: rows with null peerAvgValue (below their own reveal threshold) are ignored, not treated as 0", () => {
    const rows: CompetencyComparisonRow[] = [
      {
        competencyCode: "c1",
        competencyName: "Comunicación",
        principleCode: null,
        principleName: null,
        roleCode: null,
        roleName: null,
        selfValue: 4,
        peerAvgValue: null,
        peerResponseCount: 0,
      },
    ];

    const summary = feedbackManager.getRequestHeadlineSummary(true, rows, []);
    expect(summary.headlineStrength).toBe("Todavía no hay datos suficientes para un resumen.");
    expect(summary.growthArea).toBe("Todavía no hay datos suficientes para un resumen.");
  });

  test("ad_hoc: picks the highest-mentionCount row per question position (1 = strength, 2 = challenge), not just the first", () => {
    const rows: CompetencyNarrativeRow[] = [
      {
        questionPosition: 1,
        questionPrompt: "p1",
        competencyCode: "c1",
        competencyName: "Comunicación",
        roleCode: null,
        mentionCount: 2,
        avgValue: 4,
        comments: [],
      },
      {
        questionPosition: 1,
        questionPrompt: "p1",
        competencyCode: "c2",
        competencyName: "Liderazgo",
        roleCode: null,
        mentionCount: 5,
        avgValue: 4,
        comments: [],
      },
      {
        questionPosition: 2,
        questionPrompt: "p2",
        competencyCode: "c3",
        competencyName: "Foco",
        roleCode: null,
        mentionCount: 1,
        avgValue: 3,
        comments: [],
      },
      {
        questionPosition: 2,
        questionPrompt: "p2",
        competencyCode: "c4",
        competencyName: "Escucha",
        roleCode: null,
        mentionCount: 4,
        avgValue: 3,
        comments: [],
      },
    ];

    const summary = feedbackManager.getRequestHeadlineSummary(false, [], rows);
    expect(summary.headlineStrength).toBe("Liderazgo · 5 menciones");
    expect(summary.growthArea).toBe("Escucha · 4 menciones");
  });

  test("ad_hoc: no rows -> both fall back to the 'not enough data' message", () => {
    const summary = feedbackManager.getRequestHeadlineSummary(false, [], []);
    expect(summary.headlineStrength).toBe("Todavía no hay datos suficientes para un resumen.");
    expect(summary.growthArea).toBe("Todavía no hay datos suficientes para un resumen.");
  });
});

// ---------------------------------------------------------------------------
// feedbackManager.getMyPendingRequestsSummary -- dashboard audit fix
// (Finding 4): composes getMyAdHocRequests() (this domain) and
// cyclesManager.getMyCycleRequests() (cross-domain) into dashboard/
// page.tsx's own "Mis feedbacks en curso" merged/sorted row shape, moved
// out of the page itself. Uses a fresh individual account (its own
// isolated ad_hoc + cycle-request pair) rather than threading through the
// shared `employees` fixture above, so this suite's own assertions don't
// depend on any other describe block's ordering/state.
// ---------------------------------------------------------------------------

describe("feedbackManager.getMyPendingRequestsSummary", () => {
  test("merges an ad_hoc and a cycle request into one created_at-descending list, in the page's own row shape", async () => {
    const email = `individual-summary-${runId}@brujula-fake.test`;
    const token = await createFreshIndividualAccount(email);

    actingAs(token);
    const adHocName = `Feedback ágil resumen ${runId}`;
    const { requestId: adHocRequestId } = await feedbackManager.createIndividualRequest(
      [
        `sum-ev1-${runId}@brujula-fake.test`,
        `sum-ev2-${runId}@brujula-fake.test`,
        `sum-ev3-${runId}@brujula-fake.test`,
        `sum-ev4-${runId}@brujula-fake.test`,
        `sum-ev5-${runId}@brujula-fake.test`,
      ],
      "general",
      adHocName
    );

    const cycleName = `Mi 360 individual resumen ${runId}`;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const cycleClosesAtInput = tomorrow.toISOString().slice(0, 10);
    const { requestId: cycleRequestId } = await cyclesManager.createIndividualRequest(
      [
        `sum-c1-${runId}@brujula-fake.test`,
        `sum-c2-${runId}@brujula-fake.test`,
        `sum-c3-${runId}@brujula-fake.test`,
        `sum-c4-${runId}@brujula-fake.test`,
        `sum-c5-${runId}@brujula-fake.test`,
      ],
      ["manager", "team", "team", "organization", "other"] as never,
      cycleClosesAtInput,
      cycleName
    );

    const rows = await feedbackManager.getMyPendingRequestsSummary();

    const adHocRow = rows.find((r) => r.id === adHocRequestId);
    const cycleRow = rows.find((r) => r.id === cycleRequestId);
    expect(adHocRow).toBeDefined();
    expect(cycleRow).toBeDefined();

    expect(adHocRow).toMatchObject({
      request_type: "ad_hoc",
      status: "open",
      name: adHocName,
      feedback_cycles: null,
      // Story 7.2: never set for an ad_hoc request (see AdHocRequestRow's
      // own doc comment, db/feedback.ts) -- unlike its cycle counterpart
      // below, whose closesAt is the deadline chosen at creation time.
      closesAt: null,
    });
    // An individual-account cycle request has no `cycle_id` (it's a
    // one-off 360, not tied to an org's feedback_cycles row --
    // create_individual_cycle_request, supabase/migrations/
    // 0057_feedback_request_name.sql, always inserts cycle_id: null and
    // stashes its own p_name straight on feedback_requests.name instead).
    // CycleRequestRow.cycleName -- and so this row's `feedback_cycles` --
    // comes from the `feedback_cycles(name)` embed keyed off cycle_id, so
    // it stays null here; the request's own name never reaches this row
    // shape's `name` field either (mappedCycle always sets that to null,
    // same as the page's own former code), matching dashboard/page.tsx's
    // pre-existing fallback-to-date label for this exact case.
    expect(cycleRow).toMatchObject({
      request_type: "cycle",
      status: "open",
      name: null,
      feedback_cycles: null,
      // Story 7.2: still open, so this is the deadline chosen at creation
      // (close_cycle_request overwrites it with the real close date only
      // once the request is actually closed -- see CycleRequestRow's own
      // doc comment, db/cycles.ts).
      closesAt: cycleClosesAtInput,
    });
    expect(cycleName).toBeTruthy(); // sanity: the fixture did set a name, it just isn't surfaced by this read
    expect(typeof adHocRow!.created_at).toBe("string");
    expect(typeof cycleRow!.created_at).toBe("string");

    // created_at-descending, same sort the page used to apply itself.
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].created_at.localeCompare(rows[i].created_at)).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// feedbackManager.getMyFeedbackRequestsByStatus -- Story 7.2 (epics.md
// "Dashboard — En-Curso/Cerrado Split + Report-Group Task Link"): the
// en-curso/cerrado split dashboard/page.tsx renders as two sections, plus
// each closed request's real close date (`closesAt`, only ever populated
// for a `cycle` request -- see AdHocRequestRow/CycleRequestRow's own doc
// comments in db/feedback.ts / db/cycles.ts). Fresh individual account,
// same isolation rationale as getMyPendingRequestsSummary's own suite
// above.
// ---------------------------------------------------------------------------

describe("feedbackManager.getMyFeedbackRequestsByStatus", () => {
  test("splits a still-open request and a closed one into their own lists, closed one keeping its status", async () => {
    const email = `individual-split-${runId}@brujula-fake.test`;
    const token = await createFreshIndividualAccount(email);

    actingAs(token);
    // create_ad_hoc_feedback_request(_for_individual) refuses a second
    // open request from the same requester at a time -- close the first
    // one before creating the second, still-open one.
    const closedName = `Feedback ágil split cerrado ${runId}`;
    const { requestId: closedRequestId } = await feedbackManager.createIndividualRequest(
      [
        `split-closed1-${runId}@brujula-fake.test`,
        `split-closed2-${runId}@brujula-fake.test`,
        `split-closed3-${runId}@brujula-fake.test`,
        `split-closed4-${runId}@brujula-fake.test`,
        `split-closed5-${runId}@brujula-fake.test`,
      ],
      "general",
      closedName
    );
    // close_ad_hoc_feedback_request has no response-count/threshold check
    // (see closeAdHocFeedbackRequest's own doc comment, db/feedback.ts) --
    // unlike close_cycle_request, it can close a fresh, response-free
    // request outright, which is all this test needs to exercise the
    // open/closed split itself.
    await feedbackManager.closeRequest(closedRequestId);

    const openName = `Feedback ágil split abierto ${runId}`;
    const { requestId: openRequestId } = await feedbackManager.createIndividualRequest(
      [
        `split-open1-${runId}@brujula-fake.test`,
        `split-open2-${runId}@brujula-fake.test`,
        `split-open3-${runId}@brujula-fake.test`,
        `split-open4-${runId}@brujula-fake.test`,
        `split-open5-${runId}@brujula-fake.test`,
      ],
      "general",
      openName
    );

    const { open, closed } = await feedbackManager.getMyFeedbackRequestsByStatus();

    const openRow = open.find((r) => r.id === openRequestId);
    const closedRow = closed.find((r) => r.id === closedRequestId);
    expect(openRow).toBeDefined();
    expect(closedRow).toBeDefined();

    // Each request lands in exactly one of the two lists.
    expect(open.find((r) => r.id === closedRequestId)).toBeUndefined();
    expect(closed.find((r) => r.id === openRequestId)).toBeUndefined();
    expect(openRow).toMatchObject({ status: "open", request_type: "ad_hoc", closesAt: null });
    // An ad_hoc request's closesAt is always null, closed or not (never
    // set by create_ad_hoc_feedback_request -- see AdHocRequestRow's own
    // doc comment); a closed CYCLE request's real close date is already
    // covered by getMyPendingRequestsSummary's own suite above (closesAt
    // is a plain passthrough field, not recomputed by this function).
    expect(closedRow).toMatchObject({ status: "closed", request_type: "ad_hoc", closesAt: null });
  });

  test("no requests at all -> both lists empty, never throws", async () => {
    const email = `individual-split-empty-${runId}@brujula-fake.test`;
    const token = await createFreshIndividualAccount(email);

    actingAs(token);
    const { open, closed } = await feedbackManager.getMyFeedbackRequestsByStatus();
    expect(open).toEqual([]);
    expect(closed).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Story 7.4: an Invitado can respond to feedback when invited to (stays an
// evaluator, see getMyPendingInvitations's own coverage above -- no
// Invitado-specific restriction on receiving an invitation), but can never
// request feedback themselves. create_ad_hoc_feedback_request enforces this
// (supabase/migrations/0076_guest_member_type.sql); this proves
// feedbackManager.createRequest surfaces that exact rejection unmodified.
//
// Placed at the very end of this file, deliberately -- inviting this fresh
// guest member into the shared seeded company changes that org's active,
// non-supervisor member count, which feedbackManager.getEvaluatorCandidates'
// own suite asserts exactly (`employees.length - 1`); running after every
// other describe block in this file avoids perturbing that count-sensitive
// assertion (confirmed: no other suite in this file counts total org
// members either).
// ---------------------------------------------------------------------------

describe("feedbackManager.createRequest, as an Invitado (Story 7.4)", () => {
  test("guest member -> throws create_ad_hoc_feedback_request's own exact rejection message", async () => {
    expect(supervisorToken, "the beforeAll seed must have run first").toBeDefined();

    const depts = (await restGet("departments?select=id&limit=1", supervisorToken)) as { id: string }[];
    expect(depts.length, "seed-demo-company.mjs must have created at least one department").toBeGreaterThan(0);

    const guestEmail = `invitado-fm-${runId}@char-test-feedback-manager-${runId}.brujula-fake.test`;
    const inviteToken = (await callRpc("invite_member", supervisorToken, {
      p_email: guestEmail,
      p_full_name: "Invitado de Prueba",
      p_department_id: depts[0].id,
      p_is_guest: true,
    })) as string;

    const guestToken = await signUpWithInvite(guestEmail, PASSWORD, inviteToken);
    await callRpc("accept_member_invite", guestToken, { p_token: inviteToken });

    actingAs(guestToken);
    await expect(feedbackManager.createRequest(inviteesExcluding("", 5))).rejects.toThrow(
      "Como invitado, solo puedes responder feedback cuando te lo pidan — no puedes pedirlo tú."
    );
  });
});
