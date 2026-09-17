// Story 3.24 (_bmad-output/implementation-artifacts/
// spec-3-24-responder-invitation-new-path-verification.md), updated by
// Story 5.1c (_bmad-output/implementation-artifacts/
// spec-5-1c-delete-old-path-feedback-responder.md) once the
// responder/invitation domain's flag was deleted and the manager-backed
// path became the only path -- the "worst possible outcome in this whole
// migration" domain (external, unauthenticated, highest-stakes-to-break
// surface). Two sections, mirroring Stories 3.12/3.18's proven shape
// exactly (real Supabase, no manager/RPC mocking):
//
// (1) re-runs every scenario Story 3.19's baseline characterized
// (tests/characterization/responder-invitation.test.ts) against the new
// path -- get_responder_context (invalid, member-invite-not-logged-in,
// valid-unused-peer, valid-unused-individual-self, already-used) and
// get_invite_details (valid, already-accepted, bogus) via responderManager
// directly (in-process, no Server Action wraps either RPC), and
// submitFeedbackResponse (valid-peer, valid-individual-anon,
// invalid/used-token x2, missing-required-answers, wrong-user) via the real
// Server Action -- asserting the exact same values/redirect URLs/error
// messages the baseline already recorded. responderManager.getContext/
// getInviteDetails return camelCase (Story 3.20's src/server/db/responder.ts
// mapping); every expectation below is that same deterministic mapping
// applied to the baseline's own recorded snake_case values, not a new,
// independently-guessed shape.
//
// (2) Investigated (not guessed, per this spec's own frozen Intent):
// extends coverage to RespondPage/InvitationPage themselves, called
// directly as plain async functions (no rendering) -- the same technique
// Story 3.23's now-deleted flag-toggle suite used for routing, but here
// against real seeded data, confirming each completes without an
// unexpected throw (the exact regression class Story 3.22's own review
// found and fixed for a malformed token) and that any redirect() call fires
// with the expected target URL. No assertion touches either page's
// rendered JSX/HTML.
//
// What's real: responderManager, src/server/db/responder.ts, the Server
// Action, both Server Components, and every Postgres RPC underneath, run
// against the local `supabase start` instance. What's mocked, and why: only
// the bits of Next.js plumbing that need a live request (`redirect`,
// `revalidatePath`) and the cookie-based Supabase client factory
// (`@/lib/supabase/server`) -- exactly Story 3.19's own mocks, including its
// `actingAsAnon()` (no Authorization override at all, landing on Postgres's
// `anon` role) for the individual/email-invite responder and every
// anonymous-access RPC (get_invite_details, and get_responder_context's own
// not-logged-in states).

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
// Hard boundary carried over from every prior characterization/integration
// suite in this repo: never run this against a remote Supabase project, dev
// or production -- only the local CLI instance.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(SUPABASE_URL)) {
  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL (${SUPABASE_URL}) no es la instancia local de \`supabase start\`. ` +
      "Estos tests nunca deben correr contra un proyecto remoto."
  );
}

// ---------------------------------------------------------------------------
// Mocks -- identical to tests/characterization/responder-invitation.test.ts
// (Story 3.19), see file header for what and why.
// ---------------------------------------------------------------------------

const acting = vi.hoisted(() => ({ token: null as string | null, initialized: false }));

/** Subsequent calls (manager functions or the Server Action) act as this
 * already-logged-in user. */
function actingAs(token: string) {
  acting.token = token;
  acting.initialized = true;
}

/** Subsequent calls carry no session at all -- the individual/email-invite
 * responder's actual situation, and every anonymous-access RPC's real
 * caller. No Authorization override, so @supabase/supabase-js falls back to
 * the anon key itself, landing on Postgres's `anon` role -- exactly what a
 * real, never-logged-in visitor's browser session produces. */
function actingAsAnon() {
  acting.token = null;
  acting.initialized = true;
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const err = new Error(`test redirect marker: ${url}`) as Error & { redirectUrl: string };
    err.redirectUrl = url;
    throw err;
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async (): Promise<SupabaseClient> => {
    if (!acting.initialized) {
      throw new Error(
        "test bug: actingAs(token)/actingAsAnon() must be called before invoking a manager function, the Server Action, or a page component"
      );
    }
    return createSupabaseJsClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: acting.token ? { headers: { Authorization: `Bearer ${acting.token}` } } : {},
    });
  },
}));

// Imported after the mocks above are declared (Vitest hoists `vi.mock` to
// the top of the module regardless of source order) so that importing
// these, the unmodified Story 3.16/3.20/3.22 files, picks up the mocked
// `next/navigation`, `next/cache` and `@/lib/supabase/server`.
import { submitFeedbackResponse } from "@/app/actions/feedback";
import * as responderManager from "@/server/managers/responderManager";
import RespondPage from "@/app/responder/[token]/page";
import InvitationPage from "@/app/invitacion/[token]/page";

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

/** Fresh signup with no pending invite/member row -- for individual
 * accounts created via create_individual_account below. */
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
 * signUpWithInvite / Story 3.19's own helper. */
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
 * scenarios actually under test) -- same investigated allowance every prior
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

/** Calls a mocked Server Action and returns the URL it "redirected" to. */
async function getRedirectUrl(action: () => Promise<void>): Promise<string> {
  try {
    await action();
  } catch (e) {
    const url = (e as { redirectUrl?: string }).redirectUrl;
    if (url) return url;
    throw e;
  }
  throw new Error("expected the call to redirect, but it returned normally");
}

function errorFromRedirect(url: string, prefix: string): string {
  expect(url.startsWith(prefix)).toBe(true);
  return decodeURIComponent(url.slice(url.indexOf("error=") + "error=".length));
}

/** Fresh individual-kind account (organizations.kind = 'individual'), via
 * create_individual_account -- same helper Story 3.19's own suite already
 * established. */
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
  question_type: string;
};

/** Builds a FormData matching exactly what src/components/ResponderWizard
 * would submit -- same helper Story 3.19's own suite already established,
 * read directly off submitFeedbackResponse's own parsing (unchanged by this
 * story). Doubles as the "complete required answers" fixture every valid-
 * submission scenario below needs. */
function buildAnswersFormData(
  token: string,
  questions: ResponderQuestion[],
  competencyCode: string | undefined
): FormData {
  const fd = new FormData();
  fd.set("token", token);
  for (const q of questions) {
    fd.append("questionId", q.id);
    fd.append("questionType", q.question_type);
    if (q.question_type === "competency") {
      const code = competencyCode ?? "";
      fd.append(`competency_${q.id}`, code);
      fd.set(`competency_value_${q.id}_${code}`, "4");
      fd.set(`competency_text_${q.id}_${code}`, "Comentario de prueba.");
    } else if (q.question_type === "scale") {
      fd.set(`answer_${q.id}`, "4");
    } else {
      fd.set(`answer_${q.id}`, "Respuesta de prueba.");
    }
  }
  return fd;
}

// ---------------------------------------------------------------------------
// Fixture: one fresh demo company via scripts/seed-demo-company.mjs (8
// employees), same technique and headcount as Story 3.19's own suite --
// every feedback invitation, member invite and individual account actually
// under test is built directly through the real RPCs under test, never
// through the seed script's own internal calls.
// ---------------------------------------------------------------------------

type SeededEmployee = { email: string; token: string; id: string };

let supervisorToken: string;
let departmentId: string;
let employees: SeededEmployee[]; // all 8 seeded employees, logged in

const runId = Date.now();
const companyName = `New Path Verif Responder ${runId}`;

function inviteesExcluding(requesterId: string, count = 5): string[] {
  return employees
    .filter((e) => e.id !== requesterId)
    .slice(0, count)
    .map((e) => e.id);
}

// Peer ad_hoc request fixture, built once and reused across several
// scenarios below (get_responder_context, submitFeedbackResponse and
// RespondPage all need real, member-linked feedback_invitations) -- each
// invitee has a single, dedicated purpose so no two scenarios contend over
// the same invitation's used/unused state:
//   peerInvitees[0] -- full peer lifecycle: not-logged-in check -> valid-
//     unused check -> valid submission (marks it used) -> reused-token
//     error check, in that order.
//   peerInvitees[1] -- stays unused until the "missing required answers"
//     scenario.
//   peerInvitees[2] -- answered directly via the RPC (fixture-building
//     plumbing only) purely to produce an already-used invitation for
//     get_responder_context.
//   peerInvitees[3] -- stays unused until the "wrong user" scenario.
//   peerInvitees[4] -- reserved, untouched by Section 1, for Section 2's
//     RespondPage "member invite not logged in" test.
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

afterAll(() => {
  acting.token = null;
  acting.initialized = false;
});

// ---------------------------------------------------------------------------
// Section 1: Story 3.19's characterized scenarios, re-run against the new
// path -- every assertion below is the baseline's own recorded
// value, translated through Story 3.20's own deterministic snake_case ->
// camelCase mapping (src/server/db/responder.ts) where the call goes
// through responderManager directly instead of a raw RPC call.
// ---------------------------------------------------------------------------

describe("Section 1: responderManager.getContext", () => {
  test("invalid token -> {valid: false}", async () => {
    actingAsAnon();
    const ctx = await responderManager.getContext(randomUUID());

    expect(ctx).toEqual({ valid: false });
  });

  test("malformed (non-UUID) token -> rejects with the RPC's own cast-error message", async () => {
    // Genuinely non-UUID-shaped input (unlike randomUUID() above, which is
    // well-formed but nonexistent) -- db/responder.ts's getResponderContext
    // has no pre-validation, so this reaches get_responder_context and
    // Postgres's own uuid cast fails, surfaced via db/responder.ts's `if
    // (error) throw new Error(error.message)` convention. Message confirmed
    // by direct RPC call against the local instance before writing this
    // assertion (Postgres error code 22P02).
    actingAsAnon();

    await expect(responderManager.getContext("not-a-valid-uuid")).rejects.toThrow(
      'invalid input syntax for type uuid: "not-a-valid-uuid"'
    );
  });

  test("member invite, not logged in as invitee -> {valid: false, requiresLogin: true}", async () => {
    const token = peerInvitationTokenById[peerInvitees[0].id];

    actingAsAnon();
    const ctx = await responderManager.getContext(token);

    expect(ctx).toEqual({ valid: false, requiresLogin: true });
  });

  test("valid unused (peer), correct login -> full context, isSelf false", async () => {
    const invitee = peerInvitees[0];
    const token = peerInvitationTokenById[invitee.id];

    actingAs(invitee.token);
    const ctx = await responderManager.getContext(token);

    expect(ctx.valid).toBe(true);
    expect(ctx.used).toBe(false);
    expect(ctx.isSelf).toBe(false);
    expect(ctx.requiresLogin).toBeUndefined();

    // default_open_feedback template ('general' subtype's default) -- same
    // values Story 3.19's baseline recorded verbatim (snake_case) from
    // supabase/migrations/0005_ad_hoc_feedback_flow.sql:291-306, translated
    // to camelCase per src/server/db/responder.ts's own mapping.
    expect(ctx.questions).toHaveLength(5);
    expect(ctx.questions!.every((q) => q.questionType === "open")).toBe(true);
    expect(ctx.questions![0]).toEqual({
      id: ctx.questions![0].id,
      prompt: "¿Qué habilidad destacarías de esta persona en su desarrollo profesional?",
      required: true,
      questionType: "open",
      maxSelections: null,
    });
    expect(ctx.questions![4]).toEqual({
      id: ctx.questions![4].id,
      prompt: "¿Algo más que quieras añadir?",
      required: false,
      questionType: "open",
      maxSelections: null,
    });

    expect(Array.isArray(ctx.scaleLevels)).toBe(true);
    expect(ctx.scaleLevels!.length).toBeGreaterThan(0);
    expect(Array.isArray(ctx.competencies)).toBe(true);
  });

  test("valid unused (individual account, self-evaluation) -> isSelf true, no open questions", async () => {
    const email = `individual-self-np-${runId}@brujula-fake.test`;
    const requesterToken = await createFreshIndividualAccount(email);

    const evaluatorEmails = [1, 2, 3, 4, 5].map((n) => `self-eval${n}-np-${runId}@brujula-fake.test`);
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

    actingAs(requesterToken);
    const ctx = await responderManager.getContext(selfRow!.token);

    expect(ctx.valid).toBe(true);
    expect(ctx.used).toBe(false);
    expect(ctx.isSelf).toBe(true);
    // isSelf excludes 'open' questions (get_responder_context's own
    // exclusion, unchanged by this story) -- default_360_cycle has both
    // scale and competency questions, so this is non-empty.
    expect(ctx.questions!.length).toBeGreaterThan(0);
    expect(ctx.questions!.some((q) => q.questionType === "open")).toBe(false);
  });

  describe("already used", () => {
    let usedToken: string;

    beforeAll(async () => {
      // Dedicated invitee (peerInvitees[2]) answered directly via the RPC
      // -- fixture-building plumbing, not the Server Action/manager under
      // test -- purely to reach the "already used" state, self-contained
      // within this describe block (see the top-level fixture comment).
      const invitee = peerInvitees[2];
      usedToken = peerInvitationTokenById[invitee.id];

      const ctx = (await callRpc("get_responder_context", invitee.token, {
        p_token: usedToken,
      })) as { questions: { id: string }[] };
      const answers = ctx.questions.map((q) => ({
        question_id: q.id,
        answer_text: "Respuesta de prueba (fixture de 'ya usada').",
      }));
      await callRpc("submit_feedback_response", invitee.token, { p_token: usedToken, p_answers: answers });
    });

    test("already used -> {valid: true, used: true}", async () => {
      const invitee = peerInvitees[2];

      actingAs(invitee.token);
      const ctx = await responderManager.getContext(usedToken);

      expect(ctx).toEqual({ valid: true, used: true });
    });

    test("already used, not logged in -> {valid: false, requiresLogin: true} (the requires_login check runs before the used_at check)", async () => {
      actingAsAnon();
      const ctx = await responderManager.getContext(usedToken);

      expect(ctx).toEqual({ valid: false, requiresLogin: true });
    });
  });
});

// ---------------------------------------------------------------------------
// submitFeedbackResponse -- via the real Server Action. Every
// assertion below is copied verbatim from Story 3.19's baseline.
// ---------------------------------------------------------------------------

describe("Section 1: submitFeedbackResponse", () => {
  test("valid (peer, logged in) -> redirects to /dashboard?responded=1, invitation marked used", async () => {
    const invitee = peerInvitees[0];
    const token = peerInvitationTokenById[invitee.id];

    actingAs(invitee.token);
    const ctx = await responderManager.getContext(token);
    expect(ctx.valid).toBe(true);
    expect(ctx.used).toBe(false);

    const fd = buildAnswersFormData(
      token,
      ctx.questions!.map((q) => ({ id: q.id, question_type: q.questionType })),
      ctx.competencies?.[0]?.code
    );

    actingAs(invitee.token);
    const url = await getRedirectUrl(() => submitFeedbackResponse(fd));

    expect(url).toBe("/dashboard?responded=1");

    const rows = (await restGet(
      `feedback_invitations?select=used_at&feedback_request_id=eq.${peerRequestId}&invitee_member_id=eq.${invitee.id}`,
      invitee.token
    )) as { used_at: string | null }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].used_at).not.toBeNull();
  });

  test("valid (individual/anon, no session) -> redirects to /responder/{token} (no dashboard to return to)", async () => {
    const email = `individual-anon-np-${runId}@brujula-fake.test`;
    const requesterToken = await createFreshIndividualAccount(email);

    const inviteeEmails = [1, 2, 3, 4, 5].map((n) => `anon-ev${n}-np-${runId}@brujula-fake.test`);
    const requestId = (await callRpc("create_ad_hoc_feedback_request_for_individual", requesterToken, {
      p_invitee_emails: inviteeEmails,
    })) as string;

    const rows = (await restGet(
      `feedback_invitations?select=token&feedback_request_id=eq.${requestId}&invitee_email=not.is.null&limit=1`,
      requesterToken
    )) as { token: string }[];
    expect(rows).toHaveLength(1);
    const token = rows[0].token;

    // Fetched anonymously -- invitee_member_id is null on this invitation,
    // so no login is required at all, matching the individual/email-invite
    // auth-model the frozen Intent describes.
    actingAsAnon();
    const ctx = await responderManager.getContext(token);
    expect(ctx.valid).toBe(true);
    expect(ctx.requiresLogin).toBeUndefined();

    const fd = buildAnswersFormData(
      token,
      ctx.questions!.map((q) => ({ id: q.id, question_type: q.questionType })),
      ctx.competencies?.[0]?.code
    );

    actingAsAnon();
    const url = await getRedirectUrl(() => submitFeedbackResponse(fd));

    expect(url).toBe(`/responder/${token}`);

    // No invitee_member_id on an individual/email invite, so filter by the
    // invitation's own token instead.
    const usedRows = (await restGet(
      `feedback_invitations?select=used_at&feedback_request_id=eq.${requestId}&token=eq.${token}`,
      requesterToken
    )) as { used_at: string | null }[];
    expect(usedRows).toHaveLength(1);
    expect(usedRows[0].used_at).not.toBeNull();
  });

  test("invalid/already-used token (reused) -> redirects to /responder/{token}?error= with the RPC's own exact message", async () => {
    // Reuses peerInvitees[0]'s token, already marked used by the "valid
    // (peer, logged in)" test above -- same still-open session/invitee,
    // same request lifecycle this fixture is built around.
    const invitee = peerInvitees[0];
    const token = peerInvitationTokenById[invitee.id];

    const fd = new FormData();
    fd.set("token", token);

    actingAs(invitee.token);
    const url = await getRedirectUrl(() => submitFeedbackResponse(fd));

    const message = errorFromRedirect(url, `/responder/${token}?error=`);
    // Recorded verbatim in Story 3.19's baseline from
    // submit_feedback_response's raised exception.
    expect(message).toBe("Invitación no válida o ya utilizada.");
  });

  test("invalid/already-used token (bogus, never existed) -> redirects with the same exact message", async () => {
    const token = randomUUID();
    const fd = new FormData();
    fd.set("token", token);

    actingAsAnon();
    const url = await getRedirectUrl(() => submitFeedbackResponse(fd));

    const message = errorFromRedirect(url, `/responder/${token}?error=`);
    expect(message).toBe("Invitación no válida o ya utilizada.");
  });

  test("missing required answers -> redirects with the RPC's own exact message", async () => {
    // Dedicated, still-unused invitee (peerInvitees[1]) -- never touched by
    // any other scenario in this file.
    const invitee = peerInvitees[1];
    const token = peerInvitationTokenById[invitee.id];

    const fd = new FormData();
    fd.set("token", token); // no questionId/questionType entries at all -> zero answers

    actingAs(invitee.token);
    const url = await getRedirectUrl(() => submitFeedbackResponse(fd));

    const message = errorFromRedirect(url, `/responder/${token}?error=`);
    expect(message).toBe("Faltan respuestas obligatorias.");
  });

  test("member-linked invitation submitted by a different logged-in employee -> redirects with the RPC's own exact message", async () => {
    // Dedicated, still-unused invitee (peerInvitees[3]) -- never touched by
    // any other scenario in this file.
    const invitee = peerInvitees[3];
    const token = peerInvitationTokenById[invitee.id];

    const fd = new FormData();
    fd.set("token", token);

    // Logged in, but as peerRequester -- a real employee who is not this
    // invitation's own invitee.
    actingAs(peerRequester.token);
    const url = await getRedirectUrl(() => submitFeedbackResponse(fd));

    const message = errorFromRedirect(url, `/responder/${token}?error=`);
    expect(message).toBe("Esta invitación no corresponde a tu usuario.");
  });
});

// ---------------------------------------------------------------------------
// responderManager.getInviteDetails -- direct call (in-process, no Server
// Action wraps it).
// ---------------------------------------------------------------------------

describe("Section 1: responderManager.getInviteDetails", () => {
  test("valid (status = 'invited') -> [{organizationName, email, fullName, valid: true}]", async () => {
    const email = `invited-valid-np-${runId}@brujula-fake.test`;
    const inviteToken = (await callRpc("invite_member", supervisorToken, {
      p_email: email,
      p_full_name: "Invitado Valido",
      p_department_id: departmentId,
    })) as string;

    actingAsAnon();
    const rows = await responderManager.getInviteDetails(inviteToken);

    expect(rows).toEqual([
      { organizationName: companyName, email, fullName: "Invitado Valido", valid: true },
    ]);
  });

  test("already accepted (status now 'active') -> [{..., valid: false}]", async () => {
    const email = `invited-accepted-np-${runId}@brujula-fake.test`;
    const inviteToken = (await callRpc("invite_member", supervisorToken, {
      p_email: email,
      p_full_name: "Invitado Aceptado",
      p_department_id: departmentId,
    })) as string;

    const memberToken = await signUpWithInvite(email, PASSWORD, inviteToken);
    await callRpc("accept_member_invite", memberToken, { p_token: inviteToken });

    actingAsAnon();
    const rows = await responderManager.getInviteDetails(inviteToken);

    expect(rows).toEqual([
      { organizationName: companyName, email, fullName: "Invitado Aceptado", valid: false },
    ]);
  });

  test("bogus token -> [] (empty array, no row)", async () => {
    actingAsAnon();
    const rows = await responderManager.getInviteDetails(randomUUID());

    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Section 2: RespondPage/InvitationPage, called directly as plain async
// functions (no rendering) against real seeded data -- the
// investigated extension per this spec's own frozen Intent. Only "did it
// throw" and any redirect() target are asserted; never the rendered
// JSX/HTML.
// ---------------------------------------------------------------------------

describe("Section 2: RespondPage", () => {
  // Dedicated ad_hoc request fixture for this describe block's own
  // "valid unused"/"used" tests, built fresh here rather than reusing
  // peerInvitees -- all 5 of which are already spoken for per the
  // top-level fixture comment (indices 0-4). employees[6]/[7] are the only
  // two seeded employees peerInvitees never touches, so they anchor this
  // block's own dedicated invitations; create_ad_hoc_feedback_request's
  // min_invitees_per_request (5, supabase/migrations/0001_initial_schema.
  // sql:50) is padded out with employees already used elsewhere in this
  // file -- a separate feedback_request_id, so their prior state doesn't
  // matter here. Requested by employees[1] rather than peerRequester --
  // peerRequester already has an open request from the top-level fixture,
  // and create_ad_hoc_feedback_request rejects a second one per requester
  // ("Ya tienes una solicitud de feedback abierta.").
  let respondPageRequester: SeededEmployee;
  let respondPageUnusedInvitee: SeededEmployee;
  let respondPageUsedInvitee: SeededEmployee;
  let respondPageTokenById: Record<string, string>;

  beforeAll(async () => {
    respondPageRequester = employees[1];
    respondPageUnusedInvitee = employees[6];
    respondPageUsedInvitee = employees[7];
    const paddingInvitees = [employees[2], employees[3], employees[4]];

    const requestId = (await callRpc("create_ad_hoc_feedback_request", respondPageRequester.token, {
      p_invitee_member_ids: [
        respondPageUnusedInvitee.id,
        respondPageUsedInvitee.id,
        ...paddingInvitees.map((e) => e.id),
      ],
    })) as string;

    const rows = (await restGet(
      `feedback_invitations?select=token,invitee_member_id&feedback_request_id=eq.${requestId}`,
      respondPageRequester.token
    )) as { token: string; invitee_member_id: string }[];
    respondPageTokenById = Object.fromEntries(rows.map((r) => [r.invitee_member_id, r.token]));

    // Mark respondPageUsedInvitee's invitation used via the raw RPC
    // (fixture-building plumbing only, same technique Section 1's "already
    // used" describe block already establishes) to reach RespondPage's own
    // "used" render state.
    const usedToken = respondPageTokenById[respondPageUsedInvitee.id];
    const ctx = (await callRpc("get_responder_context", respondPageUsedInvitee.token, {
      p_token: usedToken,
    })) as { questions: { id: string }[] };
    const answers = ctx.questions.map((q) => ({
      question_id: q.id,
      answer_text: "Respuesta de prueba (fixture RespondPage 'ya usada').",
    }));
    await callRpc("submit_feedback_response", respondPageUsedInvitee.token, {
      p_token: usedToken,
      p_answers: answers,
    });
  });

  test("invalid token (real bogus token) -> completes without throwing", async () => {
    actingAsAnon();

    await expect(
      RespondPage({
        params: Promise.resolve({ token: randomUUID() }),
        searchParams: Promise.resolve({}),
      })
    ).resolves.toBeDefined();
  });

  test("malformed (non-UUID) token -> completes without throwing (Story 3.22's own catch/fallback around the RPC's cast error)", async () => {
    actingAsAnon();

    await expect(
      RespondPage({
        params: Promise.resolve({ token: "not-a-valid-uuid" }),
        searchParams: Promise.resolve({}),
      })
    ).resolves.toBeDefined();
  });

  test("member invite, not logged in -> redirect(\"/login\") fires", async () => {
    // Dedicated, untouched invitee (peerInvitees[4]) -- see the top-level
    // fixture comment.
    const token = peerInvitationTokenById[peerInvitees[4].id];

    actingAsAnon();
    const url = await getRedirectUrl(() =>
      RespondPage({
        params: Promise.resolve({ token }),
        searchParams: Promise.resolve({}),
      }) as unknown as Promise<void>
    );

    expect(url).toBe("/login");
  });

  test("valid unused (peer), correct login -> completes without throwing (exercises the new path's camelCase->snake_case field adapter)", async () => {
    const token = respondPageTokenById[respondPageUnusedInvitee.id];

    actingAs(respondPageUnusedInvitee.token);

    await expect(
      RespondPage({
        params: Promise.resolve({ token }),
        searchParams: Promise.resolve({}),
      })
    ).resolves.toBeDefined();
  });

  test("used (already responded) -> completes without throwing (exercises the new path's camelCase->snake_case field adapter)", async () => {
    const token = respondPageTokenById[respondPageUsedInvitee.id];

    actingAs(respondPageUsedInvitee.token);

    await expect(
      RespondPage({
        params: Promise.resolve({ token }),
        searchParams: Promise.resolve({}),
      })
    ).resolves.toBeDefined();
  });
});

describe("Section 2: InvitationPage", () => {
  test("valid token -> completes without throwing", async () => {
    const email = `invited-page-np-${runId}@brujula-fake.test`;
    const inviteToken = (await callRpc("invite_member", supervisorToken, {
      p_email: email,
      p_full_name: "Invitado Pagina",
      p_department_id: departmentId,
    })) as string;

    actingAsAnon();

    await expect(
      InvitationPage({
        params: Promise.resolve({ token: inviteToken }),
        searchParams: Promise.resolve({}),
      })
    ).resolves.toBeDefined();
  });

  test("invalid (bogus) token -> completes without throwing", async () => {
    actingAsAnon();

    await expect(
      InvitationPage({
        params: Promise.resolve({ token: randomUUID() }),
        searchParams: Promise.resolve({}),
      })
    ).resolves.toBeDefined();
  });

  test("malformed (non-UUID) token -> completes without throwing (Story 3.22's own catch/fallback around the RPC's cast error)", async () => {
    actingAsAnon();

    await expect(
      InvitationPage({
        params: Promise.resolve({ token: "not-a-valid-uuid" }),
        searchParams: Promise.resolve({}),
      })
    ).resolves.toBeDefined();
  });
});
