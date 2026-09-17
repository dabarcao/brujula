// Story 3.19 (_bmad-output/implementation-artifacts/
// spec-3-19-characterization-tests-responder-invitation-baseline.md):
// originally characterization tests for the responder/invitation domain --
// the external, unauthenticated, highest-stakes-to-break surface,
// deliberately migrated last of Epic 3's 5 backend domains (3.19-3.24). Run
// against a real, local `supabase start` instance, mirroring every prior
// characterization file's own proven technique.
//
// Story 5.1c (_bmad-output/implementation-artifacts/
// spec-5-1c-delete-old-path-feedback-responder.md) retired this file's
// submitFeedbackResponse coverage once the responder/invitation domain's
// flag was deleted: that Server Action no longer exercises a distinct "old
// path" (there is only one path left, and
// tests/integration/responder-invitation-new-path-verification.test.ts
// already asserts the exact same redirect URLs/error messages
// unconditionally). What remains here is what was never flag-gated:
// get_responder_context and get_invite_details, both called directly via
// real HTTP RPC calls -- exactly as /responder/[token] and
// /invitacion/[token] call them, but no Server Action wraps either.
//
// Deliberately excluded (see the spec's frozen Intent for the investigated
// reasoning behind each):
// - acceptInviteSignUp/individualSignUp (src/app/actions/auth.ts) -- call
//   supabase.auth.signUp() directly, never an RPC; already excluded by
//   Story 3.2's own investigated scope correction ("no manager
//   equivalent").
// - accept_member_invite/claimPendingEmailInvitations -- already owned by
//   membersManager (Story 3.2), confirmed via grep to have zero overlap
//   with this domain.
// - Rendering /responder/[token] or /invitacion/[token] as React
//   components -- not unit-testable in this repo, per established
//   constraint (no prior domain story has attempted it either).
//
// What's mocked: nothing -- every remaining test calls a Postgres RPC
// directly over HTTP (anon key or a real bearer token), no Server Action
// or Next.js plumbing is exercised anymore.
//
// Fixture: one fresh demo company via scripts/seed-demo-company.mjs (same
// execFileSync + stdout-regex-parsing technique feedback.test.ts already
// established), for org/member infrastructure -- but every feedback
// invitation, member invite and individual account actually under test is
// built directly through the real RPCs under test, never through the seed
// script's own internal calls (confirmed-empty baseline every prior
// ad-hoc-domain story has established for it).

import { beforeAll, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
// characterization file in this repo uses.
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

/** Fresh signup with no pending invite/member row -- for individual
 * accounts created via create_individual_account below. Confirmations are
 * disabled locally (same assumption every scripts/seed-*.mjs script
 * makes), so this always returns a usable access token immediately. */
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

/** signup carrying a pending invite token, same as scripts/seed-demo-company.mjs's
 * signUpWithInvite / admin-members-auth.test.ts's own helper. */
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

/** Calls an RPC with an explicit bearer token. Pass ANON_KEY itself for a
 * genuinely anonymous call (Postgres's `anon` role) -- the same value
 * @supabase/supabase-js falls back to when no session is set. */
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
 * create_individual_account -- same helper feedback.test.ts already
 * established for its own individual-account scenarios. */
async function createFreshIndividualAccount(email: string): Promise<string> {
  const token = await signUp(email, PASSWORD);
  await callRpc("create_individual_account", token, {
    p_full_name: "Individual de Prueba",
    p_email: email,
  });
  return token;
}

type ResponderQuestion = {
  id: string;
  prompt: string;
  required: boolean;
  question_type: string;
  max_selections: number | null;
};

type ResponderContext = {
  valid: boolean;
  used?: boolean;
  requires_login?: boolean;
  is_self?: boolean;
  questions?: ResponderQuestion[];
  scale_levels?: { level: number; label: string }[];
  competencies?: { code: string; name: string }[];
};

type InviteDetailsRow = {
  organization_name: string;
  email: string;
  full_name: string | null;
  valid: boolean;
};

// ---------------------------------------------------------------------------
// Fixture: one fresh demo company via scripts/seed-demo-company.mjs (8
// employees -- >= 5 needed for a single ad_hoc request's min-invitees
// guard, plus a couple spare), same technique feedback.test.ts already
// established. Every feedback invitation, member invite and individual
// account actually under test is built directly through the real RPCs
// under test below, never through the seed script's own internal calls.
// ---------------------------------------------------------------------------

type SeededEmployee = { email: string; token: string; id: string };

let supervisorToken: string;
let departmentId: string;
let employees: SeededEmployee[]; // all 8 seeded employees, logged in

const runId = Date.now();
const companyName = `Char Test Responder ${runId}`;

function inviteesExcluding(requesterId: string, count = 5): string[] {
  return employees
    .filter((e) => e.id !== requesterId)
    .slice(0, count)
    .map((e) => e.id);
}

// Peer ad_hoc request fixture, built once and reused across the
// get_responder_context scenarios below (real, member-linked
// feedback_invitations) -- each invitee has a single, dedicated purpose so
// no two scenarios contend over the same invitation's used/unused state:
//   peerInvitees[0] -- not-logged-in check -> valid-unused check, in that
//     order.
//   peerInvitees[2] -- answered directly via the RPC (fixture-building
//     plumbing, same investigated allowance feedback.test.ts's own
//     respondAsEvaluator established) purely to produce an already-used
//     invitation for get_responder_context, self-contained within that
//     describe block.
let peerRequester: SeededEmployee;
let peerInvitees: SeededEmployee[];
let peerRequestId: string;
let peerInvitationTokenById: Record<string, string>;

beforeAll(async () => {
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

  // One department -- needed for invite_member below (get_invite_details
  // fixtures); seed-demo-company.mjs always creates 4.
  const departments = (await restGet("departments?select=id&limit=1", supervisorToken)) as { id: string }[];
  departmentId = departments[0].id;

  // Peer ad_hoc request fixture -- see the describe-level comment above.
  peerRequester = employees[0];
  const peerInviteeIds = inviteesExcluding(peerRequester.id, 5);
  peerInvitees = employees.filter((e) => peerInviteeIds.includes(e.id));
  peerRequestId = (await callRpc("create_ad_hoc_feedback_request", peerRequester.token, {
    p_invitee_member_ids: peerInviteeIds,
  })) as string;

  const invitationRows = (await restGet(
    `feedback_invitations?select=token,invitee_member_id&feedback_request_id=eq.${peerRequestId}`,
    peerRequester.token
  )) as { token: string; invitee_member_id: string }[];
  peerInvitationTokenById = Object.fromEntries(invitationRows.map((r) => [r.invitee_member_id, r.token]));
});

// ---------------------------------------------------------------------------
// get_responder_context -- direct RPC, exactly as /responder/[token] calls
// it (src/app/responder/[token]/page.tsx:50-52). 5 states: invalid token,
// member invite without the right login, valid unused (peer), valid
// unused (individual account's own self-evaluation) and already used.
// ---------------------------------------------------------------------------

describe("get_responder_context", () => {
  test("invalid token -> {valid: false}", async () => {
    const ctx = await callRpc("get_responder_context", ANON_KEY, { p_token: randomUUID() });
    expect(ctx).toEqual({ valid: false });
  });

  test("member invite, not logged in as invitee -> {valid: false, requires_login: true}", async () => {
    const token = peerInvitationTokenById[peerInvitees[0].id];

    const ctx = await callRpc("get_responder_context", ANON_KEY, { p_token: token });

    expect(ctx).toEqual({ valid: false, requires_login: true });
  });

  test("valid unused (peer), correct login -> full context, is_self false", async () => {
    const invitee = peerInvitees[0];
    const token = peerInvitationTokenById[invitee.id];

    const ctx = (await callRpc("get_responder_context", invitee.token, { p_token: token })) as ResponderContext;

    expect(ctx.valid).toBe(true);
    expect(ctx.used).toBe(false);
    expect(ctx.is_self).toBe(false);
    expect(ctx.requires_login).toBeUndefined();

    // default_open_feedback template ('general' subtype's default),
    // recorded verbatim (supabase/migrations/0005_ad_hoc_feedback_flow.sql:291-306
    // -- this template's questions have never changed since).
    expect(ctx.questions).toHaveLength(5);
    expect(ctx.questions!.every((q) => q.question_type === "open")).toBe(true);
    expect(ctx.questions![0]).toEqual({
      id: ctx.questions![0].id,
      prompt: "¿Qué habilidad destacarías de esta persona en su desarrollo profesional?",
      required: true,
      question_type: "open",
      max_selections: null,
    });
    expect(ctx.questions![4]).toEqual({
      id: ctx.questions![4].id,
      prompt: "¿Algo más que quieras añadir?",
      required: false,
      question_type: "open",
      max_selections: null,
    });

    expect(Array.isArray(ctx.scale_levels)).toBe(true);
    expect(ctx.scale_levels!.length).toBeGreaterThan(0);
    expect(Array.isArray(ctx.competencies)).toBe(true);
  });

  test("valid unused (individual account, self-evaluation) -> is_self true, no open questions", async () => {
    const email = `individual-self-${runId}@brujula-fake.test`;
    const requesterToken = await createFreshIndividualAccount(email);

    const evaluatorEmails = [1, 2, 3, 4, 5].map((n) => `self-eval${n}-${runId}@brujula-fake.test`);
    const closesAt = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const requestId = (await callRpc("create_individual_cycle_request", requesterToken, {
      p_evaluator_emails: evaluatorEmails,
      p_evaluator_categories: ["manager", "team", "team", "organization", "other"],
      p_closes_at: closesAt,
    })) as string;

    const rows = (await restGet(
      `feedback_invitations?select=token,evaluator_category&feedback_request_id=eq.${requestId}`,
      requesterToken
    )) as { token: string; evaluator_category: string | null }[];
    const selfRow = rows.find((r) => r.evaluator_category === "self");
    expect(selfRow, "create_individual_cycle_request must create a self invitation").toBeDefined();

    // Member-linked (invitee_member_id = the individual's own member id),
    // per get_responder_context's own logic -- requires that same login,
    // same as any other member-linked invite (only the "anon key as this
    // account's own bearer" pattern differs from a company employee).
    const ctx = (await callRpc("get_responder_context", requesterToken, {
      p_token: selfRow!.token,
    })) as ResponderContext;

    expect(ctx.valid).toBe(true);
    expect(ctx.used).toBe(false);
    expect(ctx.is_self).toBe(true);
    // is_self excludes 'open' questions (get_responder_context's own
    // `not (is_self_flag and sq.question_type = 'open')` filter,
    // supabase/migrations/0061_saboteadores.sql:132) -- default_360_cycle
    // has both scale (including self_only saboteador items) and
    // competency questions, so this is non-empty.
    expect(ctx.questions!.length).toBeGreaterThan(0);
    expect(ctx.questions!.some((q) => q.question_type === "open")).toBe(false);
  });

  describe("already used", () => {
    let usedToken: string;

    beforeAll(async () => {
      // Dedicated invitee (peerInvitees[2]) answered directly via the RPC
      // -- fixture-building plumbing, not the Server Action under test --
      // purely to reach the "already used" state, self-contained within
      // this describe block (see the top-level fixture comment).
      const invitee = peerInvitees[2];
      usedToken = peerInvitationTokenById[invitee.id];

      const ctx = (await callRpc("get_responder_context", invitee.token, {
        p_token: usedToken,
      })) as ResponderContext;
      const answers = ctx.questions!.map((q) => ({
        question_id: q.id,
        answer_text: "Respuesta de prueba (fixture de 'ya usada').",
      }));
      await callRpc("submit_feedback_response", invitee.token, { p_token: usedToken, p_answers: answers });
    });

    test("already used -> {valid: true, used: true}", async () => {
      const invitee = peerInvitees[2];

      const ctx = await callRpc("get_responder_context", invitee.token, { p_token: usedToken });

      expect(ctx).toEqual({ valid: true, used: true });
    });

    test("already used, not logged in -> {valid: false, requires_login: true} (the requires_login check runs before the used_at check)", async () => {
      const ctx = await callRpc("get_responder_context", ANON_KEY, { p_token: usedToken });

      expect(ctx).toEqual({ valid: false, requires_login: true });
    });
  });
});

// ---------------------------------------------------------------------------
// submitFeedbackResponse -- retired by Story 5.1c (see file header): its own
// redirect-URL/error-message assertions characterized old-path behavior no
// longer reachable, and the identical assertions already run
// unconditionally in
// tests/integration/responder-invitation-new-path-verification.test.ts. Its
// only fixture consumer was itself, so removing it leaves nothing else to
// rebuild here.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// get_invite_details -- direct RPC, exactly as /invitacion/[token] calls it
// (src/app/invitacion/[token]/page.tsx:23). Note: this is the member-invite
// ("join this organization") token (members.invite_token), NOT a feedback
// invitation token -- a different table/flow entirely from everything
// above, per the frozen Intent.
// ---------------------------------------------------------------------------

describe("get_invite_details", () => {
  test("valid (status = 'invited') -> [{organization_name, email, full_name, valid: true}]", async () => {
    const email = `invited-valid-${runId}@brujula-fake.test`;
    const inviteToken = (await callRpc("invite_member", supervisorToken, {
      p_email: email,
      p_full_name: "Invitado Valido",
      p_department_id: departmentId,
    })) as string;

    const rows = (await callRpc("get_invite_details", ANON_KEY, { p_token: inviteToken })) as InviteDetailsRow[];

    expect(rows).toEqual([{ organization_name: companyName, email, full_name: "Invitado Valido", valid: true }]);
  });

  test("already accepted (status now 'active') -> [{..., valid: false}]", async () => {
    const email = `invited-accepted-${runId}@brujula-fake.test`;
    const inviteToken = (await callRpc("invite_member", supervisorToken, {
      p_email: email,
      p_full_name: "Invitado Aceptado",
      p_department_id: departmentId,
    })) as string;

    const memberToken = await signUpWithInvite(email, PASSWORD, inviteToken);
    await callRpc("accept_member_invite", memberToken, { p_token: inviteToken });

    const rows = (await callRpc("get_invite_details", ANON_KEY, { p_token: inviteToken })) as InviteDetailsRow[];

    expect(rows).toEqual([
      { organization_name: companyName, email, full_name: "Invitado Aceptado", valid: false },
    ]);
  });

  test("bogus token -> [] (empty array, no row)", async () => {
    const rows = await callRpc("get_invite_details", ANON_KEY, { p_token: randomUUID() });

    expect(rows).toEqual([]);
  });
});
