// Story 3.20 (_bmad-output/implementation-artifacts/
// spec-3-20-db-access-manager-scaffolding-responder-invitation.md):
// new-path re-verification of a representative subset of Story 3.19's
// characterization baseline (tests/characterization/responder-invitation.
// test.ts, left unmodified and re-run as-is alongside this file) against
// the NEW `responderManager` functions, called directly -- not through the
// still-unmodified src/app/responder/[token]/page.tsx,
// src/app/invitacion/[token]/page.tsx or src/app/actions/feedback.ts. Same
// fixture (scripts/seed-demo-company.mjs), same expected error strings,
// same mocking shape as Story 3.14's feedback-manager.test.ts precedent:
// only `@/lib/supabase/server`'s `createClient` needs mocking here --
// `responderManager` never imports `next/navigation` or `next/cache`. Adds
// one thing feedback-manager.test.ts's own version doesn't need (but
// responder-invitation.test.ts's own version already established): a
// genuinely anonymous mode (`actingAsAnon()`), for the requests this
// domain's RPCs serve to never-logged-in callers (an unauthenticated
// responder token-validity check, or the public invitation-details read).
//
// What's real: every Postgres RPC the manager functions call (the same 3
// RPCs `db/responder.ts` wraps), run against the same local
// `supabase start` instance.
//
// Coverage: every row of the spec's own I/O & Edge-Case Matrix -- getContext
// (invalid token, member invite/not logged in), submitResponse (valid peer,
// wrong-user), getInviteDetails (valid, bogus token). Fixture-building RPC
// calls (create_ad_hoc_feedback_request, invite_member) are called directly
// via the same raw callRpc helper responder-invitation.test.ts's own
// fixture already established, never through responderManager itself.

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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
// next/cache mock needed: the manager layer never calls
// redirect()/revalidatePath() (those stay one layer up, untouched by this
// story).
// ---------------------------------------------------------------------------

const acting = vi.hoisted(() => ({ token: null as string | null, initialized: false }));

function actingAs(token: string) {
  acting.token = token;
  acting.initialized = true;
}

/** Subsequent responderManager calls carry no session at all -- matches
 * responder-invitation.test.ts's own actingAsAnon(): no Authorization
 * override, so @supabase/supabase-js falls back to the anon key itself,
 * landing the call on Postgres's `anon` role. */
function actingAsAnon() {
  acting.token = null;
  acting.initialized = true;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async (): Promise<SupabaseClient> => {
    if (!acting.initialized) {
      throw new Error(
        "test bug: actingAs(token)/actingAsAnon() must be called before invoking a manager function"
      );
    }
    return createSupabaseJsClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: acting.token ? { headers: { Authorization: `Bearer ${acting.token}` } } : {},
    });
  },
}));

// Imported after the mock above is declared (Vitest hoists `vi.mock` to the
// top of the module regardless of source order) so the manager's own import
// of `@/lib/supabase/server` (via `@/server/db/responder`) picks up the
// mocked client factory.
import * as responderManager from "@/server/managers/responderManager";

// ---------------------------------------------------------------------------
// Small REST/RPC/auth helpers -- same anon-key-only pattern as every prior
// characterization file; used only for setup/assertions here, never as the
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
// Fixture: one fresh demo company via scripts/seed-demo-company.mjs (8
// employees -- >= 5 needed for a single ad_hoc request's min-invitees
// guard, plus a couple spare), same technique responder-invitation.test.ts
// already established. Every feedback invitation and member invite
// actually under test is built directly through the real RPCs under test
// (via callRpc, fixture-building plumbing only), never through the seed
// script's own internal calls.
// ---------------------------------------------------------------------------

type SeededEmployee = { email: string; token: string; id: string };

let supervisorToken: string;
let departmentId: string;
let employees: SeededEmployee[]; // all 8 seeded employees, logged in

const runId = Date.now();
const companyName = `Char Test Responder Manager ${runId}`;

function inviteesExcluding(requesterId: string, count = 5): string[] {
  return employees
    .filter((e) => e.id !== requesterId)
    .slice(0, count)
    .map((e) => e.id);
}

// Peer ad_hoc request fixture, built once and reused across scenarios below
// -- each invitee has a single, dedicated purpose so no two scenarios
// contend over the same invitation's used/unused state:
//   peerInvitees[0] -- "member invite, not logged in" (getContext) check,
//     then untouched afterwards (still unused).
//   peerInvitees[1] -- the valid submitResponse (peer) scenario (marks it
//     used).
//   peerInvitees[2] -- the wrong-user submitResponse scenario (submitted by
//     peerRequester instead).
let peerRequester: SeededEmployee;
let peerInvitees: SeededEmployee[];
let peerInvitationTokenById: Record<string, string>;
// Story 7.6: reused by the sendInvitationEmails describe block below --
// any already-real request id works for "does this resolve without
// throwing", no need for a dedicated fixture.
let peerRequestId: string;

// Dedicated fixture for the "already used" getContext scenario -- a fresh
// requester/invitee pair, isolated from the peer fixture above (whose
// invitees are each already spoken for: peerInvitees[0] stays unused,
// [1] becomes used via submitResponse, [2] is submitted by the wrong
// user). Built with its own requester (employees[6]) so it doesn't collide
// with peerRequester's own open ad_hoc request.
let usedContextInvitee: SeededEmployee;
let usedContextToken: string;

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

  // One department -- needed for invite_member below (getInviteDetails
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

  // Dedicated "already used" fixture -- see the describe-level comment
  // above. A separate requester (employees[6]) so this doesn't collide with
  // peerRequester's own already-open ad_hoc request.
  const usedContextRequester = employees[6];
  const usedContextInviteeIds = inviteesExcluding(usedContextRequester.id, 5);
  const usedContextRequestId = (await callRpc("create_ad_hoc_feedback_request", usedContextRequester.token, {
    p_invitee_member_ids: usedContextInviteeIds,
  })) as string;
  const usedContextInvitationRows = (await restGet(
    `feedback_invitations?select=token,invitee_member_id&feedback_request_id=eq.${usedContextRequestId}`,
    usedContextRequester.token
  )) as { token: string; invitee_member_id: string }[];
  usedContextInvitee = employees.find((e) => e.id === usedContextInviteeIds[0])!;
  usedContextToken = usedContextInvitationRows.find((r) => r.invitee_member_id === usedContextInvitee.id)!.token;

  // Answered directly via the RPC (fixture-building plumbing, same
  // technique responder-invitation.test.ts's own "already used" fixture
  // uses), never through responderManager itself.
  const ctxForAnswers = (await callRpc("get_responder_context", usedContextInvitee.token, {
    p_token: usedContextToken,
  })) as { questions: { id: string }[] };
  const usedContextAnswers = ctxForAnswers.questions.map((q) => ({
    question_id: q.id,
    answer_text: "Respuesta de prueba (fixture de 'ya usada').",
  }));
  await callRpc("submit_feedback_response", usedContextInvitee.token, {
    p_token: usedContextToken,
    p_answers: usedContextAnswers,
  });
});

afterAll(() => {
  acting.token = null;
  acting.initialized = false;
});

// ---------------------------------------------------------------------------
// responderManager.getContext
// ---------------------------------------------------------------------------

describe("responderManager.getContext", () => {
  test("invalid token -> {valid: false}", async () => {
    actingAsAnon();
    const ctx = await responderManager.getContext(randomUUID());

    expect(ctx).toEqual({ valid: false });
  });

  test("member invite, not logged in as invitee -> {valid: false, requiresLogin: true}", async () => {
    const token = peerInvitationTokenById[peerInvitees[0].id];

    actingAsAnon();
    const ctx = await responderManager.getContext(token);

    expect(ctx).toEqual({ valid: false, requiresLogin: true });
  });

  test("already used -> {valid: true, used: true}", async () => {
    actingAs(usedContextInvitee.token);
    const ctx = await responderManager.getContext(usedContextToken);

    expect(ctx).toEqual({ valid: true, used: true });
  });
});

// ---------------------------------------------------------------------------
// responderManager.submitResponse -- valid (peer) and wrong-user.
// ---------------------------------------------------------------------------

describe("responderManager.submitResponse", () => {
  test("valid (peer, logged in) -> returns { responseId }, invitation marked used", async () => {
    const invitee = peerInvitees[1];
    const token = peerInvitationTokenById[invitee.id];

    actingAs(invitee.token);
    const ctx = await responderManager.getContext(token);
    expect(ctx.valid).toBe(true);
    expect(ctx.used).toBe(false);
    expect(ctx.isSelf).toBe(false);

    const competencyCode = ctx.competencies?.[0]?.code;
    const answers = ctx.questions!.map((q) => {
      if (q.questionType === "competency") {
        return { questionId: q.id, competencyCode, answerValue: 4, answerText: "Comentario de prueba." };
      }
      if (q.questionType === "scale") {
        return { questionId: q.id, answerValue: 4 };
      }
      return { questionId: q.id, answerText: "Respuesta de prueba." };
    });

    actingAs(invitee.token);
    const { responseId } = await responderManager.submitResponse(token, answers);

    expect(responseId).toBeTruthy();

    const rows = (await restGet(
      `feedback_invitations?select=used_at&token=eq.${token}`,
      invitee.token
    )) as { used_at: string | null }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].used_at).not.toBeNull();
  });

  test("member-linked invitation submitted by a different logged-in employee -> throws the RPC's own exact message", async () => {
    const invitee = peerInvitees[2];
    const token = peerInvitationTokenById[invitee.id];

    // Logged in, but as peerRequester -- a real employee who is not this
    // invitation's own invitee.
    actingAs(peerRequester.token);
    await expect(responderManager.submitResponse(token, [])).rejects.toThrow(
      // Recorded verbatim from submit_feedback_response's raised exception
      // (supabase/migrations/0061_saboteadores.sql:190).
      "Esta invitación no corresponde a tu usuario."
    );
  });

  test("invalid/already-used token (bogus, never existed) -> throws the RPC's own exact message", async () => {
    actingAsAnon();
    await expect(responderManager.submitResponse(randomUUID(), [])).rejects.toThrow(
      // Recorded verbatim from submit_feedback_response's raised exception
      // (supabase/migrations/0061_saboteadores.sql:184).
      "Invitación no válida o ya utilizada."
    );
  });
});

// ---------------------------------------------------------------------------
// responderManager.getInviteDetails
// ---------------------------------------------------------------------------

describe("responderManager.getInviteDetails", () => {
  test("valid (status = 'invited') -> [{organizationName, email, fullName, valid: true}]", async () => {
    const email = `invited-valid-mgr-${runId}@brujula-fake.test`;
    const inviteToken = (await callRpc("invite_member", supervisorToken, {
      p_email: email,
      p_full_name: "Invitado Valido Manager",
      p_department_id: departmentId,
    })) as string;

    actingAsAnon();
    const rows = await responderManager.getInviteDetails(inviteToken);

    expect(rows).toEqual([
      { organizationName: companyName, email, fullName: "Invitado Valido Manager", valid: true },
    ]);
  });

  test("bogus token -> [] (empty array, no row)", async () => {
    actingAsAnon();
    const rows = await responderManager.getInviteDetails(randomUUID());

    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Story 7.6 (epics.md, "Email Infrastructure (Resend) + Responder
// Intro/Finalize UX"): responderManager.submitResponse's inviteeEmail-
// driven thank-you-email trigger, and responderManager.sendInvitationEmails
// -- both call src/server/infra/email.ts, which silently no-ops without
// RESEND_API_KEY (never set anywhere in this test env -- see
// .env.test.local/.env.local, neither defines it, same as
// ANTHROPIC_API_KEY). These tests prove the trigger runs end-to-end
// without ever breaking the underlying flow it hangs off of -- they do
// NOT prove a real email gets delivered; that needs a real
// RESEND_API_KEY and manual QA (see this story's own report).
// ---------------------------------------------------------------------------

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

describe("responderManager.submitResponse -- no-account (invitee_email) responder", () => {
  test("submits successfully and marks the invitation used, even though it also triggers the thank-you-email best-effort send", async () => {
    const ownerEmail = `individual-owner-mgr-${runId}@brujula-fake.test`;
    const ownerToken = await signUp(ownerEmail, PASSWORD);
    await callRpc("create_individual_account", ownerToken, {
      p_full_name: "Individual de Prueba Manager",
      p_email: ownerEmail,
    });

    const inviteeEmail = `individual-invitee-mgr-${runId}@brujula-fake.test`;
    const inviteeEmails = [
      inviteeEmail,
      `${runId}-filler-1@brujula-fake.test`,
      `${runId}-filler-2@brujula-fake.test`,
      `${runId}-filler-3@brujula-fake.test`,
      `${runId}-filler-4@brujula-fake.test`,
    ];
    const requestId = (await callRpc("create_ad_hoc_feedback_request_for_individual", ownerToken, {
      p_invitee_emails: inviteeEmails,
    })) as string;

    const invitationRows = (await restGet(
      `feedback_invitations?select=token,invitee_email&feedback_request_id=eq.${requestId}&invitee_email=eq.${inviteeEmail}`,
      ownerToken
    )) as { token: string; invitee_email: string }[];
    const token = invitationRows[0].token;

    actingAsAnon();
    const ctx = await responderManager.getContext(token);
    expect(ctx.valid).toBe(true);
    expect(ctx.isSelf).toBe(false);

    const competencyCode = ctx.competencies?.[0]?.code;
    const answers = ctx.questions!.map((q) => {
      if (q.questionType === "competency") {
        return { questionId: q.id, competencyCode, answerValue: 4, answerText: "Comentario de prueba." };
      }
      if (q.questionType === "scale") {
        return { questionId: q.id, answerValue: 4 };
      }
      return { questionId: q.id, answerText: "Respuesta de prueba." };
    });

    actingAsAnon();
    const { responseId } = await responderManager.submitResponse(token, answers);
    expect(responseId).toBeTruthy();

    const usedRows = (await restGet(
      `feedback_invitations?select=used_at&token=eq.${token}`,
      ownerToken
    )) as { used_at: string | null }[];
    expect(usedRows).toHaveLength(1);
    expect(usedRows[0].used_at).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Story 7.5 (epics.md, "Onboarding360Wizard + Questionnaire Changes"):
// regression coverage for the self-assessment-submission bug fixed by
// supabase/migrations/0085_fix_submit_response_active_check.sql. Deactivating
// saboteador questions (0084) made get_responder_context stop showing them
// to a self-evaluator, but submit_feedback_response's own
// "missing required answers" check didn't filter by the same `active`
// column -- so it kept counting those now-hidden questions as unanswered,
// and ANY self-assessment submission failed with "Faltan respuestas
// obligatorias.", even after answering every question actually shown. No
// prior characterization test called submit_feedback_response (real or via
// responderManager) for a self-category invitation -- the only prior
// self-evaluation coverage (responder-invitation.test.ts's "individual
// account, self-evaluation" test) stops at get_responder_context.
describe("responderManager.submitResponse -- self-assessment (individual account)", () => {
  test("succeeds even though the questionnaire's deactivated saboteador questions are no longer shown", async () => {
    const ownerEmail = `individual-self-mgr-${runId}@brujula-fake.test`;
    const ownerToken = await signUp(ownerEmail, PASSWORD);
    await callRpc("create_individual_account", ownerToken, {
      p_full_name: "Individual Autoevaluación Manager",
      p_email: ownerEmail,
    });

    const evaluatorEmails = [1, 2, 3, 4, 5].map((n) => `self-mgr-eval${n}-${runId}@brujula-fake.test`);
    const closesAt = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const requestId = (await callRpc("create_individual_cycle_request", ownerToken, {
      p_evaluator_emails: evaluatorEmails,
      p_evaluator_categories: ["manager", "team", "team", "organization", "other"],
      p_closes_at: closesAt,
    })) as string;

    const invitationRows = (await restGet(
      `feedback_invitations?select=token,evaluator_category&feedback_request_id=eq.${requestId}`,
      ownerToken
    )) as { token: string; evaluator_category: string | null }[];
    const selfRow = invitationRows.find((r) => r.evaluator_category === "self");
    expect(selfRow, "create_individual_cycle_request must create a self invitation").toBeDefined();

    actingAs(ownerToken);
    const ctx = await responderManager.getContext(selfRow!.token);
    expect(ctx.valid).toBe(true);
    expect(ctx.isSelf).toBe(true);
    // Self-assessment excludes 'open' questions (get_responder_context's
    // own filter, unrelated to this bug) -- everything left is
    // scale/competency, including whatever active self_only items remain.
    expect(ctx.questions!.some((q) => q.questionType === "open")).toBe(false);

    const competencyCode = ctx.competencies?.[0]?.code;
    const answers = ctx.questions!.map((q) => {
      if (q.questionType === "competency") {
        return { questionId: q.id, competencyCode, answerValue: 4, answerText: "Comentario de prueba." };
      }
      return { questionId: q.id, answerValue: 4 };
    });

    actingAs(ownerToken);
    // Pre-0085, this rejected with submit_feedback_response's own
    // "Faltan respuestas obligatorias." even though `answers` above covers
    // every question ctx.questions actually returned -- the RPC's
    // required-count query wasn't filtering by `sq.active`, so it kept
    // demanding answers for the now-hidden, deactivated saboteador
    // questions that were never sent to the client to answer.
    const { responseId } = await responderManager.submitResponse(selfRow!.token, answers);
    expect(responseId).toBeTruthy();

    const usedRows = (await restGet(
      `feedback_invitations?select=used_at&token=eq.${selfRow!.token}`,
      ownerToken
    )) as { used_at: string | null }[];
    expect(usedRows).toHaveLength(1);
    expect(usedRows[0].used_at).not.toBeNull();
  });
});

describe("responderManager.sendInvitationEmails", () => {
  test("resolves without throwing for a real request id (no RESEND_API_KEY configured -> every send is a no-op)", async () => {
    await expect(responderManager.sendInvitationEmails(peerRequestId)).resolves.toBeUndefined();
  });

  test("resolves without throwing for a bogus request id (no recipients found)", async () => {
    await expect(responderManager.sendInvitationEmails(randomUUID())).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Story 7.7 (ports upstream `69f6495`): responderManager.sendInvitationEmailsForNewInvitees
// -- the "add evaluators to an existing request" counterpart of
// sendInvitationEmails above. Unlike that one (which re-reads every
// non-self invitee off the request), the caller here already knows exactly
// who is new (feedbackManager/cyclesManager's own "add evaluators" RPC
// wrappers, db/feedback.ts/db/cycles.ts, resolve and return only the
// newly-inserted rows -- the underlying RPCs are add-only as of
// 0094_fix_ambiguous_returning_column.sql). Same no-RESEND_API_KEY no-op
// contract as sendInvitationEmails -- these prove the trigger runs
// end-to-end without breaking the calling flow, not that a real email gets
// delivered.
// ---------------------------------------------------------------------------

describe("responderManager.sendInvitationEmailsForNewInvitees", () => {
  test("resolves without throwing for a real request id and a real invitee (no RESEND_API_KEY -> no-op send)", async () => {
    const invitee = peerInvitees[0];
    const token = peerInvitationTokenById[invitee.id];

    await expect(
      responderManager.sendInvitationEmailsForNewInvitees(peerRequestId, [{ email: invitee.email, token }])
    ).resolves.toBeUndefined();
  });

  test("empty invitees array -> resolves without throwing, no request lookup needed", async () => {
    await expect(
      responderManager.sendInvitationEmailsForNewInvitees(randomUUID(), [])
    ).resolves.toBeUndefined();
  });

  test("resolves without throwing for a bogus request id (no matching request -> context is null)", async () => {
    await expect(
      responderManager.sendInvitationEmailsForNewInvitees(randomUUID(), [
        { email: `bogus-request-${runId}@brujula-fake.test`, token: randomUUID() },
      ])
    ).resolves.toBeUndefined();
  });
});
